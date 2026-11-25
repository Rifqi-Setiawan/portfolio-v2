import gsap from 'gsap';
import { content } from './content';
import { Director } from './core/director';
import { initRouter } from './core/router';
import { stateFromPath, type Opened, type State } from './core/routes';
import { initView } from './core/view';
import { gooIn, gooOut, releaseGoo, setLiquidSink } from './fx/goo';
import { prepareGooRasters } from './fx/gooRaster';
import { initFilmTitles } from './fx/filmTitle';
import { createStage } from './gl/stage';
import { createPointScene, preparePointPrograms, type PointScene } from './gl/pointScene';
import { parsePreset } from './gl/preset';
import { isNarrow, motionMode } from './core/motion';
import { NAV_COLOR, XU } from './core/timings';
import { beginLoader, playIntro, finishIntro } from './sections/intro';
import { initHero } from './sections/hero';
import { createCarousel, type Carousel } from './gl/carousel';
import { initPortfolio } from './sections/portfolio';
import { beginDirectArrival, directLoader, enterCase, enterPortfolio } from './sections/entry';
import { showCase, hideCase } from './sections/case';
import { initContacts } from './sections/contacts';
import { registerContactTransitions } from './sections/contactTransitions';
import { hideAbout, revealAbout } from './sections/about';
import { registerAboutTransitions } from './sections/aboutTransitions';
import { registerCaseTransitions } from './sections/caseTransitions';
import { portfolioDim, registerTransitions, settleHeroPortfolio } from './transitions';

const slugs = content.projects.map(p => p.slug);
const director = new Director(stateFromPath(location.pathname, slugs) ?? { kind: 'hero' });
const navigate = initRouter(director, content);
initView(director, content);
const mode = motionMode();
document.documentElement.style.setProperty('--nav-color-time', (mode === 'reduced' ? 0 : NAV_COLOR) + 's');
const filmTitles = mode === 'full' ? initFilmTitles() : null;
setLiquidSink(filmTitles);

type SceneKind = 'hero' | 'about';
const scenes: Partial<Record<SceneKind, PointScene>> = {};
let selectedScene: SceneKind = director.state.kind === 'about' || director.state.kind === 'contacts' ? 'about' : 'hero';
const host = document.querySelector<HTMLElement>('.stage')!;
let stage = mode === 'full' ? createStage(host) : null;
if (!stage) host.classList.add('stage--still');
initHero(director, navigate, kind => scenes[kind]);
let carousel: Carousel | undefined;
function portfolioCarousel(): Carousel {
  if (!carousel) {
    carousel = createCarousel(stage, content.projects);
    initPortfolio(director, navigate, carousel);
  }
  return carousel;
}
function syncCarousel(from?: State): void {
  const kind = director.state.kind;
  if (kind === 'contacts') return;
  if (kind !== 'case') host.classList.remove('has-case-poster');
  if (kind === 'portfolio') portfolioCarousel().setPresence(1);
  else carousel?.setPresence(0);
  if ((kind === 'hero' && from?.kind !== 'portfolio') || (kind === 'portfolio' && from?.kind !== 'hero')) {
    settleHeroPortfolio(kind, scenes.hero, carousel);
  }
}
director.addEventListener('change', event => syncCarousel((event as CustomEvent<{ from: State }>).detail.from));
registerTransitions(director, () => scenes.hero, portfolioCarousel, paintCaseBackdrop);
registerCaseTransitions(director, () => scenes.hero, portfolioCarousel, navigate, paintCaseBackdrop);
function syncCase(): void {
  if (director.state.kind === 'contacts') return;
  if (director.state.kind === 'case') showCase(director.state.slug);
  else hideCase();
}
director.addEventListener('change', syncCase);

const bootScenes = new Map<'hero' | 'about', Promise<PointScene | null>>();

function loadScene(kind: 'hero' | 'about'): Promise<PointScene | null> {
  const existing = bootScenes.get(kind);
  if (existing) return existing;
  const live = stage;
  if (!live) {
    host.classList.add('stage--still');
    return Promise.resolve(null);
  }
  const abort = new AbortController();
  const base = '/scenes/' + kind + '/';
  const pending = createPointScene(live, {
    color: base + 'color.webp', depth: base + 'depth.webp', photo: base + 'photo.webp', preset: base + 'preset.json',
  }, { mobile: isNarrow(), signal: abort.signal, active: kind === selectedScene, splitPortrait: kind === 'about' })
    .then(async scene => {
      scenes[kind] = scene;
      scene.setActive(kind === selectedScene);
      if (kind === 'about' || director.state.kind !== 'hero') scene.u.uIntro.value = scene.u.uMorph.value = scene.u.uPhoto.value = 1;
      if (kind === 'about') await contactMotion.preparePortrait(scene);
      return scene;
    })
    .catch(error => {
      abort.abort();
      if (kind === 'hero' && selectedScene === 'hero') {
        scenes.about?.dispose();
        delete scenes.about;
        bootScenes.set('about', Promise.resolve(null));
        live.dispose();
        stage = null;
        host.classList.add('stage--still');
      }
      console.warn('[stage] showing the still ' + kind + ' portrait', error);
      return null;
    });
  bootScenes.set(kind, pending);
  return pending;
}

