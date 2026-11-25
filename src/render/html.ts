const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use in HTML content or a quoted attribute. */
export const h = (s: string | number): string => String(s).replace(/[&<>"']/g, (c) => MAP[c]);
