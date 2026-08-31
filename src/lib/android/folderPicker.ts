/**
 * Android folder selection for watched folders.
 *
 * tauri-plugin-dialog cannot pick directories on mobile, so MainActivity
 * exposes a SAF `ACTION_OPEN_DOCUMENT_TREE` launcher over an
 * `addJavascriptInterface` bridge (`window.AudiogramFolderPicker`) — the same
 * idiom as the media-session bridge. The result comes back as a CustomEvent
 * carrying the picked tree URI, correlated by request id.
 *
 * The tree URI itself is only used as a *picker result*: for the primary
 * external volume it converts to a real filesystem path
 * (`/storage/emulated/0/…`), which the whole path-based watched-folders
 * pipeline (scanner, fingerprints, media server) consumes unchanged — audio
 * under any public folder is readable by direct path once READ_MEDIA_AUDIO
 * is granted. Non-primary volumes (SD card, USB: `XXXX-XXXX:`) have no
 * reliable path mapping and are rejected by {@link treeUriToPath}.
 */

export const FOLDER_PICKED_EVENT = "audiogram-folder-picked";

interface FolderPickedDetail {
  requestId?: string;
  uri?: string | null;
}

declare global {
  interface Window {
    AudiogramFolderPicker?: {
      pick: (requestId: string) => void;
    };
  }
}

export const isAndroidFolderPickerAvailable = (): boolean =>
  typeof window !== "undefined" && typeof window.AudiogramFolderPicker?.pick === "function";

/**
 * Opens the system folder picker. Resolves with the picked tree URI, or
 * `null` when the user cancels, the bridge is missing, or launching fails.
 */
export const pickAndroidFolderTreeUri = (): Promise<string | null> => {
  const bridge = window.AudiogramFolderPicker;
  if (typeof bridge?.pick !== "function") return Promise.resolve(null);

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const onPicked = (event: Event) => {
      const detail = (event as CustomEvent<FolderPickedDetail | null>).detail;
      if (!detail || detail.requestId !== requestId) return;
      window.removeEventListener(FOLDER_PICKED_EVENT, onPicked);
      resolve(typeof detail.uri === "string" && detail.uri.length > 0 ? detail.uri : null);
    };
    window.addEventListener(FOLDER_PICKED_EVENT, onPicked);
    try {
      bridge.pick(requestId);
    }
    catch {
      window.removeEventListener(FOLDER_PICKED_EVENT, onPicked);
      resolve(null);
    }
  });
};

const TREE_URI_PREFIX = "content://com.android.externalstorage.documents/tree/";
const PRIMARY_VOLUME = "primary";
const PRIMARY_MOUNT = "/storage/emulated/0";

/**
 * Converts a SAF tree URI on the primary external volume to its real
 * filesystem path. Returns `null` for anything else — other volumes, other
 * document providers, malformed input.
 */
export const treeUriToPath = (uri: string): string | null => {
  if (!uri.startsWith(TREE_URI_PREFIX)) return null;

  // A plain picker result is `…/tree/<docId>`; URIs extended via
  // buildDocumentUriUsingTree carry `/document/<docId>` after it — the tree
  // segment alone identifies the granted folder.
  const encodedDocId = uri.slice(TREE_URI_PREFIX.length).split("/")[0];
  if (!encodedDocId) return null;

  let docId: string;
  try {
    docId = decodeURIComponent(encodedDocId);
  }
  catch {
    return null;
  }

  const separator = docId.indexOf(":");
  if (separator === -1) return null;

  const volume = docId.slice(0, separator);
  if (volume !== PRIMARY_VOLUME) return null;

  let relative = docId.slice(separator + 1);
  while (relative.endsWith("/")) relative = relative.slice(0, -1);
  if (relative.includes("..")) return null;
  return relative ? `${PRIMARY_MOUNT}/${relative}` : PRIMARY_MOUNT;
};
