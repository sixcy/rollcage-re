//CPU editor picking uses the exact static display mesh and view/projection.
//It never writes game data or a running simulation. Scene identity owns the
//cached terrain BVH; changing tracks releases it through the WeakMap.
const terrainCache = new WeakMap();
const vector = value => value?.length === 3 && Array.from(value).every(Number.isFinite);
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize = value => {const length=Math.hypot(...value);return length>0?value.map(n=>n/length):null;};

export const sourceToDisplay = ([x,y,z]) => [x,y===0?0:-y,z===0?0:-z];
export const displayToSource = sourceToDisplay;

function rectangle(rect) {
  if(!rect||![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
  return rect;
}
function transform(matrix,x,y,z,w) {
  return [0,1,2,3].map(row=>matrix[row]*x+matrix[4+row]*y+matrix[8+row]*z+matrix[12+row]*w);
}
//Gauss-Jordan on doubles, retaining the column-major WebGL convention.
function inverse(matrix) {
  if(matrix?.length!==16||!Array.from(matrix).every(Number.isFinite))return null;
  const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>matrix[c*4+r]),...Array.from({length:4},(_,c)=>Number(r===c))]);
  for(let column=0;column<4;column++) {
    let pivot=column;for(let r=column+1;r<4;r++)if(Math.abs(rows[r][column])>Math.abs(rows[pivot][column]))pivot=r;
    if(Math.abs(rows[pivot][column])<1e-15)return null;
    [rows[column],rows[pivot]]=[rows[pivot],rows[column]];
    const scale=rows[column][column];for(let c=0;c<8;c++)rows[column][c]/=scale;
    for(let r=0;r<4;r++)if(r!==column){const amount=rows[r][column];for(let c=0;c<8;c++)rows[r][c]-=rows[column][c]*amount;}
  }
  return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);
}
function unproject(matrix,x,y,z) {
  const point=transform(matrix,x,y,z,1);if(!Number.isFinite(point[3])||Math.abs(point[3])<1e-15)return null;
  return point.slice(0,3).map(n=>n/point[3]);
}

export function cameraRay(navigation,canvasRect,clientX,clientY) {
  const rect=rectangle(canvasRect);
  if(!rect||![clientX,clientY].every(Number.isFinite)||clientX<rect.left||clientX>rect.left+rect.width||clientY<rect.top||clientY>rect.top+rect.height)return null;
  const matrix=inverse(navigation.matrix(rect.width/rect.height));if(!matrix)return null;
  const x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
  const near=unproject(matrix,x,y,-1),far=unproject(matrix,x,y,1);if(!near||!far)return null;
  const direction=normalize(far.map((n,i)=>n-near[i]));if(!direction)return null;
  //Navigation owns the camera position; this keeps hit distances in scene
  //units from the eye, rather than from the perspective near plane.
  const origin=navigation.position();if(!vector(origin))return null;
  return {origin:[...origin],direction};
}

function bytesOf(value) {
  if(typeof value==='string')return Uint8Array.from(atob(value),letter=>letter.charCodeAt(0));
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  throw Error('Terrain picking requires decoded mesh bytes.');
}
function buildTerrain(scene) {
  if(!scene||!Array.isArray(scene.groups))throw Error('Terrain picking requires decoded scene groups.');
  const groups=scene.groups.filter(group=>group.kind==='terrain');
  let count=0;for(const group of groups){if(!Number.isSafeInteger(group.vertices)||group.vertices<0||group.vertices%3)throw Error('Terrain picking requires triangle-list vertices.');count+=group.vertices/3;}
  const positions=new Float64Array(count*9),identities=[];let cursor=0;
  for(const group of groups) {
    for(let triangle=0;triangle<group.vertices/3;triangle++)identities.push({sector:group.segment,cell:group.triangleCells?.[triangle]??null});
    const bytes=bytesOf(group.buffer),stride=group.colored?44:32;
    if(group.vertices*stride>bytes.byteLength)throw Error('Terrain picking mesh exceeds its decoded buffer.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let vertex=0;vertex<group.vertices;vertex++)for(let axis=0;axis<3;axis++){
      const value=view.getFloat32(vertex*stride+axis*4,true);if(!Number.isFinite(value))throw Error('Terrain picking mesh has a nonfinite position.');positions[cursor++]=value;
    }
  }
  const order=Array.from({length:count},(_,i)=>i);let nodes=0;
  function build(start,end) {
    nodes++;const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
    for(let i=start;i<end;i++)for(let vertex=0;vertex<3;vertex++)for(let axis=0;axis<3;axis++){
      const value=positions[order[i]*9+vertex*3+axis];minimum[axis]=Math.min(minimum[axis],value);maximum[axis]=Math.max(maximum[axis],value);
    }
    const node={minimum,maximum,start,end};
    if(end-start>12){let axis=0;for(let a=1;a<3;a++)if(maximum[a]-minimum[a]>maximum[axis]-minimum[axis])axis=a;
      const center=i=>positions[i*9+axis]+positions[i*9+3+axis]+positions[i*9+6+axis];
      const sorted=order.slice(start,end).sort((a,b)=>center(a)-center(b)||a-b);for(let i=0;i<sorted.length;i++)order[start+i]=sorted[i];
      const middle=(start+end)>>>1;node.left=build(start,middle);node.right=build(middle,end);
    }
    return node;
  }
  const root=count?build(0,count):null;
  return {positions,order,root,identities,stats:Object.freeze({triangles:count,nodes,builds:1})};
}
function terrain(scene) {let cached=terrainCache.get(scene);if(!cached){cached=buildTerrain(scene);terrainCache.set(scene,cached);}return cached;}
export function prepareTerrainPicking(scene) {return terrain(scene).stats;}

