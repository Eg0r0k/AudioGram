import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/vue";
import { config } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

vi.mock("@tauri-apps/api", () => ({
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  // TauriStorage reads it at construction, so any test whose import graph
  // reaches @/db/storage needs it present.
  BaseDirectory: { AppData: 1 },
}));

vi.mock("@/workers/meta.worker?worker", () => ({
  default: class MockWorker {
    addEventListener() {}
    postMessage() {}
    terminate() {}
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
});

config.global.stubs = {
  teleport: true,
  transition: false,
};
