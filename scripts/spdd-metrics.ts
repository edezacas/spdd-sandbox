import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// $/MTok. Update when the default model or Anthropic pricing changes.
const PRICING = {
  input: 2.0,
  output: 10.0,
  cacheWrite5m: 2.5,
  cacheWrite1h: 4.0,
  cacheRead: 0.2,
};

// Umbral por debajo del cual el contexto del primer turno de una fase en
// background se considera "no heredado" respecto a las fases previas de la
// misma sesión. Ver docs/plan-spdd-metrics.md (sección v2) para el razonamiento.
const ISOLATION_MAX_RATIO = 0.5;
const ISOLATION_MAX_PRELUDE_USER_ENTRIES = 1;

const SPDD_SKILLS = new Set([
  "spdd-agent",
  "spdd-canvas",
  "spdd-design",
  "spdd-implement",
  "spdd-verify",
  "spdd-sync",
  "spdd-migrate",
]);

type SegmentMode = "inline" | "background-subagent";

interface UsageEvent {
  timestamp: string;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

interface SkillMarker {
  timestamp: string;
  skill: string;
}

interface Segment {
  skill: string;
  seq: number;
  startedAt: string;
  endedAt: string;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

interface InlineSegment extends Segment {
  mode: "inline";
  sessionId: string;
}

interface BackgroundSegment extends Segment {
  mode: "background-subagent";
  sessionId: string;
  agentFile: string;
  firstTurnInputTokens: number;
  firstTurnCacheReadTokens: number;
  firstTurnCacheCreateTokens: number;
  preludeUserEntryCount: number;
  priorPhasesCumulativeTokens: number;
  isolationRatio: number;
  contextIsolated: boolean;
}

interface ReportRow {
  mode: SegmentMode;
  sessionId: string;
  skill: string;
  seq: number;
  startedAt: string;
  durationSec: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  totalTokens: number;
  costUSD: number;
  cacheHitRatio: number;
  contextIsolated: boolean | "n/a";
  isolationRatio: number | "";
  firstTurnContextTokens: number | "";
  priorCumulativeTokens: number | "";
  preludeUserEntryCount: number | "";
}

function projectSlug(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

function findTranscriptDir(cwd: string): string {
  const slug = projectSlug(cwd);
  return path.join(os.homedir(), ".claude", "projects", slug);
}

function listSessionFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(dir, f));
}

function findSubagentFiles(dir: string, sessionId: string): string[] {
  const subagentsDir = path.join(dir, sessionId, "subagents");
  if (!fs.existsSync(subagentsDir)) return [];
  return fs
    .readdirSync(subagentsDir)
    .filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
    .map((f) => path.join(subagentsDir, f));
}

function parseSessionFile(file: string): { usage: UsageEvent[]; markers: SkillMarker[] } {
  const usage: UsageEvent[] = [];
  const markers: SkillMarker[] = [];

  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    const timestamp = entry.timestamp;
    const msg = entry.message ?? {};
    const u = msg.usage;
    if (u && timestamp) {
      usage.push({
        timestamp,
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheWrite5m: u.cache_creation?.ephemeral_5m_input_tokens ?? 0,
        cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
      });
    }
    const content = msg.content;
    if (Array.isArray(content) && timestamp) {
      for (const block of content) {
        if (block?.type === "tool_use" && block.name === "Skill") {
          const skill = block.input?.skill;
          if (skill && SPDD_SKILLS.has(skill)) {
            markers.push({ timestamp, skill });
          }
        }
      }
    }
  }

  usage.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  markers.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { usage, markers };
}

/**
 * Procesa el transcript completo de un subagente lanzado en background (vía el
 * tool `Agent`) como una única fase — el archivo entero pertenece a una sola
 * invocación, así que no hace falta segmentar por timestamp como en modo inline.
 * Devuelve null si el subagente no invocó ninguna skill SPDD (p. ej. un
 * subagente de exploración/planificación ajeno al flujo spdd-agent).
 */
