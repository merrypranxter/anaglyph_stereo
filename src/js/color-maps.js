// anaglyph_stereo — color-maps.js
// 256px DataTexture ramps, used by the depth-debug view (post-process.frag
// samples u_ramp by raw depth value) so a flat grayscale depth map reads
// as a neon gradient instead.

export const PALETTES = {
  acid: ['#0a001a', '#8338ec', '#ff006e', '#ffbe0b', '#fb5607'],
  void_bloom: ['#000000', '#3a0ca3', '#f72585', '#4cc9f0', '#ffffff'],
  plasma: ['#1a0000', '#8b0000', '#ff4500', '#ffd700', '#ffffff'],
  mono: ['#000000', '#ffffff'],
};

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function buildRamp(gl, hexArray) {
  const width = 256;
  const data = new Uint8Array(width * 4);
  const stops = hexArray.map(hexToRgb);
  const segments = stops.length - 1;

  for (let i = 0; i < width; i++) {
    const t = i / (width - 1);
    const segF = t * segments;
    const seg = Math.min(Math.floor(segF), segments - 1);
    const localT = segF - seg;
    const [r0, g0, b0] = stops[seg];
    const [r1, g1, b1] = stops[seg + 1];

    data[i * 4 + 0] = Math.round(r0 + (r1 - r0) * localT);
    data[i * 4 + 1] = Math.round(g0 + (g1 - g0) * localT);
    data[i * 4 + 2] = Math.round(b0 + (b1 - b0) * localT);
    data[i * 4 + 3] = 255;
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
