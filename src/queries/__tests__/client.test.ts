import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { queryClient } from "../client";

/**
 * The retry policy is a plain function on the client's defaults; pulling it
 * back out keeps the test on the real configuration rather than a copy.
 */
const retryOption = queryClient.getDefaultOptions().queries?.retry;
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (typeof retryOption !== "function") {
    throw new TypeError("expected a retry predicate on the query defaults");
  }
  return retryOption(failureCount, error as Error) as boolean;
};

describe("query network mode", () => {
  it("runs local reads regardless of the browser's online state", () => {
    // Dexie is not behind the network: with the library default ("online")
    // every query pauses the moment navigator.onLine turns false.
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBe("always");
  });
});

describe("query retry policy", () => {
  it("retries a transient source failure up to twice", () => {
    const error = { kind: "NETWORK", message: "socket hang up" };

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(false);
  });

  it("retries source errors that a repeat could actually fix", () => {
    expect(shouldRetry(0, { kind: "NETWORK", message: "offline" })).toBe(true);
    expect(shouldRetry(0, { kind: "UNAVAILABLE", message: "502" })).toBe(true);
    expect(shouldRetry(0, { kind: "UNKNOWN", message: "?" })).toBe(true);
  });

  it("gives up immediately on failures a repeat cannot change", () => {
    // One incident produced 52 identical log lines because each of these was
    // retried the full two times.
    expect(shouldRetry(0, { kind: "PARSE", message: "Invalid JSON" })).toBe(false);
    expect(shouldRetry(0, { kind: "AUTH", message: "denied" })).toBe(false);
    expect(shouldRetry(0, { kind: "NOT_FOUND", message: "gone" })).toBe(false);
    expect(shouldRetry(0, { kind: "CANCELLED", message: "aborted" })).toBe(false);
  });

  // Everything that is not a source error comes from Dexie, and a Dexie read
  // is deterministic: "Album not found" or a full quota answer the same way
  // three seconds later — the page just shows its error state late.
  it("never retries a failure that is not a source error", () => {
    expect(shouldRetry(0, new Error("Album not found"))).toBe(false);
    expect(shouldRetry(0, { code: "QUOTA", message: "Storage quota exceeded" })).toBe(false);
    expect(shouldRetry(0, null)).toBe(false);
    expect(shouldRetry(0, "PARSE")).toBe(false);
  });
});
