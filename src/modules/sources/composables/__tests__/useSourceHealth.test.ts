import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceProvider } from "../../types";

const registry = vi.hoisted(() => ({ providers: [] as SourceProvider[] }));
vi.mock("../../registry", () => ({
  sources: { available: () => registry.providers },
}));

import {
  forgetSourceHealth,
  reportSourceError,
  reportSourceOk,
  sourceHealth,
} from "../../lib/health";
import { checkSource } from "../useSourceHealth";

const provider = (checkConnection?: SourceProvider["checkConnection"]): SourceProvider =>
  ({ id: "nd", checkConnection } as SourceProvider);

describe("source health", () => {
  beforeEach(() => {
    forgetSourceHealth();
    registry.providers = [];
  });

  it("starts out knowing nothing", () => {
    expect(sourceHealth("nd")).toEqual({ state: "unknown" });
  });

  it("blames the source only for failures that are about the source", () => {
    reportSourceError("nd", { kind: "NOT_FOUND", message: "no such album" });
    expect(sourceHealth("nd")).toEqual({ state: "unknown" });

    reportSourceError("nd", { kind: "AUTH", message: "wrong password" });
    expect(sourceHealth("nd")).toEqual({
      state: "failed",
      error: { kind: "AUTH", message: "wrong password" },
    });
  });

  it("clears the verdict as soon as something answers", () => {
    reportSourceError("nd", { kind: "NETWORK", message: "unreachable" });
    reportSourceOk("nd");
    expect(sourceHealth("nd")).toEqual({ state: "ok" });
  });

  it("records what the probe found", async () => {
    registry.providers = [provider(() => errAsync({ kind: "AUTH", message: "rejected" }))];

    await expect(checkSource("nd")).resolves.toEqual({
      state: "failed",
      error: { kind: "AUTH", message: "rejected" },
    });
    expect(sourceHealth("nd")).toEqual({
      state: "failed",
      error: { kind: "AUTH", message: "rejected" },
    });

    registry.providers = [provider(() => okAsync(undefined))];
    await checkSource("nd");
    expect(sourceHealth("nd")).toEqual({ state: "ok" });
  });

  it("forgets a source that is no longer configured instead of guessing", async () => {
    registry.providers = [provider(() => okAsync(undefined))];
    await checkSource("nd");

    registry.providers = [];
    await expect(checkSource("nd")).resolves.toEqual({ state: "unknown" });
    expect(sourceHealth("nd")).toEqual({ state: "unknown" });
  });

  it("leaves a source with no probe of its own unjudged", async () => {
    registry.providers = [provider()];

    await expect(checkSource("nd")).resolves.toEqual({ state: "unknown" });
    expect(sourceHealth("nd")).toEqual({ state: "unknown" });
  });
});
