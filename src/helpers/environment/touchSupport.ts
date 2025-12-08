const IS_TOUCH_SUPPORTED
  = "ontouchstart" in window
  // @ts-expect-error not typeble
    || (window.DocumentTouch && document instanceof DocumentTouch);
export default IS_TOUCH_SUPPORTED;
