import { pathColor } from './path-color.mjs';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is unavailable. Enable hardware acceleration or try another browser.');
    const shader = (type, source) => {
      const object = gl.createShader(type);
      gl.shaderSource(object, source); gl.compileShader(object);
      if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(object));
      return object;
    };
    const program = this.program = gl.createProgram();
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec3 position;attribute vec2 uv;attribute vec3 normal;uniform mat4 mvp;varying vec2 vUV;varying vec3 vNormal;void main(){gl_Position=mvp*vec4(position,1.0);vUV=uv;vNormal=normal;}');
    const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 vUV;varying vec3 vNormal;uniform sampler2D image;uniform bool textured;uniform bool lit;void main(){vec4 color=textured?texture2D(image,vUV):vec4(0.35,0.75,0.85,1.0);if(color.a<0.1)discard;float light=lit?0.5+0.5*abs(dot(normalize(vNormal),normalize(vec3(0.4,0.8,0.3)))):1.0;gl_FragColor=vec4(color.rgb*light,color.a);}');
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.attributes = Object.fromEntries(['position', 'uv', 'normal'].map(key => [key, gl.getAttribLocation(program, key)]));
    this.uniforms = Object.fromEntries(['mvp', 'image', 'textured', 'lit'].map(key => [key, gl.getUniformLocation(program, key)]));
    const pathProgram = this.pathProgram = gl.createProgram();
    const pathVertex = shader(gl.VERTEX_SHADER, 'attribute vec3 position;uniform mat4 mvp;uniform float pointSize;void main(){gl_Position=mvp*vec4(position,1.0);gl_PointSize=pointSize;}');
    const pathFragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec3 color;void main(){gl_FragColor=vec4(color,1.0);}');
    gl.attachShader(pathProgram, pathVertex); gl.attachShader(pathProgram, pathFragment); gl.linkProgram(pathProgram);
    gl.deleteShader(pathVertex); gl.deleteShader(pathFragment);
    if (!gl.getProgramParameter(pathProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pathProgram));
    this.pathPosition = gl.getAttribLocation(pathProgram, 'position');
    this.pathUniforms = Object.fromEntries(['mvp', 'color', 'pointSize'].map(key => [key, gl.getUniformLocation(pathProgram, key)]));
    this.groups = []; this.pathGroups = []; this.pathDraws = { groups: 0, segments: 0, points: 0, through: false };
    this.textures = new Map(); this.smooth = false;
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clearColor(0.047, 0.071, 0.114, 1);
    gl.uniform1i(this.uniforms.image, 0);
  }
  clear() {
    for (const group of this.groups) this.gl.deleteBuffer(group.buffer);
    for (const group of this.pathGroups) this.gl.deleteBuffer(group.buffer);
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.groups = []; this.pathGroups = []; this.textures.clear();
    this.pathDraws = { groups: 0, segments: 0, points: 0, through: false };
  }
  setScene(scene) {
    this.clear();
    const gl = this.gl;
    try {
      for (const group of scene.groups) {
        const buffer = gl.createBuffer();
        this.groups.push({ ...group, buffer });
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const text = atob(group.buffer), bytes = Uint8Array.from(text, char => char.charCodeAt(0));
        gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
      }
      for (const group of scene.paths?.groups ?? []) {
        const buffer = gl.createBuffer(), hex = pathColor(group.index).slice(1);
        const color = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
        this.pathGroups.push({ index: group.index, count: group.positions.length, color, buffer });
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(group.positions.flat()), gl.STATIC_DRAW);
      }
      for (const [page, image] of scene.textures) {
        const texture = gl.createTexture(); this.textures.set(page, texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.rgba);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      this.setFilters(this.smooth);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('The GPU could not load this track. Try another browser or track.');
    } catch (error) { this.clear(); throw error; }
  }
  setFilters(smooth) {
    this.smooth = smooth;
    const gl = this.gl, filter = smooth ? gl.LINEAR : gl.NEAREST;
    for (const texture of this.textures.values()) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
  }
  render(navigation, options) {
    const gl = this.gl, canvas = this.canvas, ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const matrix = navigation.matrix(width / height);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, matrix);
    gl.uniform1i(this.uniforms.textured, options.textures); gl.uniform1i(this.uniforms.lit, options.lighting);
    for (const group of this.groups) {
      if (group.kind === 'object' ? !options.objects : options.sector !== -1 && group.segment !== options.sector) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      for (const [key, size, offset] of [['position', 3, 0], ['uv', 2, 12], ['normal', 3, 20]]) {
        gl.enableVertexAttribArray(this.attributes[key]); gl.vertexAttribPointer(this.attributes[key], size, gl.FLOAT, false, 32, offset);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.textures.get(group.page)); gl.drawArrays(gl.TRIANGLES, 0, group.vertices);
    }
    this.pathDraws = { groups: 0, segments: 0, points: 0, through: false };
    if (!options.paths || !this.pathGroups.length) return;
    gl.useProgram(this.pathProgram);
    for (const attribute of Object.values(this.attributes)) gl.disableVertexAttribArray(attribute);
    gl.enableVertexAttribArray(this.pathPosition);
    gl.uniformMatrix4fv(this.pathUniforms.mvp, false, matrix);
    gl.uniform1f(this.pathUniforms.pointSize, 5 * ratio);
    // Overlays never alter the terrain depth buffer or the terrain's positions.
    gl.depthMask(false);
    if (options.pathThrough) gl.disable(gl.DEPTH_TEST);
    this.pathDraws.through = Boolean(options.pathThrough);
    try {
      for (const group of this.pathGroups) {
        if (options.pathGroup !== -1 && group.index !== options.pathGroup) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
        gl.vertexAttribPointer(this.pathPosition, 3, gl.FLOAT, false, 12, 0);
        gl.uniform3fv(this.pathUniforms.color, group.color);
        if (group.count > 1) gl.drawArrays(gl.LINE_STRIP, 0, group.count);
        if (options.pathPoints) gl.drawArrays(gl.POINTS, 0, group.count);
        this.pathDraws.groups++;
        this.pathDraws.segments += Math.max(0, group.count - 1);
        if (options.pathPoints) this.pathDraws.points += group.count;
      }
    } finally {
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
      gl.disableVertexAttribArray(this.pathPosition); gl.useProgram(this.program);
    }
  }
}