function buildBackgroundSegment(file: string, sessionId: string): BackgroundSegment | null {
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);

  let skill: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let firstUsage: UsageEvent | null = null;
  let preludeUserEntryCount = 0;
  let input = 0;
  let output = 0;
  let cacheWrite5m = 0;
  let cacheWrite1h = 0;
  let cacheRead = 0;

  for (const line of lines) {
    let entry: any;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = entry.timestamp;
    if (timestamp) {
      if (!startedAt) startedAt = timestamp;
      endedAt = timestamp;
    }

    if (!firstUsage && entry.type === "user") preludeUserEntryCount++;

    if (entry.type !== "assistant") continue;
    const msg = entry.message ?? {};
    const u = msg.usage;
    if (u && timestamp) {
      const ev: UsageEvent = {
        timestamp,
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheWrite5m: u.cache_creation?.ephemeral_5m_input_tokens ?? 0,
        cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
      };
      if (!firstUsage) firstUsage = ev;
      input += ev.input;
      output += ev.output;
      cacheWrite5m += ev.cacheWrite5m;
      cacheWrite1h += ev.cacheWrite1h;
      cacheRead += ev.cacheRead;
    }

    if (!skill && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type === "tool_use" && block.name === "Skill") {
          const s = block.input?.skill;
          if (s && SPDD_SKILLS.has(s)) {
            skill = s;
            break;
          }
        }
      }
    }
  }

  if (!skill || !startedAt || !endedAt || !firstUsage) return null;

  return {
    skill,
    seq: 0,
    startedAt,
    endedAt,
    input,
    output,
    cacheWrite5m,
    cacheWrite1h,
    cacheRead,
    mode: "background-subagent",
    sessionId,
    agentFile: file,
    firstTurnInputTokens: firstUsage.input,
    firstTurnCacheReadTokens: firstUsage.cacheRead,
    firstTurnCacheCreateTokens: firstUsage.cacheWrite5m + firstUsage.cacheWrite1h,
    preludeUserEntryCount,
    priorPhasesCumulativeTokens: 0,
    isolationRatio: 0,
    contextIsolated: true,
  };
}

/**
 * Rellena, por sesión, cuánto contexto arrastraban las fases previas y compara
 * eso contra lo que realmente costó el primer turno de cada fase. Un contexto
 * verdaderamente aislado mantiene ese primer turno plano sin importar cuánto
 * hayan acumulado las fases anteriores — ver docs/plan-spdd-metrics.md.
 */
function annotateIsolation(segments: BackgroundSegment[]): void {
  segments.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const seqCount: Record<string, number> = {};
  let cumulative = 0;

  for (const seg of segments) {
    seqCount[seg.skill] = (seqCount[seg.skill] ?? 0) + 1;
    seg.seq = seqCount[seg.skill];
    seg.priorPhasesCumulativeTokens = cumulative;

    const firstTurnContextTokens =
      seg.firstTurnInputTokens + seg.firstTurnCacheReadTokens + seg.firstTurnCacheCreateTokens;
    seg.isolationRatio = cumulative === 0 ? 0 : firstTurnContextTokens / cumulative;
    seg.contextIsolated =
      cumulative === 0 ||
      (seg.isolationRatio < ISOLATION_MAX_RATIO && seg.preludeUserEntryCount <= ISOLATION_MAX_PRELUDE_USER_ENTRIES);

    cumulative += seg.input + seg.output + seg.cacheWrite5m + seg.cacheWrite1h + seg.cacheRead;
  }
}

function segment(usage: UsageEvent[], markers: SkillMarker[]): Segment[] {
  if (markers.length === 0 || usage.length === 0) return [];

  const seqCount: Record<string, number> = {};
  const segments: Segment[] = markers.map((m, i) => {
    seqCount[m.skill] = (seqCount[m.skill] ?? 0) + 1;
    const end = i + 1 < markers.length ? markers[i + 1].timestamp : "9999";
    return {
      skill: m.skill,
      seq: seqCount[m.skill],
      startedAt: m.timestamp,
      endedAt: end,
      input: 0,
      output: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
    };
  });

  for (const ev of usage) {
    const seg = segments.find((s) => ev.timestamp >= s.startedAt && ev.timestamp < s.endedAt);
    if (!seg) continue;
    seg.input += ev.input;
    seg.output += ev.output;
    seg.cacheWrite5m += ev.cacheWrite5m;
    seg.cacheWrite1h += ev.cacheWrite1h;
    seg.cacheRead += ev.cacheRead;
  }

  return segments;
}

