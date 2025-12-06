const IS_TOUCH_SUPPORTED =
  "ontouchstart" in window ||
  // @ts-ignore
  (window.DocumentTouch && document instanceof DocumentTouch);
export default IS_TOUCH_SUPPORTED;
