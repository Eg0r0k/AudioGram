interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

interface Window {
  documentPictureInPicture: DocumentPictureInPicture;
}
