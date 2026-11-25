import {
  AdditiveBlending, BufferGeometry, Color, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, MathUtils, Mesh,
  NoColorSpace, NormalBlending, type NormalOrGLBufferAttributes, PlaneGeometry, Points, RedFormat, RGBAFormat, SRGBColorSpace,
  Scene, ShaderMaterial, Sphere, UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';
import type { Layer, Stage } from './stage';
import { EYES_WINDOW_ASPECT, parsePreset, type Preset } from './preset';
import { uploadMap, uploadPoints } from './sceneUploads';
import { ABOUT_REDUCED_POINTS, HERO_REDUCED_POINTS, imageRow, POINT_ROWS } from './pointRows';
import type { SampleRequest, SampleResponse, SampleResult } from './sampling.worker';
import { INTRO, LM, LOAD_TIMEOUT, MOBILE_ABOUT, TRAIL, XU } from '../core/timings';
import { WearGrid, wearThreshold } from './wearGrid';
import { isNarrow } from '../core/motion';
import pointsVert from './shaders/points.vert.glsl?raw';
import pointsFrag from './shaders/points.frag.glsl?raw';
import photoFrag from './shaders/photo.frag.glsl?raw';
import splitMask from './shaders/split.glsl?raw';
import brushMask from './shaders/brush.glsl?raw';

type U = { value: number };
export type EyesCrop = { centerX: number; centerY: number; spanX: number; imageAspect: number; photo: string };
export type PointUniforms = { uIntro: U; uMorph: U; uPhoto: U; uRecede: U; uFly: U; uSplit: U; uDim: U };

export type PointScene = {
  u: PointUniforms;
  /** Pointer in NDC (-1..1, y up). */
  setPointer(nx: number, ny: number): void;
  /** Calibrate the actual portrait under the solid name hold. Release before showing dust. */
  calibrateIntro(): () => void;
  animateIntroGrain(): void;
  paintTrail(nx: number, ny: number): void;
  endTrail(clear?: boolean): void;
  /** Retain the About relief and return the matching photographic crop. */
  drawEyes(canvas: HTMLCanvasElement, toneCanvas?: HTMLCanvasElement): EyesCrop | undefined;
  /** Match the flattened About face to the Contacts window before expanding it. */
  frameEyes(bounds: DOMRect): { framing: U; ink: U };
  /** Blend the landed hero photograph into the aligned About portrait. One shows the hero crop. */
  focusFromHero(hero: PointScene): U;
  readonly photoTexture: DataTexture;
  setActive(value: boolean): void;
  layer: Layer;
  dispose(): void;
  /** Actual number of points in the cloud. */
  count: number;
  /** Time spent sampling in the worker, ms. */
  sampleMs: number;
  preset: Preset;
};

export type SceneSrc = { color: string; depth: string; photo: string; preset: string };

const SEED = 0x5eed;
const PHOTO_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const pointShaders = {
  vertexShader: pointsVert.replace('#include <split_mask>', splitMask),
  fragmentShader: pointsFrag.replace('#include <split_mask>', splitMask).replace('#include <brush_mask>', brushMask),
};
const photoShaders = {
  vertexShader: PHOTO_VERT,
  fragmentShader: photoFrag.replace('#include <split_mask>', splitMask).replace('#include <brush_mask>', brushMask),
};

/** Direct case entries can link the shared portrait/trail/halftone programs before requesting any scene images. */
export async function preparePointPrograms(stage: Stage): Promise<void> {
  const scene = new Scene(), plane = new PlaneGeometry(1, 1);
  const points = new ShaderMaterial({ ...pointShaders, transparent: true, depthTest: false, depthWrite: false });
  const photo = new ShaderMaterial({ ...photoShaders, transparent: true, depthTest: false, depthWrite: false });
  scene.add(new Points(plane, points), new Mesh(plane, photo));
  stage.signal.addEventListener('abort', () => { plane.dispose(); points.dispose(); photo.dispose(); }, { once: true });
  await stage.post.prepare(stage.renderer, scene, stage.camera, stage.signal);
}

const aborted = () => new DOMException('aborted', 'AbortError');

function sampleInWorker(req: SampleRequest, signal?: AbortSignal): Promise<SampleResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    let worker: Worker;
    try {
      worker = new Worker(new URL('./sampling.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const onAbort = () => {
      worker.terminate();
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (e: MessageEvent<SampleResponse>) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      if ('error' in e.data) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      reject(new Error(e.message || 'sampling worker failed'));
    };
    try { worker.postMessage(req); } catch (error) {
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      reject(error);
    }
  });
}

