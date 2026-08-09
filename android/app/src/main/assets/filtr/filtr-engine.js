/* filtr-engine.js — vendored bundle of tools/filtr's WebGL2 engine (MIT)
 * plus the Atelier port shims. DO NOT EDIT BY HAND: regenerate with
 * filtrport/build.sh (see filtrport/renderer.ts header for the patch list).
 * 15 effects + prep grade + 7 post passes + presets; still images only. */
var FiltrEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // filtrport/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    ADJUST_DEFAULTS: () => ADJUST_DEFAULTS,
    BUILTIN_PRESETS: () => BUILTIN_PRESETS,
    CHARSETS: () => CHARSETS,
    DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
    GLError: () => GLError,
    PALETTES: () => PALETTES,
    Renderer: () => Renderer,
    applyPreset: () => applyPreset,
    bumpDirty: () => bumpDirty,
    freshSettings: () => freshSettings,
    getSettings: () => getSettings,
    hexToVec3: () => hexToVec3,
    paletteById: () => paletteById,
    resolveChars: () => resolveChars,
    setSettings: () => setSettings,
    supported: () => supported
  });

  // ../../../tools/filtr/src/state/defaults.ts
  var DEFAULT_SETTINGS = {
    active: "ascii",
    ascii: {
      scale: 2,
      spacing: 0,
      outputWidth: 0,
      set: "standard",
      customChars: " .:+*#@",
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      sharpness: 0,
      gamma: 1,
      colorMode: "original",
      custom: "#00ff00",
      backgroundColor: "#000000",
      intensity: 1,
      invert: false,
      brightnessMapping: 1,
      edgeEnhance: 0,
      blur: 0,
      quantizeColors: 0
    },
    waveLines: {
      lineCount: 50,
      amplitude: 20,
      frequency: 1,
      direction: "horizontal",
      lineThickness: 1,
      colorMode: "original",
      fgColor: "#ffffff",
      bgColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    dithering: {
      method: "bayer8x8",
      intensity: 1,
      colorMode: "mono",
      colorLevels: 2,
      gamma: 1,
      sharpen: 0,
      foregroundColor: "#FFFFFF",
      backgroundColor: "#000000",
      palette: "gameboy",
      paletteSize: 2,
      brightness: 0,
      contrast: 0
    },
    halftone: {
      shape: "circle",
      dotScale: 1,
      spacing: 8,
      angle: 45,
      invert: false,
      colorMode: "bw",
      fgColor: "#ffffff",
      bgColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    pixelSort: {
      direction: "horizontal",
      mode: "brightness",
      threshold: 0.25,
      streakLength: 100,
      intensity: 0.8,
      reverse: false,
      brightness: 0,
      contrast: 0
    },
    dots: {
      shape: "circle",
      gridType: "square",
      sizeMultiplier: 1,
      spacing: 1,
      invert: false,
      colorMode: "original",
      fgColor: "#ffffff",
      bgColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    contour: {
      fillMode: "filled",
      levels: 8,
      lineThickness: 1,
      invert: false,
      colorMode: "original",
      lineColor: "#000000",
      bgColor: "#ffffff",
      brightness: 0,
      contrast: 0
    },
    edgeDetection: {
      algorithm: "sobel",
      threshold: 0.3,
      lineWidth: 1,
      invert: false,
      colorMode: "custom",
      edgeColor: "#ffffff",
      bgColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    crosshatch: {
      density: 6,
      layers: 3,
      angle: 45,
      lineWidth: 1,
      randomness: 0,
      invert: false,
      fgColor: "#000000",
      bgColor: "#ffffff",
      brightness: 0,
      contrast: 0
    },
    blockify: {
      style: "full",
      blockSize: 8,
      borderWidth: 1,
      colorMode: "color",
      borderColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    threshold: {
      levels: 2,
      thresholdPoint: 0.5,
      dither: false,
      invert: false,
      colorMode: "custom",
      fgColor: "#ffffff",
      bgColor: "#000000",
      brightness: 0,
      contrast: 0
    },
    noiseField: {
      noiseType: "perlin",
      scale: 50,
      intensity: 1,
      octaves: 4,
      speed: 1,
      animate: true,
      distortOnly: false,
      brightness: 0,
      contrast: 0
    },
    matrixRain: {
      characterSet: "standard",
      customChars: "\uFF71\uFF72\uFF73\uFF74\uFF75\uFF76\uFF77\uFF78\uFF79\uFF7A\uFF7B\uFF7C\uFF7D\uFF7E\uFF7F\uFF80\uFF81\uFF82\uFF83\uFF84\uFF85\uFF86\uFF87\uFF88\uFF89\uFF8A\uFF8B\uFF8C\uFF8D\uFF8E\uFF8F\uFF90\uFF91\uFF92\uFF93\uFF94\uFF95\uFF96\uFF97\uFF98\uFF99\uFF9A\uFF9B\uFF9C\uFF9D0123456789",
      cellSize: 12,
      spacing: 0,
      speed: 1,
      trailLength: 15,
      direction: "down",
      glowIntensity: 1,
      bgOpacity: 0.3,
      rainColor: "#00ff00",
      brightness: 0,
      contrast: 0,
      threshold: 0
    },
    vhs: {
      distortion: 0.5,
      noise: 0.3,
      colorBleed: 0.5,
      scanlines: 0.3,
      trackingError: 0.2,
      brightness: 0,
      contrast: 0
    },
    voronoi: {
      cellSize: 30,
      edgeWidth: 0.3,
      edgeColor: 0,
      colorMode: 0,
      randomize: 0.8,
      brightness: 0,
      contrast: 0
    },
    post: {
      bloom: { enabled: false, threshold: 0.3, softThreshold: 0.2, intensity: 1.5, radius: 12 },
      grain: { enabled: false, intensity: 35, size: 2, speed: 50 },
      chromatic: { enabled: false, offset: 2 },
      scanlines: { enabled: false, opacity: 0.1, spacing: 4 },
      vignette: { enabled: false, intensity: 0.5, radius: 0.5 },
      crtCurve: { enabled: false, amount: 0.1 },
      phosphor: { enabled: false, color: "green", customColor: "#00ff00" }
    },
    output: {
      background: "#000000",
      showOriginal: false,
      maxPreviewDim: 4096
    }
  };

  // ../../../tools/filtr/src/state/presets.ts
  var BUILTIN_PRESETS = [
    {
      id: "classic-terminal",
      name: "Classic Terminal",
      builtin: true,
      settings: {
        active: "ascii",
        ascii: { set: "standard", scale: 2, colorMode: "mono", custom: "#33ff66", backgroundColor: "#020a02" },
        post: { scanlines: { enabled: true, opacity: 0.25, spacing: 3 } }
      }
    },
    {
      id: "amber-crt",
      name: "Amber CRT",
      builtin: true,
      settings: {
        active: "ascii",
        ascii: { set: "detailed", scale: 2, colorMode: "mono", custom: "#ffb000", backgroundColor: "#0a0600" },
        post: {
          crtCurve: { enabled: true, amount: 0.18 },
          bloom: { enabled: true, threshold: 0.3, softThreshold: 0.2, intensity: 0.8, radius: 10 },
          scanlines: { enabled: true, opacity: 0.2, spacing: 3 }
        }
      }
    },
    {
      id: "newsprint",
      name: "Newsprint",
      builtin: true,
      settings: {
        active: "halftone",
        halftone: { shape: "circle", spacing: 6, angle: 45, colorMode: "bw", fgColor: "#111111", bgColor: "#f4f1e3", contrast: 15 }
      }
    },
    {
      id: "risograph",
      name: "Risograph",
      builtin: true,
      settings: {
        active: "dithering",
        dithering: { method: "atkinson", colorMode: "indexed", palette: "riso" },
        post: { grain: { enabled: true, intensity: 20, size: 1, speed: 1 } }
      }
    },
    {
      id: "gameboy",
      name: "GameBoy",
      builtin: true,
      settings: {
        active: "dithering",
        dithering: { method: "bayer4x4", colorMode: "indexed", palette: "gameboy" },
        output: { background: "#0f380f", showOriginal: false, maxPreviewDim: 1024 }
      }
    },
    {
      id: "cyberpunk",
      name: "Cyberpunk",
      builtin: true,
      settings: {
        active: "edgeDetection",
        edgeDetection: { algorithm: "sobel", threshold: 0.18, colorMode: "custom", edgeColor: "#05d9e8", bgColor: "#0a0118" },
        post: { bloom: { enabled: true, threshold: 0.2, softThreshold: 0.3, intensity: 1.4, radius: 14 }, chromatic: { enabled: true, offset: 4 } }
      }
    },
    {
      id: "blueprint",
      name: "Blueprint",
      builtin: true,
      settings: {
        active: "edgeDetection",
        edgeDetection: { algorithm: "sobel", threshold: 0.2, colorMode: "custom", edgeColor: "#cfe3ff", bgColor: "#0d2747" }
      }
    },
    {
      id: "comic-ink",
      name: "Comic Ink",
      builtin: true,
      settings: {
        active: "crosshatch",
        crosshatch: { density: 5, layers: 3, angle: 45, lineWidth: 1, fgColor: "#0a0a0a", bgColor: "#ffffff", contrast: 20 }
      }
    },
    {
      id: "matrix-rain",
      name: "Matrix Rain",
      builtin: true,
      settings: {
        active: "matrixRain",
        matrixRain: { cellSize: 12, speed: 1.2, trailLength: 18, rainColor: "#00ff66", glowIntensity: 1.2, bgOpacity: 0.4 },
        post: { bloom: { enabled: true, threshold: 0.3, softThreshold: 0.2, intensity: 0.7, radius: 8 } }
      }
    },
    {
      id: "vaporwave",
      name: "Vaporwave",
      builtin: true,
      settings: {
        active: "dithering",
        dithering: { method: "bayer8x8", colorMode: "original", colorLevels: 4, brightness: 5, contrast: 10 },
        post: {
          chromatic: { enabled: true, offset: 6 },
          grain: { enabled: true, intensity: 25, size: 1, speed: 40 },
          vignette: { enabled: true, intensity: 0.4, radius: 0.6 }
        }
      }
    },
    {
      id: "glitch-sort",
      name: "Glitch Sort",
      builtin: true,
      settings: {
        active: "pixelSort",
        pixelSort: { direction: "vertical", mode: "brightness", threshold: 0.3, streakLength: 200, intensity: 1 },
        post: { chromatic: { enabled: true, offset: 3 } }
      }
    },
    {
      id: "vhs-tape",
      name: "VHS Tape",
      builtin: true,
      settings: {
        active: "vhs",
        vhs: { distortion: 0.5, noise: 0.35, colorBleed: 0.6, scanlines: 0.4, trackingError: 0.3 },
        post: { scanlines: { enabled: true, opacity: 0.15, spacing: 3 } }
      }
    },
    {
      id: "stained-glass",
      name: "Stained Glass",
      builtin: true,
      settings: {
        active: "voronoi",
        voronoi: { cellSize: 36, edgeWidth: 0.4, edgeColor: 0, colorMode: 0, randomize: 0.9 }
      }
    },
    {
      id: "topographic",
      name: "Topographic",
      builtin: true,
      settings: {
        active: "contour",
        contour: { fillMode: "lines", levels: 12, lineThickness: 1, colorMode: "original", bgColor: "#0a0a0a" }
      }
    }
  ];

  // ../../../tools/filtr/src/engine/palettes.ts
  var PALETTES = [
    { id: "none", name: "None", colors: [] },
    { id: "grayscale", name: "Grayscale", colors: ["#000000", "#ffffff"] },
    { id: "gameboy", name: "GameBoy", colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] },
    { id: "amber", name: "Amber", colors: ["#1a0d00", "#7a3d00", "#ff9d1c", "#ffe2a8"] },
    { id: "green", name: "Phosphor", colors: ["#001200", "#0c5c20", "#39ff5a", "#ccffd6"] },
    { id: "c64", name: "Microcomputer", colors: ["#1a1a3d", "#5c4bd1", "#9a86fc", "#cfc6ff"] },
    { id: "newspaper", name: "Newsprint", colors: ["#15140f", "#5a564a", "#b8b09a", "#f4f1e3"] },
    { id: "riso", name: "Risograph", colors: ["#2a2438", "#d6336c", "#f06595", "#f7eede"] },
    { id: "cyberpunk", name: "Cyberpunk", colors: ["#0a0118", "#ff2a6d", "#05d9e8", "#d1f7ff"] },
    { id: "sepia", name: "Sepia", colors: ["#241606", "#7a5230", "#d8b98a", "#f4ecd8"] }
  ];
  function paletteById(id) {
    var _a;
    return (_a = PALETTES.find((p) => p.id === id)) != null ? _a : PALETTES[1];
  }

  // ../../../tools/filtr/src/engine/charsets.ts
  var CHARSETS = [
    { id: "standard", name: "STANDARD", chars: " .:-=+*#%@" },
    { id: "blocks", name: "BLOCKS", chars: " \u2591\u2592\u2593\u2588" },
    { id: "binary", name: "BINARY", chars: " 01" },
    {
      id: "detailed",
      name: "DETAILED",
      chars: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
    },
    { id: "minimal", name: "MINIMAL", chars: " .:#" },
    { id: "alphabetic", name: "ALPHABETIC", chars: " .icotCOXWM" },
    { id: "numeric", name: "NUMERIC", chars: " 1234567890" },
    { id: "math", name: "MATH", chars: " .-+\xD7\xF7=\u2260<>\u2264\u2265\u221E\u2211\u220F\u221A\u222B" },
    { id: "emoji", name: "SYMBOLS", chars: " \xB7\u2022\u25CB\u25CE\u25CF\u25D0\u25D1\u25D2\u25D3\u25D4\u25D5\u25D6\u25D7" },
    { id: "custom", name: "CUSTOM", chars: " .:+*#@" }
  ];
  function charsetById(id) {
    var _a;
    return (_a = CHARSETS.find((c) => c.id === id)) != null ? _a : CHARSETS[0];
  }
  function resolveChars(id, custom) {
    if (id === "custom") return custom.length ? custom : " ";
    return charsetById(id).chars;
  }

  // ../../../tools/filtr/src/engine/gl.ts
  var GLError = class extends Error {
  };
  function createGL(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      // needed for canvas-to-blob export
      powerPreference: "high-performance"
    });
    if (!gl) throw new GLError("WebGL2 is not available in this browser.");
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    return gl;
  }
  var VERT_FULLSCREEN = (
    /* glsl */
    `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`
  );
  function compileShader(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new GLError(`Failed to compile ${label} shader:
${log}

${numberLines(src)}`);
    }
    return sh;
  }
  function numberLines(src) {
    return src.split("\n").map((l, i) => `${String(i + 1).padStart(3, " ")}| ${l}`).join("\n");
  }
  var Program = class {
    constructor(gl, fragSrc, vertSrc = VERT_FULLSCREEN, label = "program") {
      __publicField(this, "gl", gl);
      __publicField(this, "program");
      __publicField(this, "uniformLocs", /* @__PURE__ */ new Map());
      const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc, `${label}:vert`);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, `${label}:frag`);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "a_pos");
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new GLError(`Failed to link ${label}:
${log}`);
      }
      this.program = program;
    }
    loc(name) {
      if (!this.uniformLocs.has(name)) {
        this.uniformLocs.set(name, this.gl.getUniformLocation(this.program, name));
      }
      return this.uniformLocs.get(name);
    }
    use() {
      this.gl.useProgram(this.program);
      return this;
    }
    set(uniforms) {
      const gl = this.gl;
      for (const name in uniforms) {
        const loc = this.loc(name);
        if (loc === null) continue;
        const v = uniforms[name];
        if (typeof v === "number") {
          gl.uniform1f(loc, v);
        } else if (typeof v === "boolean") {
          gl.uniform1f(loc, v ? 1 : 0);
        } else if (Array.isArray(v) || v instanceof Float32Array) {
          const arr = v;
          switch (arr.length) {
            case 2:
              gl.uniform2f(loc, arr[0], arr[1]);
              break;
            case 3:
              gl.uniform3f(loc, arr[0], arr[1], arr[2]);
              break;
            case 4:
              gl.uniform4f(loc, arr[0], arr[1], arr[2], arr[3]);
              break;
            default:
              gl.uniform1fv(loc, arr);
          }
        } else {
          gl.activeTexture(gl.TEXTURE0 + v.unit);
          gl.bindTexture(gl.TEXTURE_2D, v.texture);
          gl.uniform1i(loc, v.unit);
        }
      }
      return this;
    }
    /** Set a `vec3[]` uniform from a flat Float32Array (length = n*3). */
    setVec3Array(name, arr) {
      const loc = this.loc(name);
      if (loc !== null) this.gl.uniform3fv(loc, arr);
      return this;
    }
    dispose() {
      this.gl.deleteProgram(this.program);
    }
  };
  var FullscreenQuad = class {
    constructor(gl) {
      __publicField(this, "gl", gl);
      __publicField(this, "vao");
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.vao = vao;
    }
    draw() {
      this.gl.bindVertexArray(this.vao);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.gl.bindVertexArray(null);
    }
  };
  function hexToVec3(hex) {
    const h = hex.replace("#", "");
    const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
    const int = parseInt(n, 16);
    return [(int >> 16 & 255) / 255, (int >> 8 & 255) / 255, (int & 255) / 255];
  }

  // filtrport/shim-store.ts
  var current = null;
  var dirtyCount = 0;
  var useStore = {
    getState() {
      return { settings: current, dirty: dirtyCount };
    }
  };
  function setSettings(s) {
    current = s;
    dirtyCount++;
  }
  function getSettings() {
    return current;
  }
  function bumpDirty() {
    dirtyCount++;
  }

  // ../../../tools/filtr/src/engine/framebuffer.ts
  var RenderTarget = class {
    constructor(gl, filter = gl.LINEAR) {
      __publicField(this, "gl", gl);
      __publicField(this, "texture");
      __publicField(this, "fbo");
      __publicField(this, "width", 0);
      __publicField(this, "height", 0);
      this.texture = gl.createTexture();
      this.fbo = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    resize(width, height) {
      if (width === this.width && height === this.height) return;
      const gl = this.gl;
      this.width = width;
      this.height = height;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.texture,
        0
      );
    }
    /** Bind this target for drawing and set the viewport. */
    bind() {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.width, this.height);
    }
    dispose() {
      this.gl.deleteTexture(this.texture);
      this.gl.deleteFramebuffer(this.fbo);
    }
  };
  var PingPong = class {
    constructor(gl, filter) {
      __publicField(this, "a");
      __publicField(this, "b");
      this.a = new RenderTarget(gl, filter);
      this.b = new RenderTarget(gl, filter);
    }
    resize(w, h) {
      this.a.resize(w, h);
      this.b.resize(w, h);
    }
    get read() {
      return this.a;
    }
    get write() {
      return this.b;
    }
    swap() {
      const t = this.a;
      this.a = this.b;
      this.b = t;
    }
    dispose() {
      this.a.dispose();
      this.b.dispose();
    }
  };

  // filtrport/shim-source.ts
  var InputSource = class {
    constructor(gl) {
      __publicField(this, "kind", "none");
      __publicField(this, "width", 0);
      __publicField(this, "height", 0);
      __publicField(this, "texture");
      __publicField(this, "name", null);
      __publicField(this, "isTimeBased", false);
      __publicField(this, "isPlaying", false);
      __publicField(this, "duration", 0);
      __publicField(this, "currentTime", 0);
      __publicField(this, "frameCount", 0);
      __publicField(this, "gl");
      __publicField(this, "changed", false);
      this.gl = gl;
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([20, 20, 20, 255])
      );
    }
    /** Load a canvas/bitmap as the source — uploaded immediately, so a bare
     *  renderNow() (no animation loop) sees the real pixels. */
    setImage(src, name) {
      this.width = src.width;
      this.height = src.height;
      this.kind = "image";
      this.name = name != null ? name : null;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      this.changed = true;
    }
    update(_now) {
      const c = this.changed;
      this.changed = false;
      return c;
    }
    play() {
    }
    pause() {
    }
    togglePlay() {
    }
    seek(_t) {
    }
    dispose() {
      this.gl.deleteTexture(this.texture);
    }
  };

  // ../../../tools/filtr/src/engine/glyphAtlas.ts
  function buildGlyphAtlas(chars, glyphPx = 48) {
    const list = [...chars];
    const count = Math.max(1, list.length);
    const canvas = document.createElement("canvas");
    canvas.width = glyphPx * count;
    canvas.height = glyphPx;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(glyphPx * 0.82)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < count; i++) {
      const cx = i * glyphPx + glyphPx / 2;
      ctx.fillText(list[i], cx, glyphPx / 2 + glyphPx * 0.02);
    }
    return { canvas, count, glyphPx };
  }

  // ../../../tools/filtr/src/engine/shaders/common.ts
  var GLSL_LIB = (
    /* glsl */
    `
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// Rec.709 luma
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// hash / value noise
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }

// 8x8 ordered Bayer threshold in [0,1)
const float BAYER8[64] = float[64](
  0.0,32.0,8.0,40.0,2.0,34.0,10.0,42.0, 48.0,16.0,56.0,24.0,50.0,18.0,58.0,26.0,
  12.0,44.0,4.0,36.0,14.0,46.0,6.0,38.0, 60.0,28.0,52.0,20.0,62.0,30.0,54.0,22.0,
  3.0,35.0,11.0,43.0,1.0,33.0,9.0,41.0, 51.0,19.0,59.0,27.0,49.0,17.0,57.0,25.0,
  15.0,47.0,7.0,39.0,13.0,45.0,5.0,37.0, 63.0,31.0,55.0,23.0,61.0,29.0,53.0,21.0);
float bayer8(vec2 p) {
  int i = int(mod(p.y, 8.0)) * 8 + int(mod(p.x, 8.0));
  return (BAYER8[i] + 0.5) / 64.0;
}

// cellular / worley noise, returns nearest-feature distance
float worley(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 1.5;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash21(n + g), hash21(n + g + 41.3));
      md = min(md, length(g + o - f));
    }
  return md;
}
`
  );
  function frag(body) {
    return `#version 300 es
${GLSL_LIB}
${body}`;
  }

  // ../../../tools/filtr/src/engine/shaders/prep.ts
  var PREP_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_brightness; // -1..1
