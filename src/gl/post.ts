import {
  type Camera, GLSL3, SRGBColorSpace, type IUniform, Mesh, OrthographicCamera,
  PlaneGeometry, Scene, ShaderMaterial, Vector3, Vector4, WebGLRenderTarget, WebGLRenderer,
} from 'three';

/** Uniforms scenes may tween. All 0 → the pass is an exact passthrough (and is skipped). */
export type PostUniforms = {
  uGrain: IUniform<number>;
  uLens: IUniform<number>;
  uLensSoft: IUniform<number>;
  uRoomDim: IUniform<number>;
};

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D tDiffuse;
uniform float uGrain;    // film grain amplitude
uniform float uLens;     // barrel distortion + vignette strength
uniform float uLensSoft; // edge softness (radial blur) strength
uniform float uRoomDim;  // linear attenuation of the retained opaque room
uniform float uTime;
uniform vec3 uFrame;     // viewport in CSS pixels, then root font size

float grainAt(uvec2 pixel, uint frame) {
  // Mix the whole pixel address before extracting 24 bits of noise.
  uint n = pixel.x + 65537u * pixel.y + 2246822519u * frame;
  n = (n ^ (n >> 16u)) * 0x7feb352du;
  n = (n ^ (n >> 15u)) * 0x846ca68bu;
  return float((n ^ (n >> 16u)) >> 8u) / 16777216.0;
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 uv = 0.5 + c * (1.0 + uLens * 0.25 * r2);
  vec4 col = texture(tDiffuse, uv);

  if (uLensSoft > 0.0) {
    vec2 d = c * (uLensSoft * 0.02 * r2 * 4.0);
    col = col * 0.4 + 0.15 * (texture(tDiffuse, uv + d) + texture(tDiffuse, uv - d)
        + texture(tDiffuse, uv + vec2(-d.y, d.x)) + texture(tDiffuse, uv + vec2(d.y, -d.x)));
  }

  col.rgb *= (1.0 - uRoomDim) * (1.0 - uLens * smoothstep(0.1, 0.55, r2) * 0.9);

  float grain = grainAt(uvec2(gl_FragCoord.xy), uint(uTime * 24.0)) - 0.5;
  // Apply grain in display space so dark walls receive the same amplitude as highlights.
  vec3 displayColor = clamp(toSrgb(col.rgb) + grain * uGrain, 0.0, 1.0);
  float radius = 2.94 * uFrame.z;
  vec2 edge = (abs(c) - .5) * uFrame.xy + radius;
  float inside = radius - (length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0));
  float shadow = .55 * (1.0 - smoothstep(-.5 * uFrame.z, 3.5 * uFrame.z, inside));
  float vignette = .28 * smoothstep(.62, 1.0, length(c) * 1.4142);
  displayColor *= (1.0 - shadow) * (1.0 - vignette);
  outColor = vec4(mix(vec3(.035), displayColor, smoothstep(-.5, .5, inside)), 1.0);
}`;

export type Post = {
  uniforms: PostUniforms;
  /** True when every effect uniform is 0, so the pass can be skipped. */
  bypassed(): boolean;
  setSize(w: number, h: number, pixelRatio: number): void;
  /** Link the linear scene variants and the display pass before the first photo frame. */
  prepare(renderer: WebGLRenderer, scene: Scene, camera: Camera, signal: AbortSignal): Promise<void>;
  /** Render scene through the pass to the screen. */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, t: number, updateScene?: boolean): void;
  dispose(): void;
};

/** Draw once without changing any visible pixel; material reflection and D3D input layouts are lazy. */
export function warmDraw(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const scissor = renderer.getScissor(new Vector4());
  const tested = renderer.getScissorTest(), clear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, 0, 0);
  try { renderer.render(scene, camera); }
  finally {
    renderer.setScissor(scissor);
    renderer.setScissorTest(tested);
    renderer.autoClear = clear;
  }
}

export function createPost(): Post {
  const uniforms: PostUniforms = {
    uGrain: { value: 0 },
    uLens: { value: 0 },
    uLensSoft: { value: 0 },
    uRoomDim: { value: 0 },
  };
  // This photographic layer is SDR; an sRGB8 buffer preserves shadow precision
  // and supplies linear samples to the lens. Photo and points paint in explicit order.
  const target = new WebGLRenderTarget(1, 1, { colorSpace: SRGBColorSpace, depthBuffer: false });
  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { tDiffuse: { value: target.texture }, uTime: { value: 0 }, uFrame: { value: new Vector3(1, 1, 1) }, ...uniforms },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const postScene = new Scene();
  postScene.add(quad);
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms,
    bypassed: () => !(uniforms.uGrain.value || uniforms.uLens.value || uniforms.uLensSoft.value || uniforms.uRoomDim.value),
    setSize(w, h, pr) {
      mat.uniforms.uFrame.value.set(w, h, parseFloat(getComputedStyle(document.documentElement).fontSize));
      target.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    },
    async prepare(renderer, scene, camera, signal) {
      const atTarget = <T>(action: () => T): T => {
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(target);
        try { return action(); } finally { renderer.setRenderTarget(previous); }
      };
      await renderer.compileAsync(scene, camera);
      signal.throwIfAborted();
      warmDraw(renderer, scene, camera);
      await atTarget(() => renderer.compileAsync(scene, camera));
      signal.throwIfAborted();
      atTarget(() => warmDraw(renderer, scene, camera));
      await renderer.compileAsync(postScene, postCam);
      signal.throwIfAborted();
      warmDraw(renderer, postScene, postCam);
    },
    render(renderer, scene, camera, t, updateScene = true) {
      mat.uniforms.uTime.value = t;
      if (updateScene) {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    },
    dispose() {
      target.dispose();
      mat.dispose();
      quad.geometry.dispose();
    },
  };
}
