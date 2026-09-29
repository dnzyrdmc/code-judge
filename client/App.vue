<script setup lang="ts">
import { ref, onMounted } from "vue";
import Workspace from "./Workspace.vue";
import { api, act, error, message } from "./api";
import meta from "./meta.json";
const user = ref<any>(null),
  email = ref("demo@example.com"),
  password = ref("Demo12345!"),
  ready = ref(false),
  busy = ref(false);
onMounted(async () => {
  try {
    user.value = await api("/auth/me");
  } catch {
  } finally {
    ready.value = true;
  }
});
async function login() {
  busy.value = true;
  await act(async () => {
    user.value = await api("/auth/login", "POST", {
      email: email.value,
      password: password.value,
    });
  }, "Giriş yapıldı");
  busy.value = false;
}
async function logout() {
  await act(async () => {
    await api("/auth/logout", "POST", {});
    user.value = null;
  }, "Çıkış yapıldı");
}
</script>
<template>
  <header>
    <div class="brand">
      DY <span>FULL-STACK LAB / {{ meta.day }}</span>
    </div>
    <div v-if="user" class="user">
      {{ user.name }} <button class="ghost" @click="logout">Çıkış</button>
    </div>
  </header>
  <main>
    <div class="intro">
      <p class="eyebrow">PORTFOLYO PROJESİ · ÇALIŞAN TEMEL SÜRÜM</p>
      <h1>{{ meta.title }}</h1>
      <p>{{ meta.description }}</p>
      <span class="badge">{{ meta.mode }}</span>
    </div>
    <div v-if="error" class="alert error" role="alert">{{ error }}</div>
    <div v-if="message" class="alert" role="status">{{ message }}</div>
    <p v-if="!ready">Yükleniyor...</p>
    <form v-else-if="!user" class="panel login" @submit.prevent="login">
      <h2>Çalışma alanına giriş</h2>
      <p>
        Yerel demo hesabı aşağıda hazır. Veriler bu bilgisayardaki SQLite
        dosyasına kaydedilir.
      </p>
      <label>E-posta<input v-model="email" type="email" required /></label
      ><label
        >Parola<input
          v-model="password"
          type="password"
          required
          minlength="8" /></label
      ><button :disabled="busy">
        {{ busy ? "Giriş yapılıyor..." : "Giriş yap" }}</button
      ><small>demo@example.com / Demo12345!</small>
    </form>
    <Workspace v-else :user="user" />
    <footer>Vue + Node.js + SQLite · v0.1 · {{ meta.note }}</footer>
  </main>
</template>
