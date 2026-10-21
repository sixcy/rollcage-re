import { buildSceneExport } from './scene-export.mjs';
import { decodeTrackPaths } from './track-paths.mjs';
import { placementMatrix, transformPlacedVertex } from './fixed-math.mjs';

function range(data, offset, bytes, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 0 || offset + bytes > data.length) throw new Error(`Firebugs ${label} exceeds resource bounds.`);
}
function signature(data, magic, bytes) {
  if (!Buffer.isBuffer(data) || data.length < bytes || data.toString('ascii', 0, 4) !== magic) throw new Error(`Invalid Firebugs ${magic.trim()} header.`);
}

// Firebugs serializes PS1 GPU UV records: CLUT at +2, TPAGE at +6.
export function readFirebugsMaterial(data, offset) {
  range(data, offset, 12, 'material');
  const clut = data.readUInt16LE(offset + 2) & 0x7fff, tpage = data.readUInt16LE(offset + 6) | 0x20;
  const corners = [[data[offset],data[offset+1]], [data[offset+4],data[offset+5]],
    [data[offset+8],data[offset+9]], [data[offset+10],data[offset+11]]];
  return { clut, tpage, page: tpage * 65536 + clut, uv: corners };
}

export function parseFirebugsTerrain(data) {
  signature(data, 'GFXM', 0x140);
  const count = data.readUInt32LE(0x10), table = data.readUInt32LE(0x14), uvTable = data.readUInt32LE(0x110);
  range(data, table, count * 4, 'segment table');
  const segments = Array.from({ length: count }, (_, index) => {
    const offset = data.readUInt32LE(table + index * 4);
    range(data, offset, 0x60, 'segment header');
    if (data.toString('ascii', offset, offset + 4) !== 'SEGM') throw new Error('Invalid Firebugs SEGM.');
    const columns = data.readUInt32LE(offset + 8), rows = data.readUInt32LE(offset + 12);
    const verticesOffset = data.readUInt32LE(offset + 0x20), packetsOffset = data.readUInt32LE(offset + 0x50);
    const vertexCount = (columns + 1) * (rows + 1), faceCount = columns * rows;
    range(data, verticesOffset, vertexCount * 8, 'terrain vertices');
    range(data, packetsOffset, faceCount * 4, 'terrain packets');
    const vertices = Array.from({ length: vertexCount }, (_, i) => {
      const p = verticesOffset + i * 8;
      return [data.readInt16LE(p), data.readInt16LE(p+2), data.readInt16LE(p+4), data.readUInt16LE(p+6)];
    });
    const faces = Array.from({ length: faceCount }, (_, i) => {
      const packed = data.readUInt32LE(packetsOffset + i * 4);
      // FUN_8005f9c0, 800600c8..80060110: low11 selects a GPU template;
      // bits11..17 select a 16-byte terrain UV descriptor.
      const textureRecord = (packed >>> 11) & 127;
      const top = Math.floor(i / columns) * (columns + 1) + i % columns;
      const grid = [top, top+1, top+columns+1, top+columns+2];
      // Native grid draw at 80060b40..80060b60 rotates the same four
      // corners as the PC reader when bottom-right vertex flag bit 2 is clear.
      const indices = vertices[grid[3]][3] & 4 ? grid : [grid[1],grid[3],grid[0],grid[2]];
      return { index: i, packed, textureRecord, indices,
        ...readFirebugsMaterial(data, uvTable + textureRecord * 16) };
    });
    return { index, columns, rows, offset, vertices, faces };
  });
  return { segments, uvTable };
}

export function parseFirebugsModels(data) {
  signature(data, 'GFXM', 0x140);
  const table = data.readUInt32LE(0x18), count = data.readUInt16LE(0x2c);
  range(data, table, count * 4, 'model table');
  return Array.from({ length: count }, (_, index) => {
    const offset = data.readUInt32LE(table + index * 4);
    if (!offset) return null;
    range(data, offset, 0x70, 'model header');
    if (![0x4d4f4401,0x4d4f4301].includes(data.readUInt32LE(offset))) throw new Error('Invalid Firebugs model tag.');
    const vertexCount = data.readUInt16LE(offset + 4), faceCount = data.readUInt16LE(offset + 6);
    const vp = offset + data.readUInt32LE(offset + 0x44), fp = offset + data.readUInt32LE(offset + 12);
    range(data, vp, vertexCount * 8, 'model vertices');
    range(data, fp, faceCount * 8, 'model faces');
    const vertices = Array.from({ length: vertexCount }, (_, i) => [0,2,4].map(a => data.readInt16LE(vp+i*8+a)));
    const start = data.readUInt32LE(offset + 0x3c);
    const keys = data.readUInt32LE(0xcc) + start * 2, materials = data.readUInt32LE(0xd8);
    const faces = Array.from({ length: faceCount }, (_, i) => {
      const p = fp + i * 8, a = data[p], b = data[p+1], c = data[p+2], d = data[p+3];
      const indices = [a-1,c-1,b-1,...(d ? [d-1] : [])];
      if (indices.some(v => v < 0 || v >= vertexCount)) throw new Error(`Invalid Firebugs model ${index} face ${i}.`);
      return { index: i, indices };
    });
    return { index, offset, vertices, faces, keys, materials };
  });
}

