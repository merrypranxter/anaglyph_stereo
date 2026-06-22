#version 300 es
precision highp float;

// anaglyph_stereo — lenticular.frag
// N-view strip interlace. The screen can't physically tilt, so the
// "viewing angle" is faked via mouse position or a time sweep
// (u_angle), and each vertical strip of period u_period reveals one of
// u_viewCount discrete eye-offsets — exactly what a real lenticular
// lens sheet does optically, simulated per-pixel.

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform float u_separation;
uniform float u_depthScale;
uniform float u_viewCount; // 2–16
uniform float u_period;    // strip width in UV space
uniform float u_angle;     // simulated viewing angle, 0–1 sweep

void main() {
  float n = max(u_viewCount, 2.0);

  // viewIndex = floor(uv.x / p + t) mod N
  float raw = floor(v_uv.x / u_period + u_angle);
  float viewIndex = mod(raw, n);

  // map discrete view index to a centered eye-offset in [-1, 1]
  float offset = (viewIndex / (n - 1.0)) * 2.0 - 1.0;

  float depth = texture(u_depth, v_uv).r * u_depthScale;
  float shift = depth * offset * u_separation * 0.5;

  vec2 uv = clamp(v_uv + vec2(shift, 0.0), 0.0, 1.0);
  outColor = texture(u_source, uv);
}