function boxDistance(node,origin,direction,limit) {
  let near=0,far=limit;
  for(let axis=0;axis<3;axis++){
    if(Math.abs(direction[axis])<1e-15){if(origin[axis]<node.minimum[axis]||origin[axis]>node.maximum[axis])return null;continue;}
    let a=(node.minimum[axis]-origin[axis])/direction[axis],b=(node.maximum[axis]-origin[axis])/direction[axis];if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;
  }
  return near;
}
function triangleDistance(positions,index,origin,direction) {
  const p=index*9,a=[positions[p],positions[p+1],positions[p+2]],e1=[0,1,2].map(i=>positions[p+3+i]-a[i]),e2=[0,1,2].map(i=>positions[p+6+i]-a[i]);
  const h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;
  const inverseDet=1/det,s=origin.map((n,i)=>n-a[i]),u=dot(s,h)*inverseDet;if(u<-1e-9||u>1+1e-9)return null;
  const q=cross(s,e1),v=dot(direction,q)*inverseDet;if(v<-1e-9||u+v>1+1e-9)return null;
  const t=dot(e2,q)*inverseDet;return t>=-1e-9?Math.max(0,t):null;
}
export function intersectTerrain(scene,ray) {
  if(!ray||!vector(ray.origin)||!vector(ray.direction))return null;
  const direction=normalize(Array.from(ray.direction));if(!direction)return null;
  const cached=terrain(scene);if(!cached.root)return null;
  let distance=Infinity,selected=null;const stack=[cached.root];
  while(stack.length){const node=stack.pop();if(boxDistance(node,ray.origin,direction,distance)===null)continue;
    if(node.left){const a=boxDistance(node.left,ray.origin,direction,distance),b=boxDistance(node.right,ray.origin,direction,distance);
      if(a!==null&&b!==null){if(a<b)stack.push(node.right,node.left);else stack.push(node.left,node.right);}else if(a!==null)stack.push(node.left);else if(b!==null)stack.push(node.right);
    }else for(let i=node.start;i<node.end;i++){const hit=triangleDistance(cached.positions,cached.order[i],ray.origin,direction);if(hit!==null&&hit<distance){distance=hit;selected=cached.identities[cached.order[i]];}}
  }
  return Number.isFinite(distance)?{position:Array.from(ray.origin,(n,i)=>n+direction[i]*distance),distance,...selected}:null;
}

export function pickPickup(pointsDisplay,navigation,canvasRect,clientX,clientY,{radiusPx=10}={}) {
  const rect=rectangle(canvasRect);
  if(!rect||![clientX,clientY,radiusPx].every(Number.isFinite)||radiusPx<0||clientX<rect.left||clientX>rect.left+rect.width||clientY<rect.top||clientY>rect.top+rect.height)return null;
  const matrix=navigation.matrix(rect.width/rect.height);let selected=null,best=radiusPx*radiusPx,bestDepth=Infinity;
  for(let index=0;index<pointsDisplay.length;index++){
    const point=pointsDisplay[index];if(!vector(point))continue;
    const clip=transform(matrix,...point,1);if(clip[3]<=0)continue;
    const [x,y,z]=clip.slice(0,3).map(n=>n/clip[3]);if(x<-1||x>1||y<-1||y>1||z<-1||z>1)continue;
    const px=rect.left+(x+1)*rect.width/2,py=rect.top+(1-y)*rect.height/2,d=(px-clientX)**2+(py-clientY)**2;
    if(d<best||d===best&&z<bestDepth){selected=index;best=d;bestDepth=z;}
  }
  return selected;
}
