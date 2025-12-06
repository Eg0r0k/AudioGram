//https://github.com/morethanwords/tweb/blob/7ab66b6e1f33b984b62206dad2bafe2bd45e52d8/src/environment/userAgent.ts#L9

import { isTauri } from "@tauri-apps/api/core";

const ctx = typeof window !== "undefined" ? window : self;

export const USER_AGENT = navigator ? navigator.userAgent : null;
export const IS_APPLE =
  navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) !== -1;
export const IS_ANDROID =
  navigator.userAgent.toLowerCase().indexOf("android") !== -1;
export const IS_CHROMIUM =
  /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);

// https://stackoverflow.com/a/58065241
export const IS_APPLE_MOBILE =
  (/iPad|iPhone|iPod/.test(navigator.platform) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
  !(ctx as any).MSStream;

export const IS_SAFARI =
  !!("safari" in ctx) ||
  !!(
    USER_AGENT &&
    (/\b(iPad|iPhone|iPod)\b/.test(USER_AGENT) ||
      (!!USER_AGENT.match("Safari") && !USER_AGENT.match("Chrome")))
  );
export const IS_FIREFOX =
  navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

export const IS_MOBILE_SAFARI = IS_SAFARI && IS_APPLE_MOBILE;

export const IS_MOBILE =
  (navigator.maxTouchPoints === undefined || navigator.maxTouchPoints > 0) &&
  navigator.userAgent.search(
    /iOS|iPhone OS|Android|BlackBerry|BB10|Series ?[64]0|J2ME|MIDP|opera mini|opera mobi|mobi.+Gecko|Windows Phone/i
  ) != -1;

export const IS_TAURI = isTauri();
