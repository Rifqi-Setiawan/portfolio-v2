// Shared by the photograph and the points. Work in CSS pixels so the seam
// lands in the same place at every device pixel ratio.
uniform float uNarrow;
uniform float uMobilePanelStart;
uniform float uDesktopPanelStart;
uniform float uPixelRatio;
uniform float uEdgeSoft;
uniform float uEdgeRough;
uniform float uEyesInk;

float splitNoise(float n) { return fract(sin(n * 41.73) * 14713.35); }
float splitRight(vec2 uv) {
  if (uSplit <= 0.0) return 0.0;
  vec2 size = uRes / uPixelRatio;
  vec2 axis = uNarrow > 0.5 ? vec2((1.0-uv.y)*size.y, uv.x*size.x) : uv*size;
  float extent = uNarrow > 0.5 ? size.y : size.x;
  float panelStart = uNarrow > 0.5 ? uMobilePanelStart : uDesktopPanelStart;
  if (uEyesInk >= 1.0) return 1.0;
  if (uSplit >= 1.0 && uEyesInk == 0.0) return smoothstep(-.6, .6, axis.x - extent * panelStart);
  float lowerPanel = 0.0;
  if (uNarrow > 0.5 && uEyesInk > 0.0) {
    // Keep the mobile article cream while uncovering the upper photograph left to right.
    lowerPanel = smoothstep(-.6, .6, axis.x - extent * panelStart);
    axis = uv * size;
    extent = size.x;
    panelStart = 1.0;
  }
  // Entering from Contacts moves the photographic edge in from the opposite side.
  float edge = mix(extent, extent * panelStart, uSplit) * (1.0 - uEyesInk);
  float q = axis.y / uEdgeRough;
  float wave = mix(splitNoise(floor(q)), splitNoise(floor(q)+1.0), smoothstep(0.0, 1.0, fract(q)));
  float travel = sin((uEyesInk > 0.0 ? uEyesInk : uSplit) * 3.141593);
  // Stagger small groups of scanlines across the travelling edge, then resolve
  // to the clean stationary photo/ink boundary. Use the same mask for both layers.
  float row = axis.y / 3.0;
  float tooth = mix(splitNoise(floor(row)), splitNoise(floor(row)+1.0), smoothstep(0.0, 1.0, fract(row)));
  edge += ((wave-.5)*uEdgeSoft*.08 + (tooth-.5)*uEdgeRough*.18
          + (splitNoise(floor(axis.y))-.5)*uEdgeRough*.04) * travel;
  float feather = 0.6 + uEdgeSoft*.012*travel;
  return max(lowerPanel, smoothstep(-feather, feather, axis.x-edge));
}
