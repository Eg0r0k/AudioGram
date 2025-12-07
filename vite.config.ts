// vite.config.ts
/// <reference types="vitest/config" />

import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vitest/config";
import VueDevTools from "vite-plugin-vue-devtools";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const isAnalyze = process.env.ANALYZE === "true";

export default defineConfig({
  plugins: [
    vue(),
    VueDevTools(),
    tailwindcss(),
    isAnalyze &&
      visualizer({
        filename: "dist/stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
  ],

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    target: "es2020",
    sourcemap: isAnalyze,
    rollupOptions: {
      output: {
        manualChunks: {
          "vue-vendor": ["vue", "vue-router", "pinia"],
          "ui-vendor": ["reka-ui", "vaul-vue", "motion-v"],
          "utils-vendor": ["@vueuse/core", "clsx", "tailwind-merge"],
        },
      },
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  test: {
    globals: true,
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{js,ts,vue}"],
    exclude: ["node_modules", "dist", "src-tauri"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src-tauri/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/types/**",
      ],
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});
