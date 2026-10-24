import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';

const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url));
const quote=s=>s.replaceAll("'","''");
const harness=String.raw`
namespace RollcageCapture {
  public static class SoundBankOwnerHostTests {
    const uint Image=0x940000,Bank=0x100000,Owner=0x200000;
    static void Assert(bool value,string label){if(!value)throw new Exception(label);}
    static void Reject(Action action){bool failed=false;try{action();}catch{failed=true;}if(!failed)throw new Exception("Expected strict rejection");}
    static void Store(byte[] bytes,int offset,uint value){Buffer.BlockCopy(BitConverter.GetBytes(value),0,bytes,offset,4);}
    static ParentSoundBankOwnerGraph Policy(){return new ParentSoundBankOwnerGraph{rootRva="0x2f2414",headerRangeId="sound-owner-vector-roots",storageRangeId="control-sound-bank-storage",maxUsedSlots=256,ownerBytes=0x490,breakpointIds=(string[])ParentRttiProgress.Stages.Clone()};}
    sealed class Fixture {
      public List<ParentSoundBankCapturedRange> rows=new List<ParentSoundBankCapturedRange>();
      public Dictionary<uint,byte[]> memory=new Dictionary<uint,byte[]>();public List<uint> reads=new List<uint>();
      public ParentSoundBankCapturedRange header,storage;
      public Fixture(uint[] slots,int capacity,uint begin){
        byte[] h=new byte[12],data=new byte[capacity*4];Store(h,0,begin);Store(h,4,begin+(uint)slots.Length*4);Store(h,8,begin+(uint)capacity*4);
        for(int i=0;i<capacity;i++)Store(data,i*4,i<slots.Length?slots[i]:0xdeadbeef);
        header=new ParentSoundBankCapturedRange{id="sound-owner-vector-roots",address=Image+0x2f2414,data=h};
        storage=new ParentSoundBankCapturedRange{id="control-sound-bank-storage",address=begin,data=data,vectorHeaderAddress=header.address,vector=NativeDebugger.DecodeVectorStorage(h,65536)};rows.Add(header);rows.Add(storage);
        foreach(uint address in slots)if(address!=0&&!memory.ContainsKey(address))memory.Add(address,Bytes(address,0x490));
      }
      public Fixture(uint[] slots):this(slots,slots.Length+3,Bank){}
      public static byte[] Bytes(uint address,int count){byte[] b=new byte[count];for(int i=0;i<count;i++)b[i]=(byte)(((ulong)address+(uint)i)*7%251);return b;}
      public byte[] Read(uint address,int count){reads.Add(address);byte[] bytes;if(!memory.TryGetValue(address,out bytes))throw new InvalidDataException("Actual native bytes unavailable");Assert(count==0x490,"Unexpected pointee read extent");return (byte[])bytes.Clone();}
      public ParentSoundBankOwnerRead Run(){return NativeDebugger.ReadParentSoundBankOwners(Policy(),Image,rows,Read);}
    }
    public static void Positive(){
      Fixture f=new Fixture(new uint[]{Owner,0,Owner,Owner+0x1000});ParentSoundBankOwnerRead r=f.Run();
      Assert(r.usedSlots==4&&r.capacitySlots==7&&r.owners.Count==2&&r.additionalOwnerBytes==2336&&r.nullSlots.Count==1&&r.nullSlots[0]==1&&f.reads.Count==2,"Used/NULL/alias accounting");
      Assert(r.owners[0].id=="parent-sound-bank-owner-0"&&r.owners[1].id=="parent-sound-bank-owner-1"&&r.owners[0].slotIndices.Count==2&&r.owners[0].slotIndices[0]==0&&r.owners[0].slotIndices[1]==2,"Ascending first-use alias identity");
      Assert(Object.ReferenceEquals(r.header,f.header)&&Object.ReferenceEquals(r.storage,f.storage),"Header/storage were reread or replaced");
      Dictionary<string,object> proof=NativeDebugger.ParentSoundBankOwnerDetails(r);Assert((int)proof["uniqueOwners"]==2&&(int)proof["nullSlots"]==1&&(int)proof["maxUsedSlots"]==256&&(int)proof["ownerBytes"]==1168&&(int)proof["storageBytes"]==28&&(bool)proof["completeUsedOwnerObservation"],"Exact proof metadata");
      Assert((string)proof["headerSha256"]==Digest(f.header.data)&&(string)proof["storageSha256"]==Digest(f.storage.data),"Proof SHA differs from original buffers");
      foreach(uint emptyBegin in new uint[]{0,Bank}){f=new Fixture(new uint[0],0,emptyBegin);r=f.Run();Assert(r.owners.Count==0&&f.reads.Count==0&&r.usedSlots==0&&r.additionalOwnerBytes==0,"Empty vector read NULL");}
      f=new Fixture(new uint[0],4,Bank);r=f.Run();Assert(r.capacitySlots==4&&r.usedSlots==0&&f.reads.Count==0,"Unused allocation was followed");
      f=new Fixture(new uint[]{0,0});r=f.Run();Assert(r.nullSlots.Count==2&&r.slots[0]["ownerIndex"]==null&&r.slots[0]["rangeId"]==null&&f.reads.Count==0,"Null owner grants pointee");
      uint[] all=new uint[256];for(int i=0;i<all.Length;i++)all[i]=Owner+(uint)i*0x1000;f=new Fixture(all);r=f.Run();Assert(f.reads.Count==256&&r.additionalOwnerBytes==299008&&r.owners[255].index==255,"Exact maximum domain");
      f=new Fixture(new uint[]{Owner,Owner+16});f.rows.Add(new ParentSoundBankCapturedRange{id="independent-owner-intersection",address=Owner+80,data=Fixture.Bytes(Owner+80,40)});r=f.Run();Assert(r.owners.Count==2&&f.reads.Count==2,"Partial owner overlaps incorrectly merged");
    }
    static string Digest(byte[] b){using(SHA256 hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
    public static void Malformed(){
      Fixture f=new Fixture(new uint[257]);Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Over-bound used count read owners");
      f=new Fixture(new uint[]{Owner});f.storage.data[4]=1;f.storage.vector.end++;Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Vector/header mismatch read owner");
      foreach(int field in new int[]{0,4,8}){f=new Fixture(new uint[]{Owner});Store(f.header.data,field,0xffffffff);Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Malformed header reached owners");}
      f=new Fixture(new uint[]{Owner});Store(f.header.data,0,0);Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});Store(f.header.data,8,Bank+65540);Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.storage.vectorHeaderAddress++;Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.header.address++;Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.storage.address++;Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.storage.data=new byte[4];Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.rows.Add(f.header);Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.rows.Remove(f.header);Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.rows.Add(new ParentSoundBankCapturedRange{id="forged",address=0xffffffff,data=new byte[2]});Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});f.rows.Add(new ParentSoundBankCapturedRange{id="parent-sound-bank-owner-0",address=Owner,data=new byte[1168]});Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});Reject(delegate{NativeDebugger.ReadParentSoundBankOwners(Policy(),0xffe00000,f.rows,f.Read);});Assert(f.reads.Count==0,"Overflowing image root reached memory");
      f=new Fixture(new uint[]{0xfffffff0});Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Owner overflow attempted read");
      f=new Fixture(new uint[]{16});f.memory.Clear();Reject(delegate{f.Run();});Assert(f.reads.Count==1&&f.reads[0]==16,"Invalid nonnull pointer silently classified NULL");
      f=new Fixture(new uint[]{Owner});f.memory[Owner]=new byte[1167];Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner});Reject(delegate{NativeDebugger.ReadParentSoundBankOwners(Policy(),Image,f.rows,delegate(uint a,int n){return null;});});
      f=new Fixture(new uint[]{Owner});byte[] inconsistent=Fixture.Bytes(Owner+80,40);inconsistent[0]^=1;f.rows.Add(new ParentSoundBankCapturedRange{id="ordinary-owner",address=Owner+80,data=inconsistent});Reject(delegate{f.Run();});
      f=new Fixture(new uint[]{Owner,Owner+16});f.memory[Owner+16][0]^=1;Reject(delegate{f.Run();});Assert(f.reads.Count==2,"Partial overlap disagreement was not read and rejected");
    }
    public static void Scope(){
      ParentRttiProgress state=new ParentRttiProgress{selected=true,tid=7,parentEsp=0x400000,parentDebugOrdinal=100,lastStageDebugOrdinal=100,stage=1};
      Fixture f=new Fixture(new uint[]{Owner});ParentSoundBankOwnerRead r=f.Run();
      Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,7,8,ParentRttiProgress.Stages[0],100);});
      Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,8,7,ParentRttiProgress.Stages[0],100);});
      Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,7,7,"native-parent-rtti-call",100);});
      Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,7,7,ParentRttiProgress.Stages[0],101);});
      state.selected=false;Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,7,7,ParentRttiProgress.Stages[0],100);});state.selected=true;
      for(int index=0;index<10;index++){state.stage=index+1;state.lastStageDebugOrdinal=100+index;NativeDebugger.ValidateParentSoundBankOwnerCheckpoint(state,7,7,ParentRttiProgress.Stages[index],100+index);NativeDebugger.CommitParentSoundBankOwners(state,r,7,7,ParentRttiProgress.Stages[index],100+index);Reject(delegate{NativeDebugger.CommitParentSoundBankOwners(state,r,7,7,ParentRttiProgress.Stages[index],100+index);});}
      Assert(state.soundOwnerChecks==10&&state.soundOwnerRows==10&&state.soundOwnerBytes==11680,"Exact ten-checkpoint completion accounting");
      ParentSoundBankOwnerGraph p=Policy();p.maxUsedSlots=257;Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerPolicy(p);});p=Policy();p.ownerBytes--;Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerPolicy(p);});p=Policy();p.breakpointIds[0]="native-control-after";Reject(delegate{NativeDebugger.ValidateParentSoundBankOwnerPolicy(p);});
    }
  }
}
`;

