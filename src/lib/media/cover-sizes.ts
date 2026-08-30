//
// Cover renditions requested from a source. Sizes are a property of the
// layout, not of any one source: local, Navidrome and YouTube covers all
// land in the same rows, cards and heroes.
//
// A leaf module with no imports, under @/lib rather than inside a source
// module, so nothing has to depend upward to ask for a size — the generic
// display bridges and the YouTube thumbnail helpers are peers here.
//

/** Hero/full-cover rendition (YT Music's standard album cover size). */
export const THUMB_SIZE_FULL = 544;
/** Card rendition (~144px cards on hidpi screens). */
export const THUMB_SIZE_CARD = 320;
/** List-row rendition — plenty for 40–56px covers on hidpi screens. */
export const THUMB_SIZE_ROW = 226;
/** Blur-up placeholder size: big enough for colors, cheap to fetch. */
export const THUMB_SIZE_LQ = 24;
