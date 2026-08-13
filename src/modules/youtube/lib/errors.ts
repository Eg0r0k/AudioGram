import type { ComposerTranslation } from "vue-i18n";
import type { YoutubeError } from "../types";

/**
 * Human message for a YouTube error, special-casing YouTube's bot check —
 * its raw message ("Sign in to confirm you're not a bot") confuses users.
 */
export function youtubeErrorMessage(error: YoutubeError, t: ComposerTranslation): string {
  const message = error.message;
  if (/not a bot|sign in to confirm/i.test(message)) return t("youtube.botError");
  return t("youtube.errorPrefix", { message });
}