uniform float u_contrast;   // -1..1
uniform float u_isAscii;    // 0/1 \u2014 enable the extended grade
uniform float u_saturation; // -1..1
uniform float u_hue;        // degrees
uniform float u_gamma;      // 0.1..3
uniform float u_sharpness;  // 0..1
uniform float u_blur;       // px radius
uniform float u_edge;       // 0..1 edge enhance
uniform float u_quantize;   // 0 = off, else levels

vec3 sampleBlur(vec2 uv, float r) {
  if (r < 0.5) return texture(u_tex, uv).rgb;
  vec2 px = r / u_res;
  vec3 s = vec3(0.0);
  s += texture(u_tex, uv).rgb * 4.0;
  s += texture(u_tex, uv + vec2(px.x, 0.0)).rgb * 2.0;
  s += texture(u_tex, uv - vec2(px.x, 0.0)).rgb * 2.0;
  s += texture(u_tex, uv + vec2(0.0, px.y)).rgb * 2.0;
  s += texture(u_tex, uv - vec2(0.0, px.y)).rgb * 2.0;
  s += texture(u_tex, uv + px).rgb;
  s += texture(u_tex, uv - px).rgb;
  s += texture(u_tex, uv + vec2(px.x, -px.y)).rgb;
  s += texture(u_tex, uv + vec2(-px.x, px.y)).rgb;
  return s / 16.0;
}

