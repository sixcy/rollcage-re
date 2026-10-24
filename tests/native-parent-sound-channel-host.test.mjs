import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeRecoveryWorkerSourceEvidence} from '../tools/prepare-native-recovery-worker-source-capture.mjs';
import {verifyNativeParentSoundChannelGraph} from '../tools/lib/native-parent-sound-channel-graph.mjs';

const source=fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs',import.meta.url)),quote=s=>s.replaceAll("'","''");
const harness=String.raw`
namespace RollcageCapture {
 public static class SoundChannelHostTests {
  const uint Image=0x940000,Table=Image+0x1d3f60;
  static void Assert(bool ok,string label){if(!ok)throw new Exception(label);}
  static void Reject(Action action){bool bad=false;try{action();}catch{bad=true;}if(!bad)throw new Exception("Expected strict rejection");}
  static void Store(byte[] b,int o,uint n){Buffer.BlockCopy(BitConverter.GetBytes(n),0,b,o,4);}
  static ParentSoundBankChannelGraph Policy(){return new ParentSoundBankChannelGraph{maxUsedChannelSlots=256,wrapperBytes=12,sourceBytes=2472,sourceVtableRva="0x1d3f60",vtableBytes=136};}
  sealed class Span {public uint address;public byte[] data;}
  sealed class Fixture {
   public List<ParentSoundBankOwnerRange> owners=new List<ParentSoundBankOwnerRange>();public List<ParentSoundBankCapturedRange> captured=new List<ParentSoundBankCapturedRange>();public List<Span> memory=new List<Span>();public List<string> reads=new List<string>();public bool corruptFullSource;
   public void Put(uint address,byte[] data){memory.Add(new Span{address=address,data=data});}
   public void Owner(uint begin,uint[] slots,uint spare){byte[] b=new byte[1168];Store(b,4,begin);Store(b,8,begin+(uint)slots.Length*4);Store(b,12,begin+((uint)slots.Length+spare)*4);owners.Add(new ParentSoundBankOwnerRange{index=owners.Count,id="parent-sound-bank-owner-"+owners.Count,address=0x200000+(uint)owners.Count*0x1000,data=b});if(slots.Length!=0){byte[] a=new byte[slots.Length*4];for(int i=0;i<slots.Length;i++)Store(a,i*4,slots[i]);Put(begin,a);}}
   public void Wrapper(uint address,uint source){byte[] b=new byte[12];Store(b,0,source);Store(b,4,0xdeadbee0);Store(b,8,0xbeefcafe);Put(address,b);}
   public void Source(uint address){byte[] b=new byte[2472];for(int i=4;i<b.Length;i++)b[i]=(byte)(i%251);Store(b,0,Table);Put(address,b);}
   public Fixture(){Put(Table,new byte[136]);}
   public byte[] Read(uint address,int length){reads.Add(address+":"+length);Span best=null;foreach(Span s in memory)if(address>=s.address&&(ulong)address+(uint)length<=(ulong)s.address+(uint)s.data.Length&&(best==null||s.data.Length<best.data.Length))best=s;if(best==null)throw new InvalidDataException("Actual native span unavailable");byte[] b=new byte[length];Buffer.BlockCopy(best.data,checked((int)(address-best.address)),b,0,length);if(corruptFullSource&&length==2472)b[0]^=1;return b;}
   public ParentSoundChannelRead Run(){return NativeDebugger.ReadParentSoundBankChannels(Policy(),Image,captured,owners,Read);}
  }
  public static void Positive(){
   Fixture f=new Fixture();f.Owner(0,new uint[0],0);f.Owner(0x300000,new uint[0],6);ParentSoundChannelRead r=f.Run();Assert(r.usedChannelSlots==0&&r.ranges.Count==0&&f.reads.Count==0,"Empty allocated/unallocated owner followed capacity");
   f=new Fixture();f.Owner(0x300000,new uint[]{0,0x400000,0x400000,0x401000},9);f.Wrapper(0x400000,0x500000);f.Wrapper(0x401000,0);f.Source(0x500000);r=f.Run();
   Assert(r.usedChannelSlots==4&&r.storages.Count==1&&r.storages[0].length==16&&r.wrappers.Count==2&&r.sources.Count==1&&r.vtables.Count==1&&r.additionalBytes==16+24+2472+136,"Exact used-only descendants");
   Assert(r.slots[0]["wrapperIndex"]==null&&r.slots[0]["sourceAddress"]==null&&r.slots[3]["sourceIndex"]==null&&(string)r.slots[3]["sourceAddress"]=="0x00000000","NULL wrapper/source grants no pointee");
   Assert(r.wrappers[0].referenceIndices.Count==2&&r.wrappers[0].referenceIndices[0]==1&&r.wrappers[0].referenceIndices[1]==2,"Wrapper aliases lost global slot identity");
   int probe=f.reads.IndexOf("5242880:4"),full=f.reads.IndexOf("5242880:2472");Assert(probe>=0&&full==probe+1,"Actual class DWORD not before full source");Assert(!f.reads.Exists(delegate(string x){return x.StartsWith("3735928544:")||x.StartsWith("3203386110:");}),"Position/velocity descendants chased");
   Dictionary<string,object> proof=NativeDebugger.ParentSoundChannelDetails(r);Assert((int)proof["usedChannelSlots"]==4&&(int)proof["additionalBytes"]==2648,"Actual proof counts");
   ParentSoundBankOwnerRead observed=new ParentSoundBankOwnerRead{channelGraph=r,additionalOwnerBytes=f.owners.Count*1168};observed.owners.AddRange(f.owners);ParentRttiProgress state=new ParentRttiProgress{selected=true,tid=7,parentEsp=0x400000,parentDebugOrdinal=100};for(int i=0;i<10;i++){state.stage=i+1;state.lastStageDebugOrdinal=100+i;NativeDebugger.CommitParentSoundBankOwners(state,observed,7,7,ParentRttiProgress.Stages[i],100+i);}Assert(state.soundOwnerChecks==10&&state.soundChannelChecks==10&&state.soundChannelSlots==40&&state.soundChannelStorages==10&&state.soundChannelWrappers==20&&state.soundChannelSources==10&&state.soundChannelVtables==10&&state.soundChannelBytes==26480,"Ten-stage independent commit accounting");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000,0x401000},0);f.Owner(0x300000,new uint[]{0x400000,0x401000},0);f.Wrapper(0x400000,0x500000);f.Wrapper(0x401000,0x500000);f.Source(0x500000);r=f.Run();Assert(r.usedChannelSlots==4&&r.storages.Count==1&&r.storages[0].referenceIndices.Count==2&&r.sources.Count==1&&r.sources[0].referenceIndices.Count==2,"Slot budget deduped logical edges or source aliases lost");
   f=new Fixture();f.Owner(0x300000,new uint[]{0,0},0);f.Owner(0x300004,new uint[]{0},0);r=f.Run();Assert(r.storages.Count==2&&r.usedChannelSlots==3&&r.additionalBytes==12,"Partially overlapping storage extents merged or logical count reduced");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000,0x400004},0);f.Put(0x400000,new byte[12]);f.Put(0x400004,new byte[12]);r=f.Run();Assert(r.wrappers.Count==2&&r.sources.Count==0,"Consistent partial wrapper overlap rejected/merged");
   f=new Fixture();for(int i=0;i<256;i++){uint w=0x400000+(uint)i*0x1000,s=0x500000+(uint)i*0x2000;f.Owner(0x300000+(uint)i*0x1000,new uint[]{w},0);f.Wrapper(w,s);f.Source(s);}r=f.Run();Assert(r.usedChannelSlots==256&&r.sources.Count==256&&r.additionalBytes==637064,"Exact maximum typed transport");
  }
  public static void Malformed(){
   Fixture f=new Fixture();f.Owner(0x300000,new uint[128],0);f.Owner(0x301000,new uint[129],0);Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Aggregate bound read descendants");
   f=new Fixture();f.Owner(0x300000,new uint[128],0);f.Owner(0x300000,new uint[128],0);f.Owner(0x300000,new uint[1],0);Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Logical aliases evade aggregate budget");
   foreach(int offset in new int[]{4,8,12}){f=new Fixture();f.Owner(0x300000,new uint[]{0},0);Store(f.owners[0].data,offset,0xffffffff);Reject(delegate{f.Run();});Assert(f.reads.Count==0,"Bad header read data");}
   f=new Fixture();f.Owner(0,new uint[0],0);Store(f.owners[0].data,12,4);Reject(delegate{f.Run();});
   f=new Fixture();f.Owner(0x300000,new uint[]{16},0);Reject(delegate{f.Run();});Assert(f.reads.Contains("16:12"),"Small nonnull wrapper classified NULL");
   f=new Fixture();f.Owner(0x300000,new uint[]{0xfffffff8},0);Reject(delegate{f.Run();});Assert(f.reads.Count==1,"Overflow wrapper read attempted");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000},0);f.Wrapper(0x400000,16);Reject(delegate{f.Run();});Assert(f.reads.Contains("16:4")&&!f.reads.Contains("16:2472"),"Unknown source read full extent or became NULL");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000},0);f.Wrapper(0x400000,0x500000);f.Source(0x500000);Store(f.memory[f.memory.Count-1].data,0,Table+4);Reject(delegate{f.Run();});Assert(f.reads.Contains("5242880:4")&&!f.reads.Contains("5242880:2472"),"Unknown source class chased9a8");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000},0);f.Wrapper(0x400000,0x500000);f.Source(0x500000);f.corruptFullSource=true;Reject(delegate{f.Run();});Assert(!f.reads.Contains(Table+":136"),"Changed source prefix allowed vtable read");
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000},0);Reject(delegate{NativeDebugger.ReadParentSoundBankChannels(Policy(),Image,f.captured,f.owners,delegate(uint a,int n){return new byte[n-1];});});
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000},0);f.Wrapper(0x400000,0);f.captured.Add(new ParentSoundBankCapturedRange{id="ordinary-intersection",address=0x400004,data=new byte[4]});Reject(delegate{f.Run();});
   f=new Fixture();f.Owner(0x300000,new uint[]{0x400000,0x400004},0);f.Wrapper(0x400000,0);f.Wrapper(0x400004,0);Reject(delegate{f.Run();});
   foreach(string field in new string[]{"maxUsedChannelSlots","wrapperBytes","sourceBytes","vtableBytes"}){ParentSoundBankChannelGraph p=Policy();typeof(ParentSoundBankChannelGraph).GetField(field).SetValue(p,257);Reject(delegate{NativeDebugger.ValidateParentSoundBankChannelPolicy(p);});}ParentSoundBankChannelGraph bad=Policy();bad.sourceVtableRva="0x1d3f64";Reject(delegate{NativeDebugger.ValidateParentSoundBankChannelPolicy(bad);});
  }
  static string HexBytes(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
  static string Digest(byte[] b){using(SHA256 hash=SHA256.Create())return HexBytes(hash.ComputeHash(b));}
  public static Dictionary<string,object> Export(){
   Fixture f=new Fixture();uint[] slots={0,0x400000,0x401000,0x402000};f.Owner(0x300000,slots,5);f.Owner(0x300000,slots,5);f.Wrapper(0x400000,0x500000);f.Wrapper(0x401000,0x500000);f.Wrapper(0x402000,0);f.Source(0x500000);ParentSoundChannelRead r=f.Run();List<object> rows=new List<object>(),owners=new List<object>();
   foreach(ParentSoundBankOwnerRange owner in f.owners){Dictionary<string,object> row=new Dictionary<string,object>{{"id",owner.id},{"address",owner.address},{"length",owner.data.Length},{"bytesHex",HexBytes(owner.data)},{"sha256",Digest(owner.data)}};rows.Add(row);owners.Add(new Dictionary<string,object>{{"index",owner.index},{"address",owner.address},{"rangeId",owner.id},{"bytes",1168},{"sha256",Digest(owner.data)}});}
   foreach(ParentSoundChannelRange part in r.ranges){Dictionary<string,object> row=NativeDebugger.ParentSoundChannelRangeMetadata(part,"synthetic-no-native-file-"+rows.Count+".bin");row.Add("bytesHex",HexBytes(part.data));rows.Add(row);}
   return new Dictionary<string,object>{{"proof",NativeDebugger.ParentSoundChannelDetails(r)},{"ranges",rows},{"owners",owners}};
  }
 }
}
`;
async function pure(method){const dir=await mkdtemp(path.join(tmpdir(),'rollcage-sound-channel-host-'));try{const file=path.join(dir,'pure.cs');await writeFile(file,await readFile(source,'utf8')+'\n'+harness);const result=spawnSync('powershell.exe',['-NoProfile','-Command',`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(file)}'\n[RollcageCapture.SoundChannelHostTests]::${method}()\n'Pure channel host PASS; no native fixture/game launched.'`],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);}finally{await rm(dir,{recursive:true,force:true});}}

