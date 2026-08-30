import type { ComposerTranslation } from "vue-i18n";
import type { SourceError } from "@/types/source-dto";
import type { YoutubeError } from "../types";

/**
 * Human message for a YouTube error, special-casing YouTube's bot check —
 * its raw message ("Sign in to confirm you're not a bot") confuses users.
 * Takes anything carrying a message: by the time a search failure reaches a
 * pane it has usually been through the source boundary and is a
 * SourceQueryError.
 */
export function youtubeErrorMessage(error: { message: string }, t: ComposerTranslation): string {
  const message = error.message;
  if (/not a bot|sign in to confirm/i.test(message)) return t("youtube.botError");
  return t("youtube.errorPrefix", { message });
}

/**
 * YouTube's error vocabulary in the generic one, so a YT failure reads the
 * same as any other source's wherever the shared layer handles it (health
 * verdicts, retry policy). Lives here because the vocabulary being
 * translated is this module's.
 */
export function ytErrorToSource(error: YoutubeError): SourceError {
  switch (error.kind) {
    case "UNAVAILABLE":
    case "UNAVAILABLE_REGION":
      return { kind: "UNAVAILABLE", message: error.message };
    case "NETWORK":
      return { kind: "NETWORK", message: error.message };
    case "NOT_FOUND":
      return { kind: "NOT_FOUND", message: error.message };
    case "CANCELLED":
      // The generic contract (sources/types.ts) marks a cancelled
      // downloadToFile with kind "CANCELLED" — the download manager matches
      // on it to drop the job instead of retrying it.
      return { kind: "CANCELLED", message: error.message };
    default:
      return { kind: "UNKNOWN", message: error.message };
  }
}
