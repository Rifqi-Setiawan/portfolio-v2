import gsap from 'gsap';
import type { Director } from '../core/director';
import { sameState, type State } from '../core/routes';
import { CONTACTS, LM, PORTRAIT, SD } from '../core/timings';
import { gooIn, gooOut } from '../fx/goo';
import { hideAbout, revealAbout } from './about';
import { flyToHero, flyToPortfolio, flyToPortrait, fullPortraitMotion, leaveWork, portrait, type LoadScene, type SelectScene } from './portraitFlight';
import type { EyesCrop, PointScene } from '../gl/pointScene';
import type { Carousel } from '../gl/carousel';
import '../styles/contact-transition.css';

export function registerContactTransitions(
  director: Director, prepareBackdrop: (state: State) => Promise<void>, loadScene: LoadScene, selectScene: SelectScene,
  getCarousel: () => Carousel,
) {
  const root = document.documentElement;
  const panel = document.querySelector<HTMLElement>('main > .contacts')!;
  const links = Array.from(panel.querySelectorAll<HTMLElement>('.contacts__liquid'));
  const frame = panel.querySelector<HTMLElement>('.contacts__portrait')!;
  const photo = panel.querySelector<HTMLElement>('.contacts__photo')!;
  const portraitImage = new Image();
  portraitImage.alt = '';
  portraitImage.decoding = 'async';
  photo.append(portraitImage);
  const eyes = frame.querySelector<HTMLCanvasElement>('canvas.contacts__eyes')!;
  const tone = document.createElement('canvas');
  tone.className = 'contacts__tone';
  frame.prepend(tone);
  const corners = frame.querySelector<HTMLElement>('.contacts__corners')!;
  const details = Array.from(panel.querySelectorAll<HTMLElement>('.contacts__meta, .contacts__form, .contacts__legal'));
  const scroller = document.querySelector<HTMLElement>('.about__scroll')!;
  let readingPosition = 0;
  panel.tabIndex = -1;
  let backdrop: State | undefined;
  let underlay: HTMLElement | undefined;
  let previouslyInert = false;
  let returnFocus: HTMLElement | undefined;
  let active: gsap.core.Timeline | undefined;

  function releaseUnderlay() {
    if (!underlay) return;
    underlay.removeAttribute('data-contact-underlay');
    underlay.inert = previouslyInert;
    underlay = undefined;
  }

  function setUnderlay(state: State) {
    releaseUnderlay();
    backdrop = state;
    underlay = document.querySelector<HTMLElement>(`main > .${state.kind}`)!;
    previouslyInert = underlay.inert;
    underlay.setAttribute('data-contact-underlay', '');
    underlay.inert = true;
    root.classList.add('is-contact-overlay');
  }

  function showSurface(tl: gsap.core.Timeline, at: number) {
    tl.set(panel, { visibility: 'visible', opacity: 1 }, at);
    tl.call(() => root.classList.add('has-contact-surface'), [], at);
  }

  function moveWindowPhoto(tl: gsap.core.Timeline, crop: EyesCrop, at: number, expanding = false) {
    const box = frame.getBoundingClientRect();
    const width = panel.clientWidth, height = panel.clientHeight;
    const cover = Math.max(width, height * crop.imageAspect);
    const band = box.width / crop.spanX;
    const x = box.left + box.width / 2 - crop.centerX * band;
    const y = box.top + box.height / 2 - crop.centerY * band / crop.imageAspect;
    if (portraitImage.getAttribute('src') !== crop.photo) portraitImage.src = crop.photo;
    const fullClip = 'inset(0px 0px 0px 0px)';
    const frameClip = `inset(${box.top}px ${width - box.right}px ${height - box.bottom}px ${box.left}px)`;
    const full = { x: (width - cover) / 2, y: (height - cover / crop.imageAspect) / 2, scale: 1 };
    const framed = { x, y, scale: band / cover };
    // Transform a retained photo under its aperture. Resizing a CSS background
    // here would repaint the full-colour portrait on every tick of the zoom.
    gsap.set(portraitImage, { width: cover, height: cover / crop.imageAspect });
    const moveAt = expanding ? at + CONTACTS.photoToInk : at;
    const motion = { duration: CONTACTS.photoShrink, ease: 'sine.inOut', immediateRender: false };
    tl.set(photo, { visibility: 'visible', opacity: expanding ? 0 : 1, willChange: 'clip-path,opacity' }, at);
    tl.fromTo(photo, { clipPath: expanding ? frameClip : fullClip }, {
      clipPath: expanding ? fullClip : frameClip, ...motion,
    }, moveAt);
    tl.fromTo(portraitImage, expanding ? framed : full, { ...(expanding ? full : framed), ...motion }, moveAt);
    if (expanding) {
      tl.set(photo, { clipPath: frameClip }, at);
      tl.set(portraitImage, framed, at);
      tl.to(photo, { opacity: 1, duration: CONTACTS.photoToInk }, at);
    } else {
      tl.to(photo, { opacity: 0, duration: CONTACTS.photoToInk, ease: 'sine.inOut' }, at + CONTACTS.photoShrink);
    }
    const end = at + CONTACTS.photoShrink + CONTACTS.photoToInk;
    tl.set(photo, { clearProps: 'all' }, end);
    return end;
  }

  function addWindow(tl: gsap.core.Timeline, at: number, crop?: EyesCrop) {
    showSurface(tl, at);
    tl.set(frame, { '--eyes-tone': 1 }, at);
    if (crop) moveWindowPhoto(tl, crop, at);
    else tl.fromTo(frame, { scaleX: 1.4, scaleY: 1.75 }, {
      scaleX: 1, scaleY: 1, duration: PORTRAIT.frameDuration, ease: 'power2.out', immediateRender: false,
    }, at);
    tl.to(frame, { '--eyes-tone': 0, duration: CONTACTS.photoToInk, ease: 'sine.inOut' },
      at + (crop ? CONTACTS.photoShrink + CONTACTS.photoToInk : PORTRAIT.cornersAt));
    tl.fromTo(corners, { '--bracket-drawn': 0, opacity: 0 }, {
      '--bracket-drawn': 1, opacity: 1, duration: SD.out, ease: 'sine.out', immediateRender: false,
    }, at + (crop ? CONTACTS.photoShrink + CONTACTS.photoToInk : PORTRAIT.cornersAt));
    tl.add(gooIn(links), at + PORTRAIT.linksAt);
    tl.fromTo(details, { opacity: 0 }, { opacity: 1, duration: SD.out, immediateRender: false }, at + PORTRAIT.formAt);
  }

  async function open(from: State, direct = false) {
    const fromWork = from.kind === 'case' || from.kind === 'portfolio';
    const [about, hero] = await Promise.all([
      loadScene('about'), !direct && (from.kind === 'hero' || fromWork) ? loadScene('hero') : null,
    ]);
    const full = fullPortraitMotion() && about !== null;
    const focused = document.activeElement;
    returnFocus = focused instanceof HTMLElement && focused.closest(`main > .${from.kind}`) ? focused : undefined;
    readingPosition = from.kind === 'about' ? scroller.scrollTop : 0;
    panel.inert = true;
    gsap.set(panel, { visibility: 'hidden' });
    setUnderlay(from);
    panel.scrollTop = 0;
    const tl = gsap.timeline();
    const crop = about?.drawEyes(eyes);
    if (full) {
      gsap.set(corners, { '--bracket-drawn': 0, opacity: 0 });
      gsap.set(details, { opacity: 0 });
      let at = 0;
      if (hero) {
        if (fromWork) leaveWork(tl, from, getCarousel);
        const skip = flyToPortrait(tl, hero, about, selectScene, fromWork ? 'work' : 'hero');
        at = PORTRAIT.contactsAt - skip;
      } else if (from.kind === 'about') {
        tl.to(scroller, { opacity: 0, duration: SD.out }, CONTACTS.aboutHold);
        tl.to(about.u.uSplit, { value: 0, duration: SD.out, ease: 'sine.inOut' }, CONTACTS.aboutHold);
        at = CONTACTS.aboutHold + SD.out;
      }
      addWindow(tl, at, hero || from.kind === 'about' ? crop : undefined);
      // The opaque sheet now covers the original reader, including its scroll position.
      if (fromWork && hero) tl.set(underlay!, { clearProps: 'opacity,visibility' }, at);
    } else {
      corners.style.removeProperty('--bracket-drawn');
      gsap.set([...links, corners, ...details], { opacity: 1, clearProps: 'transform,filter' });
      showSurface(tl, 0);
      tl.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: SD.out }, 0);
    }
    if (from.kind === 'about') tl.call(() => { hideAbout(); gsap.set(scroller, { clearProps: 'opacity' }); });
    tl.call(() => {
      panel.inert = false;
      panel.focus({ preventScroll: true });
    });
    active = tl;
    return { timeline: tl };
  }

  function closeWindow(tl: gsap.core.Timeline, expandInto?: PointScene, photoCrop?: EyesCrop) {
    tl.add(gooOut(links), 0);
    tl.to(corners, { '--bracket-drawn': 0, opacity: 0, duration: SD.out }, 0);
    tl.to(details, { opacity: 0, duration: SD.out }, 0);
    if (expandInto) {
      const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
      const box = frame.getBoundingClientRect();
      const { framing, ink } = expandInto.frameEyes(box);
      const inset = `inset(${box.top}px ${canvas.clientWidth - box.right}px ${canvas.clientHeight - box.bottom}px ${box.left}px)`;
      // The live relief starts in the exact crop occupied by the retained Contacts bitmap.
      gsap.set(canvas, { clipPath: inset });
      tl.call(() => root.classList.add('is-expanding-eyes'), [], CONTACTS.eyesExpandAt);
      tl.to(canvas, { clipPath: 'inset(0px 0px 0px 0px)', duration: SD.in, ease: 'power2.inOut' }, CONTACTS.eyesExpandAt);
      tl.to(framing, { value: 0, duration: SD.in, ease: 'power2.inOut' }, CONTACTS.eyesExpandAt);
      tl.to(ink, { value: 0, duration: PORTRAIT.splitDuration, ease: 'sine.inOut' }, SD.rise);
      tl.set(canvas, { clearProps: 'clipPath' }, CONTACTS.eyesExpandAt + SD.in);
    } else if (!photoCrop) {
      tl.to(frame, { scaleX: 1.4, scaleY: 1.75, duration: SD.rise, ease: 'sine.in' }, 0);
    }
    const end = photoCrop ? moveWindowPhoto(tl, photoCrop, CONTACTS.eyesExpandAt, true) : SD.rise;
    tl.set(panel, { visibility: 'hidden' }, end);
    tl.call(() => root.classList.remove('has-contact-surface'), [], end);
    return end;
  }

  director.register('*', 'contacts', from => open(from));
  director.register('contacts', '*', async (_, to) => {
    panel.inert = true;
    const returning = backdrop && sameState(backdrop, to);
    let about: PointScene | null = null, hero: PointScene | null = null;
    const toPortrait = to.kind === 'about' || to.kind === 'hero' || to.kind === 'portfolio';
    if (toPortrait && fullPortraitMotion()) {
      [about, hero] = await Promise.all([loadScene('about'), to.kind === 'about' ? null : loadScene('hero')]);
    }
    const full = about && fullPortraitMotion() && (to.kind === 'about' || hero);
    if (!full) await prepareBackdrop(to);
    if (!returning) {
      setUnderlay(to);
      returnFocus = undefined;
    }
    const tl = gsap.timeline();
    if (full && about) {
      panel.scrollTop = 0;
      portrait(about, to.kind === 'about' ? 1 : 0);
      selectScene('about');
      const end = closeWindow(tl, to.kind === 'about' ? about : undefined, to.kind === 'portfolio' ? about.drawEyes(eyes) : undefined);
      if (to.kind === 'portfolio' && hero) {
        flyToPortfolio(tl, hero, about, selectScene, getCarousel(), end + PORTRAIT.focusDuration);
      } else if (to.kind === 'hero' && hero) {
        gsap.set('.hero', { visibility: 'hidden' });
        flyToHero(tl, hero, about, selectScene, SD.rise + LM.pullBack);
      } else {
        tl.call(() => revealAbout(readingPosition), [], SD.rise + PORTRAIT.splitDuration);
        tl.set(scroller, { clearProps: 'opacity' }, SD.rise + PORTRAIT.splitDuration + SD.in);
      }
    } else {
      if (to.kind === 'about') scroller.scrollTop = readingPosition;
      tl.to(panel, { opacity: 0, duration: SD.out }, 0);
    }
    active = tl;
    return { timeline: tl };
  });
  director.addEventListener('change', event => {
    const { from, to } = (event as CustomEvent<{ from: State; to: State }>).detail;
    if (to.kind !== 'contacts' && from.kind !== 'contacts') return;
    if (active && active.progress() < 1) active.progress(1);
    active = undefined;
    if (to.kind === 'contacts') return;
    const focus = returnFocus ?? underlay?.querySelector<HTMLElement>(
      '.case__entry:not([hidden]) .case__panel, .works__list li.is-active a',
    ) ?? underlay;
    if (focus && focus === underlay) focus.tabIndex = -1;
    releaseUnderlay();
    backdrop = undefined;
    returnFocus = undefined;
    root.classList.remove('is-contact-overlay', 'has-contact-surface', 'is-expanding-eyes');
    gsap.set([panel, frame, corners, ...details], { clearProps: 'transform,opacity,visibility' });
    corners.style.removeProperty('--bracket-drawn');
    if (to.kind === 'hero') gsap.set('.hero', { clearProps: 'visibility' });
    if (to.kind === 'portfolio') gsap.set('.portfolio', { clearProps: 'visibility' });
    readingPosition = 0;
    focus?.focus({ preventScroll: true });
  });

  return {
    async preparePortrait(about: PointScene) {
      const crop = about.drawEyes(eyes, tone);
      if (!crop) return;
      portraitImage.src = crop.photo;
      await portraitImage.decode().catch(() => {});
    },
    backdrop: () => backdrop,
    enterDirect: () => open({ kind: 'hero' }, true),
  };
}
