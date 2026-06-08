import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/client",
    rollupOptions: {
      input: {
        admin: "admin/index.html",
        chat: "chat/index.html",
        viewer: "index.html",
      },
    },
  },
});
