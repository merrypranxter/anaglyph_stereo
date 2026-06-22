// anaglyph_stereo — main.js
// Entry point. WebGL2 multi-pass pipeline:
//   1. depth pass   (sdf-scene | raymarch-depth | upload-depth)
//   2. views pass   (views.frag, MRT -> viewL, viewR)
//   3. compose pass (anaglyph.frag | lenticular.frag)
//   4. post pass    (post-process.frag, drawn straight to canvas)

import { Source } from './source.js';
import { getDuboisMatrices } from './dubois.js';
import { PALETTES, buildRamp } from './color-maps.js';

const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2');
if (!gl) {
  document.body.innerHTML = '<p style="color:#fff;font-family:monospace;padding:2rem">WebGL2 is required for anaglyph_stereo.</p>';
  throw new Error('no webgl2');
}

// ---------- shader / program helpers ----------

async function fetchText(url) {
  const res = await fetch(url);
  return res.text();
}

function compileShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}

function createProgram(vertSrc, fragSrc) {
  const vs = compileShader(gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);
    throw new Error('Program link error: ' + log);
  }
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function uniformLocs(prog, names) {
  const out = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

// fullscreen quad, shared by every pass
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

function drawQuad() {
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

// ---------- framebuffers ----------

function createTexture(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

let depthTex, depthFBO;
let viewLTex, viewRTex, viewsFBO;
let composeTex, composeFBO;

function destroyFBOs() {
  for (const tex of [depthTex, viewLTex, viewRTex, composeTex]) {
    if (tex) gl.deleteTexture(tex);
  }
  for (const fbo of [depthFBO, viewsFBO, composeFBO]) {
    if (fbo) gl.deleteFramebuffer(fbo);
  }
}

function buildFBOs(w, h) {
  destroyFBOs();
  depthTex = createTexture(w, h);
  depthFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTex, 0);

  viewLTex = createTexture(w, h);
  viewRTex = createTexture(w, h);
  viewsFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, viewsFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, viewLTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, viewRTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

  composeTex = createTexture(w, h);
  composeFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, composeFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, composeTex, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---------- state ----------

const state = {
  mode: 'anaglyph_dubois',
  depthSource: 'sdf',
  separation: 0.03,
  depthScale: 1.0,
  viewCount: 8,
  period: 1 / 120,
  angleDrive: 'mouse',
  ghostBlur: 0.3,
  chromatic: 0.0015,
  glitch: 0.0,
  invertDepth: false,
  showDepth: false,
  palette: 'acid',
  mouseX: 0.5,
};

const PRESETS = {
  red_cyan_classic: { mode: 'anaglyph_dubois', separation: 0.03, depthScale: 1.0, ghostBlur: 0.3, chromatic: 0.0015, glitch: 0.0 },
  lenticular_ripple: { mode: 'lenticular', viewCount: 8, period: 1 / 120, angleDrive: 'mouse', separation: 0.08, depthScale: 1.0, glitch: 0.0 },
  wiggle_gif: { mode: 'wiggle', separation: 0.04, oscSpeed: 6.0, ghostBlur: 0.1, chromatic: 0.0, glitch: 0.0 },
  depth_glitch: { mode: 'anaglyph_dubois', separation: 0.15, depthScale: 2.0, ghostBlur: 0.0, chromatic: 0.0, glitch: 1.0 },
};

state.oscSpeed = 6.0;

// ---------- resources ----------

let source;
let depthUploadTex = null;
let rampTex;

let depthPrograms = {};
let depthPrograms = {};
let depthU = {};
let viewsProgram, viewsU;
let anaglyphProgram, anaglyphU;
let lenticularProgram, lenticularU;
let postProgram, postU;

async function init() {
  resize();
  buildFBOs(canvas.width, canvas.height);

  source = new Source(gl);
  seedDefaultSource();

  depthUploadTex = createTexture(2, 2);

  const [sdfSrc, raymarchSrc, uploadSrc, viewsSrc, anaglyphSrc, lenticularSrc, postSrc] = await Promise.all([
    fetchText('src/shaders/depth/sdf-scene.glsl'),
    fetchText('src/shaders/depth/raymarch-depth.glsl'),
    fetchText('src/shaders/depth/upload-depth.glsl'),
    fetchText('src/shaders/views.frag'),
    fetchText('src/shaders/anaglyph.frag'),
    fetchText('src/shaders/lenticular.frag'),
    fetchText('src/shaders/post-process.frag'),
  ]);

  depthPrograms.sdf = createProgram(VERT_SRC, sdfSrc);
  depthPrograms.raymarch = createProgram(VERT_SRC, raymarchSrc);
  depthPrograms.upload = createProgram(VERT_SRC, uploadSrc);

  depthU.sdf = uniformLocs(depthPrograms.sdf, ['u_resolution', 'u_time']);
  depthU.raymarch = uniformLocs(depthPrograms.raymarch, ['u_resolution', 'u_time']);
  depthU.upload = uniformLocs(depthPrograms.upload, ['u_depthUpload', 'u_invert']);

  viewsProgram = createProgram(VERT_SRC, viewsSrc);
  viewsU = uniformLocs(viewsProgram, ['u_source', 'u_depth', 'u_separation', 'u_depthScale']);

  anaglyphProgram = createProgram(VERT_SRC, anaglyphSrc);
  anaglyphU = uniformLocs(anaglyphProgram, ['u_viewL', 'u_viewR', 'u_mode', 'u_matL', 'u_matR']);

  lenticularProgram = createProgram(VERT_SRC, lenticularSrc);
  lenticularU = uniformLocs(lenticularProgram, ['u_source', 'u_depth', 'u_separation', 'u_depthScale', 'u_viewCount', 'u_period', 'u_angle']);

  postProgram = createProgram(VERT_SRC, postSrc);
  postU = uniformLocs(postProgram, [
    'u_input', 'u_viewL', 'u_viewR', 'u_depth', 'u_ramp', 'u_resolution', 'u_time',
    'u_wiggle', 'u_oscSpeed', 'u_ghostBlur', 'u_chromatic', 'u_glitch', 'u_showDepth',
  ]);

  rampTex = buildRamp(gl, PALETTES[state.palette]);

  wireUI();
  requestAnimationFrame(loop);
}

// procedural default image so the demo works before any upload
function seedDefaultSource() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#10002b');
  grad.addColorStop(1, '#3a0ca3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const dots = [
    [160, 200, 80, '#ff006e'],
    [340, 260, 60, '#4cc9f0'],
    [256, 380, 100, '#ffbe0b'],
    [380, 150, 40, '#fb5607'],
  ];
  for (const [x, y, r, color] of dots) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
  }
  source.uploadImageElement(c);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

// ---------- render passes ----------

function renderDepth(time) {
  const source = state.depthSource;
  const prog = depthPrograms[source] || depthPrograms.sdf;
  const u = depthU[source] || depthU.sdf;

  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFBO);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(prog);

  if (source === 'upload') {
    gl.uniform1i(u.u_depthUpload, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, depthUploadTex);
    gl.uniform1i(u.u_invert, state.invertDepth ? 1 : 0);
  } else {
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u.u_time, time);
  }
  drawQuad();
}

