/** Width to height of the Contacts photograph's window. */
export const EYES_WINDOW_ASPECT = 3.85;

/** Point-scene preset (spec §5.4). Same key schema as the reference presets. */
export type Preset = {
  particles: { count: number; countMobile: number; size: number; sizeRandom: number; sizeAttenuation: boolean; density: number; depthDensity: number };
  depth: { scale: number; curve: number; edgeCutoff: number; fade: number; occlusion: boolean };
  look: {
    colorMode: string; background: string; blending: string; brightness: number; dropout: number; jitter: number;
    scatter: number; spread: number; duoA: string; duoB: string;
  };
  morph: {
    word: string; hold: number; duration: number; stagger: number; order: string; ease: string; curlAmp: number;
    curlScale: number; curlSpeed: number; burst: number; swirl: number; zPush: number;
  };
  intro: {
    assemble: number; font: string; weight: number; tracking: number; size: number; order: string; front: number;
    mode: string; flight: number; spread: number; loose: number;
  };
  life: { move: number; rest: number; restless: number; speed: number; settle: number };
  photo: {
    enabled: boolean; delay: number; duration: number; blur: number; depthSoft: number; depthGrow: number; limit: number;
    grain: number; lens: number; lensSoftness: number; trail: number; rough: number;
  };
  camera: {
    fov: number; zoom: number; centerX: number; centerY: number; subjectX: number; limit: number; parallax: number; fit: string;
    focus: number; aperture: number; follow: number;
    flyToX: number; flyToY: number; flyToZoom: number;
  };
  eyesCrop: { centerX: number; centerY: number; spanX: number };
  interaction: { repelRadius: number; repelForce: number; repelDepth: number; glow: number };
  recede: { zoom: number; blur: number; parallax: number; limit: number };
};

/** Defaults = the reference hero preset, plus photo.depthGrow 1. */
const DEFAULTS: Preset = {
  particles: { count: 200000, countMobile: 60000, size: 0.5, sizeRandom: 0.4, sizeAttenuation: true, density: 1.5, depthDensity: 1.4 },
  depth: { scale: 0.16, curve: 1.01, edgeCutoff: 0.29, fade: 1, occlusion: true },
  look: {
    colorMode: 'mono-light', background: '#252525', blending: 'normal', brightness: 3.15, dropout: 0, jitter: 0,
    scatter: 0, spread: 2, duoA: '#1d2a6b', duoB: '#ffb46b',
  },
  morph: {
    word: 'Rifqi Setiawan', hold: 0.3, duration: 1.8, stagger: 0.58, order: 'near-first', ease: 'inOutSine', curlAmp: 0.3,
    curlScale: 0.9, curlSpeed: 0.4, burst: 0, swirl: 0.35, zPush: 0,
  },
  intro: {
    assemble: 1.6, font: '"Plus Jakarta Sans", system-ui, sans-serif', weight: 500, tracking: 0, size: 0.2, order: 'left-right', front: 0.93,
    mode: 'fly', flight: 1.6, spread: 1, loose: 0.06,
  },
  life: { move: 0.006, rest: 0.0015, restless: 0.2, speed: 0.35, settle: 2.5 },
  photo: {
    enabled: true, delay: -1.3, duration: 2, blur: 0, depthSoft: 0.45, depthGrow: 1, limit: 8,
    grain: 0.74, lens: 0.17, lensSoftness: 1, trail: 1.9, rough: 1,
  },
  camera: {
    fov: 10, zoom: 1.505, centerX: 0.5, centerY: 0.5, subjectX: 0.5, limit: 13, parallax: 1, fit: 'cover',
    focus: 0.8, aperture: 0.4, follow: 0.11,
    flyToX: 0.495, flyToY: 0.328, flyToZoom: 4.8,
  },
  eyesCrop: { centerX: 0.496, centerY: 0.365, spanX: 0.43 },
  interaction: { repelRadius: 0.11, repelForce: 0.037, repelDepth: 0.41, glow: 0 },
  recede: { zoom: 1, blur: 1.15, parallax: 1, limit: 7 },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fills every missing / wrongly-typed key from the defaults. Unknown keys are dropped. */
export function parsePreset(json: unknown): Preset {
  const src = isObj(json) ? json : {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [section, defs] of Object.entries(DEFAULTS) as [string, Record<string, unknown>][]) {
    const s = isObj(src[section]) ? (src[section] as Record<string, unknown>) : {};
    const sec: Record<string, unknown> = {};
    for (const [k, d] of Object.entries(defs)) {
      const v = s[k];
      sec[k] = typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v)) ? v : d;
    }
    out[section] = sec;
  }
  return out as unknown as Preset;
}
