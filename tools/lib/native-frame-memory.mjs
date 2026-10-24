import {createCapturedMemory} from './captured-memory.mjs';
import {nativeExplicitGlobalDomains,registerNativeGlobalAddresses} from '../../src/native-global-address.mjs';

//Keep raw native pointer addresses intact. Explicit source globals use a
//separate role map; no numeric alias may shadow any actual captured bytes.
export function createNativeFrameMemory(rows,options={}){
  const aliases=[],globals=[];
  for(const route of options.aliases??[]){
    if(!Number.isSafeInteger(route.address)||route.address<0||!Number.isSafeInteger(route.targetAddress)||route.targetAddress<0||!Number.isSafeInteger(route.length)||route.length<0||route.address+route.length>0x100000000||route.targetAddress+route.length>0x100000000)throw Error('Invalid explicit frame alias.');
    const start=route.address,end=start+route.length;
    let cursor=start;
    for(const domain of nativeExplicitGlobalDomains){
      if(end<=domain.start||cursor>=domain.end)continue;
      const lo=Math.max(cursor,domain.start),hi=Math.min(end,domain.end);
      if(cursor<lo)aliases.push({address:cursor,targetAddress:route.targetAddress+cursor-start,length:lo-cursor});
      globals.push({address:lo,targetAddress:route.targetAddress+lo-start,length:hi-lo});cursor=hi;
    }
    if(cursor<end||!route.length)aliases.push({address:cursor,targetAddress:route.targetAddress+cursor-start,length:end-cursor});
  }
  const captured=createCapturedMemory(rows,{...options,aliases});
  //Check complete real targets without creating any backing allocation.
  for(const route of globals)captured.span(route.targetAddress,route.length);
  registerNativeGlobalAddresses(captured.memory,globals);
  return captured;
}