void main() {
  vec4 src = texture(u_tex, v_uv);
  vec3 c = src.rgb;

  if (u_isAscii > 0.5) {
    c = sampleBlur(v_uv, u_blur);
    // sharpen + edge enhance (unsharp mask)
    float amt = u_sharpness * 1.5 + u_edge * 1.5;
    if (amt > 0.001) {
      vec2 px = 1.0 / u_res;
      vec3 blur = sampleBlur(v_uv, 1.0);
      c = clamp(c + (c - blur) * amt, 0.0, 1.0);
    }
  }

  // brightness + contrast (all effects)
  c = (c - 0.5) * (1.0 + u_contrast) + 0.5;
  c += u_brightness;
  c = clamp(c, 0.0, 1.0);

  if (u_isAscii > 0.5) {
    c = pow(c, vec3(1.0 / max(u_gamma, 0.001)));
    float l = luma(c);
    c = clamp(mix(vec3(l), c, 1.0 + u_saturation), 0.0, 1.0);
    if (abs(u_hue) > 0.001) {
      vec3 hsv = rgb2hsv(c);
      hsv.x = fract(hsv.x + u_hue / 360.0);
      c = hsv2rgb(hsv);
    }
    if (u_quantize >= 2.0) {
      c = floor(c * u_quantize) / max(1.0, u_quantize - 1.0);
      c = clamp(c, 0.0, 1.0);
    }
  }

  fragColor = vec4(c, src.a);
}
`
  );

  // ../../../tools/filtr/src/engine/shaders/effects.ts
  var ASCII = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform float u_count;
uniform float u_cell;       // px per cell (incl. spacing)
uniform float u_glyph;      // glyph px (cell minus gap)
uniform vec2  u_res;
uniform float u_bmap;       // brightness mapping (gamma on ramp)
uniform float u_invert;
uniform float u_colorMode;  // 0 mono, 1 original
uniform vec3  u_char;
uniform vec3  u_bg;
uniform float u_intensity;

void main() {
  vec2 px = v_uv * u_res;
  vec2 cell = floor(px / u_cell);
  vec2 cellOrigin = cell * u_cell;
  vec2 center = (cellOrigin + 0.5 * u_cell) / u_res;
  vec3 srcC = texture(u_tex, center).rgb;
  float l = pow(clamp(luma(srcC), 0.0, 1.0), max(u_bmap, 0.01));
  l = mix(l, 1.0 - l, u_invert);
  float idx = clamp(floor(l * u_count), 0.0, u_count - 1.0);

  // local position inside the glyph box (centred, honouring spacing gap)
  vec2 inCell = px - cellOrigin;
  vec2 gap = vec2((u_cell - u_glyph) * 0.5);
  vec2 local = (inCell - gap) / u_glyph;
  float cov = 0.0;
  if (local.x >= 0.0 && local.x <= 1.0 && local.y >= 0.0 && local.y <= 1.0) {
    float ax = (idx + local.x) / u_count;
    cov = texture(u_atlas, vec2(ax, local.y)).r;
  }
  vec3 ink = (u_colorMode < 0.5) ? u_char : srcC * u_intensity;
  fragColor = vec4(mix(u_bg, ink, cov), 1.0);
}
`
  );
  var WAVELINES = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_lineCount;
uniform float u_amplitude; // px
uniform float u_frequency;
uniform float u_dir;       // 0 horizontal, 1 vertical
uniform float u_thickness;
uniform float u_colorMode; // 0 custom/mono, 1 original
uniform vec3  u_fg;
uniform vec3  u_bg;

