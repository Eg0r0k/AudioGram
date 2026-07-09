// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest/config" />
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import Icons from "unplugin-icons/vite";
import { FileSystemIconLoader } from "unplugin-icons/loaders";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import VueDevTools from "vite-plugin-vue-devtools";
import { PluginOption } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;
const isAnalyze = process.env.VITE_ANALYZE === "true";
const isDev = process.env.NODE_ENV !== "production";
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
);
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().getFullYear()),
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    vue(),
    isDev && VueDevTools(),
    tailwindcss(),
    Icons({
      compiler: "vue3",
      customCollections: {
        audiogram: FileSystemIconLoader(
          "./src/assets/icons",
          svg => svg.replace(/^<svg /, "<svg fill=\"currentColor\" "),
        ),

      },
    }),
    VitePWA(
      {
        disable: isTauri,

        registerType: "prompt",

        injectRegister: null,

        manifest: {
          name: "Audiogram",
          short_name: "Audiogram",
          description: "Local music player",
          theme_color: "#8774e1",
          background_color: "#181818",

          display: "standalone",

        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
          globIgnores: ["**/*.{mp3,flac,ogg,wav,m4a,aac}"],
          navigateFallback: "/index.html",
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /\/img\/.+\.(png|jpe?g|webp|svg|gif)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "static-images",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      },
    ),
    isAnalyze && (visualizer({
      filename: "dist/stats.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: "treemap",
    }) as unknown as PluginOption),
  ],
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },

  clearScreen: false,

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
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
