#version 300 es
precision highp float;

// anaglyph_stereo — post-process.frag
// Final resolve. Handles:
//  - wiggle mode: hard-alternating viewL/viewR at u_oscSpeed Hz (no glasses)
//  - ghost-reduction: a tiny separable blur that softens Dubois fringing
//  - chromatic correction: subtle per-channel UV nudge
//  - depth_glitch: exaggerated channel tearing for the artifact aesthetic
//  - debug depth view: neon palette ramp lookup over the raw depth map

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_input;   // composed anaglyph or lenticular result
uniform sampler2D u_viewL;
uniform sampler2D u_viewR;
uniform sampler2D u_depth;
uniform sampler2D u_ramp;

uniform vec2 u_resolution;
uniform float u_time;
uniform bool u_wiggle;
uniform float u_oscSpeed;    // Hz
uniform float u_ghostBlur;   // 0.0–1.0
uniform float u_chromatic;   // UV offset for RGB fringe correction
uniform float u_glitch;      // 0.0–1.0 tearing amount (depth_glitch)
uniform bool u_showDepth;

float wiggleEdge = 0.0;

vec3 sampleScene(vec2 uv) {
  if (u_wiggle) {
    return mix(texture(u_viewR, uv).rgb, texture(u_viewL, uv).rgb, wiggleEdge);
  }
  return texture(u_input, uv).rgb;
}

void main() {
  if (u_showDepth) {
    float d = texture(u_depth, v_uv).r;
    outColor = vec4(texture(u_ramp, vec2(d, 0.5)).rgb, 1.0);
    return;
  }

  if (u_wiggle) {
    float phase = sin(u_time * 6.28318530718 * u_oscSpeed);
    wiggleEdge = smoothstep(-0.05, 0.05, phase);
  }

  vec2 px = 1.0 / u_resolution;
  vec3 color = sampleScene(v_uv);

  // ghost-reduction: small 5-tap cross blur, blended in by u_ghostBlur
  if (u_ghostBlur > 0.001) {
    vec3 blurred = color * 0.4;
    blurred += sampleScene(v_uv + vec2(px.x, 0.0)) * 0.15;
    blurred += sampleScene(v_uv - vec2(px.x, 0.0)) * 0.15;
    blurred += sampleScene(v_uv + vec2(0.0, px.y)) * 0.15;
    blurred += sampleScene(v_uv - vec2(0.0, px.y)) * 0.15;
    color = mix(color, blurred, clamp(u_ghostBlur, 0.0, 1.0));
  }

  // chromatic correction: nudge each channel's sample point independently
  if (u_chromatic > 0.0001) {
    float r = sampleScene(v_uv + vec2(u_chromatic, 0.0)).r;
    float b = sampleScene(v_uv - vec2(u_chromatic, 0.0)).b;
    color = vec3(r, color.g, b);
  }

  // depth_glitch: large channel tearing, the image pulling itself apart
  if (u_glitch > 0.0001) {
    float tear = u_glitch * 0.08;
    float r = sampleScene(v_uv + vec2(tear, 0.0)).r;
    float g = sampleScene(v_uv).g;
    float b = sampleScene(v_uv - vec2(tear, 0.0)).b;
    color = vec3(r, g, b);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
