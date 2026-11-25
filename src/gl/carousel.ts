import {
  DoubleSide, MathUtils, Mesh, PerspectiveCamera, PlaneGeometry, SRGBColorSpace, Scene,
  ShaderMaterial, Texture, Vector2, Vector3,
} from 'three';
import gsap from 'gsap';
import type { Project, Category } from '../content/types';
import { CAROUSEL, DU, LOAD_TIMEOUT } from '../core/timings';
import { isNarrow } from '../core/motion';
import { blurPx, cardPose, filteredIndices, gridPose } from './carouselMath';
import type { Layer, Stage } from './stage';
import { warmDraw } from './post';

const VERT = /* glsl */ `
varying vec2 vUv;
uniform float uBend;
uniform float uFlare;
void main() {
  vUv = uv;
  vec3 p = position;
  // uBend is the angle swept by one card. Keeping it in local units also
  // lets a project transition flatten this exact mesh into a DOM image.
  if (abs(uBend) > 0.00001) {
    float angle = p.x * uBend;
    p.x = sin(angle) / uBend;
    p.z = (cos(angle) - 1.0) / uBend;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vec4 center = projectionMatrix * modelViewMatrix * vec4(0., 0., 0., 1.);
  float edge = clamp((abs(gl_Position.x / gl_Position.w) - .75) * 4., 0., 1.);
  gl_Position.y += (gl_Position.y - center.y / center.w * gl_Position.w) * uFlare * edge * edge;
}`;
const FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uCover;
uniform vec2 uCrop;
uniform vec2 uScreenSize;
uniform float uBlur;
uniform float uOpacity;
void main() {
  vec2 uv = (vUv - .5) * uCrop + .5;
  vec4 color = texture2D(uCover, uv);
  if (uBlur > .001) {
    vec2 delta = uCrop * uBlur / max(uScreenSize, 1.);
    color *= .28;
    color += .12 * (texture2D(uCover, uv + vec2(delta.x, 0.)) + texture2D(uCover, uv - vec2(delta.x, 0.))
      + texture2D(uCover, uv + vec2(0., delta.y)) + texture2D(uCover, uv - vec2(0., delta.y)));
    color += .06 * (texture2D(uCover, uv + delta) + texture2D(uCover, uv - delta)
      + texture2D(uCover, uv + vec2(delta.x,-delta.y)) + texture2D(uCover, uv - vec2(delta.x,-delta.y)));
  }
  vec2 edge = min(vUv, 1.0 - vUv) / max(fwidth(vUv), vec2(.00001));
  gl_FragColor = vec4(color.rgb, uOpacity * smoothstep(0., .7, min(edge.x, edge.y)));
  #include <colorspace_fragment>
}`;

type View = 'strip' | 'grid';
type Pose = {
  x: number; y: number; z: number; width: number; height: number;
  yaw: number; bend: number; opacity: number; blur: number; flare: number;
};
const lerp = MathUtils.lerp;
const clamp = MathUtils.clamp;
const wrap = (x: number, n: number) => ((x % n) + n) % n;

function mixPoses(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t), z: lerp(a.z,b.z,t),
    width: lerp(a.width,b.width,t), height: lerp(a.height,b.height,t),
    yaw: lerp(a.yaw,b.yaw,t), bend: lerp(a.bend,b.bend,t),
    opacity: lerp(a.opacity,b.opacity,t), blur: lerp(a.blur,b.blur,t), flare: lerp(a.flare,b.flare,t),
  };
}

// Project the actual edges of the 32-segment plane through the same camera and
// cylinder as the vertex shader. The DOM hit target follows the bent silhouette.
function screenRect(p: Pose, width: number, height: number, focal: number): DOMRect {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const centerY = height/2 - p.y * focal/(focal-p.z);
  for (let s = 0; s <= 32; s++) {
    const u = s / 32 - .5;
    const curved = p.bend > .00001;
    const x = p.width * (curved ? Math.sin(u*p.bend)/p.bend : u);
    const z = curved ? p.width * (Math.cos(u*p.bend)-1)/p.bend : 0;
    const scale = focal / (focal - p.z + sin*x - cos*z);
    const sx = width/2 + (p.x + cos*x + sin*z)*scale;
    left = Math.min(left, sx); right = Math.max(right, sx);
    const edge = clamp((Math.abs(2*sx/width-1) - .75)*4, 0, 1);
    const flare = 1 + p.flare*edge*edge;
    top = Math.min(top, centerY + (height/2 - (p.y + p.height/2)*scale - centerY)*flare);
    bottom = Math.max(bottom, centerY + (height/2 - (p.y - p.height/2)*scale - centerY)*flare);
  }
  return new DOMRect(left, top, right-left, bottom-top);
}

export class Carousel extends EventTarget {
  readonly layer: Layer;
  declare lastHandoffRect?: DOMRect;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly geometry = new PlaneGeometry(1, .5625, 32, 1);
  private readonly meshes: Mesh<PlaneGeometry, ShaderMaterial>[];
  private coversReady?: Promise<void>;
  private readonly hoverScales: { value: number }[];
  private hovered: number | null = null;
  private readonly textures: Texture<ImageBitmap>[] = [];
  private slots: number[];
  private position = 0;
  private destination = 0;
  private velocity = 0;
  private amount = 0;
  private fold = 0;
  private mode: View;
  private category: Category | 'all' = 'all';
  private scroll = 0;
  private orbitX = 0;
  private orbitY = 0;
  private poses: Pose[] = [];
  private rects: DOMRect[] = [];
  private caseMove?: { index: number; progress: number; rect: DOMRect };
  private flip?: gsap.core.Tween;
  private first?: Pose[];
  private blend = { t: 1 };
  private disposed = false;

  constructor(private stage: Stage | null, private cards: Project[]) {
    super();
    this.mode = stage ? 'strip' : 'grid';
    this.slots = filteredIndices(cards, 'all');
    this.hoverScales = cards.map(() => ({ value: 1 }));
    this.meshes = cards.map(() => {
      const material = new ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uCover: { value: null }, uCrop: { value: new Vector2(1, 1) },
          uScreenSize: { value: new Vector2(1, 1) }, uBend: { value: 0 },
          uOpacity: { value: 0 }, uBlur: { value: 0 }, uFlare: { value: 0 },
        },
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    });
    this.layer = {
      update: (dt) => this.advance(dt),
      renderOverlay: (renderer) => {
        if (!this.amount || !this.meshes.some(m => m.visible)) return;
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        try {
          renderer.render(this.scene, this.camera);
        } finally { renderer.autoClear = autoClear; }
      },
    };
    stage?.add(this.layer);
    stage?.signal.addEventListener('abort', () => {
      this.stage = null;
      this.mode = 'grid';
      this.flip?.kill();
      this.dispatchEvent(new Event('change'));
    }, { once: true });
    addEventListener('resize', this.relayout);
    this.relayout();
  }

  get hasStage() { return this.stage !== null; }
  private programs?: Promise<void>;
  preparePrograms(): Promise<void> {
    if (!this.stage || !this.meshes.length) return Promise.resolve();
    const renderer = this.stage.renderer;
    return this.programs ??= renderer.compileAsync(this.scene, this.camera).then(() => {
      if (this.disposed || !this.stage) return;
      const mesh = this.meshes[0], visible = mesh.visible;
      mesh.visible = true;
      try { warmDraw(renderer, this.scene, this.camera); } finally { mesh.visible = visible; }
    });
  }
  get active() { return this.slots.length ? this.slots[wrap(Math.round(this.position), this.slots.length)] : -1; }
  get indices(): readonly number[] { return this.slots; }
  get presence() { return this.amount; }
  get departureFold() { return this.fold; }
  set departureFold(value: number) {
    this.fold = clamp(value, 0, 1);
    this.relayout();
  }
  get offset() { return this.position; }
  set offset(value: number) {
    const before = this.active;
    this.position = this.destination = clamp(value, 0, Math.max(0, this.slots.length - 1));
    this.velocity = 0;
    this.relayout();
    if (before !== this.active) this.dispatchEvent(new Event('change'));
  }

  get view() { return this.mode; }
  set view(value: View) {
    if (!this.stage || value === this.mode) return;
    this.flipLayout(() => { this.mode = value; this.scroll = 0; });
  }

  private gridSize() {
    const width = innerWidth * (isNarrow() ? .44 : .38);
    return { width, height: width*9/16, gap: innerWidth * .018, top: innerHeight * .18 };
  }
  get gridHeight() {
    const g = this.gridSize();
    return Math.max(innerHeight, g.top + Math.ceil(this.slots.length/2) * (g.height + g.gap) + g.gap);
  }
  setGridScroll(value: number) {
    const next = clamp(value, 0, Math.max(0, this.gridHeight - innerHeight));
    if (next !== this.scroll) { this.scroll = next; this.relayout(); }
  }

  private flipLayout(change: () => void) {
    this.flip?.kill();
    this.first = this.poses.map(p => ({ ...p }));
    change();
    this.blend.t = this.hasStage && this.amount > 0 ? 0 : 1;
    this.relayout();
    if (!this.blend.t) {
      this.flip = gsap.to(this.blend, { t: 1, duration: CAROUSEL.flip, ease: 'power3.inOut',
        onUpdate: this.relayout, onComplete: () => { this.first = undefined; } });
    } else this.first = undefined;
    this.dispatchEvent(new Event('change'));
  }

  get filter() { return this.category; }
  setFilter(category: Category | 'all') {
    const active = this.active;
    this.flipLayout(() => {
      this.category = category;
      this.slots = filteredIndices(this.cards, category);
      this.position = this.destination = Math.max(0, this.slots.indexOf(active));
      this.velocity = this.scroll = 0;
    });
  }

  setPresence(value: number) {
    const next = clamp(value, 0, 1);
    if (next !== this.amount) { this.amount = next; this.relayout(); }
  }
  setPointer(x: number, y: number) {
    this.orbitX = clamp(x, -1, 1);
    this.orbitY = clamp(y, -1, 1);
    if (this.amount && this.view === 'strip') this.relayout();
  }
  setHover(index: number | null) {
    if (!this.stage || index === this.hovered) return;
    const previous = this.hovered;
    this.hovered = index;
    for (const i of [previous, index]) {
      if (i === null || !this.hoverScales[i]) continue;
      gsap.to(this.hoverScales[i], { value: i === index ? 1.02 : 1, duration: CAROUSEL.flip,
        overwrite: true, ease: 'power2.out', onUpdate: this.relayout });
    }
  }

  center(index: number) {
    const slot = this.slots.indexOf(index);
    if (slot < 0) return;
    if (this.view === 'grid' || !this.stage) { this.offset = slot; return; }
    // Logical navigation stops at either end. Clicking a visible wrapped
    // neighbour still travels the shorter path around the cylinder.
    const n = this.slots.length;
    this.destination = this.position + wrap(slot - this.position + n/2, n) - n/2;
    this.stage.requestOverlay();
  }
  next() {
    const slot = wrap(Math.round(this.destination), this.slots.length);
    if (slot < this.slots.length - 1) this.center(this.slots[slot+1]);
  }
  prev() {
    const slot = wrap(Math.round(this.destination), this.slots.length);
    if (slot > 0) this.center(this.slots[slot-1]);
  }
  plane(i: number) { return this.meshes[i]; }
  cardRect(i: number) { return this.rects[i] ?? new DOMRect(); }
  cardOrder(i: number) { return this.meshes[i]?.renderOrder ?? 0; }

  /** A flat plane at z=0 projects one world unit to one CSS pixel. */
  setCaseProgress(index: number, progress: number, rect: DOMRect) {
    if (!this.meshes[index] || !this.hasStage) return;
    this.caseMove = { index, progress: clamp(progress, 0, 1), rect };
    this.relayout();
  }

  clearCaseProgress() {
    if (!this.caseMove) return;
    this.caseMove = undefined;
    this.relayout();
  }

  private advance(dt: number) {
    if (this.position === this.destination && !this.velocity) return false;
    const before = this.active;
    // Integrate a damped follower with glide as the damping rate. Substeps
    // keep its response consistent on slower displays.
    const delta = dt * gsap.globalTimeline.timeScale();
    const n = Math.max(1, Math.ceil(delta * DU.follow));
    const step = delta / n;
    for (let i = 0; i < n; i++) {
      this.velocity += (this.destination - this.position) * DU.follow * DU.glide * step;
      this.velocity *= Math.exp(-2 * DU.glide * step);
      this.position += this.velocity * step;
    }
    if (Math.abs(this.position-this.destination) < .001 && Math.abs(this.velocity) < .01) {
      this.position = this.destination = wrap(Math.round(this.destination), this.slots.length);
      this.velocity = 0;
    }
    this.relayout();
    if (before !== this.active) this.dispatchEvent(new Event('change'));
    return this.position !== this.destination || !!this.velocity;
  }

  /** Finish image decoding and texture uploads before the first moving card can draw. */
  prepareCovers(): Promise<void> {
    const stage = this.stage;
    if (!stage || this.disposed) return Promise.resolve();
    this.coversReady ??= Promise.all(this.cards.map(async (card, index) => {
      let bitmap: ImageBitmap | undefined;
      try {
        const signal = AbortSignal.any([stage.signal, AbortSignal.timeout(LOAD_TIMEOUT * 1000)]);
        const response = await fetch(card.cover, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        await stage.preparation.run(() => {
          if (this.disposed || !bitmap) return true;
          const texture = new Texture(bitmap);
          texture.colorSpace = SRGBColorSpace;
          texture.needsUpdate = true;
          stage.renderer.initTexture(texture);
          this.textures.push(texture);
          this.meshes[index].material.uniforms.uCover.value = texture;
          bitmap = undefined; // Keep the source alive for WebGL context restoration.
          return true;
        }, stage.signal);
      } catch (error) {
        if (!stage.signal.aborted) console.warn('[carousel] cover unavailable', card.cover, error);
      } finally { bitmap?.close(); }
    })).then(() => { if (!this.disposed && this.amount) this.relayout(); });
    return this.coversReady;
  }

  private relayout = () => {
    if (this.disposed) return;
    const W = innerWidth, H = innerHeight, focal = 1.8*H;
    this.camera.aspect = W/H;
    this.camera.fov = MathUtils.radToDeg(2*Math.atan(H/(2*focal)));
    this.camera.near = 1; this.camera.far = 20*(W+H);
    this.camera.position.z = focal;
    this.camera.updateProjectionMatrix();

    const narrow = isNarrow();
    const width = W*(narrow ? .8 : 420/1568);
    const height = width*260/420;
    const spacing = width*(narrow ? 1.09 : 1.13);
    const radius = width*3.6;
    const g = this.gridSize();
    this.meshes.forEach((mesh, i) => {
      const index = this.slots.indexOf(i);
      const d = index < 0 ? 0 : wrap(index-this.position+this.slots.length/2, this.slots.length)-this.slots.length/2;
      const s = cardPose(d, 0, { radius, spacing });
      let pose: Pose;
      if (this.mode === 'strip') {
        const edgeOpacity = clamp(2.75 - Math.abs(d), 0, 1);
        // At the edge the reference strip flares outward. Separate its outer
        // peeks from the complete adjacent cards before applying the edge lens.
        const lateral = narrow ? 0 : Math.sign(d)*width*.4*Math.max(0, Math.abs(d)-1)**2;
        pose = {
          x: s.x + lateral + this.orbitX*W*.004, y: H*.015 - this.orbitY*H*.006, z: s.z - (1-this.amount)*focal*1.7,
          width, height: height*(1-s.z/focal), yaw: s.rotY + this.orbitX*.012, bend: width/radius, flare: narrow ? 0 : .73,
          opacity: this.amount * edgeOpacity * Math.max(.25, 1-(s.depth-1)*1.4),
          blur: blurPx(s.depth-1 + (1-this.amount)*.35),
        };
      } else {
        const gp = gridPose(Math.max(0,index),2,g.width,g.height,g.gap);
        pose = { x: gp.x-(g.width+g.gap)/2, y: H/2-(g.top+gp.y+g.height/2-this.scroll),
          z: 0, width:g.width, height:g.height, yaw:0, bend:0, opacity:this.amount, blur:0, flare:0 };
      }
      if (index < 0) pose = { ...(this.first?.[i] ?? pose), opacity:0 };
      if (this.first && this.blend.t < 1) pose = mixPoses(this.first[i], pose, this.blend.t);
      if (this.fold > 0) {
        // As the strip comes forward, each card hinges towards its outer edge.
        const side = pose.x < 0 ? -1 : 1;
        const hinge = this.fold * this.fold;
        pose.z += focal * .52 * this.fold;
        pose.yaw = lerp(pose.yaw, side * Math.PI / 2, hinge);
        pose.x += side * pose.width * .5 * hinge;
        pose.bend *= 1 - hinge;
        pose.width *= 1 - .99 * hinge * hinge;
      }
      pose.width *= this.hoverScales[i].value;
      pose.height *= this.hoverScales[i].value;
      const move = this.caseMove;
      const selected = move?.index === i;
      if (move && selected) {
        const r = move.rect;
        pose = mixPoses(pose, {
          x: r.left + r.width/2 - W/2, y: H/2 - r.top - r.height/2, z: 0,
          width: r.width, height: r.height, yaw: 0, bend: 0, flare: 0,
          opacity: this.amount, blur: 0,
        }, move.progress);
      } else if (move) {
        pose.opacity *= 1 - move.progress;
        pose.blur = lerp(pose.blur, blurPx(1), move.progress);
      }
      this.poses[i] = pose;
      const rect = screenRect(pose, W, H, focal);
      this.rects[i] = index >= 0 && pose.opacity > .001 ? rect : new DOMRect();
      const visible = pose.opacity > .001 && rect.right > 0 && rect.left < W && rect.bottom > 0 && rect.top < H;
      const u = mesh.material.uniforms;
      mesh.visible = visible && !!u.uCover.value;
      mesh.renderOrder = Math.round(focal * (selected ? 6 : 4) + pose.z) * this.cards.length + i;
      mesh.position.set(pose.x,pose.y,pose.z);
      mesh.rotation.y = pose.yaw;
      mesh.scale.set(pose.width,pose.height/.5625,pose.width);
      u.uBend.value=pose.bend; u.uBlur.value=pose.blur; u.uOpacity.value=pose.opacity;
      u.uFlare.value = pose.flare;
      const crop = pose.width/pose.height/(16/9);
      u.uCrop.value.set(Math.min(1,crop),Math.min(1,1/crop));
      u.uScreenSize.value.set(rect.width,rect.height);
      if (import.meta.env.VITE_EXPOSE_APP === '1' && selected && move.progress === 1 && mesh.visible) {
        // The bend and flare are zero at handoff. Project the mesh's actual
        // corner vertices independently of both the destination and screenRect.
        mesh.updateWorldMatrix(true, false);
        this.camera.updateWorldMatrix(true, false);
        const positions = mesh.geometry.getAttribute('position');
        const corner = (n: number) => new Vector3().fromBufferAttribute(positions, n)
          .applyMatrix4(mesh.matrixWorld).project(this.camera);
        const tl = corner(0), br = corner(positions.count - 1);
        this.lastHandoffRect = new DOMRect((tl.x+1)*W/2, (1-tl.y)*H/2,
          (br.x-tl.x)*W/2, (tl.y-br.y)*H/2);
      }
    });
    this.stage?.requestOverlay();
    this.dispatchEvent(new Event('layout'));
  };

  dispose() {
    this.disposed = true;
    removeEventListener('resize', this.relayout);
    this.flip?.kill();
    gsap.killTweensOf(this.hoverScales);
    this.stage?.remove(this.layer);
    this.geometry.dispose();
    this.meshes.forEach(mesh => mesh.material.dispose());
    this.textures.forEach(tex => { tex.dispose(); tex.image.close(); });
  }
}

export function createCarousel(stage: Stage | null, cards: Project[]): Carousel {
  return new Carousel(stage, cards);
}
