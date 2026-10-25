// Bounded exported-resource observation contracts. No original process launch.
import assert from 'node:assert/strict';
import {parseGFXM} from '../../src/gfxm.mjs';
import {parsePlacements} from '../../src/placements.mjs';
import {parseModelCollision,readPlacementCollision} from '../../src/model-collision.mjs';
import {parseSpatialIndex} from '../../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../../src/model-links.mjs';

export function buildNativeSceneryObservation(geometry,texture,identities,{allowedClasses=[7]}={}) {
  const gfxm=parseGFXM(geometry),placements=parsePlacements(texture,gfxm.models),spatial=parseSpatialIndex(geometry),links=parseStaticModelLinks(geometry,spatial,placements),spans=[],seen=new Set();
  const add=(id,offset,length)=>{if(spans.length>=16||length<=0||seen.has(offset+':'+length))return;seen.add(offset+':'+length);spans.push({id:'scenery-'+id,offset,length,expectedHex:geometry.subarray(offset,offset+length).toString('hex')});};
  const expected=identities.map(({index,present=true})=>{const p=placements.records[index];assert.ok(p,'Declared placement exists in exported BTP table');const originalType=p.type;if(!present)assert.equal(originalType,25,'Deleted placements preserve their skipped authored slot');else assert.equal(originalType,0);const modelIndex=present?p.modelIndex:p.raw[3],model=gfxm.models[modelIndex],collision=parseModelCollision(geometry,model),ordinary={...p,type:0,modelIndex},settings=readPlacementCollision(geometry,ordinary,collision);
    assert.ok(allowedClasses.includes(p.raw[31]),'This native profile does not admit this object class (class7 by default)');add('model-'+index,model.offset,8);add('shape-'+index,collision.shapeBase,Math.min(60,collision.shapes.length*20));if(collision.faces.length)add('faces-'+index,collision.faceBase,Math.min(64,collision.faces.length*8));add('configuration-'+index,settings.configurationBase,Math.min(64,collision.shapes.length*4));
    return {index,present,modelOffset:model.offset,configurationOffset:settings.configurationBase,position:p.position,yaw:(p.angles[1]>>4)&255,objectClass:p.raw[31]};
  });
  for(const node of links.nodes.filter(n=>n.placementIndices.some(i=>identities.some(p=>p.present!==false&&p.index===i))).slice(0,4))add('spatial-'+node.node,spatial.nodes[node.node].offset,4);
  assert.ok(links.count>0&&links.count<=2048);assert.ok(spans.length);
  return {spans,requireContact:false,allowedCellRefs:[],placements:expected,linksOffset:links.table,links:links.entries,linksHex:geometry.subarray(links.table,links.table+links.count*4).toString('hex'),placementCount:placements.count,textureBytes:texture.length,authoredOffset:placements.offset,authoredHex:texture.subarray(placements.offset,placements.offset+placements.count*56).toString('hex')};
}
