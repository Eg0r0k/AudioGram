import { fireEvent, render, screen } from "@testing-library/vue";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import ImportIndicator from "../ImportIndicator.vue";

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

const rightPanel = vi.hoisted(() => ({ openImport: vi.fn() }));
vi.mock("@/modules/right-panel/store/right-panel.store", () => ({
  useRightPanelStore: () => rightPanel,
}));

vi.mock("motion-v", async () => {
  const { ref } = await import("vue");
  const slot = { template: "<div><slot /></div>" };
  return {
    Motion: slot,
    AnimatePresence: slot,
    useReducedMotion: () => ref(false),
  };
});

const CIRCUMFERENCE = 2 * Math.PI * 15;

const renderIndicator = () => render(ImportIndicator, { global: { plugins: [i18n] } });

describe("ImportIndicator", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    vi.clearAllMocks();
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
    renderIndicator();

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reflects progress on the ring and in the label", () => {
    renderIndicator();

    const ring = screen.getByTestId("import-ring");
    expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(CIRCUMFERENCE * 0.75, 5);
    expect(screen.getByRole("button", { name: "Import, 1 of 4" })).toBeInTheDocument();
  });

  it("labels the paused state", async () => {
    renderIndicator();
    state.isPaused.value = true;
    await nextTick();

    expect(screen.getByRole("button", { name: "Import paused" })).toBeInTheDocument();
  });

  it("closes the ring and shows the error dot when finished with failures", () => {
    state.isRunning.value = false;
    state.progress.value = 100;
    state.errorCount.value = 2;
    renderIndicator();

    const ring = screen.getByTestId("import-ring");
    expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(0, 5);
    expect(screen.getByTestId("import-error-dot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import complete, open details" })).toBeInTheDocument();
  });

  it("hides the error dot when finished cleanly", () => {
    state.isRunning.value = false;
    state.progress.value = 100;
    renderIndicator();

    expect(screen.queryByTestId("import-error-dot")).toBeNull();
  });

  it("opens the import panel on click", async () => {
    renderIndicator();

    await fireEvent.click(screen.getByRole("button"));
    expect(rightPanel.openImport).toHaveBeenCalledOnce();
  });
});
