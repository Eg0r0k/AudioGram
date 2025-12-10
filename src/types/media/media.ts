export const AUDIO_MIME_TYPES = {
  // Formats
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "ogg": "audio/ogg",
  "flac": "audio/flac",
  "aac": "audio/aac",
  "m4a": "audio/mp4",
  "webm": "audio/webm",
  "opus": "audio/opus",

  // Codecs
  "ogg-vorbis": "audio/ogg; codecs=\"vorbis\"",
  "ogg-opus": "audio/ogg; codecs=\"opus\"",
  "webm-opus": "audio/webm; codecs=\"opus\"",
  "webm-vorbis": "audio/webm; codecs=\"vorbis\"",
  "mp4-aac": "audio/mp4; codecs=\"mp4a.40.2\"",
  "mp4-flac": "audio/mp4; codecs=\"flac\"",
} as const;

export type AudioMimeKey = keyof typeof AUDIO_MIME_TYPES;
export type AudioMimeType = typeof AUDIO_MIME_TYPES[AudioMimeKey];

export const IMAGE_MIME_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
} as const;

export type ImageMimeKey = keyof typeof IMAGE_MIME_TYPES;
export type ImageMimeType = typeof IMAGE_MIME_TYPES[ImageMimeKey];

export const ALL_MIME_TYPES = {
  ...AUDIO_MIME_TYPES,
  ...IMAGE_MIME_TYPES,
};

export type MediaCategory = "audio" | "video" | "image";

export type SupportLevel = "probably" | "maybe" | "" | boolean;

export interface MimeSupport {
  mimeType: string;
  supported: boolean;
  level: SupportLevel;
}

export interface MediaSupportMap {
  audio: Record<AudioMimeKey, MimeSupport>;
  image: Record<ImageMimeKey, MimeSupport>;
}