function renderViews() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, viewsFBO);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(viewsProgram);
  gl.uniform1i(viewsU.u_source, 0);
  gl.uniform1i(viewsU.u_depth, 1);
  gl.uniform1f(viewsU.u_separation, state.separation);
  gl.uniform1f(viewsU.u_depthScale, state.depthScale);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, source.texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);

  drawQuad();
}

function renderCompose() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, composeFBO);
  gl.viewport(0, 0, canvas.width, canvas.height);

  if (state.mode === 'lenticular') {
    gl.useProgram(lenticularProgram);
    gl.uniform1i(lenticularU.u_source, 0);
    gl.uniform1i(lenticularU.u_depth, 1);
    gl.uniform1f(lenticularU.u_separation, state.separation);
    gl.uniform1f(lenticularU.u_depthScale, state.depthScale);
    gl.uniform1f(lenticularU.u_viewCount, state.viewCount);
    gl.uniform1f(lenticularU.u_period, state.period);
    gl.uniform1f(lenticularU.u_angle, getAngle());

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
  } else {
    const { matL, matR } = getDuboisMatrices();
    gl.useProgram(anaglyphProgram);
    gl.uniform1i(anaglyphU.u_viewL, 0);
    gl.uniform1i(anaglyphU.u_viewR, 1);
    gl.uniform1i(anaglyphU.u_mode, state.mode === 'anaglyph_color' ? 1 : 0);
    gl.uniformMatrix3fv(anaglyphU.u_matL, false, matL);
    gl.uniformMatrix3fv(anaglyphU.u_matR, false, matR);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, viewLTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, viewRTex);
  }

  drawQuad();
}

function renderPost(time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(postProgram);

  gl.uniform1i(postU.u_input, 0);
  gl.uniform1i(postU.u_viewL, 1);
  gl.uniform1i(postU.u_viewR, 2);
  gl.uniform1i(postU.u_depth, 3);
  gl.uniform1i(postU.u_ramp, 4);
  gl.uniform2f(postU.u_resolution, canvas.width, canvas.height);
  gl.uniform1f(postU.u_time, time);
  gl.uniform1i(postU.u_wiggle, state.mode === 'wiggle' ? 1 : 0);
  gl.uniform1f(postU.u_oscSpeed, state.oscSpeed);
  gl.uniform1f(postU.u_ghostBlur, state.ghostBlur);
  gl.uniform1f(postU.u_chromatic, state.chromatic);
  gl.uniform1f(postU.u_glitch, state.glitch);
  gl.uniform1i(postU.u_showDepth, state.showDepth ? 1 : 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, composeTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, viewLTex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, viewRTex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, rampTex);

  drawQuad();
}

