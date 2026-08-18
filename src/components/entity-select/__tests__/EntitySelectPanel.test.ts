import { render, fireEvent } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { i18n } from "@/app/i18n";
import EntitySelectPanel from "../EntitySelectPanel.vue";

const VirtualScrollableStub = {
  props: ["items"],
  template: `
    <div>
      <template v-if="items.length">
        <div v-for="(item, index) in items" :key="index">
          <slot :item="item" :index="index" />
        </div>
      </template>
      <slot v-else name="empty" />
    </div>`,
};

const stubs = {
  RightPanelHeader: true,
  VirtualScrollable: VirtualScrollableStub,
  AddFloatingButton: {
    props: ["count", "show"],
    emits: ["click"],
    template: `<button v-if="show" data-testid="fab" @click="$emit('click')">{{ count }}</button>`,
  },
};

const renderPanel = (props: Record<string, unknown> = {}) =>
  render(EntitySelectPanel, {
    props: {
      title: "T",
      items: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
      getKey: (item: { id: string }) => item.id,
      search: "",
      ...props,
    },
    slots: { row: `<template #row="{ item }"><span data-testid="row">{{ item.name }}</span></template>` },
    global: { plugins: [i18n], stubs },
  });

describe("EntitySelectPanel", () => {
  it("renders rows through the #row slot", () => {
    const { getAllByTestId } = renderPanel();
    expect(getAllByTestId("row")).toHaveLength(2);
  });

  it("emits update:search on typing", async () => {
    const { container, emitted } = renderPanel();
    const input = container.querySelector("input")!;
    await fireEvent.update(input, "abc");
    expect(emitted("update:search")?.at(-1)).toEqual(["abc"]);
  });

  it("shows the create row only when canCreate and search is non-empty, click emits create", async () => {
    const { queryByTestId, getByTestId, emitted, rerender } = renderPanel({ canCreate: true, search: "" });
    expect(queryByTestId("create-row")).toBeNull();
    await rerender({ canCreate: true, search: "  New  Name " });
    await fireEvent.click(getByTestId("create-row"));
    expect(emitted("create")?.[0]).toEqual(["New Name"]);
  });

  it("FAB is hidden at confirmCount 0 and emits confirm on click otherwise", async () => {
    const { queryByTestId, getByTestId, emitted, rerender } = renderPanel({ confirmCount: 0 });
    expect(queryByTestId("fab")).toBeNull();
    await rerender({ confirmCount: 3 });
    await fireEvent.click(getByTestId("fab"));
    expect(emitted("confirm")).toHaveLength(1);
  });
});
