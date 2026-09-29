import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function text(value, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(422, `Metin 1-${max} karakter olmalı`);
  return value.trim();
}
export function num(value, min = 0, max = 1e9) {
  const n = Number(value);
  if (
    value === null ||
    value === "" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max
  )
    fail(422, "Geçersiz sayı");
  return n;
}
export function integer(value, min = 0, max = 1e9) {
  const n = num(value, min, max);
  if (!Number.isInteger(n)) fail(422, "Tam sayı gerekli");
  return n;
}
export function choice(value, options) {
  if (!options.includes(value)) fail(422, "Geçersiz seçenek");
  return value;
}
export function required(row) {
  if (!row) fail(404, "Kayıt bulunamadı");
  return row;
}
export const hash = (v) => createHash("sha256").update(v).digest("hex");
export function context(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  const run = (q, ...p) => db.prepare(q).run(...p),
    get = (q, ...p) => db.prepare(q).get(...p),
    all = (q, ...p) => db.prepare(q).all(...p);
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);`);
  for (const [uid, email, name] of [
    ["demo", "demo@example.com", "Deniz Demo"],
    ["other", "other@example.com", "İkinci Kullanıcı"],
  ]) {
    if (!get("SELECT id FROM users WHERE id=?", uid)) {
      const salt = randomBytes(16).toString("hex");
      const password = process.env.DEMO_PASSWORD || "Demo12345!";
      run(
        "INSERT INTO users VALUES(?,?,?,?,?)",
        uid,
        email,
        name,
        salt,
        scryptSync(password, salt, 64).toString("hex"),
      );
    }
  }
  const clients = new Set();
  const publish = (event, data, owner) => {
    for (const c of clients)
      if (!owner || c.user === owner)
        c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  return {
    db,
    run,
    get,
    all,
    tx,
    clients,
    publish,
    id,
    now,
    fail,
    text,
    num,
    integer,
    choice,
    required,
    hash,
  };
}
export function installAuth(app, c) {
  const { get, run } = c,
    attempts = new Map();
  app.use((req, res, next) => {
    const token = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sid="))
      ?.slice(4);
    req.user = token
      ? get(
          "SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
          hash(token),
          Date.now(),
        )
      : null;
    next();
  });
  app.post("/api/auth/login", (req, res) => {
    const key = req.socket.remoteAddress;
    let item = attempts.get(key);
    if (!item || Date.now() > item.until) {
      item = { count: 0, until: Date.now() + 60000 };
      attempts.set(key, item);
    }
    if (++item.count > 15)
      fail(429, "Çok fazla giriş denemesi; bir dakika bekle");
    const email = text(req.body.email),
      password = text(req.body.password, 200),
      u = get("SELECT * FROM users WHERE email=?", email);
    const candidate = scryptSync(password, u?.salt || "invalid-user-salt", 64);
    if (!u || !timingSafeEqual(candidate, Buffer.from(u.password_hash, "hex")))
      fail(401, "E-posta veya parola hatalı");
    const token = randomBytes(32).toString("hex");
    run("DELETE FROM sessions WHERE expires_at<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      u.id,
      Date.now() + 86400000,
    );
    res.cookie("sid", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "1",
      maxAge: 86400000,
      path: "/",
    });
    res.json({ id: u.id, name: u.name, email: u.email });
  });
  app.post("/api/auth/logout", (req, res) => {
    const token = String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sid="))
      ?.slice(4);
    if (token) run("DELETE FROM sessions WHERE token_hash=?", hash(token));
    res.clearCookie("sid");
    res.json({ ok: true });
  });
  app.get("/api/auth/me", (req, res) => {
    if (!req.user) fail(401, "Giriş gerekli");
    res.json(req.user);
  });
  app.get("/api/events", (req, res) => {
    if (!req.user) fail(401, "Giriş gerekli");
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    const client = { res, user: req.user.id };
    c.clients.add(client);
    res.write("event: ready\ndata: {}\n\n");
    const interval = setInterval(() => {
      const token = String(req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("sid="))
        ?.slice(4);
      const exists =
        token &&
        get(
          "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
          hash(token),
          Date.now(),
        );
      if (!exists) {
        res.end();
        return;
      }
      res.write(": heartbeat\n\n");
    }, 15000);
    const expiry = setTimeout(() => res.end(), 3600000);
    req.on("close", () => {
      clearInterval(interval);
      clearTimeout(expiry);
      c.clients.delete(client);
    });
  });
}
