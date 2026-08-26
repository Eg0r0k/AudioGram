import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useSelection } from "../useSelection";

interface Row {
  id: string;
}

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `t${i}` }));

// Counts element reads so the test can tell whether the list was walked.
const countingList = (rows: Row[]) => {
  const stats = { reads: 0 };
  const proxy = new Proxy(rows, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) stats.reads++;
      return Reflect.get(target, key, receiver);
    },
  });
  return { proxy, stats };
};

describe("useSelection — pruning on list change", () => {
  it("does not walk the list when nothing is selected", async () => {
    const first = countingList(makeRows(5_000));
    const items = ref<Row[]>(first.proxy);
    useSelection(items);

    const second = countingList(makeRows(5_000));
    items.value = second.proxy;
    await nextTick();

    expect(first.stats.reads).toBe(0);
    expect(second.stats.reads).toBe(0);
  });

  it("drops selected ids that left the list and keeps the rest", async () => {
    const items = ref<Row[]>(makeRows(10));
    const selection = useSelection(items);
    selection.toggleById("t1");
    selection.toggleById("t5");

    items.value = makeRows(10).filter(row => row.id !== "t5");
    await nextTick();

    expect([...selection.selectedIds.value]).toEqual(["t1"]);
  });

  it("forgets the range anchor once its row is gone", async () => {
    const items = ref<Row[]>(makeRows(10));
    const selection = useSelection(items);
    selection.toggleById("t3");

    items.value = makeRows(10).filter(row => row.id !== "t3");
    await nextTick();
    // With the anchor gone, shift-selecting must not extend from a vanished row.
    selection.selectRange("t3", "t7");

    expect(selection.selectedCount.value).toBe(0);
  });

  it("reacts to in-place removal, not only to a replaced array", async () => {
    const items = ref<Row[]>(makeRows(10));
    const selection = useSelection(items);
    selection.toggleById("t9");

    items.value.pop();
    await nextTick();

    expect(selection.selectedCount.value).toBe(0);
  });
});
