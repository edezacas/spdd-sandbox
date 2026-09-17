## Overview

Sandbox sin propósito de producto real, usado para probar manualmente flujos de agentes contra un dominio de biblioteca real y minimalista: las skills open-spdd (`spdd-agent`, `spdd-canvas`, `spdd-design`, `spdd-implement`, `spdd-verify`, `spdd-sync`, `spdd-migrate`) y el flujo antz de `/antz`.

## Stack

- TypeScript 5.5 (`strict: true`), target ES2020, módulos CommonJS
- Node.js + `ts-node` para ejecución en desarrollo, sin framework ni base de datos
- Entidades en memoria (arrays), sin persistencia

## Commands

- `npm install` — instalar dependencias
- `npm test` — la suite completa: `node --require ts-node/register --test src/**/*.test.ts` (78 tests, ~3 s). Es el runner real; no hay otro.
- `npm run dev` — ejecutar `src/index.ts` directamente con ts-node
- `npm run build` — compilar a `dist/` con `tsc`
- `npm start` — ejecutar el build compilado (`dist/index.js`)
- No hay linter ni formateador configurados

## Structure

- `src/index.ts` — punto de entrada, ejemplo de uso end-to-end del dominio
- `src/domain/author.ts` — entidad `Author` y su repositorio en memoria
- `src/domain/book.ts` — entidad `Book` (referencia a `authorId`) y su repositorio en memoria
- `src/domain/loan.ts` — entidad `Loan` (préstamo de un `Book`), reglas de negocio (no prestar un libro ya prestado) y su repositorio en memoria
- `src/web/` — servidor HTTP sin framework: `server.ts` enruta hacia `routes/`, `views/` arma el HTML a mano, `session.ts` guarda la sesión y `seed.ts` carga datos de ejemplo
- `src/**/*.test.ts` — tests con `node:test` (`describe`/`test`) y `node:assert/strict`, colocados junto al módulo que prueban y nombrados `<módulo>.test.ts`
- `docs/` — métricas del flujo SPDD y, si corres antz, `decisions/<slug>.md`: un documento vivo por dominio, no un log

## Gotchas

- Todo el estado vive en arrays module-level (`authors`, `books`, `loans`); no hay reinicio entre ejecuciones salvo reiniciar el proceso — no asumir persistencia real ni concurrencia segura.
- No hay validación de integridad referencial entre módulos (p. ej. `addBook` no comprueba que `authorId` exista); solo `loan.ts` valida contra `book.ts`.
- El propósito del repo es servir de banco de pruebas para flujos de agentes. Un cambio de feature no se edita directamente: pasa por el flujo SPDD (canvas → design → implement → verify) o por el flujo antz (`/antz "<prompt>"`, que escribe su scratch en `.antz/` y lo borra al verificar). Los dos son válidos aquí; usa el que estés probando.
