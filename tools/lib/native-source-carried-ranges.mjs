import {createCapturedMemory} from './captured-memory.mjs';

//Authenticate original observation proofs against original bytes once. A
//source-mutated pointer is then source state, not a new native observation.
//Keep only the originally readable physical extents; a false guard/empty
//vector grants no bytes and no newly produced pointer grants new coverage.
export function nativeSourceCarriedRanges(originalRows,source){
  if(!Array.isArray(originalRows)||typeof source?.span!=='function')throw Error('Source carry requires original rows and existing source memory.');
  createCapturedMemory(originalRows);
  return originalRows.filter(row=>row.bytes.length).map(row=>({
    id:row.id,address:row.address,length:row.bytes.length,
    ...(row.moduleBaseAddress!==undefined?{moduleBaseAddress:row.moduleBaseAddress}:{}),
    origin:'source-carried-original-span',bytes:Buffer.from(source.span(Number(row.address),row.bytes.length)),
  }));
}
