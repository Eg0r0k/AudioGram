import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { render, screen, fireEvent } from "@testing-library/vue";
import {
  DialogSummonHost,
  dismissAllSummonedDialogs,
  summonDialog,
  useSummonedDialog,
} from "../summon";

// Follows the summoned-dialog contract without reka: visible while `open`,
// resolves through the controller, reports its own close via update:open.
const StubDialog = defineComponent({
  name: "StubDialog",
  props: {
    label: { type: String, required: true },
    open: { type: Boolean, required: true },
  },
  emits: ["update:open"],
  setup(props, { emit }) {
    const { resolve } = useSummonedDialog<string>();
    return () => props.open
      ? h("div", { "data-testid": `dialog-${props.label}` }, [
          h("button", {
            "data-testid": `ok-${props.label}`,
            onClick: () => resolve(`result-${props.label}`),
          }, "ok"),
          h("button", {
            "data-testid": `close-${props.label}`,
            onClick: () => emit("update:open", false),
          }, "close"),
        ])
      : null;
  },
});

// A dialog that summons another dialog from inside itself and reports what
// the nested one resolved with.
const NestingDialog = defineComponent({
  name: "NestingDialog",
  props: {
    open: { type: Boolean, required: true },
  },
  emits: ["update:open"],
  setup(props) {
    const { resolve } = useSummonedDialog<string>();
    const openNested = async () => {
      const nested = await summonDialog<string>(StubDialog, { label: "inner" });
      resolve(`outer got: ${nested ?? "nothing"}`);
    };
    return () => props.open
      ? h("div", { "data-testid": "dialog-outer" }, [
          h("button", { "data-testid": "open-inner", onClick: openNested }, "open inner"),
        ])
      : null;
  },
});

const settleRemovals = async () => {
  vi.runAllTimers();
  await nextTick();
};

describe("summonDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    dismissAllSummonedDialogs();
    await settleRemovals();
    vi.useRealTimers();
  });

  it("mounts the summoned component in the host with its props", async () => {
    render(DialogSummonHost);

    const promise = summonDialog<string>(StubDialog, { label: "a" });
    await nextTick();

    expect(screen.getByTestId("dialog-a")).toBeInTheDocument();

    // Still pending: neither resolved nor dismissed yet.
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await nextTick();
    expect(settled).toBe(false);
  });

  it("resolves with the dialog's value and unmounts after the exit delay", async () => {
    render(DialogSummonHost);
    const promise = summonDialog<string>(StubDialog, { label: "a" });
    await nextTick();

    await fireEvent.click(screen.getByTestId("ok-a"));
    await expect(promise).resolves.toBe("result-a");

    // Hidden immediately (open=false → exit animation), removed after delay.
    expect(screen.queryByTestId("dialog-a")).toBeNull();
    await settleRemovals();
    expect(document.querySelector("[data-testid^='dialog-']")).toBeNull();
  });

  it("resolves undefined when the dialog closes itself via update:open", async () => {
    render(DialogSummonHost);
    const promise = summonDialog<string>(StubDialog, { label: "a" });
    await nextTick();

    await fireEvent.click(screen.getByTestId("close-a"));
    await expect(promise).resolves.toBeUndefined();
  });

  it("ignores settles after the first one", async () => {
    render(DialogSummonHost);
    const promise = summonDialog<string>(StubDialog, { label: "a" });
    await nextTick();

    await fireEvent.click(screen.getByTestId("ok-a"));
    dismissAllSummonedDialogs();
    await expect(promise).resolves.toBe("result-a");
  });

  it("dedupes by key while open and allows the key again after settling", async () => {
    render(DialogSummonHost);

    const first = summonDialog<string>(StubDialog, { label: "a" }, { key: "same" });
    const second = summonDialog<string>(StubDialog, { label: "b" }, { key: "same" });
    await nextTick();

    expect(first).toBe(second);
    expect(screen.getByTestId("dialog-a")).toBeInTheDocument();
    expect(screen.queryByTestId("dialog-b")).toBeNull();

    await fireEvent.click(screen.getByTestId("ok-a"));
    await settleRemovals();

    const third = summonDialog<string>(StubDialog, { label: "c" }, { key: "same" });
    await nextTick();
    expect(third).not.toBe(first);
    expect(screen.getByTestId("dialog-c")).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId("ok-c"));
  });

  it("stacks a dialog summoned from inside another dialog (modal in modal)", async () => {
    render(DialogSummonHost);
    const outer = summonDialog<string>(NestingDialog);
    await nextTick();

    await fireEvent.click(screen.getByTestId("open-inner"));
    await nextTick();

    // Both mounted at once, inner rendered after (above) the outer.
    const outerEl = screen.getByTestId("dialog-outer");
    const innerEl = screen.getByTestId("dialog-inner");
    expect(outerEl.compareDocumentPosition(innerEl) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();

    // Settling the inner returns control to the outer, which then resolves.
    await fireEvent.click(screen.getByTestId("ok-inner"));
    await expect(outer).resolves.toBe("outer got: result-inner");
  });

  it("dismissAllSummonedDialogs settles every open dialog with undefined", async () => {
    render(DialogSummonHost);
    const first = summonDialog<string>(StubDialog, { label: "a" });
    const second = summonDialog<string>(StubDialog, { label: "b" });
    await nextTick();

    dismissAllSummonedDialogs();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    await settleRemovals();
    expect(document.querySelector("[data-testid^='dialog-']")).toBeNull();
  });

  it("useSummonedDialog outside a summoned dialog throws", () => {
    const Naked = defineComponent({
      setup() {
        useSummonedDialog();
        return () => null;
      },
    });
    expect(() => render(Naked)).toThrow(/DialogSummonHost/);
  });
});
