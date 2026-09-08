import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { SESSION_COOKIE_NAME } from "./session";

let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

const VALID_USERNAME = "bibliotecario";
const VALID_PASSWORD = "biblioteca123";

/**
 * Par `nombre=valor` de la cookie de sesión de la respuesta (null si no hay
 * Set-Cookie o si el valor quedó vacío, como en la limpieza del logout).
 * No depende del nombre literal de la cookie: es un detalle de implementación.
 */
function sessionCookiePair(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    return null;
  }
  const pair = setCookie.split(";")[0].trim();
  const separator = pair.indexOf("=");
  if (separator === -1 || pair.slice(separator + 1) === "") {
    return null;
  }
  return pair;
}

/** Precondición: login correcto sin next; devuelve la cookie para reutilizarla. */
async function loginAndGetSessionCookie(): Promise<string> {
  const res = await fetch(`${baseUrl}/login`, {
    method: "POST",
    body: new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD }),
    redirect: "manual",
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/books/new");
  const pair = sessionCookiePair(res);
  assert.ok(pair, "precondición: el login debe establecer la cookie de sesión");
  return pair;
}

describe("GET /login", () => {
  test("login-session-1: sin sesión responde 200 con el formulario (usuario, contraseña, POST /login)", async () => {
    const res = await fetch(`${baseUrl}/login`, { redirect: "manual" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("set-cookie"), null);
    const html = await res.text();
    assert.match(html, /<form method="POST" action="\/login">/);
    assert.match(html, /<input type="text" name="username">/);
    assert.match(html, /<input type="password" name="password">/);
  });

  test("login-session-6: con sesión válida responde 302 a /books/new sin renderizar el formulario", async () => {
    const cookie = await loginAndGetSessionCookie();
    const res = await fetch(`${baseUrl}/login`, { headers: { cookie }, redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/books/new");
    assert.doesNotMatch(await res.text(), /<form/);
  });

  test("invariante: cookie alterada o irreconocible se trata como no autenticado, nunca 500", async () => {
    const tampered = await fetch(`${baseUrl}/login`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=valor-falsificado` },
      redirect: "manual",
    });
    assert.equal(tampered.status, 200);
    assert.match(await tampered.text(), /<form method="POST" action="\/login">/);

    const unrecognized = await fetch(`${baseUrl}/login`, {
      headers: { cookie: "otra-cookie=sin-relacion-con-la-sesion" },
      redirect: "manual",
    });
    assert.equal(unrecognized.status, 200);
  });
});

describe("POST /login", () => {
  test("login-session-2: credenciales válidas sin next responden 302 a /books/new y establecen la cookie", async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD }),
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/books/new");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie, "debe establecerse la cookie de sesión");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\//);
  });

  // login-session-3 (Scenario Outline): una prueba por fila de la tabla de ejemplos.
  const nextCases = [
    { next: null, redirectTo: "/books/new", label: "sin next" },
    { next: "/books", redirectTo: "/books", label: "next=/books" },
    { next: "https://evil.com", redirectTo: "/books/new", label: "next=https://evil.com" },
    { next: "not-a-path", redirectTo: "/books/new", label: "next=not-a-path" },
  ];
  for (const { next, redirectTo, label } of nextCases) {
    test(`login-session-3 (${label}): 302 a ${redirectTo} y cookie establecida`, async () => {
      const body =
        next === null
          ? new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD })
          : new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD, next });
      const res = await fetch(`${baseUrl}/login`, { method: "POST", body, redirect: "manual" });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), redirectTo);
      assert.ok(sessionCookiePair(res), "debe establecerse la cookie de sesión");
    });
  }

  // login-session-4 (Scenario Outline): una prueba por fila de la tabla de ejemplos.
  const wrongCredentialCases = [
    { username: VALID_USERNAME, password: "wrong-password", label: "contraseña errónea" },
    { username: "no-existe", password: VALID_PASSWORD, label: "usuario inexistente" },
  ];
  for (const { username, password, label } of wrongCredentialCases) {
    test(`login-session-4 (${label}): 401 re-renderiza el formulario con el mensaje genérico y sin cookie`, async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: "POST",
        body: new URLSearchParams({ username, password }),
        redirect: "manual",
      });
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("set-cookie"), null);
      const html = await res.text();
      assert.match(html, /Usuario o contraseña incorrectos\./);
      assert.match(html, /<form method="POST" action="\/login">/);
    });
  }

  test("invariante: el mensaje de error es idéntico para usuario inexistente y contraseña errónea", async () => {
    const wrongPassword = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: VALID_USERNAME, password: "wrong-password" }),
      redirect: "manual",
    });
    const unknownUser = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: "no-existe", password: VALID_PASSWORD }),
      redirect: "manual",
    });
    const errorOf = (html: string): string | null =>
      html.match(/<p style="color: red;">(.*?)<\/p>/)?.[1] ?? null;
    const wrongPasswordError = errorOf(await wrongPassword.text());
    assert.equal(wrongPasswordError, "Usuario o contraseña incorrectos.");
    assert.equal(errorOf(await unknownUser.text()), wrongPasswordError);
  });

  // login-session-5 (Scenario Outline): una prueba por fila de la tabla de ejemplos.
  const emptyFieldCases = [
    { username: "", password: VALID_PASSWORD, label: "usuario vacío" },
    { username: VALID_USERNAME, password: "", label: "contraseña vacía" },
    { username: "", password: "", label: "ambos vacíos" },
  ];
  for (const { username, password, label } of emptyFieldCases) {
    test(`login-session-5 (${label}): 400 y sin cookie`, async () => {
      const res = await fetch(`${baseUrl}/login`, {
        method: "POST",
        body: new URLSearchParams({ username, password }),
        redirect: "manual",
      });
      assert.equal(res.status, 400);
      assert.equal(res.headers.get("set-cookie"), null);
      assert.match(await res.text(), /<form method="POST" action="\/login">/);
    });
  }

  test("invariante: un next con caracteres de control no provoca un 500 ni inyecta headers", async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({
        username: VALID_USERNAME,
        password: VALID_PASSWORD,
        next: "/books\r\nX-Evil: 1",
      }),
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/books/new");
  });
});

describe("POST /logout", () => {
  test("login-session-7: 302 a /login, limpia la cookie y la sesión reutilizada deja de autenticar", async () => {
    const cookie = await loginAndGetSessionCookie();
    const res = await fetch(`${baseUrl}/logout`, { method: "POST", headers: { cookie }, redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie, "la respuesta debe limpiar la cookie");
    assert.match(setCookie, /^[^=]+=;/, "el valor de la cookie debe quedar vacío");

    const after = await fetch(`${baseUrl}/login`, { headers: { cookie }, redirect: "manual" });
    assert.equal(after.status, 200, "la cookie antigua ya no debe autenticar");
    assert.match(await after.text(), /<form method="POST" action="\/login">/);
  });

  test("login-session-8 (sin cookie): 302 a /login sin error", async () => {
    const res = await fetch(`${baseUrl}/logout`, { method: "POST", redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  });

  test("login-session-8 (cookie irreconocible): 302 a /login sin error", async () => {
    const res = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=sesion-inexistente` },
      redirect: "manual",
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/login");
  });
});

describe("verbos no soportados", () => {
  test("login-session-9: DELETE /login responde 405", async () => {
    const res = await fetch(`${baseUrl}/login`, { method: "DELETE" });
    assert.equal(res.status, 405);
  });

  test("login-session-10: GET /logout responde 405", async () => {
    const res = await fetch(`${baseUrl}/logout`, { redirect: "manual" });
    assert.equal(res.status, 405);
  });
});
