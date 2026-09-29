const base = process.env.APP_URL || "http://localhost:3000";
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "demo@example.com",
    password: process.env.DEMO_PASSWORD || "Demo12345!",
  }),
});
if (!login.ok)
  throw Error(
    "Önce npm run dev veya npm start ile sunucuyu başlatın; parola doğru olmalı.",
  );
const cookie = login.headers.get("set-cookie").split(";")[0];
async function request(path, method, body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
const post = (p, b) => request(p, "POST", b),
  put = (p, b) => request(p, "PUT", b);
console.log(
  "Örnek problem ve çözüm arayüzde hazırdır. Docker kurulumu README içinde.",
);
console.log(
  "Demo verisi hazır. Tekrar çalıştırmak yeni örnek kayıtlar ekleyebilir.",
);
