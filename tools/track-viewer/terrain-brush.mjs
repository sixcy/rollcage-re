// Pure brush operations. Distances follow connected grid edges and matched
// seams, so another road sharing XZ coordinates is never selected implicitly.
import {speedPadFootprint,speedPadPatternShape} from '../../src/speed-pad-patterns.mjs';
export function terrainBrushSelection(info,draft,hit,radius) {
  const sector=info.scene.segments[hit.sector],face=sector?.faces[hit.cell];if(!face||!Number.isFinite(radius)||radius<=0)return [];
  const heights=new Map(draft.heights.map(r=>[`${r.sector}:${r.vertex}`,r.height])),position=id=>{const v=info.vertices.get(id);return [v.position[0],heights.get(id)??v.position[1],v.position[2]];};
  const point=[hit.position[0],-hit.position[1],-hit.position[2]],nearest=face.gridIndices.map(v=>`${hit.sector}:${v}`).sort((a,b)=>Math.hypot(...position(a).map((n,i)=>n-point[i]))-Math.hypot(...position(b).map((n,i)=>n-point[i])))[0];
  const queue=[{id:nearest,distance:0}],best=new Map(),result=[];
  while(queue.length){queue.sort((a,b)=>b.distance-a.distance);const {id,distance}=queue.pop();if(distance>radius||(best.get(id)??Infinity)<=distance)continue;best.set(id,distance);if(info.isLocked(id))continue;
    const value=info.vertices.get(id),s=info.scene.segments[value.sector],stride=s.columns+1,row=Math.floor(value.vertex/stride),col=value.vertex%stride;
    result.push({id,...value,position:position(id),weight:Math.max(0.05,1-distance/radius)});
    const adjacent=[...(row?[value.vertex-stride]:[]),...(row<s.rows?[value.vertex+stride]:[]),...(col?[value.vertex-1]:[]),...(col<s.columns?[value.vertex+1]:[])].map(v=>`${value.sector}:${v}`);
    for(const other of adjacent)queue.push({id:other,distance:distance+Math.hypot(...position(id).map((n,i)=>n-position(other)[i]))});
    for(const seam of info.seamFor.get(id))if(seam!==id)queue.push({id:seam,distance});
    if(result.length>20000)throw Error('Brush selection exceeds 20,000 vertices. Reduce its radius.');
  }
  return result;
}

export function stampTerrain(info,draft,hit,{mode='raise',radius=128,strength=8,height=0,preset}={}) {
  const selected=terrainBrushSelection(info,draft,hit,radius),heights=new Map(draft.heights.map(r=>[`${r.sector}:${r.vertex}`,{...r}])),surfaces=new Map(draft.surfaces.map(r=>[`${r.sector}:${r.cell}`,{...r}]));
  const painted=new Set();
  if(mode==='paint'){
    if(!preset)throw Error('Choose a surface preset first.');
    const cells=new Set();for(const v of selected){const s=info.scene.segments[v.sector],row=Math.floor(v.vertex/(s.columns+1)),col=v.vertex%(s.columns+1);for(const r of [row-1,row])for(const c of [col-1,col])if(r>=0&&r<s.rows&&c>=0&&c<s.columns)cells.add(`${s.index}:${r*s.columns+c}`);}
    cells.add(`${hit.sector}:${hit.cell}`);
    for(const id of cells){const [sector,cell]=id.split(':').map(Number);if(info.locked.has(sector))continue;const s=info.scene.segments[sector],face=s.faces[cell],center=[0,1,2].map(i=>face.gridIndices.reduce((sum,v)=>sum+s.vertices[v][i],0)/4),point=[hit.position[0],-hit.position[1],-hit.position[2]];if(id!==`${hit.sector}:${hit.cell}`&&Math.hypot(...center.map((n,i)=>n-point[i]))>radius)continue;
      painted.add(id);const row={sector,cell,sourceSector:preset.sector,sourceCell:preset.cell};if(face.textureRecord===info.scene.segments[preset.sector].faces[preset.cell].textureRecord)surfaces.delete(id);else surfaces.set(id,row);
    }
  }else{
    const pending=new Map();
    for(const v of selected){let y=v.position[1];const amount=Math.max(1,Math.round(strength*v.weight));
      if(mode==='raise')y-=amount;else if(mode==='lower')y+=amount;else if(mode==='flatten'||mode==='set')y=-Math.round(height);
      else if(mode==='smooth'){
        const s=info.scene.segments[v.sector],stride=s.columns+1,row=Math.floor(v.vertex/stride),col=v.vertex%stride,ids=[...(row?[v.vertex-stride]:[]),...(row<s.rows?[v.vertex+stride]:[]),...(col?[v.vertex-1]:[]),...(col<s.columns?[v.vertex+1]:[])];
        const average=ids.reduce((sum,i)=>sum+(heights.get(`${v.sector}:${i}`)?.height??s.vertices[i][1]),0)/ids.length;y=Math.round(y+(average-y)*Math.min(1,strength/32)*v.weight);
      }
      for(const id of info.seamFor.get(v.id))if(!pending.has(id))pending.set(id,y);
    }
    for(const [id,y]of pending){if(y< -32768||y>32767)throw Error('Brush exceeds the signed 16-bit terrain height limit.');const v=info.vertices.get(id);if(y===v.position[1])heights.delete(id);else heights.set(id,{sector:v.sector,vertex:v.vertex,height:y});}
  }
  const patterns=draft.patterns?.filter(p=>!speedPadFootprint(info.scene,p,speedPadPatternShape(p)).some(c=>painted.has(`${p.sector}:${c.cell}`)));
  return {heights:[...heights.values()].sort((a,b)=>a.sector-b.sector||a.vertex-b.vertex),surfaces:[...surfaces.values()].sort((a,b)=>a.sector-b.sector||a.cell-b.cell),...(patterns?{patterns}:{} )};
}
