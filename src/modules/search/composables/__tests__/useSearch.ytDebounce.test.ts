import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

vi.mock("../../searchIndex", () => ({
  initSearchIndex: vi.fn(async () => {}),
  rebuildSearchIndex: vi.fn(async () => {}),
  searchDocuments: vi.fn(async () => ({ results: [], total: 0, totalDuration: 0 })),
}));

import { useSearch } from "../useSearch";

//
// YouTube search auto-commits after a typing pause — Enter is a shortcut
// for "commit now + save to history", not a requirement. Intermediate
// debounced commits must NOT pollute the recent-queries history.
//

describe("useSearch — debounced YouTube auto-commit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const search = useSearch();
    search.clear();
    search.clearHistory();
    search.setSource("library");
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it("commits the query after the debounce pause without Enter", async () => {
    const search = useSearch();
    search.setSource("youtube");

    search.query.value = "lofi beats";
    await nextTick();
    expect(search.submittedYtQuery.value).toBe("");

    await vi.advanceTimersByTimeAsync(500);
    expect(search.submittedYtQuery.value).toBe("lofi beats");
    // Auto-commits never write history — only explicit submits do.
    expect(search.recentQueries.value).toEqual([]);
  });

  it("only the last value within the pause is committed", async () => {
    const search = useSearch();
    search.setSource("youtube");

    search.query.value = "lo";
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    search.query.value = "lofi";
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    search.query.value = "lofi beats";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);

    expect(search.submittedYtQuery.value).toBe("lofi beats");
  });

  it("clearing the query resets the committed one immediately", async () => {
    const search = useSearch();
    search.setSource("youtube");

    search.query.value = "lofi";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(search.submittedYtQuery.value).toBe("lofi");

    search.query.value = "   ";
    await nextTick();
    expect(search.submittedYtQuery.value).toBe("");
  });

  it("does not auto-commit while another source is active", async () => {
    const search = useSearch();
    search.setSource("library");

    search.query.value = "local song";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);

    expect(search.submittedYtQuery.value).toBe("");
  });

  it("explicit submit still commits instantly and records history", async () => {
    const search = useSearch();
    search.setSource("youtube");

    search.query.value = "lofi beats";
    await nextTick();
    search.submitYtSearch();

    expect(search.submittedYtQuery.value).toBe("lofi beats");
    expect(search.recentQueries.value).toEqual(["lofi beats"]);
  });
});
