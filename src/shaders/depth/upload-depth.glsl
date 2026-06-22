#version 300 es
precision highp float;

// anaglyph_stereo — depth/upload-depth.glsl
// Passthrough for a user-uploaded depth map. Converts to luminance so any
// grayscale-ish depth image (or even a busy RGB one) reduces to a single
// usable depth channel for views.frag.

in vec2 v_uv;
out vec4 outDepth;

uniform sampler2D u_depthUpload;
uniform bool u_invert;

void main() {
  vec3 c = texture(u_depthUpload, v_uv).rgb;
  float depth = dot(c, vec3(0.299, 0.587, 0.114));
  if (u_invert) depth = 1.0 - depth;
  outDepth = vec4(depth, depth, depth, 1.0);
}
