import { ref } from "vue";
import { BrowserInfo, detectBrowser } from "../helpers/detectBrowser";

interface TabInfo {
  id: string;
  browser: BrowserInfo;
  timestamp: number;
  isPlaying: boolean;
}

export const hasOtherTabs = ref(false);
export const isPlayingElsewhere = ref(false);
export const playingTab = ref<TabInfo | null>(null);
export const otherTabs = ref<TabInfo[]>([]);

let channel: BroadcastChannel | null = null;
const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const BROWSER_INFO = detectBrowser();

interface BroadcastMessage {
  type: "ping" | "pong" | "playing" | "stop" | "close";
  tab: TabInfo;
}

const tabsMap = new Map<string, TabInfo>();

const getCurrentTabInfo = (isPlaying = false): TabInfo => ({
  id: TAB_ID,
  browser: BROWSER_INFO,
  timestamp: Date.now(),
  isPlaying,
});

const updateState = () => {
  const tabs = Array.from(tabsMap.values());
  otherTabs.value = tabs;
  hasOtherTabs.value = tabs.length > 0;

  const playing = tabs.find((t) => t.isPlaying);
  isPlayingElsewhere.value = !!playing;
  playingTab.value = playing || null;
};

const broadcast = (type: BroadcastMessage["type"], isPlaying = false) => {
  channel?.postMessage({
    type,
    tab: getCurrentTabInfo(isPlaying),
  } satisfies BroadcastMessage);
};

const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
  const { type, tab } = event.data;
  if (tab.id === TAB_ID) return;

  console.log(`[TabSync] Received: ${type} from ${tab.browser.name}`);

  switch (type) {
    case "ping":
      broadcast("pong");
      tabsMap.set(tab.id, tab);
      break;

    case "pong":
      tabsMap.set(tab.id, tab);
      break;

    case "playing":
      tab.isPlaying = true;
      tabsMap.set(tab.id, tab);
      break;

    case "stop":
      const existing = tabsMap.get(tab.id);
      if (existing) {
        existing.isPlaying = false;
        tabsMap.set(tab.id, existing);
      }
      break;

    case "close":
      tabsMap.delete(tab.id);
      break;
  }

  updateState();
};

export function initTabSync() {
  if (channel) return;

  console.log(
    `[TabSync] Init with ID: ${TAB_ID}, Browser: ${BROWSER_INFO.name}`
  );

  channel = new BroadcastChannel("audiogram-tabs");
  channel.addEventListener("message", handleMessage);

  broadcast("ping");

  setInterval(() => {
    const now = Date.now();
    let changed = false;

    tabsMap.forEach((tab, id) => {
      if (now - tab.timestamp > 10000) {
        tabsMap.delete(id);
        changed = true;
      }
    });

    if (changed) updateState();
    broadcast("ping");
  }, 3000);

  window.addEventListener("beforeunload", () => {
    broadcast("close");
  });
}

export function notifyPlaying() {
  broadcast("playing", true);
}

export function notifyStop() {
  broadcast("stop", false);
}
