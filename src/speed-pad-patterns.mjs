import {parseScene} from './scene.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';

const corners=[[0,0],[1,0],[0,1],[1,1]];
const uvOffsets=[0,4,8,10];
const cornerOrder=face=>face.vertexFlags&4?[0,1,2,3]:[1,3,0,2];
const physicalUV=face=>{const result=[];cornerOrder(face).forEach((corner,i)=>result[corner]=face.uv[i]);return result;};
const material=(data,scene,face)=>data.readUInt32LE(scene.uvTable+face.textureRecord*16+12)&255;
const animatedSectors=(data,scene)=>{
  const locked=new Set(scene.segments.filter(s=>data[s.offset+6]&63).map(s=>s.index)),count=data[0xfc],base=data.readUInt32LE(0x100);
  if(count&&base+count*4>data.length)throw Error('Animated surface references exceed resource bounds.');
  for(let i=0;i<count;i++)locked.add(data[base+i*4+2]);return locked;
};

// The acceleration surface is category 1 (48d680), not a fixed atlas page.
// Recognize original two-cell mirrored arrows; never manufacture an atlas crop.
export function speedPadTilePairs(low,high) {
  const a=parseScene(low),b=parseScene(high),patterns=[],seen=new Set(),lockedLow=animatedSectors(low,a),lockedHigh=animatedSectors(high,b);
  for(const s of a.segments)for(const face of s.faces){
    const col=face.index%s.columns,row=Math.floor(face.index/s.columns);
    if(col+1>=s.columns||lockedLow.has(s.index)||lockedHigh.has(s.index)||material(low,a,face)!==1)continue;
    const right=s.faces[face.index+1],other=b.segments[s.index];
    if(material(low,a,right)!==1||right.page!==face.page||!other)continue;
    const leftUV=physicalUV(face),rightUV=physicalUV(right);
    if(!leftUV.every((uv,i)=>uv.every((n,j)=>n===rightUV[i^1][j])))continue;
    const cells=[face,right];if(cells.some(c=>!other.faces[c.index]||material(high,b,other.faces[c.index])!==1||(c.pageWord&~0x7f)||(other.faces[c.index].pageWord&~0x7f)))continue;
    const signature=cells.map(c=>low.subarray(a.uvTable+c.textureRecord*16,a.uvTable+c.textureRecord*16+16).toString('hex')+high.subarray(b.uvTable+other.faces[c.index].textureRecord*16,b.uvTable+other.faces[c.index].textureRecord*16+16).toString('hex')).join(':');
    if(seen.has(signature))continue;seen.add(signature);
    patterns.push({sector:s.index,cell:face.index,width:2,height:1,cells:[{x:0,y:0,cell:face.index},{x:1,y:0,cell:right.index}],page:face.page,uv:face.uv,label:`Arrow ${patterns.length+1} · 2 cells · P${face.page} · acceleration`,row,col});
  }
  return patterns;
}

