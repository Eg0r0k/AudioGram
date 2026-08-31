// https://github.com/morethanwords/tweb/blob/7ab66b6e1f33b984b62206dad2bafe2bd45e52d8/src/environment/userAgent.ts#L9

import { isTauri } from "@tauri-apps/api/core";

const ctx = typeof window !== "undefined" ? window : self;

export const USER_AGENT = navigator.userAgent;
export const IS_APPLE
  = navigator.userAgent.search(/OS X|iPhone|iPad|iOS/i) !== -1;
export const IS_ANDROID
  = navigator.userAgent.toLowerCase().indexOf("android") !== -1;
// Every Chromium engine (Chrome, Edge, Opera, WebView2) carries the Chrome
// token, and the old `navigator.vendor` check passed for all of them too.
export const IS_CHROMIUM = /Chrome/.test(navigator.userAgent);

// https://stackoverflow.com/a/58065241 — ported off the deprecated
// `navigator.platform`: iPadOS in desktop mode sends the Macintosh UA, so
// touch support is what separates it from a real Mac.
export const IS_APPLE_MOBILE
  = (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  && !(ctx as any).MSStream;

export const IS_SAFARI
  = !!("safari" in ctx)
    || !!(
      USER_AGENT
      && (/\b(iPad|iPhone|iPod)\b/.test(USER_AGENT)
        || (/Safari/.test(USER_AGENT) && !/Chrome/.test(USER_AGENT)))
    );
export const IS_FIREFOX
  = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

export const IS_MOBILE_SAFARI = IS_SAFARI && IS_APPLE_MOBILE;

export const IS_MOBILE
  = navigator.maxTouchPoints > 0
    && navigator.userAgent.search(
      /iOS|iPhone OS|Android|BlackBerry|BB10|Series ?[64]0|J2ME|MIDP|opera mini|opera mobi|mobi.+Gecko|Windows Phone/i,
    ) != -1;

export const IS_WINDOWS = /Windows/.test(navigator.userAgent);

export const IS_TAURI = isTauri();

export const IS_PWA = window.matchMedia("(display-mode: standalone)").matches;

export const IS_APP = IS_TAURI || IS_PWA;
