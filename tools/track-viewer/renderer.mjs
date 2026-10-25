import { pathColor } from './path-color.mjs';
import { carDisplayMatrix } from './solo-presentation.mjs';
import { buildRacingTerrainGroups } from './racing-terrain.mjs';
import {buildPathTopologyOverlay,pathNodeMarker} from './path-topology-overlay.mjs';

const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);

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
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec3 position;attribute vec2 uv;attribute vec3 normal;attribute vec3 color;uniform mat4 mvp;uniform mat4 model;varying vec2 vUV;varying vec3 vNormal;varying vec3 vColor;void main(){gl_Position=mvp*model*vec4(position,1.0);vUV=uv;vNormal=mat3(model)*normal;vColor=color;}');
    const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 vUV;varying vec3 vNormal;varying vec3 vColor;uniform sampler2D image;uniform bool textured;uniform bool lit;uniform bool colored;uniform float opacity;void main(){vec4 color=textured?texture2D(image,vUV):vec4(0.35,0.75,0.85,1.0);if(color.a<0.1)discard;float light=lit?0.5+0.5*abs(dot(normalize(vNormal),normalize(vec3(0.4,0.8,0.3)))):1.0;gl_FragColor=vec4(color.rgb*(colored?vColor:vec3(1.0))*light,color.a*opacity);}');
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.attributes = Object.fromEntries(['position', 'uv', 'normal', 'color'].map(key => [key, gl.getAttribLocation(program, key)]));
    this.uniforms = Object.fromEntries(['mvp', 'model', 'image', 'textured', 'lit', 'colored', 'opacity'].map(key => [key, gl.getUniformLocation(program, key)]));
    const pathProgram = this.pathProgram = gl.createProgram();
    const pathVertex = shader(gl.VERTEX_SHADER, 'attribute vec3 position;uniform mat4 mvp;uniform float pointSize;uniform vec2 screenOffset;void main(){gl_Position=mvp*vec4(position,1.0);gl_Position.xy+=screenOffset*gl_Position.w;gl_PointSize=pointSize;}');
    const pathFragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec3 color;uniform float pointRing;void main(){if(pointRing>0.5){float r=length(gl_PointCoord-vec2(0.5));if(r>0.5||r<0.28)discard;}gl_FragColor=vec4(color,1.0);}');
    gl.attachShader(pathProgram, pathVertex); gl.attachShader(pathProgram, pathFragment); gl.linkProgram(pathProgram);
    gl.deleteShader(pathVertex); gl.deleteShader(pathFragment);
    if (!gl.getProgramParameter(pathProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pathProgram));
    this.pathPosition = gl.getAttribLocation(pathProgram, 'position');
    this.pathUniforms = Object.fromEntries(['mvp', 'color', 'pointSize','screenOffset','pointRing'].map(key => [key, gl.getUniformLocation(pathProgram, key)]));
    this.pathTopology=[];this.pathSelection=null;
    this.groups = []; this.pathGroups = []; this.pathDraws = { groups: 0, segments: 0, points: 0, through: false };
    this.textures = new Map(); this.textureSizes = new Map(); this.smooth = false;
    this.carGroups = []; this.carTextures = new Map(); this.carInstances = []; this.carDraws = {cars: 0, groups: 0};
    this.worldGroups = []; this.worldTextures = new Map(); this.worldPlacements = new Set();
    this.worldDraws = {groups: 0, objects: 0};
    this.weaponGroups = []; this.weaponTextures = new Map(); this.weaponMarkerBuffer = null; this.weaponMarkerCount = 0;
    this.weaponDraws = {pickups: 0, projectiles: 0, groups: 0, spawnMarkers: 0};
    this.terrainTemplates = new Map(); this.terrainGroups = new Map(); this.terrainState = null;
    this.terrainDraws = {segments: 0, groups: 0, uploads: 0};
    this.editorBuffer = null; this.editorMarkers = []; this.editorSignature = '';
    this.editorGhostGroups=[]; this.editorGhostTextures=new Map(); this.editorGhostMatrix=null;
    this.editorBoundsBuffer=null; this.editorBoundsSignature=''; this.editorTransforms=new Map();
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.clearColor(0.047, 0.071, 0.114, 1);
    gl.uniform1i(this.uniforms.image, 0);
  }
  clear() {
    this.clearCar();
    this.setEditorGhost(null); this.setEditorBounds(null); this.editorTransforms.clear();
    this.setEditorPickups([]);
    for (const group of this.groups) this.gl.deleteBuffer(group.buffer);
    for (const group of this.pathGroups) this.gl.deleteBuffer(group.buffer);
    for (const group of this.pathTopology) this.gl.deleteBuffer(group.buffer);this.pathTopology=[];this.setPathSelection(null);
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.groups = []; this.pathGroups = []; this.textures.clear(); this.textureSizes.clear();
    this.pathDraws = { groups: 0, segments: 0, points: 0, through: false };
  }
  drawPathLines(count,color,{width=1,outline=false}={}){
    const gl=this.gl,ratio=Math.min(globalThis.devicePixelRatio||1,2),offset=(x,y)=>gl.uniform2f(this.pathUniforms.screenOffset,x*2*ratio/this.canvas.width,y*2*ratio/this.canvas.height);
    if(outline){gl.uniform3fv(this.pathUniforms.color,[.015,.025,.035]);for(const [x,y]of [[-1.5,0],[1.5,0],[0,-1.5],[0,1.5]]){offset(x,y);gl.drawArrays(gl.LINES,0,count);}}
    gl.uniform3fv(this.pathUniforms.color,color);
    for(const [x,y]of (width>1?[[-.5,0],[.5,0],[0,0]]:[[0,0]])){offset(x,y);gl.drawArrays(gl.LINES,0,count);}offset(0,0);
  }
  setPathSelection(node){
    if(this.pathSelection)this.gl.deleteBuffer(this.pathSelection.buffer);this.pathSelection=null;if(!node)return;
    const gl=this.gl,lines=pathNodeMarker(node.position,'ring',46),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(lines),gl.STATIC_DRAW);this.pathSelection={buffer,count:lines.length/3,group:node.group};
  }
  setEditorGhost(scene) {
    for(const group of this.editorGhostGroups)this.gl.deleteBuffer(group.buffer);
    for(const texture of this.editorGhostTextures.values())this.gl.deleteTexture(texture);
    this.editorGhostGroups=[];this.editorGhostTextures.clear();this.editorGhostMatrix=null;
    if(scene){this.uploadRuntimeMeshes(scene,this.editorGhostGroups,this.editorGhostTextures);this.setFilters(this.smooth);}
  }
  setEditorBounds(bounds) {
    const signature=JSON.stringify(bounds);if(signature===this.editorBoundsSignature)return;this.editorBoundsSignature=signature;
    if(!bounds){if(this.editorBoundsBuffer)this.gl.deleteBuffer(this.editorBoundsBuffer);this.editorBoundsBuffer=null;return;}
    const points=Array.from({length:8},(_,i)=>bounds.map(([min,max],axis)=>i&(1<<axis)?max:min)),values=[];
    for(let i=0;i<8;i++)for(let axis=0;axis<3;axis++)if(!(i&(1<<axis)))values.push(...points[i],...points[i|(1<<axis)]);
    this.editorBoundsBuffer??=this.gl.createBuffer();this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.editorBoundsBuffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(values),this.gl.DYNAMIC_DRAW);
  }
  renderEditorModels(matrix) {
    const gl=this.gl;
    if(this.editorGhostMatrix){
      gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.model,false,this.editorGhostMatrix);gl.uniform1i(this.uniforms.colored,false);gl.disableVertexAttribArray(this.attributes.color);gl.uniform1f(this.uniforms.opacity,0.5);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
      for(const group of this.editorGhostGroups){gl.bindBuffer(gl.ARRAY_BUFFER,group.buffer);for(const[key,size,offset]of[['position',3,0],['uv',2,12],['normal',3,20]]){gl.enableVertexAttribArray(this.attributes[key]);gl.vertexAttribPointer(this.attributes[key],size,gl.FLOAT,false,32,offset);}gl.bindTexture(gl.TEXTURE_2D,this.editorGhostTextures.get(group.page));gl.drawArrays(gl.TRIANGLES,0,group.vertices);}
      gl.disable(gl.BLEND);gl.depthMask(true);gl.uniform1f(this.uniforms.opacity,1);gl.uniformMatrix4fv(this.uniforms.model,false,identity);
    }
    if(this.editorBoundsBuffer){
      gl.useProgram(this.pathProgram);for(const attribute of Object.values(this.attributes))gl.disableVertexAttribArray(attribute);gl.enableVertexAttribArray(this.pathPosition);gl.bindBuffer(gl.ARRAY_BUFFER,this.editorBoundsBuffer);gl.vertexAttribPointer(this.pathPosition,3,gl.FLOAT,false,12,0);gl.uniformMatrix4fv(this.pathUniforms.mvp,false,matrix);gl.uniform3fv(this.pathUniforms.color,[0.3,1,1]);gl.drawArrays(gl.LINES,0,24);gl.disableVertexAttribArray(this.pathPosition);gl.useProgram(this.program);
    }
  }
  setEditorPickups(points) {
    const signature = JSON.stringify(points);
    if (signature === this.editorSignature) return;
    this.editorSignature = signature; this.editorMarkers = [];
    if (!points.length) {if (this.editorBuffer) this.gl.deleteBuffer(this.editorBuffer);this.editorBuffer=null;return;}
    if (points.some(row=>!Array.isArray(row.position)||row.position.length!==3||row.position.some(n=>!Number.isFinite(n)))) throw Error('Invalid pickup editor marker.');
    if (!this.editorBuffer) this.editorBuffer=this.gl.createBuffer();
    const vertices=[];
    for(const row of points){this.editorMarkers.push({offset:vertices.length/3,selected:row.selected,added:row.added});vertices.push(...row.position);}
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.editorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(vertices),this.gl.DYNAMIC_DRAW);
  }
  renderEditorPickups(matrix,ratio) {
    if(!this.editorBuffer)return;
    const gl=this.gl;gl.useProgram(this.pathProgram);
    for(const attribute of Object.values(this.attributes))gl.disableVertexAttribArray(attribute);
    gl.enableVertexAttribArray(this.pathPosition);gl.bindBuffer(gl.ARRAY_BUFFER,this.editorBuffer);
    gl.vertexAttribPointer(this.pathPosition,3,gl.FLOAT,false,12,0);gl.uniformMatrix4fv(this.pathUniforms.mvp,false,matrix);
    gl.depthMask(false);gl.disable(gl.DEPTH_TEST);
    try {
      for(const marker of this.editorMarkers){
        if(marker.selected){gl.uniform1f(this.pathUniforms.pointSize,16*ratio);gl.uniform3fv(this.pathUniforms.color,[1,1,1]);gl.drawArrays(gl.POINTS,marker.offset,1);}
        gl.uniform1f(this.pathUniforms.pointSize,10*ratio);gl.uniform3fv(this.pathUniforms.color,marker.added?[0.3,1,1]:[1,0.78,0.25]);gl.drawArrays(gl.POINTS,marker.offset,1);
      }
    }finally{gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disableVertexAttribArray(this.pathPosition);gl.useProgram(this.program);}
  }
  clearCar() {
    for (const group of [...this.carGroups, ...this.worldGroups, ...this.weaponGroups, ...this.terrainGroups.values()]) this.gl.deleteBuffer(group.buffer);
    if (this.weaponMarkerBuffer) this.gl.deleteBuffer(this.weaponMarkerBuffer);
    for (const texture of [...this.carTextures.values(), ...this.worldTextures.values(), ...this.weaponTextures.values()]) this.gl.deleteTexture(texture);
    this.carGroups = []; this.carTextures.clear(); this.carInstances = []; this.carDraws = {cars: 0, groups: 0};
    this.worldGroups = []; this.worldTextures.clear(); this.worldPlacements.clear();
    this.worldDraws = {groups: 0, objects: 0};
    this.weaponGroups = []; this.weaponTextures.clear(); this.weaponMarkerBuffer = null; this.weaponMarkerCount = 0;
    this.weaponDraws = {pickups: 0, projectiles: 0, groups: 0, spawnMarkers: 0};
    this.terrainGroups.clear(); this.terrainTemplates.clear(); this.terrainState = null;
    this.terrainDraws = {segments: 0, groups: 0, uploads: 0};
  }
  uploadRuntimeMeshes(assets, groups, textures, {carIndex} = {}) {
    const gl = this.gl;
    for (const group of assets.groups) {
      const buffer = gl.createBuffer(); groups.push({...group, buffer, ...(carIndex === undefined ? {} : {carIndex})});
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, Uint8Array.from(atob(group.buffer), char => char.charCodeAt(0)), gl.STATIC_DRAW);
    }
    for (const [page, image] of assets.textures) {
      //All roster models use pages from the same selected archive. Keep one
      //GPU texture per actual page while preserving each car's own mesh.
      if (textures.has(page)) continue;
      const texture = gl.createTexture(); textures.set(page, texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }
  setCar(assets) {
    this.clearCar();
    const gl = this.gl;
    try {
      for (const [carIndex, car] of (assets.cars ?? [assets]).entries()) {
        const first = this.carGroups.length;
        this.uploadRuntimeMeshes(car, this.carGroups, this.carTextures, {carIndex});
        this.carInstances.push({index: carIndex, vehicleType: car.vehicleType ?? null, groups: this.carGroups.slice(first)});
      }
      if (assets.worldObjects) {
        this.uploadRuntimeMeshes(assets.worldObjects, this.worldGroups, this.worldTextures);
        this.worldPlacements = new Set(assets.worldObjects.placementIndices);
      }
      if (assets.weapons) {
        this.uploadRuntimeMeshes(assets.weapons, this.weaponGroups, this.weaponTextures);
        const points = assets.weapons.spawnPositions.map(([x,y,z]) => [x,-y,-z]);
        if (points.length) {
          this.weaponMarkerBuffer = gl.createBuffer(); this.weaponMarkerCount = points.length;
          gl.bindBuffer(gl.ARRAY_BUFFER, this.weaponMarkerBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flat()), gl.STATIC_DRAW);
        }
      }
      this.terrainTemplates = new Map((assets.terrain?.segments ?? []).map(segment => [segment.index, segment]));
      this.setFilters(this.smooth);
      if (gl.getError() !== gl.NO_ERROR) throw Error('The GPU could not load the racing cars.');
    } catch (error) {this.clearCar(); throw error;}
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
      for(const batch of buildPathTopologyOverlay(scene.paths?.graph)){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(batch.lines),gl.STATIC_DRAW);this.pathTopology.push({...batch,lines:undefined,count:batch.lines.length/3,buffer});}
      for (const [page, image] of scene.textures) {
        this.textureSizes.set(page, {width: image.width, height: image.height});
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
    for (const texture of [...this.textures.values(), ...this.carTextures.values(), ...this.worldTextures.values(), ...this.weaponTextures.values(), ...this.editorGhostTextures.values()]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }
  }
  updateTerrain(state) {
    if (!state || state === this.terrainState) return;
    const gl = this.gl;
    for (const segment of state.segments) {
      const template = this.terrainTemplates.get(segment.index);
      if (!template) throw Error('Racing terrain snapshot has no authored mesh template.');
      for (const group of buildRacingTerrainGroups(template, segment, state.palette, this.textureSizes)) {
        const key = `${group.segment}:${group.page}`, previous = this.terrainGroups.get(key);
        const buffer = previous?.buffer ?? gl.createBuffer();
        this.terrainGroups.set(key, {...group, kind: 'terrain', colored: true, buffer});
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, group.data, gl.DYNAMIC_DRAW);
        this.terrainDraws.uploads++;
      }
    }
    this.terrainState = state;
  }
  render(navigation, options) {
    const gl = this.gl, canvas = this.canvas, ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const matrix = navigation.matrix(width / height);
    gl.uniformMatrix4fv(this.uniforms.mvp, false, matrix);
    gl.uniformMatrix4fv(this.uniforms.model, false, identity);
    gl.uniform1f(this.uniforms.opacity,1);
    gl.uniform1i(this.uniforms.textured, options.textures); gl.uniform1i(this.uniforms.lit, options.lighting);
    this.updateTerrain(options.car?.terrain);
    const animated = options.car?.terrain ? new Set(this.terrainState.segments.map(row => row.index)) : new Set();
    const sceneGroups = [...this.groups.filter(group => group.kind !== 'terrain' || !animated.has(group.segment)), ...(animated.size ? this.terrainGroups.values() : [])];
    this.terrainDraws.segments = 0; this.terrainDraws.groups = 0;
    const terrainSegments = new Set();
    for (const group of sceneGroups) {
      if(this.editorTransforms.size)gl.uniformMatrix4fv(this.uniforms.model,false,this.editorTransforms.get(group.instance)??identity);
      if (group.kind === 'object') {
        if (!options.objects || options.car?.brokenPlacements?.includes(group.instance) || (options.car?.worldObjects && this.worldPlacements.has(group.instance))) continue;
      } else if (options.sector !== -1 && group.segment !== options.sector) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      const stride = group.colored ? 44 : 32;
      for (const [key, size, offset] of [['position', 3, 0], ['uv', 2, 12], ['normal', 3, 20]]) {
        gl.enableVertexAttribArray(this.attributes[key]); gl.vertexAttribPointer(this.attributes[key], size, gl.FLOAT, false, stride, offset);
      }
      gl.uniform1i(this.uniforms.colored, Boolean(group.colored));
      if (group.colored) {
        gl.enableVertexAttribArray(this.attributes.color); gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, stride, 32);
        this.terrainDraws.groups++; terrainSegments.add(group.segment);
      } else gl.disableVertexAttribArray(this.attributes.color);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.get(group.page)); gl.drawArrays(gl.TRIANGLES, 0, group.vertices);
    }
    this.terrainDraws.segments = terrainSegments.size;
    gl.uniformMatrix4fv(this.uniforms.model,false,identity);
    gl.uniform1i(this.uniforms.colored, false); gl.disableVertexAttribArray(this.attributes.color);
    // Runtime meshes replace their authored static placements. The immutable
    // snapshot supplies native visibility and pose; object toggles still apply.
    const drawnWorldObjects = new Set();
    this.worldDraws = {groups: 0, objects: 0};
    for (const group of options.objects && options.car?.worldObjects ? this.worldGroups : []) {
      const object = options.car.worldObjects[group.instance];
      if (!object?.visible) continue;
      gl.uniformMatrix4fv(this.uniforms.model, false, carDisplayMatrix(object));
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      for (const [key, size, offset] of [['position', 3, 0], ['uv', 2, 12], ['normal', 3, 20]]) {
        gl.enableVertexAttribArray(this.attributes[key]); gl.vertexAttribPointer(this.attributes[key], size, gl.FLOAT, false, 32, offset);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.worldTextures.get(group.page)); gl.drawArrays(gl.TRIANGLES, 0, group.vertices);
      this.worldDraws.groups++; drawnWorldObjects.add(group.instance);
    }
    this.worldDraws.objects = drawnWorldObjects.size;
    const cars = options.car?.cars ?? (options.car ? [options.car] : []), drawnCars = new Set();
    this.carDraws = {cars: 0, groups: 0};
    for (const group of cars.length ? this.carGroups : []) {
      const part = cars[group.carIndex]?.parts[group.instance];
      if (!part) continue;
      gl.uniformMatrix4fv(this.uniforms.model, false, carDisplayMatrix(part));
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      for (const [key, size, offset] of [['position', 3, 0], ['uv', 2, 12], ['normal', 3, 20]]) {
        gl.enableVertexAttribArray(this.attributes[key]); gl.vertexAttribPointer(this.attributes[key], size, gl.FLOAT, false, 32, offset);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.carTextures.get(group.page)); gl.drawArrays(gl.TRIANGLES, 0, group.vertices);
      drawnCars.add(group.carIndex); this.carDraws.groups++;
    }
    this.carDraws.cars = drawnCars.size;
    const drawnWeapons = new Set();
    this.weaponDraws = {pickups: 0, projectiles: 0, groups: 0, spawnMarkers: 0};
    for (const group of options.car?.weapons?.enabled ? this.weaponGroups : []) {
      const object = options.car.weapons.objects[group.instance];
      if (!object?.visible) continue;
      gl.uniformMatrix4fv(this.uniforms.model, false, carDisplayMatrix(object));
      gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
      for (const [key, size, offset] of [['position', 3, 0], ['uv', 2, 12], ['normal', 3, 20]]) {
        gl.enableVertexAttribArray(this.attributes[key]); gl.vertexAttribPointer(this.attributes[key], size, gl.FLOAT, false, 32, offset);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.weaponTextures.get(group.page)); gl.drawArrays(gl.TRIANGLES, 0, group.vertices);
      drawnWeapons.add(group.instance); this.weaponDraws.groups++;
    }
    for (const instance of drawnWeapons) this.weaponDraws[options.car.weapons.objects[instance].kind === 'pickup' ? 'pickups' : 'projectiles']++;
    if (options.car?.weapons?.enabled && this.weaponMarkerBuffer) {
      //Gold points mark authored spawn locations, including unavailable boxes.
      //Their placement never supplies collection/respawn decisions.
      gl.useProgram(this.pathProgram);
      for (const attribute of Object.values(this.attributes)) gl.disableVertexAttribArray(attribute);
      gl.enableVertexAttribArray(this.pathPosition); gl.bindBuffer(gl.ARRAY_BUFFER, this.weaponMarkerBuffer);
      gl.vertexAttribPointer(this.pathPosition, 3, gl.FLOAT, false, 12, 0);
      gl.uniformMatrix4fv(this.pathUniforms.mvp, false, matrix); gl.uniform1f(this.pathUniforms.pointSize, 5 * ratio);
      gl.uniform3fv(this.pathUniforms.color, [1,0.78,0.25]); gl.drawArrays(gl.POINTS, 0, this.weaponMarkerCount);
      this.weaponDraws.spawnMarkers = this.weaponMarkerCount;
      gl.disableVertexAttribArray(this.pathPosition); gl.useProgram(this.program);
    }
    this.pathDraws = { groups: 0, segments: 0, points: 0, through: false,arrows:0,branches:0,merges:0,splits:0,pending:0,pendingMarkers:0 };
    this.renderEditorPickups(matrix,ratio);
    this.renderEditorModels(matrix);
    if (!options.paths || !this.pathGroups.length) return;
    gl.useProgram(this.pathProgram);
    for (const attribute of Object.values(this.attributes)) gl.disableVertexAttribArray(attribute);
    gl.enableVertexAttribArray(this.pathPosition);
    gl.uniformMatrix4fv(this.pathUniforms.mvp, false, matrix);
    gl.uniform1f(this.pathUniforms.pointSize, 14 * ratio);
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
        this.pathDraws.groups++;
        this.pathDraws.segments += Math.max(0, group.count - 1);
      }
      for(const batch of this.pathTopology){
        if(options.pathGroup!==-1&&!batch.groups.includes(options.pathGroup))continue;
        if(['merges','splits','pendingMarkers'].includes(batch.kind)&&!options.pathShapes)continue;
        gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);gl.vertexAttribPointer(this.pathPosition,3,gl.FLOAT,false,12,0);
        const color=batch.color??this.pathGroups.find(g=>g.index===batch.groups[0])?.color??[1,1,1];
        this.drawPathLines(batch.count,color,{width:2,outline:true});
        if(batch.kind==='directions')this.pathDraws.arrows+=batch.features;else this.pathDraws[batch.kind]+=batch.features;
      }
      // Draw small node circles last so outlined connection strokes cannot
      // cover the markers at their endpoints.
      if(options.pathPoints){
        gl.uniform1f(this.pathUniforms.pointRing,1);
        for(const group of this.pathGroups){if(options.pathGroup!==-1&&group.index!==options.pathGroup)continue;gl.bindBuffer(gl.ARRAY_BUFFER,group.buffer);gl.vertexAttribPointer(this.pathPosition,3,gl.FLOAT,false,12,0);gl.uniform3fv(this.pathUniforms.color,group.color);gl.drawArrays(gl.POINTS,0,group.count);this.pathDraws.points+=group.count;}
        gl.uniform1f(this.pathUniforms.pointRing,0);
      }
      if(this.pathSelection&&(options.pathGroup===-1||this.pathSelection.group===options.pathGroup)){gl.bindBuffer(gl.ARRAY_BUFFER,this.pathSelection.buffer);gl.vertexAttribPointer(this.pathPosition,3,gl.FLOAT,false,12,0);this.drawPathLines(this.pathSelection.count,[1,1,1],{width:2,outline:true});}
    } finally {
      gl.uniform1f(this.pathUniforms.pointRing,0);
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
      gl.disableVertexAttribArray(this.pathPosition); gl.useProgram(this.program);
    }
  }
}
