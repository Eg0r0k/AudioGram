declare global {
  interface Window {
    /** Injected by MainActivity (SplashBridge) in the Android WebView. */
    AudiogramSplash?: { hide: () => void };
  }
}

/**
 * Ends the Android launch splash. Called once the first route has rendered;
 * a no-op everywhere else. The native side also drops the splash on its own
 * after a few seconds, so a failure here only costs that delay.
 */
export const hideAndroidSplash = (): void => {
  window.AudiogramSplash?.hide();
};
