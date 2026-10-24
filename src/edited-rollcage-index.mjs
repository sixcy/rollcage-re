import stock from './rollcage-editable-index.json' with {type:'json'};
import {parseIndex} from './archive-index.mjs';

const equal=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);

// buildEditedArchive retains the stock IMG prefix, changes only editable IDX
// rows' offset/size fields, and appends aligned uncompressed replacements.
// Recover the known base index for fingerprint verification; this alone does
// not verify the selected IMG. The caller must read/hash its original sentinels.
export function recoverEditedRollcageIndex(indexData) {
  if(!Buffer.isBuffer(indexData)||indexData.length!==stock.indexBytes)return null;
  const canonical=Buffer.from(indexData),changed=[],ranges=[];
  for(const {index,bytesHex}of stock.entries){
    const offset=index*16,original=Buffer.from(bytesHex,'hex'),current=indexData.subarray(offset,offset+16);
    if(!equal(current,original)){
      if(!equal(current.subarray(12),original.subarray(12)))return null;
      const start=current.readUInt32LE(0),stored=current.readUInt32LE(4),decoded=current.readUInt32LE(8);
      if(start<stock.imageBytes||start%4||!stored||stored!==decoded||stored>128*1024*1024||start+stored>=0x80000000)return null;
      changed.push(index);ranges.push([start,start+stored]);
    }
    canonical.set(original,offset);
  }
  if(!changed.length)return null;
  ranges.sort((a,b)=>a[0]-b[0]);
  if(ranges.some((r,i)=>i&&r[0]<ranges[i-1][1]))return null;
  return {indexData:canonical,changed,expectedIndexSha256:stock.indexSha256};
}

// A separate view reads the retained stock resources from the same IMG bytes.
// It neither replaces nor mutates the selected archive's current index/cursor.
export function originalRollcageView(archive,canonicalIndex) {
  const view=Object.create(archive);
  view.entries=parseIndex(canonicalIndex,stock.imageBytes);view.position=0;
  return view;
}
