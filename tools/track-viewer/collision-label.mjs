export function collisionLabel(low,high) {
  const a=low?.status??'unknown',b=high?.status??'unknown';
  if(a!==b)return 'collision differs in LOW/HIGH';
  return a==='enabled'?`active collision records${low?.warnings?.length||high?.warnings?.length?' · shape warning':''}`:a==='disabled'?'no active collision':'collision unknown';
}

export function collisionDescription(summary) {
  if(!summary||summary.status==='unknown')return `Collision unknown${summary?.reason?`: ${summary.reason}`:'.'}`;
  if(summary.status==='disabled')return `No active collision (${summary.totalShapes} disabled shape records).`;
  const kinds=Object.entries(summary.kinds).filter(([,n])=>n).map(([kind,n])=>`${n} ${kind==='polyhedron'?'volume':kind}${n===1?'':'s'}`).join(', ');
  return `Active collision records: ${summary.activeShapes}/${summary.totalShapes} shapes (${kinds}).${summary.warnings?.length?' Shape warning: face directions conflict; this may not block cars.':''}`;
}