// v6 pairs the two different mirrored strips into one complete 2x2 glyph.
// Retain the old pair recognizer for lossless v5 command interpretation.
export function speedPadPatterns(low,high){
  const a=parseScene(low),b=parseScene(high),lockedA=animatedSectors(low,a),lockedB=animatedSectors(high,b),patterns=[],seen=new Set();
  const mirrored=(left,right)=>left.page===right.page&&physicalUV(left).every((uv,i)=>uv.every((n,j)=>n===physicalUV(right)[i^1][j]));
  for(const s of a.segments)for(const face of s.faces){
    const col=face.index%s.columns,row=Math.floor(face.index/s.columns);if(col+1>=s.columns||row+1>=s.rows||lockedA.has(s.index)||lockedB.has(s.index))continue;
    const ids=[face.index,face.index+1,face.index+s.columns,face.index+s.columns+1],cells=ids.map(i=>s.faces[i]),other=b.segments[s.index];
    if(!other||cells.some(c=>material(low,a,c)!==1||(c.pageWord&~0x77f))||ids.some(i=>!other.faces[i]||material(high,b,other.faces[i])!==1||(other.faces[i].pageWord&~0x77f)))continue;
    if(!mirrored(cells[0],cells[1])||!mirrored(cells[2],cells[3])||cells.some(c=>c.page!==face.page)||JSON.stringify(physicalUV(cells[0]))===JSON.stringify(physicalUV(cells[2])))continue;
    const signature=ids.map(i=>low.subarray(a.uvTable+s.faces[i].textureRecord*16,a.uvTable+s.faces[i].textureRecord*16+16).toString('hex')+high.subarray(b.uvTable+other.faces[i].textureRecord*16,b.uvTable+other.faces[i].textureRecord*16+16).toString('hex')).join(':');if(seen.has(signature))continue;seen.add(signature);
    patterns.push({kind:'arrow4',sector:s.index,cell:face.index,width:2,height:2,cells:ids.map((cell,i)=>({x:i%2,y:Math.floor(i/2),cell})),page:face.page,uv:face.uv,label:`Complete arrow ${patterns.length+1} · 4 cells · P${face.page} · acceleration`,row,col});
  }return patterns;
}

export const speedPadPatternShape=placement=>({cells:Array.from({length:placement.kind==='arrow4'?4:2},(_,i)=>({x:i%2,y:Math.floor(i/2),cell:0}))});

export function reverseSpeedPadArtwork(geometry,highGeometry,terrain,{originalLow=geometry,originalHigh=highGeometry}={}){
  const draft=structuredClone(terrain),scene=parseScene(geometry),original=parseScene(originalLow),templates=speedPadPatterns(originalLow,originalHigh),occupied=new Set(),patterns=(draft.patterns??[]).map(p=>({...p,rotation:(p.rotation+2)%4})),items=[];
  const raw=(data,scene,face)=>data.subarray(scene.uvTable+face.textureRecord*16,scene.uvTable+face.textureRecord*16+16).toString('hex');
  for(const p of draft.patterns??[])for(const cell of speedPadFootprint(scene,p,speedPadPatternShape(p)))occupied.add(`${p.sector}:${cell.cell}`);
  const signatures=new Map(templates.map(p=>[p.cells.map(c=>raw(originalLow,original,original.segments[p.sector].faces[c.cell])).join(':'),p]));
  for(const s of original.segments)for(const f of s.faces){const col=f.index%s.columns,row=Math.floor(f.index/s.columns);if(col+1>=s.columns||row+1>=s.rows)continue;const ids=[f.index,f.index+1,f.index+s.columns,f.index+s.columns+1];
    if(ids.some(i=>occupied.has(`${s.index}:${i}`)))continue;const key=ids.map(i=>raw(originalLow,original,s.faces[i])).join(':'),template=signatures.get(key);if(!template)continue;
    if(ids.some(i=>!scene.segments[s.index]?.faces[i]||raw(geometry,scene,scene.segments[s.index].faces[i])!==raw(originalLow,original,s.faces[i])))continue;
    patterns.push({kind:'arrow4',sector:s.index,cell:f.index,sourceSector:template.sector,sourceCell:template.cell,rotation:2});for(const i of ids)occupied.add(`${s.index}:${i}`);
  }
  let unknown=0;for(const s of scene.segments)for(const f of s.faces)if(material(geometry,scene,f)===1&&!occupied.has(`${s.index}:${f.index}`))unknown++;
  if(unknown)items.push({severity:'warning',code:'unrecognized-arrow-artwork',message:`${unknown} acceleration-material cell(s) are outside recognized complete arrows. Their artwork needs manual review; acceleration is unchanged.`,target:{kind:'surfaces'}});
  if(patterns.length)draft.patterns=patterns;return {terrain:draft,items};
}

