//Explicit upstream resource/session/allocator inputs; not native asset loading.
export function createVehicleConstructionFixture(program,fixture=0){
 const memory=program.initializeMemory(Buffer.alloc(0xa00000)),d=(p,v)=>memory.writeInt32LE(v|0,p),w=(p,v)=>memory.writeUInt16LE(v&65535,p);
 const addresses={session:0x100000,pack:0x80000,aux:0x81000,materials:0x82000,models:0x88000,lookup:0x89000,spawns:0x8a000,checkpoint:0x8b000,checkpointIds:0x8c000,groups:0x8d000,points:0x8e000,body:0x200080,record:0x909300,arena:0x200000,shapes:0x350000,free:0x358000,active:0x359000,reverse:0x35a000,list:0x35b000};
 const a=addresses;d(0x5ecb1c,a.session);d(0x90b98c,a.pack);d(0x90b990,a.aux);d(0x90b988,a.materials);d(0x902eec,a.arena);d(0x70dcf4,128);d(0x6e6b44,0);d(0x91e79c,a.shapes);d(0x91e780,a.free);d(0x91e78c,a.active);d(0x91e790,a.reverse);d(0x91e794,255);d(0x91e784,-1);d(0x91e798,0);d(0x902bc0,a.list);w(0x902bc4,0);d(0x7130b8,0);d(0x82e900,0);d(0x91d590,fixture&1?0x91d5a0:0x91d5a4);d(0x56e258,0xf0000000);d(0x5ed008,fixture+123);d(0x5ecefc,0x8f000);w(0x8f42c,480);w(0x9118d0,-100);w(0x9118d2,70);
 for(let i=0;i<256;i++)memory[a.free+i]=i;
 d(a.pack+0x18,a.models);d(a.pack+0x58,a.lookup);d(a.pack+0x48,a.spawns);d(a.pack+0x70,a.checkpoint);d(a.pack+0x90,a.checkpointIds);d(a.pack+0x60,a.groups);memory[a.pack+0x44]=3;memory[a.pack+0x46]=3;
 for(let i=0;i<1024;i++)w(a.lookup+i*2,i%12);
 const modelAddresses=[];for(let i=0;i<12;i++){const p=0xa0000+i*0x1000;modelAddresses.push(p);d(a.models+i*4,p);memory[p+4]=4;w(p+6,2);d(p+0x0c,p+0x100);d(p+0x10,0x100);d(p+0x14,0x128);d(p+0x40,p+0x200);for(let v=0;v<4;v++){w(p+0x200+v*8,(v&1?1:-1)*30);w(p+0x202+v*8,-10);w(p+0x204+v*8,[0,1,10,20][v]);}d(p+0x100,0x04030201);d(p+0x108,0x04030201);}
 for(let i=0;i<6;i++){memory[a.session+i]=fixture%4===0?8:0;memory[a.session+0x10+i]=i;memory[a.session+0x1c+i]=i;w(a.spawns+i*8,i*100);w(a.spawns+i*8+2,-30);w(a.spawns+i*8+4,20);d(a.session+0x1fb20+i*0x1e884,8);w(0x5ecfc4+i*6,0);w(0x5ecfc6+i*6,0);w(0x5ecfc8+i*6,2);d(0x5ecfec+i*4,0x5ecfc4+i*6);}
 memory[a.session+0x58c]=fixture%3;memory[a.session+0x551]=fixture%5===0?4:0;memory[a.session+0x54e]=fixture&1;memory[a.session+0x587]=fixture%3===0?1:0;
 w(a.aux+0x2e,0);for(let i=0;i<256*16;i++)memory[a.materials+i]=(i*13+fixture)&255;
 for(let i=0;i<3;i++){memory[a.checkpointIds+i*4]=i;w(a.checkpoint+i*20+4,i*100+30);w(a.checkpoint+i*20+6,-30);w(a.checkpoint+i*20+8,20);w(a.checkpoint+i*20+12,0);w(a.checkpoint+i*20+14,0);w(a.checkpoint+i*20+16,256);w(a.groups+i*12,3);d(a.groups+i*12+8,a.points+i*0x100);for(let j=0;j<3;j++){w(a.points+i*0x100+j*16,i*100+j*10);w(a.points+i*0x100+j*16+2,-30);w(a.points+i*0x100+j*16+4,j*20);}}
 //Sparse spatial fallback to one valid bucket, with no original world process.
 d(0x909254,0x90000);d(0x909278,0x92000);for(let row=0;row<256;row++){w(0x90000+row*16,0xff00);w(0x90002+row*16,255);d(0x9000c+row*16,0x91000);}
 //Generic direct-entry fixtures use the first arena object and primary model.
 d(a.record,a.body);d(a.body+0x10,modelAddresses[0]);d(a.body+0x24,modelAddresses[0]+0x200);d(a.body+0x28,modelAddresses[0]+0x100);d(a.body+0x14,0x360000);d(a.body+0x18,0x361000);memory[a.body+0x10d]=4;w(a.body+0x65e,fixture%6);memory[a.body+0x10c]=5;memory[a.body+0x145]=20;d(a.shapes+20*72+0x40,1);
 let allocationCursor=0x400000;const allocations=[];const allocate=(size,runtime)=>{const p=allocationCursor;allocationCursor+=(size+15)&~15;allocations.push({size,address:p});return p;};
 return{memory,addresses:a,models:modelAddresses,allocations,runtime:{memory,scratchBase:0x9000,handlers:{allocate}},allocate};
}