function dataTexture(img: ImageData, srgb: boolean): DataTexture {
  const tex = new DataTexture(img.data, img.width, img.height, RGBAFormat, UnsignedByteType);
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Network and worker deadlines are separate from the pointer-idle gate for GPU uploads.
 */
export async function createPointScene(
  stage: Stage,
  src: SceneSrc,
  opts: { mobile: boolean; active?: boolean; splitPortrait?: boolean; signal?: AbortSignal },
): Promise<PointScene> {
  const lifetime = new AbortController();
  const signals = [stage.signal, lifetime.signal];
  if (opts.signal) signals.push(opts.signal);
  const signal = AbortSignal.any(signals);
  const assetSignal = AbortSignal.any([signal, AbortSignal.timeout(LOAD_TIMEOUT * 1000)]);
  async function fetchAsset(url: string) {
    const response = await fetch(url, { signal: assetSignal });
    if (!response.ok) throw new Error(`Asset ${response.status}: ${url}`);
    return response;
  }
  const [presetJson, color, depthBlob, photoBlob] = await Promise.all([
    fetchAsset(src.preset).then(r => r.json()), fetchAsset(src.color).then(r => r.blob()),
    fetchAsset(src.depth).then(r => r.blob()),
    src.photo && src.photo !== src.color ? fetchAsset(src.photo).then(r => r.blob()).catch(() => undefined) : undefined,
  ]);
  const p = parsePreset(presetJson);
  const eyesCrop = p.eyesCrop;
  const wanted = Math.max(1, Math.floor(opts.mobile ? p.particles.countMobile : p.particles.count));
  const { attributes, ms, count, depth, photo: photograph, aspect: imgAspect, highResolution, print, halftone, rowOffsets } = await sampleInWorker({
    color, depth: depthBlob, photo: photoBlob, preset: p, count: wanted, seed: SEED,
    printWidth: opts.splitPortrait ? (opts.mobile ? 768 : 1280) : undefined,
    printCssWidth: opts.splitPortrait ? document.querySelector<HTMLElement>('.contacts__portrait')?.offsetWidth : undefined,
    trailRows: !opts.mobile && !opts.splitPortrait,
  }, AbortSignal.any([signal, AbortSignal.timeout(LOAD_TIMEOUT * 1000)]));
  signal.throwIfAborted();
  let active = opts.active ?? true;

  // Shared uniform handles: setting .value (e.g. from a gsap tween) wakes the render loop.
  const live = (v: number, redraw = stage.requestRender): U => {
    let x = v;
    return {
      get value() { return x; },
      set value(n: number) { if (n !== x) { x = n; if (active) redraw(); } },
    };
  };
  const u: PointUniforms = {
    uIntro: live(0), uMorph: live(0), uPhoto: live(0), uRecede: live(0), uFly: live(0), uSplit: live(0),
    uDim: live(0, () => opaqueRoom() ? stage.requestOverlay() : stage.requestRender()),
  };
  const eyesWindow = new Vector3(); // viewport-relative centre (y up) and width
  const eyesFraming = live(0), eyesInk = live(0);

  // Keep the room visible behind the selected card while it flies into the reader.
  function roomDim() {
    const phase = u.uDim.value;
    return Math.min(phase, .26) + Math.max(0, phase - .26) * (.04 / .74);
  }
  // Changing the brightness of this full-bleed, opaque room commutes with the
  // post pass's linear lens samples. Keep the undimmed image for the case flight.
  function opaqueRoom() {
    return !opts.splitPortrait && p.camera.fit === 'cover' && u.uPhoto.value === 1
      && u.uRecede.value === 1 && u.uFly.value === 0 && u.uSplit.value === 0;
  }
  const backdropDim = { get value() { return opaqueRoom() ? 0 : roomDim(); } };

  const eyePrint = { value: print ? dataTexture(print, false) : null };
  const cx = p.camera.centerX, cy = p.camera.centerY;
  const time = { value: 0 };
  const res = { value: new Vector2(1, 1) };
  const pointer = { value: new Vector3(0, 0, 0) };
  const pxPerUnit = { value: 1000 };
  let wear: WearGrid | undefined;
  let lastWearTime = 0;
  const tWear = { value: null as DataTexture | null };
  function prepareTrail() {
    const aspect = stage.camera.aspect;
    if (!wear || wear.rows !== Math.max(1, Math.round(wear.columns / aspect))) {
      tWear.value?.dispose();
      wear = new WearGrid(aspect, opts.splitPortrait ? TRAIL.about : TRAIL.hero, p.photo);
      const texture = new DataTexture(wear.pixels, wear.columns, wear.rows, RedFormat, UnsignedByteType);
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      tWear.value = texture;
    }
    return wear;
  }
  const uWearActive = { value: 0 };
  const thresholdRange = new Vector2(wearThreshold(0, p.photo.rough), wearThreshold(1, p.photo.rough));
  const brushUniforms = { tWear, uWearActive, uWearThreshold: { value: thresholdRange } };
  const flightShade = { value: 0 };
  const desktopPanelStart = .406;
  const splitUniforms = {
    uEyesInk: eyesInk,
    uEyePrint: { get value() { return eyePrint.value ? eyesFraming.value : 0; } },
    uNarrow: { value: 0 }, uPixelRatio: { value: stage.renderer.getPixelRatio() },
    uMobilePanelStart: { value: MOBILE_ABOUT.panelStart },
    uDesktopPanelStart: { value: desktopPanelStart },
    uEdgeSoft: { value: XU.edgeSoft }, uEdgeRough: { value: XU.edgeRough },
  };

  // ---- points ----
  const geo = new BufferGeometry<NormalOrGLBufferAttributes>();
  // Three uses the centre for transparent sorting. The GPU-owned attributes cannot be scanned on the CPU.
  geo.boundingSphere = new Sphere(
    new Vector3((.5 - cx) * imgAspect, cy - .5, p.depth.scale / 2),
    Math.hypot(imgAspect, 1, p.depth.scale) / 2,
  );
  const pointsMat = new ShaderMaterial({
    ...pointShaders,
    uniforms: {
      ...u, ...splitUniforms, ...brushUniforms, uDim: backdropDim,
      uTime: time, uRes: res, uPointer: pointer, uPxPerUnit: pxPerUnit,
      uImgAspect: { value: imgAspect },
      uCenter: { value: new Vector2(cx, cy) },
      uDepthScale: { value: p.depth.scale },
      uIntroLeftRight: { value: p.intro.order === 'left-right' ? 1 : 0 },
      uIntroSpread: { value: p.intro.spread },
      uSpread: { value: p.look.spread },
      uLoose: { value: p.intro.loose },
      uStagger: { value: p.morph.duration > 0 ? p.morph.stagger / p.morph.duration : 0 },
      uCurlAmp: { value: p.morph.curlAmp },
      uCurlScale: { value: p.morph.curlScale },
      uCurlSpeed: { value: p.morph.curlSpeed },
      uSwirl: { value: p.morph.swirl },
      uLifeMove: { value: p.life.move },
      uLifeRest: { value: p.life.rest },
      uLifeSpeed: { value: p.life.speed },
      uSize: { value: p.particles.size },
      uSizeRandom: { value: p.particles.sizeRandom },
      uInkDensity: { value: p.particles.density },
      uMobilePointFadeEnd: { value: MOBILE_ABOUT.pointFadeEnd },
      uFocus: { value: p.camera.focus },
      uAperture: { value: p.camera.aperture },
      uRecedeBlur: { value: p.recede.blur },
      uBrightness: { value: p.look.brightness },
      uRepelRadius: { value: p.interaction.repelRadius },
      uRepelForce: { value: p.interaction.repelForce },
      uRepelDepth: { value: p.interaction.repelDepth },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: p.look.blending === 'additive' ? AdditiveBlending : NormalBlending,
  });
  if (rowOffsets) {
    geo.addGroup(0, count, 0);
    geo.addGroup(count, 0, 1);
  }
  const points = new Points(geo, rowOffsets ? [pointsMat, pointsMat] : pointsMat);
  points.frustumCulled = false;
  points.renderOrder = 2;

  // ---- photo quad (image rect at z = 0; the camera cover-fits it to the viewport) ----
  const depthTex = dataTexture(depth, false);
  const photoTex = dataTexture(photograph, true);
  const photoSource = highResolution ? src.photo : src.color;
  const heroCrop = new Vector3();
  const heroWeight = live(0);
  let focusHero: PointScene | undefined;
  const photoMat = new ShaderMaterial({
    ...photoShaders,
    uniforms: {
      ...splitUniforms, ...brushUniforms, tPhoto: { value: photoTex },
      tEyePrint: eyePrint,
      uEyeCrop: { value: new Vector4(eyesCrop.centerX, eyesCrop.centerY, eyesCrop.spanX, eyesCrop.spanX * imgAspect / EYES_WINDOW_ASPECT) },
      tHeroPhoto: { get value() { return heroWeight.value > 0 ? focusHero?.photoTexture : null; } },
      uHeroCrop: { value: heroCrop }, uHeroWeight: heroWeight,
      tDepth: { value: depthTex }, uFlightShade: flightShade,
      uPhoto: u.uPhoto, uRecede: u.uRecede, uDim: backdropDim, uSplit: u.uSplit,
      uRecedeBlur: { value: p.recede.blur },
      uBlur: { value: p.photo.blur },
      uDepthSoft: { value: p.photo.depthSoft },
      uDepthGrow: { value: p.photo.depthGrow },
      uTime: time, uRes: res,
      uOverscan: { value: new Vector2(1, 1) },
      uCream: { value: new Color('#d9ccb4') }, // Color is linear (ColorManagement)
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const photo = new Mesh(new PlaneGeometry(imgAspect, 1), photoMat);
  photo.position.set((0.5 - cx) * imgAspect, cy - 0.5, 0);
  photo.renderOrder = 1;
  photo.frustumCulled = false;

  const group = new Group();
  group.visible = active;
  group.add(photo, points);
  let disposed = false;
  const prepScene = new Scene();
  prepScene.add(group);
  // Resolve shader reflection and create VAOs while they are covered by the loader.
  // A one-point scissored draw exercises the hardware trail and halftone branches, too.
  try {
    await Promise.all([
      uploadPoints(stage, geo, attributes, signal),
      ...[depthTex, photoTex, eyePrint.value].filter((t): t is DataTexture => !!t).map(t => uploadMap(stage, t, signal)),
    ]);
    if (!stage.contextLost) {
      prepareTrail();
      stage.renderer.initTexture(tWear.value!);
      geo.setDrawRange(0, 1);
      group.visible = true;
      u.uIntro.value = u.uMorph.value = u.uPhoto.value = 1;
      uWearActive.value = 1;
      if (opts.splitPortrait) u.uSplit.value = eyesFraming.value = 1;
      await stage.post.prepare(stage.renderer, prepScene, stage.camera, signal);
      signal.throwIfAborted();
      u.uIntro.value = u.uMorph.value = u.uPhoto.value = u.uSplit.value = eyesFraming.value = 0;
      uWearActive.value = 0;
      group.visible = active;
      geo.setDrawRange(0, Infinity);
    }
  } catch (error) {
    lifetime.abort();
    geo.dispose(); pointsMat.dispose(); photo.geometry.dispose(); photoMat.dispose();
    photoTex.dispose(); depthTex.dispose(); eyePrint.value?.dispose();
    throw error;
  }
  stage.scene.add(group);

  // ---- camera / pointer ----
  const cam = stage.camera;
  const target = new Vector2();
  const follow = new Vector2();
  let pointerOn = 0;
  let pointerSeen = false;
  const size = new Vector2();
  const corner = new Vector3();
  let calibration: { start: number; brush: boolean; stop: () => void } | undefined;
  const flySplit = LM.pullBack / (LM.pullBack + LM.flyThrough);

  function selectRows() {
    if (!rowOffsets) return;
    const [base, detail] = geo.groups;
    if (!wear?.active || u.uPhoto.value !== 1 || u.uFly.value !== 0 || u.uRecede.value !== 0) {
      base.start = 0; base.count = count;
      detail.start = count; detail.count = 0;
      return;
    }
    // Project the two edges of the live wear band back through both extremes
    // of the relief depth. The extra grid rows cover filtering and point radii.
    const low = 2 * (wear.firstRow - 2) / wear.rows - 1;
    const high = 2 * (wear.lastRow + 3) / wear.rows - 1;
    let first = 1, last = 0;
    for (let x = -1; x <= 1; x += 2) {
      for (const y of [low, high]) {
        corner.set(x, y, 0).unproject(cam).sub(cam.position);
        const dy = corner.y / corner.z;
        const front = cy - cam.position.y + group.position.y + cam.position.z * dy;
        const back = front - p.depth.scale * dy;
        first = Math.min(first, front, back);
        last = Math.max(last, front, back);
      }
    }
    const lo = imageRow(first), hi = imageRow(last) + 1;
    base.start = rowOffsets[lo]; base.count = rowOffsets[hi] - base.start;
    detail.start = rowOffsets[POINT_ROWS + lo]; detail.count = rowOffsets[POINT_ROWS + hi] - detail.start;
  }

  const layer: Layer = {
    update(dt, seconds) {
      if (!active || disposed) return false;
      time.value += dt;
      if (calibration?.brush) {
        const t = clamp01((seconds - calibration.start) / INTRO.nameHold);
        prepareTrail().move(.2 + .6 * t, .5 + .1 * Math.sin(t * Math.PI * 2));
      }
      const P = u.uPhoto.value, S = u.uSplit.value, R = u.uRecede.value, F = u.uFly.value;

      if (cam.fov !== p.camera.fov) { cam.fov = p.camera.fov; cam.updateProjectionMatrix(); }
      const tanH = Math.tan(MathUtils.degToRad(cam.fov) / 2);
      const aspect = cam.aspect || 1;
      // Visible height (image-height units) that cover-fits (or contain-fits) the image rect.
      const wider = aspect > imgAspect;
      const visH = p.camera.fit === 'contain' ? (wider ? 1 : imgAspect / aspect) : wider ? imgAspect / aspect : 1;
      // At split=0 the portrait must match the centered cover-sized close-up
      // frame. As the ink is revealed, move into this portrait's calibrated crop.
      const framing = opts.splitPortrait ? S : 1;
      const narrow = opts.splitPortrait && S > 0 && isNarrow();
      const splitZoom = narrow ? MOBILE_ABOUT.portraitHeight * visH : p.camera.zoom;
      const zoom = MathUtils.lerp(1, splitZoom, framing) / (1 + 0.25 * p.recede.zoom * R);
      const base = visH / zoom / 2 / tanH;

      // Retreat to show the room, then aim at the subject for the cut to the close-up.
      let dist = base;
      let approach = 0;
      let retreat = 0;
      if (F > 0) {
        const wide = base * 1.28;
        if (F < flySplit) {
          retreat = smooth(F / flySplit);
          dist = MathUtils.lerp(base, wide, retreat);
        } else {
          approach = smooth((F - flySplit) / (1 - flySplit));
          retreat = 1 - approach;
          // Match the size of the face in the full-frame About photograph.
          const end = Math.max(p.depth.scale + cam.near, visH / (2 * tanH * p.camera.flyToZoom));
          dist = MathUtils.lerp(wide, end, approach);
        }
      }
      flightShade.value = retreat;
      const windowAmount = eyesFraming.value;
      if (windowAmount > 0) {
        const windowDistance = eyesCrop.spanX * imgAspect / (eyesWindow.z * aspect * 2 * tanH);
        dist = MathUtils.lerp(dist, windowDistance, windowAmount);
      }

      // Camera follows the pointer (parallax), eased by camera.follow per 60 Hz frame.
      const k = 1 - Math.pow(1 - p.camera.follow, dt * 60);
      follow.x += (target.x - follow.x) * k;
      follow.y += (target.y - follow.y) * k;
      const par = MathUtils.lerp(p.camera.parallax, p.recede.parallax, R) * 0.025 * base * (1 - approach) * (1 - windowAmount);
      // Aim just below the seated portrait's eyes so they line up with the
      // unsplit close-up photograph during the cut.
      const faceX = (p.camera.flyToX - cx) * imgAspect * approach;
      const faceY = (cy - p.camera.flyToY) * approach;
      cam.position.set(faceX + follow.x * par, faceY + follow.y * par, dist);
      cam.lookAt(faceX + follow.x * par * 0.2, faceY + follow.y * par * 0.2, Math.min(0, dist - 1));
      cam.updateMatrixWorld();

      // Convert the split portrait's screen offset to the z=0 image plane.
      // Both the photograph and its sampled points share this origin.
      const viewHeightPx = stage.renderer.getSize(size).y;
      const worldPerPixel = 2 * Math.max(dist, 0) * tanH / Math.max(1, viewHeightPx);
      // On phones the portrait is centered horizontally and its top meets the viewport top.
      const centerX = (cx - .5) * imgAspect;
      const centerY = .5 - cy;
      const splitX = narrow ? centerX : -XU.shift * worldPerPixel;
      const splitY = narrow
        ? centerY + (1 - MOBILE_ABOUT.portraitHeight) * .5 * viewHeightPx * worldPerPixel
        : XU.shiftY * worldPerPixel;
      group.position.set(centerX * (1 - framing) + splitX * S, centerY * (1 - framing) + splitY * S, 0);
      if (windowAmount > 0) {
        // Place the sampled eye centre on the frame centre at the same scale as drawEyes.
        const viewHeight = 2 * dist * tanH;
        const x = eyesWindow.x * viewHeight * aspect - (eyesCrop.centerX - cx) * imgAspect;
        const y = eyesWindow.y * viewHeight - (cy - eyesCrop.centerY);
        group.position.x = MathUtils.lerp(group.position.x, x, windowAmount);
        group.position.y = MathUtils.lerp(group.position.y, y, windowAmount);
      }
      splitUniforms.uNarrow.value = narrow ? 1 : 0;

      // The reference pulls back to ~80% of the hero framing. The placeholder
      // has no extra photograph outside its crop. Grow only the perimeter
      // needed to cover the view, accounting for the actual tilted camera.
      let coverX = 1, coverY = 1;
      if (p.camera.fit === 'cover' && dist > cam.near) {
        for (let x = -1; x <= 1; x += 2) {
          for (let y = -1; y <= 1; y += 2) {
            corner.set(x, y, 0).unproject(cam).sub(cam.position);
            const reach = -dist / corner.z;
            const wx = cam.position.x + reach * corner.x;
            const wy = cam.position.y + reach * corner.y;
            coverX = Math.max(coverX, 2 * Math.abs(wx - photo.position.x - group.position.x) / imgAspect);
            coverY = Math.max(coverY, 2 * Math.abs(wy - photo.position.y - group.position.y));
          }
        }
      }
      photo.scale.set(coverX, coverY, 1);
      photoMat.uniforms.uOverscan.value.set(coverX, coverY);

      stage.renderer.getDrawingBufferSize(size);
      splitUniforms.uPixelRatio.value = stage.renderer.getPixelRatio();
      res.value.copy(size);
      pxPerUnit.value = size.y / (2 * tanH);

      // Pointer on the z = 0 plane for repel.
      pointerOn += ((pointerSeen ? 1 : 0) - pointerOn) * k;
      const halfH = Math.abs(dist) * tanH;
      pointer.value.set(cam.position.x + target.x * halfH * aspect, cam.position.y + target.y * halfH, pointerOn);

      const post = stage.post.uniforms;
      post.uRoomDim.value = opaqueRoom() ? roomDim() : 0;
      const sourceLook = focusHero?.preset.photo ?? p.photo;
      const w = heroWeight.value;
      post.uGrain.value = MathUtils.lerp(p.photo.grain, sourceLook.grain, w) * 0.07 * P;
      post.uLens.value = MathUtils.lerp(p.photo.lens, sourceLook.lens, w) * P * (1-S);
      post.uLensSoft.value = stage.qualityTier < 3
        ? MathUtils.lerp(p.photo.lensSoftness, sourceLook.lensSoftness, w) * 0.5 * P * (1-S) : 0;

      if (wear && tWear.value) {
        if (wear.rows !== Math.max(1, Math.round(wear.columns / aspect))) wear.end(true);
        // The stage limits camera steps after a long frame. Wear heals in real elapsed time.
        if (wear.update(lastWearTime ? seconds - lastWearTime : 0)) tWear.value.needsUpdate = true;
        lastWearTime = wear.active ? seconds : 0;
      }
      uWearActive.value = wear?.active ? 1 : 0;
      points.visible = u.uIntro.value > 0 && (P < 1 || S > 0 || uWearActive.value === 1);
      selectRows();
      const budget = opts.splitPortrait ? ABOUT_REDUCED_POINTS : HERO_REDUCED_POINTS;
      geo.setDrawRange(0, stage.qualityTier >= 2 ? Math.min(count, budget) : count);
      photo.visible = P > 0 || S > 0;

      // Keep the last graded frame while the portrait and its trail are at rest.
      const settling = Math.abs(target.x - follow.x) + Math.abs(target.y - follow.y) > 1e-4;
      return !!calibration || (points.visible && P < 1 && S !== 1) || !!wear?.active || settling;
    },
  };
  stage.add(layer);

  function endTrail(clear = false): void {
    const wasVisible = wear?.active;
    wear?.end(clear);
    if (clear && wasVisible && active) stage.requestRender();
  }

  return {
    u,
    count,
    sampleMs: ms,
    preset: p,
    get photoTexture() { return photoTex; },
    focusFromHero(hero) {
      const { flyToX, flyToY, flyToZoom } = hero.preset.camera;
      heroCrop.set(flyToX, flyToY, 1 / flyToZoom);
      focusHero = hero;
      return heroWeight;
    },
    layer,
    endTrail,
    calibrateIntro() {
      const root = document.documentElement;
      if (opts.splitPortrait || !active || disposed || document.hidden || stage.contextLost ||
          !root.matches('.is-intro[data-opened="hero"]:not(.has-intro-particles)')) return () => {};
      const canvas = stage.renderer.domElement;
      const events = new AbortController();
      const stop = () => {
        if (!calibration) return;
        calibration = undefined;
        events.abort();
        endTrail(true);
        time.value = 0;
        lastWearTime = 0;
        u.uIntro.value = u.uMorph.value = u.uPhoto.value = 0;
        if (!stage.contextLost && !signal.aborted) {
          // Discard the private pose before exposing the drawing buffer, even
          // when the dust timeline advances faster than the next stage frame.
          stage.renderer.setRenderTarget(null);
          stage.renderer.clear();
        }
        canvas.style.removeProperty('visibility');
      };
      canvas.style.visibility = 'hidden';
      calibration = { start: performance.now() / 1000,
        brush: !opts.mobile && matchMedia('(hover: hover) and (pointer: fine)').matches, stop };
      u.uIntro.value = u.uMorph.value = u.uPhoto.value = 1;
      canvas.addEventListener('webglcontextlost', stop, { signal: events.signal });
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal: events.signal });
      window.addEventListener('pagehide', stop, { signal: events.signal });
      signal.addEventListener('abort', stop, { signal: events.signal });
      return stop;
    },
    animateIntroGrain() { if (active && !disposed) stage.requestOverlay(); },
    frameEyes(bounds) {
      const width = stage.renderer.domElement.clientWidth, height = stage.renderer.domElement.clientHeight;
      eyesWindow.set((bounds.left + bounds.width / 2) / width - .5,
        .5 - (bounds.top + bounds.height / 2) / height, bounds.width / width);
      eyesFraming.value = eyesInk.value = 1;
      return { framing: eyesFraming, ink: eyesInk };
    },
    drawEyes(canvas, toneCanvas) {
      if (!opts.splitPortrait || disposed) return;
      const crop = { ...eyesCrop, imageAspect: imgAspect, photo: photoSource };
      if (!print || !eyePrint.value) return;
      if (!canvas.hasAttribute('data-ready')) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = print.width;
        canvas.height = print.height;
        ctx.putImageData(print, 0, 0);
        canvas.dataset.ready = '';
      }
      if (toneCanvas && halftone && !toneCanvas.hasAttribute('data-ready')) {
        const context = toneCanvas.getContext('2d');
        if (context) {
          toneCanvas.width = halftone.width;
          toneCanvas.height = halftone.height;
          context.putImageData(halftone, 0, 0);
          toneCanvas.dataset.ready = '';
        }
      }
      return crop;
    },
    setActive(value) {
      if (active === value || disposed) return;
      if (!value) { calibration?.stop(); endTrail(true); }
      active = group.visible = value;
      if (!active) heroWeight.value = 0;
      stage.requestRender();
    },
    setPointer(nx, ny) {
      target.set(clamp01((nx + 1) / 2) * 2 - 1, clamp01((ny + 1) / 2) * 2 - 1);
      pointerSeen = true;
      if (active) stage.requestRender();
    },
    paintTrail(nx, ny) {
      if (!active || disposed) return;
      const x = .5 + nx / 2, y = .5 + ny / 2;
      if (x < 0 || x > 1 || y < 0 || y > 1 ||
          (opts.splitPortrait && (isNarrow() ? 1 - y >= MOBILE_ABOUT.panelStart : x >= desktopPanelStart))) {
        endTrail();
        return;
      }
      if (prepareTrail().move(x, y)) stage.requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      stage.remove(layer);
      stage.scene.remove(group);
      geo.dispose();
      pointsMat.dispose();
      photo.geometry.dispose();
      photoMat.dispose();
      photoTex.dispose();
      depthTex.dispose();
      eyePrint.value?.dispose();
      tWear.value?.dispose();
      if (active) {
        const post = stage.post.uniforms;
        post.uGrain.value = post.uLens.value = post.uLensSoft.value = post.uRoomDim.value = 0;
      }
    },
  };
}
