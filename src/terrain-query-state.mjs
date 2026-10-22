// Observable candidate scratch writes shared by both branches of 424ff0.
export function initializeTerrainQueryState(candidates,parameter,scratch,nativeState){
 const visited=[],edges=[],planes=nativeState?candidates.map((_,i)=>nativeState.planeAt(i)):[];
 for(const candidate of candidates){
  const flags=(candidate.flagsByte0??candidate.type)&0xef;if(nativeState)nativeState.writeCandidateFlags(candidate,flags);else candidate.flagsByte0=flags;
  const type=candidate.flagsByte0&15;if(nativeState)nativeState.writeCandidateEdge(candidate,255);else candidate.byte2=255;
  const skip=!!(parameter>>24)&&type>=6;if(skip){if(nativeState)nativeState.writeCandidateFlags(candidate,candidate.flagsByte0|16);else candidate.flagsByte0|=16;}
  visited.push(skip);edges.push(-1);
 }
 Object.assign(scratch,{visited,edges,planes});
 return {visited,edges,planes,isVisited:i=>!!(candidates[i].flagsByte0&16),markVisited:i=>{if(nativeState)nativeState.writeCandidateFlags(candidates[i],candidates[i].flagsByte0|16);else candidates[i].flagsByte0|=16;visited[i]=true;},edgeAt:i=>candidates[i].byte2<<24>>24,setEdge:(i,value)=>{if(nativeState)nativeState.writeCandidateEdge(candidates[i],value&255);else candidates[i].byte2=value&255;edges[i]=value;}};
}