export function parseFirebugsPlacements(data, models) {
  signature(data, 'BTX ', 0x40);
  const count = data.readUInt32LE(0x14), offset = data.readUInt32LE(0x28), stride = 64;
  range(data, offset, count * stride, 'placement records');
  const records = Array.from({ length: count }, (_, index) => {
    const p = offset + index * stride, flags = data.readUInt16LE(p), type = flags & 0x3ff;
    const record = { index, flags, type, modelIndex: data[p+3], position: [8,10,12].map(a=>data.readInt16LE(p+a)), angles: [14,16,18].map(a=>data.readInt16LE(p+a)) };
    if (type === 0 && !models[record.modelIndex]) throw new Error(`Firebugs placement ${index} references a missing model.`);
    return record;
  });
  return { count, offset, stride, records };
}

// The retained VRAM bitmap stores the right half (x=512..1023) of PS1 VRAM.
export function decodeFirebugsTexture(data, tpage, clut) {
  signature(data, 'VRAM', 16 + 512 * 512 * 2);
  const depth = (tpage >>> 7) & 3;
  if (depth === 3) throw new Error('Reserved PS1 texture depth.');
  const word = (x,y) => {
    // FUN_80061328 uploads an additional palette rectangle to (0,511,256,1).
    if (y === 511 && x >= 0 && x < 256) {
      const p=16+512*512*2+x*2; range(data,p,2,'extra VRAM palette'); return data.readUInt16LE(p);
    }
    if (x < 512 || x >= 1024 || y < 0 || y >= 512) throw new Error(`PS1 texture address outside retained VRAM (${x},${y}).`);
    return data.readUInt16LE(16 + y*1024 + (x-512)*2);
  };
  const originX = (tpage & 15)*64, originY = ((tpage >>> 4)&1)*256;
  const rgba = Buffer.alloc(256 * 256 * 4);
  for (let y=0;y<256;y++) for (let x=0;x<256;x++) {
    const pixelsPerWord = depth===0 ? 4 : depth===1 ? 2 : 1;
    const raw = word(originX + Math.floor(x/pixelsPerWord),originY+y);
    const color = depth===2 ? raw : word((clut&63)*16 + ((raw >>> ((x%pixelsPerWord)*(depth===0?4:8))) & (depth===0?15:255)), clut>>>6);
    const p=(y*256+x)*4;
    rgba[p]=Math.round((color&31)*255/31); rgba[p+1]=Math.round(((color>>>5)&31)*255/31); rgba[p+2]=Math.round(((color>>>10)&31)*255/31);
    rgba[p+3]=color===0 ? 0 : 255;
  }
  return { width:256,height:256,rgba };
}

export function decodeFirebugsScene(geometry, vram, btx) {
  const terrain=parseFirebugsTerrain(geometry),models=parseFirebugsModels(geometry),placements=parseFirebugsPlacements(btx,models);
  if (!terrain.segments.length) throw new Error('Firebugs resource has no track terrain.');
  const meshes=placements.records.filter(r=>r.type===0&&(r.flags&0x400)).map(record=>{
    const model=models[record.modelIndex];
    // FUN_80061328 calls FUN_80028b94 then FUN_800288b4. Their arithmetic
    // and all 202 trig entries at 0x800a55d8 match the shared PC routines.
    const matrix=placementMatrix(record.angles);
    range(geometry,model.keys,model.faces.length*2,'placed model material keys');
    const faces=model.faces.map((face,i)=>{
      const material=readFirebugsMaterial(geometry,model.materials+geometry.readUInt16LE(model.keys+i*2));
      return { ...face,...material,uv:material.uv.slice(0,face.indices.length) };
    });
    return { index:record.index, modelIndex:record.modelIndex, vertices:model.vertices.map(v=>transformPlacedVertex(v,matrix,record.position)), faces };
  });
  const textures=new Map();
  for (const mesh of [...terrain.segments,...meshes]) for (const face of mesh.faces) {
    if (!textures.has(face.page)) textures.set(face.page,decodeFirebugsTexture(vram,face.tpage,face.clut));
  }
  const output=buildSceneExport(terrain,textures,meshes);
  if (!output.bounds.flat().every(Number.isFinite)) throw new Error('Invalid Firebugs scene bounds.');
  return { ...output,paths:decodeTrackPaths(geometry,true),segments:terrain.segments.length,instances:meshes.length,textures,
    placementTypes:placements.records.reduce((a,r)=>{a[r.type]=(a[r.type]??0)+1;return a;},{}) };
}