function cost(seg: Segment): number {
  return (
    (seg.input / 1_000_000) * PRICING.input +
    (seg.output / 1_000_000) * PRICING.output +
    (seg.cacheWrite5m / 1_000_000) * PRICING.cacheWrite5m +
    (seg.cacheWrite1h / 1_000_000) * PRICING.cacheWrite1h +
    (seg.cacheRead / 1_000_000) * PRICING.cacheRead
  );
}

function cacheHitRatio(seg: Segment): number {
  const totalCacheable = seg.cacheRead + seg.cacheWrite5m + seg.cacheWrite1h;
  return totalCacheable === 0 ? 0 : seg.cacheRead / totalCacheable;
}

function durationSeconds(seg: Segment, lastTimestamp: string): number {
  const end = seg.endedAt === "9999" ? lastTimestamp : seg.endedAt;
  return (new Date(end).getTime() - new Date(seg.startedAt).getTime()) / 1000;
}

function toReportRow(seg: InlineSegment | BackgroundSegment, lastTimestamp?: string): ReportRow {
  const totalTokens = seg.input + seg.output + seg.cacheWrite5m + seg.cacheWrite1h + seg.cacheRead;
  const base = {
    mode: seg.mode,
    sessionId: seg.sessionId,
    skill: seg.skill,
    seq: seg.seq,
    startedAt: seg.startedAt,
    durationSec: Math.round(durationSeconds(seg, lastTimestamp ?? seg.endedAt)),
    input: seg.input,
    output: seg.output,
    cacheWrite: seg.cacheWrite5m + seg.cacheWrite1h,
    cacheRead: seg.cacheRead,
    totalTokens,
    costUSD: cost(seg),
    cacheHitRatio: cacheHitRatio(seg),
  };

  if (seg.mode === "background-subagent") {
    const firstTurnContextTokens =
      seg.firstTurnInputTokens + seg.firstTurnCacheReadTokens + seg.firstTurnCacheCreateTokens;
    return {
      ...base,
      contextIsolated: seg.contextIsolated,
      isolationRatio: seg.isolationRatio,
      firstTurnContextTokens,
      priorCumulativeTokens: seg.priorPhasesCumulativeTokens,
      preludeUserEntryCount: seg.preludeUserEntryCount,
    };
  }

  return {
    ...base,
    contextIsolated: "n/a",
    isolationRatio: "",
    firstTurnContextTokens: "",
    priorCumulativeTokens: "",
    preludeUserEntryCount: "",
  };
}

function renderMarkdown(rows: ReportRow[], date: string): string {
  const inlineRows = rows.filter((r) => r.mode === "inline");
  const backgroundRows = rows.filter((r) => r.mode === "background-subagent");

  const lines = [`# Métricas SPDD — ${date}`, ""];

  lines.push("## Fases inline", "");
  lines.push(
    "| Skill | # | Sesión | Duración (s) | Input | Output | Cache write | Cache read | Total tokens | Coste ($) | Cache hit |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  );
  if (inlineRows.length === 0) {
    lines.push("| _(ninguna)_ | | | | | | | | | | |");
  } else {
    for (const r of inlineRows) {
      lines.push(
        `| ${r.skill} | ${r.seq} | ${r.sessionId.slice(0, 8)}… | ${r.durationSec} | ${r.input} | ${r.output} | ${r.cacheWrite} | ${r.cacheRead} | ${r.totalTokens} | ${r.costUSD.toFixed(4)} | ${(r.cacheHitRatio * 100).toFixed(0)}% |`,
      );
    }
  }
  lines.push("");

  lines.push("## Fases en background (subagentes de spdd-agent)", "");
  lines.push(
    '| Skill | # | Sesión | Duración (s) | Total tokens | Coste ($) | Cache hit | Aislado | Ratio aislamiento | Contexto 1er turno | Tokens previos acumulados | "user" previos al 1er turno |',
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  );
  if (backgroundRows.length === 0) {
    lines.push("| _(ninguna)_ | | | | | | | | | | | |");
  } else {
    for (const r of backgroundRows) {
      const isolatedLabel = r.contextIsolated === "n/a" ? "n/a" : r.contextIsolated ? "sí" : "NO";
      const ratioLabel = typeof r.isolationRatio === "number" ? r.isolationRatio.toFixed(4) : "";
      lines.push(
        `| ${r.skill} | ${r.seq} | ${r.sessionId.slice(0, 8)}… | ${r.durationSec} | ${r.totalTokens} | ${r.costUSD.toFixed(4)} | ${(r.cacheHitRatio * 100).toFixed(0)}% | ${isolatedLabel} | ${ratioLabel} | ${r.firstTurnContextTokens} | ${r.priorCumulativeTokens} | ${r.preludeUserEntryCount} |`,
      );
    }
  }
  lines.push("");

  const totalCost = rows.reduce((sum, r) => sum + r.costUSD, 0);
  const totalTokens = rows.reduce((sum, r) => sum + r.totalTokens, 0);
  lines.push(
    `**Totales:** ${inlineRows.length} fase(s) inline + ${backgroundRows.length} fase(s) en background · Coste total: $${totalCost.toFixed(4)} · Tokens totales: ${totalTokens}`,
    "",
  );

  return lines.join("\n");
}

function renderCsvRows(rows: ReportRow[], date: string): string {
  return rows
    .map((r) => {
      const contextIsolated = r.contextIsolated === "n/a" ? "n/a" : r.contextIsolated ? "true" : "false";
      const isolationRatio = typeof r.isolationRatio === "number" ? r.isolationRatio.toFixed(4) : "";
      return [
        date,
        r.skill,
        r.seq,
        r.startedAt,
        r.durationSec,
        r.input,
        r.output,
        r.cacheWrite,
        r.cacheRead,
        r.totalTokens,
        r.costUSD.toFixed(6),
        r.cacheHitRatio.toFixed(4),
        r.mode,
        r.sessionId,
        contextIsolated,
        isolationRatio,
        r.firstTurnContextTokens,
        r.priorCumulativeTokens,
        r.preludeUserEntryCount,
      ].join(",");
    })
    .join("\n");
}

function ensureCsvHeader(csvPath: string, header: string): void {
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, header + "\n");
    return;
  }
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");
  if (lines[0] === header) return;
  lines[0] = header;
  fs.writeFileSync(csvPath, lines.join("\n"));
}

