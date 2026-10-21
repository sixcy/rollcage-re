import test from 'node:test';
import assert from 'node:assert/strict';
import constants from '../src/finish-message-constants.json' with {type:'json'};
import {generateRacerName,formatFinishPhrase,enqueueFinishNotification,lookupLocalizedRow,readLocalizationBlock,findLocalizationBlock,searchLocalizationBytes} from '../src/finish-messages.mjs';
const output=0x20000,settings=0x30000,source=0x40000,scratch=0x50000,key=0x21000;
const put=(memory,p,text)=>{memory.write(text+'\0',p,'latin1');},get=(memory,p)=>{let end=p;while(memory[end])end++;return memory.toString('latin1',p,end);};
function fixture(){const memory=Buffer.alloc(0xa00000);for(const item of constants.constants)Buffer.from(item.hex,'hex').copy(memory,Number(item.address));memory.writeUInt32LE(settings,0x5ecefc);return memory;}
test('invalid unsigned driver ID clears output without calling localization',()=>{const memory=fixture();put(memory,output,'Old');generateRacerName(output,-1,{memory,scratchBase:scratch});assert.equal(get(memory,output),'');});
test('driver name mode selects the original country/color/name key pointers',()=>{
 for(const [mode,expected]of [[0,'PC_MENU_DRIVER_NAMES'],[1,'PC_MENU_DRIVER_COUNTRIES'],[2,'PC_MENU_DRIVER_COLORS'],[255,'PC_MENU_DRIVER_NAMES']]){const memory=fixture();memory[settings+5]=mode;generateRacerName(output,6,{memory,scratchBase:scratch,handlers:{call439850:request=>{assert.equal(get(memory,request.args[0]),expected);assert.equal(request.args[1],6);assert.equal(request.edx,512);put(memory,request.ecx,'Selected');}}});assert.equal(get(memory,output),'Selected');}
});
test('localization search shares zero for failure/first-byte match and can compare into readable tail bytes',()=>{
 const memory=fixture();put(memory,source,'ABCDE');memory.writeUInt32LE(3,0x6e65e4);assert.equal(searchLocalizationBytes(Buffer.from('A'),source,{memory}),0);assert.equal(searchLocalizationBytes(Buffer.from('CDE'),source,{memory}),2);assert.equal(searchLocalizationBytes(Buffer.from('Z'),source,{memory}),0);
});
test('native language lookup selects translated block after the key suffix',()=>{
 const memory=fixture();put(memory,key,'KEY');put(memory,source,'@STRING(KEY)\n[\nENGLISH\n[English\0~]\nFRENCH\n[Francais\0~]\n]');memory.writeUInt32LE(source,0x6e65f4);memory.writeUInt32LE(100,0x6e65e4);memory.writeUInt16LE(1,0x6e65f0);
 const selected=findLocalizationBlock(key,{memory});assert.equal(get(memory,selected),'Francais');
});
test('processed rows skip byte1 and end without adding a CR before a closing bracket',()=>{
 const memory=fixture();put(memory,source,'A\x01B\0~Second\0~\r\n]');assert.equal(readLocalizationBlock(output,key,{memory,handlers:{call439610:()=>source}}),9);assert.equal(get(memory,output),'AB\rSecond');
});
test('localized row returns full length while capacity1 writes only a terminator',()=>{
 const memory=fixture(),handlers={call439780:request=>{put(memory,request.ecx,'First\rSecond');return 12;}};
 assert.equal(lookupLocalizedRow(output,1,key,1,{memory,scratchBase:scratch,handlers}),6);assert.equal(get(memory,output),'');put(memory,output,'Old');assert.equal(lookupLocalizedRow(output,0,key,0,{memory,scratchBase:scratch,handlers}),5);assert.equal(get(memory,output),'Old');
});
test('phrase marker order controls printf arguments and duplicate markers preserve old output',()=>{
 const memory=fixture(),first=0x22000,second=0x23000;put(memory,first,'One');put(memory,second,'Two');put(memory,settings+0x104e,'2 then1');
 formatFinishPhrase(0,first,second,output,{memory,scratchBase:scratch,handlers:{sprintf:request=>{assert.equal(get(memory,request.format),'%s then%s');assert.deepEqual(request.args,[second,first]);put(memory,request.destination,'Two thenOne');}}});assert.equal(get(memory,output),'Two thenOne');put(memory,settings+0x104e,'11');formatFinishPhrase(0,first,second,output,{memory,scratchBase:scratch});assert.equal(get(memory,output),'Two thenOne');
});
test('phrase output truncates to127 bytes after printf',()=>{const memory=fixture();put(memory,settings+0x104e,'No names');formatFinishPhrase(0,0,0,output,{memory,scratchBase:scratch,handlers:{sprintf:request=>put(memory,request.destination,'X'.repeat(160))}});assert.equal(get(memory,output).length,127);});
test('notification truncates even when disabled; enabled history has four slots and preserves packet header gaps',()=>{
 const memory=fixture();put(memory,output,'X'.repeat(70));enqueueFinishNotification(output,{memory,scratchBase:scratch});assert.equal(get(memory,output).length,64);assert.equal(memory[0x6eaedc],0);
 memory[0x6eafe0]=5;for(let slot=0;slot<4;slot++)put(memory,0x6eaedc+slot*65,`Old${slot}`);memory.fill(0x7d,scratch,scratch+80);put(memory,output,'New');let sends=0;
 enqueueFinishNotification(output,{memory,scratchBase:scratch,handlers:{call4a0420:request=>{assert.equal(request.ecx,2);assert.deepEqual(request.args,[12,0]);assert.equal(memory[request.edx],0xae);assert.ok(memory.subarray(request.edx+1,request.edx+8).every(value=>value===0x7d));assert.equal(get(memory,request.edx+8),'New');sends++;return 0;}}});
 assert.deepEqual(Array.from({length:4},(_,slot)=>get(memory,0x6eaedc+slot*65)),['New','Old0','Old1','Old2']);assert.equal(sends,1);
});
