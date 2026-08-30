import { describe, expect, it } from "vitest";
import { messages } from "@/app/i18n/messages";
import type { SourceKind } from "@/types/track-ref";
import { sourceUI } from "../source-ui";

const KINDS: SourceKind[] = ["local", "nd", "yt"];

const resolve = (bundle: object, key: string): unknown =>
  key.split(".").reduce<unknown>((node, segment) =>
    (node && typeof node === "object" ? (node as Record<string, unknown>)[segment] : undefined), bundle);

describe("sourceUI", () => {
  // A missing key is invisible to the type checker and renders as the raw
  // "source.local" string in the menu, so both bundles are pinned here.
  it.each(KINDS)("names %s in every locale", (kind) => {
    const { labelKey } = sourceUI(kind);

    for (const [locale, bundle] of Object.entries(messages)) {
      expect(resolve(bundle, labelKey), `${locale} is missing ${labelKey}`).toEqual(expect.any(String));
    }
  });

  it.each(KINDS)("gives %s an icon in both forms", (kind) => {
    const ui = sourceUI(kind);

    expect(ui.icon).toBeTruthy();
    expect(ui.iconRaw).toContain("<svg");
  });
});
