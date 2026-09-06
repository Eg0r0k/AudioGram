import { fireEvent, render, screen } from "@testing-library/vue";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { ImportFileItem } from "@/modules/library/composables/useImport";
import ImportPanel from "../ImportPanel.vue";

const state = await vi.hoisted(async () => {
  const { ref, computed } = await import("vue");
  const files = ref<ImportFileItem[]>([]);
  return {
    isOpen: ref(true),
    isRunning: ref(true),
    isPaused: ref(false),
    isCancelling: ref(false),
    files,
    total: ref(0),
    current: ref(0),
    progress: ref(0),
    visibleFileCount: ref(0),
    successCount: ref(0),
    errorCount: ref(0),
    skippedCount: ref(0),
    liveCounts: computed(() => ({
      ok: files.value.filter(f => f.status === "ok").length,
      error: files.value.filter(f => f.status === "error").length,
      skipped: files.value.filter(f => f.status === "skipped").length,
    })),
    closeSheet: vi.fn(),
    reset: vi.fn(),
    pauseImport: vi.fn(),
    resumeImport: vi.fn(),
    cancelImport: vi.fn(),
  };
});

vi.mock("@/modules/library/composables/useImport", () => ({
  useImport: () => state,
}));

const rightPanel = vi.hoisted(() => ({ close: vi.fn() }));
vi.mock("@/modules/right-panel/store/right-panel.store", () => ({
  useRightPanelStore: () => rightPanel,
}));

const push = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
}));

const stubs = {
  RightPanelHeader: { props: ["title"], template: "<div><h2>{{ title }}</h2></div>" },
  VirtualScrollable: {
    props: ["items"],
    template: `<div><template v-for="item in items" :key="item.name"><slot :item="item" /></template></div>`,
  },
};

const renderPanel = () => render(ImportPanel, { global: { plugins: [i18n], stubs } });

const file = (name: string, status: ImportFileItem["status"], extra: Partial<ImportFileItem> = {}): ImportFileItem =>
  ({ name, status, ...extra });

describe("ImportPanel", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    vi.clearAllMocks();
    state.isOpen.value = true;
    state.isRunning.value = true;
    state.isPaused.value = false;
    state.isCancelling.value = false;
    state.files.value = [file("a.mp3", "ok"), file("b.mp3", "pending")];
    state.total.value = 2;
    state.current.value = 1;
    state.progress.value = 50;
    state.visibleFileCount.value = 2;
    state.successCount.value = 0;
    state.errorCount.value = 0;
    state.skippedCount.value = 0;
  });

  it("shows progress, the current file and pause/cancel while running", () => {
    renderPanel();

    expect(screen.getByText("Importing tracks")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("b.mp3", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("toggles pause and resume", async () => {
    renderPanel();

    await fireEvent.click(screen.getByRole("button", { name: "Pause import" }));
    expect(state.pauseImport).toHaveBeenCalledOnce();

    state.isPaused.value = true;
    await nextTick();
    expect(screen.getByText("Import paused")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Resume import" }));
    expect(state.resumeImport).toHaveBeenCalledOnce();
  });

  it("lists results with reasons when finished and dismisses the session on unmount", async () => {
    state.isRunning.value = false;
    state.files.value = [
      file("a.mp3", "ok", { title: "Alpha", artist: "Artist" }),
      file("b.mp3", "error", { errorCode: "PARSE_FAILED" as never }),
      file("c.mp3", "skipped"),
    ];
    state.total.value = 3;
    state.successCount.value = 1;
    state.errorCount.value = 1;
    state.skippedCount.value = 1;
    const { unmount } = renderPanel();

    expect(screen.getByText("Alpha — Artist")).toBeInTheDocument();
    expect(screen.getByText("Couldn't read track metadata")).toBeInTheDocument();
    expect(screen.queryByText("Importing tracks")).toBeNull();

    unmount();
    expect(state.closeSheet).toHaveBeenCalledOnce();
    expect(state.reset).toHaveBeenCalledOnce();
  });

  it("keeps the session when unmounted while the import is running", () => {
    const { unmount } = renderPanel();

    unmount();
    expect(state.closeSheet).not.toHaveBeenCalled();
    expect(state.reset).not.toHaveBeenCalled();
  });

  it("navigates to the library from the finished state", async () => {
    state.isRunning.value = false;
    state.successCount.value = 2;
    renderPanel();

    await fireEvent.click(screen.getByRole("button", { name: "Go to library" }));
    expect(state.reset).toHaveBeenCalled();
    expect(rightPanel.close).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
  });

  it("filters the list through the tabs when there are errors", async () => {
    state.isRunning.value = false;
    state.files.value = [file("a.mp3", "ok"), file("b.mp3", "error"), file("c.mp3", "skipped")];
    state.errorCount.value = 1;
    state.skippedCount.value = 1;
    renderPanel();

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    await fireEvent.mouseDown(screen.getByRole("tab", { name: /Errors/ }), { button: 0 });
    await nextTick();

    expect(screen.getByText("b.mp3")).toBeInTheDocument();
    expect(screen.queryByText("a.mp3")).toBeNull();
    expect(screen.queryByText("c.mp3")).toBeNull();
  });

  it("hides the go-to-library action when nothing was imported", () => {
    state.isRunning.value = false;
    state.successCount.value = 0;
    renderPanel();

    expect(screen.queryByRole("button", { name: "Go to library" })).toBeNull();
  });
});
