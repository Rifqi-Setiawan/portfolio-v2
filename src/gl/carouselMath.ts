import type { Category, Project } from '../content/types';

/** Position on a cylinder tangent to the display plane at its centre. */
export function cardPose(i: number, offset: number, arc: { radius: number; spacing: number }) {
  const angle = (i - offset) * arc.spacing / arc.radius;
  const z = arc.radius * (Math.cos(angle) - 1);
  return { x: arc.radius * Math.sin(angle), y: 0, z, rotY: 0 - angle, depth: 1 - z / arc.radius };
}

export function blurPx(defocus: number): number {
  return Math.max(0, defocus * 40 - .04 * 40);
}

export function gridPose(i: number, cols: number, width: number, height: number, gap: number) {
  return { x: (i % cols) * (width + gap), y: Math.floor(i / cols) * (height + gap) };
}

export function filteredIndices(cards: Project[], category: Category | 'all'): number[] {
  return cards.flatMap((card, i) => category === 'all' || card.categories.includes(category) ? [i] : []);
}
