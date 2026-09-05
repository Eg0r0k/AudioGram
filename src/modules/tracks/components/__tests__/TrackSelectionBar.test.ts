import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import TrackSelectionBar from "../TrackSelectionBar.vue";

vi.mock("@/modules/tracks/components/menu/composables/usePlaylistMenu", async () => {
  const { computed, ref } = await import("vue");
  return {
    usePlaylistMenu: () => ({
      playlists: computed(() => [{ id: "pl-1", name: "Mix" }]),
      isLoading: ref(false),
      handleCreatePlaylist: vi.fn(),
    }),
  };
});

const stubs = {
  Motion: { template: "<div><slot /></div>" },
  DropdownMenu: { template: "<div><slot /></div>" },
  DropdownMenuTrigger: { template: "<div><slot /></div>" },
  DropdownMenuContent: { template: "<div><slot /></div>" },
  DropdownMenuItem: { template: "<button @click=\"$emit('select')\"><slot /></button>" },
  DropdownMenuSeparator: { template: "<hr />" },
  DropdownMenuLabel: { template: "<div><slot /></div>" },
};

const renderBar = (props: Partial<InstanceType<typeof TrackSelectionBar>["$props"]> = {}) =>
  render(TrackSelectionBar, {
    props: { count: 0, allSelected: false, allLiked: false, busy: false, selectingAll: false, ...props },
    global: { plugins: [i18n], stubs, directives: { ripple: {} } },
  });

describe("TrackSelectionBar", () => {
  it("shows the plural count", () => {
    i18n.global.locale.value = "en";
    renderBar({ count: 3 });
    expect(screen.getByText("3 tracks selected")).toBeInTheDocument();
  });

  it("disables every action while nothing is selected but keeps select-all enabled", () => {
    i18n.global.locale.value = "en";
    renderBar({ count: 0 });
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to queue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
  });

  it("emits each primary action", async () => {
    i18n.global.locale.value = "en";
    const user = userEvent.setup();
    const { emitted } = renderBar({ count: 2 });

    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Add to queue" }));
    await user.click(screen.getByRole("button", { name: "Add to favorites" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Exit selection" }));

    expect(emitted().play).toHaveLength(1);
    expect(emitted().addToQueue).toHaveLength(1);
    expect(emitted().toggleLike).toHaveLength(1);
    expect(emitted().delete).toHaveLength(1);
    expect(emitted().exit).toHaveLength(1);
  });

  it("toggles between select all and deselect all", async () => {
    i18n.global.locale.value = "en";
    const user = userEvent.setup();
    const { emitted, rerender } = renderBar({ count: 2, allSelected: false });

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(emitted().selectAll).toHaveLength(1);

    await rerender({ count: 10, allSelected: true, allLiked: false, busy: false, selectingAll: false });
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(emitted().deselectAll).toHaveLength(1);
  });

  it("labels the like button by allLiked and emits playlist and play-next from the menus", async () => {
    i18n.global.locale.value = "en";
    const user = userEvent.setup();
    const { emitted } = renderBar({ count: 2, allLiked: true });

    expect(screen.getByRole("button", { name: "Remove from favorites" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mix" }));
    await user.click(screen.getByRole("button", { name: "Play next" }));

    expect(emitted().addToPlaylist).toEqual([["pl-1"]]);
    expect(emitted().playNext).toHaveLength(1);
  });
});
