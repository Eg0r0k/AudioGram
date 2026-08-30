//
// Cover renditions requested from a source. Sizes are a property of the
// layout, not of any one source: local, Navidrome and YouTube covers all
// land in the same rows, cards and heroes. Kept in a leaf module with no
// imports so both the generic display bridges and the YouTube thumbnail
// helpers can depend on it without either owning the other.
//

/** Hero/full-cover rendition (YT Music's standard album cover size). */
export const THUMB_SIZE_FULL = 544;
/** Card rendition (~144px cards on hidpi screens). */
export const THUMB_SIZE_CARD = 320;
/** List-row rendition — plenty for 40–56px covers on hidpi screens. */
export const THUMB_SIZE_ROW = 226;
/** Blur-up placeholder size: big enough for colors, cheap to fetch. */
export const THUMB_SIZE_LQ = 24;
