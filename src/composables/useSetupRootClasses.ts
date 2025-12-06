import {
  IS_ANDROID,
  IS_APPLE,
  IS_APPLE_MOBILE,
  IS_FIREFOX,
  IS_MOBILE,
  IS_SAFARI,
  IS_TAURI,
} from "@/helpers/environment/userAgent";

export const useSetupRootClasses = () => {
  const add: string[] = [];

  if (IS_TAURI) {
    add.push("is-tauri");
  }
  if (IS_FIREFOX) {
    add.push("is-firefox");
  }
  if (IS_MOBILE) {
    add.push("is-mobile");
  }
  if (IS_APPLE) {
    if (IS_SAFARI) {
      add.push("is-safari");
    }

    if (IS_APPLE_MOBILE) {
      add.push("is-ios");
    } else {
      add.push("is-mac");
    }
  } else if (IS_ANDROID) {
    add.push("is-android");
  }

  document.documentElement.classList.add(...add);
};