void main() {
  // work in a coordinate where .x runs along the line, .y across the stack
  vec2 uv = (u_dir < 0.5) ? v_uv : v_uv.yx;
  vec2 res = (u_dir < 0.5) ? u_res : u_res.yx;
  float on = 0.0;
  vec3 srcAt = vec3(0.0);
  float spacing = 1.0 / u_lineCount;
  float baseIdx = floor(uv.y * u_lineCount);
  for (int k = -2; k <= 2; k++) {
    float idx = baseIdx + float(k);
    float baseY = (idx + 0.5) * spacing;
    if (baseY < 0.0 || baseY > 1.0) continue;
    vec2 sampleUV = (u_dir < 0.5) ? vec2(uv.x, baseY) : vec2(baseY, uv.x);
    vec3 s = texture(u_tex, sampleUV).rgb;
    float l = luma(s);
    float disp = ((l - 0.5) * u_amplitude + sin(uv.x * u_frequency * 40.0) * u_amplitude * 0.25) / res.y;
    float center = baseY + disp;
    float dist = abs(uv.y - center) * res.y;
    float th = u_thickness * (0.4 + l * 1.6);
    float c = 1.0 - smoothstep(th - 1.0, th + 1.0, dist);
    if (c > on) { on = c; srcAt = s; }
  }
  vec3 line = (u_colorMode < 0.5) ? u_fg : srcAt;
  fragColor = vec4(mix(u_bg, line, on), 1.0);
}
`
  );
  var DITHERING = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform sampler2D u_noise;
uniform vec2  u_res;
uniform float u_method;   // 8..11 bayer2/4/8/16, 12 clustered, 13 blue, 14 IGN
uniform float u_intensity;
uniform float u_colorMode; // 0 mono,1 tonal,2 indexed,3 rgb,4 original
uniform float u_levels;
uniform float u_gamma;
uniform vec3  u_fg;
uniform vec3  u_bg;
uniform vec3  u_pal[8];
uniform float u_palCount;
uniform float u_paletteSize;

float bayerN(vec2 p, float n) {
  float sum = 0.0, div = 0.0, scale = 1.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= n) break;
    vec2 c = mod(floor(p / scale), 2.0);
    float b = c.x + c.y * 2.0;
    b = (c.x == c.y) ? (c.x == 0.0 ? 0.0 : 3.0) : (c.x > c.y ? 2.0 : 1.0);
    sum += b * pow(4.0, float(i));
    div += 3.0 * pow(4.0, float(i));
    scale *= 2.0;
  }
  return (sum + 0.5) / (div + 1.0);
}

float threshold(vec2 px) {
  if (u_method < 8.5) return bayerN(px, 1.0);      // bayer2
  else if (u_method < 9.5) return bayerN(px, 2.0); // bayer4
  else if (u_method < 10.5) return bayer8(px);     // bayer8
  else if (u_method < 11.5) return bayerN(px, 4.0);// bayer16
  else if (u_method < 12.5) {                      // clustered dot
    vec2 c = mod(px, 4.0);
    float d = length(c - 1.5);
    return clamp(d / 2.8, 0.0, 1.0);
  } else if (u_method < 13.5) {                    // blue noise
    return texture(u_noise, px / 64.0).r;
  }
  return fract(52.9829189 * fract(dot(floor(px), vec2(0.06711056, 0.00583715)))); // IGN
}

float quant(float v, float m, float L) {
  v += (m - 0.5) / max(L - 1.0, 1.0) * u_intensity;
  return clamp(floor(v * (L - 1.0) + 0.5), 0.0, L - 1.0) / (L - 1.0);
}

void main() {
  vec2 px = v_uv * u_res;
  float m = threshold(px);
  vec3 src = texture(u_tex, v_uv).rgb;
  src = pow(src, vec3(1.0 / max(u_gamma, 0.01)));
  float l = luma(src);

  if (u_colorMode < 0.5) {            // mono \u2014 1-bit toward fg/bg
    float b = step(m, l);
    fragColor = vec4(mix(u_bg, u_fg, b), 1.0);
  } else if (u_colorMode < 1.5) {     // tonal \u2014 N grey levels
    float q = quant(l, m, u_levels);
    fragColor = vec4(mix(u_bg, u_fg, q), 1.0);
  } else if (u_colorMode < 2.5) {     // indexed \u2014 palette ramp
    float q = quant(l, m, u_palCount);
    int idx = int(clamp(q * (u_palCount - 1.0), 0.0, u_palCount - 1.0));
    fragColor = vec4(u_pal[idx], 1.0);
  } else if (u_colorMode < 3.5) {     // rgb \u2014 per channel
    float L = u_paletteSize;
    vec3 q = vec3(quant(src.r, m, L), quant(src.g, m, L), quant(src.b, m, L));
    fragColor = vec4(q, 1.0);
  } else {                            // original \u2014 posterised source
    vec3 q = vec3(quant(src.r, m, u_levels), quant(src.g, m, u_levels), quant(src.b, m, u_levels));
    fragColor = vec4(q, 1.0);
  }
}
`
  );
  var HALFTONE = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_shape;     // 0 circle,1 square,2 diamond,3 line
uniform float u_dotScale;
uniform float u_spacing;   // px
uniform float u_angle;
uniform float u_invert;
uniform float u_colorMode; // 0 bw, 1 color
uniform vec3  u_fg;
uniform vec3  u_bg;

void main() {
  vec2 c = u_res * 0.5;
  float a = radians(u_angle);
  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
  mat2 Rt = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 px = v_uv * u_res;
  vec2 rp = R * (px - c) + c;
  vec2 cellIdx = floor(rp / u_spacing);
  vec2 cellCenterR = (cellIdx + 0.5) * u_spacing;
  vec2 srcPx = Rt * (cellCenterR - c) + c;
  vec3 s = texture(u_tex, clamp(srcPx / u_res, 0.0, 1.0)).rgb;
  float ink = clamp(luma(s), 0.0, 1.0);
  ink = mix(1.0 - ink, ink, u_invert);
  float maxR = 0.5 * u_spacing * 1.45 * u_dotScale;
  float radius = sqrt(ink) * maxR;
  vec2 d = rp - cellCenterR;
  float dist;
  if (u_shape < 0.5) dist = length(d);
  else if (u_shape < 1.5) dist = max(abs(d.x), abs(d.y));
  else if (u_shape < 2.5) dist = abs(d.x) + abs(d.y);
  else dist = abs(d.y);
  float inside = 1.0 - smoothstep(radius - 1.0, radius + 1.0, dist);
  vec3 inkC = (u_colorMode < 0.5) ? u_fg : s;
  fragColor = vec4(mix(u_bg, inkC, inside), 1.0);
}
`
  );
  var PIXELSORT = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_dir;     // 0 h,1 v,2 diag
uniform float u_mode;    // 0 brightness,1 hue,2 saturation
uniform float u_threshold;
uniform float u_streak;  // px
uniform float u_intensity;
uniform float u_reverse;

float key(vec3 c) {
  if (u_mode < 0.5) return luma(c);
  vec3 h = rgb2hsv(c);
  return (u_mode < 1.5) ? h.x : h.y;
}
void main() {
  vec2 dir = (u_dir < 0.5) ? vec2(1.0, 0.0) : (u_dir < 1.5) ? vec2(0.0, 1.0) : normalize(vec2(1.0));
  vec2 stp = dir / u_res;
  vec4 cur = texture(u_tex, v_uv);
  float l0 = luma(cur.rgb);
  vec4 best = cur;
  float bestKey = key(cur.rgb);
  int maxSteps = int(clamp(u_streak, 1.0, 220.0));
  for (int i = 1; i < 256; i++) {
    if (i > maxSteps) break;
    vec2 uv = v_uv - stp * float(i);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    vec4 s = texture(u_tex, uv);
    if (luma(s.rgb) < u_threshold) break;
    float k = key(s.rgb);
    if (u_reverse < 0.5 ? k > bestKey : k < bestKey) { bestKey = k; best = s; }
  }
  vec3 outc = (l0 >= u_threshold) ? mix(cur.rgb, best.rgb, u_intensity) : cur.rgb;
  fragColor = vec4(outc, 1.0);
}
`
  );
  var DOTS = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_shape;   // 0 circle,1 square,2 diamond
uniform float u_grid;    // 0 square,1 hex
uniform float u_size;    // multiplier
uniform float u_spacing; // multiplier
uniform float u_invert;
uniform float u_colorMode; // 0 custom,1 original
uniform vec3  u_fg;
uniform vec3  u_bg;

void main() {
  float cell = 10.0 * u_spacing;
  vec2 px = v_uv * u_res;
  vec2 idx = floor(px / cell);
  float rowOff = (u_grid > 0.5) ? mod(idx.y, 2.0) * 0.5 : 0.0;
  idx.x = floor(px.x / cell - rowOff);
  vec2 cc = vec2((idx.x + rowOff + 0.5) * cell, (idx.y + 0.5) * cell);
  vec3 s = texture(u_tex, clamp(cc / u_res, 0.0, 1.0)).rgb;
  float ink = clamp(luma(s), 0.0, 1.0);
  ink = mix(1.0 - ink, ink, u_invert);
  float maxR = 0.5 * cell * 1.4 * u_size;
  float radius = sqrt(ink) * maxR;
  vec2 d = px - cc;
  float dist;
  if (u_shape < 0.5) dist = length(d);
  else if (u_shape < 1.5) dist = max(abs(d.x), abs(d.y));
  else dist = abs(d.x) + abs(d.y);
  float inside = 1.0 - smoothstep(radius - 1.0, radius + 1.0, dist);
  vec3 inkC = (u_colorMode < 0.5) ? u_fg : s;
  fragColor = vec4(mix(u_bg, inkC, inside), 1.0);
}
`
  );
  var CONTOUR = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_fillMode; // 0 filled, 1 lines
uniform float u_levels;
uniform float u_thickness;
uniform float u_invert;
uniform float u_colorMode; // 0 custom,1 original
uniform vec3  u_line;
uniform vec3  u_bg;

float band(vec2 uv) { return floor(clamp(luma(texture(u_tex, uv).rgb), 0.0, 0.999) * u_levels); }

void main() {
  vec3 src = texture(u_tex, v_uv).rgb;
  float b = band(v_uv);
  vec2 t = u_thickness / u_res;
  float edge = 0.0;
  edge += abs(band(v_uv + vec2(t.x, 0.0)) - b);
  edge += abs(band(v_uv + vec2(0.0, t.y)) - b);
  float isLine = step(0.5, edge);
  float q = b / max(u_levels - 1.0, 1.0);
  q = mix(q, 1.0 - q, u_invert);

  if (u_fillMode > 0.5) {           // lines only
    vec3 base = (u_colorMode < 0.5) ? u_bg : src;
    fragColor = vec4(mix(base, u_line, isLine), 1.0);
  } else {                          // filled bands
    vec3 fill = (u_colorMode < 0.5) ? mix(u_bg, u_line, q) : floor(src * u_levels) / max(u_levels - 1.0, 1.0);
    fragColor = vec4(fill, 1.0);
  }
}
`
  );
  var EDGE = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_algo;    // 0 sobel,1 prewitt,2 laplacian
uniform float u_threshold;
uniform float u_lineWidth;
uniform float u_invert;
uniform float u_colorMode; // 0 custom,1 original
uniform vec3  u_edge;
uniform vec3  u_bg;

