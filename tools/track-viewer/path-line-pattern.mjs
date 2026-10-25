// Centre short dashes within each period. Reversing the same segment then
// draws the same physical intervals, so two-way links cannot fill the gaps.
export function appendDashedPathLine(output,a,b){
  const delta=b.map((n,i)=>n-a[i]),length=Math.hypot(...delta);if(length<.001)return;
  const count=Math.max(2,Math.min(80,Math.round(length/60)));
  for(let i=0;i<count;i++)output.push(...a.map((n,j)=>n+delta[j]*(i+.35)/count),...a.map((n,j)=>n+delta[j]*(i+.65)/count));
  return {headFraction:(Math.floor(count/2)+.65)/count,dashLength:length*.3/count};
}
