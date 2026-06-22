// anaglyph_stereo — source.js
// Handles u_source input: image upload, webcam, or upstream FBO.

export class Source {
  constructor(gl) {
    this.gl = gl;
    this.texture = gl.createTexture();
    this.width = 0;
    this.height = 0;
    this.video = null;
    this._initBlank();
  }

  _initBlank() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this._setFilters();
  }

  _setFilters() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  _stopVideo() {
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }
    this.video = null;
  }

  uploadImageElement(img) {
    const gl = this.gl;
    this._stopVideo();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this._setFilters();
    this.width = img.width;
    this.height = img.height;
  }

  fromImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.uploadImageElement(img);
        URL.revokeObjectURL(img.src);
        resolve(this);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async fromWebcam() {
    this._stopVideo();
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.video = video;
    this.width = video.videoWidth;
    this.height = video.videoHeight;
    return this;
  }

  // refresh the GPU texture from the live webcam frame; call once per render loop tick
  updateFromWebcam() {
    if (!this.video) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    this._setFilters();
  }

  // adopt an externally-rendered texture (e.g. an upstream finisher's FBO output)
  fromFBO(texture, width, height) {
    this._stopVideo();
    this.texture = texture;
    this.width = width;
    this.height = height;
    return this;
  }
}
