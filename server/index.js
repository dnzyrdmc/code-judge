import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { context, installAuth } from "./core.js";
import install from "./project.js";
export async function createApp({
  dbPath = process.env.DB_PATH || "data/app.sqlite",
  dev = false,
} = {}) {
  const app = express(),
    c = context(dbPath);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
    });
    const origin = req.headers.origin;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin) {
      try {
        if (new URL(origin).host !== req.headers.host)
          return res
            .status(403)
            .json({ error: "Farklı kaynaktan yazma isteği reddedildi" });
      } catch {
        return res.status(403).json({ error: "Geçersiz origin" });
      }
    }
    next();
  });
  app.use(express.json({ limit: "12mb" }));
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  installAuth(app, c);
  const router = express.Router();
  router.use((req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "Giriş gerekli" }),
  );
  await install({ app, router, ...c });
  app.use("/api", router);
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API bulunamadı" }),
  );
  if (dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (existsSync("dist/index.html")) {
    app.use(express.static("dist"));
    app.get("/{*path}", (req, res) => res.sendFile(resolve("dist/index.html")));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const constraint = /constraint|UNIQUE/i.test(err.message);
    const status = err.status || (constraint ? 409 : 500);
    if (status === 500) console.error(err);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "Sunucu hatası"
            : constraint
              ? "Çakışan veya geçersiz kayıt"
              : err.message,
      });
  });
  return { app, c };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app } = await createApp({ dev: process.argv.includes("--dev") });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Uygulama: http://localhost:${port}`),
  );
}
