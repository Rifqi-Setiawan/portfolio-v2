// A stable, irregular contour on the soft screen-space wear field.
uniform sampler2D tWear;
uniform float uWearActive;
uniform vec2 uWearThreshold;
float brushSeed(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(.1031, .11369, .13787));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}
float brushNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f *= f * (3.0 - 2.0 * f);
  return mix(mix(brushSeed(i), brushSeed(i + vec2(1.,0.)), f.x),
             mix(brushSeed(i + vec2(0.,1.)), brushSeed(i + 1.), f.x), f.y);
}
float brushMask(vec2 uv) {
  if (uWearActive == 0.0) return 0.0;
  float wear = texture2D(tWear, uv).r;
  if (wear <= uWearThreshold.x) return 0.0;
  if (wear > uWearThreshold.y) return 1.0;
  vec2 cells = uv * uRes / uRes.y * 54.0;
  float noise = .7 * brushNoise(cells) + .3 * brushNoise(3.7 * cells);
  // Leave connected patches of fill between the high-noise tears as the stroke heals.
  noise *= .25 + .75 * noise;
  float threshold = mix(uWearThreshold.x, uWearThreshold.y, noise);
  return wear > threshold ? 1.0 : 0.0;
}
