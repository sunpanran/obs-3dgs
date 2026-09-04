import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: "./",
  publicDir: command === "serve" ? "public" : false,
  server: {
    watch: {
      ignored: [
        "**/.deps/**",
        "**/build/**",
        "**/build_*/**",
        "**/dist/**",
        "**/output/**",
        "**/release/**",
        "**/tmp/**"
      ]
    }
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    sourcemap: false,
    target: "chrome127",
    chunkSizeWarningLimit: 6000
  },
  worker: {
    format: "es"
  }
}));
