import { onScopeDispose } from "vue";
import { useRightPanelStore } from "../store/right-panel.store";

/**
 * Registers the calling panel's own UI back handler as the right panel's
 * back-step delegate, so hardware back runs the exact same code path as the
 * panel's back button (unsaved-changes guards, payload onDone chains, ...).
 * Unregisters with the panel's scope; the store's identity guard keeps a
 * newly mounted panel's delegate intact while the old panel animates out.
 */
export const usePanelUiBack = (delegate: () => void): void => {
  const rightPanel = useRightPanelStore();
  rightPanel.setUiBackDelegate(delegate);
  onScopeDispose(() => rightPanel.clearUiBackDelegate(delegate));
};
