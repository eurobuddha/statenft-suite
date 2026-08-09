// Still-image InputSource — replaces filtr's source.ts (image/video/gif/
// webcam) with the only kind the FILTR tab needs: a canvas upload. Same
// texture contract as the original (no FLIP_Y — the composite pass restores
// orientation).
export class InputSource {
  kind = 'none'
  width = 0
  height = 0
  texture: WebGLTexture
  name: string | null = null
  isTimeBased = false
  isPlaying = false
  duration = 0
  currentTime = 0
  frameCount = 0

  private gl: WebGL2RenderingContext
  private changed = false

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([20, 20, 20, 255]))
  }

  /** Load a canvas/bitmap as the source — uploaded immediately, so a bare
   *  renderNow() (no animation loop) sees the real pixels. */
  setImage(src: HTMLCanvasElement | ImageBitmap, name?: string) {
    this.width = src.width
    this.height = src.height
    this.kind = 'image'
    this.name = name ?? null
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    this.changed = true
  }

  update(_now: number): boolean {
    const c = this.changed
    this.changed = false
    return c
  }

  play() {}
  pause() {}
  togglePlay() {}
  seek(_t: number) {}

  dispose() {
    this.gl.deleteTexture(this.texture)
  }
}