float L(vec2 uv) { return luma(texture(u_tex, uv).rgb); }
void main() {
  vec2 t = u_lineWidth / u_res;
  float tl=L(v_uv+t*vec2(-1,1)), tm=L(v_uv+t*vec2(0,1)), tr=L(v_uv+t*vec2(1,1));
  float ml=L(v_uv+t*vec2(-1,0)), mm=L(v_uv), mr=L(v_uv+t*vec2(1,0));
  float bl=L(v_uv+t*vec2(-1,-1)), bm=L(v_uv+t*vec2(0,-1)), br=L(v_uv+t*vec2(1,-1));
  float mag;
  if (u_algo < 1.5) {
    float w = (u_algo < 0.5) ? 2.0 : 1.0;
    float gx = (tr + w*mr + br) - (tl + w*ml + bl);
    float gy = (tl + w*tm + tr) - (bl + w*bm + br);
    mag = length(vec2(gx, gy));
  } else {
    mag = abs(8.0*mm - (tl+tm+tr+ml+mr+bl+bm+br));
  }
  float e = smoothstep(u_threshold, u_threshold + 0.12, mag);
  e = mix(e, 1.0 - e, u_invert);
  vec3 ec = (u_colorMode < 0.5) ? u_edge : texture(u_tex, v_uv).rgb;
  fragColor = vec4(mix(u_bg, ec, e), 1.0);
}
`
  );
  var CROSSHATCH = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_density;   // line spacing base
uniform float u_layers;    // 1..4
uniform float u_angle;
uniform float u_lineWidth;
uniform float u_randomness;
uniform float u_invert;
uniform vec3  u_fg;
uniform vec3  u_bg;

float hatch(vec2 px, float ang, float spacing, float w) {
  float a = radians(ang);
  float coord = px.x * cos(a) + px.y * sin(a);
  float f = abs(fract(coord / spacing) - 0.5) * 2.0; // 0 at line centre
  return 1.0 - smoothstep(0.0, w / spacing, f);
}
void main() {
  vec3 src = texture(u_tex, v_uv).rgb;
  float l = clamp(luma(src), 0.0, 1.0);
  l = mix(l, 1.0 - l, u_invert);
  float dark = 1.0 - l;
  vec2 px = v_uv * u_res + (hash21(floor(v_uv * u_res / 4.0)) - 0.5) * u_randomness * 8.0;
  float spacing = max(2.0, u_density * 1.4);
  float w = max(1.0, u_lineWidth);
  float ink = 0.0;
  // progressively add layers as the pixel gets darker
  if (dark > 0.0) ink = max(ink, hatch(px, u_angle, spacing, w) * step(0.05, dark));
  if (u_layers > 1.5 && dark > 0.28) ink = max(ink, hatch(px, u_angle + 90.0, spacing, w));
  if (u_layers > 2.5 && dark > 0.52) ink = max(ink, hatch(px, u_angle + 45.0, spacing, w));
  if (u_layers > 3.5 && dark > 0.74) ink = max(ink, hatch(px, u_angle + 135.0, spacing, w));
  ink *= smoothstep(0.0, 0.15, dark);
  fragColor = vec4(mix(u_bg, u_fg, ink), 1.0);
}
`
  );
  var BLOCKIFY = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_block;
uniform float u_style;   // 0 full,1 shaded,2 outline
uniform float u_border;
uniform vec3  u_borderColor;
uniform float u_colorMode; // 0 color,1 grayscale

vec3 blockAvg(vec2 cell) {
  vec3 s = vec3(0.0);
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      vec2 uv = (cell + (vec2(float(i), float(j)) + 0.5) / 4.0) * u_block / u_res;
      s += texture(u_tex, clamp(uv, 0.0, 1.0)).rgb;
    }
  return s / 16.0;
}
void main() {
  vec2 px = v_uv * u_res;
  vec2 cell = floor(px / u_block);
  vec3 avg = blockAvg(cell);
  if (u_colorMode > 0.5) avg = vec3(luma(avg));
  if (u_style > 0.5 && u_style < 1.5) {     // shaded \u2014 quantise brightness
    float q = floor(luma(avg) * 6.0) / 5.0;
    avg = clamp(avg * (0.45 + 0.55 * q), 0.0, 1.0);
  }
  vec2 inCell = px - cell * u_block;
  float bw = max(u_border, u_style > 1.5 ? 1.0 : 0.0);
  float onBorder = (inCell.x < bw || inCell.y < bw || inCell.x > u_block - bw || inCell.y > u_block - bw) ? 1.0 : 0.0;
  vec3 outc;
  if (u_style > 1.5) outc = onBorder > 0.5 ? avg : avg * 0.08; // outline: cell edges only
  else outc = mix(avg, u_borderColor, u_border > 0.0 ? onBorder : 0.0);
  fragColor = vec4(outc, 1.0);
}
`
  );
  var THRESHOLD = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform sampler2D u_noise;
uniform vec2  u_res;
uniform float u_levels;
uniform float u_point;   // threshold point
uniform float u_dither;
uniform float u_invert;
uniform float u_colorMode; // 0 custom,1 color
uniform vec3  u_fg;
uniform vec3  u_bg;

void main() {
  vec2 px = v_uv * u_res;
  vec3 src = texture(u_tex, v_uv).rgb;
  float l = luma(src);
  float d = (u_dither > 0.5) ? (bayer8(px) - 0.5) / u_levels : 0.0;
  l = clamp(l + d, 0.0, 1.0);
  // bias around threshold point
  l = clamp((l - u_point) / max(0.0001, (l > u_point ? (1.0 - u_point) : u_point)) * 0.5 + 0.5, 0.0, 1.0);
  float q = floor(l * u_levels) / max(u_levels - 1.0, 1.0);
  q = mix(q, 1.0 - q, u_invert);
  if (u_colorMode < 0.5) {
    fragColor = vec4(mix(u_bg, u_fg, q), 1.0);
  } else {
    vec3 pq = floor(src * u_levels) / max(u_levels - 1.0, 1.0);
    fragColor = vec4(mix(pq, 1.0 - pq, u_invert), 1.0);
  }
}
`
  );
  var NOISEFIELD = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_time;
uniform float u_type;    // 0 perlin,1 simplex,2 worley
uniform float u_scale;
uniform float u_intensity;
uniform float u_octaves;
uniform float u_speed;
uniform float u_animate;
uniform float u_distortOnly;

float field(vec2 p) {
  float t = u_animate > 0.5 ? u_time * u_speed : 0.0;
  if (u_type < 0.5) {        // perlin-ish via fbm
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 8; i++) { if (float(i) >= u_octaves) break; v += a * vnoise(p + t); p *= 2.0; a *= 0.5; }
    return v;
  } else if (u_type < 1.5) { // simplex-ish (smoother fbm)
    return fbm(p * 0.8 + t);
  }
  return 1.0 - worley(p * 0.5 + t); // worley
}
void main() {
  vec2 p = v_uv * (u_scale * 0.1) * vec2(u_res.x / u_res.y, 1.0);
  float n = field(p);
  if (u_distortOnly > 0.5) {
    vec2 off = vec2(field(p + 3.1), field(p + 7.7)) - 0.5;
    vec3 s = texture(u_tex, clamp(v_uv + off * u_intensity * 0.1, 0.0, 1.0)).rgb;
    fragColor = vec4(s, 1.0);
  } else {
    vec3 s = texture(u_tex, v_uv).rgb;
    vec3 outc = mix(s, s * (0.4 + n * 1.2), clamp(u_intensity, 0.0, 1.0));
    outc = clamp(outc + (n - 0.5) * (u_intensity - 1.0) * 0.5, 0.0, 1.0);
    fragColor = vec4(outc, 1.0);
  }
}
`
  );
  var MATRIX = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform float u_count;
uniform vec2  u_res;
uniform float u_time;
uniform float u_cell;
uniform float u_speed;
uniform float u_trail;     // cells
uniform float u_dir;       // 0 down,1 up,2 left,3 right
uniform float u_glow;
uniform float u_bgOpacity;
uniform vec3  u_rain;
uniform float u_threshold;

void main() {
  vec2 px = v_uv * u_res;
  vec2 cell = floor(px / u_cell);
  vec2 local = fract(px / u_cell);
  bool vert = u_dir < 1.5;                 // down(0) / up(1) are vertical
  bool reverse = (u_dir == 1.0 || u_dir == 2.0); // up / left run in reverse
  float colId = vert ? cell.x : cell.y;
  float pos = vert ? cell.y : cell.x;
  float colLen = vert ? (u_res.y / u_cell) : (u_res.x / u_cell);
  float effPos = reverse ? (colLen - pos) : pos;

  float colRand = hash21(vec2(colId, 1.0));
  float speed = (0.4 + colRand) * u_speed;
  float head = fract(u_time * speed * 0.12 + colRand) * (colLen + 24.0) - 12.0;
  float fromHead = head - effPos;
  float intensity = clamp(1.0 - fromHead / max(u_trail, 1.0), 0.0, 1.0) * step(0.0, fromHead);

  float gid = floor(u_time * 7.0 + pos * 1.3 + colId * 2.1);
  vec2 luv = vert ? local : local.yx;
  float idx = floor(hash21(vec2(gid, colId)) * u_count);
  float cov = texture(u_atlas, vec2((idx + clamp(luv.x, 0.0, 1.0)) / u_count, luv.y)).r;

  vec3 src = texture(u_tex, (cell + 0.5) * u_cell / u_res).rgb;
  float srcMask = mix(1.0, step(u_threshold, luma(src)), step(0.001, u_threshold));
  float bright = intensity * cov * srcMask;
  float isHead = step(0.0, fromHead) * step(fromHead, 1.0);
  vec3 col = u_rain * bright * (0.6 + u_glow);
  col = mix(col, vec3(0.85, 1.0, 0.9), isHead * cov * 0.9);
  vec3 bg = src * (1.0 - u_bgOpacity);
  fragColor = vec4(bg + col, 1.0);
}
`
  );
  var VHS = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_time;
uniform float u_distortion;
uniform float u_noise;
uniform float u_colorBleed;
uniform float u_scanlines;
uniform float u_tracking;

