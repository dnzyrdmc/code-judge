<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { api, act } from "./api";
const config = ref({ tasks: [], enabled: false }),
  code = ref(""),
  rows = ref([]);
let timer;
async function load() {
  rows.value = await api("/submissions");
}
onMounted(async () => {
  await act(async () => {
    config.value = await api("/problems");
    code.value = config.value.tasks[0].starter;
    await load();
  }, "");
  timer = setInterval(() => act(load, ""), 3000);
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <div class="alert" :class="{ error: !config.enabled }">
    {{
      config.enabled
        ? "Docker çalıştırıcısı etkin"
        : "Çalıştırıcı kapalı: README içindeki Docker kurulumu gereklidir. Kod editörü ve geçmiş ekranı kullanılabilir."
    }}
  </div>
  <div class="grid">
    <form
      class="panel"
      @submit.prevent="
        act(async () => {
          await api('/submissions', 'POST', { code });
          await load();
        }, 'Kuyruğa alındı')
      "
    >
      <h2>{{ config.tasks[0]?.title }}</h2>
      <p>{{ config.tasks[0]?.description }}</p>
      <label
        >JavaScript kodu<textarea
          v-model="code"
          rows="15"
          spellcheck="false"
        ></textarea></label
      ><button :disabled="!config.enabled">İzole ortamda çalıştır</button
      ><small
        >8 saniye duvar süresi · 64 MB bellek · ağ kapalı · yerel
        kullanım</small
      >
    </form>
    <section class="panel">
      <h2>Çalıştırma geçmişi</h2>
      <div v-for="r in rows" class="card">
        <span class="badge">{{ r.status }}</span
        ><small>{{ r.created_at }}</small>
        <pre v-if="r.output">{{ r.output }}</pre>
      </div>
      <p v-if="!rows.length" class="empty">Henüz gönderim yok.</p>
    </section>
  </div>
</template>