function getAngle() {
  if (state.angleDrive === 'mouse') return state.mouseX;
  if (state.angleDrive === 'time') return (performance.now() * 0.0002) % 1.0;
  // gyro: fall back to a gentle automatic sweep (no orientation sensor permission requested)
  return (Math.sin(performance.now() * 0.0006) * 0.5 + 0.5);
}

function loop(timeMs) {
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    resize();
    buildFBOs(w, h);
  }

  if (source.video) source.updateFromWebcam();

  const time = timeMs * 0.001;
  renderDepth(time);
  if (state.mode !== 'lenticular') renderViews();
  renderCompose();
  renderPost(time);

  requestAnimationFrame(loop);
}

// ---------- UI wiring ----------

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.assign(state, p);
  syncUIFromState();
}

function syncUIFromState() {
  const el = (id) => document.getElementById(id);
  el('mode').value = state.mode;
  el('separation').value = state.separation;
  el('separationVal').textContent = state.separation.toFixed(3);
  el('depthScale').value = state.depthScale;
  el('depthScaleVal').textContent = state.depthScale.toFixed(2);
  el('viewCount').value = state.viewCount;
  el('viewCountVal').textContent = state.viewCount;
  el('angleDrive').value = state.angleDrive;
  el('ghostBlur').value = state.ghostBlur;
  el('ghostBlurVal').textContent = state.ghostBlur.toFixed(2);
  el('chromatic').value = state.chromatic;
  el('chromaticVal').textContent = state.chromatic.toFixed(4);
  el('glitch').value = state.glitch;
  el('glitchVal').textContent = state.glitch.toFixed(2);
  el('oscSpeed').value = state.oscSpeed;
  el('oscSpeedVal').textContent = state.oscSpeed.toFixed(1);
  updateModeVisibility();
}

function updateModeVisibility() {
  document.getElementById('lenticularControls').style.display = state.mode === 'lenticular' ? 'block' : 'none';
  document.getElementById('wiggleControls').style.display = state.mode === 'wiggle' ? 'block' : 'none';
}

function wireUI() {
  const el = (id) => document.getElementById(id);

  el('preset').addEventListener('change', (e) => applyPreset(e.target.value));

  el('mode').addEventListener('change', (e) => { state.mode = e.target.value; updateModeVisibility(); });

  el('separation').addEventListener('input', (e) => {
    state.separation = parseFloat(e.target.value);
    el('separationVal').textContent = state.separation.toFixed(3);
  });
  el('depthScale').addEventListener('input', (e) => {
    state.depthScale = parseFloat(e.target.value);
    el('depthScaleVal').textContent = state.depthScale.toFixed(2);
  });
  el('viewCount').addEventListener('input', (e) => {
    state.viewCount = parseInt(e.target.value, 10);
    el('viewCountVal').textContent = state.viewCount;
  });
  el('angleDrive').addEventListener('change', (e) => { state.angleDrive = e.target.value; });
  el('depthSource').addEventListener('change', (e) => {
    state.depthSource = e.target.value;
    el('uploadDepthRow').style.display = e.target.value === 'upload' ? 'flex' : 'none';
  });
  el('ghostBlur').addEventListener('input', (e) => {
    state.ghostBlur = parseFloat(e.target.value);
    el('ghostBlurVal').textContent = state.ghostBlur.toFixed(2);
  });
  el('chromatic').addEventListener('input', (e) => {
    state.chromatic = parseFloat(e.target.value);
    el('chromaticVal').textContent = state.chromatic.toFixed(4);
  });
  el('glitch').addEventListener('input', (e) => {
    state.glitch = parseFloat(e.target.value);
    el('glitchVal').textContent = state.glitch.toFixed(2);
  });
  el('oscSpeed').addEventListener('input', (e) => {
    state.oscSpeed = parseFloat(e.target.value);
    el('oscSpeedVal').textContent = state.oscSpeed.toFixed(1);
  });
  el('invertDepth').addEventListener('change', (e) => { state.invertDepth = e.target.checked; });
  el('showDepth').addEventListener('change', (e) => { state.showDepth = e.target.checked; });

  el('palette').addEventListener('change', (e) => {
    state.palette = e.target.value;
    if (rampTex) gl.deleteTexture(rampTex);
    rampTex = buildRamp(gl, PALETTES[state.palette]);
  });

  el('sourceFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) source.fromImage(file);
  });

  el('depthFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, depthUploadTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      URL.revokeObjectURL(img.src);
      el('depthSource').value = 'upload';
      state.depthSource = 'upload';
      el('uploadDepthRow').style.display = 'flex';
    };
    img.src = URL.createObjectURL(file);
  });

  el('webcamBtn').addEventListener('click', async () => {
    try {
      await source.fromWebcam();
    } catch (err) {
      console.warn('webcam unavailable', err);
      alert('Webcam access denied or unavailable.');
    }
  });

  window.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX / window.innerWidth;
  });

  syncUIFromState();
}

init();