void main() {
  vec2 uv = v_uv;
  float line = floor(uv.y * u_res.y);
  // tracking error: occasional horizontal jump on some scanlines
  float band = step(0.985 - u_tracking * 0.06, hash21(vec2(line, floor(u_time * 8.0))));
  float jitter = (hash21(vec2(line, floor(u_time * 24.0))) - 0.5) * u_tracking * 0.08;
  uv.x += jitter + band * (hash21(vec2(floor(u_time*4.0), line)) - 0.5) * 0.2;
  // wavy distortion
  uv.x += sin(uv.y * 30.0 + u_time * 3.0) * u_distortion * 0.01;
  // colour bleed (horizontal RGB offset)
  float o = u_colorBleed * 0.012;
  float r = texture(u_tex, uv + vec2(o, 0.0)).r;
  vec4 g = texture(u_tex, uv);
  float b = texture(u_tex, uv - vec2(o, 0.0)).b;
  vec3 col = vec3(r, g.g, b);
  // bleed smear
  col = mix(col, texture(u_tex, uv + vec2(o * 2.0, 0.0)).rgb, u_colorBleed * 0.3);
  // noise
  float n = hash21(uv * u_res + u_time * 60.0);
  col += (n - 0.5) * u_noise;
  // scanlines
  col *= 1.0 - u_scanlines * (0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159));
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
  );
  var VORONOI = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_cell;      // px
uniform float u_edgeWidth;
uniform float u_edgeColor; // 0 black,1 white,2 darkened
uniform float u_colorMode; // 0 cell avg,1 center sample,2 gradient
uniform float u_randomize;

void main() {
  float scale = u_res.x / u_cell;
  vec2 g = vec2(scale, scale * u_res.y / u_res.x);
  vec2 p = v_uv * g;
  vec2 cell = floor(p);
  float d1 = 1e9, d2 = 1e9;
  vec2 best = p;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec2 jit = (vec2(hash21(c), hash21(c + 19.1)) - 0.5) * u_randomize;
      vec2 feat = c + 0.5 + jit;
      float d = distance(p, feat);
      if (d < d1) { d2 = d1; d1 = d; best = feat; }
      else if (d < d2) d2 = d;
    }
  vec2 srcUV = clamp(best / g, 0.0, 1.0);
  vec3 col;
  if (u_colorMode < 1.5) col = texture(u_tex, srcUV).rgb;       // avg/center \u2248 feature sample
  else col = texture(u_tex, v_uv).rgb * (0.6 + 0.4 * (1.0 - d1)); // gradient
  float edge = smoothstep(0.0, 0.02 + u_edgeWidth * 0.15, d2 - d1);
  vec3 ec = (u_edgeColor < 0.5) ? vec3(0.0) : (u_edgeColor < 1.5) ? vec3(1.0) : col * 0.3;
  fragColor = vec4(mix(ec, col, edge), 1.0);
}
`
  );
  var COPY = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
void main() { fragColor = texture(u_tex, v_uv); }
`
  );

  // ../../../tools/filtr/src/engine/shaders/post.ts
  var BLOOM_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_threshold;
uniform float u_soft;
uniform float u_intensity;
uniform float u_radius; // px
void main() {
  vec4 base = texture(u_tex, v_uv);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float a = float(i) * 2.39996323;
    float rad = sqrt((float(i) + 0.5) / 24.0) * u_radius;
    vec2 off = vec2(cos(a), sin(a)) * rad / u_res;
    vec3 c = texture(u_tex, v_uv + off).rgb;
    float l = luma(c);
    float knee = max(u_soft, 0.001);
    float w = clamp((l - u_threshold + knee) / (2.0 * knee), 0.0, 1.0);
    w *= step(u_threshold - knee, l);
    sum += c * w;
  }
  fragColor = vec4(base.rgb + sum / 24.0 * u_intensity * 2.5, base.a);
}
`
  );
  var CHROMATIC_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_offset; // px
void main() {
  vec2 dir = (v_uv - 0.5);
  vec2 o = dir * (u_offset / u_res * 2.0) * length(u_res) * 0.02;
  float r = texture(u_tex, v_uv + o).r;
  vec4 g = texture(u_tex, v_uv);
  float b = texture(u_tex, v_uv - o).b;
  fragColor = vec4(r, g.g, b, g.a);
}
`
  );
  var SCANLINES_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_opacity;
uniform float u_spacing; // px
void main() {
  vec4 c = texture(u_tex, v_uv);
  float s = 0.5 + 0.5 * sin(v_uv.y * u_res.y / max(u_spacing, 1.0) * 3.14159 * 2.0);
  c.rgb *= 1.0 - u_opacity * (1.0 - s);
  fragColor = c;
}
`
  );
  var VIGNETTE_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform float u_intensity;
uniform float u_radius;
void main() {
  vec4 c = texture(u_tex, v_uv);
  float d = length(v_uv - 0.5) * 1.41421;
  float v = smoothstep(0.9, u_radius, d);
  c.rgb *= 1.0 - v * u_intensity;
  fragColor = c;
}
`
  );
  var CRT_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform float u_amount;
void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  uv *= 1.0 + dot(uv, uv) * u_amount;
  uv = uv * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  fragColor = texture(u_tex, uv);
}
`
  );
  var GRAIN_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform float u_time;
uniform float u_intensity; // 0..200
uniform float u_size;
uniform float u_speed;
void main() {
  vec4 c = texture(u_tex, v_uv);
  vec2 p = floor(v_uv * u_res / max(u_size, 1.0));
  float g = hash21(p + floor(u_time * u_speed * 0.06) * 13.7);
  c.rgb += (g - 0.5) * (u_intensity / 200.0);
  fragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
}
`
  );
  var PHOSPHOR_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec3 u_color;
void main() {
  vec4 c = texture(u_tex, v_uv);
  fragColor = vec4(u_color * luma(c.rgb), c.a);
}
`
  );
  var COMPOSITE_FRAG = frag(
    /* glsl */
    `