test('pure channel graph preserves exact used edges, NULLs, aliases, class-before-source reads and maximum bounded transport',{skip:process.platform!=='win32'},()=>pure('Positive'));
test('pure channel graph rejects aggregate overflow, malformed headers, invalid pointers, unknown/changed classes, missing bytes and partial overlap conflicts',{skip:process.platform!=='win32'},()=>pure('Malformed'));

test('actual pure C# reader proof and production row metadata pass the independent JS verifier with NULLs and shared wrappers/sources',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-channel-cross-language-'));try{
    const file=path.join(dir,'pure.cs');await writeFile(file,await readFile(source,'utf8')+'\n'+harness);
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(file)}'\n[RollcageCapture.SoundChannelHostTests]::Export() | ConvertTo-Json -Depth 40 -Compress`],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
    const exported=JSON.parse(result.stdout),ranges=exported.ranges.map(({bytesHex,...row})=>({...row,bytes:Buffer.from(bytesHex,'hex')}));
    const proof=verifyNativeParentSoundChannelGraph({ordinal:4,breakpointId:'native-control-before',ranges},exported.proof,{moduleBaseAddress:0x940000,ownerProof:{owners:exported.owners}});
    assert.equal(proof.verified,true);assert.equal(proof.usedChannelSlots,8);assert.equal(proof.wrapperRows,3);assert.equal(proof.sourceRows,1);assert.equal(proof.semanticDescendantsAdmitted,0);
    assert.equal(exported.proof.slots[0].sourceAddress,null);assert.equal(Number(exported.proof.slots[3].sourceAddress),0);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('native source allocation/class/vtable evidence authenticates the9a8/88 typed extent and optional host policy preserves legacy profiles',{skip:process.platform!=='win32'},async()=>{
  await verifyNativeRecoveryWorkerSourceEvidence();
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-channel-policy-'));try{
    const config=(await createNativeParentRttiCaptureConfig('analysis/native-physics-local/startup-20261022',path.join(dir,'not-launched'),{viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true})).configuration;
    config.parentRttiObservation.soundBankOwnerGraph={rootRva:'0x2f2414',headerRangeId:'sound-owner-vector-roots',storageRangeId:'control-sound-bank-storage',maxUsedSlots:256,ownerBytes:1168,breakpointIds:['native-control-before','native-control-after-ai','native-control-after','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects']};
    const enabled=structuredClone(config);enabled.parentRttiObservation.soundBankOwnerGraph.channelGraph={maxUsedChannelSlots:256,wrapperBytes:12,sourceBytes:2472,sourceVtableRva:'0x1d3f60',vtableBytes:136};const configs=[config,enabled];for(const mutate of [x=>x.parentRttiObservation.soundBankOwnerGraph.channelGraph.maxUsedChannelSlots=257,x=>x.parentRttiObservation.soundBankOwnerGraph.channelGraph.wrapperBytes=13,x=>x.parentRttiObservation.soundBankOwnerGraph.channelGraph.sourceBytes=2476,x=>x.parentRttiObservation.soundBankOwnerGraph.channelGraph.vtableBytes=140,x=>x.parentRttiObservation.soundBankOwnerGraph.channelGraph.sourceVtableRva='0x1d3f64',x=>x.breakpoints[3].ranges.push({id:'parent-sound-channel-source-0',rva:'0x1d3f60',length:2472}),x=>x.breakpoints[15].ranges.push({id:'parent-sound-channel-storage-0',rva:'0x1d3f60',length:4}),x=>x.maxSnapshots++]){const c=structuredClone(enabled);mutate(c);configs.push(c);}
    const files=[];for(let i=0;i<configs.length;i++){const f=path.join(dir,`c${i}.json`);await writeFile(f,JSON.stringify(configs[i]));files.push(f);}
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',`$ErrorActionPreference='Stop'\nAdd-Type -Path '${quote(source)}'\nAdd-Type -AssemblyName System.Web.Extensions\n$r=New-Object System.Web.Script.Serialization.JavaScriptSerializer\n$f=@(${files.map(f=>`'${quote(f)}'`).join(',')})\nfor($i=0;$i -lt $f.Count;$i++){$o=$r.Deserialize([IO.File]::ReadAllText($f[$i]),[RollcageCapture.Options]);$bad=$false;try{[RollcageCapture.NativeDebugger]::Validate($o)}catch{$bad=$true};if(($i -lt 2) -eq $bad){throw ('Policy admission '+$i)};if($i -lt 2){$cap=[RollcageCapture.NativeDebugger]::GetCaptureCapabilities($o) -contains 'scoped-parent-sound-bank-channel-graph-v1';if($cap -ne ($i -eq 1)){throw 'Optional channel capability leaked/omitted'}}}`],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('channel graph remains a cold same-snapshot data extension with no extra breakpoint, startup action or native output write',async()=>{
  const cs=await readFile(source,'utf8'),start=cs.indexOf('public static ParentSoundChannelRead ReadParentSoundBankChannels('),end=cs.indexOf('static List<object> ParentSoundChannelInventory(',start),body=cs.slice(start,end);
  assert.doesNotMatch(body,/SetContext|Marshal\.Write|Write\(child|ResolveCaptureRange|operatorNew/);
  assert.ok(body.indexOf('aggregate used slots exceed')<body.indexOf('foreach(ParentSoundChannelRange storage'));
  assert.ok(body.indexOf('probe=read(source.address,4)')<body.indexOf('if(source.vtableAddress!=mainBase+0x1d3f60)'));
  assert.ok(body.indexOf('if(source.vtableAddress!=mainBase+0x1d3f60)')<body.indexOf('ReadParentSoundChannelRange(source,'));
  assert.ok(cs.includes('if(observed.channelGraph!=null)details["channelGraph"]'));
});
