import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { server } from "./server";
import { addAuthor } from "../domain/author";
import { listBooks } from "../domain/book";

let baseUrl: string;

const JANE_AUSTEN_ID = "librarian-login-e2e-jane-austen";
const SEED_USERNAME = "bibliotecario";
const SEED_PASSWORD = "biblioteca123";

function sessionCookieFromResponse(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    return null;
  }
  return setCookie.split(";")[0].trim();
}

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  addAuthor({ id: JANE_AUSTEN_ID, name: "Jane Austen" });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("librarian-login-e2e-1", () => {
  test("full happy path — blocked, log in, insert a book, log out, blocked again", async () => {
    const blockedRes = await fetch(`${baseUrl}/books/new`, { redirect: "manual" });
    assert.equal(blockedRes.status, 302);
    assert.equal(blockedRes.headers.get("location"), "/login?next=/books/new");

    const loginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: SEED_USERNAME, password: SEED_PASSWORD }),
      redirect: "manual",
    });
    assert.equal(loginRes.status, 302);
    assert.equal(loginRes.headers.get("location"), "/books/new");
    const cookie = sessionCookieFromResponse(loginRes);
    assert.ok(cookie, "login must set a session cookie");

    const formRes = await fetch(`${baseUrl}/books/new`, {
      headers: { cookie: cookie as string },
      redirect: "manual",
    });
    assert.equal(formRes.status, 200);
    const formHtml = await formRes.text();
    assert.match(formHtml, /<select/);
    assert.match(formHtml, new RegExp(`<option value="${JANE_AUSTEN_ID}">Jane Austen</option>`));

    const beforeBooks = listBooks().length;
    const createRes = await fetch(`${baseUrl}/books`, {
      method: "POST",
      headers: { cookie: cookie as string },
      body: new URLSearchParams({ title: "Persuasión", authorId: JANE_AUSTEN_ID }),
      redirect: "manual",
    });
    assert.equal(createRes.status, 302);
    assert.equal(createRes.headers.get("location"), "/books");
    assert.equal(listBooks().length, beforeBooks + 1);

    const listRes = await fetch(`${baseUrl}/books`);
    assert.equal(listRes.status, 200);
    const listHtml = await listRes.text();
    assert.match(listHtml, /Persuasión/);
    assert.match(listHtml, /Jane Austen/);

    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { cookie: cookie as string },
      redirect: "manual",
    });
    assert.equal(logoutRes.status, 302);
    assert.equal(logoutRes.headers.get("location"), "/login");

    const blockedAgainRes = await fetch(`${baseUrl}/books/new`, {
      headers: { cookie: cookie as string },
      redirect: "manual",
    });
    assert.equal(blockedAgainRes.status, 302);
    assert.equal(blockedAgainRes.headers.get("location"), "/login?next=/books/new");
  });
});

describe("librarian-login-e2e-2", () => {
  test("wrong credentials keep the visitor locked out", async () => {
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: SEED_USERNAME, password: "wrong-password" }),
      redirect: "manual",
    });
    assert.equal(loginRes.status, 401);
    assert.equal(loginRes.headers.get("set-cookie"), null);
    const loginHtml = await loginRes.text();
    assert.match(loginHtml, /Usuario o contraseña incorrectos\./);
    assert.match(loginHtml, /<form method="POST" action="\/login">/);

    const blockedRes = await fetch(`${baseUrl}/books/new`, { redirect: "manual" });
    assert.equal(blockedRes.status, 302);
    assert.equal(blockedRes.headers.get("location"), "/login?next=/books/new");
  });
});

describe("librarian-login-e2e-3", () => {
  const publicRoutes = ["/books", "/authors"];
  for (const route of publicRoutes) {
    test(`public catalog page ${route} remains reachable without logging in`, async () => {
      const res = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
      assert.equal(res.status, 200);
      const location = res.headers.get("location");
      assert.ok(
        location === null || !location.startsWith("/login"),
        "must not redirect to the login page"
      );
    });
  }
});
