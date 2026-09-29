import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default function ({
  db,
  router,
  run,
  get,
  all,
  id,
  now,
  text,
  required,
  fail,
}) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),code TEXT,status TEXT,output TEXT,created_at TEXT);`,
  );
  const tasks = [
    {
      id: "sum",
      title: "İki sayının toplamı",
      description: "function solve(a,b) fonksiyonunu yaz. Sonuç sayı olmalı.",
      starter: "function solve(a,b) {\n  return a + b;\n}",
      tests: [
        [2, 3, 5],
        [-4, 9, 5],
        [0, 0, 0],
      ],
    },
  ];
  const queue = [];
  let busy = false;
  async function processQueue() {
    if (busy || !queue.length) return;
    busy = true;
    const job = queue.shift();
    let dir;
    const container = "lab-" + job.id;
    try {
      run("UPDATE submissions SET status='running' WHERE id=?", job.id);
      dir = await mkdtemp(join(tmpdir(), "judge-"));
      const harness =
        job.code +
        "\nconst tests=" +
        JSON.stringify(tasks[0].tests) +
        ';\nfor(const [a,b,expected] of tests){if(solve(a,b)!==expected)throw Error("Yanlış sonuç");}\nconsole.log("3/3 test başarılı");';
      await chmod(dir, 0o755);
      await writeFile(join(dir, "main.js"), harness, { mode: 0o644 });
      await new Promise((resolve, reject) => {
        let output = "";
        let exceeded = false;
        const args = [
          "run",
          "--rm",
          "--name",
          container,
          "--network=none",
          "--memory=64m",
          "--memory-swap=64m",
          "--cpus=0.5",
          "--pids-limit=32",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--user=65534:65534",
          "--mount",
          `type=bind,src=${dir},dst=/work,readonly`,
          "node:24-alpine",
          "node",
          "/work/main.js",
        ];
        const child = spawn("docker", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const kill = () => {
          spawn("docker", ["rm", "-f", container], { stdio: "ignore" }).on(
            "error",
            () => {},
          );
          child.kill("SIGKILL");
        };
        const timeout = setTimeout(() => {
          exceeded = true;
          kill();
        }, 8000);
        const append = (b) => {
          output += b.toString();
          if (output.length > 8192) {
            output = output.slice(0, 8192);
            exceeded = true;
            kill();
          }
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
        child.on("error", (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        child.on("close", (code) => {
          clearTimeout(timeout);
          run(
            "UPDATE submissions SET status=?,output=? WHERE id=?",
            exceeded ? "limit" : code === 0 ? "accepted" : "failed",
            output.slice(0, 8192),
            job.id,
          );
          resolve();
        });
      });
    } catch (e) {
      run(
        "UPDATE submissions SET status='error',output=? WHERE id=?",
        String(e.message).slice(0, 2000),
        job.id,
      );
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true });
      busy = false;
      processQueue();
    }
  }
  run(
    "UPDATE submissions SET status='error',output='Sunucu yeniden başladı; tekrar gönderin' WHERE status IN ('queued','running')",
  );
  router.get("/problems", (req, res) =>
    res.json({
      enabled: process.env.ENABLE_RUNNER === "1",
      tasks: tasks.map(({ tests, ...t }) => t),
    }),
  );
  router.get("/submissions", (req, res) =>
    res.json(
      all(
        "SELECT id,status,output,created_at FROM submissions WHERE owner=? ORDER BY created_at DESC LIMIT 50",
        req.user.id,
      ),
    ),
  );
  router.post("/submissions", (req, res) => {
    const code = text(req.body.code, 10000);
    if (process.env.ENABLE_RUNNER !== "1")
      fail(
        503,
        "Docker runner kapalı. README içindeki yerel kurulum adımlarını tamamlayın.",
      );
    if (queue.length >= 5) fail(429, "Çalıştırma kuyruğu dolu");
    const sid = id();
    run(
      "INSERT INTO submissions VALUES(?,?,?,?,?,?)",
      sid,
      req.user.id,
      code,
      "queued",
      "",
      now(),
    );
    queue.push({ id: sid, code });
    processQueue();
    res.status(202).json({ id: sid, status: "queued" });
  });
}
