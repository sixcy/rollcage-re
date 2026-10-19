import table from './trig-table.json' with {type:'json'};
// Native Q16 angle lookup, including one-period reduction and table quantization.
// These are intentionally not general-purpose trigonometric functions.
export function fixedCos(angle) {
 let i=Math.abs(angle|0);
 if(i>0x6487f)i-=0x6487f;
 if(i<0x19221)return table.values[i>>9];
 if(i<0x32440)return -table.values[(0x3243f-i)>>9];
 if(i>0x3243f&&i<0x4b660)return -table.values[(i-0x3243f)>>9];
 if(i>0x4b65f&&i<0x64880)return table.values[(0x6487f-i)>>9];
 return 0;
}
export function fixedSin(angle) {
 let i=Math.abs((angle+0x19220)|0);
 if(i>0x6487f)i-=0x6487f;
 if(i<0x19221)return -table.values[i>>9];
 if(i<0x32440)return table.values[(0x3243f-i)>>9];
 if(i>0x3243f&&i<0x4b660)return table.values[(i-0x3243f)>>9];
 if(i>0x4b65f&&i<0x64880)return -table.values[(0x6487f-i)>>9];
 return 0;
}
const multiply=(a,b)=>Number(BigInt.asIntN(32,(BigInt(a)*BigInt(b))>>16n));
const short=value=>((value|0)>>4)<<16>>16;
// FUN_00492720: Q16 quaternion to row-major Q12 signed-short matrix.
export function quaternionMatrix([w,x,y,z]) {
 const xx=multiply(x,x),yy=multiply(y,y),zz=multiply(z,z),wx=multiply(w,x),wy=multiply(w,y),wz=multiply(w,z);
 const xy=2*multiply(x,y),xz=2*multiply(x,z),yz=2*multiply(y,z);
 return [short(0x10000-2*zz-2*yy),short(xy-2*wz),short(xz+2*wy),
  short(xy+2*wz),short(0x10000-2*zz-2*xx),short(yz-2*wx),
  short(xz-2*wy),short(yz+2*wx),short(0x10000-2*yy-2*xx)];
}
// Loader assembly at 0x44ce1e..0x44ce9a. It fills components directly;
// preserve the observed last-nonzero-axis cosine rather than composing Euler angles.
export function placementMatrix([x,y,z]) {
 let half=0;const q=[0,0,0,0];
 if(x){half=x>>1;q[1]=fixedSin(half);}
 if(y){half=Math.imul(y,0x6488)>>9;q[2]=fixedSin(half);}
 if(z){half=Math.imul(z,0x6488)>>9;q[3]=fixedSin(half);}
 q[0]=fixedCos(half);
 return quaternionMatrix(q);
}
export function transformPlacedVertex(vertex,matrix,position) {
 return position.map((p,row)=>p+(matrix[row*3]*vertex[0]+matrix[row*3+1]*vertex[1]+matrix[row*3+2]*vertex[2])/4096);
}