export function speedPadFootprint(scene,placement,pattern) {
  const s=scene.segments[placement.sector];
  if(!s||!Number.isInteger(placement.cell)||placement.cell<0||placement.cell>=s.faces.length||!Number.isInteger(placement.rotation)||placement.rotation<0||placement.rotation>3)throw Error('Invalid speed-pad placement.');
  const rotate=(x,y)=>{for(let i=0;i<placement.rotation;i++)[x,y]=[-y,x];return [x,y];};
  const positions=pattern.cells.map(c=>({...c,xy:rotate(c.x,c.y)})),minX=Math.min(...positions.map(c=>c.xy[0])),minY=Math.min(...positions.map(c=>c.xy[1]));
  const col=placement.cell%s.columns,row=Math.floor(placement.cell/s.columns);
  return positions.map(c=>{const x=col+c.xy[0]-minX,y=row+c.xy[1]-minY;if(x>=s.columns||y>=s.rows)throw Error('The complete arrow must fit inside one terrain sector.');return {sourceCell:c.cell,cell:y*s.columns+x};});
}

export function compileSpeedPadPatterns(source,placements=[],{originalGeometry=source,patterns=speedPadPatterns(originalGeometry,originalGeometry),locked=new Set()}={}) {
  if(!Array.isArray(placements))throw Error('Invalid speed-pad pattern list.');
  if(!placements.length)return Buffer.from(source);
  const scene=parseScene(source),original=parseScene(originalGeometry),writes=new Map(),grid=parseCollisionGrid(source);
  for(const placement of placements){
    if(!placement||Object.keys(placement).sort().join(',')!==(placement.kind===undefined?'cell,rotation,sector,sourceCell,sourceSector':'cell,kind,rotation,sector,sourceCell,sourceSector')||Object.entries(placement).some(([key,n])=>key!=='kind'&&(!Number.isInteger(n)||n<0))||placement.kind!==undefined&&placement.kind!=='arrow4')throw Error('Invalid speed-pad pattern reference.');
    const candidates=placement.kind==='arrow4'?patterns:speedPadTilePairs(originalGeometry,originalGeometry),pattern=candidates.find(p=>p.sector===placement.sourceSector&&p.cell===placement.sourceCell);
    if(!pattern)throw Error('This original arrow pattern is unavailable.');
    if(locked.has(placement.sector)||locked.has(pattern.sector))throw Error('Animated terrain cannot receive arrow patterns.');
    for(const row of speedPadFootprint(scene,placement,pattern)){
      if(!grid.available||!grid.sectors[placement.sector]?.cells[row.cell]?.covered)throw Error('The complete arrow requires terrain collision coverage for every cell.');
      const from=original.segments[pattern.sector].faces[row.sourceCell],to=scene.segments[placement.sector].faces[row.cell],raw=Buffer.from(originalGeometry.subarray(original.uvTable+from.textureRecord*16,original.uvTable+from.textureRecord*16+16));
      const sourceUV=physicalUV(from),rotated=[];
      corners.forEach(([x,y],i)=>{for(let q=0;q<placement.rotation;q++)[x,y]=[1-y,x];rotated[y*2+x]=sourceUV[i];});
      cornerOrder(to).forEach((corner,i)=>{raw[uvOffsets[i]]=rotated[corner][0];raw[uvOffsets[i]+1]=rotated[corner][1];});
      writes.set(`${placement.sector}:${row.cell}`,{sector:placement.sector,cell:row.cell,raw});
    }
  }
  // Preserve all existing table-relative references, including opaque ones.
  const retained=Math.ceil((source.length-scene.uvTable)/16)*16,table=Buffer.alloc(retained+writes.size*16);table.set(source.subarray(scene.uvTable));
  const start=Math.ceil(source.length/4)*4;if(start+table.length>128*1024*1024)throw Error('Arrow pattern edit exceeds resource capacity.');
  const data=Buffer.alloc(start+table.length);data.set(source);let i=0;
  for(const row of writes.values()){const record=retained/16+i++;table.set(row.raw,record*16);data.writeUInt32LE(record,scene.segments[row.sector].packetsOffset+row.cell*8+4);}
  data.set(table,start);data.writeUInt32LE(start,0x110);return data;
}
