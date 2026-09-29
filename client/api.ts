import { ref } from "vue";
export const error = ref("");
export const message = ref("");
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r
    .json()
    .catch(() => ({ error: "Beklenmeyen sunucu yanıtı" }));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
export async function act(
  fn: () => Promise<void>,
  success = "İşlem tamamlandı",
) {
  error.value = "";
  message.value = "";
  try {
    await fn();
    message.value = success;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "İşlem başarısız";
  }
}
export const money = (minor: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    minor / 100,
  );
export const stamp = (date: string) => new Date(date).toLocaleString("tr-TR");
export async function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(file);
  });
}
