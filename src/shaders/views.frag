#version 300 es
precision highp float;

// anaglyph_stereo — views.frag
// Generates the L/R view pair via depth-proportional horizontal UV shift.
// viewL = sample(src, uv + depth * sep * 0.5)
// viewR = sample(src, uv - depth * sep * 0.5)
// Written via MRT so a single pass produces both eyes for anaglyph + wiggle.

in vec2 v_uv;

layout(location = 0) out vec4 outViewL;
layout(location = 1) out vec4 outViewR;

uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform float u_separation;  // eye distance in UV, 0.0–0.2
uniform float u_depthScale;  // parallax depth multiplier, 0.0–2.0

void main() {
  float depth = texture(u_depth, v_uv).r * u_depthScale;
  float shift = depth * u_separation * 0.5;

  vec2 uvL = v_uv + vec2(shift, 0.0);
  vec2 uvR = v_uv - vec2(shift, 0.0);

  outViewL = texture(u_source, clamp(uvL, 0.0, 1.0));
  outViewR = texture(u_source, clamp(uvR, 0.0, 1.0));
}