uniform sampler2D u_tex;
uniform vec3 u_bg;
void main() {
  vec4 c = texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y));
  fragColor = vec4(mix(u_bg, c.rgb, c.a), 1.0);
}
`
  );

  // ../../../tools/filtr/src/engine/cpuDither.ts
  var ERROR_DIFFUSION = [
    "floydSteinberg",
    "atkinson",
    "jarvisJudiceNinke",
    "stucki",
    "burkes",
    "sierra",
    "sierraTwoRow",
    "sierraLite"
  ];
  function isErrorDiffusion(m) {
    return ERROR_DIFFUSION.includes(m);
  }
  function ditherMethodIndex(m) {
    switch (m) {
      case "bayer2x2":
        return 8;
      case "bayer4x4":
        return 9;
      case "bayer8x8":
        return 10;
      case "bayer16x16":
        return 11;
      case "clusteredDot":
        return 12;
      case "blueNoise":
        return 13;
      case "interleavedGradient":
        return 14;
      default:
        return 10;
    }
  }
  var KERNELS = {
    floydSteinberg: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
    jarvisJudiceNinke: {
      div: 48,
      taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]]
    },
    stucki: {
      div: 42,
      taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]]
    },
    burkes: { div: 32, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
    sierra: { div: 32, taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
    sierraTwoRow: { div: 16, taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]] },
    sierraLite: { div: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] }
  };
  var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var q = (v, levels) => Math.round(clamp01(v) * (levels - 1)) / (levels - 1);
  function diffuse(buf, w, h, levels, method) {
    var _a;
    const k = (_a = KERNELS[method]) != null ? _a : KERNELS.floydSteinberg;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = buf[i];
        const nv = q(old, levels);
        const err = old - nv;
        buf[i] = nv;
        for (const [dx, dy, wt] of k.taps) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          buf[ny * w + nx] += err * wt / k.div;
        }
      }
  }
  function computeCpuDither(gl, prepRT, w, h, d, palArr, palCount) {
    if (w <= 0 || h <= 0) return null;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prepRT.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8Array(w * h * 4);
    const g = Math.max(0.01, d.gamma);
    const fg = hexF(d.foregroundColor);
    const bg = hexF(d.backgroundColor);
    const perChannel = d.colorMode === "rgb" || d.colorMode === "original";
    if (perChannel) {
      const levels2 = d.colorMode === "rgb" ? d.paletteSize : d.colorLevels;
      for (let c = 0; c < 3; c++) {
        const buf2 = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) buf2[i] = Math.pow(px[i * 4 + c] / 255, 1 / g);
        diffuse(buf2, w, h, Math.max(2, levels2), d.method);
        for (let i = 0; i < w * h; i++) out[i * 4 + c] = Math.round(buf2[i] * 255);
      }
      for (let i = 0; i < w * h; i++) out[i * 4 + 3] = 255;
      return out;
    }
    const buf = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      buf[i] = Math.pow(0.2126 * r + 0.7152 * gg + 0.0722 * b, 1 / g);
    }
    const levels = d.colorMode === "mono" ? 2 : d.colorMode === "indexed" ? palCount : d.colorLevels;
    diffuse(buf, w, h, Math.max(2, levels), d.method);
    for (let i = 0; i < w * h; i++) {
      const t = buf[i];
      let r, gg, b;
      if (d.colorMode === "indexed") {
        const idx = Math.min(palCount - 1, Math.max(0, Math.round(t * (palCount - 1))));
        r = palArr[idx * 3] * 255;
        gg = palArr[idx * 3 + 1] * 255;
        b = palArr[idx * 3 + 2] * 255;
      } else {
        r = bg[0] + (fg[0] - bg[0]) * t;
        gg = bg[1] + (fg[1] - bg[1]) * t;
        b = bg[2] + (fg[2] - bg[2]) * t;
      }
      out[i * 4] = Math.round(r);
      out[i * 4 + 1] = Math.round(gg);
      out[i * 4 + 2] = Math.round(b);
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  function hexF(hex) {
    const h = hex.replace("#", "");
    const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
    const int = parseInt(n, 16);
    return [int >> 16 & 255, int >> 8 & 255, int & 255];
  }

  // filtrport/renderer.ts
  var FRAG = {
    prep: PREP_FRAG,
    ascii: ASCII,
    waveLines: WAVELINES,
    dithering: DITHERING,
    halftone: HALFTONE,
    pixelSort: PIXELSORT,
    dots: DOTS,
    contour: CONTOUR,
    edgeDetection: EDGE,
    crosshatch: CROSSHATCH,
    blockify: BLOCKIFY,
    threshold: THRESHOLD,
    noiseField: NOISEFIELD,
    matrixRain: MATRIX,
    vhs: VHS,
    voronoi: VORONOI,
    copy: COPY,
    bloom: BLOOM_FRAG,
    chromatic: CHROMATIC_FRAG,
    scanlines: SCANLINES_FRAG,
    vignette: VIGNETTE_FRAG,
    crt: CRT_FRAG,
    grain: GRAIN_FRAG,
    phosphor: PHOSPHOR_FRAG,
    composite: COMPOSITE_FRAG
  };
  var PHOSPHOR_COLORS = {
    green: "#33ff66",
    amber: "#ffb000",
    white: "#ffffff"
  };
  var Renderer = class {
    constructor(canvas) {
      __publicField(this, "gl");
      __publicField(this, "source");
      __publicField(this, "procW", 0);
      __publicField(this, "procH", 0);
      __publicField(this, "canvas");
      __publicField(this, "quad");
      __publicField(this, "programs", /* @__PURE__ */ new Map());
      __publicField(this, "pp");
      __publicField(this, "cpuTarget");
      __publicField(this, "noiseTex");
      __publicField(this, "atlasTex");
      __publicField(this, "atlasCount", 1);
      __publicField(this, "atlasKey", "");
      __publicField(this, "cpuKey", "");
      __publicField(this, "raf", 0);
      __publicField(this, "running", false);
      __publicField(this, "lastDirty", -1);
      __publicField(this, "startTime", 0);
      __publicField(this, "renderErrored", false);
      this.canvas = canvas;
      this.gl = createGL(canvas);
      this.quad = new FullscreenQuad(this.gl);
      this.pp = new PingPong(this.gl);
      this.cpuTarget = new RenderTarget(this.gl);
      this.source = new InputSource(this.gl);
      this.noiseTex = this.makeNoiseTexture(64);
      this.atlasTex = this.gl.createTexture();
      this.setupTex(this.atlasTex);
    }
    prog(key) {
      let p = this.programs.get(key);
      if (!p) {
        p = new Program(this.gl, FRAG[key], void 0, key);
        this.programs.set(key, p);
      }
      return p;
    }
    setupTex(tex, filter = this.gl.LINEAR) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    makeNoiseTexture(n) {
      const rnd = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) rnd[i] = Math.random();
      const out = new Uint8Array(n * n);
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          let blur = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              blur += rnd[(y + dy + n) % n * n + (x + dx + n) % n];
          blur /= 9;
          out[y * n + x] = Math.max(0, Math.min(255, Math.round((0.5 + (rnd[y * n + x] - blur) * 1.8) * 255)));
        }
      const gl = this.gl;
      const tex = gl.createTexture();
      this.setupTex(tex, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, out);
      return tex;
    }
    ensureAtlas(s) {
      let chars = "";
      if (s.active === "ascii") chars = resolveChars(s.ascii.set, s.ascii.customChars);
      else if (s.active === "matrixRain")
        chars = resolveChars(s.matrixRain.characterSet, s.matrixRain.customChars);
      else return;
      if (chars === this.atlasKey) return;
      this.atlasKey = chars;
      const atlas = buildGlyphAtlas(chars);
      this.atlasCount = atlas.count;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    }
    computeSize(s) {
      const sw = this.source.width || 1280;
      const sh = this.source.height || 720;
      const cap = Math.max(256, s.output.maxPreviewDim);
      const longest = Math.max(sw, sh);
      const k = longest > cap ? cap / longest : 1;
      this.procW = Math.max(1, Math.round(sw * k));
      this.procH = Math.max(1, Math.round(sh * k));
    }
    tex(t, unit) {
      return { texture: t, unit };
    }
    pass(key, uniforms, inputTex) {
      this.pp.write.bind();
      const p = this.prog(key).use();
      p.set(__spreadValues({ u_tex: this.tex(inputTex != null ? inputTex : this.pp.read.texture, 0) }, uniforms));
      this.quad.draw();
      this.pp.swap();
    }
    res() {
      return [this.procW, this.procH];
    }
    paletteColors(name) {
      var _a, _b, _c;
      const colors = (_b = (_a = paletteById(name)) == null ? void 0 : _a.colors) != null ? _b : ["#000000", "#ffffff"];
      const count = Math.max(2, Math.min(8, colors.length));
      const arr = new Float32Array(8 * 3);
      for (let i = 0; i < 8; i++) {
        const [r, g, b] = hexToVec3((_c = colors[Math.min(i, colors.length - 1)]) != null ? _c : "#000000");
        arr[i * 3] = r;
        arr[i * 3 + 1] = g;
        arr[i * 3 + 2] = b;
      }
      return { arr, count };
    }
    // ── effect dispatch ────────────────────────────────────────────────────
    runEffect(s, t, input) {
      const res = this.res();
      const a = s.active;
      switch (a) {
        case "ascii": {
          const p = s.ascii;
          let cell = Math.max(2, p.scale * 4);
          if (p.outputWidth > 0) cell = Math.max(2, this.procW / p.outputWidth);
          this.pass("ascii", {
            u_atlas: this.tex(this.atlasTex, 1),
            u_count: this.atlasCount,
            u_cell: cell,
            u_glyph: Math.max(1, cell * (1 - p.spacing * 0.85)),
            u_res: res,
            u_bmap: p.brightnessMapping,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "mono" ? 0 : 1,
            u_char: hexToVec3(p.custom),
            u_bg: hexToVec3(p.backgroundColor),
            u_intensity: p.intensity
          }, input);
          break;
        }
        case "waveLines": {
          const p = s.waveLines;
          this.pass("waveLines", {
            u_res: res,
            u_lineCount: Math.max(2, p.lineCount),
            u_amplitude: p.amplitude,
            u_frequency: p.frequency,
            u_dir: p.direction === "vertical" ? 1 : 0,
            u_thickness: p.lineThickness,
            u_colorMode: p.colorMode === "original" ? 1 : 0,
            u_fg: hexToVec3(p.fgColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "dithering": {
          const p = s.dithering;
          if (isErrorDiffusion(p.method) && !this.source.isTimeBased) {
            this.pass("copy", {}, this.cpuTarget.texture);
          } else {
            const pal = this.paletteColors(p.palette);
            this.pp.write.bind();
            const prog = this.prog("dithering").use();
            prog.set({
              u_tex: this.tex(input, 0),
              u_noise: this.tex(this.noiseTex, 1),
              u_res: res,
              u_method: ditherMethodIndex(p.method),
              u_intensity: p.intensity,
              u_colorMode: ["mono", "tonal", "indexed", "rgb", "original"].indexOf(p.colorMode),
              u_levels: p.colorLevels,
              u_gamma: p.gamma,
              u_fg: hexToVec3(p.foregroundColor),
              u_bg: hexToVec3(p.backgroundColor),
              u_palCount: pal.count,
              u_paletteSize: p.paletteSize
            });
            prog.setVec3Array("u_pal", pal.arr);
            this.quad.draw();
            this.pp.swap();
          }
          break;
        }
        case "halftone": {
          const p = s.halftone;
          this.pass("halftone", {
            u_res: res,
            u_shape: ["circle", "square", "diamond", "line"].indexOf(p.shape),
            u_dotScale: p.dotScale,
            u_spacing: Math.max(2, p.spacing),
            u_angle: p.angle,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "color" ? 1 : 0,
            u_fg: hexToVec3(p.fgColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "pixelSort": {
          const p = s.pixelSort;
          this.pass("pixelSort", {
            u_res: res,
            u_dir: ["horizontal", "vertical", "diagonal"].indexOf(p.direction),
            u_mode: ["brightness", "hue", "saturation"].indexOf(p.mode),
            u_threshold: p.threshold,
            u_streak: p.streakLength,
            u_intensity: p.intensity,
            u_reverse: p.reverse
          }, input);
          break;
        }
        case "dots": {
          const p = s.dots;
          this.pass("dots", {
            u_res: res,
            u_shape: ["circle", "square", "diamond"].indexOf(p.shape),
            u_grid: p.gridType === "hex" ? 1 : 0,
            u_size: p.sizeMultiplier,
            u_spacing: p.spacing,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "original" ? 1 : 0,
            u_fg: hexToVec3(p.fgColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "contour": {
          const p = s.contour;
          this.pass("contour", {
            u_res: res,
            u_fillMode: p.fillMode === "lines" ? 1 : 0,
            u_levels: p.levels,
            u_thickness: p.lineThickness,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "original" ? 1 : 0,
            u_line: hexToVec3(p.lineColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "edgeDetection": {
          const p = s.edgeDetection;
          this.pass("edgeDetection", {
            u_res: res,
            u_algo: ["sobel", "prewitt", "laplacian"].indexOf(p.algorithm),
            u_threshold: p.threshold,
            u_lineWidth: p.lineWidth,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "original" ? 1 : 0,
            u_edge: hexToVec3(p.edgeColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "crosshatch": {
          const p = s.crosshatch;
          this.pass("crosshatch", {
            u_res: res,
            u_density: p.density,
            u_layers: p.layers,
            u_angle: p.angle,
            u_lineWidth: p.lineWidth,
            u_randomness: p.randomness,
            u_invert: p.invert,
            u_fg: hexToVec3(p.fgColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "blockify": {
          const p = s.blockify;
          this.pass("blockify", {
            u_res: res,
            u_block: Math.max(2, p.blockSize),
            u_style: ["full", "shaded", "outline"].indexOf(p.style),
            u_border: p.borderWidth,
            u_borderColor: hexToVec3(p.borderColor),
            u_colorMode: p.colorMode === "grayscale" ? 1 : 0
          }, input);
          break;
        }
        case "threshold": {
          const p = s.threshold;
          this.pass("threshold", {
            u_noise: this.tex(this.noiseTex, 1),
            u_res: res,
            u_levels: p.levels,
            u_point: p.thresholdPoint,
            u_dither: p.dither,
            u_invert: p.invert,
            u_colorMode: p.colorMode === "color" ? 1 : 0,
            u_fg: hexToVec3(p.fgColor),
            u_bg: hexToVec3(p.bgColor)
          }, input);
          break;
        }
        case "noiseField": {
          const p = s.noiseField;
          this.pass("noiseField", {
            u_res: res,
            u_time: t,
            u_type: ["perlin", "simplex", "worley"].indexOf(p.noiseType),
            u_scale: p.scale,
            u_intensity: p.intensity,
            u_octaves: p.octaves,
            u_speed: p.speed,
            u_animate: p.animate,
            u_distortOnly: p.distortOnly
          }, input);
          break;
        }
        case "matrixRain": {
          const p = s.matrixRain;
          this.pass("matrixRain", {
            u_atlas: this.tex(this.atlasTex, 1),
            u_count: this.atlasCount,
            u_res: res,
            u_time: t,
            u_cell: Math.max(3, p.cellSize) * (1 + p.spacing),
            u_speed: p.speed,
            u_trail: p.trailLength,
            u_dir: ["down", "up", "left", "right"].indexOf(p.direction),
            u_glow: p.glowIntensity,
            u_bgOpacity: p.bgOpacity,
            u_rain: hexToVec3(p.rainColor),
            u_threshold: p.threshold
          }, input);
          break;
        }
        case "vhs": {
          const p = s.vhs;
          this.pass("vhs", {
            u_res: res,
            u_time: t,
            u_distortion: p.distortion,
            u_noise: p.noise,
            u_colorBleed: p.colorBleed,
            u_scanlines: p.scanlines,
            u_tracking: p.trackingError
          }, input);
          break;
        }
        case "voronoi": {
          const p = s.voronoi;
          this.pass("voronoi", {
            u_res: res,
            u_cell: Math.max(4, p.cellSize),
            u_edgeWidth: p.edgeWidth,
            u_edgeColor: Number(p.edgeColor),
            u_colorMode: Number(p.colorMode),
            u_randomize: p.randomize
          }, input);
          break;
        }
      }
    }
    runPost(s, t) {
      const res = this.res();
      const p = s.post;
      if (p.chromatic.enabled) this.pass("chromatic", { u_res: res, u_offset: p.chromatic.offset });
      if (p.bloom.enabled)
        this.pass("bloom", {
          u_res: res,
          u_threshold: p.bloom.threshold,
          u_soft: p.bloom.softThreshold,
          u_intensity: p.bloom.intensity,
          u_radius: p.bloom.radius
        });
      if (p.scanlines.enabled)
        this.pass("scanlines", { u_res: res, u_opacity: p.scanlines.opacity, u_spacing: p.scanlines.spacing });
      if (p.vignette.enabled)
        this.pass("vignette", { u_intensity: p.vignette.intensity, u_radius: p.vignette.radius });
      if (p.crtCurve.enabled) this.pass("crt", { u_amount: p.crtCurve.amount });
      if (p.grain.enabled)
        this.pass("grain", { u_res: res, u_time: t, u_intensity: p.grain.intensity, u_size: p.grain.size, u_speed: p.grain.speed });
      if (p.phosphor.enabled) {
        const col = p.phosphor.color === "custom" ? p.phosphor.customColor : PHOSPHOR_COLORS[p.phosphor.color];
        this.pass("phosphor", { u_color: hexToVec3(col) });
      }
    }
    render(s, timeMs) {
      const gl = this.gl;
      this.computeSize(s);
      if (this.canvas.width !== this.procW || this.canvas.height !== this.procH) {
        this.canvas.width = this.procW;
        this.canvas.height = this.procH;
      }
      this.pp.resize(this.procW, this.procH);
      this.ensureAtlas(s);
      const t = timeMs / 1e3;
      if (s.output.showOriginal) {
        this.pass("copy", {}, this.source.texture);
      } else {
        const adj = s.adjust || { brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 1, sharpness: 0, blur: 0, edge: 0, quantize: 0 };
        this.pass("prep", {
          u_res: this.res(),
          u_brightness: adj.brightness / 100,
          u_contrast: adj.contrast / 100,
          u_isAscii: true,
          u_saturation: adj.saturation / 100,
          u_hue: adj.hue,
          u_gamma: adj.gamma,
          u_sharpness: adj.sharpness / 100,
          u_blur: adj.blur,
          u_edge: adj.edge / 100,
          u_quantize: adj.quantize
        }, this.source.texture);
        const prepRT = this.pp.read;
        if (s.active === "dithering" && isErrorDiffusion(s.dithering.method) && !this.source.isTimeBased)
          this.maybeCpuDither(s, prepRT);
        this.runEffect(s, t, prepRT.texture);
        this.runPost(s, t);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.procW, this.procH);
      this.prog("composite").use().set({
        u_tex: this.tex(this.pp.read.texture, 0),
        u_bg: hexToVec3(s.output.background)
      });
      this.quad.draw();
    }
    maybeCpuDither(s, prepRT) {
      const d = s.dithering;
      const key = [d.method, d.colorMode, d.colorLevels, d.gamma, d.palette, d.paletteSize, d.foregroundColor, d.backgroundColor, JSON.stringify(s.adjust), this.procW, this.procH, s.active].join("|");
      if (key === this.cpuKey && this.cpuTarget.width === this.procW) return;
      this.cpuKey = key;
      const pal = this.paletteColors(d.palette);
      const data = computeCpuDither(this.gl, prepRT, this.procW, this.procH, d, pal.arr, pal.count);
      if (!data) return;
      const gl = this.gl;
      this.cpuTarget.resize(this.procW, this.procH);
      gl.bindTexture(gl.TEXTURE_2D, this.cpuTarget.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.procW, this.procH, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    isAnimated(s) {
      if (s.active === "matrixRain" || s.active === "vhs") return true;
      if (s.active === "noiseField" && s.noiseField.animate) return true;
      if (s.post.grain.enabled && s.post.grain.speed > 0) return true;
      return false;
    }
    start() {
      if (this.running) return;
      this.running = true;
      this.startTime = performance.now();
      const loop = () => {
        if (!this.running) return;
        const now = performance.now();
        const s = useStore.getState().settings;
        const dirty = useStore.getState().dirty;
        const srcChanged = this.source.update(now);
        const need = srcChanged || dirty !== this.lastDirty || this.source.isTimeBased || this.isAnimated(s);
        if (need) {
          this.lastDirty = dirty;
          try {
            this.render(s, now - this.startTime);
            this.renderErrored = false;
          } catch (e) {
            if (!this.renderErrored) {
              console.error("filtr: render error (continuing)", e);
              this.renderErrored = true;
            }
          }
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
    renderNow() {
      this.render(useStore.getState().settings, performance.now() - this.startTime);
    }
    /** Prep-graded pixels (row 0 = image top) for the SVG/text exporters. */
    sampleAdjusted() {
      const s = useStore.getState().settings;
      this.computeSize(s);
      this.pp.resize(this.procW, this.procH);
      const adj = s.adjust || { brightness: 0, contrast: 0, saturation: 0, hue: 0, gamma: 1, sharpness: 0, blur: 0, edge: 0, quantize: 0 };
      this.pass("prep", {
        u_res: this.res(),
        u_brightness: adj.brightness / 100,
        u_contrast: adj.contrast / 100,
        u_isAscii: true,
        u_saturation: adj.saturation / 100,
        u_hue: adj.hue,
        u_gamma: adj.gamma,
        u_sharpness: adj.sharpness / 100,
        u_blur: adj.blur,
        u_edge: adj.edge / 100,
        u_quantize: adj.quantize
      }, this.source.texture);
      const rt = this.pp.read;
      const data = new Uint8Array(this.procW * this.procH * 4);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, rt.fbo);
      this.gl.readPixels(0, 0, this.procW, this.procH, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
      return { data, width: this.procW, height: this.procH };
    }
    dispose() {
      this.stop();
      this.source.dispose();
      this.pp.dispose();
      this.cpuTarget.dispose();
      this.programs.forEach((p) => p.dispose());
      this.gl.deleteTexture(this.noiseTex);
      this.gl.deleteTexture(this.atlasTex);
    }
  };

  // filtrport/entry.ts
  var ADJUST_DEFAULTS = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    gamma: 1,
    sharpness: 0,
    blur: 0,
    edge: 0,
    quantize: 0
  };
  function freshSettings() {
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    s.active = "none";
    s.adjust = __spreadValues({}, ADJUST_DEFAULTS);
    return s;
  }
  function applyPreset(presetId, current2) {
    const p = BUILTIN_PRESETS.find((x) => x.id === presetId);
    const s = freshSettings();
    s.adjust = __spreadValues({}, current2.adjust);
    s.output = JSON.parse(JSON.stringify(current2.output));
    if (p) deepMerge(s, p.settings);
    return s;
  }
  function deepMerge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
        if (!dst[k] || typeof dst[k] !== "object") dst[k] = {};
        deepMerge(dst[k], src[k]);
      } else {
        dst[k] = src[k];
      }
    }
  }
  function supported() {
    try {
      const c = document.createElement("canvas");
      return !!c.getContext("webgl2");
    } catch (e) {
      return false;
    }
  }
  return __toCommonJS(entry_exports);
})();
