import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8789",
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