async function pure(method){
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-sound-owner-host-'));
  try{
    const file=path.join(dir,'pure.cs');await writeFile(file,await readFile(source,'utf8')+'\n'+harness);
    const script=`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(file)}'\n[RollcageCapture.SoundBankOwnerHostTests]::${method}()\n'Pure owned host tests PASS; no game/native fixture launched.'`;
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('pure sound owner graph reads exact used owners, aliases, NULLs and consistent overlap from original header/storage buffers',{skip:process.platform!=='win32'},()=>pure('Positive'));
test('pure sound owner graph fails closed on malformed headers, over-bound counts, invalid nonnull pointers, missing bytes and overlap corruption',{skip:process.platform!=='win32'},()=>pure('Malformed'));
test('pure sound owner graph requires exact admitted owned-main chronology and commits ten independent checkpoints',{skip:process.platform!=='win32'},()=>pure('Scope'));

test('typed optional sound owner policy requires exact ten header/storage descriptors and preserves older capability profiles',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-sound-owner-policy-'));
  try{
    const old=(await createNativeParentRttiCaptureConfig('analysis/native-physics-local/startup-20261022',path.join(dir,'not-launched'),{viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true})).configuration;
    const policy={rootRva:'0x2f2414',headerRangeId:'sound-owner-vector-roots',storageRangeId:'control-sound-bank-storage',maxUsedSlots:256,ownerBytes:1168,breakpointIds:['native-control-before','native-control-after-ai','native-control-after','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects']};
    const enabled=structuredClone(old);enabled.parentRttiObservation.soundBankOwnerGraph=policy;
    const configs=[old,enabled];
    for(const mutate of [c=>c.parentRttiObservation.soundBankOwnerGraph.rootRva='0x2f2418',c=>c.parentRttiObservation.soundBankOwnerGraph.headerRangeId='other',c=>c.parentRttiObservation.soundBankOwnerGraph.storageRangeId='other',c=>c.parentRttiObservation.soundBankOwnerGraph.maxUsedSlots=257,c=>c.parentRttiObservation.soundBankOwnerGraph.ownerBytes=1169,c=>c.parentRttiObservation.soundBankOwnerGraph.breakpointIds.reverse(),c=>c.breakpoints[3].ranges=c.breakpoints[3].ranges.filter(r=>r.id!=='control-sound-bank-storage'),c=>c.breakpoints[12].ranges.find(r=>r.id==='sound-owner-vector-roots').length=8,c=>c.breakpoints[9].ranges.find(r=>r.id==='control-sound-bank-storage').maxVectorBytes=65537,c=>c.breakpoints[4].ranges.find(r=>r.id==='control-sound-bank-storage').rva='0x2f2418',c=>c.breakpoints[4].ranges.find(r=>r.id==='control-sound-bank-storage').dereferenceOffsets=['0'],c=>c.breakpoints[5].ranges.find(r=>r.id==='sound-owner-vector-roots').dereferenceMinimumValues=[1],c=>c.breakpoints[6].ranges.push(structuredClone(c.breakpoints[6].ranges.find(r=>r.id==='sound-owner-vector-roots'))),c=>c.breakpoints[15].ranges.push({id:'sound-owner-vector-roots',rva:'0x2f2414',length:12}),c=>c.breakpoints[3].ranges.push({id:'parent-sound-bank-owner-0',rva:'0x2f2414',length:1168}),c=>c.breakpoints[0].ranges.push({id:'control-sound-bank-storage',rva:'0x2f2414',vectorStorage:true,maxVectorBytes:65536}),c=>c.maxSnapshots=22,c=>c.maxDurationMs=90001,c=>c.phaseActions[0].writes[0].bytesHex='02000000']){const bad=structuredClone(enabled);mutate(bad);configs.push(bad);}
    const files=[];for(let i=0;i<configs.length;i++){const f=path.join(dir,`config-${i}.json`);await writeFile(f,JSON.stringify(configs[i]));files.push(f);}
    const script=`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(source)}'\nAdd-Type -AssemblyName System.Web.Extensions\n$reader=New-Object System.Web.Script.Serialization.JavaScriptSerializer\n$files=@(${files.map(f=>`'${quote(f)}'`).join(',')})\nfor($i=0;$i -lt $files.Count;$i++){$o=$reader.Deserialize([IO.File]::ReadAllText($files[$i]),[RollcageCapture.Options]);$bad=$false;try{[RollcageCapture.NativeDebugger]::Validate($o)}catch{$bad=$true};if(($i -lt 2) -eq $bad){throw ('Incorrect typed admission '+$i)};if($i -lt 2){$has=[RollcageCapture.NativeDebugger]::GetCaptureCapabilities($o) -contains 'scoped-parent-sound-bank-owner-graph-v1';if($has -ne ($i -eq 1)){throw 'Optional capability leaked/omitted'}}}\nif([RollcageCapture.NativeDebugger]::GetCapabilities() -notcontains 'scoped-parent-sound-bank-owner-graph-v1'){throw 'Missing capability declaration'}\n'Pure typed policy PASS; no capture launched.'`;
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('host transport derives owners after ordinary captured bytes and publishes proof before snapshot without adding sites or native writes',async()=>{
  const cs=await readFile(source,'utf8');
  const collect=cs.indexOf('if(observeOwners)ownerInputs.Add('),derive=cs.indexOf('ownerGraph=ReadParentSoundBankOwners('),annotate=cs.indexOf('snapshot["parentSoundBankOwnerGraph"]=proof;emit(proof);'),publish=cs.indexOf('emit(snapshot);',annotate),commit=cs.indexOf('if(ownerGraph!=null)CommitParentSoundBankOwners(');
  assert.ok(collect>0&&collect<derive&&derive<annotate&&annotate<publish&&publish<commit);
  assert.match(cs,/if\(observeOwners\)ValidateParentSoundBankOwnerCheckpoint/);
  const reader=cs.slice(cs.indexOf('public static ParentSoundBankOwnerRead ReadParentSoundBankOwners('),cs.indexOf('public static void CommitParentSoundBankOwners('));
  assert.doesNotMatch(reader,/SetContext|Marshal\.Write|ReadProcessMemory|Write\(child|ResolveCaptureRange/);
  assert.ok(reader.indexOf('result.usedSlots>p.maxUsedSlots')<reader.indexOf('part.data=read('));
  assert.ok(cs.includes('soundOwnerChecks!=10'));
});