function selectScene(kind: SceneKind): void {
  selectedScene = kind;
  host.classList.toggle('stage--still', !stage || (kind === 'hero' && !scenes.hero));
  scenes.hero?.setActive(kind === 'hero');
  scenes.about?.setActive(kind === 'about');
  document.documentElement.classList.toggle('about-still', kind === 'about' && !scenes.about);
}
registerAboutTransitions(director, loadScene, selectScene, portfolioCarousel);


async function prepareBackdrop(state: State): Promise<void> {
  if (state.kind !== 'case') host.classList.remove('has-case-poster');
  const kind = state.kind === 'about' ? 'about' : 'hero';
  const scene = await loadScene(kind);
  selectScene(kind);
  if (scene) {
    scene.u.uIntro.value = scene.u.uMorph.value = scene.u.uPhoto.value = 1;
    scene.u.uSplit.value = kind === 'about' ? 1 : 0;
    scene.u.uFly.value = 0;
    scene.u.uRecede.value = state.kind === 'case' || state.kind === 'portfolio' ? 1 : 0;
    scene.u.uDim.value = state.kind === 'case' ? 1 : state.kind === 'portfolio' ? portfolioDim : 0;
  }
  if (state.kind === 'case') showCase(state.slug);
  else hideCase();
  if (state.kind === 'about') revealAbout();
  else hideAbout();
  if (state.kind === 'portfolio') portfolioCarousel();
  if (state.kind === 'hero' || state.kind === 'portfolio') {
    settleHeroPortfolio(state.kind, scenes.hero, carousel);
  } else {
    carousel?.setPresence(0);
  }
}
const contactMotion = registerContactTransitions(director, prepareBackdrop, loadScene, kind => {
  host.classList.remove('has-case-poster');
  carousel?.setPresence(0);
  gsap.set('.veil', { opacity: 0 });
  selectScene(kind);
}, portfolioCarousel);
initContacts(content.profile);

async function prepareLoader(opened: Opened): Promise<void> {
  const live = stage;
  if (!live) return;
  // A shared case must be readable before it requests the heavy scene images.
  // The programs can link with the same materials independently of those images.
  const portraits = opened === 'case' ? preparePointPrograms(live) : Promise.all([loadScene('hero'), loadScene('about')]);
  const strip = portfolioCarousel();
  const jobs = await Promise.allSettled([
    portraits, strip.preparePrograms(), strip.prepareCovers(), filmTitles?.prepared, prepareGooRasters(live.signal),
  ]);
  for (const job of jobs) {
    if (job.status === 'rejected' && !live.signal.aborted) console.warn('[stage] optional prewarm failed', job.reason);
  }
  live.startQualityMeasurement();
}

if (import.meta.env.VITE_EXPOSE_APP === '1') {
  Object.assign(window, { __app: {
    director, gooIn, gooOut, releaseGoo, filmTitles, createStage, scenes,
    get stage() { return stage; }, get carousel() { return carousel; },
  } });
  const speed = Number(new URLSearchParams(location.search).get('speed'));
  if (Number.isFinite(speed) && speed > 0) gsap.globalTimeline.timeScale(speed);
}

function paintCaseBackdrop(): Promise<PointScene | null> {
  return loadScene('hero').then(scene => {
    if (host.classList.contains('has-case-poster')) {
      if (scene && selectedScene === 'hero') {
        scene.u.uRecede.value = 1;
        scene.u.uDim.value = 1;
        stage?.requestRender();
      }
      if (scene) requestAnimationFrame(() => host.classList.remove('has-case-poster'));
    }
    return scene;
  });
}

async function bootFor(opened: Opened): Promise<void> {
  if (opened === 'hero') {
    await Promise.all([beginLoader(), prepareLoader(opened)]);
    const hero = scenes.hero ?? null;
    const intro = playIntro(hero, hero?.preset ?? parsePreset({}));
    if (import.meta.env.VITE_EXPOSE_APP === '1') {
      performance.measure('intro:authored', {
        start: 0, duration: intro.duration() * 1000, detail: { ...intro.labels },
      });
    }
    await intro;
    return;
  }
  if (opened === 'case' && director.state.kind === 'case') {
    const { slug } = director.state;
    host.classList.add('has-case-poster');
    showCase(slug, { deferMedia: true });
    await directLoader(prepareLoader(opened));
    await enterCase(slug, mode === 'full');
    finishIntro();
    // Allow a presented, readable panel before the worker or depth image is requested.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void paintCaseBackdrop().then(scene => { if (scene) void loadScene('about'); });
    }));
    return;
  }
  const kind = opened === 'about' || opened === 'contacts' ? 'about' : 'hero';
  await directLoader(prepareLoader(opened));
  const scene = scenes[kind] ?? null;
  selectScene(kind);
  if (opened === 'about') {
    beginDirectArrival();
    if (scene) await gsap.to(scene.u.uSplit, { value: 1, duration: XU.split, ease: 'power2.inOut' });
    revealAbout();
  } else if (opened === 'portfolio') {
    await enterPortfolio(scene, portfolioCarousel());
  } else {
    beginDirectArrival();
    const arrival = await contactMotion.enterDirect();
    await arrival.timeline;
  }
  finishIntro();
}

director.enter(() => bootFor(director.state.kind));
