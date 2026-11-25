import type { Preset } from '../gl/preset';

export const SD = { out: .3, in: .55, stagger: .016, rise: .45, blur: .3 };
export const NM = { duration: 1, stagger: .08, headerAt: .2, scrollAt: .6 };
export const INTRO = { nameHold: 1.2, nameExitPhotoFraction: .75 };
export const PM = { heroPortfolio: 1.45, casePortfolio: 1.3, aboutPortfolio: 1.3 };
export const T1 = { cardStart: SD.out, controlsAt: 1 };
export const YD = { grow: 26, growNarrow: 17, open: .9, captionAt: .2, glide: 'power3.inOut' };
export const LM = { speed: 1.2, pullBack: .8, overlap: .08, cut: .3, flyThrough: 1.1, flyBack: 1.2, aboutLeave: 1.5 };
export const XU = { split: .78, shift: 165, shiftY: 34, edgeSoft: 800, edgeRough: 300 };
const pullAt = SD.out + SD.rise;
const flyAt = pullAt + SD.in;
const mediumAt = flyAt + SD.out;
const faceAt = flyAt + YD.open;
const splitAt = faceAt + LM.flyThrough;
const aboutTextAt = splitAt + SD.rise + SD.stagger;
export const PORTRAIT = {
  collapseAt: SD.out, pullAt, flyAt, mediumAt, leaveMediumAt: mediumAt + SD.out / 2, faceAt,
  focusDuration: LM.cut,
  portfolioPullAt: SD.in + SD.rise,
  workRoomAt: SD.out + SD.in,
  splitAt, splitDuration: SD.rise, aboutTextAt, aboutEnd: aboutTextAt + SD.in,
  contactsAt: faceAt + SD.rise, frameDuration: LM.pullBack, cornersAt: SD.rise,
  linksAt: LM.pullBack, formAt: LM.pullBack + SD.out,
};
// Fractions of the viewport height, shared by the About scene and its CSS still.
export const MOBILE_ABOUT = { portraitHeight: .75, panelStart: .56, pointFadeEnd: .72 };
export const OD = { fade: 1.6, stagger: .07, slide: 1.1, block: 3.2 };
export const DU = { follow: 30, glide: 7, fling: .3, give: .35 };
export const SCROLL = { follow: 7 };
export const TRAIL = { hero: 1.9, about: 2 };
export const GOO_EASE = '0.25,1,0.5,1';
export const LOAD_TIMEOUT = 8;
export const WARMUP = { sliceMs: 4, pointerIdleMs: 500 };
export const QUALITY = { firstWindowMs: 1000, responseFrames: 30 };
export const MOVE_SETTLE = .12;
export const CAROUSEL = { captionIn: .8, flip: SD.in, wheelQuiet: MOVE_SETTLE };
export const CONTACTS = { clockRefresh: 30, aboutHold: SD.rise, photoShrink: SD.rise, photoToInk: SD.out, eyesExpandAt: SD.out / 2 };
export const NAV_COLOR = .5;
export const ENTRY = { loader: 1.2, portfolioMorph: 2.38, portfolioPhotoAt: 1.08, portfolioPhoto: 2 };

export function introTiming(preset: Preset) {
  const dustStart = INTRO.nameHold;
  const morphStart = Math.max(preset.intro.assemble, preset.intro.flight, dustStart + SD.in);
  const morphDuration = preset.morph.duration + preset.morph.stagger;
  const portraitStart = morphStart + morphDuration;
  const photoStart = portraitStart + preset.photo.delay;
  const nameOut = photoStart + preset.photo.duration * INTRO.nameExitPhotoFraction;
  const textStart = nameOut + SD.out;
  return {
    dustStart, morphStart, morphDuration, portraitStart, photoStart, photoDuration: preset.photo.duration,
    nameOut, textStart, headerStart: textStart + NM.headerAt, scrollStart: textStart + NM.scrollAt,
  };
}
