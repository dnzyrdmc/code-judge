import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.js";
test("API iş kuralları ve yetki sınırları", async () => {
  process.env.ENABLE_RUNNER = "0";
  const { app, c } = await createApp({ dbPath: ":memory:" });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function raw(path, method = "GET", body, auth) {
    return fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth ? { Cookie: auth } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  }
  async function login(email) {
    const r = await raw("/api/auth/login", "POST", {
      email,
      password: "Demo12345!",
    });
    assert.equal(r.status, 200);
    await r.json();
    return r.headers.get("set-cookie").split(";")[0];
  }
  const cookie = await login("demo@example.com"),
    other = await login("other@example.com");
  async function call(path, method = "GET", body, status = 200, auth = cookie) {
    const r = await raw(path, method, body, auth);
    const text = await r.text();
    assert.equal(r.status, status, method + " " + path + " => " + text);
    return text ? JSON.parse(text) : null;
  }
  const get = (p) => call("/api" + p);
  const post = (p, b, status = 200) => call("/api" + p, "POST", b, status);
  try {
    const anonymous = await raw("/api/auth/me");
    assert.equal(anonymous.status, 401);
    await anonymous.json();
    const crossOrigin = await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: {
        Origin: "https://wrong.example",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(crossOrigin.status, 403);
    await crossOrigin.json();
    const problems = await get("/problems");
    assert.equal(problems.tasks[0].id, "sum");
    assert.equal(problems.enabled, false);
    await post(
      "/submissions",
      { code: "function solve(a,b){return a+b;}" },
      503,
    );
    assert.equal((await get("/submissions")).length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
