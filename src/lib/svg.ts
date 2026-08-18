// Pulls the path data out of svg markup (a ?raw icon import). Needed for
// morphicons when a glyph is fill-drawn: svgToIcon rejects those, but a raw
// `d` string is accepted as-is — the fill is then restored with CSS.
export const svgPathData = (svg: string) => /\sd="([^"]+)"/.exec(svg)?.[1] ?? "";
