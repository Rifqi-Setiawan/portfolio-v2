export function gooParams(liquid: number, fontSizePx: number): { blur: number; amp: number; off: number } {
  const blur = fontSizePx * .04 * liquid;
  const amp = 1 + 7 * liquid;
  return { blur, amp, off: .5 - .42 * amp };
}

/** The SVG alpha transform sampled at each possible 8-bit coverage. Keep the
 * clear padding clear, and use the native sharp glyph at the settled endpoint. */
export function gooAlphaTable(liquid: number): Uint8ClampedArray {
  const { amp, off } = gooParams(liquid, 0);
  const table = new Uint8ClampedArray(256);
  for (let i = 1; i < table.length; i++) table[i] = liquid === 0 ? i : amp * i + 255 * off;
  return table;
}
