import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const appPort = Number(process.env.APP_PORT || 3333);
const webPort = Number(process.env.WEB_PORT || appPort + 1);

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${appPort}`,
      "/healthz": `http://127.0.0.1:${appPort}`
    }
  },
  build: {
    outDir: fileURLToPath(new URL("../../.ui-dist", import.meta.url)),
    emptyOutDir: true
  }
});
