import type { RightPanelBackView, RightPanelView } from "../types";

export const panelBackDepth = (
  isOpen: boolean,
  view: RightPanelView,
  returnToView: RightPanelBackView,
): number => {
  if (!isOpen) return 0;
  switch (view) {
    case "entity-select":
      return 3;
    case "edit-track":
      return 2;
    default:
      return returnToView === "queue" ? 2 : 1;
  }
};
