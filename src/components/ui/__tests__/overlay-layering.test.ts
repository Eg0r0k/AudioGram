import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import dropdownContent from "@/components/ui/dropdown-menu/DropdownMenuContent.vue?raw";
import dropdownSubContent from "@/components/ui/dropdown-menu/DropdownMenuSubContent.vue?raw";
import contextContent from "@/components/ui/context-menu/ContextMenuContent.vue?raw";
import contextSubContent from "@/components/ui/context-menu/ContextMenuSubContent.vue?raw";
import dialogContent from "@/components/ui/dialog/DialogContent.vue?raw";
import dialogOverlay from "@/components/ui/dialog/DialogOverlay.vue?raw";
import dialogScrollContent from "@/components/ui/dialog/DialogScrollContent.vue?raw";

//
// Menus and dialogs used to share z-50, so which one covered the other was
// decided by portal order. A dialog opened from a menu item landed under the
// menu's full-screen scrim: its buttons stayed reachable by keyboard, but
// every tap hit the scrim, which merely dismissed the dialog. Neither
// component can show that on its own, so the invariant lives here.
//

// vitest stubs CSS imports to an empty string, so the tokens are read off disk
// rather than through the bundler.
const css = readFileSync("src/style.css", "utf8");

const tokenValue = (name: string): number => {
  const match = new RegExp(`--${name}:\\s*(\\d+)`).exec(css);
  if (!match) throw new Error(`token --${name} not found in style.css`);
  return Number(match[1]);
};

const BARE_Z_50 = /(?<![\w-])z-50(?![\w-])/;

describe("overlay layering", () => {
  it("puts dialogs above menus", () => {
    expect(tokenValue("z-dialog")).toBeGreaterThan(tokenValue("z-menu"));
  });

  it("keeps dialogs below the toolbar and fullscreen layers", () => {
    const dialog = tokenValue("z-dialog");
    expect(dialog).toBeLessThan(tokenValue("z-toolbar"));
    expect(dialog).toBeLessThan(tokenValue("z-fullscreen"));
  });

  it.each([
    ["DropdownMenuContent", dropdownContent],
    ["DropdownMenuSubContent", dropdownSubContent],
    ["ContextMenuContent", contextContent],
    ["ContextMenuSubContent", contextSubContent],
  ])("%s sits on the menu tier", (_name, source) => {
    expect(source).toContain("z-(--z-menu)");
    // A bare z-50 would silently rejoin the tier the dialog uses.
    expect(source).not.toMatch(BARE_Z_50);
  });

  it.each([
    ["DialogContent", dialogContent],
    ["DialogOverlay", dialogOverlay],
    ["DialogScrollContent", dialogScrollContent],
  ])("%s sits on the dialog tier", (_name, source) => {
    expect(source).toContain("z-(--z-dialog)");
    expect(source).not.toMatch(BARE_Z_50);
  });
});
