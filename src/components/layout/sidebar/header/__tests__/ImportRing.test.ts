import { render, screen } from "@testing-library/vue";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import ImportRing from "../ImportRing.vue";

const state = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return {
    isOpen: ref(true),
    isRunning: ref(true),
    isPaused: ref(false),
    progress: ref(25),
    current: ref(1),
    total: ref(4),
    errorCount: ref(0),
  };
});

vi.mock("@/modules/library/composables/useImport", () => ({
  useImport: () => state,
}));

const CIRCUMFERENCE = 2 * Math.PI * 18;

const renderRing = () => render(ImportRing, { global: { plugins: [i18n] } });

describe("ImportRing", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    state.isOpen.value = true;
    state.isRunning.value = true;
    state.isPaused.value = false;
    state.progress.value = 25;
    state.current.value = 1;
    state.total.value = 4;
    state.errorCount.value = 0;
  });

  it("renders nothing without an import session", () => {
    state.isOpen.value = false;
    renderRing();

    expect(screen.queryByTestId("import-ring")).toBeNull();
  });

  it("reflects progress on the ring and in the label", () => {
    renderRing();

    const ring = screen.getByTestId("import-ring");
    expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(CIRCUMFERENCE * 0.75, 5);
    expect(screen.getByText("Import, 1 of 4")).toBeInTheDocument();
  });

  it("labels the paused state", async () => {
    renderRing();
    state.isPaused.value = true;
    await nextTick();

    expect(screen.getByText("Import paused")).toBeInTheDocument();
  });

  it("closes the ring and shows the error dot when finished with failures", () => {
    state.isRunning.value = false;
    state.progress.value = 100;
    state.errorCount.value = 2;
    renderRing();

    const ring = screen.getByTestId("import-ring");
    expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
    expect(screen.getByTestId("import-error-dot")).toBeInTheDocument();
    expect(screen.getByText("Import complete, open details")).toBeInTheDocument();
  });

  it("hides the error dot when finished cleanly", () => {
    state.isRunning.value = false;
    state.progress.value = 100;
    renderRing();

    expect(screen.queryByTestId("import-error-dot")).toBeNull();
  });
});