function main() {
  const cwd = process.cwd();
  const dir = findTranscriptDir(cwd);

  if (!fs.existsSync(dir)) {
    console.log(`No se encontró el directorio de transcripts: ${dir}`);
    return;
  }

  const rows: ReportRow[] = [];

  for (const sessionFile of listSessionFiles(dir)) {
    const sessionId = path.basename(sessionFile, ".jsonl");
    const { usage, markers } = parseSessionFile(sessionFile);

    if (markers.length > 0 && usage.length > 0) {
      const lastTimestamp = usage[usage.length - 1].timestamp;
      const inlineSegments: InlineSegment[] = segment(usage, markers).map((s) => ({
        ...s,
        mode: "inline" as const,
        sessionId,
      }));
      for (const seg of inlineSegments) rows.push(toReportRow(seg, lastTimestamp));
    }

    const backgroundSegments = findSubagentFiles(dir, sessionId)
      .map((f) => buildBackgroundSegment(f, sessionId))
      .filter((s): s is BackgroundSegment => s !== null);
    annotateIsolation(backgroundSegments);
    for (const seg of backgroundSegments) rows.push(toReportRow(seg));
  }

  if (rows.length === 0) {
    console.log(
      `No se encontraron invocaciones de skills SPDD (inline ni en background) en ${dir}.\n` +
        "Corre este script después de usar spdd-canvas / spdd-design / spdd-implement / spdd-verify / spdd-agent.",
    );
    return;
  }

  const outDir = path.join(cwd, "docs", "metrics");
  fs.mkdirSync(outDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(outDir, `${today}-report.md`);
  const csvPath = path.join(outDir, "spdd-metrics.csv");

  const md = renderMarkdown(rows, today);
  fs.writeFileSync(reportPath, md);

  const CSV_HEADER =
    "date,skill,seq,startedAt,durationSec,input,output,cacheWrite,cacheRead,totalTokens,costUSD,cacheHitRatio,mode,sessionId,contextIsolated,isolationRatio,firstTurnContextTokens,priorCumulativeTokens,preludeUserEntryCount";
  ensureCsvHeader(csvPath, CSV_HEADER);
  fs.appendFileSync(csvPath, renderCsvRows(rows, today) + "\n");

  console.log(md);
  console.log(`\nReporte guardado en ${reportPath}`);
  console.log(`Histórico acumulado en ${csvPath}`);
}

main();
