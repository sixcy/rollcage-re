// Windows-only, owned-child x86 capture. This is an observation adapter, not game logic.
using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace RollcageCapture {
  public sealed class MemoryRange {
    public string id;
    public string address;
    public string rva;
    public string baseRegister;
    public string[] dereferenceOffsets = new string[0];
    public int[] dereferenceMinimumValues;
    public string offset = "0";
    public int length;
    public bool readableRegion;
    public int maxRegionBytes;
    public bool vectorStorage;
    public int maxVectorBytes;
  }
  public sealed class VectorStorageInfo {
    public uint begin, end, capacity;
    public int length;
    public byte[] header;
  }
  public sealed class GuardedPointerInfo {
    public uint rootAddress, address;
    public int stopIndex = -1;
    public List<Dictionary<string, object>> steps = new List<Dictionary<string, object>>();
  }
  public sealed class MemoryRegionInfo {
    public ulong baseAddress, allocationBaseAddress, regionSize;
    public uint allocationProtection, state, protection, type;
  }
  public sealed class ThreadTerminationObservation {
    public uint waitResult;
    public int waitWin32Error;
    public bool terminated, exitCodeAvailable;
    public uint exitCode;
    public int exitCodeWin32Error;
  }
  sealed class DeferredOwnedBreakpoint {
    public Breakpoint breakpoint;
    public uint tid;
    public int observedDebugEventOrdinal, chainRootDebugEventOrdinal, previousDebugEventOrdinal;
  }
  public sealed class MemoryWrite {
    public string address;
    public string rva;
    public string baseRegister;
    public string[] dereferenceOffsets = new string[0];
    public string offset = "0";
    public string bytesHex;
    public string expectedBytesHex;
    public string[] expectedAnyBytesHex;
  }
  public sealed class PhaseAction {
    public string breakpointId;
    public int hit = 1;
    public MemoryWrite[] writes = new MemoryWrite[0];
  }
  public sealed class CaptureCondition {
    public MemoryRange range;
    public string equalsBytesHex;
  }
  public sealed class Breakpoint {
    public string id;
    public string rva;
    public string address;
    public int stopAfterHits;
    public MemoryRange[] ranges = new MemoryRange[0];
    public CaptureCondition captureWhen;
    public int? skipMatchingHits;
    internal uint resolved;
    internal byte original;
    internal bool armed;
    internal int hits;
    internal int captureHits;
    internal int matchingHits;
    internal string service;
    internal int argumentCount;
  }
  public sealed class PendingFrameObserver {
    public string beforeBreakpointId, afterBreakpointId, eventBreakpointId;
    public string[] nestedBreakpointIds = new string[0];
    public string nestedCaptureScope;
    public int maxNestedSnapshots;
    public int maxPendingBytes, maxCandidateFrames, maxEventSnapshots;
    public int eventStackOffset, eventRecordBytes;
    public string eventReturnRva, eventPointerRegister;
    public MemoryRange eventPoolRoot, eventPoolCapacity;
  }
  public sealed class ObservationActivation {
    public string breakpointId;
    public int rawHit;
    public string[] observationBreakpointIds = new string[0];
  }
  public sealed class OwnedWorkerObservation {
    public string breakpointId;
    public MemoryRange threadIdSource;
    public int maxSnapshots;
    public string entryReturnRva;
  }
  public sealed class OwnedWorkerObservationProgress {
    public int captured;
    public bool NeedsThreadSourceRead(bool frameActive, bool activated) { return frameActive && activated && captured == 0; }
    public bool CanCapture(bool frameActive, bool activated, uint actualTid, uint expectedTid, uint frameTid, bool ownedLiveThread) {
      if (!NeedsThreadSourceRead(frameActive, activated)) return false;
      if (expectedTid == 0 || expectedTid == frameTid || !ownedLiveThread) throw new InvalidDataException("Owned worker observation requires a different live CREATE_THREAD identity.");
      return actualTid == expectedTid;
    }
    public void CommitSnapshot() {
      if (captured != 0) throw new InvalidDataException("Owned worker one-snapshot bound exceeded.");
      captured = 1;
    }
  }
  public sealed class OwnedWorkerGainPair {
    public string entryBreakpointId, exitBreakpointId, unsupportedExitBreakpointId;
    public MemoryRange threadIdSource, managerSource;
    public int maxSnapshots;
  }
  public sealed class OwnedWorkerGainWindow {
    public string entryBreakpointId, exitBreakpointId, unsupportedExitBreakpointId;
    public MemoryRange threadIdSource, managerSource;
    public int maxSnapshots, maxBufferedBytes;
  }
  public sealed class OwnedWorkerGainWindowProgress {
    public readonly OwnedWorkerGainPairProgress call = new OwnedWorkerGainPairProgress();
    public int activationDebugOrdinal;
    public uint ownerTid, threadIdSourceAddress;
    public long bufferedBytes;
    public bool parentComplete;
    public bool Ready { get { return parentComplete && call.complete; } }
    public void Activate(int ordinal,uint mainTid) {if(ordinal<1||mainTid==0||activationDebugOrdinal!=0)throw new InvalidDataException("Worker leaf window requires one real guarded activation.");activationDebugOrdinal=ordinal;ownerTid=mainTid;}
    public void Reserve(long bytes,int maximum) {if(bytes<0||bytes>maximum-bufferedBytes)throw new InvalidDataException("Worker leaf window byte bound exceeded.");bufferedBytes+=bytes;}
    public void RequireComplete() {if(!Ready||call.captured!=2||call.open)throw new InvalidDataException("Worker leaf window stopped without its actual parent and complete same-call gain pair.");}
  }
  //A distinct two-endpoint policy. It never widens the old one-shot contract.
  public sealed class OwnedWorkerGainPairProgress {
    public int captured;
    public bool open, complete;
    public uint tid, frameTid, esp, source, manager, caller, force, ebx, ebp, edi;
    public int candidateIndex;
    public bool CanObserve(bool frameActive, bool activated, uint actualTid, uint expectedTid, uint parentTid, bool ownedLive) {
      if (!frameActive || !activated || complete) return false;
      if (expectedTid == 0 || expectedTid == parentTid || !ownedLive) throw new InvalidDataException("Worker gain pair requires an actual different live CREATE_THREAD worker.");
      if (actualTid != expectedTid) return false;
      if (open && (tid != actualTid || frameTid != parentTid)) throw new InvalidDataException("Worker gain pair thread changed inside its call.");
      return true;
    }
    public static bool CallerMatches(uint moduleBase, uint returned, uint flag) {
      return (returned == moduleBase + 0xa722c && flag == 0) || (returned == moduleBase + 0xa72f6 && flag == 1);
    }
    public void Begin(uint workerTid, uint parentTid, int candidate, uint entryEsp, uint objectSource, uint managerObject, uint returned, uint flag, uint incomingEbx, uint incomingEbp, uint incomingEdi, uint moduleBase, uint incomingEsi) {
      if (open || complete || captured != 0 || workerTid == 0 || workerTid == parentTid || candidate < 1 || entryEsp < 432 || objectSource == 0 || objectSource != incomingEsi || managerObject == 0 || !CallerMatches(moduleBase, returned, flag)) throw new InvalidDataException("Worker gain entry caller/source/frame ABI differs.");
      tid = workerTid; frameTid = parentTid; candidateIndex = candidate; esp = entryEsp; source = objectSource; manager = managerObject;
      caller = returned; force = flag; ebx = incomingEbx; ebp = incomingEbp; edi = incomingEdi; open = true;
    }
    public void ValidateExit(uint workerTid, uint parentTid, int candidate, uint exitEsp, uint returned, uint savedSource, uint currentManager, uint savedEbx, uint savedEbp, uint savedEdi) {
      if (!open || complete || captured != 1 || tid != workerTid || frameTid != parentTid || candidateIndex != candidate || esp != exitEsp || caller != returned || source != savedSource || manager != currentManager || ebx != savedEbx || ebp != savedEbp || edi != savedEdi) throw new InvalidDataException("Worker gain exit source/thread/stack/caller/nonvolatile ABI differs.");
    }
    public void Commit(bool entry) {
      if (!open || complete || captured != (entry ? 0 : 1)) throw new InvalidDataException("Worker gain pair endpoint bound exceeded.");
      captured++; if (!entry) {open = false; complete = true;}
    }
    public void ValidateParentClose(int candidate, bool selected) {
      if (open || captured != 0 && (!complete || candidate != candidateIndex || !selected) || selected && !complete) throw new InvalidDataException("Selected parent lacks its complete same-frame worker gain pair.");
    }
  }
  // Pure state checks are shared by runtime capture and configuration/ABI tests.
  public sealed class PendingFrameProgress {
    public bool active;
    public int candidateIndex, frameMatchingHit, observedEventHits, qualifyingEventSnapshots, nestedSnapshots;
    public uint frameTid, frameEntryEsp, frameReturnAddress;
    public long bufferedBytes;
    public void Begin(PendingFrameObserver policy, uint tid, uint esp, uint caller, int matchingHit) {
      if (active) throw new InvalidDataException("Nested pending-frame entry.");
      if (candidateIndex >= policy.maxCandidateFrames) throw new InvalidDataException("Pending-frame candidate bound exceeded.");
      active = true; candidateIndex++; frameTid = tid; frameEntryEsp = esp; frameReturnAddress = caller;
      frameMatchingHit = matchingHit; observedEventHits = 0; qualifyingEventSnapshots = 0; nestedSnapshots = 0; bufferedBytes = 0;
    }
    public void Reserve(PendingFrameObserver policy, long bytes) {
      if (!active || bytes < 0 || bytes > policy.maxPendingBytes - bufferedBytes) throw new InvalidDataException("Pending-frame host-buffer byte bound exceeded.");
      bufferedBytes += bytes;
    }
    public void ObserveNested(PendingFrameObserver policy) {
      if (!active || nestedSnapshots >= policy.maxNestedSnapshots) throw new InvalidDataException("Pending-frame nested snapshot bound exceeded or frame inactive.");
      nestedSnapshots++;
    }
    public int ObserveEvent(PendingFrameObserver policy, uint tid, uint esp, uint caller, uint expectedCaller, uint address, uint pool, uint capacity, bool qualifies) {
      if (!active || tid != frameTid || (long)esp != (long)frameEntryEsp + policy.eventStackOffset || caller != expectedCaller) throw new InvalidDataException("Pending-frame event thread/stack/return ABI mismatch.");
      ulong end = (ulong)pool + (ulong)capacity * (ulong)policy.eventRecordBytes;
      if (capacity == 0 || pool == 0 || end > 0x100000000UL || address < pool || (ulong)address >= end || ((ulong)address - pool) % (ulong)policy.eventRecordBytes != 0) throw new InvalidDataException("Pending-frame event pointer is not a declared pool slot.");
      observedEventHits = checked(observedEventHits + 1);
      if (qualifies && qualifyingEventSnapshots >= policy.maxEventSnapshots) throw new InvalidDataException("Pending-frame event snapshot bound exceeded.");
      if (qualifies) qualifyingEventSnapshots++;
      return checked((int)(((ulong)address - pool) / (ulong)policy.eventRecordBytes));
    }
    public void ValidateAfter(uint tid, uint esp, uint caller, int matchingHit, bool selected) {
      if (!active || tid != frameTid || esp != frameEntryEsp || caller != frameReturnAddress || matchingHit != frameMatchingHit || !selected) throw new InvalidDataException("Pending-frame after thread/stack/return/matching-hit ABI mismatch.");
    }
  }
  public sealed class HeldForceInput {
    public string breakpointId;
    public int maxHoldMs;
    public bool shareContainedRanges;
  }
  public sealed class ControlledRaceSettings {
    public string breakpointId;
    public int level, quality, expectedTrackByte, expectedQualityByte;
  }
  public sealed class ParentRttiMapPreflight {
    public string rootRva, fixedHeadRangeId, regionRangeId;
    public string[] dereferenceOffsets, breakpointIds;
    public int maxRegionBytes;
  }
  public sealed class ParentRttiObservation {
    public string parentBreakpointId, beginBreakpointId, endBreakpointId, callBreakpointId, returnBreakpointId;
    public int maxPairs, maxSnapshots;
    public ParentRttiMapPreflight singletonMapPreflight;
  }
  public sealed class ParentRttiMapRead {
    public uint rootAddress, appAddress, headSlotAddress, headAddress;
    public byte[] rootBytes, headBytes;
  }
  public sealed class ParentRttiEndpointRead {
    public byte[] context, cameraReturn, clockBytes, singletonBytes;
    public bool commonCaller;
  }
  public sealed class ParentRttiProgress {
    public uint tid, parentEsp, clock, iteration, caller, totalIterations, appAddress, headAddress;
    public uint[] incomingNonvolatile;
    public int parentDebugOrdinal, activationDebugOrdinal, auxiliarySnapshotOrdinal, lastStageDebugOrdinal, lastEndpointDebugOrdinal, stage, captured, pairs, mapChecks;
    public bool selected, windowOpen, closed, callOpen, auxiliaryCaptured, auxiliaryPublished;
    byte[] arguments;
    public static readonly string[] Stages={"native-control-before","native-control-after-ai","native-control-after","native-control-after-physics","native-control-after-attachments","native-control-after-recovery","native-control-after-drive","native-control-after-auxiliary","native-control-after-cameras","native-control-after-world-effects"};
    public void ObserveStage(string id,uint mainBase,uint ownerTid,uint actualTid,uint esp,uint actualClock,uint currentIteration,byte[] stack,uint[] nonvolatileRegisters,int debugOrdinal) {
      if(stage>=Stages.Length||id!=Stages[stage]||ownerTid==0||actualTid!=ownerTid||debugOrdinal<=lastStageDebugOrdinal||stack==null||nonvolatileRegisters==null||nonvolatileRegisters.Length!=4)throw new InvalidDataException("Parent RTTI selected checkpoint order/main-thread differs.");
      if(stage==0){if(selected||mainBase==0||esp<4096||(ulong)mainBase+0x51ffff>UInt32.MaxValue||stack.Length!=8)throw new InvalidDataException("Parent RTTI actual parent entry bounds differ.");selected=true;tid=actualTid;parentEsp=esp;clock=actualClock;iteration=currentIteration;caller=BitConverter.ToUInt32(stack,0);totalIterations=BitConverter.ToUInt32(stack,4);incomingNonvolatile=(uint[])nonvolatileRegisters.Clone();parentDebugOrdinal=debugOrdinal;}
      else {
        bool physical=id=="native-control-after"||id=="native-control-after-physics";int shift=physical?4:0;
        if(!selected||tid!=actualTid||actualClock!=clock||currentIteration!=iteration||debugOrdinal<=parentDebugOrdinal||esp!=parentEsp-(physical?20u:16u)||stack.Length!=(physical?28:24))throw new InvalidDataException("Parent RTTI checkpoint parent/clock/stack lineage differs.");
        if(physical&&BitConverter.ToUInt32(stack,0)!=checked(mainBase+0x51017))throw new InvalidDataException("Parent RTTI physical caller differs.");
        for(int i=0;i<4;i++)if(BitConverter.ToUInt32(stack,shift+i*4)!=incomingNonvolatile[i])throw new InvalidDataException("Parent RTTI saved parent register differs.");
        if(BitConverter.ToUInt32(stack,shift+16)!=caller||BitConverter.ToUInt32(stack,shift+20)!=totalIterations)throw new InvalidDataException("Parent RTTI saved parent caller/iteration argument differs.");
        if(id=="native-control-after-cameras"){if(!windowOpen||closed||callOpen||captured!=pairs*2||debugOrdinal<=lastEndpointDebugOrdinal)throw new InvalidDataException("Parent RTTI camera closure has an unmatched external call.");windowOpen=false;closed=true;}
      }
      stage++;lastStageDebugOrdinal=debugOrdinal;
    }
    public void ObserveMap(string id,uint app,uint head) {
      bool entry=id=="native-control-before";
      bool valid=entry?(stage==1&&mapChecks==0):id=="native-control-after-cameras"?(stage==9&&mapChecks==1):id=="native-control-after-world-effects"&&(stage==10&&mapChecks==2);
      if(!selected||app==0||head==0||!valid)throw new InvalidDataException("Parent RTTI map preflight stage/null identity differs.");
      if(entry){appAddress=app;headAddress=head;}else if(appAddress!=app||headAddress!=head)throw new InvalidDataException("Parent RTTI singleton/head identity changed after selected parent entry.");mapChecks++;
    }
    public void Activate(int debugOrdinal,uint actualTid) {
      if(!selected||stage!=8||!auxiliaryCaptured||auxiliaryPublished||actualTid!=tid||activationDebugOrdinal!=0||debugOrdinal!=lastStageDebugOrdinal||debugOrdinal<=parentDebugOrdinal||mapChecks!=1)throw new InvalidDataException("Parent RTTI activation requires captured but unpublished selected auxiliary bytes.");activationDebugOrdinal=debugOrdinal;windowOpen=true;
    }
    public void MarkAuxiliaryCaptured(int ordinal){if(stage!=8||auxiliaryCaptured||ordinal<1)throw new InvalidDataException("Parent RTTI auxiliary capture order differs.");auxiliaryCaptured=true;auxiliarySnapshotOrdinal=ordinal;}
    public void MarkAuxiliaryPublished(){if(!auxiliaryCaptured||auxiliaryPublished||!windowOpen||activationDebugOrdinal==0)throw new InvalidDataException("Parent RTTI auxiliary publication precedes guarded activation.");auxiliaryPublished=true;}
    public bool CanRead(uint actualTid,uint esp) {return selected&&windowOpen&&!closed&&actualTid==tid&&esp==parentEsp-276;}
    public void ValidateEndpoint(bool entry,uint mainBase,uint actualTid,uint esp,uint actualClock,uint singleton,byte[] context,byte[] cameraReturn,int debugOrdinal) {
      if(!CanRead(actualTid,esp)||actualClock!=clock||singleton!=appAddress||debugOrdinal<=activationDebugOrdinal||debugOrdinal<=lastEndpointDebugOrdinal||context==null||context.Length!=52||cameraReturn==null||cameraReturn.Length!=4)throw new InvalidDataException("Parent RTTI endpoint scope/clock/extents differs.");
      if(BitConverter.ToUInt32(context,40)!=checked(mainBase+0x1a0c8)||BitConverter.ToUInt32(context,44)!=1||BitConverter.ToUInt32(context,48)!=parentEsp-60||BitConverter.ToUInt32(cameraReturn,0)!=checked(mainBase+0x51107)||BitConverter.ToUInt32(context,0)!=appAddress||BitConverter.ToUInt32(context,4)!=0||BitConverter.ToUInt32(context,8)!=checked(mainBase+0x2e213c)||BitConverter.ToUInt32(context,12)!=checked(mainBase+0x2e20a4)||BitConverter.ToUInt32(context,16)!=0)throw new InvalidDataException("Parent RTTI common wrapper/camera/type arguments differ.");
      if(entry){if(callOpen||pairs>=4||captured!=pairs*2)throw new InvalidDataException("Parent RTTI external pair bound/nesting differs.");arguments=new byte[20];Buffer.BlockCopy(context,0,arguments,0,20);callOpen=true;}
      else {if(!callOpen||captured!=pairs*2+1)throw new InvalidDataException("Parent RTTI return lacks its captured call.");for(int i=0;i<20;i++)if(arguments[i]!=context[i])throw new InvalidDataException("Parent RTTI external arguments changed across its call.");}lastEndpointDebugOrdinal=debugOrdinal;
    }
    public void CommitEndpoint(bool entry) {if(!callOpen||captured!=(entry?pairs*2:pairs*2+1))throw new InvalidDataException("Parent RTTI endpoint commit differs.");captured++;if(!entry){pairs++;callOpen=false;}}
    public void RequireComplete(int snapshots) {if(!selected||stage!=10||!closed||windowOpen||callOpen||!auxiliaryPublished||mapChecks!=3||captured!=pairs*2||pairs>4||snapshots!=13+captured)throw new InvalidDataException("Parent RTTI capture lacks complete original checkpoints and matched scoped external snapshots.");}
  }
  public sealed class ContainedRangeView {
    public int ownerIndex, dataOffset, length;
    public byte[] data;
  }
  public sealed class ContainedRangeStorage {
    public long logicalBytes, backingBytes;
    public int[] owners;
    public ContainedRangeView[] views;
  }
  public sealed class HeldForceDecision {
    public int participantIndex, scalar;
    public uint body;
    public string bodySha256, planSha256;
    public byte[] original, replacement;
    public int[] normal;
  }
  public sealed class Options {
    public int schemaVersion = 1;
    public string executablePath;
    public string workingDirectory;
    public string[] arguments = new string[0];
    public string expectedSha256;
    public string outputDirectory;
    public int maxDurationMs = 60000;
    public int maxEvents = 100000;
    public int maxSnapshots = 1000;
    public bool showWindow;
    public string redirectedDocumentsPath;
    public string redirectedShellFolderPath;
    public bool denyRegistryWrites;
    public bool denyChildProcesses;
    public bool denyPlayerMailslot;
    public string temporaryDirectory;
    public bool hideOwnedWindows;
    public MemoryRange foregroundWindowSource;
    public bool captureThreadsOnStop;
    public bool captureThreadEnvironment;
    public int stopThreadStackBytes = 128;
    public Breakpoint[] breakpoints = new Breakpoint[0];
    public MemoryRange[] ranges = new MemoryRange[0];
    public PhaseAction[] phaseActions = new PhaseAction[0];
    public PendingFrameObserver pendingFrameObserver;
    public ObservationActivation observationActivation;
    public OwnedWorkerObservation ownedWorkerObservation;
    public OwnedWorkerGainPair ownedWorkerGainPair;
    public OwnedWorkerGainWindow ownedWorkerGainWindow;
    public HeldForceInput heldForceInput;
    public ControlledRaceSettings controlledRaceSettings;
    public ParentRttiObservation parentRttiObservation;
  }
  public static class NativeDebugger {
    public const string ParentRttiCapability="scoped-parent-rtti-and-singleton-map-preflight-v1";
    public static string[] GetCapabilities(){return new string[]{ParentRttiCapability};}
    static bool SameRange(MemoryRange a,MemoryRange b) {
      return a!=null&&b!=null&&a.id==b.id&&a.address==b.address&&a.rva==b.rva&&a.baseRegister==b.baseRegister&&a.offset==b.offset&&a.length==b.length&&a.readableRegion==b.readableRegion&&a.maxRegionBytes==b.maxRegionBytes&&a.vectorStorage==b.vectorStorage&&a.maxVectorBytes==b.maxVectorBytes&&String.Join(",",a.dereferenceOffsets)==String.Join(",",b.dereferenceOffsets)&&(a.dereferenceMinimumValues==null?b.dereferenceMinimumValues==null:b.dereferenceMinimumValues!=null&&String.Join(",",a.dereferenceMinimumValues)==String.Join(",",b.dereferenceMinimumValues));
    }
    public static void ValidateParentRttiPolicy(Options o) {
      ParentRttiObservation p=o.parentRttiObservation;if(p==null)return;
      if(p.parentBreakpointId!="native-control-before"||p.beginBreakpointId!="native-control-after-auxiliary"||p.endBreakpointId!="native-control-after-cameras"||p.callBreakpointId!="native-parent-rtti-call"||p.returnBreakpointId!="native-parent-rtti-return"||p.maxPairs!=4||p.maxSnapshots!=8||o.maxSnapshots!=21||o.maxDurationMs!=90000||o.maxEvents!=1000000||!o.captureThreadEnvironment||o.ranges.Length!=0||o.pendingFrameObserver!=null||o.observationActivation!=null||o.ownedWorkerObservation!=null||o.ownedWorkerGainPair!=null||o.ownedWorkerGainWindow!=null||o.heldForceInput!=null||o.controlledRaceSettings!=null||o.breakpoints.Length!=15||o.phaseActions.Length!=3)throw new InvalidDataException("Parent RTTI requires its exact separate bounded parent policy.");
      ParentRttiMapPreflight map=p.singletonMapPreflight;
      if(map==null||map.rootRva!="0x2efb38"||map.dereferenceOffsets==null||String.Join(",",map.dereferenceOffsets)!="0,0x7c"||map.fixedHeadRangeId!="late-singleton-candidate-viewport-map-head"||map.regionRangeId!="late-singleton-candidate-viewport-map-region"||map.maxRegionBytes!=16*1024*1024||map.breakpointIds==null||String.Join(",",map.breakpointIds)!="native-control-before,native-control-after-cameras,native-control-after-world-effects")throw new InvalidDataException("Parent RTTI singleton map preflight policy differs.");
      if(!o.denyRegistryWrites||!o.denyChildProcesses||!o.denyPlayerMailslot||!o.hideOwnedWindows||!o.captureThreadsOnStop||o.stopThreadStackBytes!=128||o.showWindow||String.Join(",",o.arguments)!="/windowed,/width,800,/height,600"||!String.Equals(o.expectedSha256,"c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5",StringComparison.OrdinalIgnoreCase)||!SameRange(o.foregroundWindowSource,new MemoryRange{id="owned-application-hwnd",rva="0x2efb38",dereferenceOffsets=new string[]{"0"},offset="4",length=4}))throw new InvalidDataException("Parent RTTI original owned/security startup policy differs.");
      string[] ids={"launcher-policy","graphics-policy","before-device-creation","native-control-before","native-control-after","native-control-after-ai","native-control-after-physics","native-control-after-attachments","native-control-after-recovery","native-control-after-drive","native-control-after-auxiliary","native-control-after-cameras","native-control-after-world-effects","native-parent-rtti-call","native-parent-rtti-return"};
      uint[] sites={0x42890,0x35be,0x112a30,0x50e50,0x749e0,0x50f18,0x74b1e,0x5101c,0x51021,0x5109c,0x510ef,0x51111,0x51120,0x2d86,0x2d8b};
      int? skip=o.breakpoints[3].skipMatchingHits;if(!skip.HasValue||skip.Value<0)throw new InvalidDataException("Parent RTTI selected skip window differs.");
      MemoryRange fixedHead=new MemoryRange{id=map.fixedHeadRangeId,rva="0x2efb38",dereferenceOffsets=new string[]{"0","0x7c"},dereferenceMinimumValues=new int[]{1,1},length=100},region=new MemoryRange{id=map.regionRangeId,rva="0x2efb38",dereferenceOffsets=new string[]{"0","0x7c"},readableRegion=true,maxRegionBytes=16*1024*1024};
      int stackBefore=0;
      for(int i=0;i<ids.Length;i++) {
        Breakpoint b=o.breakpoints[i];if(b.id!=ids[i]||Number(b.rva)!=sites[i]||!String.IsNullOrEmpty(b.address)||b.service!=null||b.stopAfterHits!=(i==12?1:0))throw new InvalidDataException("Parent RTTI extra/reordered/moved/stopping site differs.");
        HashSet<string> rangeIds=new HashSet<string>();foreach(MemoryRange r in b.ranges)if(!rangeIds.Add(r.id))throw new InvalidDataException("Parent RTTI duplicated range id.");
        if(i>=3&&i<=12){CaptureCondition g=b.captureWhen;if(g==null||g.equalsBytesHex!="04000000"||!SameRange(g.range,new MemoryRange{id="active-race-phase",rva="0x1ecb1c",dereferenceOffsets=new string[]{"0"},offset="0x57c",length=4})||b.skipMatchingHits!=skip)throw new InvalidDataException("Parent RTTI actual phase/skip checkpoints differ.");MemoryRange stack=Array.Find(b.ranges,delegate(MemoryRange r){return r.id=="frame-stack";});int depth=stack==null?0:checked((int)-Offset(stack.offset));if(stack==null||stack.baseRegister!="esp"||stack.address!=null||stack.rva!=null||stack.dereferenceOffsets.Length!=0||stack.readableRegion||stack.vectorStorage||depth<4||depth>65536||stack.length!=depth+32||i>3&&depth!=stackBefore)throw new InvalidDataException("Parent RTTI full parent stack bounds differ.");stackBefore=depth;}
        else if(b.captureWhen!=null||b.skipMatchingHits.HasValue)throw new InvalidDataException("Parent RTTI startup/external sites cannot be filtered/skipped.");
        bool wantsMap=Array.IndexOf(map.breakpointIds,b.id)>=0;MemoryRange[] observed=Array.FindAll(b.ranges,delegate(MemoryRange r){return r.id==map.fixedHeadRangeId||r.id==map.regionRangeId;});if(wantsMap?(observed.Length!=2||!SameRange(observed[0],fixedHead)||!SameRange(observed[1],region)):observed.Length!=0)throw new InvalidDataException("Parent RTTI map observations/preflight points differ.");
        if(i>=13&&(b.ranges.Length!=3||!SameRange(b.ranges[0],new MemoryRange{id="native-parent-rtti-context",baseRegister="esp",length=52})||!SameRange(b.ranges[1],new MemoryRange{id="native-parent-rtti-camera-return",baseRegister="esp",offset="256",length=4})||!SameRange(b.ranges[2],new MemoryRange{id="native-parent-rtti-clock",rva="0x50a548",length=4})))throw new InvalidDataException("Parent RTTI exact external range ABI differs.");
      }
      MemoryRange[][] startup={new MemoryRange[]{new MemoryRange{id="launcher-skip",rva="0x2e66ec",length=4},new MemoryRange{id="launcher-config",rva="0x1ecefc",dereferenceOffsets=new string[]{"0"},offset="0x42c",length=10}},new MemoryRange[]{new MemoryRange{id="graphics-mode",rva="0x2e64a4",dereferenceOffsets=new string[]{"0"},offset="0x24",length=28}},new MemoryRange[]{new MemoryRange{id="presentation",baseRegister="ecx",offset="0x378",length=56},new MemoryRange{id="entry-stack",baseRegister="esp",length=32}}};
      for(int i=0;i<3;i++){if(o.breakpoints[i].ranges.Length!=startup[i].Length||o.phaseActions[i].breakpointId!=ids[i]||o.phaseActions[i].hit!=1||o.phaseActions[i].writes.Length!=(i==0?3:i==1?1:2))throw new InvalidDataException("Parent RTTI original startup action differs.");for(int j=0;j<startup[i].Length;j++)if(!SameRange(o.breakpoints[i].ranges[j],startup[i][j]))throw new InvalidDataException("Parent RTTI original startup observation differs.");}
      uint[] roots={0x2e66ec,0x1ecefc,0x1ecefc,0x2e64a4,0,0};int[] offsets={0,10,14,60,0x398,0x3a8};string[] replacements={"01000000","01","01","00","01000000","00000000"};int slot=0;
      foreach(PhaseAction a in o.phaseActions)foreach(MemoryWrite w in a.writes){bool chain=slot>=1&&slot<=3;if(w.address!=null||Number(w.rva)!=roots[slot]||(slot>=4?w.baseRegister!="ecx":w.baseRegister!=null)||Offset(w.offset)!=offsets[slot]||w.dereferenceOffsets.Length!=(chain?1:0)||chain&&Offset(w.dereferenceOffsets[0])!=0||BytesHex(ParseBytes(w.bytesHex))!=replacements[slot])throw new InvalidDataException("Parent RTTI undeclared startup/game write.");if(slot<4){string[] expected=slot==0?new string[]{"00000000","01000000"}:new string[]{"00","01"};if(w.expectedBytesHex!=null||w.expectedAnyBytesHex==null||w.expectedAnyBytesHex.Length!=2||w.expectedAnyBytesHex[0]!=expected[0]||w.expectedAnyBytesHex[1]!=expected[1])throw new InvalidDataException("Parent RTTI startup write guard differs.");}else if(w.expectedAnyBytesHex!=null||w.expectedBytesHex!=replacements[slot])throw new InvalidDataException("Parent RTTI device writes require exact no-op guards.");slot++;}
    }
    public static ParentRttiMapRead ReadParentRttiMapSource(uint mainBase,uint ownerTid,uint actualTid,Func<uint,int,byte[]> read) {
      if(ownerTid==0||actualTid!=ownerTid||read==null||mainBase==0||(ulong)mainBase+0x2efb3c>0x100000000UL)throw new InvalidDataException("Parent RTTI map source requires the owned main thread and actual image root.");
      ParentRttiMapRead p=new ParentRttiMapRead {rootAddress=Add(mainBase,0x2efb38)};p.rootBytes=read(p.rootAddress,4);if(p.rootBytes==null||p.rootBytes.Length!=4)throw new InvalidDataException("Parent RTTI singleton DWORD is unobserved.");p.appAddress=BitConverter.ToUInt32(p.rootBytes,0);
      if(p.appAddress==0||(ulong)p.appAddress+0x80>0x100000000UL)throw new InvalidDataException("Parent RTTI actual singleton is null/overflow; no map range resolved.");p.headSlotAddress=Add(p.appAddress,0x7c);p.headBytes=read(p.headSlotAddress,4);if(p.headBytes==null||p.headBytes.Length!=4)throw new InvalidDataException("Parent RTTI actual map-head DWORD is unobserved.");p.headAddress=BitConverter.ToUInt32(p.headBytes,0);
      if(p.headAddress==0||(ulong)p.headAddress+100>0x100000000UL)throw new InvalidDataException("Parent RTTI actual map head is null/overflow; no map range resolved.");return p;
    }
    public static ParentRttiEndpointRead ReadParentRttiEndpoint(ParentRttiProgress state,uint mainBase,uint actualTid,uint esp,Func<uint,int,byte[]> read) {
      if(state==null||read==null)throw new ArgumentNullException("state/read");if(!state.CanRead(actualTid,esp))return null;
      ParentRttiEndpointRead p=new ParentRttiEndpointRead {clockBytes=read(Add(mainBase,0x50a548),4)};if(p.clockBytes==null||p.clockBytes.Length!=4||BitConverter.ToUInt32(p.clockBytes,0)!=state.clock)throw new InvalidDataException("Parent RTTI scoped logical clock changed before range reads.");
      p.context=read(esp,52);p.cameraReturn=read(Add(esp,256),4);p.singletonBytes=read(Add(mainBase,0x2efb38),4);
      if(p.context==null||p.context.Length!=52||p.cameraReturn==null||p.cameraReturn.Length!=4||p.singletonBytes==null||p.singletonBytes.Length!=4)throw new InvalidDataException("Parent RTTI actual scoped argument extent is unobserved.");
      p.commonCaller=BitConverter.ToUInt32(p.context,40)==Add(mainBase,0x1a0c8)&&BitConverter.ToUInt32(p.context,44)==1&&BitConverter.ToUInt32(p.context,48)==state.parentEsp-60&&BitConverter.ToUInt32(p.cameraReturn,0)==Add(mainBase,0x51107);return p;
    }
    public static void ValidateParentRttiDeferredCode(bool call,byte original,bool armed,int rawHits,int matchingHits,int captureHits,byte[] code) {
      string expected=call?"e89f651600":"83c414";if(armed||rawHits!=0||matchingHits!=0||captureHits!=0||code==null||code.Length!=expected.Length/2||original!=code[0]||BytesHex(code)!=expected)throw new InvalidDataException("Parent RTTI deferred original code/counters changed before selected activation.");
    }
    public static void ValidateHeldForcePolicy(Options o) {
      if (o.heldForceInput == null) return;
      ValidateHeldForceStartup(o);
      if(o.heldForceInput.shareContainedRanges&&o.controlledRaceSettings==null)throw new InvalidDataException("Contained held storage requires the separately controlled-race profile.");
      PendingFrameObserver f = o.pendingFrameObserver;
      if (o.heldForceInput.breakpointId != "native-frame-before" || o.heldForceInput.maxHoldMs != 20000 || o.maxDurationMs != 90000 || o.maxEvents != 1000000 || o.maxSnapshots != (o.controlledRaceSettings==null?70:71) || !o.captureThreadEnvironment || o.observationActivation != null || o.ownedWorkerObservation != null || o.ownedWorkerGainPair != null || o.ownedWorkerGainWindow != null || o.ranges.Length != 0 || f == null || f.beforeBreakpointId != "native-frame-before" || f.afterBreakpointId != "native-frame-after" || f.eventBreakpointId != "native-dispatch-entry" || f.maxCandidateFrames != 1 || f.maxEventSnapshots != 64 || f.maxPendingBytes != 128 * 1024 * 1024 || f.nestedBreakpointIds.Length != 0) throw new InvalidDataException("Held force requires its separate exact one-frame bounded policy.");
      foreach (string id in new string[] {f.beforeBreakpointId, f.afterBreakpointId, f.eventBreakpointId}) {
        Breakpoint b = Array.Find(o.breakpoints, delegate(Breakpoint x) {return x.id == id;});
        uint site = id == f.beforeBreakpointId ? 0x749e0u : id == f.afterBreakpointId ? 0x74b1eu : 0x74bb0u;
        if (b == null || Number(b.rva) != site || !String.IsNullOrEmpty(b.address) || b.service != null) throw new InvalidDataException("Held force boundary differs.");
        if(id != f.eventBreakpointId) {
          CaptureCondition gate=b.captureWhen;MemoryRange g=gate==null?null:gate.range;
          if(g==null||Number(g.rva)!=0x1ecb1c||!String.IsNullOrEmpty(g.address)||!String.IsNullOrEmpty(g.baseRegister)||g.dereferenceOffsets.Length!=1||Offset(g.dereferenceOffsets[0])!=0||Offset(g.offset)!=0x57c||g.length!=4||g.readableRegion||g.vectorStorage||g.dereferenceMinimumValues!=null||gate.equalsBytesHex!="04000000"||!b.skipMatchingHits.HasValue||b.skipMatchingHits.Value<0||b.stopAfterHits!=(id==f.afterBreakpointId?1:0))throw new InvalidDataException("Held force active-phase/skip/return policy differs.");
          MemoryRange stack=Array.Find(b.ranges,delegate(MemoryRange r){return r.id=="frame-stack";});
          if(stack==null||stack.baseRegister!="esp"||!String.IsNullOrEmpty(stack.address)||!String.IsNullOrEmpty(stack.rva)||stack.dereferenceOffsets.Length!=0||Offset(stack.offset)!=-4096||stack.length!=4100||stack.readableRegion)throw new InvalidDataException("Held force requires its actual bounded frame stack.");
          MemoryRange[] banks=Array.FindAll(b.ranges,delegate(MemoryRange r){return r.id=="active-sound-bank-storage"||r.id=="active-sound-bank-region";});
          if(banks.Length!=1||banks[0].id=="active-sound-bank-storage"&&!IsHeldBankVector(banks[0]))throw new InvalidDataException("Held force exact bank-vector descriptor differs.");
          MemoryRange bank=banks[0];
          if(bank.id=="active-sound-bank-region"&&(Number(bank.rva)!=0x2f2414||!bank.readableRegion||bank.maxRegionBytes!=64*1024*1024||bank.vectorStorage||bank.maxVectorBytes!=0||bank.length!=0||!String.IsNullOrEmpty(bank.address)||!String.IsNullOrEmpty(bank.baseRegister)||bank.dereferenceOffsets.Length!=1||Offset(bank.dereferenceOffsets[0])!=0||Offset(bank.offset)!=0||bank.dereferenceMinimumValues!=null))throw new InvalidDataException("Held force legacy bank transport differs.");
          MemoryRange header=Array.Find(b.ranges,delegate(MemoryRange r){return r.id=="sound-owner-vector-roots";});
          if(header==null||Number(header.rva)!=0x2f2414||header.length!=12||header.readableRegion||header.vectorStorage||!String.IsNullOrEmpty(header.address)||!String.IsNullOrEmpty(header.baseRegister)||header.dereferenceOffsets.Length!=0||Offset(header.offset)!=0)throw new InvalidDataException("Held force requires its independent actual bank header.");
          foreach(MemoryRange r in b.ranges)if(r.dereferenceMinimumValues!=null||r.vectorStorage&&!IsHeldBankVector(r))throw new InvalidDataException("Held force forbids other vectors/guarded transports.");
        } else if(b.captureWhen!=null||b.skipMatchingHits.HasValue||b.stopAfterHits!=0)throw new InvalidDataException("Held force must observe its complete dispatcher stream.");
        foreach (PhaseAction a in o.phaseActions) if (a.breakpointId == id) throw new InvalidDataException("Held force cannot combine observer phase writes.");
      }
      Breakpoint before=Array.Find(o.breakpoints,delegate(Breakpoint b){return b.id==f.beforeBreakpointId;}),after=Array.Find(o.breakpoints,delegate(Breakpoint b){return b.id==f.afterBreakpointId;});
      if(before.skipMatchingHits!=after.skipMatchingHits)throw new InvalidDataException("Held force entry/return windows differ.");
    }
    static bool IsHeldBankVector(MemoryRange r) {
      return r.id=="active-sound-bank-storage"&&Number(r.rva)==0x2f2414&&r.vectorStorage&&r.maxVectorBytes==65536&&String.IsNullOrEmpty(r.address)&&String.IsNullOrEmpty(r.baseRegister)&&r.dereferenceOffsets.Length==0&&Offset(r.offset)==0&&r.length==0&&!r.readableRegion&&r.maxRegionBytes==0&&r.dereferenceMinimumValues==null;
    }
    public static VectorStorageInfo ValidateHeldBankHeader(byte[] header,byte[] independent,uint headerAddress,uint expectedHeaderAddress) {
      if(header==null||independent==null||header.Length!=12||independent.Length!=12||BytesHex(header)!=BytesHex(independent)||headerAddress==0||headerAddress!=expectedHeaderAddress||(ulong)headerAddress+12>0x100000000UL)throw new InvalidDataException("Held bank vector lacks independent actual12-byte header proof.");
      VectorStorageInfo v=DecodeVectorStorage(header,65536);
      if(v.begin%4!=0||(v.end-v.begin)%4!=0||(v.capacity-v.begin)%4!=0)throw new InvalidDataException("Held bank vector is not a native DWORD pointer vector.");
      return v;
    }
    public static long HeldForceRequiredBytes(long preBytes,long eventBytes) {
      if(preBytes<720||eventBytes<720)throw new InvalidDataException("Held force snapshot footprint is incomplete.");
      return checked(preBytes*3+eventBytes*64);
    }
    static void ValidateHeldForceStartup(Options o) {
      string[] ids={"launcher-policy","graphics-policy","before-device-creation","native-frame-before","native-frame-after","native-dispatch-entry"};
      uint[] sites={0x42890,0x35be,0x112a30};
      if(o.breakpoints.Length!=(o.controlledRaceSettings==null?6:7)||o.phaseActions.Length!=3)throw new InvalidDataException("Held force exact startup/site/write whitelist differs.");
      for(int i=0;i<6;i++)if(o.breakpoints[i].id!=ids[i])throw new InvalidDataException("Held force extra/reordered breakpoint site.");
      for(int i=0;i<3;i++)if(Number(o.breakpoints[i].rva)!=sites[i]||!String.IsNullOrEmpty(o.breakpoints[i].address)||o.breakpoints[i].captureWhen!=null||o.breakpoints[i].skipMatchingHits.HasValue||o.phaseActions[i].breakpointId!=ids[i]||o.phaseActions[i].hit!=1||o.phaseActions[i].writes.Length!=(i==0?3:i==1?1:2))throw new InvalidDataException("Held force startup action/site identity differs.");
      uint[] roots={0x2e66ec,0x1ecefc,0x1ecefc,0x2e64a4,0,0};int[] offsets={0,10,14,60,0x398,0x3a8};
      string[] replacements={"01000000","01","01","00","01000000","00000000"};int slot=0;
      foreach(PhaseAction a in o.phaseActions)foreach(MemoryWrite w in a.writes){
        bool chained=slot>=1&&slot<=3;
        if(!String.IsNullOrEmpty(w.address)||Number(w.rva)!=roots[slot]||(slot>=4?w.baseRegister!="ecx":!String.IsNullOrEmpty(w.baseRegister))||Offset(w.offset)!=offsets[slot]||w.dereferenceOffsets.Length!=(chained?1:0)||chained&&Offset(w.dereferenceOffsets[0])!=0||BytesHex(ParseBytes(w.bytesHex))!=replacements[slot])throw new InvalidDataException("Held force nonwhitelisted startup write/root.");
        if(slot<4){string[] expected=slot==0?new string[]{"00000000","01000000"}:new string[]{"00","01"};if(w.expectedBytesHex!=null||w.expectedAnyBytesHex==null||w.expectedAnyBytesHex.Length!=2||BytesHex(ParseBytes(w.expectedAnyBytesHex[0]))!=expected[0]||BytesHex(ParseBytes(w.expectedAnyBytesHex[1]))!=expected[1])throw new InvalidDataException("Held force startup expected-byte guards changed.");}
        else if(w.expectedAnyBytesHex!=null||w.expectedBytesHex==null||BytesHex(ParseBytes(w.expectedBytesHex))!=replacements[slot])throw new InvalidDataException("Held force device guards must remain exact no-op proofs.");
        slot++;
      }
    }
    public static void ValidateControlledRaceSettingsPolicy(Options o) {
      ControlledRaceSettings p=o.controlledRaceSettings;if(p==null)return;
      if(o.heldForceInput==null||p.breakpointId!="controlled-race-settings"||p.level<1||p.level>20||p.quality<0||p.quality>1||p.expectedTrackByte!=0||p.expectedQualityByte!=1||o.maxSnapshots!=71||!o.captureThreadEnvironment)throw new InvalidDataException("Controlled settings require their distinct held profile and exact input guards.");
      Breakpoint b=o.breakpoints[o.breakpoints.Length-1];
      if(b.id!=p.breakpointId||Number(b.rva)!=0x3e0c5||!String.IsNullOrEmpty(b.address)||b.captureWhen!=null||b.skipMatchingHits.HasValue||b.stopAfterHits!=0||b.ranges.Length!=13)throw new InvalidDataException("Controlled settings exact one-shot site differs.");
      string[] ids={"settings-config-root","settings-session-root","settings-config","settings-session-header","settings-session-runtime","settings-caller","settings-track-family","settings-track-local","settings-level-stem","settings-menu-id","settings-launch-latch","settings-main-state","settings-demo-deadline"};
      uint[] roots={0x1ecefc,0x1ecb1c,0x1ecefc,0x1ecb1c,0x1ecb1c,0,0x174760,0x17477c,0x2e6660,0x1ec138,0x2e6654,0x2e66c8,0x2e6aac};int[] offsets={0,0,0,0,0x54d,0,0,0,0,0,0,0,0},lengths={4,4,128,48,0xd3,28,20,20,260,4,4,8,4};
      for(int i=0;i<ids.Length;i++) {
        MemoryRange r=b.ranges[i];bool chain=i>=2&&i<=4;
        if(r.id!=ids[i]||Number(r.rva)!=roots[i]||!String.IsNullOrEmpty(r.address)||(i==5?r.baseRegister!="esp":!String.IsNullOrEmpty(r.baseRegister))||Offset(r.offset)!=offsets[i]||r.length!=lengths[i]||r.readableRegion||r.vectorStorage||r.maxRegionBytes!=0||r.maxVectorBytes!=0||r.dereferenceMinimumValues!=null||r.dereferenceOffsets.Length!=(chain?1:0)||chain&&Offset(r.dereferenceOffsets[0])!=0)throw new InvalidDataException("Controlled settings observation descriptor differs.");
      }
      foreach(PhaseAction a in o.phaseActions)if(a.breakpointId==p.breakpointId)throw new InvalidDataException("Controlled settings cannot combine generic phase writes.");
      foreach(string id in new string[]{"native-frame-before","native-frame-after"}) {
        Breakpoint frame=Array.Find(o.breakpoints,delegate(Breakpoint x){return x.id==id;});
        for(int i=6;i<9;i++){MemoryRange r=Array.Find(frame.ranges,delegate(MemoryRange x){return x.id==ids[i];});if(r==null||Number(r.rva)!=roots[i]||r.length!=lengths[i]||!String.IsNullOrEmpty(r.address)||!String.IsNullOrEmpty(r.baseRegister)||r.dereferenceOffsets.Length!=0||Offset(r.offset)!=0||r.vectorStorage||r.readableRegion||r.dereferenceMinimumValues!=null)throw new InvalidDataException("Controlled settings require exact captured native output/table ranges.");}
      }
    }
    //43e0c5 before MOV EAX,[5ecefc]. No selector/roster/RNG output is supplied.
    public static byte[] ControlledRaceSettingsReplacement(ControlledRaceSettings p,uint mainBase,uint ownerTid,uint tid,uint configAddress,uint sessionAddress,byte[] config,byte[] stack,byte[] context,byte[] frontend) {
      if(p==null||p.breakpointId!="controlled-race-settings"||p.level<1||p.level>20||p.quality<0||p.quality>1||p.expectedTrackByte!=0||p.expectedQualityByte!=1||ownerTid==0||tid!=ownerTid||mainBase==0||(ulong)mainBase+0x51ffff>UInt32.MaxValue||configAddress==0||sessionAddress==0||(ulong)configAddress+128>0x100000000UL||(ulong)sessionAddress+0x620>0x100000000UL||config==null||config.Length!=128||stack==null||stack.Length!=28||context==null||context.Length!=716)throw new InvalidDataException("Controlled settings actual roots/thread/extents differ.");
      uint esp=BitConverter.ToUInt32(context,196),eax=BitConverter.ToUInt32(context,176),ecx=BitConverter.ToUInt32(context,172);
      if(frontend==null||frontend.Length!=20||BitConverter.ToUInt32(frontend,0)!=4||BitConverter.ToUInt32(frontend,4)!=0||BitConverter.ToUInt32(frontend,8)!=1||BitConverter.ToUInt32(frontend,16)==0)throw new InvalidDataException("Controlled settings natural idle frontend state differs.");
      if((ulong)configAddress<(ulong)sessionAddress+0x620&&(ulong)sessionAddress<(ulong)configAddress+128||(ulong)configAddress<(ulong)esp+28&&(ulong)esp<(ulong)configAddress+128)throw new InvalidDataException("Controlled settings configuration aliases protected session/stack.");
      if(BitConverter.ToUInt32(context,184)!=Add(mainBase,0x3e0c5)||BitConverter.ToUInt32(context,164)!=0||ecx>19||eax!=ecx||esp<4096||(ulong)esp+28>0x100000000UL||BitConverter.ToUInt32(stack,16)!=10||BitConverter.ToUInt32(stack,20)!=Add(mainBase,0x3dae8)||BitConverter.ToUInt32(stack,24)>3||config[0x14]!=0||config[0x15]!=10||config[0x0b]!=p.expectedTrackByte||config[0x31]!=p.expectedQualityByte)throw new InvalidDataException("Controlled settings caller/register/mode/original-byte guard differs.");
      byte[] next=(byte[])config.Clone();next[0x0b]=(byte)p.level;next[0x31]=(byte)p.quality;return next;
    }
    public static void ValidateControlledRaceSettingsTransition(byte[] before,byte[] after,byte[] expected,byte[] contextBefore,byte[] contextAfter) {
      if(before==null||after==null||expected==null||before.Length!=128||after.Length!=128||expected.Length!=128||contextBefore==null||contextAfter==null||contextBefore.Length!=716||contextAfter.Length!=716||Digest(contextBefore)!=Digest(contextAfter)||Digest(after)!=Digest(expected))throw new InvalidDataException("Controlled settings post-input/context verification differs.");
      for(int i=0;i<128;i++)if(i!=0x0b&&i!=0x31&&before[i]!=after[i])throw new InvalidDataException("Controlled settings changed a non-input byte.");
    }
    public static void ValidateControlledRaceSettingsOutputs(ControlledRaceSettings p,byte[] header,byte[] runtime,byte[] family,byte[] local,byte[] stem) {
      if(p==null||p.level<1||p.level>20||p.quality<0||p.quality>1||header==null||header.Length!=48||runtime==null||runtime.Length!=0xd3||family==null||family.Length!=20||local==null||local.Length!=20||stem==null||stem.Length!=260)throw new InvalidDataException("Controlled settings native output extents differ.");
      int index=p.level-1,nul=Array.IndexOf(stem,(byte)0);string expected=(p.quality==1?"high":"low")+"/lev"+p.level.ToString(CultureInfo.InvariantCulture);
      if(runtime[0x579-0x54d]!=index||header[0x0e]!=family[index]||header[0x0f]!=local[index]||nul<0||Encoding.ASCII.GetString(stem,0,nul).Replace('\\','/')!=expected)throw new InvalidDataException("Controlled settings original track/family/local/stem outputs differ.");
    }
    static int HeldInteger(string value) {
      int result; if (!Int32.TryParse(value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out result) || result.ToString(CultureInfo.InvariantCulture) != value) throw new InvalidDataException("Invalid canonical held-force integer."); return result;
    }
    static bool HeldHex(string value, int bytes) {
      if (value == null || value.Length != bytes * 2) return false;
      foreach (char c in value) if (!(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')) return false;
      return true;
    }
    public static HeldForceDecision ParseHeldForceDecision(string text, string token, string requestSha256) {
      if (text == null || text.Length > 4096 || text.IndexOf('\r') >= 0) throw new InvalidDataException("Held force decision length/encoding.");
      string[] v = text.Split('\n');
      if (v.Length != 12 || v[0] != "ROLLCAGE_HELD_FORCE_V1" || v[1] != token || !HeldHex(v[1],16) || v[2] != requestSha256 || !HeldHex(v[2],32) || v[11] != "" || !HeldHex(v[5],32) || !HeldHex(v[6],12) || !HeldHex(v[7],12) || !HeldHex(v[10],32)) throw new InvalidDataException("Held force request/preimage/proof identity.");
      uint body; if (!UInt32.TryParse(v[4], NumberStyles.None, CultureInfo.InvariantCulture, out body) || body == 0 || body.ToString(CultureInfo.InvariantCulture) != v[4]) throw new InvalidDataException("Held force body integer.");
      HeldForceDecision d = new HeldForceDecision {participantIndex = HeldInteger(v[3]), body = body, bodySha256 = v[5], original = ParseBytes(v[6]), replacement = ParseBytes(v[7]), scalar = HeldInteger(v[9]), planSha256 = v[10]};
      string[] n = v[8].Split(','); if (d.participantIndex < 0 || d.participantIndex >= 6 || n.Length != 3 || !(Math.Abs((long)d.scalar) == 4 * 65536 || Math.Abs((long)d.scalar) == 16 * 65536 || Math.Abs((long)d.scalar) == 64 * 65536)) throw new InvalidDataException("Held force participant/normal/scalar bounds.");
      d.normal = new int[3]; bool nonzero = false;
      for (int i = 0; i < 3; i++) {
        d.normal[i] = HeldInteger(n[i]); nonzero |= d.normal[i] != 0;
        long next = BitConverter.ToInt32(d.original,i*4) + (((long)d.normal[i] * d.scalar) >> 16);
        if (Math.Abs((long)d.normal[i]) > 65536 || Math.Abs(next) > 0x1000000 || next != BitConverter.ToInt32(d.replacement,i*4)) throw new InvalidDataException("Held force checked arithmetic/bounds.");
      }
      if (!nonzero || BytesHex(d.original) == BytesHex(d.replacement)) throw new InvalidDataException("Held force must be a bounded nonzero input.");
      return d;
    }
    public static bool HeldForceDeadlineExpired(long started, long now, int maxDurationMs) {
      if (started < 0 || now < started || maxDurationMs != 90000) throw new InvalidDataException("Invalid held-force monotonic clock/bound.");
      return now-started >= 20000 || now >= maxDurationMs;
    }
    public static void ValidateHeldForceBody(HeldForceDecision d, byte[] bytes, uint root, uint arena, uint used, byte[] physical) {
      if (d == null || bytes == null || bytes.Length != 0x3e78 || root != d.body || arena == 0 || used == 0 || (ulong)arena+used > 0x100000000UL || root < arena || ((ulong)root-arena)%128!=0 || (ulong)root+0x3e78>(ulong)arena+used || (BitConverter.ToUInt32(bytes,0)&511)!=3 || Digest(bytes)!=d.bodySha256 || physical==null || physical.Length<8 || physical.Length>96*4 || physical.Length%4!=0 || BitConverter.ToUInt32(physical,physical.Length-4)!=0) throw new InvalidDataException("Held force live participant/body/list preimage differs.");
      bool found=false;for(int i=0;i<physical.Length-4;i+=4)found|=BitConverter.ToUInt32(physical,i)==root;
      byte[] original=new byte[12];Array.Copy(bytes,0x74,original,0,12);
      if(!found||BytesHex(original)!=BytesHex(d.original))throw new InvalidDataException("Held force body is not physically owned or force preimage changed.");
    }
    const uint Break = 0x80000003, Step = 0x80000004, Wow64Break = 0x4000001f, Wow64Step = 0x4000001e, Continue = 0x10002, NotHandled = 0x80010001;
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
      public uint cb; public string reserved, desktop, title; public uint x, y, width, height, charsX, charsY, fill, flags;
      public ushort show, reserved2; public IntPtr reservedBytes, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string exe, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string cwd, ref Startup startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WaitForDebugEvent(IntPtr data, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ContinueDebugEvent(uint pid, uint tid, uint status);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr length, out UIntPtr read);
    [DllImport("kernel32.dll", SetLastError = true)] static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, IntPtr information, UIntPtr length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr length, out UIntPtr written);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool VirtualProtectEx(IntPtr process, IntPtr address, UIntPtr size, uint protection, out uint old);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool FlushInstructionCache(IntPtr process, IntPtr address, UIntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64GetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64GetThreadSelectorEntry(IntPtr thread, uint selector, [Out] byte[] descriptor);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetThreadSelectorEntry(IntPtr thread, uint selector, [Out] byte[] descriptor);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool Wow64SetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsWow64Process(IntPtr process, out bool wow64);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandle(IntPtr handle, StringBuilder path, uint length, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr sourceHandle, IntPtr targetProcess, out IntPtr targetHandle, uint access, bool inherit, uint options);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeThread(IntPtr thread, out uint code);
    [DllImport("user32.dll", EntryPoint = "GetForegroundWindow")] static extern IntPtr ReadForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    //The caller supplies only owned copies of CREATE_PROCESS/CREATE_THREAD
    //handles (or its own PROCESS_INFORMATION handle before the first event).
    //An exit code (including STILL_ACTIVE/259) cannot prove termination: a
    //zero-time wait must observe the actual thread object as signaled.
    public static ThreadTerminationObservation ObserveOwnedThreadTermination(IntPtr thread) {
      ThreadTerminationObservation result = new ThreadTerminationObservation();
      result.waitResult = WaitForSingleObject(thread, 0);
      if (result.waitResult == UInt32.MaxValue) result.waitWin32Error = Marshal.GetLastWin32Error();
      result.terminated = result.waitResult == 0;
      uint code;
      result.exitCodeAvailable = GetExitCodeThread(thread, out code);
      if (result.exitCodeAvailable) result.exitCode = code;
      else result.exitCodeWin32Error = Marshal.GetLastWin32Error();
      return result;
    }
    //True means this adapter changed one suspend count; false means only a
    //proven terminated thread was skipped. Never close/remove a tracked handle
    //here: its EXIT_THREAD_DEBUG_EVENT still owns that lifetime transition.
    public static bool ChangeTrackedThreadSuspension(IntPtr thread, uint pid, uint tid, bool resume, string operation, Action<Dictionary<string, object>> emit, out uint previousCount) {
      previousCount = resume ? ResumeThread(thread) : SuspendThread(thread);
      if (previousCount != UInt32.MaxValue) return true;
      int originalError = Marshal.GetLastWin32Error();
      ThreadTerminationObservation state = ObserveOwnedThreadTermination(thread);
      Dictionary<string, object> record = Record("type", "owned-thread-lifecycle", "pid", pid, "tid", tid, "operation", operation, "resume", resume,
        "win32Error", originalError, "waitMilliseconds", 0, "waitResult", Hex(state.waitResult), "waitWin32Error", state.waitWin32Error,
        "exitCodeAvailable", state.exitCodeAvailable, "exitCode", state.exitCodeAvailable ? (object)Hex(state.exitCode) : null, "exitCodeWin32Error", state.exitCodeWin32Error,
        "terminated", state.terminated, "disposition", state.terminated ? "terminated-handle-retained-until-exit-event" : "unproven-failure",
        "proof", state.terminated ? "zero-time-wait-object-signaled" : "no-signaled-thread-proof");
      emit(record);
      if (state.terminated) return false;
      throw new Win32Exception(originalError, operation + " failed for owned TID " + tid.ToString(CultureInfo.InvariantCulture) + "; Win32 error=" + originalError.ToString(CultureInfo.InvariantCulture) + "; zero-time wait=" + Hex(state.waitResult) + ", wait Win32 error=" + state.waitWin32Error.ToString(CultureInfo.InvariantCulture) + ", exit code=" + (state.exitCodeAvailable ? Hex(state.exitCode) : "unavailable"));
    }
    //ContinueDebugEvent closes the system's event handle on EXIT_THREAD.
    //Never close that borrowed handle ourselves: it can be reused before the
    //system's close. A separate same-access copy owns the tracking lifetime.
    public static IntPtr DuplicateOwnedDebugThreadHandle(IntPtr source, uint pid, uint tid, Action<Dictionary<string, object>> emit) {
      if (source == IntPtr.Zero || tid == 0 || pid == 0) throw new InvalidDataException("Owned debug thread duplication needs its actual handle and process/thread identity.");
      IntPtr duplicate, current = GetCurrentProcess();
      Check(DuplicateHandle(current, source, current, out duplicate, 0, false, 2), "Duplicate owned debug thread handle");
      if (duplicate == IntPtr.Zero || duplicate == source) throw new InvalidDataException("Owned debug thread tracking requires a distinct handle copy.");
      try {
        emit(Record("type", "owned-debug-thread-handle", "pid", pid, "tid", tid, "sourceHandle", HandleHex(source), "trackingHandle", HandleHex(duplicate), "sameAccess", true, "eventHandleOwnership", "system-closes-on-exit-continuation", "trackingHandleOwnership", "debugger-copy"));
        return duplicate;
      } catch {CloseHandle(duplicate); throw;}
    }
    static uint TrackedThreadId(Dictionary<uint, IntPtr> threads, IntPtr handle) {
      foreach (KeyValuePair<uint, IntPtr> thread in threads) if (thread.Value == handle) return thread.Key;
      throw new InvalidDataException("Owned suspension lost its tracked thread identity.");
    }
    //Windows can queue another owned thread's INT3 before our SuspendThread
    //increment takes effect. Rewind only a thread which is still held by our
    //own increment; it will re-trap after the pending instruction is stepped
    //and its breakpoint restored. No observation/counter/action is consumed.
    public static uint DeferredBreakpointRewindAddress(uint tid, uint pendingTid, bool trackedThread, bool ownSuspension, bool armed, bool pendingSite, uint address, uint contextEip, byte currentByte, byte originalByte) {
      if (tid == 0 || pendingTid == 0 || tid == pendingTid || !trackedThread || !ownSuspension) throw new InvalidDataException("Deferred owned breakpoint requires a different tracked thread held by our suspension increment.");
      if (armed == pendingSite || originalByte == 0xcc) throw new InvalidDataException("Deferred owned breakpoint has an inconsistent armed/pending-site state.");
      if (address == UInt32.MaxValue || contextEip != address + 1) throw new InvalidDataException("Deferred owned breakpoint requires its exact stopped post-INT3 EIP.");
      if (currentByte != (armed ? (byte)0xcc : originalByte)) throw new InvalidDataException("Deferred owned breakpoint code differs from its actual armed or pending original byte.");
      return address;
    }

    static uint Number(string value) {
      if (String.IsNullOrEmpty(value)) return 0;
      return value.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? UInt32.Parse(value.Substring(2), NumberStyles.HexNumber) : UInt32.Parse(value, CultureInfo.InvariantCulture);
    }
    static long Offset(string value) {
      if (String.IsNullOrEmpty(value)) return 0;
      return value.StartsWith("-", StringComparison.Ordinal) ? -(long)Number(value.Substring(1)) : Number(value);
    }
    static uint Add(uint address, long offset) {
      long sum = (long)address + offset;
      if (sum < 0 || sum > UInt32.MaxValue) throw new InvalidDataException("Address arithmetic exceeds x86 range.");
      return (uint)sum;
    }
    static string Hex(uint value) { return "0x" + value.ToString("x8"); }
    static string HandleHex(IntPtr value) {return "0x" + unchecked((ulong)value.ToInt64()).ToString(IntPtr.Size == 8 ? "x16" : "x8");}
    static IntPtr Pointer(uint value) { return IntPtr.Size == 8 ? new IntPtr((long)value) : new IntPtr(unchecked((int)value)); }
    static uint U32(IntPtr data, int offset) { return unchecked((uint)Marshal.ReadInt32(data, offset)); }
    static IntPtr Ptr(IntPtr data, int offset) { return Marshal.ReadIntPtr(data, offset); }
    static void Check(bool value, string operation) { if (!value) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); }
    static byte[] Bytes(IntPtr process, uint address, int length) {
      byte[] data = new byte[length]; UIntPtr actual;
      Check(ReadProcessMemory(process, Pointer(address), data, (UIntPtr)(uint)length, out actual), "ReadProcessMemory " + Hex(address));
      if (actual.ToUInt64() != (ulong)length) throw new IOException("Partial memory read at " + Hex(address));
      return data;
    }
    // Decode the host ABI explicitly: native x86 MBI is 28 bytes, x64 is 48.
    // The x64 PartitionId/alignment bytes leave RegionSize at offset 24.
    public static MemoryRegionInfo DecodeMemoryRegion(byte[] information, int pointerBytes) {
      int length = pointerBytes == 8 ? 48 : pointerBytes == 4 ? 28 : 0;
      if (length == 0 || information == null || information.Length != length) throw new InvalidDataException("Unexpected MEMORY_BASIC_INFORMATION ABI/length.");
      return new MemoryRegionInfo {
        baseAddress = pointerBytes == 8 ? BitConverter.ToUInt64(information, 0) : BitConverter.ToUInt32(information, 0),
        allocationBaseAddress = pointerBytes == 8 ? BitConverter.ToUInt64(information, 8) : BitConverter.ToUInt32(information, 4),
        allocationProtection = BitConverter.ToUInt32(information, pointerBytes * 2),
        regionSize = pointerBytes == 8 ? BitConverter.ToUInt64(information, 24) : BitConverter.ToUInt32(information, 12),
        state = BitConverter.ToUInt32(information, pointerBytes == 8 ? 32 : 16),
        protection = BitConverter.ToUInt32(information, pointerBytes == 8 ? 36 : 20),
        type = BitConverter.ToUInt32(information, pointerBytes == 8 ? 40 : 24)
      };
    }
    public static void ValidateReadableRegion(uint root, MemoryRegionInfo region, int maxRegionBytes) {
      if (maxRegionBytes < 1 || maxRegionBytes > 64 * 1024 * 1024) throw new InvalidDataException("Region bound must be positive and at most 64 MiB.");
      if (region == null || region.regionSize == 0 || region.regionSize > (ulong)maxRegionBytes) throw new InvalidDataException("Readable region exceeds its declared bound or has zero size.");
      if (region.baseAddress > UInt32.MaxValue || region.regionSize > 0x100000000UL - region.baseAddress) throw new InvalidDataException("Readable region exceeds the x86 address space.");
      if ((ulong)root < region.baseAddress || (ulong)root - region.baseAddress >= region.regionSize) throw new InvalidDataException("Resolved root is outside the queried region.");
      uint access = region.protection & 0xff;
      bool readable = access == 2 || access == 4 || access == 8 || access == 0x20 || access == 0x40 || access == 0x80;
      if (region.state != 0x1000 || (region.protection & 0x100) != 0 || !readable) throw new InvalidDataException("Explicit root must identify a committed readable region without PAGE_GUARD or PAGE_NOACCESS.");
    }
    // The root is a real12-byte MSVC vector object, not its possibly null
    // storage pointer. Capacity bytes preserve allocator preimages as well as
    // used elements. An empty null vector supplies evidence, never fake bytes.
    public static VectorStorageInfo DecodeVectorStorage(byte[] header, int maxVectorBytes) {
      if (maxVectorBytes < 1 || maxVectorBytes > 64 * 1024 * 1024 || header == null || header.Length != 12) throw new InvalidDataException("Vector storage requires a12-byte header and positive bound at most64 MiB.");
      uint begin = BitConverter.ToUInt32(header, 0), end = BitConverter.ToUInt32(header, 4), capacity = BitConverter.ToUInt32(header, 8);
      if ((begin == 0 && (end != 0 || capacity != 0)) || end < begin || capacity < end || ((ulong)capacity - begin) > (ulong)maxVectorBytes) throw new InvalidDataException("Vector storage header exceeds its ordered x86 pointer/bounded capacity policy.");
      return new VectorStorageInfo {begin = begin, end = end, capacity = capacity, length = checked((int)((ulong)capacity - begin)), header = (byte[])header.Clone()};
    }
    static MemoryRegionInfo QueryReadableRegion(IntPtr process, uint root, int maxRegionBytes) {
      int length = IntPtr.Size == 8 ? 48 : 28; IntPtr buffer = Marshal.AllocHGlobal(length);
      ulong returned = 0; MemoryRegionInfo queried = null;
      try {
        UIntPtr actual = VirtualQueryEx(process, Pointer(root), buffer, (UIntPtr)(uint)length);
        returned = actual.ToUInt64();
        Check(actual != UIntPtr.Zero, "VirtualQueryEx explicit root " + Hex(root));
        if (actual.ToUInt64() != (ulong)length) throw new InvalidDataException("VirtualQueryEx returned an incomplete native information structure.");
        byte[] bytes = new byte[length]; Marshal.Copy(buffer, bytes, 0, length);
        queried = DecodeMemoryRegion(bytes, IntPtr.Size); ValidateReadableRegion(root, queried, maxRegionBytes); return queried;
      } catch (Exception error) {
        error.Data["virtualQuery"] = Record("requestedResolvedRoot", Hex(root), "informationBytesExpected", length, "informationBytesReturned", returned, "region", RegionDiagnostic(queried));
        throw;
      } finally {Marshal.FreeHGlobal(buffer);}
    }
    static Dictionary<string, object> RegionDiagnostic(MemoryRegionInfo region) {
      return region == null ? null : Record("baseAddress", "0x" + region.baseAddress.ToString("x"), "allocationBaseAddress", "0x" + region.allocationBaseAddress.ToString("x"), "regionSize", region.regionSize, "allocationProtection", Hex(region.allocationProtection), "state", Hex(region.state), "protection", Hex(region.protection), "type", Hex(region.type));
    }
    public static Dictionary<string, object> BuildRangeFailureDetails(MemoryRange range, string stage, uint? root, uint? start, int? length, MemoryRegionInfo region, Exception error) {
      Dictionary<string, object> details = Record("id", range.id, "stage", stage, "rootAddress", range.address, "rootRva", range.rva, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "rangeMode", range.vectorStorage ? "vector-storage" : range.readableRegion ? "readable-region" : "fixed-length", "declaredLength", range.length, "maxRegionBytes", range.maxRegionBytes, "maxVectorBytes", range.maxVectorBytes, "requestedResolvedRoot", root.HasValue ? Hex(root.Value) : null, "readAddress", start.HasValue ? Hex(start.Value) : null, "readLength", length, "region", RegionDiagnostic(region));
      if (range.dereferenceMinimumValues != null) {details["rangeMode"] = "guarded-pointer"; details["dereferenceMinimumValues"] = range.dereferenceMinimumValues;}
      if (error != null && error.Data.Contains("virtualQuery")) details["virtualQuery"] = error.Data["virtualQuery"];
      return details;
    }
    sealed class RangeCaptureException : IOException {
      public readonly Dictionary<string, object> details;
      public RangeCaptureException(Dictionary<string, object> value, Exception inner) : base("Capture range '" + value["id"] + "' failed during " + value["stage"] + ": " + Json(value), inner) {details = value;}
    }
    static uint ResolveCaptureRange(IntPtr process, uint mainBase, MemoryRange range, Dictionary<string, object> regs) {
      try {return Resolve(process, mainBase, range.address, range.rva, range.baseRegister, range.dereferenceOffsets, range.offset, regs);}
      catch (Exception error) {throw new RangeCaptureException(BuildRangeFailureDetails(range, "resolve-root", null, null, null, null, error), error);}
    }
    public static void ValidateGuardedPointerRange(MemoryRange range) {
      if (range.dereferenceMinimumValues == null) return;
      if (!String.IsNullOrEmpty(range.baseRegister) || String.IsNullOrEmpty(range.address) == String.IsNullOrEmpty(range.rva) || Offset(range.offset) != 0 || range.readableRegion || range.vectorStorage || range.maxRegionBytes != 0 || range.maxVectorBytes != 0 || range.length < 1 || range.length > 64 * 1024 * 1024 || range.dereferenceOffsets == null || range.dereferenceOffsets.Length < 1 || range.dereferenceOffsets.Length > 8 || range.dereferenceMinimumValues.Length != range.dereferenceOffsets.Length) throw new InvalidDataException("Guarded pointer ranges require one global root, offset0, fixed length and one to eight parallel pointer guards.");
      Number(range.address); Number(range.rva);
      for (int i = 0; i < range.dereferenceOffsets.Length; i++) {
        Offset(range.dereferenceOffsets[i]); int minimum = range.dereferenceMinimumValues[i];
        if (minimum != 1 && !(i == 0 && minimum == 257)) throw new InvalidDataException("Guarded pointer minimum must be1, or257 only at the first slot.");
      }
    }
    //Pure callback resolver shared by both capture publication paths. A failed
    //read is an error, never a false guard or an invented zero pointer.
    public static GuardedPointerInfo ResolveGuardedPointerRange(MemoryRange range, uint moduleBase, Func<uint, uint> readDword) {
      ValidateGuardedPointerRange(range);
      if (range.dereferenceMinimumValues == null || readDword == null) throw new InvalidDataException("Explicit guarded descriptor and actual DWORD reader required.");
      uint root = !String.IsNullOrEmpty(range.rva) ? Add(moduleBase, Number(range.rva)) : Number(range.address);
      if (root == 0) throw new InvalidDataException("Guarded pointer root must be nonnull.");
      GuardedPointerInfo result = new GuardedPointerInfo {rootAddress = root, address = root};
      try {
        for (int i = 0; i < range.dereferenceOffsets.Length; i++) {
          uint readAddress = Add(result.address, Offset(range.dereferenceOffsets[i]));
          if ((ulong)readAddress + 4 > 0x100000000UL) throw new InvalidDataException("Guarded pointer DWORD crosses the x86 address bound.");
          uint value = readDword(readAddress); int minimum = range.dereferenceMinimumValues[i];
          result.steps.Add(Record("index", i, "readAddress", Hex(readAddress), "value", Hex(value), "bytesHex", BytesHex(BitConverter.GetBytes(value)), "minimumValue", minimum));
          if (value < minimum) {result.stopIndex = i; result.address = 0; return result;}
          result.address = value;
        }
        if ((ulong)result.address + (ulong)range.length > 0x100000000UL) throw new InvalidDataException("Guarded pointer output crosses the x86 address bound.");
        return result;
      } catch (Exception error) {error.Data["guardedPointerSteps"] = result.steps; throw;}
    }
    static GuardedPointerInfo ReadGuardedPointerRange(IntPtr process, uint moduleBase, MemoryRange range) {
      try {return ResolveGuardedPointerRange(range, moduleBase, delegate(uint address) {return BitConverter.ToUInt32(Bytes(process, address, 4), 0);});}
      catch (Exception error) {
        Dictionary<string, object> details = BuildRangeFailureDetails(range, "resolve-guarded-pointer", null, null, null, null, error);
        if (error.Data.Contains("guardedPointerSteps")) details["guardedPointerSteps"] = error.Data["guardedPointerSteps"];
        throw new RangeCaptureException(details, error);
      }
    }
    static void AddGuardedPointerMetadata(Dictionary<string, object> row, MemoryRange range, GuardedPointerInfo guard) {
      row["rangeMode"] = "guarded-pointer"; row["guardedRootAddress"] = Hex(guard.rootAddress); row["guardedDeclaredLength"] = range.length;
      row["dereferenceMinimumValues"] = range.dereferenceMinimumValues; row["guardedStopIndex"] = guard.stopIndex < 0 ? null : (object)guard.stopIndex;
      row["guardedPointerSteps"] = guard.steps; row["guardedPointerReadBytes"] = guard.steps.Count * 4;
    }
    public static long GuardedPointerFootprint(GuardedPointerInfo guard, int outputLength) {
      if (outputLength < 0 || guard != null && (guard.steps.Count < 1 || guard.steps.Count > 8 || (guard.stopIndex >= 0 ? outputLength != 0 : outputLength == 0))) throw new InvalidDataException("Guarded pointer footprint differs from its actual resolution.");
      return checked((long)outputLength + (guard == null ? 0 : guard.steps.Count * 4));
    }
    static MemoryRegionInfo QueryCaptureRange(IntPtr process, uint root, MemoryRange range) {
      try {return QueryReadableRegion(process, root, range.maxRegionBytes);}
      catch (Exception error) {throw new RangeCaptureException(BuildRangeFailureDetails(range, "query-readable-region", root, null, null, null, error), error);}
    }
    static byte[] ReadCaptureRangeBytes(IntPtr process, MemoryRange range, uint root, uint start, int length, MemoryRegionInfo region) {
      try {return (range.vectorStorage || range.dereferenceMinimumValues != null) && length == 0 ? new byte[0] : Bytes(process, start, length);}
      catch (Exception error) {throw new RangeCaptureException(BuildRangeFailureDetails(range, "read-bytes", root, start, length, region, error), error);}
    }
    static VectorStorageInfo ReadVectorCaptureRange(IntPtr process, uint root, MemoryRange range) {
      byte[] header = null;
      try {
        if (root == 0 || (ulong)root + 12 > 0x100000000UL) throw new InvalidDataException("Vector header must be nonnull and wholly inside the x86 address space.");
        header = Bytes(process, root, 12); return DecodeVectorStorage(header, range.maxVectorBytes);
      }
      catch (Exception error) {
        Dictionary<string, object> details = BuildRangeFailureDetails(range, "read-vector-header", root, root, 12, null, error);
        details["vectorHeaderHex"] = header == null ? null : BytesHex(header);
        throw new RangeCaptureException(details, error);
      }
    }
    static void AddVectorCaptureMetadata(Dictionary<string, object> row, uint root, MemoryRange range, VectorStorageInfo vector) {
      row["rangeMode"] = "vector-storage"; row["requestedResolvedRoot"] = Hex(root);
      row["vectorHeaderAddress"] = Hex(root); row["vectorHeaderHex"] = BytesHex(vector.header);
      row["vectorBegin"] = Hex(vector.begin); row["vectorEnd"] = Hex(vector.end); row["vectorCapacity"] = Hex(vector.capacity);
      row["maxVectorBytes"] = range.maxVectorBytes;
    }
    static void Write(IntPtr process, uint address, byte[] data) {
      uint old, unused; UIntPtr actual;
      Check(VirtualProtectEx(process, Pointer(address), (UIntPtr)(uint)data.Length, 0x40, out old), "VirtualProtectEx");
      try {
        Check(WriteProcessMemory(process, Pointer(address), data, (UIntPtr)(uint)data.Length, out actual), "WriteProcessMemory");
        if (actual.ToUInt64() != (ulong)data.Length) throw new IOException("Partial memory write.");
        Check(FlushInstructionCache(process, Pointer(address), (UIntPtr)(uint)data.Length), "FlushInstructionCache");
      } finally { Check(VirtualProtectEx(process, Pointer(address), (UIntPtr)(uint)data.Length, old, out unused), "Restore page protection"); }
    }
    static byte[] ParseBytes(string value) {
      if (String.IsNullOrEmpty(value) || value.Length % 2 != 0) throw new InvalidDataException("Hex bytes must be nonempty and paired.");
      byte[] result = new byte[value.Length / 2];
      for (int i = 0; i < result.Length; i++) result[i] = Byte.Parse(value.Substring(i * 2, 2), NumberStyles.HexNumber);
      return result;
    }
    static string BytesHex(byte[] value) { return BitConverter.ToString(value).Replace("-", "").ToLowerInvariant(); }
    public static bool CapturePredicateMatches(byte[] actual, string equalsBytesHex) {
      byte[] expected = ParseBytes(equalsBytesHex);
      if (actual == null || actual.Length < 1 || actual.Length > 64 || expected.Length != actual.Length) throw new InvalidDataException("Capture predicate requires equally sized nonempty bytes of at most 64 bytes.");
      for (int i = 0; i < actual.Length; i++) if (actual[i] != expected[i]) return false;
      return true;
    }
    // Pure counter/selection transition shared by the debug loop and tests.
    // Only equality matches advance this counter; snapshot counters advance
    // separately, after all selected blob writes have succeeded.
    public static bool ObserveCaptureMatch(Breakpoint breakpoint, bool matches) {
      if (breakpoint == null || breakpoint.captureWhen == null || breakpoint.skipMatchingHits.GetValueOrDefault() < 0) throw new InvalidDataException("Matching-hit selection requires captureWhen and a nonnegative skip count.");
      if (!matches) return false;
      checked { breakpoint.matchingHits++; }
      return breakpoint.matchingHits > breakpoint.skipMatchingHits.GetValueOrDefault();
    }
    static string TargetString(IntPtr process, uint address, bool unicode) {
      StringBuilder value = new StringBuilder();
      for (int i = 0; i < 32768; i++) {
        byte[] character = Bytes(process, Add(address, i * (unicode ? 2 : 1)), unicode ? 2 : 1);
        int code = unicode ? BitConverter.ToUInt16(character, 0) : character[0];
        if (code == 0) return value.ToString(); value.Append((char)code);
      }
      throw new InvalidDataException("Target path exceeds bounded string length.");
    }
    static string FilePath(IntPtr handle) {
      if (handle == IntPtr.Zero || handle == new IntPtr(-1)) return null;
      StringBuilder path = new StringBuilder(32768);
      uint length = GetFinalPathNameByHandle(handle, path, (uint)path.Capacity, 0);
      return length > 0 && length < path.Capacity ? path.ToString() : null;
    }
    static string Digest(byte[] value) { using (SHA256 hash = SHA256.Create()) return BytesHex(hash.ComputeHash(value)); }
    sealed class Import { public string dll, name; public uint iatRva; }
    static int RvaOffset(byte[] pe, uint rva) {
      int header = BitConverter.ToInt32(pe, 60), count = BitConverter.ToUInt16(pe, header + 6);
      int section = header + 24 + BitConverter.ToUInt16(pe, header + 20);
      uint headersSize = BitConverter.ToUInt32(pe, header + 24 + 60);
      if (rva < headersSize && rva < pe.Length) return (int)rva;
      for (int i = 0; i < count; i++, section += 40) {
        uint va = BitConverter.ToUInt32(pe, section + 12), length = BitConverter.ToUInt32(pe, section + 16), raw = BitConverter.ToUInt32(pe, section + 20);
        if (rva >= va && (ulong)rva - va < length && (ulong)raw + rva - va < (ulong)pe.Length) return checked((int)(raw + rva - va));
      }
      throw new InvalidDataException("Unmapped PE RVA " + Hex(rva));
    }
    static string CString(byte[] data, int offset) {
      int end = offset; while (end < data.Length && data[end] != 0) end++;
      if (end == data.Length) throw new InvalidDataException("Unterminated PE import string.");
      return Encoding.ASCII.GetString(data, offset, end - offset);
    }
    static List<Import> Imports(byte[] pe) {
      List<Import> result = new List<Import>(); int header = BitConverter.ToInt32(pe, 60);
      uint importRva = BitConverter.ToUInt32(pe, header + 24 + 104);
      if (importRva == 0) return result;
      int descriptor = RvaOffset(pe, importRva);
      for (int count = 0; count < 4096; count++, descriptor += 20) {
        uint lookup = BitConverter.ToUInt32(pe, descriptor), name = BitConverter.ToUInt32(pe, descriptor + 12), iat = BitConverter.ToUInt32(pe, descriptor + 16);
        if (lookup == 0 && name == 0 && iat == 0) return result;
        string dll = CString(pe, RvaOffset(pe, name)); if (lookup == 0) lookup = iat;
        for (uint i = 0; i < 65536; i++) {
          uint thunk = BitConverter.ToUInt32(pe, RvaOffset(pe, Add(lookup, i * 4)));
          if (thunk == 0) break;
          string symbol = (thunk & 0x80000000) != 0 ? "ordinal:" + (thunk & 0xffff) : CString(pe, RvaOffset(pe, thunk) + 2);
          result.Add(new Import {dll = dll, name = symbol, iatRva = Add(iat, i * 4)});
          if (i == 65535) throw new InvalidDataException("PE import thunk limit exceeded.");
        }
      }
      throw new InvalidDataException("PE import descriptor limit exceeded.");
    }
    static int RegistryArguments(string name) {
      if (name == "RegSetValueExA" || name == "RegSetValueExW") return 6;
      if (name == "RegCreateKeyExA" || name == "RegCreateKeyExW") return 9;
      if (name == "RegCreateKeyA" || name == "RegCreateKeyW") return 3;
      if (name == "RegSetValueA" || name == "RegSetValueW") return 5;
      if (name == "RegDeleteValueA" || name == "RegDeleteValueW" || name == "RegUnLoadKeyA" || name == "RegUnLoadKeyW" || name == "RegDeleteKeyA" || name == "RegDeleteKeyW") return 2;
      return 0;
    }
    static int ProcessArguments(string name) {
      if (name == "CreateProcessA" || name == "CreateProcessW") return 10;
      if (name == "WinExec") return 2;
      if (name == "ShellExecuteA" || name == "ShellExecuteW") return 6;
      if (name == "ShellExecuteExA" || name == "ShellExecuteExW") return 1;
      return 0;
    }
    static int WindowArguments(string name) {
      if (name == "CreateWindowExA" || name == "CreateWindowExW") return 12;
      if (name == "ShowWindow") return 2;
      if (name == "SetWindowPos") return 7;
      if (name == "SetFocus" || name == "SetForegroundWindow" || name == "SetActiveWindow") return 1;
      return 0;
    }
    static int ModalArguments(string name) {
      if (name == "DialogBoxParamA" || name == "DialogBoxParamW" || name == "DialogBoxIndirectParamA" || name == "DialogBoxIndirectParamW" || name == "MessageBoxExA" || name == "MessageBoxExW") return 5;
      if (name == "MessageBoxA" || name == "MessageBoxW") return 4;
      if (name == "MessageBoxIndirectA" || name == "MessageBoxIndirectW") return 1;
      return 0;
    }
    // Pure policy function, also exercised by non-launching configuration tests.
    public static uint HiddenWindowArgumentValue(string api, int argument, uint original) {
      if ((api == "CreateWindowExA" || api == "CreateWindowExW") && argument == 1) return (original & ~8u) | 0x08000000u;
      if ((api == "CreateWindowExA" || api == "CreateWindowExW") && argument == 4) return original & ~0x10000000u;
      if (api == "ShowWindow" && argument == 2) return 0;
      if (api == "SetWindowPos" && argument == 7) return (original & ~0x40u) | 0x10u | 0x80u;
      throw new InvalidDataException("Unsupported hidden-window argument policy.");
    }
    static void EditArgument(IntPtr process, uint stack, int argument, uint replacement, string api, string reason, Action<Dictionary<string, object>> emit) {
      uint address = Add(stack, argument * 4); byte[] original = Bytes(process, address, 4), bytes = BitConverter.GetBytes(replacement);
      bool changed = BitConverter.ToUInt32(original, 0) != replacement;
      if (changed) Write(process, address, bytes);
      emit(Record("type", "service-argument-intervention", "api", api, "argumentIndex", argument, "stackAddress", Hex(address), "originalBytesHex", BytesHex(original), "replacementBytesHex", BytesHex(bytes), "changed", changed, "reason", reason, "originalCallSkipped", false));
    }
    static string Quote(string value) {
      StringBuilder result = new StringBuilder("\""); int slash = 0;
      foreach (char c in value) {
        if (c == '\\') { slash++; continue; }
        if (c == '"') result.Append('\\', slash * 2 + 1).Append(c);
        else result.Append('\\', slash).Append(c);
        slash = 0;
      }
      return result.Append('\\', slash * 2).Append('"').ToString();
    }
    static string Json(object value) {
      if (value == null) return "null";
      string s = value as string;
      if (s != null) {
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s) { if (c == '"' || c == '\\') b.Append('\\').Append(c); else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4")); else b.Append(c); }
        return b.Append('"').ToString();
      }
      if (value is bool) return (bool)value ? "true" : "false";
      IDictionary dictionary = value as IDictionary;
      if (dictionary != null) { List<string> parts = new List<string>(); foreach (DictionaryEntry entry in dictionary) parts.Add(Json(entry.Key.ToString()) + ":" + Json(entry.Value)); return "{" + String.Join(",", parts.ToArray()) + "}"; }
      IEnumerable array = value as IEnumerable;
      if (array != null) { List<string> parts = new List<string>(); foreach (object entry in array) parts.Add(Json(entry)); return "[" + String.Join(",", parts.ToArray()) + "]"; }
      return Convert.ToString(value, CultureInfo.InvariantCulture);
    }
    static Dictionary<string, object> Record(params object[] pairs) {
      Dictionary<string, object> data = new Dictionary<string, object>();
      for (int i = 0; i < pairs.Length; i += 2) data.Add((string)pairs[i], pairs[i + 1]);
      return data;
    }
    static readonly string[] RegisterNames = {"edi", "esi", "ebx", "edx", "ecx", "eax", "ebp", "eip", "cs", "eflags", "esp", "ss"};
    static IntPtr Context(IntPtr thread) {
      IntPtr data = Marshal.AllocHGlobal(716);
      for (int i = 0; i < 716; i += 4) Marshal.WriteInt32(data, i, 0);
      Marshal.WriteInt32(data, 0, 0x1003f);
      try { Check(IntPtr.Size == 8 ? Wow64GetThreadContext(thread, data) : GetThreadContext(thread, data), "Get x86 context"); return data; }
      catch { Marshal.FreeHGlobal(data); throw; }
    }
    static void SetContext(IntPtr thread, IntPtr data) { Check(IntPtr.Size == 8 ? Wow64SetThreadContext(thread, data) : SetThreadContext(thread, data), "Set x86 context"); }
    static Dictionary<string, object> Registers(IntPtr data) {
      Dictionary<string, object> result = new Dictionary<string, object>();
      for (int i = 0; i < RegisterNames.Length; i++) result[RegisterNames[i]] = Hex(U32(data, 156 + i * 4));
      result["fpuControlWord"] = Hex(U32(data, 28) & 0xffff);
      result["fpuStatusWord"] = Hex(U32(data, 32) & 0xffff);
      result["mxcsr"] = Hex(U32(data, 204 + 24));
      return result;
    }
    static uint Resolve(IntPtr process, uint moduleBase, string address, string rva, string register, string[] chain, string offset, Dictionary<string, object> registers) {
      bool ignored;
      return Resolve(process, moduleBase, address, rva, register, chain, offset, registers, false, out ignored);
    }
    static uint Resolve(IntPtr process, uint moduleBase, string address, string rva, string register, string[] chain, string offset, Dictionary<string, object> registers, bool stopAtNullPointer, out bool nullPointer) {
      nullPointer = false;
      uint result;
      if (!String.IsNullOrEmpty(register)) {
        object value;
        if (registers == null || !registers.TryGetValue(register.ToLowerInvariant(), out value)) throw new InvalidDataException("Unknown or unavailable baseRegister: " + register);
        result = Number((string)value);
      } else result = !String.IsNullOrEmpty(rva) ? Add(moduleBase, Number(rva)) : Number(address);
      foreach (string item in chain) {
        result = BitConverter.ToUInt32(Bytes(process, Add(result, Offset(item)), 4), 0);
        if (stopAtNullPointer && result == 0) {nullPointer = true; return 0;}
      }
      return Add(result, Offset(offset));
    }
    static bool UninitializedSourceRead(Win32Exception error) {
      return error.Message.StartsWith("ReadProcessMemory ", StringComparison.Ordinal) && (error.NativeErrorCode == 299 || error.NativeErrorCode == 487 || error.NativeErrorCode == 998);
    }
    public static void Validate(Options o) {
      if (o.schemaVersion != 1) throw new InvalidDataException("Unsupported config schemaVersion.");
      if (!Path.IsPathRooted(o.executablePath) || !File.Exists(o.executablePath)) throw new FileNotFoundException("An existing absolute executablePath is required.");
      if (!Path.IsPathRooted(o.workingDirectory) || !Directory.Exists(o.workingDirectory)) throw new DirectoryNotFoundException("An existing absolute workingDirectory is required.");
      if (!Path.IsPathRooted(o.outputDirectory) || File.Exists(o.outputDirectory) || Directory.Exists(o.outputDirectory)) throw new IOException("outputDirectory must be a new absolute path.");
      if (o.maxDurationMs < 1 || o.maxEvents < 1 || o.maxSnapshots < 1) throw new InvalidDataException("All capture bounds must be positive.");
      if (o.stopThreadStackBytes < 0 || o.stopThreadStackBytes > 512) throw new InvalidDataException("stopThreadStackBytes must be between zero and 512.");
      if (!String.IsNullOrEmpty(o.temporaryDirectory) && (!Path.IsPathRooted(o.temporaryDirectory) || !Directory.Exists(o.temporaryDirectory) || o.temporaryDirectory.Length >= 260)) throw new InvalidDataException("temporaryDirectory must be an existing absolute directory below MAX_PATH.");
      byte[] pe = File.ReadAllBytes(o.executablePath);
      if (pe.Length < 64 || pe[0] != 'M' || pe[1] != 'Z') throw new InvalidDataException("Expected an x86 Windows PE.");
      int header = BitConverter.ToInt32(pe, 60);
      if (header < 0 || header > pe.Length - 26 || BitConverter.ToUInt32(pe, header) != 0x4550 || BitConverter.ToUInt16(pe, header + 4) != 0x14c || BitConverter.ToUInt16(pe, header + 24) != 0x10b) throw new InvalidDataException("Only x86 PE32 capture is supported.");
      if (String.IsNullOrEmpty(o.expectedSha256) || !String.Equals(Digest(pe), o.expectedSha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Executable SHA-256 differs from expectedSha256.");
      if (!String.IsNullOrEmpty(o.redirectedDocumentsPath)) {
        if (!Path.IsPathRooted(o.redirectedDocumentsPath) || !Directory.Exists(o.redirectedDocumentsPath)) throw new InvalidDataException("redirectedDocumentsPath must be an existing absolute directory.");
        if (o.redirectedDocumentsPath.Length >= 260) throw new InvalidDataException("redirectedDocumentsPath must fit MAX_PATH including the terminator.");
        foreach (char c in o.redirectedDocumentsPath) if (c > 127) throw new InvalidDataException("The ANSI folder adapter currently requires an ASCII directory path.");
        bool found = false; foreach (Import item in Imports(pe)) if (item.name == "SHGetFolderPathA") found = true;
        if (!found) throw new InvalidDataException("Required SHGetFolderPathA import was not found; folder isolation cannot be installed.");
      }
      if (o.denyRegistryWrites) {
        bool found = false; foreach (Import item in Imports(pe)) if (RegistryArguments(item.name) != 0) found = true;
        if (!found) throw new InvalidDataException("No supported registry-write imports found; declared registry isolation has no hook coverage.");
      }
      if (!String.IsNullOrEmpty(o.redirectedShellFolderPath)) {
        if (!Path.IsPathRooted(o.redirectedShellFolderPath) || !Directory.Exists(o.redirectedShellFolderPath) || o.redirectedShellFolderPath.Length >= 260) throw new InvalidDataException("redirectedShellFolderPath must be an existing absolute directory below MAX_PATH.");
        foreach (char c in o.redirectedShellFolderPath) if (c > 127) throw new InvalidDataException("The legacy ANSI folder adapter currently requires an ASCII directory path.");
        bool found = false; foreach (Import item in Imports(pe)) if (item.name == "SHGetPathFromIDListA") found = true;
        if (!found) throw new InvalidDataException("Required SHGetPathFromIDListA import was not found; legacy folder isolation cannot be installed.");
      }
      if (o.denyPlayerMailslot) {
        bool found = false; foreach (Import item in Imports(pe)) if (item.name == "CreateFileA" || item.name == "CreateFileW") found = true;
        if (!found) throw new InvalidDataException("No CreateFileA/W imports found for declared player-mailslot isolation.");
      }
      if (o.hideOwnedWindows) {
        bool found = false; foreach (Import item in Imports(pe)) if (WindowArguments(item.name) != 0 || ModalArguments(item.name) != 0) found = true;
        if (!found) throw new InvalidDataException("No supported window imports found for hideOwnedWindows policy.");
      }
      if (o.foregroundWindowSource != null && (o.foregroundWindowSource.length != 4 || o.foregroundWindowSource.readableRegion || o.foregroundWindowSource.maxRegionBytes != 0 || o.foregroundWindowSource.dereferenceMinimumValues != null || o.foregroundWindowSource.vectorStorage || o.foregroundWindowSource.maxVectorBytes != 0)) throw new InvalidDataException("foregroundWindowSource length must be exactly four bytes in fixed-length mode.");
      HashSet<string> ids = new HashSet<string>(); HashSet<string> locations = new HashSet<string>();
      foreach (Breakpoint b in o.breakpoints) {
        if (String.IsNullOrEmpty(b.id) || !ids.Add(b.id)) throw new InvalidDataException("Breakpoint ids must be unique.");
        if (String.IsNullOrEmpty(b.rva) == String.IsNullOrEmpty(b.address)) throw new InvalidDataException("Specify exactly one breakpoint rva or address.");
        string location = String.IsNullOrEmpty(b.rva) ? "a" + Number(b.address) : "r" + Number(b.rva);
        if (!locations.Add(location)) throw new InvalidDataException("Duplicate breakpoint location.");
        if (b.stopAfterHits < 0) throw new InvalidDataException("stopAfterHits cannot be negative.");
        if (b.skipMatchingHits.HasValue && (b.skipMatchingHits.Value < 0 || b.captureWhen == null)) throw new InvalidDataException("skipMatchingHits requires captureWhen and a nonnegative count.");
        if (b.captureWhen != null) {
          MemoryRange predicate = b.captureWhen.range;
          if (predicate == null || predicate.dereferenceMinimumValues != null || predicate.readableRegion || predicate.maxRegionBytes != 0 || predicate.vectorStorage || predicate.maxVectorBytes != 0 || predicate.length < 1 || predicate.length > 64) throw new InvalidDataException("captureWhen requires a fixed-length range of one to 64 bytes.");
          CapturePredicateMatches(new byte[predicate.length], b.captureWhen.equalsBytesHex);
        }
      }
      List<MemoryRange> ranges = new List<MemoryRange>(o.ranges);
      foreach (Breakpoint b in o.breakpoints) { ranges.AddRange(b.ranges); if (b.captureWhen != null) ranges.Add(b.captureWhen.range); }
      if (o.foregroundWindowSource != null) ranges.Add(o.foregroundWindowSource);
      PendingFrameObserver observer = o.pendingFrameObserver;
      if (observer != null) {
        if (String.IsNullOrEmpty(observer.beforeBreakpointId) || String.IsNullOrEmpty(observer.afterBreakpointId) || String.IsNullOrEmpty(observer.eventBreakpointId) || observer.beforeBreakpointId == observer.afterBreakpointId || observer.beforeBreakpointId == observer.eventBreakpointId || observer.afterBreakpointId == observer.eventBreakpointId || !ids.Contains(observer.beforeBreakpointId) || !ids.Contains(observer.afterBreakpointId) || !ids.Contains(observer.eventBreakpointId)) throw new InvalidDataException("Pending-frame observer requires three distinct declared breakpoint ids.");
        if (observer.maxPendingBytes < 716 || observer.maxPendingBytes > 128 * 1024 * 1024 || observer.maxCandidateFrames < 1 || observer.maxCandidateFrames > 10000 || observer.maxEventSnapshots < 1 || observer.maxEventSnapshots > 64 || o.maxSnapshots < 3) throw new InvalidDataException("Invalid pending-frame byte/candidate/event/snapshot bounds.");
        if (observer.eventRecordBytes < 1 || observer.eventRecordBytes > 4096 || observer.eventStackOffset > 0 || observer.eventStackOffset < -65536 || String.IsNullOrEmpty(observer.eventReturnRva)) throw new InvalidDataException("Pending-frame event ABI requires explicit bounded record size, stack offset and return RVA.");
        Number(observer.eventReturnRva);
        bool registerFound = false; foreach (string name in RegisterNames) if (name == observer.eventPointerRegister) registerFound = true;
        if (!registerFound) throw new InvalidDataException("Pending-frame eventPointerRegister is unknown.");
        foreach (MemoryRange source in new MemoryRange[] {observer.eventPoolRoot, observer.eventPoolCapacity}) {
          if (source == null || source.dereferenceMinimumValues != null || source.length != 4 || source.readableRegion || source.maxRegionBytes != 0 || source.vectorStorage || source.maxVectorBytes != 0) throw new InvalidDataException("Pending-frame event pool sources must be fixed four-byte ranges.");
          ranges.Add(source);
        }
        Breakpoint before = null, after = null, eventPoint = null;
        foreach (Breakpoint b in o.breakpoints) {if (b.id == observer.beforeBreakpointId) before = b; if (b.id == observer.afterBreakpointId) after = b; if (b.id == observer.eventBreakpointId) eventPoint = b;}
        if (before.stopAfterHits != 0 || eventPoint.stopAfterHits != 0 || after.stopAfterHits != 1 || before.skipMatchingHits.GetValueOrDefault() != after.skipMatchingHits.GetValueOrDefault()) throw new InvalidDataException("Pending-frame entry/event cannot stop independently; after must stop at one committed frame and entry/after skip windows must agree.");
        if (observer.nestedBreakpointIds == null || observer.nestedBreakpointIds.Length > 128 || (observer.nestedBreakpointIds.Length == 0 ? observer.maxNestedSnapshots != 0 : observer.maxNestedSnapshots < 1 || observer.maxNestedSnapshots > 128)) throw new InvalidDataException("Pending-frame nested observations require explicit ids and a1..128 snapshot bound; empty ids require zero bound.");
        HashSet<string> nestedIds = new HashSet<string>();
        foreach (string id in observer.nestedBreakpointIds) {
          if (String.IsNullOrEmpty(id) || !ids.Contains(id) || !nestedIds.Add(id) || id == observer.beforeBreakpointId || id == observer.afterBreakpointId || id == observer.eventBreakpointId) throw new InvalidDataException("Pending-frame nested ids must be unique declared breakpoints distinct from entry/event/after.");
          foreach (Breakpoint b in o.breakpoints) if (b.id == id && (b.stopAfterHits != 0 || b.skipMatchingHits.GetValueOrDefault() != 0 || b.service != null)) throw new InvalidDataException("Pending-frame nested observations cannot stop, skip or perform services.");
        }
      }
      if (observer != null && observer.nestedCaptureScope != null) {
        if (observer.nestedCaptureScope != "frame-thread" || observer.nestedBreakpointIds.Length == 0) throw new InvalidDataException("nestedCaptureScope requires frame-thread and declared nested observations.");
      }
      ObservationActivation activation = o.observationActivation;
      if (activation != null) {
        if (observer == null || (o.ownedWorkerGainWindow==null && observer.nestedCaptureScope != "frame-thread") || activation.rawHit < 1 || String.IsNullOrEmpty(activation.breakpointId) || !ids.Contains(activation.breakpointId) || activation.observationBreakpointIds == null || activation.observationBreakpointIds.Length == 0 || activation.observationBreakpointIds.Length > 128) throw new InvalidDataException("Observation activation requires a bounded guarded trigger and explicit observation scope.");
        Breakpoint trigger = null; foreach (Breakpoint point in o.breakpoints) if (point.id == activation.breakpointId) trigger = point;
        if (trigger.captureWhen != null || trigger.skipMatchingHits.HasValue || trigger.stopAfterHits != 0 || trigger.service != null) throw new InvalidDataException("Observation activation trigger must be unfiltered and nonstopping.");
        HashSet<string> deferred = new HashSet<string>();
        foreach (string id in activation.observationBreakpointIds) {
          bool leaf = o.ownedWorkerGainWindow!=null && (id==o.ownedWorkerGainWindow.entryBreakpointId||id==o.ownedWorkerGainWindow.exitBreakpointId||id==o.ownedWorkerGainWindow.unsupportedExitBreakpointId);
          if (id == null || id == activation.breakpointId || !ids.Contains(id) || !deferred.Add(id) || (Array.IndexOf(observer.nestedBreakpointIds, id) < 0 && !leaf)) throw new InvalidDataException("Observation activation sites must be unique declared observers distinct from the trigger.");
        }
        int guards = 0; foreach (PhaseAction action in o.phaseActions) if (action.breakpointId == activation.breakpointId && action.hit == activation.rawHit && action.writes.Length != 0) guards++;
        if (guards != 1) throw new InvalidDataException("Observation activation requires exactly one nonempty declared guard action at its trigger raw hit.");
      }
      ValidateOwnedWorkerObservationPolicy(o);
      ValidateOwnedWorkerGainPairPolicy(o);
      ValidateOwnedWorkerGainWindowPolicy(o);
      ValidateHeldForcePolicy(o);
      ValidateControlledRaceSettingsPolicy(o);
      ValidateParentRttiPolicy(o);
      if (o.ownedWorkerObservation != null) ranges.Add(o.ownedWorkerObservation.threadIdSource);
      if (o.ownedWorkerGainPair != null) {ranges.Add(o.ownedWorkerGainPair.threadIdSource); ranges.Add(o.ownedWorkerGainPair.managerSource);}
      if (o.ownedWorkerGainWindow != null) {ranges.Add(o.ownedWorkerGainWindow.threadIdSource); ranges.Add(o.ownedWorkerGainWindow.managerSource);}
      foreach (MemoryRange r in ranges) {
        ValidateGuardedPointerRange(r);
        if (o.captureThreadEnvironment && r.id == "thread-seh-head") throw new InvalidDataException("thread-seh-head is reserved for captured thread environment bytes.");
        if (String.IsNullOrEmpty(r.id)) throw new InvalidDataException("Range requires an id.");
        if (r.vectorStorage) {
          if (r.length != 0 || r.readableRegion || r.maxRegionBytes != 0 || r.maxVectorBytes < 1 || r.maxVectorBytes > 64 * 1024 * 1024) throw new InvalidDataException("Vector-storage mode requires omitted/zero length, no readable-region mode and positive maxVectorBytes at most64 MiB.");
        } else if (r.readableRegion) {
          if (r.length != 0 || r.maxRegionBytes < 1 || r.maxRegionBytes > 64 * 1024 * 1024 || r.maxVectorBytes != 0) throw new InvalidDataException("Readable-region mode requires omitted/zero length and positive maxRegionBytes at most 64 MiB.");
        } else if (r.length < 1 || r.length > 64 * 1024 * 1024 || r.maxRegionBytes != 0 || r.maxVectorBytes != 0) throw new InvalidDataException("Fixed-length range requires bounded positive length and no region bound or vector bound.");
        int roots = (String.IsNullOrEmpty(r.address) ? 0 : 1) + (String.IsNullOrEmpty(r.rva) ? 0 : 1) + (String.IsNullOrEmpty(r.baseRegister) ? 0 : 1);
        if (roots != 1) throw new InvalidDataException("Range requires exactly one address, rva or baseRegister.");
        Number(r.address); Number(r.rva); Offset(r.offset); foreach (string item in r.dereferenceOffsets) Offset(item);
      }
      if (o.foregroundWindowSource != null) {
        bool found = false; foreach (Import item in Imports(pe)) if (item.name == "GetForegroundWindow") found = true;
        if (!found) throw new InvalidDataException("Required GetForegroundWindow import was not found for foregroundWindowSource adapter.");
      }
      foreach (PhaseAction action in o.phaseActions) {
        if (!ids.Contains(action.breakpointId) || action.hit < 1) throw new InvalidDataException("Action references an unknown breakpoint or invalid hit.");
        if (observer != null && (action.breakpointId == observer.beforeBreakpointId || action.breakpointId == observer.afterBreakpointId || action.breakpointId == observer.eventBreakpointId || Array.IndexOf(observer.nestedBreakpointIds, action.breakpointId) >= 0)) throw new InvalidDataException("phaseActions cannot reference a pending-frame observer breakpoint.");
        foreach (Breakpoint b in o.breakpoints) if (b.id == action.breakpointId && b.captureWhen != null) throw new InvalidDataException("phaseActions cannot reference a filtered breakpoint; captureWhen is observer-only.");
        foreach (MemoryWrite write in action.writes) {
          int roots = (String.IsNullOrEmpty(write.address) ? 0 : 1) + (String.IsNullOrEmpty(write.rva) ? 0 : 1) + (String.IsNullOrEmpty(write.baseRegister) ? 0 : 1);
          if (roots != 1) throw new InvalidDataException("Write requires exactly one address, rva or baseRegister.");
          bool single = write.expectedBytesHex != null, any = write.expectedAnyBytesHex != null;
          if (single == any || (any && write.expectedAnyBytesHex.Length == 0)) throw new InvalidDataException("Write requires exactly one expectedBytesHex or nonempty expectedAnyBytesHex policy.");
          byte[] replacement = ParseBytes(write.bytesHex);
          foreach (string expected in single ? new string[] {write.expectedBytesHex} : write.expectedAnyBytesHex) if (ParseBytes(expected).Length != replacement.Length) throw new InvalidDataException("Writes require equally sized expected original bytes.");
          Number(write.address); Number(write.rva); Offset(write.offset); foreach (string item in write.dereferenceOffsets) Offset(item);
        }
      }
    }
    public static void ValidateOwnedWorkerObservationPolicy(Options o) {
      OwnedWorkerObservation policy = o.ownedWorkerObservation;
      if (policy == null) return;
      PendingFrameObserver observer = o.pendingFrameObserver;
      ObservationActivation activation = o.observationActivation;
      if (policy.maxSnapshots != 1 || String.IsNullOrEmpty(policy.breakpointId) || observer == null || observer.nestedCaptureScope != "frame-thread" || observer.nestedBreakpointIds == null || activation == null || activation.observationBreakpointIds == null || Array.IndexOf(observer.nestedBreakpointIds, policy.breakpointId) < 0 || Array.IndexOf(activation.observationBreakpointIds, policy.breakpointId) < 0) throw new InvalidDataException("Owned worker observation requires exactly one guarded deferred frame-thread nested site.");
      Breakpoint point = null; foreach (Breakpoint item in o.breakpoints) if (item.id == policy.breakpointId) point = item;
      if (point == null || point.stopAfterHits != 0 || point.skipMatchingHits.HasValue || point.service != null) throw new InvalidDataException("Owned worker observation must be read-only and nonstopping without skip windows.");
      foreach (PhaseAction action in o.phaseActions) if (action.breakpointId == point.id) throw new InvalidDataException("Owned worker observation cannot perform phase actions.");
      MemoryRange source = policy.threadIdSource;
      if (source == null || source.length != 4 || source.readableRegion || source.vectorStorage || source.maxRegionBytes != 0 || source.maxVectorBytes != 0 || !String.IsNullOrEmpty(source.baseRegister) || String.IsNullOrEmpty(source.address) == String.IsNullOrEmpty(source.rva) || source.dereferenceOffsets == null || source.dereferenceOffsets.Length > 8) throw new InvalidDataException("Owned worker TID source must be an explicit fixed four-byte global root with at most eight dereferences.");
      if (policy.entryReturnRva != null && (String.IsNullOrEmpty(policy.entryReturnRva) || (Number(policy.entryReturnRva) != 0xb1304 && Number(policy.entryReturnRva) != 0xa7ca1))) throw new InvalidDataException("Owned worker entry return RVA must be the known gain or frequency caller.");
      List<MemoryRange> workerRanges = new List<MemoryRange>(o.ranges); workerRanges.AddRange(point.ranges);
      foreach (MemoryRange range in workerRanges) if (String.Equals(range.baseRegister, "esi", StringComparison.OrdinalIgnoreCase) && policy.entryReturnRva == null) throw new InvalidDataException("Owned worker ESI ranges require a declared known caller return gate.");
    }
    public static bool OwnedWorkerEntryReturnMatches(uint moduleBase, uint actualReturn, string entryReturnRva) {
      if (entryReturnRva == null) return true;
      uint rva = Number(entryReturnRva);
      if (String.IsNullOrEmpty(entryReturnRva) || (rva != 0xb1304 && rva != 0xa7ca1)) throw new InvalidDataException("Unknown owned worker caller return RVA.");
      return actualReturn == Add(moduleBase, rva);
    }
    public static void ValidateOwnedWorkerGainPairPolicy(Options o) {
      OwnedWorkerGainPair p = o.ownedWorkerGainPair; if (p == null) return;
      PendingFrameObserver f = o.pendingFrameObserver; ObservationActivation a = o.observationActivation;
      if (o.ownedWorkerObservation != null || p.maxSnapshots != 2 || p.entryBreakpointId != "worker-gain-entry" || p.exitBreakpointId != "worker-gain-exit" || p.unsupportedExitBreakpointId != "worker-gain-spatial-exit" || f == null || f.nestedCaptureScope != "frame-thread" || f.beforeBreakpointId!="native-recovery-before" || f.afterBreakpointId!="native-recovery-after" || f.eventBreakpointId!="native-recovery-apply-entry" || a == null || a.breakpointId!="controlled-recovery-caller" || a.rawHit != 229 || !o.captureThreadEnvironment || o.maxSnapshots != 350 || o.maxDurationMs != 90000 || f.maxNestedSnapshots != 115 || f.maxPendingBytes != 128 * 1024 * 1024) throw new InvalidDataException("Worker gain pair requires its separate exact bounded guarded policy.");
      string[] names = {p.entryBreakpointId,p.exitBreakpointId,p.unsupportedExitBreakpointId}; uint[] sites = {0xb12d0,0xb1990,0xb1919};
      for (int i=0;i<names.Length;i++) {
        Breakpoint point=null; foreach(Breakpoint b in o.breakpoints) if(b.id==names[i]) {if(point!=null)throw new InvalidDataException("Duplicate worker gain site.");point=b;}
        if(point==null || Number(point.rva)!=sites[i] || !String.IsNullOrEmpty(point.address) || point.stopAfterHits!=0 || point.skipMatchingHits.HasValue || point.service!=null || point.captureWhen!=null || Array.IndexOf(f.nestedBreakpointIds,names[i])<0 || Array.IndexOf(a.observationBreakpointIds,names[i])<0) throw new InvalidDataException("Worker gain endpoints require exact deferred read-only native sites.");
        foreach(PhaseAction action in o.phaseActions) if(action.breakpointId==names[i]) throw new InvalidDataException("Worker gain endpoints cannot write game state.");
        if(i==2) {if(point.ranges.Length!=0) throw new InvalidDataException("Unsupported worker gain exit is a reject-only guard.");}
        else {
          ValidateGainPairRegisterRange(point,"worker-gain-stack","esp",444,-432,new string[0]);
          ValidateGainPairRegisterRange(point,"worker-gain-arguments","esp",12,0,new string[0]);
          ValidateGainPairRegisterRange(point,"worker-gain-source",i==0?"esp":"esi",0x9a8,0,i==0?new string[]{"4"}:new string[0]);
          ValidateGainPairRegisterRange(point,"worker-gain-source-vtable",i==0?"esp":"esi",0x88,0,i==0?new string[]{"4","0"}:new string[]{"0"});
          foreach(MemoryRange r in point.ranges) if(!String.IsNullOrEmpty(r.baseRegister) && r.id!="worker-gain-stack" && r.id!="worker-gain-arguments" && r.id!="worker-gain-source" && r.id!="worker-gain-source-vtable") throw new InvalidDataException("Worker gain extra register pointees require a separately reviewed policy.");
        }
      }
      foreach(MemoryRange r in o.ranges) if(!String.IsNullOrEmpty(r.baseRegister)) throw new InvalidDataException("Worker gain global register ranges are not admitted.");
      MemoryRange tid=p.threadIdSource,manager=p.managerSource;
      if(tid==null || manager==null || tid.id!="manager-worker-tid" || Number(tid.rva)!=0x314b08 || tid.length!=4 || tid.offset!="0x24" || tid.dereferenceOffsets==null || tid.dereferenceOffsets.Length!=2 || tid.dereferenceOffsets[0]!="0" || tid.dereferenceOffsets[1]!="0x824" || manager.id!="worker-gain-manager-root" || Number(manager.rva)!=0x314b08 || manager.length!=4 || manager.dereferenceOffsets.Length!=0 || Offset(manager.offset)!=0) throw new InvalidDataException("Worker gain manager/TID roots differ.");
      foreach(MemoryRange r in new MemoryRange[]{tid,manager}) if(!String.IsNullOrEmpty(r.address)||!String.IsNullOrEmpty(r.baseRegister)||r.readableRegion||r.vectorStorage||r.maxRegionBytes!=0||r.maxVectorBytes!=0||r.dereferenceMinimumValues!=null) throw new InvalidDataException("Worker gain ownership roots must be fixed global inputs.");
    }
    static void ValidateGainPairRegisterRange(Breakpoint point,string id,string register,int length,long offset,string[] chain) {
      MemoryRange found=null;foreach(MemoryRange r in point.ranges)if(r.id==id){if(found!=null)throw new InvalidDataException("Duplicate worker gain register range.");found=r;}
      if(found==null||found.baseRegister!=register||found.length!=length||Offset(found.offset)!=offset||!String.IsNullOrEmpty(found.address)||!String.IsNullOrEmpty(found.rva)||found.readableRegion||found.vectorStorage||found.maxRegionBytes!=0||found.maxVectorBytes!=0||found.dereferenceMinimumValues!=null||found.dereferenceOffsets==null||found.dereferenceOffsets.Length!=chain.Length) throw new InvalidDataException("Worker gain exact register range differs: "+id);
      for(int i=0;i<chain.Length;i++)if(found.dereferenceOffsets[i]!=chain[i])throw new InvalidDataException("Worker gain exact pointer chain differs: "+id);
    }
    public static void ValidateOwnedWorkerGainWindowPolicy(Options o) {
      if(o==null)throw new ArgumentNullException("o");
      OwnedWorkerGainWindow w=o.ownedWorkerGainWindow;if(w==null)return;
      PendingFrameObserver f=o.pendingFrameObserver;ObservationActivation a=o.observationActivation;
      if(o.ownedWorkerObservation!=null||o.ownedWorkerGainPair!=null||o.heldForceInput!=null||w.entryBreakpointId!="worker-gain-entry"||w.exitBreakpointId!="worker-gain-exit"||w.unsupportedExitBreakpointId!="worker-gain-spatial-exit"||w.maxSnapshots!=2||w.maxBufferedBytes!=262144||o.maxDurationMs!=90000||o.maxSnapshots!=350||!o.captureThreadEnvironment||o.breakpoints==null||o.phaseActions==null||o.ranges==null||f==null||f.beforeBreakpointId!="native-recovery-before"||f.afterBreakpointId!="native-recovery-after"||f.eventBreakpointId!="native-recovery-apply-entry"||f.nestedCaptureScope!=null||f.nestedBreakpointIds==null||f.nestedBreakpointIds.Length!=0||f.maxNestedSnapshots!=0||f.maxPendingBytes!=128*1024*1024-w.maxBufferedBytes||a==null||a.breakpointId!="controlled-recovery-caller"||a.rawHit!=229||a.observationBreakpointIds==null||a.observationBreakpointIds.Length!=3)throw new InvalidDataException("Worker leaf window requires its separate bounded activation/parent policy.");
      string[] names={w.entryBreakpointId,w.exitBreakpointId,w.unsupportedExitBreakpointId};uint[] sites={0xb12d0,0xb1990,0xb1919};
      for(int i=0;i<3;i++){
        if(a.observationBreakpointIds[i]!=names[i])throw new InvalidDataException("Worker leaf activation sites differ.");
        Breakpoint p=null;foreach(Breakpoint b in o.breakpoints)if(b.id==names[i]){if(p!=null)throw new InvalidDataException("Duplicate worker leaf site.");p=b;}
        if(p==null||p.ranges==null||Number(p.rva)!=sites[i]||!String.IsNullOrEmpty(p.address)||p.stopAfterHits!=0||p.skipMatchingHits.HasValue||p.captureWhen!=null||p.service!=null)throw new InvalidDataException("Worker leaf sites must be exact read-only endpoints.");
        foreach(PhaseAction action in o.phaseActions)if(action.breakpointId==p.id)throw new InvalidDataException("Worker leaf cannot perform target writes.");
        if(i==2){if(p.ranges.Length!=0)throw new InvalidDataException("Worker spatial exit is reject-only.");}
        else {ValidateGainPairRegisterRange(p,"worker-gain-stack","esp",444,-432,new string[0]);ValidateGainPairRegisterRange(p,"worker-gain-arguments","esp",12,0,new string[0]);ValidateGainPairRegisterRange(p,"worker-gain-source",i==0?"esp":"esi",0x9a8,0,i==0?new string[]{"4"}:new string[0]);ValidateGainPairRegisterRange(p,"worker-gain-source-vtable",i==0?"esp":"esi",0x88,0,i==0?new string[]{"4","0"}:new string[]{"0"});foreach(MemoryRange r in p.ranges)if(!String.IsNullOrEmpty(r.baseRegister)&&r.id!="worker-gain-stack"&&r.id!="worker-gain-arguments"&&r.id!="worker-gain-source"&&r.id!="worker-gain-source-vtable")throw new InvalidDataException("Extra worker leaf register pointee is unsupported.");}
      }
      MemoryRange tid=w.threadIdSource,manager=w.managerSource;
      if(tid==null||manager==null||tid.dereferenceOffsets==null||manager.dereferenceOffsets==null||tid.id!="manager-worker-tid"||Number(tid.rva)!=0x314b08||tid.length!=4||tid.offset!="0x24"||tid.dereferenceOffsets.Length!=2||tid.dereferenceOffsets[0]!="0"||tid.dereferenceOffsets[1]!="0x824"||manager.id!="worker-gain-manager-root"||Number(manager.rva)!=0x314b08||manager.length!=4||manager.dereferenceOffsets.Length!=0||Offset(manager.offset)!=0)throw new InvalidDataException("Worker leaf ownership roots differ.");
      foreach(MemoryRange r in new MemoryRange[]{tid,manager})if(!String.IsNullOrEmpty(r.address)||!String.IsNullOrEmpty(r.baseRegister)||r.readableRegion||r.vectorStorage||r.maxRegionBytes!=0||r.maxVectorBytes!=0||r.dereferenceMinimumValues!=null)throw new InvalidDataException("Worker leaf needs fixed global ownership roots.");
      foreach(MemoryRange r in o.ranges)if(!String.IsNullOrEmpty(r.baseRegister))throw new InvalidDataException("Worker leaf global register ranges are unsupported.");
    }
    sealed class BufferedRange {
      public uint start;
      public int length;
      public byte[] data;
      public int dataOffset;
      public Dictionary<string, object> row;
      public MemoryRange descriptor;
      public uint root;
      public MemoryRegionInfo region;
    }
    //Snapshot-local containment only. A partial overlap gets an independent
    //backing and full charge; no interval union, gap read or previous snapshot.
    public static ContainedRangeStorage PlanContainedRangeStorage(uint[] addresses,int[] lengths) {
      if(addresses==null||lengths==null||addresses.Length!=lengths.Length)throw new InvalidDataException("Contained range plan extents differ.");
      List<int> order=new List<int>(),owners=new List<int>();ContainedRangeStorage plan=new ContainedRangeStorage {views=new ContainedRangeView[lengths.Length]};
      for(int i=0;i<lengths.Length;i++){if(lengths[i]<0||lengths[i]>64*1024*1024||(ulong)addresses[i]+(ulong)lengths[i]>0x100000000UL||lengths[i]>0&&addresses[i]==0)throw new InvalidDataException("Contained range plan has invalid x86 bounds.");order.Add(i);plan.logicalBytes=checked(plan.logicalBytes+lengths[i]);}
      order.Sort(delegate(int a,int b){int n=lengths[b].CompareTo(lengths[a]);return n!=0?n:a.CompareTo(b);});
      foreach(int index in order){int owner=-1;if(lengths[index]>0){foreach(int candidate in owners)if(addresses[candidate]<=addresses[index]&&(ulong)addresses[index]+(ulong)lengths[index]<=(ulong)addresses[candidate]+(ulong)lengths[candidate]){owner=candidate;break;}if(owner<0){owner=index;owners.Add(index);plan.backingBytes=checked(plan.backingBytes+lengths[index]);}}
        plan.views[index]=new ContainedRangeView {ownerIndex=owner,dataOffset=owner<0?0:checked((int)(addresses[index]-addresses[owner])),length=lengths[index]};}
      plan.owners=owners.ToArray();return plan;
    }
    public static ContainedRangeStorage ReadContainedRangeStorage(uint[] addresses,int[] lengths,Func<uint,int,byte[]> read) {
      if(read==null)throw new ArgumentNullException("read");ContainedRangeStorage plan=PlanContainedRangeStorage(addresses,lengths);Dictionary<int,byte[]> buffers=new Dictionary<int,byte[]>();
      foreach(int owner in plan.owners){byte[] data=read(addresses[owner],lengths[owner]);if(data==null||data.Length!=lengths[owner])throw new InvalidDataException("Contained backing read must be its exact actual owner extent.");foreach(byte[] previous in buffers.Values)if(Object.ReferenceEquals(previous,data))throw new InvalidDataException("Distinct contained owners cannot reuse a mutable read buffer.");buffers.Add(owner,data);}
      byte[] empty=new byte[0];foreach(ContainedRangeView view in plan.views){view.data=view.ownerIndex<0?empty:buffers[view.ownerIndex];ValidateRangeSegment(view.data,view.dataOffset,view.length);}return plan;
    }
    public static void ValidateRangeSegment(byte[] data,int offset,int length) {
      if(data==null||offset<0||length<0||offset>data.Length||length>data.Length-offset)throw new InvalidDataException("Buffered range segment exceeds its physical backing.");
    }
    public static string DigestRangeSegment(byte[] data,int offset,int length) {ValidateRangeSegment(data,offset,length);using(SHA256 hash=SHA256.Create())return BytesHex(hash.ComputeHash(data,offset,length));}
    public static byte[] CopyRangeSegment(byte[] data,int offset,int length) {ValidateRangeSegment(data,offset,length);byte[] row=new byte[length];Buffer.BlockCopy(data,offset,row,0,length);return row;}
    public static byte[] CopyPatchedRangeSegment(byte[] data,int offset,int length,uint start,uint force,byte[] replacement) {
      if((ulong)start+(ulong)Math.Max(0,length)>0x100000000UL||force==0||(ulong)force+12>0x100000000UL||replacement==null||replacement.Length!=12)throw new InvalidDataException("Patched held range bounds differ.");byte[] row=CopyRangeSegment(data,offset,length);for(int i=0;i<12;i++)if((ulong)force+(uint)i>=start&&(ulong)force+(uint)i<(ulong)start+(ulong)length)row[checked((int)((ulong)force+(uint)i-start))]=replacement[i];return row;
    }
    public static void WriteRangeSegment(Stream stream,byte[] data,int offset,int length) {ValidateRangeSegment(data,offset,length);stream.Write(data,offset,length);}
    static bool SharesHeldRanges(Options o,string role) {return o.heldForceInput!=null&&o.heldForceInput.shareContainedRanges&&(role=="held-pre-input"||role=="before"||role=="after");}
    static Dictionary<string,object> ContainedStorageProof(BufferedSnapshot snapshot,ContainedRangeStorage plan,int debugOrdinal,bool actual) {
      if(actual){long bytes=0;List<byte[]> seen=new List<byte[]>();foreach(int index in plan.owners){BufferedRange r=snapshot.ranges[index];if(r.data==null||r.dataOffset!=0||r.data.Length!=r.length||seen.Contains(r.data))throw new InvalidDataException("Actual contained backings differ from physically allocated owners.");seen.Add(r.data);bytes=checked(bytes+r.data.Length);}if(bytes!=plan.backingBytes)throw new InvalidDataException("Actual contained byte charge differs from allocated storage.");}
      List<object> owners=new List<object>(),views=new List<object>();foreach(int index in plan.owners){BufferedRange r=snapshot.ranges[index];owners.Add(Record("id",r.row["id"],"address",Hex(r.start),"length",r.length));}
      for(int i=0;i<plan.views.Length;i++){ContainedRangeView v=plan.views[i];BufferedRange r=snapshot.ranges[i];if(actual){ValidateRangeSegment(r.data,r.dataOffset,r.length);if(v.ownerIndex>=0&&!Object.ReferenceEquals(r.data,snapshot.ranges[v.ownerIndex].data)||v.ownerIndex<0&&r.data.Length!=0||r.dataOffset!=v.dataOffset)throw new InvalidDataException("Actual contained range identity/offset differs from its plan.");}views.Add(Record("id",r.row["id"],"ownerId",v.ownerIndex<0?null:snapshot.ranges[v.ownerIndex].row["id"],"dataOffset",v.dataOffset,"length",v.length));}
      return Record("mode","snapshot-local-contained-ranges","snapshotLocal",true,"observedDebugEventOrdinal",debugOrdinal,"logicalRangeBytes",plan.logicalBytes,"backingBytes",plan.backingBytes,"backings",owners,"views",views,"physicalBufferIdentityVerified",actual);
    }
    sealed class BufferedSnapshot {
      public Breakpoint breakpoint;
      public byte[] context;
      public List<BufferedRange> ranges = new List<BufferedRange>();
      public Dictionary<string, object> row;
      public string role;
      public int eventIndex;
    }
    sealed class ThreadEnvironmentCapture {
      public Dictionary<string, object> metadata;
      public BufferedRange range;
    }
    //WOW64_LDT_ENTRY/LDT_ENTRY are exactly8 bytes: WORD LimitLow, WORD
    //BaseLow, then BaseMid/Flags1/Flags2/BaseHi. No guessed TEB offsets.
    public static uint DecodeThreadEnvironmentDescriptor(uint selector, byte[] descriptor) {
      if (selector == 0 || selector > 0xffff || descriptor == null || descriptor.Length != 8) throw new InvalidDataException("Thread environment requires a nonzero selector and exact eight-byte descriptor.");
      bool nonzero = false; foreach (byte value in descriptor) if (value != 0) nonzero = true;
      uint address = (uint)BitConverter.ToUInt16(descriptor, 2) | (uint)descriptor[4] << 16 | (uint)descriptor[7] << 24;
      if (!nonzero || address == 0 || (ulong)address + 4 > 0x100000000UL) throw new InvalidDataException("Thread environment descriptor has a zero or invalid x86 FS base.");
      return address;
    }
    static ThreadEnvironmentCapture ReadThreadEnvironment(IntPtr process, IntPtr thread, IntPtr context, uint tid) {
      uint selector = U32(context, 144);
      if (selector == 0 || selector > 0xffff) throw new InvalidDataException("Stopped thread context has an invalid FS selector.");
      byte[] descriptor = new byte[8]; string api = IntPtr.Size == 8 ? "Wow64GetThreadSelectorEntry" : "GetThreadSelectorEntry";
      Check(IntPtr.Size == 8 ? Wow64GetThreadSelectorEntry(thread, selector, descriptor) : GetThreadSelectorEntry(thread, selector, descriptor), api + " owned stopped thread FS selector");
      uint address = DecodeThreadEnvironmentDescriptor(selector, descriptor);
      byte[] data = Bytes(process, address, 4);
      return new ThreadEnvironmentCapture {
        metadata = Record("fsSelector", Hex(selector), "descriptorHex", BytesHex(descriptor), "fsBase", Hex(address), "sehWord", Hex(BitConverter.ToUInt32(data, 0)), "tid", tid, "selectorApi", api, "contextSelectorOffset", 144, "source", "stopped-owned-thread-selector-query"),
        range = new BufferedRange {start = address, length = 4, data = data, row = Record("id", "thread-seh-head", "address", Hex(address), "length", 4, "sha256", Digest(data), "source", "stopped-owned-thread-fs-zero")}
      };
    }
    static Dictionary<string, object> FrameProof(PendingFrameProgress progress) {
      return Record("candidateIndex", progress.candidateIndex, "frameTid", progress.frameTid, "frameEntryEsp", Hex(progress.frameEntryEsp), "frameReturnAddress", Hex(progress.frameReturnAddress), "frameMatchingHit", progress.frameMatchingHit, "observedEventHits", progress.observedEventHits, "qualifyingEventSnapshots", progress.qualifyingEventSnapshots, "nestedSnapshots", progress.nestedSnapshots);
    }
    // Pure metadata construction shared by the actual read path and deterministic
    // tests. An independent leaf has no parent progress or application index.
    static BufferedSnapshot CreateBufferedSnapshotEnvelope(Options options,PendingFrameProgress progress,Breakpoint hit,string role,Action<long> separateReserve) {
      if(options==null||hit==null)throw new ArgumentNullException(options==null?"options":"hit");
      if(progress==null){if(separateReserve==null||options.ownedWorkerGainWindow==null||(role!="worker-leaf-entry"&&role!="worker-leaf-exit"))throw new InvalidDataException("Independent worker envelope requires its separate policy and byte reservation.");}
      else if(separateReserve!=null)throw new InvalidDataException("Parent snapshot cannot borrow the independent worker reservation.");
      return new BufferedSnapshot {breakpoint=hit,role=role,eventIndex=progress==null?0:progress.qualifyingEventSnapshots};
    }
    public static void ActivateOwnedWorkerGainWindow(Options options,OwnedWorkerGainWindowProgress window,int debugOrdinal,uint actualTid,uint ownedMainTid) {
      if(options==null)throw new ArgumentNullException("options");
      if(options.ownedWorkerGainWindow==null)return;
      if(window==null||actualTid!=ownedMainTid)throw new InvalidDataException("Worker leaf activation requires the owned main thread and its state.");
      window.Activate(debugOrdinal,ownedMainTid);
    }
    static BufferedSnapshot ReadBufferedSnapshot(Options options, PendingFrameProgress progress, IntPtr process, IntPtr thread, uint mainBase, Breakpoint hit, uint tid, Dictionary<string, object> regs, IntPtr context, Dictionary<string, object> predicate, string role, long elapsedMs, int debugOrdinal, Action<long> separateReserve = null, Action<Dictionary<string,object>> footprintObserver = null) {
      BufferedSnapshot buffered = CreateBufferedSnapshotEnvelope(options,progress,hit,role,separateReserve);
      long bytes = 716 + (options.captureThreadEnvironment ? 4 : 0);
      List<MemoryRange> selected = new List<MemoryRange>(options.ranges); selected.AddRange(hit.ranges);
      //Query every descriptor before full reads. Defaults reserve duplicated
      //payload; only the explicit held mode allocates/charges contained owners.
      foreach (MemoryRange range in selected) {
        GuardedPointerInfo guard = range.dereferenceMinimumValues == null ? null : ReadGuardedPointerRange(process, mainBase, range);
        uint root = guard == null ? ResolveCaptureRange(process, mainBase, range, regs) : guard.address, start = root;
        int length = guard != null && guard.stopIndex >= 0 ? 0 : range.length; MemoryRegionInfo region = null; VectorStorageInfo vector = null;
        if (range.readableRegion) {region = QueryCaptureRange(process, root, range); start = (uint)region.baseAddress; length = checked((int)region.regionSize);}
        if (range.vectorStorage) {vector = ReadVectorCaptureRange(process, root, range); start = vector.begin; length = vector.length;}
        Dictionary<string, object> row = Record("id", range.id, "address", Hex(start), "rootAddress", range.address, "rootRva", range.rva, "moduleBaseAddress", !String.IsNullOrEmpty(range.rva) ? Hex(mainBase) : null, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "length", length);
        if (region != null) {
          row["rangeMode"] = "readable-region"; row["requestedResolvedRoot"] = Hex(root); row["regionBaseAddress"] = Hex((uint)region.baseAddress); row["regionSize"] = region.regionSize;
          row["regionProtection"] = Hex(region.protection); row["regionState"] = Hex(region.state); row["regionType"] = Hex(region.type); row["maxRegionBytes"] = range.maxRegionBytes;
        }
        if (vector != null) AddVectorCaptureMetadata(row, root, range, vector);
        if (guard != null) AddGuardedPointerMetadata(row, range, guard);
        buffered.ranges.Add(new BufferedRange {start = start, length = length, row = row, descriptor = range, root = root, region = region}); bytes = checked(bytes + GuardedPointerFootprint(guard, length) + (vector != null ? 12 : 0));
      }
      long logicalBytes=bytes;ContainedRangeStorage storage=null;
      uint[] storageAddresses=null;int[] storageLengths=null;
      if(SharesHeldRanges(options,role)){storageAddresses=new uint[buffered.ranges.Count];storageLengths=new int[buffered.ranges.Count];for(int i=0;i<buffered.ranges.Count;i++){storageAddresses[i]=buffered.ranges[i].start;storageLengths[i]=buffered.ranges[i].length;}storage=PlanContainedRangeStorage(storageAddresses,storageLengths);bytes=checked(bytes-storage.logicalBytes+storage.backingBytes);}
      if(footprintObserver!=null){
        List<object> plans=new List<object>();foreach(BufferedRange r in buffered.ranges){Dictionary<string,object> plan=new Dictionary<string,object>(r.row);plan["byteFootprint"]=(long)r.length+(r.descriptor.vectorStorage?12:0);plan["vectorHeaderBytes"]=r.descriptor.vectorStorage?12:0;plans.Add(plan);}
        Dictionary<string,object> diagnostic=Record("type","held-force-budget","metadataBeforeBlobRead",true,"preSnapshotBytes",bytes,"contextBytes",716,"threadEnvironmentBytes",options.captureThreadEnvironment?4:0,"rangeFootprints",plans);
        if(storage!=null){diagnostic["logicalSnapshotBytes"]=logicalBytes;diagnostic["rangeStorage"]=ContainedStorageProof(buffered,storage,debugOrdinal,false);}footprintObserver(diagnostic);
      }
      if(separateReserve==null)progress.Reserve(options.pendingFrameObserver, bytes);else separateReserve(bytes);
      if(storage!=null){storage=ReadContainedRangeStorage(storageAddresses,storageLengths,delegate(uint address,int length){BufferedRange owner=buffered.ranges.Find(delegate(BufferedRange r){return r.start==address&&r.length==length;});return ReadCaptureRangeBytes(process,owner.descriptor,owner.root,owner.start,owner.length,owner.region);});for(int i=0;i<buffered.ranges.Count;i++){BufferedRange r=buffered.ranges[i];r.data=storage.views[i].data;r.dataOffset=storage.views[i].dataOffset;r.row["sha256"]=DigestRangeSegment(r.data,r.dataOffset,r.length);}}
      else foreach (BufferedRange range in buffered.ranges) {range.data = ReadCaptureRangeBytes(process, range.descriptor, range.root, range.start, range.length, range.region); range.row["sha256"] = Digest(range.data);}
      ThreadEnvironmentCapture environment = options.captureThreadEnvironment ? ReadThreadEnvironment(process, thread, context, tid) : null;
      if (environment != null) buffered.ranges.Add(environment.range);
      buffered.context = new byte[716]; Marshal.Copy(context, buffered.context, 0, buffered.context.Length);
      buffered.row = Record("type", "snapshot", "breakpointId", hit.id, "tid", tid, "registers", regs, "contextSha256", Digest(buffered.context), "capturePhase", "before-declared-writes-before-original-instruction", "rawHit", hit.hits, "matchingHit", hit.captureWhen == null ? hit.hits : hit.matchingHits, "deferredPublication", true, "observedElapsedMs", elapsedMs, "observedDebugEventOrdinal", debugOrdinal);
      if (predicate != null) buffered.row["captureWhen"] = predicate;
      if (environment != null) buffered.row["threadEnvironment"] = environment.metadata;
      if(storage!=null)buffered.row["rangeStorage"]=ContainedStorageProof(buffered,storage,debugOrdinal,true);
      return buffered;
    }
    static void CommitBufferedGroup(Options options, PendingFrameProgress progress, List<BufferedSnapshot> buffered, ref int snapshots, Action<Dictionary<string, object>> emit) {
      if (buffered.Count > options.maxSnapshots - snapshots) throw new InvalidDataException("Pending-frame group exceeds remaining global snapshot bound.");
      int ordinal = snapshots;
      Dictionary<Breakpoint, int> counts = new Dictionary<Breakpoint, int>();
      foreach (BufferedSnapshot snapshot in buffered) {
        ordinal++;
        List<object> rows = new List<object>(); int rangeOrdinal = 0;
        foreach (BufferedRange range in snapshot.ranges) {
          string file = "snapshot-" + ordinal.ToString("D6") + "-range-" + (++rangeOrdinal).ToString("D3") + ".bin";
          using (FileStream stream = new FileStream(Path.Combine(options.outputDirectory, file), FileMode.CreateNew)) WriteRangeSegment(stream,range.data,range.dataOffset,range.length);
          range.row["file"] = file; rows.Add(range.row);
        }
        string contextFile = "snapshot-" + ordinal.ToString("D6") + "-context.bin";
        using (FileStream stream = new FileStream(Path.Combine(options.outputDirectory, contextFile), FileMode.CreateNew)) stream.Write(snapshot.context, 0, snapshot.context.Length);
        int count; if (!counts.TryGetValue(snapshot.breakpoint, out count)) count = snapshot.breakpoint.captureHits;
        counts[snapshot.breakpoint] = ++count;
        snapshot.row["ordinal"] = ordinal; snapshot.row["hit"] = count; snapshot.row["contextFile"] = contextFile; snapshot.row["ranges"] = rows;
        Dictionary<string, object> proof = FrameProof(progress); proof["role"] = snapshot.role;
        if (snapshot.role == "event") proof["eventIndex"] = snapshot.eventIndex;
        snapshot.row["pendingFrame"] = proof;
      }
      // No snapshot row or counter claims a committed frame until ALL immutable
      // files exist. A partial I/O failure leaves evidence files plus an error.
      foreach (KeyValuePair<Breakpoint, int> count in counts) count.Key.captureHits = count.Value;
      int first = snapshots + 1; snapshots = ordinal;
      foreach (BufferedSnapshot snapshot in buffered) emit(snapshot.row);
      Dictionary<string, object> selected = FrameProof(progress); selected["type"] = "pending-frame-selected"; selected["firstOrdinal"] = first; selected["lastOrdinal"] = ordinal; selected["bufferedBytes"] = progress.bufferedBytes; emit(selected);
    }
    static BufferedSnapshot ReadWorkerWindowSnapshot(Options options,OwnedWorkerGainWindowProgress window,IntPtr process,IntPtr thread,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,IntPtr context,string role,long elapsedMs,int debugOrdinal) {
      return ReadBufferedSnapshot(options,null,process,thread,mainBase,hit,tid,regs,context,null,role,elapsedMs,debugOrdinal,delegate(long bytes){window.Reserve(bytes,options.ownedWorkerGainWindow.maxBufferedBytes);});
    }
    static void CommitWorkerGainWindow(Options options,OwnedWorkerGainWindowProgress window,List<BufferedSnapshot> buffered,ref int snapshots,Action<Dictionary<string,object>> emit) {
      if(!window.call.complete||buffered.Count!=2||buffered.Count>options.maxSnapshots-snapshots)throw new InvalidDataException("Worker leaf publication requires one complete bounded pair.");
      int ordinal=snapshots;
      foreach(BufferedSnapshot item in buffered){
        ordinal++;int rangeOrdinal=0;List<object> ranges=new List<object>();
        foreach(BufferedRange range in item.ranges){string file="snapshot-"+ordinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream stream=new FileStream(Path.Combine(options.outputDirectory,file),FileMode.CreateNew))WriteRangeSegment(stream,range.data,range.dataOffset,range.length);range.row["file"]=file;ranges.Add(range.row);}
        string contextFile="snapshot-"+ordinal.ToString("D6")+"-context.bin";using(FileStream stream=new FileStream(Path.Combine(options.outputDirectory,contextFile),FileMode.CreateNew))stream.Write(item.context,0,item.context.Length);
        item.row["ordinal"]=ordinal;item.row["hit"]=item.breakpoint.captureHits+1;item.row["contextFile"]=contextFile;item.row["ranges"]=ranges;
        item.row["workerObservationWindow"]=Record("role",item.role,"activationDebugEventOrdinal",window.activationDebugOrdinal,"ownerMainTid",window.ownerTid,"sameParentInterleavingClaimed",false);
      }
      snapshots=ordinal;foreach(BufferedSnapshot item in buffered){item.breakpoint.captureHits++;emit(item.row);}
      emit(Record("type","worker-gain-window-pair-published","activationDebugEventOrdinal",window.activationDebugOrdinal,"tid",window.call.tid,"source",Hex(window.call.source),"entryEsp",Hex(window.call.esp),"snapshotCount",2,"sameParentInterleavingClaimed",false));buffered.Clear();window.bufferedBytes=0;
    }
    static void VerifyHeldContext(IntPtr thread, Breakpoint hit, byte[] expected) {
      IntPtr actual = Context(thread);
      try {
        Marshal.WriteInt32(actual,184,unchecked((int)hit.resolved));
        byte[] bytes = new byte[716]; Marshal.Copy(actual,bytes,0,716);
        if (Digest(bytes) != Digest(expected)) throw new InvalidDataException("Held original thread context changed before force input.");
      } finally {Marshal.FreeHGlobal(actual);}
    }
    static void VerifyHeldRanges(IntPtr process, uint mainBase, Dictionary<string,object> regs, BufferedSnapshot before, uint force, byte[] replacement) {
      ValidateHeldBankSnapshot(before,mainBase);
      foreach (BufferedRange r in before.ranges) {
        if (r.descriptor != null && ResolveCaptureRange(process,mainBase,r.descriptor,regs) != r.root) throw new InvalidDataException("Held input root chain changed.");
        if(r.descriptor!=null&&r.descriptor.vectorStorage){
          VectorStorageInfo current=ReadVectorCaptureRange(process,r.root,r.descriptor);
          ValidateHeldBankHeader(current.header,ParseBytes((string)r.row["vectorHeaderHex"]),r.root,Add(mainBase,0x2f2414));
          if(current.begin!=r.start||current.length!=r.length)throw new InvalidDataException("Held bank capacity/storage changed.");
        }
        if (r.region != null) {
          MemoryRegionInfo actual=QueryCaptureRange(process,r.root,r.descriptor);
          if(actual.baseAddress!=r.region.baseAddress||actual.allocationBaseAddress!=r.region.allocationBaseAddress||actual.regionSize!=r.region.regionSize||actual.state!=r.region.state||actual.protection!=r.region.protection||actual.type!=r.region.type)throw new InvalidDataException("Held readable-region ownership/protection changed.");
        }
        ValidateRangeSegment(r.data,r.dataOffset,r.length);string expectedDigest=DigestRangeSegment(r.data,r.dataOffset,r.length);
        if (replacement != null && (ulong)r.start < (ulong)force + 12 && (ulong)force < (ulong)r.start + (ulong)r.length) {
          byte[] expected = CopyPatchedRangeSegment(r.data,r.dataOffset,r.length,r.start,force,replacement);
          expectedDigest=Digest(expected);
        }
        if (Digest(Bytes(process,r.start,r.length)) != expectedDigest) throw new InvalidDataException("Held input span changed outside its exact force window.");
      }
    }
    static void ValidateHeldBankSnapshot(BufferedSnapshot snapshot,uint mainBase) {
      BufferedRange bank=snapshot.ranges.Find(delegate(BufferedRange r){return r.descriptor!=null&&r.descriptor.id=="active-sound-bank-storage";});
      if(bank==null)return;
      BufferedRange header=snapshot.ranges.Find(delegate(BufferedRange r){return r.descriptor!=null&&r.descriptor.id=="sound-owner-vector-roots";});
      if(!IsHeldBankVector(bank.descriptor)||header==null||header.length!=12||header.start!=bank.root)throw new InvalidDataException("Held bank header must be a separate captured global row.");
      VectorStorageInfo v=ValidateHeldBankHeader(ParseBytes((string)bank.row["vectorHeaderHex"]),CopyRangeSegment(header.data,header.dataOffset,header.length),bank.root,Add(mainBase,0x2f2414));
      ValidateRangeSegment(bank.data,bank.dataOffset,bank.length);if(v.begin!=bank.start||v.length!=bank.length)throw new InvalidDataException("Held bank storage differs from its actual header capacity.");
    }
    static void ApplyHeldForceInput(Options o, PendingFrameProgress frame, ProcessInfo child, IntPtr thread, uint mainBase, Breakpoint hit, uint tid, Dictionary<string,object> regs, IntPtr context, Dictionary<string,object> predicate, int debugOrdinal, ref int snapshots, Stopwatch elapsed, Action<Dictionary<string,object>> emit) {
      long started = elapsed.ElapsedMilliseconds;
      uint session = BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecb1c),4),0), esp = Number((string)regs["esp"]);
      if (tid != child.tid || Number((string)regs["eip"]) != Add(mainBase,0x749e0) || BitConverter.ToUInt32(Bytes(child.process,session+0x57c,4),0) != 4 || Bytes(child.process,session+0x54d,1)[0] != 6 || BitConverter.ToUInt32(Bytes(child.process,esp,4),0) != Add(mainBase,0x51017)) throw new InvalidDataException("Held force requires the actual owned main-thread six-car phase4 entry/caller.");
      Breakpoint eventPoint=Array.Find(o.breakpoints,delegate(Breakpoint b){return b.id==o.pendingFrameObserver.eventBreakpointId;});
      long eventBytes=716+(o.captureThreadEnvironment?4:0);
      foreach(MemoryRange r in eventPoint.ranges){if(r.readableRegion||r.vectorStorage||r.dereferenceMinimumValues!=null)throw new InvalidDataException("Held dispatcher budget requires fixed-length observations.");eventBytes=checked(eventBytes+r.length);}
      int snapshotsBefore=snapshots;
      BufferedSnapshot pre = ReadBufferedSnapshot(o,frame,child.process,thread,mainBase,hit,tid,regs,context,predicate,"held-pre-input",elapsed.ElapsedMilliseconds,debugOrdinal,null,delegate(Dictionary<string,object> diagnostic){
        long required=HeldForceRequiredBytes(Convert.ToInt64(diagnostic["preSnapshotBytes"],CultureInfo.InvariantCulture),eventBytes);
        bool enough=snapshotsBefore+67<=o.maxSnapshots&&required<=o.pendingFrameObserver.maxPendingBytes;
        diagnostic["pid"]=child.pid;diagnostic["tid"]=tid;diagnostic["observedDebugEventOrdinal"]=debugOrdinal;diagnostic["eventSnapshotBytes"]=eventBytes;diagnostic["eventReserveBytes"]=eventBytes*64;diagnostic["requiredPendingBytes"]=required;diagnostic["pendingLimitBytes"]=o.pendingFrameObserver.maxPendingBytes;diagnostic["snapshotsBefore"]=snapshotsBefore;diagnostic["requiredAdditionalSnapshots"]=67;diagnostic["snapshotLimit"]=o.maxSnapshots;diagnostic["sufficient"]=enough;emit(diagnostic);
        if(!enough)throw new InvalidDataException("Held force lacks pre/post/after and complete dispatcher observation budgets; no input written.");
      });
      ValidateHeldBankSnapshot(pre,mainBase);
      EmitHeldStorageProof(o,child,pre,emit);
      int ordinal = snapshots+1, rangeOrdinal=0; List<object> rows = new List<object>();
      foreach (BufferedRange r in pre.ranges) {
        string name="snapshot-"+ordinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";
        using(FileStream s=new FileStream(Path.Combine(o.outputDirectory,name),FileMode.CreateNew))WriteRangeSegment(s,r.data,r.dataOffset,r.length);
        r.row["file"]=name;rows.Add(r.row);
      }
      string contextFile="snapshot-"+ordinal.ToString("D6")+"-context.bin";
      using(FileStream s=new FileStream(Path.Combine(o.outputDirectory,contextFile),FileMode.CreateNew))s.Write(pre.context,0,716);
      pre.row["ordinal"]=ordinal;pre.row["hit"]=1;pre.row["breakpointId"]="held-force-pre-input";pre.row["observedBreakpointId"]=hit.id;pre.row["capturePhase"]="held-pre-input-before-original-instruction";pre.row["contextFile"]=contextFile;pre.row["ranges"]=rows;
      snapshots=ordinal;emit(pre.row);
      string token=Guid.NewGuid().ToString("N"),requestFile=Path.Combine(o.outputDirectory,"held-force-request.json");
      Dictionary<string,object> request=Record("schemaVersion",1,"kind","held-chassis-force-input","token",token,"targetSha256",o.expectedSha256.ToLowerInvariant(),"pid",child.pid,"tid",tid,"moduleBaseAddress",Hex(mainBase),"clock",BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x50a548),4),0),"observedDebugEventOrdinal",debugOrdinal,"maxHoldMs",20000,"maxAttempts",24,"maxPendingBytes",128*1024*1024,"snapshot",pre.row);
      byte[] requestBytes=Encoding.UTF8.GetBytes(Json(request)+"\n");
      string requestPending=Path.Combine(o.outputDirectory,"held-force-request.pending");
      using(FileStream s=new FileStream(requestPending,FileMode.CreateNew))s.Write(requestBytes,0,requestBytes.Length);
      File.Move(requestPending,requestFile);
      string requestSha=Digest(requestBytes),decisionFile=Path.Combine(o.outputDirectory,"held-force-decision.txt");
      emit(Record("type","held-force-waiting","token",token,"requestFile","held-force-request.json","requestSha256",requestSha,"pid",child.pid,"tid",tid,"observedDebugEventOrdinal",debugOrdinal,"preInputOrdinal",ordinal,"deadlineElapsedMs",Math.Min(started+20000,o.maxDurationMs),"allOwnedThreadsStoppedByDebugEvent",true));
      while (!File.Exists(decisionFile)) {
        if (HeldForceDeadlineExpired(started,elapsed.ElapsedMilliseconds,o.maxDurationMs)) throw new InvalidDataException("Held force deadline expired; no input written and no automatic retry.");
        System.Threading.Thread.Sleep(25);
      }
      if (HeldForceDeadlineExpired(started,elapsed.ElapsedMilliseconds,o.maxDurationMs) || new FileInfo(decisionFile).Length>4096 || (File.GetAttributes(decisionFile)&FileAttributes.ReparsePoint)!=0) throw new InvalidDataException("Held force decision deadline/file bound.");
      HeldForceDecision d=ParseHeldForceDecision(File.ReadAllText(decisionFile,Encoding.UTF8),token,requestSha);
      string planFile=Path.Combine(o.outputDirectory,"held-force-plan.json");
      if(!File.Exists(planFile)||new FileInfo(planFile).Length>8*1024*1024||(File.GetAttributes(planFile)&FileAttributes.ReparsePoint)!=0||Digest(File.ReadAllBytes(planFile))!=d.planSha256)throw new InvalidDataException("Held force source plan proof missing or changed.");
      VerifyHeldContext(thread,hit,pre.context);VerifyHeldRanges(child.process,mainBase,regs,pre,0,null);
      uint body=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x509300+(uint)d.participantIndex*0x30c),4),0);
      uint arena=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x502eec),4),0),used=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x30dcf4),4),0);
      byte[] bodyBytes=Bytes(child.process,body,0x3e78);
      uint list=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x502bc0),4),0);int count=BitConverter.ToUInt16(Bytes(child.process,Add(mainBase,0x502bc4),2),0);
      if(count>=96||count<1)throw new InvalidDataException("Held force physical body-list bound.");
      byte[] physical=Bytes(child.process,list,(count+1)*4);ValidateHeldForceBody(d,bodyBytes,body,arena,used,physical);
      uint registryCount=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x2e6b44),4),0);int registryIndex=BitConverter.ToUInt16(bodyBytes,0x10e);
      if(registryCount>512||registryIndex>=registryCount||BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x30e200+(uint)registryIndex*4),4),0)!=body||Bytes(child.process,hit.resolved,1)[0]!=0xcc||HeldForceDeadlineExpired(started,elapsed.ElapsedMilliseconds,o.maxDurationMs))throw new InvalidDataException("Held force final registry/code/deadline guard.");
      uint target=Add(body,0x74);Write(child.process,target,d.replacement);
      VerifyHeldContext(thread,hit,pre.context);VerifyHeldRanges(child.process,mainBase,regs,pre,target,d.replacement);
      if(HeldForceDeadlineExpired(started,elapsed.ElapsedMilliseconds,o.maxDurationMs))throw new InvalidDataException("Held force verification exceeded deadline; input retained, original instruction not resumed.");
      emit(Record("type","held-force-intervention","breakpointId",hit.id,"rawHit",hit.hits,"pid",child.pid,"tid",tid,"observedDebugEventOrdinal",debugOrdinal,"preInputOrdinal",ordinal,"token",token,"requestSha256",requestSha,"sourcePlanSha256",d.planSha256,"participantIndex",d.participantIndex,"bodyAddress",Hex(body),"address",Hex(target),"length",12,"originalBytesHex",BytesHex(d.original),"replacementBytesHex",BytesHex(d.replacement),"originalBodySha256",d.bodySha256,"normalQ16",d.normal,"signedScalarQ16",d.scalar,"allCapturedInputSpansRevalidated",true,"allNonForceBytesUnchanged",true,"contextUnchanged",true,"holdElapsedMs",elapsed.ElapsedMilliseconds-started,"beforeOriginalInstruction",true,"nativeCounterfactualCompared",false));
    }
    static void EmitHeldStorageProof(Options o,ProcessInfo child,BufferedSnapshot snapshot,Action<Dictionary<string,object>> emit) {
      if(!SharesHeldRanges(o,snapshot.role))return;
      emit(Record("type","held-force-range-storage","pid",child.pid,"tid",snapshot.row["tid"],"observedDebugEventOrdinal",snapshot.row["observedDebugEventOrdinal"],"role",snapshot.role,"rangeStorage",snapshot.row["rangeStorage"]));
    }
    static void ApplyControlledRaceSettings(Options o,ProcessInfo child,IntPtr thread,uint mainBase,Breakpoint hit,uint tid,byte[] context,Dictionary<string,object> snapshot,int debugOrdinal,Action<Dictionary<string,object>> emit) {
      if(hit.hits!=1||hit.captureHits!=1||hit.original!=0xa1||Bytes(child.process,hit.resolved,1)[0]!=0xcc||BitConverter.ToUInt32(Bytes(child.process,Add(hit.resolved,1),4),0)!=Add(mainBase,0x1ecefc))throw new InvalidDataException("Controlled settings one-shot original instruction guard differs.");
      uint config=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecefc),4),0),session=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecb1c),4),0),esp=BitConverter.ToUInt32(context,196);
      byte[] frontend=new byte[20];Bytes(child.process,Add(mainBase,0x1ec138),4).CopyTo(frontend,0);Bytes(child.process,Add(mainBase,0x2e6654),4).CopyTo(frontend,4);Bytes(child.process,Add(mainBase,0x2e66c8),8).CopyTo(frontend,8);Bytes(child.process,Add(mainBase,0x2e6aac),4).CopyTo(frontend,16);
      byte[] before=Bytes(child.process,config,128),stack=Bytes(child.process,esp,28),replacement=ControlledRaceSettingsReplacement(o.controlledRaceSettings,mainBase,child.tid,tid,config,session,before,stack,context,frontend);
      List<object> ranges=(List<object>)snapshot["ranges"];
      foreach(object item in ranges){Dictionary<string,object> r=(Dictionary<string,object>)item;if(Digest(Bytes(child.process,Number((string)r["address"]),Convert.ToInt32(r["length"])))!=(string)r["sha256"])throw new InvalidDataException("Controlled settings captured pre-input span changed.");}
      VerifyHeldContext(thread,hit,context);
      byte[] code=Bytes(child.process,hit.resolved,5);string patchedCode=BytesHex(code);code[0]=hit.original;
      emit(Record("type","controlled-race-settings-guarded","pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"rawHit",hit.hits,"snapshotOrdinal",snapshot["ordinal"],"observedDebugEventOrdinal",debugOrdinal,"configurationAddress",Hex(config),"sessionAddress",Hex(session),"stackAddress",Hex(esp),"stackBytesHex",BytesHex(stack),"configurationBeforeHex",BytesHex(before),"contextSha256",Digest(context),"allGuardsBeforeWrites",true,"beforeOriginalInstruction",true,"instructionAddress",Hex(hit.resolved),"breakpointInstructionHex",patchedCode,"restoredInstructionHex",BytesHex(code)));
      int[] offsets={0x0b,0x31};for(int i=0;i<offsets.Length;i++) {
        int offset=offsets[i];Write(child.process,Add(config,offset),new byte[]{replacement[offset]});
        emit(Record("type","controlled-race-settings-input-write","pid",child.pid,"tid",tid,"observedDebugEventOrdinal",debugOrdinal,"snapshotOrdinal",snapshot["ordinal"],"index",i+1,"address",Hex(Add(config,offset)),"length",1,"originalBytesHex",before[offset].ToString("x2"),"replacementBytesHex",replacement[offset].ToString("x2")));
      }
      byte[] after=Bytes(child.process,config,128);VerifyHeldContext(thread,hit,context);ValidateControlledRaceSettingsTransition(before,after,replacement,context,context);
      if(BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecefc),4),0)!=config||BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecb1c),4),0)!=session)throw new InvalidDataException("Controlled settings roots changed after input.");
      foreach(object item in ranges){Dictionary<string,object> r=(Dictionary<string,object>)item;uint start=Number((string)r["address"]);byte[] data=Bytes(child.process,start,Convert.ToInt32(r["length"]));for(int i=0;i<data.Length;i++)if((ulong)start+(uint)i==(ulong)config+0x0b||(ulong)start+(uint)i==(ulong)config+0x31)data[i]=before[(int)((ulong)start+(uint)i-config)];if(Digest(data)!=(string)r["sha256"])throw new InvalidDataException("Controlled settings changed an unrelated captured byte.");}
      emit(Record("type","controlled-race-settings-intervention","pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"rawHit",hit.hits,"snapshotOrdinal",snapshot["ordinal"],"observedDebugEventOrdinal",debugOrdinal,"configurationAddress",Hex(config),"sessionAddress",Hex(session),"level",o.controlledRaceSettings.level,"quality",o.controlledRaceSettings.quality,"configurationBeforeHex",BytesHex(before),"configurationAfterHex",BytesHex(after),"contextSha256",Digest(context),"contextUnchanged",true,"allOtherCapturedBytesUnchanged",true,"rootsUnchanged",true,"allGuardsBeforeWrites",true,"beforeOriginalInstruction",true,"nativeOutputsWritten",false));
    }
    static void VerifyControlledRaceSettingsNativeOutputs(Options o,ProcessInfo child,uint mainBase,uint tid,int debugOrdinal,Action<Dictionary<string,object>> emit) {
      uint session=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x1ecb1c),4),0);byte[] header=Bytes(child.process,session,48),runtime=Bytes(child.process,Add(session,0x54d),0xd3),family=Bytes(child.process,Add(mainBase,0x174760),20),local=Bytes(child.process,Add(mainBase,0x17477c),20),stem=Bytes(child.process,Add(mainBase,0x2e6660),260);
      ValidateControlledRaceSettingsOutputs(o.controlledRaceSettings,header,runtime,family,local,stem);
      emit(Record("type","controlled-race-settings-native-outputs","pid",child.pid,"tid",tid,"observedDebugEventOrdinal",debugOrdinal,"sessionAddress",Hex(session),"level",o.controlledRaceSettings.level,"quality",o.controlledRaceSettings.quality,"sessionHeaderHex",BytesHex(header),"sessionRuntimeHex",BytesHex(runtime),"familyTableHex",BytesHex(family),"localTableHex",BytesHex(local),"nativeStemHex",BytesHex(stem),"nativeOutputsWritten",false,"configurationPersistenceAssumed",false,"beforeHeldRequest",true));
    }
    static Dictionary<string,object> ParentRttiProof(ParentRttiProgress state,ProcessInfo child,Breakpoint hit,uint tid,int debugOrdinal,string type) {
      return Record("type",type,"pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"observedDebugEventOrdinal",debugOrdinal,"parentEntryDebugEventOrdinal",state.parentDebugOrdinal,"parentEntryEsp",Hex(state.parentEsp),"parentClock",state.clock,"parentIteration",state.iteration,"parentCaller",Hex(state.caller),"parentTotalIterations",state.totalIterations,"activationDebugEventOrdinal",state.activationDebugOrdinal);
    }
    static Dictionary<string,object> PrepareParentRttiCheckpoint(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit,out Dictionary<string,object> closed) {
      closed=null;
      if(tid!=child.tid||hit.captureHits!=0||hit.matchingHits!=hit.skipMatchingHits.Value+1)throw new InvalidDataException("Parent RTTI selected checkpoint is not its first owned main observation.");
      uint esp=Number((string)regs["esp"]),clock=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x50a548),4),0);bool entry=hit.id==o.parentRttiObservation.parentBreakpointId,physical=hit.id=="native-control-after"||hit.id=="native-control-after-physics";
      uint[] nonvolatileRegisters={Number((string)regs["edi"]),Number((string)regs["esi"]),Number((string)regs["ebp"]),Number((string)regs["ebx"])};
      state.ObserveStage(hit.id,mainBase,child.tid,tid,esp,clock,Number((string)regs[entry?"edx":"ebp"]),Bytes(child.process,esp,entry?8:physical?28:24),nonvolatileRegisters,debugOrdinal);
      if(hit.id==o.parentRttiObservation.endBreakpointId){closed=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-closed");closed["snapshotOrdinal"]=snapshotOrdinal;closed["actualPairs"]=state.pairs;closed["actualSnapshots"]=state.captured;closed["callOpen"]=false;closed["windowOpen"]=false;closed["breakpointsRemainArmedForDeferredReplay"]=true;closed["beforeSnapshotRangeResolution"]=true;closed["beforeOriginalInstruction"]=true;emit(closed);}
      if(Array.IndexOf(o.parentRttiObservation.singletonMapPreflight.breakpointIds,hit.id)<0)return null;
      ParentRttiMapRead map;
      try {map=ReadParentRttiMapSource(mainBase,child.tid,tid,delegate(uint address,int length){return Bytes(child.process,address,length);});state.ObserveMap(hit.id,map.appAddress,map.headAddress);}
      catch(Exception error){Dictionary<string,object> failed=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-preflight-failed");failed["beforeSnapshotRangeResolution"]=true;failed["sameStoppedDebugEvent"]=true;failed["error"]=error.ToString();emit(failed);throw;}
      Dictionary<string,object> proof=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-preflight");proof["snapshotOrdinal"]=snapshotOrdinal;proof["rootAddress"]=Hex(map.rootAddress);proof["rootBytesHex"]=BytesHex(map.rootBytes);proof["appAddress"]=Hex(map.appAddress);proof["headSlotAddress"]=Hex(map.headSlotAddress);proof["headBytesHex"]=BytesHex(map.headBytes);proof["headAddress"]=Hex(map.headAddress);proof["identitiesLatchedOrStable"]=true;proof["identityAction"]=entry?"latched":"stable";proof["beforeSnapshotRangeResolution"]=true;proof["phasePredicateAlreadySelected"]=true;proof["sameStoppedDebugEvent"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> ActivateParentRtti(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint auxiliary,uint tid,int debugOrdinal,int snapshotOrdinal,List<Breakpoint> breakpoints,Action<Dictionary<string,object>> emit) {
      state.MarkAuxiliaryCaptured(snapshotOrdinal);state.Activate(debugOrdinal,tid);List<object> installed=new List<object>();
      foreach(string id in new string[]{o.parentRttiObservation.callBreakpointId,o.parentRttiObservation.returnBreakpointId}) {
        Breakpoint b=breakpoints.Find(delegate(Breakpoint point){return point.id==id;});string expected=id==o.parentRttiObservation.callBreakpointId?"e89f651600":"83c414";
        byte[] code=Bytes(child.process,b.resolved,expected.Length/2);ValidateParentRttiDeferredCode(id==o.parentRttiObservation.callBreakpointId,b.original,b.armed,b.hits,b.matchingHits,b.captureHits,code);
        Write(child.process,b.resolved,new byte[]{0xcc});b.armed=true;Dictionary<string,object> armed=ParentRttiProof(state,child,auxiliary,tid,debugOrdinal,"parent-rtti-breakpoint-activated");armed["id"]=b.id;armed["address"]=Hex(b.resolved);armed["originalBytesHex"]=expected;armed["patchBytesHex"]="cc";armed["beforeOriginalInstruction"]=true;emit(armed);installed.Add(Record("id",b.id,"address",Hex(b.resolved),"originalBytesHex",expected,"patchBytesHex","cc"));
      }
      Dictionary<string,object> proof=ParentRttiProof(state,child,auxiliary,tid,debugOrdinal,"parent-rtti-activation");proof["auxiliarySnapshotOrdinal"]=snapshotOrdinal;proof["installed"]=installed;proof["afterSnapshotBytesCaptured"]=true;proof["beforeSnapshotPublication"]=true;proof["beforeOriginalInstruction"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> AdmitParentRtti(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit) {
      uint esp=Number((string)regs["esp"]);ParentRttiEndpointRead observed=ReadParentRttiEndpoint(state,mainBase,tid,esp,delegate(uint address,int length){return Bytes(child.process,address,length);});bool entry=hit.id==o.parentRttiObservation.callBreakpointId;
      if(observed==null||!observed.commonCaller){if(observed!=null&&!entry&&state.callOpen)throw new InvalidDataException("Parent RTTI matched return changed its common wrapper lineage.");Dictionary<string,object> skipped=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-skipped");skipped["rawHit"]=hit.hits;skipped["reason"]=observed==null?(!state.windowOpen?"outside-selected-parent-camera-window":tid!=state.tid?"different-owned-thread":"different-derived-stack"):"different-common-camera-caller";skipped["matchingHitAdvanced"]=false;skipped["snapshotCountAdvanced"]=false;skipped["originalInstructionSkipped"]=false;emit(skipped);return null;}
      state.ValidateEndpoint(entry,mainBase,tid,esp,BitConverter.ToUInt32(observed.clockBytes,0),BitConverter.ToUInt32(observed.singletonBytes,0),observed.context,observed.cameraReturn,debugOrdinal);
      Dictionary<string,object> proof=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-admitted");proof["role"]=entry?"call":"return";proof["rawHit"]=hit.hits;proof["pairIndex"]=state.pairs+1;proof["snapshotOrdinal"]=snapshotOrdinal;proof["derivedQ"]=Hex(state.parentEsp-276);proof["stackAddress"]=Hex(esp);proof["stackBytesHex"]=BytesHex(observed.context);proof["cameraReturnAddress"]=Hex(state.parentEsp-20);proof["cameraReturnBytesHex"]=BytesHex(observed.cameraReturn);proof["actualSingletonBytesHex"]=BytesHex(observed.singletonBytes);proof["actualClockBytesHex"]=BytesHex(observed.clockBytes);proof["actualArgumentsHex"]=BytesHex(CopyRangeSegment(observed.context,0,20));proof["commonAbiMatched"]=true;proof["beforeSnapshotRangeResolution"]=true;proof["beforeOriginalInstruction"]=true;emit(proof);return proof;
    }
    static void CaptureThreadDiagnostics(ProcessInfo child, Dictionary<uint, IntPtr> ownedThreads, string directory, int stackLength, Action<Dictionary<string, object>> emit) {
      // These handles come only from this debugger's CREATE_PROCESS/CREATE_THREAD
      // events. Increment/decrement only our diagnostic suspend counts.
      Dictionary<uint, IntPtr> threads = new Dictionary<uint, IntPtr>(ownedThreads);
      if (!threads.ContainsKey(child.tid) && child.thread != IntPtr.Zero) threads.Add(child.tid, child.thread);
      List<KeyValuePair<uint, IntPtr>> diagnosticSuspensions = new List<KeyValuePair<uint, IntPtr>>();
      Dictionary<uint, IntPtr> stopped = new Dictionary<uint, IntPtr>();
      int contexts = 0, stacks = 0, errors = 0;
      Action<Dictionary<string, object>> report = delegate(Dictionary<string, object> row) {try {emit(row);} catch { /* Diagnostics must not prevent owned-child cleanup. */ }};
      try {
        foreach (KeyValuePair<uint, IntPtr> thread in threads) {
          uint previous;
          try {
            if (!ChangeTrackedThreadSuspension(thread.Value, child.pid, thread.Key, false, "suspend-stop-diagnostic", report, out previous)) continue;
          } catch (Win32Exception error) {
            errors++; report(Record("type", "thread-diagnostic-error", "stage", "suspend", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", error.NativeErrorCode, "error", error.Message));
            continue;
          }
          diagnosticSuspensions.Add(thread); stopped.Add(thread.Key, thread.Value);
          report(Record("type", "thread-diagnostic-suspend", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "previousSuspendCount", previous));
        }
        foreach (KeyValuePair<uint, IntPtr> thread in stopped) {
          IntPtr data = IntPtr.Zero; string diagnosticStage = "get-context";
          try {
            data = Context(thread.Value); Dictionary<string, object> regs = Registers(data);
            byte[] raw = new byte[716]; Marshal.Copy(data, raw, 0, raw.Length);
            string contextFile = "stop-thread-" + thread.Key.ToString(CultureInfo.InvariantCulture) + "-context.bin";
            diagnosticStage = "write-context";
            using (FileStream blob = new FileStream(Path.Combine(directory, contextFile), FileMode.CreateNew)) blob.Write(raw, 0, raw.Length);
            contexts++; object stack = null; string stackError = null;
            if (stackLength > 0) {
              try {
                uint address = Number((string)regs["esp"]); byte[] bytes = Bytes(child.process, address, stackLength);
                string stackFile = "stop-thread-" + thread.Key.ToString(CultureInfo.InvariantCulture) + "-stack.bin";
                using (FileStream blob = new FileStream(Path.Combine(directory, stackFile), FileMode.CreateNew)) blob.Write(bytes, 0, bytes.Length);
                stack = Record("address", Hex(address), "length", bytes.Length, "file", stackFile, "sha256", Digest(bytes)); stacks++;
              } catch (Exception error) {
                stackError = error.ToString(); errors++;
                report(Record("type", "thread-diagnostic-error", "stage", "read-or-write-stack", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "error", stackError));
              }
            }
            report(Record("type", "thread-context", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "registers", regs, "contextFile", contextFile, "contextLength", raw.Length, "contextSha256", Digest(raw), "stack", stack, "stackError", stackError, "phase", "best-effort-stop-diagnostic-before-owned-child-cleanup"));
          } catch (Exception error) {
            errors++; report(Record("type", "thread-diagnostic-error", "stage", diagnosticStage, "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "error", error.ToString()));
          } finally {if (data != IntPtr.Zero) Marshal.FreeHGlobal(data);}
        }
      } catch (Exception error) {
        errors++; report(Record("type", "thread-diagnostic-error", "stage", "collection", "pid", child.pid, "error", error.ToString()));
      } finally {
        foreach (KeyValuePair<uint, IntPtr> thread in diagnosticSuspensions) {
          uint previous;
          try {ChangeTrackedThreadSuspension(thread.Value, child.pid, thread.Key, true, "resume-own-diagnostic-suspension", report, out previous);}
          catch (Win32Exception error) {errors++; report(Record("type", "thread-diagnostic-error", "stage", "resume-own-diagnostic-suspension", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", error.NativeErrorCode, "error", error.Message));}
        }
        report(Record("type", "thread-diagnostics-complete", "pid", child.pid, "mainTid", child.tid, "requestedThreads", threads.Count, "suspendedThreads", stopped.Count, "contexts", contexts, "stacks", stacks, "stackBytesPerThread", stackLength, "errors", errors, "limitation", "Best-effort WOW64 contexts may describe a thread waiting in system code; these are diagnostic samples, not ordered physics stages."));
      }
    }
    public static int Run(Options o) { return Run(o, null, false); }
    public static int Run(Options o, byte[] configuration) { return Run(o, configuration, false); }
    public static int Run(Options o, byte[] configuration, bool quietConsole) {
      Validate(o);
      // Create a sibling reservation file atomically; Directory.CreateDirectory alone accepts existing paths.
      string reservation = o.outputDirectory.TrimEnd(Path.DirectorySeparatorChar) + ".capture-reservation";
      using (FileStream exclusive = new FileStream(reservation, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
        if (Directory.Exists(o.outputDirectory) || File.Exists(o.outputDirectory)) throw new IOException("Capture output already exists.");
        Directory.CreateDirectory(o.outputDirectory);
      }
      File.Delete(reservation);
      if (configuration != null) using (FileStream retained = new FileStream(Path.Combine(o.outputDirectory, "configuration.json"), FileMode.CreateNew)) retained.Write(configuration, 0, configuration.Length);
      ProcessInfo child = new ProcessInfo(); IntPtr eventData = Marshal.AllocHGlobal(192);
      Dictionary<uint, IntPtr> threads = new Dictionary<uint, IntPtr>();
      List<Breakpoint> breakpoints = new List<Breakpoint>(o.breakpoints);
      uint mainBase = 0;
      List<IntPtr> suspended = new List<IntPtr>(); Breakpoint pending = null; uint pendingThread = 0;
      List<DeferredOwnedBreakpoint> deferredBreakpoints = new List<DeferredOwnedBreakpoint>();
      bool observationsActivated = false;
      ParentRttiProgress parentRtti = new ParentRttiProgress();
      bool heldForceUsed = false;
      bool controlledRaceSettingsUsed = false;
      OwnedWorkerObservationProgress workerObservation = new OwnedWorkerObservationProgress();
      OwnedWorkerGainPairProgress workerGainPair = new OwnedWorkerGainPairProgress();
      OwnedWorkerGainWindowProgress workerGainWindow = new OwnedWorkerGainWindowProgress();
      List<BufferedSnapshot> bufferedWorkerGain = new List<BufferedSnapshot>();
      bool exited = false, created = false, fatal = false; int snapshots = 0, events = 0; string reason = "unknown";
      bool processInformationThreadIsEventOwned = false, processInformationProcessIsEventOwned = false;
      PendingFrameProgress frame = new PendingFrameProgress();
      List<BufferedSnapshot> bufferedFrame = new List<BufferedSnapshot>();
      Dictionary<string, object> frameSelection = null;
      Stopwatch elapsed = Stopwatch.StartNew();
      using (StreamWriter log = new StreamWriter(new FileStream(Path.Combine(o.outputDirectory, "trace.jsonl"), FileMode.CreateNew))) {
        Action<Dictionary<string, object>> emit = delegate(Dictionary<string, object> entry) {
          entry["elapsedMs"] = elapsed.ElapsedMilliseconds; string line = Json(entry);
          log.WriteLine(line); log.Flush(); if (!quietConsole) {Console.WriteLine(line); Console.Out.Flush();}
        };
        try {
          Dictionary<string,object> header=Record("type", "capture", "schemaVersion", 1, "executablePath", o.executablePath, "workingDirectory", o.workingDirectory, "arguments", o.arguments, "executableSha256", o.expectedSha256.ToLowerInvariant(), "breakpointMode", "software-int3", "cleanupPolicy", "freeze-or-prove-terminated-owned-threads-before-unpatch-and-termination", "maxDurationMs", o.maxDurationMs, "maxEvents", o.maxEvents, "maxSnapshots", o.maxSnapshots, "timingLimitation", "Debugger-paused elapsed time does not establish native wall-clock simulation rate.");if(o.parentRttiObservation!=null)header["helperCapabilities"]=GetCapabilities();emit(header);
          Startup startup = new Startup(); startup.cb = (uint)Marshal.SizeOf(typeof(Startup)); startup.flags = 1; startup.show = (ushort)(o.showWindow ? 1 : 0);
          StringBuilder command = new StringBuilder(Quote(o.executablePath)); foreach (string arg in o.arguments) command.Append(' ').Append(Quote(arg));
          IntPtr environment = IntPtr.Zero;
          try {
            if (!String.IsNullOrEmpty(o.temporaryDirectory)) {
              SortedDictionary<string, string> variables = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
              foreach (DictionaryEntry entry in Environment.GetEnvironmentVariables()) variables[(string)entry.Key] = (string)entry.Value;
              variables["TEMP"] = o.temporaryDirectory; variables["TMP"] = o.temporaryDirectory;
              StringBuilder block = new StringBuilder(); foreach (KeyValuePair<string, string> variable in variables) block.Append(variable.Key).Append('=').Append(variable.Value).Append('\0');
              block.Append('\0'); environment = Marshal.StringToHGlobalUni(block.ToString());
              emit(Record("type", "environment-intervention", "overrides", Record("TEMP", o.temporaryDirectory, "TMP", o.temporaryDirectory), "otherVariables", "Inherited without modification; values not logged."));
            }
            Check(CreateProcess(o.executablePath, command, IntPtr.Zero, IntPtr.Zero, false, 2u | (environment == IntPtr.Zero ? 0u : 0x400u), environment, o.workingDirectory, ref startup, out child), "CreateProcess DEBUG_ONLY_THIS_PROCESS");
          } finally { if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment); }
          created = true;
          emit(Record("type", "owned-process", "pid", child.pid, "tid", child.tid, "showWindow", o.showWindow));
          bool initialBreakpoint = true, initialWow64Breakpoint = IntPtr.Size == 8, importsResolved = false, foregroundAdapterInitialized = false;
          while (elapsed.ElapsedMilliseconds < o.maxDurationMs && events < o.maxEvents && snapshots < o.maxSnapshots) {
            if (!WaitForDebugEvent(eventData, 100)) {
              int error = Marshal.GetLastWin32Error(); if (error == 121) continue;
              throw new Win32Exception(error, "WaitForDebugEvent");
            }
            events++; uint code = U32(eventData, 0), pid = U32(eventData, 4), tid = U32(eventData, 8); int u = IntPtr.Size == 8 ? 16 : 12; uint status = Continue;
            if (pid != child.pid) throw new InvalidDataException("Unexpected debug event for another process.");
            emit(Record("type", "debug-event", "event", code, "pid", pid, "tid", tid, "ordinal", events));
            if (code == 3) {
              IntPtr file = Ptr(eventData, u), process = Ptr(eventData, u + IntPtr.Size), thread = Ptr(eventData, u + IntPtr.Size * 2);
              string modulePath = FilePath(file);
              if (file != IntPtr.Zero) CloseHandle(file);
              //Event process/thread handles belong to the debug API until exit
              //continuation. Track a distinct owned copy, never that handle.
              processInformationThreadIsEventOwned = thread == child.thread;
              processInformationProcessIsEventOwned = process == child.process;
              threads[tid] = DuplicateOwnedDebugThreadHandle(thread, child.pid, tid, emit);
              bool wow64; Check(IsWow64Process(child.process, out wow64), "IsWow64Process");
              if (IntPtr.Size == 8 && !wow64) throw new InvalidDataException("Expected a WOW64 x86 target.");
              mainBase = unchecked((uint)Ptr(eventData, u + IntPtr.Size * 3).ToInt64());
              emit(Record("type", "module", "kind", "main", "baseAddress", Hex(mainBase), "path", modulePath, "wow64", wow64));
              HashSet<uint> locations = new HashSet<uint>();
              foreach (Breakpoint b in breakpoints) {
                b.resolved = String.IsNullOrEmpty(b.rva) ? Number(b.address) : Add(mainBase, Number(b.rva));
                if (!locations.Add(b.resolved)) throw new InvalidDataException("Breakpoints resolve to the same address.");
                b.original = Bytes(child.process, b.resolved, 1)[0];
                if (b.original == 0xcc) throw new InvalidDataException("Refusing original INT3 at " + Hex(b.resolved));
                bool parentDeferred=o.parentRttiObservation!=null&&(b.id==o.parentRttiObservation.callBreakpointId||b.id==o.parentRttiObservation.returnBreakpointId);
                bool deferredInstallation = parentDeferred||o.observationActivation != null && Array.IndexOf(o.observationActivation.observationBreakpointIds, b.id) >= 0;
                if (deferredInstallation) emit(parentDeferred?Record("type","breakpoint-installation-deferred","id",b.id,"address",Hex(b.resolved),"originalBytesHex",b.original.ToString("x2"),"activationBreakpointId",o.parentRttiObservation.beginBreakpointId,"activationSelection","selected-owned-parent-auxiliary","capability",ParentRttiCapability,"codeModified",false):Record("type", "breakpoint-installation-deferred", "id", b.id, "address", Hex(b.resolved), "originalBytesHex", b.original.ToString("x2"), "activationBreakpointId", o.observationActivation.breakpointId, "activationRawHit", o.observationActivation.rawHit, "codeModified", false));
                else {
                  Write(child.process, b.resolved, new byte[] {0xcc}); b.armed = true;
                  emit(Record("type", "breakpoint-installed", "id", b.id, "address", Hex(b.resolved), "originalBytesHex", b.original.ToString("x2"), "patchBytesHex", "cc"));
                }
              }
            } else if (code == 2) {
              IntPtr thread = DuplicateOwnedDebugThreadHandle(Ptr(eventData, u), child.pid, tid, emit); threads[tid] = thread;
              if (pending != null && tid != pendingThread) { uint previous; if (ChangeTrackedThreadSuspension(thread, child.pid, tid, false, "suspend-new-thread", emit, out previous)) suspended.Add(thread); }
            } else if (code == 4) {
              if(o.ownedWorkerGainWindow!=null&&workerGainWindow.call.open&&workerGainWindow.call.tid==tid)throw new InvalidDataException("Bound worker leaf thread exited before its matching normal return.");
              for (int index = deferredBreakpoints.Count - 1; index >= 0; index--) if (deferredBreakpoints[index].tid == tid) {
                DeferredOwnedBreakpoint deferred = deferredBreakpoints[index];
                emit(Record("type", "owned-breakpoint-deferred-thread-exited", "tid", tid, "breakpointId", deferred.breakpoint.id, "deferredDebugEventOrdinal", deferred.observedDebugEventOrdinal, "originalInstructionExecuted", false));
                deferredBreakpoints.RemoveAt(index);
              }
              IntPtr handle; if (threads.TryGetValue(tid, out handle)) {
                threads.Remove(tid); suspended.RemoveAll(delegate(IntPtr value) {return value == handle;});
                Check(CloseHandle(handle), "Close owned thread tracking copy after exit event");
                emit(Record("type", "owned-debug-thread-handle-closed", "pid", pid, "tid", tid, "trackingHandle", HandleHex(handle), "reason", "actual-exit-thread-event", "eventHandleClosedByDebugger", false));
              }
            } else if (code == 6) {
              IntPtr file = Ptr(eventData, u); string modulePath = FilePath(file); if (file != IntPtr.Zero) CloseHandle(file);
              ulong nativeBase = unchecked((ulong)Ptr(eventData, u + IntPtr.Size).ToInt64());
              emit(Record("type", "module", "kind", "dll", "baseAddress", nativeBase <= UInt32.MaxValue ? Hex((uint)nativeBase) : null, "nativeBaseAddress", "0x" + nativeBase.ToString(IntPtr.Size == 8 ? "x16" : "x8"), "path", modulePath));
            } else if (code == 7) {
              ulong nativeBase = unchecked((ulong)Ptr(eventData, u).ToInt64());
              emit(Record("type", "module-unload", "nativeBaseAddress", "0x" + nativeBase.ToString(IntPtr.Size == 8 ? "x16" : "x8")));
            } else if (code == 1) {
              IntPtr exceptionPointer = Ptr(eventData, u + (IntPtr.Size == 8 ? 16 : 12));
              uint exception = U32(eventData, u), address = unchecked((uint)exceptionPointer.ToInt64());
              uint firstChance = U32(eventData, u + (IntPtr.Size == 8 ? 152 : 80));
              emit(Record("type", "exception", "code", Hex(exception), "address", Hex(address), "nativeAddress", "0x" + unchecked((ulong)exceptionPointer.ToInt64()).ToString(IntPtr.Size == 8 ? "x16" : "x8"), "firstChance", firstChance));
              bool isBreakpoint = exception == Break || exception == Wow64Break;
              bool isSingleStep = exception == Step || exception == Wow64Step;
              Breakpoint hit = null; foreach (Breakpoint b in breakpoints) if (b.resolved == address && isBreakpoint && (b.armed || (pending != null && Object.ReferenceEquals(b, pending)))) hit = b;
              if (hit != null) {
                if (!importsResolved && (!String.IsNullOrEmpty(o.redirectedDocumentsPath) || !String.IsNullOrEmpty(o.redirectedShellFolderPath) || o.denyRegistryWrites || o.denyChildProcesses || o.denyPlayerMailslot || o.hideOwnedWindows || o.foregroundWindowSource != null)) throw new InvalidDataException("Target reached a declared stage before required imported-service adapters were installed.");
                if (pending != null) {
                  IntPtr heldThread;
                  bool tracked = threads.TryGetValue(tid, out heldThread) && heldThread != IntPtr.Zero;
                  int ownSuspensions = tracked ? suspended.FindAll(delegate(IntPtr value) {return value == heldThread;}).Count : 0;
                  if (!tracked || ownSuspensions == 0 || tid == pendingThread || firstChance != 1) throw new InvalidDataException("Nested owned breakpoint lacks a different tracked thread held by our suspension increment.");
                  int previousDeferral = 0, chainRoot = events;
                  foreach (DeferredOwnedBreakpoint prior in deferredBreakpoints) if (prior.tid == tid && Object.ReferenceEquals(prior.breakpoint, hit)) {previousDeferral = prior.observedDebugEventOrdinal; chainRoot = prior.chainRootDebugEventOrdinal;}
                  IntPtr heldContext = Context(heldThread);
                  try {
                    Dictionary<string, object> before = Registers(heldContext);
                    byte actualByte = Bytes(child.process, hit.resolved, 1)[0];
                    uint rewind = DeferredBreakpointRewindAddress(tid, pendingThread, tracked, ownSuspensions > 0, hit.armed, Object.ReferenceEquals(hit, pending), hit.resolved, U32(heldContext, 184), actualByte, hit.original);
                    Marshal.WriteInt32(heldContext, 184, unchecked((int)rewind)); SetContext(heldThread, heldContext);
                    deferredBreakpoints.Add(new DeferredOwnedBreakpoint {breakpoint = hit, tid = tid, observedDebugEventOrdinal = events, chainRootDebugEventOrdinal = chainRoot, previousDebugEventOrdinal = previousDeferral});
                    emit(Record("type", "owned-breakpoint-deferred", "pid", child.pid, "tid", tid, "breakpointId", hit.id, "address", Hex(hit.resolved), "pendingThread", pendingThread, "pendingBreakpointId", pending.id, "pendingAddress", Hex(pending.resolved), "pendingSite", Object.ReferenceEquals(hit, pending), "breakpointArmed", hit.armed, "actualByteHex", actualByte.ToString("x2"), "originalByteHex", hit.original.ToString("x2"), "ownedSuspendIncrementsRetained", ownSuspensions, "registersBefore", before, "registersAfter", Registers(heldContext), "rewindEip", Hex(rewind), "rawHitBefore", hit.hits, "matchingHitBefore", hit.matchingHits, "captureHitBefore", hit.captureHits, "snapshotCountBefore", snapshots, "observedDebugEventOrdinal", events, "previousDeferredDebugEventOrdinal", previousDeferral == 0 ? null : (object)previousDeferral, "deferralChainRootDebugEventOrdinal", chainRoot, "originalInstructionExecuted", false, "counterMutation", false, "policy", "Keep our peer suspension and existing code byte; finish the pending original instruction, rearm its site, then resume so this thread re-traps normally. A new pending instruction can require another validated deferral before the single real observation."));
                  } finally {Marshal.FreeHGlobal(heldContext);}
                  Check(ContinueDebugEvent(pid, tid, Continue), "Continue deferred owned breakpoint"); continue;
                }
                List<int> completedDeferrals = new List<int>();
                foreach (DeferredOwnedBreakpoint deferred in deferredBreakpoints) if (deferred.tid == tid && Object.ReferenceEquals(deferred.breakpoint, hit)) completedDeferrals.Add(deferred.observedDebugEventOrdinal);
                if (completedDeferrals.Count != 0) {
                  emit(Record("type", "owned-breakpoint-replayed", "pid", child.pid, "tid", tid, "breakpointId", hit.id, "address", Hex(hit.resolved), "deferredDebugEventOrdinal", completedDeferrals[0], "deferredDebugEventOrdinals", completedDeferrals, "deferredEventCount", completedDeferrals.Count, "observedDebugEventOrdinal", events, "rawHitBefore", hit.hits, "captureHitBefore", hit.captureHits, "snapshotCountBefore", snapshots, "policy", "One actual breakpoint observation closes the complete validated deferral chain; hit/capture/action counters advance only once below."));
                  deferredBreakpoints.RemoveAll(delegate(DeferredOwnedBreakpoint deferred) {return deferred.tid == tid && Object.ReferenceEquals(deferred.breakpoint, hit);});
                }
                IntPtr context = Context(threads[tid]);
                try {
                  Marshal.WriteInt32(context, 184, unchecked((int)hit.resolved));
                  Dictionary<string, object> regs = Registers(context); hit.hits++;
                  bool emulated = false;
                  if (hit.service != null) {
                    uint stack = Number((string)regs["esp"]); byte[] args = Bytes(child.process, stack, (hit.argumentCount + 1) * 4);
                    if (ModalArguments(hit.service) != 0) {
                      emit(Record("type", "unexpected-modal", "api", hit.service, "pid", child.pid, "tid", tid, "originalCallSkipped", true, "stackBytesHex", BytesHex(args), "registersBefore", regs, "policy", "hideOwnedWindows rejects modal UI; no response is synthesized."));
                      throw new InvalidDataException("Unexpected modal UI API reached under hideOwnedWindows: " + hit.service);
                    }
                    uint result = 5; string intervention = "deny-registry-write"; uint output = 0; string targetPath = null;
                    string realForeground = null, substitutedForeground = null, foregroundSourceAddress = null;
                    if (hit.service == "SHGetFolderPathA") {
                      uint folder = BitConverter.ToUInt32(args, 8);
                      if ((folder & 0xff) == 5) {
                        output = BitConverter.ToUInt32(args, 20);
                        byte[] replacement = Encoding.ASCII.GetBytes(o.redirectedDocumentsPath + "\0");
                        byte[] original = Bytes(child.process, output, replacement.Length); Write(child.process, output, replacement);
                        emit(Record("type", "service-memory-write", "api", hit.service, "address", Hex(output), "originalBytesHex", BytesHex(original), "replacementBytesHex", BytesHex(replacement)));
                        result = 0; intervention = "redirect-personal-folder"; emulated = true;
                      }
                    } else if (hit.service == "SHGetPathFromIDListA") {
                      output = BitConverter.ToUInt32(args, 8);
                      byte[] replacement = Encoding.ASCII.GetBytes(o.redirectedShellFolderPath + "\0");
                      byte[] original = Bytes(child.process, output, replacement.Length); Write(child.process, output, replacement);
                      emit(Record("type", "service-memory-write", "api", hit.service, "address", Hex(output), "originalBytesHex", BytesHex(original), "replacementBytesHex", BytesHex(replacement)));
                      result = 1; intervention = "redirect-legacy-shell-folder"; emulated = true;
                    } else if (hit.service == "CreateFileA" || hit.service == "CreateFileW") {
                      targetPath = TargetString(child.process, BitConverter.ToUInt32(args, 4), hit.service == "CreateFileW");
                      if (String.Equals(targetPath, "\\\\.\\mailslot\\Rollcage Player", StringComparison.OrdinalIgnoreCase)) {
                        result = UInt32.MaxValue; intervention = "deny-player-mailslot"; emulated = true;
                      }
                    } else if (hit.service == "GetForegroundWindow") {
                      MemoryRange source = o.foregroundWindowSource;
                      uint location = 0, window = 0; string deferred = null; int readError = 0;
                      try {
                        bool nullPointer;
                        location = Resolve(child.process, mainBase, source.address, source.rva, source.baseRegister, source.dereferenceOffsets, source.offset, regs, true, out nullPointer);
                        if (nullPointer || location == 0) deferred = "explicit-source-root-not-initialized";
                        else {window = BitConverter.ToUInt32(Bytes(child.process, location, 4), 0); if (window == 0) deferred = "source-hwnd-not-initialized";}
                      } catch (Win32Exception error) {
                        if (foregroundAdapterInitialized || !UninitializedSourceRead(error)) throw;
                        deferred = "source-memory-unavailable-before-window-initialization"; readError = error.NativeErrorCode;
                      }
                      if (deferred != null) {
                        if (foregroundAdapterInitialized) throw new InvalidDataException("Previously initialized foregroundWindowSource became unavailable.");
                        // This API is read-only. Before native window initialization it must
                        // execute normally, including its normal volatile-register effects.
                        emit(Record("type", "service-intervention", "api", hit.service, "kind", "foreground-adapter-deferred", "tid", tid, "originalCallSkipped", false, "foregroundWindowSourceAddress", Hex(location), "reason", deferred, "win32ReadError", readError, "stackBytesHex", BytesHex(args), "registersBefore", regs, "fallback", "Execute original read-only GetForegroundWindow via normal restored-instruction stepping."));
                      } else {
                        uint owner; uint windowThread = GetWindowThreadProcessId(Pointer(window), out owner);
                        if (windowThread == 0 || owner != child.pid) throw new InvalidDataException("foregroundWindowSource did not resolve to a window owned by the declared child PID.");
                        foregroundAdapterInitialized = true;
                        realForeground = "0x" + unchecked((ulong)ReadForegroundWindow().ToInt64()).ToString(IntPtr.Size == 8 ? "x16" : "x8");
                        foregroundSourceAddress = Hex(location); substitutedForeground = Hex(window);
                        result = window; intervention = "substitute-owned-foreground-query"; emulated = true;
                      }
                    } else if (WindowArguments(hit.service) != 0) {
                      if (hit.service == "CreateWindowExA" || hit.service == "CreateWindowExW") {
                        uint exStyle = BitConverter.ToUInt32(args, 4), style = BitConverter.ToUInt32(args, 16);
                        EditArgument(child.process, stack, 1, HiddenWindowArgumentValue(hit.service, 1, exStyle), hit.service, "Strip WS_EX_TOPMOST and add WS_EX_NOACTIVATE.", emit);
                        EditArgument(child.process, stack, 4, HiddenWindowArgumentValue(hit.service, 4, style), hit.service, "Strip WS_VISIBLE while preserving real native window creation.", emit);
                      } else if (hit.service == "ShowWindow") {
                        EditArgument(child.process, stack, 2, HiddenWindowArgumentValue(hit.service, 2, BitConverter.ToUInt32(args, 8)), hit.service, "Force SW_HIDE.", emit);
                      } else if (hit.service == "SetWindowPos") {
                        uint flags = BitConverter.ToUInt32(args, 28);
                        EditArgument(child.process, stack, 7, HiddenWindowArgumentValue(hit.service, 7, flags), hit.service, "Remove SWP_SHOWWINDOW; add SWP_NOACTIVATE and SWP_HIDEWINDOW.", emit);
                      } else {
                        result = 0; intervention = "suppress-window-activation"; emulated = true;
                      }
                    } else {
                      emulated = true;
                      if (ProcessArguments(hit.service) != 0) {
                        result = hit.service.StartsWith("ShellExecute", StringComparison.Ordinal) && !hit.service.StartsWith("ShellExecuteEx", StringComparison.Ordinal) ? 5u : hit.service == "WinExec" ? 5u : 0u;
                        intervention = "deny-child-process";
                      }
                    }
                    if (emulated) {
                      Marshal.WriteInt32(context, 176, unchecked((int)result));
                      Marshal.WriteInt32(context, 184, unchecked((int)BitConverter.ToUInt32(args, 0)));
                      Marshal.WriteInt32(context, 196, unchecked((int)Add(stack, (hit.argumentCount + 1) * 4)));
                      SetContext(threads[tid], context);
                      emit(Record("type", "service-intervention", "api", hit.service, "kind", intervention, "tid", tid, "originalCallSkipped", true, "stackBytesHex", BytesHex(args), "registersBefore", regs, "registersAfter", Registers(context), "targetPath", targetPath, "realForegroundWindow", realForeground, "substitutedOwnedWindow", substitutedForeground, "foregroundWindowSourceAddress", foregroundSourceAddress, "redirectedPath", hit.service == "SHGetFolderPathA" ? o.redirectedDocumentsPath : hit.service == "SHGetPathFromIDListA" ? o.redirectedShellFolderPath : null, "semantics", hit.service == "SHGetPathFromIDListA" ? "All legacy PIDL path conversions share the declared isolated root; original Documents/AppData distinctions are not preserved." : null));
                    }
                  }
                  if (emulated) { Check(ContinueDebugEvent(pid, tid, Continue), "Continue emulated API"); continue; }
                  bool capture = hit.service == null;
                  Dictionary<string, object> predicateEvidence = null;
                  Dictionary<string,object> parentRttiAdmission=null,parentRttiMap=null,parentRttiClosed=null;
                  bool parentRttiSite=o.parentRttiObservation!=null&&(hit.id==o.parentRttiObservation.callBreakpointId||hit.id==o.parentRttiObservation.returnBreakpointId);
                  if(capture&&o.parentRttiObservation!=null&&hit.id.StartsWith("native-control-",StringComparison.Ordinal)&&tid!=child.tid){capture=false;emit(Record("type","parent-rtti-checkpoint-skipped","breakpointId",hit.id,"pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"observedDebugEventOrdinal",events,"rawHit",hit.hits,"reason","different-owned-thread","matchingHitAdvanced",false,"snapshotCountAdvanced",false,"originalInstructionSkipped",false));}
                  if(capture&&parentRttiSite){parentRttiAdmission=AdmitParentRtti(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit);capture=parentRttiAdmission!=null;}
                  PendingFrameObserver scopePolicy = o.pendingFrameObserver;
                  OwnedWorkerObservation workerPolicy = o.ownedWorkerObservation;
                  OwnedWorkerGainWindow leafPolicy=o.ownedWorkerGainWindow;
                  bool leafSite=leafPolicy!=null&&(hit.id==leafPolicy.entryBreakpointId||hit.id==leafPolicy.exitBreakpointId||hit.id==leafPolicy.unsupportedExitBreakpointId);
                  //The worker window is activation-anchored, not parent-scoped.
                  if(leafPolicy!=null&&workerGainWindow.parentComplete&&!leafSite)capture=false;
                  if(capture&&leafSite){
                    bool accepted=false,entry=hit.id==leafPolicy.entryBreakpointId;
                    if(observationsActivated&&!workerGainWindow.call.complete){
                      uint tidAddress=ResolveCaptureRange(child.process,mainBase,leafPolicy.threadIdSource,regs);byte[] tidBytes=Bytes(child.process,tidAddress,4);uint expectedTid=BitConverter.ToUInt32(tidBytes,0);IntPtr ownedThread;
                      bool live=expectedTid!=child.tid&&threads.TryGetValue(expectedTid,out ownedThread)&&ownedThread!=IntPtr.Zero;
                      if(workerGainWindow.call.CanObserve(true,observationsActivated,tid,expectedTid,child.tid,live)){
                        if(entry&&workerGainWindow.call.open)throw new InvalidDataException("Nested worker leaf gain call.");
                        if(entry||workerGainWindow.call.open){
                          uint S=Number((string)regs["esp"]);byte[] args=Bytes(child.process,S,12);uint returned=BitConverter.ToUInt32(args,0),sourceArg=BitConverter.ToUInt32(args,4),flag=BitConverter.ToUInt32(args,8);
                          bool callerMatched=!entry||OwnedWorkerGainPairProgress.CallerMatches(mainBase,returned,flag);
                          emit(Record("type","owned-worker-gain-window-abi-checked","breakpointId",hit.id,"pid",child.pid,"tid",tid,"observedDebugEventOrdinal",events,"entry",entry,"callerMatched",callerMatched,"stackAddress",Hex(S),"stackBytesHex",BytesHex(args),"readBeforeSnapshotRanges",true,"counterMutation",false));
                          if(callerMatched){
                            uint managerAddress=ResolveCaptureRange(child.process,mainBase,leafPolicy.managerSource,regs),managerObject=BitConverter.ToUInt32(Bytes(child.process,managerAddress,4),0),esi=Number((string)regs["esi"]),ebx=Number((string)regs["ebx"]),ebp=Number((string)regs["ebp"]),edi=Number((string)regs["edi"]);
                            if(entry){if(Number((string)regs["ecx"])!=managerObject)throw new InvalidDataException("Worker leaf manager differs.");workerGainWindow.call.Begin(tid,child.tid,workerGainWindow.activationDebugOrdinal,S,sourceArg,managerObject,returned,flag,ebx,ebp,edi,mainBase,esi);workerGainWindow.threadIdSourceAddress=tidAddress;}
                            else{if(hit.id==leafPolicy.unsupportedExitBreakpointId)throw new InvalidDataException("Worker leaf unsupported spatial earlyRET4b1919.");if(tidAddress!=workerGainWindow.threadIdSourceAddress)throw new InvalidDataException("Worker leaf object/TID source changed.");workerGainWindow.call.ValidateExit(tid,child.tid,workerGainWindow.activationDebugOrdinal,S,returned,esi,managerObject,ebx,ebp,edi);}
                            OwnedWorkerGainPairProgress bound=workerGainWindow.call;
                            Dictionary<string,object> proof=Record("breakpointId",hit.id,"role",entry?"entry":"exit","pid",child.pid,"tid",tid,"expectedTid",expectedTid,"threadIdSourceAddress",Hex(tidAddress),"actualThreadIdBytesHex",BytesHex(tidBytes),"ownedLiveThread",live,"ownerMainTid",child.tid,"activationBreakpointId",o.observationActivation.breakpointId,"activationRawHit",o.observationActivation.rawHit,"activationDebugEventOrdinal",workerGainWindow.activationDebugOrdinal,"entryEsp",Hex(bound.esp),"source",Hex(bound.source),"manager",Hex(bound.manager),"returnAddress",Hex(bound.caller),"force",bound.force,"entryEbx",Hex(bound.ebx),"entryEbp",Hex(bound.ebp),"entryEdi",Hex(bound.edi),"stackAddress",Hex(S),"stackBytesHex",BytesHex(args),"exitArgumentNotDereferenced",!entry,"afterRetEsp",Hex(Add(bound.esp,12)),"observationIndex",entry?1:2,"maxSnapshots",2,"observedDebugEventOrdinal",events,"beforeOriginalInstruction",true,"abiReadBeforeSnapshotRanges",true,"sameParentInterleavingClaimed",false);
                            BufferedSnapshot observed=ReadWorkerWindowSnapshot(o,workerGainWindow,child.process,threads[tid],mainBase,hit,tid,regs,context,entry?"worker-leaf-entry":"worker-leaf-exit",elapsed.ElapsedMilliseconds,events);
                            workerGainWindow.call.Commit(entry);observed.row["ownedWorkerGainWindow"]=proof;bufferedWorkerGain.Add(observed);Dictionary<string,object> admitted=new Dictionary<string,object>(proof);admitted["type"]="owned-worker-gain-window-admitted";emit(admitted);accepted=true;
                            if(workerGainWindow.call.complete)CommitWorkerGainWindow(o,workerGainWindow,bufferedWorkerGain,ref snapshots,emit);
                          }
                        }
                      }
                    }
                    if(!accepted)emit(Record("type","owned-worker-gain-window-skipped","breakpointId",hit.id,"pid",child.pid,"tid",tid,"rawHit",hit.hits,"activationComplete",observationsActivated,"pairComplete",workerGainWindow.call.complete,"matchingHitAdvanced",false,"originalInstructionSkipped",false));
                    capture=false;
                  }
                  OwnedWorkerGainPair gainPolicy = o.ownedWorkerGainPair;
                  bool gainSite = gainPolicy != null && (hit.id == gainPolicy.entryBreakpointId || hit.id == gainPolicy.exitBreakpointId || hit.id == gainPolicy.unsupportedExitBreakpointId), gainAccepted = false;
                  bool gainEntry = gainSite && hit.id == gainPolicy.entryBreakpointId;
                  Dictionary<string, object> gainProof = null;
                  if (capture && gainSite) {
                    if (frame.active && observationsActivated && !workerGainPair.complete) {
                      if(frame.frameTid!=child.tid) throw new InvalidDataException("Worker gain pair requires the owned main-thread parent.");
                      uint tidAddress = ResolveCaptureRange(child.process, mainBase, gainPolicy.threadIdSource, regs);
                      byte[] tidBytes = Bytes(child.process, tidAddress, 4); uint expectedTid = BitConverter.ToUInt32(tidBytes, 0); IntPtr ownedThread;
                      bool ownedLive = expectedTid != child.tid && threads.TryGetValue(expectedTid, out ownedThread) && ownedThread != IntPtr.Zero;
                      if (workerGainPair.CanObserve(frame.active, observationsActivated, tid, expectedTid, frame.frameTid, ownedLive)) {
                        if (gainEntry && workerGainPair.open) throw new InvalidDataException("Nested worker gain call before selected return.");
                        if (gainEntry || workerGainPair.open) {
                          uint S = Number((string)regs["esp"]); byte[] args = Bytes(child.process, S, 12);
                          uint returned = BitConverter.ToUInt32(args,0), sourceArg = BitConverter.ToUInt32(args,4), flag = BitConverter.ToUInt32(args,8);
                          bool callerMatched = !gainEntry || OwnedWorkerGainPairProgress.CallerMatches(mainBase,returned,flag);
                          emit(Record("type","owned-worker-gain-abi-checked","breakpointId",hit.id,"pid",child.pid,"tid",tid,"observedDebugEventOrdinal",events,"entry",gainEntry,"callerMatched",callerMatched,"stackAddress",Hex(S),"stackBytesHex",BytesHex(args),"readBeforeSnapshotRanges",true,"counterMutation",false));
                          if (callerMatched) {
                            uint managerAddress = ResolveCaptureRange(child.process,mainBase,gainPolicy.managerSource,regs), managerObject = BitConverter.ToUInt32(Bytes(child.process,managerAddress,4),0);
                            uint esi = Number((string)regs["esi"]), ebx = Number((string)regs["ebx"]), ebp = Number((string)regs["ebp"]), edi = Number((string)regs["edi"]);
                            if (gainEntry) {
                              if(Number((string)regs["ecx"])!=managerObject) throw new InvalidDataException("Worker gain entry is not the original manager call.");
                              workerGainPair.Begin(tid,frame.frameTid,frame.candidateIndex,S,sourceArg,managerObject,returned,flag,ebx,ebp,edi,mainBase,esi);
                            } else {
                              if(hit.id==gainPolicy.unsupportedExitBreakpointId) throw new InvalidDataException("Selected worker gain entered unsupported spatial earlyRET4b1919.");
                              workerGainPair.ValidateExit(tid,frame.frameTid,frame.candidateIndex,S,returned,esi,managerObject,ebx,ebp,edi);
                            }
                            gainAccepted = true;
                            gainProof=Record("breakpointId",hit.id,"role",gainEntry?"entry":"exit","pid",child.pid,"tid",tid,"expectedTid",expectedTid,"threadIdSourceAddress",Hex(tidAddress),"actualThreadIdBytesHex",BytesHex(tidBytes),"ownedLiveThread",ownedLive,"pendingFrameActive",true,"pendingFrameTid",frame.frameTid,"candidateIndex",frame.candidateIndex,"entryEsp",Hex(workerGainPair.esp),"source",Hex(workerGainPair.source),"manager",Hex(workerGainPair.manager),"returnAddress",Hex(workerGainPair.caller),"force",workerGainPair.force,"entryEbx",Hex(workerGainPair.ebx),"entryEbp",Hex(workerGainPair.ebp),"entryEdi",Hex(workerGainPair.edi),"stackAddress",Hex(S),"stackBytesHex",BytesHex(args),"exitArgumentNotDereferenced",!gainEntry,"afterRetEsp",Hex(Add(workerGainPair.esp,12)),"observationIndex",gainEntry?1:2,"maxSnapshots",2,"observedDebugEventOrdinal",events,"beforeOriginalInstruction",true,"abiReadBeforeSnapshotRanges",true);
                          }
                        }
                      }
                    }
                    if(!gainAccepted) {capture=false;emit(Record("type","owned-worker-gain-skipped","breakpointId",hit.id,"pid",child.pid,"tid",tid,"rawHit",hit.hits,"pendingFrameActive",frame.active,"pairComplete",workerGainPair.complete,"matchingHitAdvanced",false,"originalInstructionSkipped",false));}
                  }
                  bool workerSite = workerPolicy != null && hit.id == workerPolicy.breakpointId, workerAccepted = false;
                  bool workerCallerRejected = false;
                  Dictionary<string, object> workerProof = null;
                  if (capture && workerSite) {
                    if (workerObservation.NeedsThreadSourceRead(frame.active, observationsActivated)) {
                      MemoryRange source = workerPolicy.threadIdSource;
                      uint sourceAddress = ResolveCaptureRange(child.process, mainBase, source, regs);
                      byte[] sourceBytes = Bytes(child.process, sourceAddress, 4);
                      uint expectedTid = BitConverter.ToUInt32(sourceBytes, 0); IntPtr ownedThread;
                      bool ownedLive = expectedTid != child.tid && threads.TryGetValue(expectedTid, out ownedThread) && ownedThread != IntPtr.Zero;
                      workerAccepted = workerObservation.CanCapture(frame.active, observationsActivated, tid, expectedTid, frame.frameTid, ownedLive);
                      if (workerAccepted) {
                        workerProof = Record("breakpointId", hit.id, "pid", child.pid, "tid", tid, "threadIdSourceAddress", Hex(sourceAddress), "actualThreadIdBytesHex", BytesHex(sourceBytes), "expectedTid", expectedTid, "ownedLiveThread", ownedLive, "pendingFrameActive", frame.active, "pendingFrameTid", frame.frameTid, "candidateIndex", frame.candidateIndex, "observationIndex", 1, "maxSnapshots", workerPolicy.maxSnapshots, "observedDebugEventOrdinal", events, "beforeOriginalInstruction", true);
                        if (workerPolicy.entryReturnRva != null) {
                          // This exact four-byte caller check precedes all snapshot
                          // range resolution, in particular any ESI pointee read.
                          uint entryEsp = Number((string)regs["esp"]);
                          byte[] callerBytes = Bytes(child.process, entryEsp, 4);
                          bool callerMatches = OwnedWorkerEntryReturnMatches(mainBase, BitConverter.ToUInt32(callerBytes, 0), workerPolicy.entryReturnRva);
                          Dictionary<string, object> gate = Record("type", "owned-worker-entry-return-checked", "breakpointId", hit.id, "pid", child.pid, "tid", tid, "entryReturnRva", workerPolicy.entryReturnRva, "entryReturnAddress", Hex(entryEsp), "actualEntryReturnBytesHex", BytesHex(callerBytes), "expectedEntryReturnAddress", Hex(Add(mainBase, Number(workerPolicy.entryReturnRva))), "entryReturnMatched", callerMatches, "entryReturnReadBeforeSnapshotRanges", true, "observedDebugEventOrdinal", events, "matchingHitAdvanced", false, "counterMutation", false, "oneSnapshotConsumed", false);
                          emit(gate);
                          foreach (string key in new string[] {"entryReturnRva", "entryReturnAddress", "actualEntryReturnBytesHex", "expectedEntryReturnAddress", "entryReturnMatched", "entryReturnReadBeforeSnapshotRanges"}) workerProof[key] = gate[key];
                          workerCallerRejected = !callerMatches; workerAccepted = callerMatches;
                        }
                      }
                    }
                    if (!workerAccepted) {
                      capture = false;
                      emit(Record("type", "owned-worker-observation-skipped", "breakpointId", hit.id, "pid", child.pid, "tid", tid, "rawHit", hit.hits, "reason", workerCallerRejected ? "different-worker-caller" : workerObservation.captured != 0 ? "one-snapshot-bound" : !frame.active ? "outside-pending-frame" : "different-owned-worker-thread", "pendingFrameActive", frame.active, "matchingHitAdvanced", false, "originalInstructionSkipped", false));
                    }
                  }
                  if (capture && !workerSite && !gainSite && scopePolicy != null && scopePolicy.nestedCaptureScope == "frame-thread" && Array.IndexOf(scopePolicy.nestedBreakpointIds, hit.id) >= 0 && (!frame.active || tid != frame.frameTid)) {
                    capture = false;
                    emit(Record("type", "observation-skipped", "breakpointId", hit.id, "rawHit", hit.hits, "tid", tid, "reason", frame.active ? "different-pending-frame-thread" : "outside-pending-frame", "nestedCaptureScope", "frame-thread", "pendingFrameActive", frame.active, "pendingFrameTid", frame.active ? (object)frame.frameTid : null, "matchingHitAdvanced", false, "originalInstructionSkipped", false));
                  }
                  if (capture && hit.captureWhen != null) {
                    MemoryRange predicate = hit.captureWhen.range;
                    uint predicateAddress = Resolve(child.process, mainBase, predicate.address, predicate.rva, predicate.baseRegister, predicate.dereferenceOffsets, predicate.offset, regs);
                    byte[] actual = Bytes(child.process, predicateAddress, predicate.length);
                    bool predicateMatches = CapturePredicateMatches(actual, hit.captureWhen.equalsBytesHex);
                    capture = ObserveCaptureMatch(hit, predicateMatches);
                    predicateEvidence = Record("address", Hex(predicateAddress), "actualBytesHex", BytesHex(actual), "equalsBytesHex", BytesHex(ParseBytes(hit.captureWhen.equalsBytesHex)));
                    // Skips are bounded by maxEvents/maxDurationMs, and execute the displaced
                    // instruction through the same restoration/step/rearm path as captures.
                    if (!capture) {
                      Dictionary<string, object> skipped = Record("type", "observation-skipped", "breakpointId", hit.id, "rawHit", hit.hits, "tid", tid, "predicateAddress", Hex(predicateAddress), "actualPredicateBytesHex", BytesHex(actual), "expectedPredicateBytesHex", predicateEvidence["equalsBytesHex"], "reason", predicateMatches ? "matching-hit-window" : "predicate-not-equal");
                      if (predicateMatches) { skipped["matchingHit"] = hit.matchingHits; skipped["skipMatchingHits"] = hit.skipMatchingHits.GetValueOrDefault(); }
                      emit(skipped);
                    }
                  }
                  bool frameComplete = false, candidateBound = false;
                  PendingFrameObserver observer = o.pendingFrameObserver;
                  if (observer != null && hit.service == null) {
                    bool beforeFrame = hit.id == observer.beforeBreakpointId, afterFrame = hit.id == observer.afterBreakpointId, eventFrame = hit.id == observer.eventBreakpointId;
                    bool nestedFrame = Array.IndexOf(observer.nestedBreakpointIds, hit.id) >= 0;
                    uint esp = Number((string)regs["esp"]);
                    int matching = hit.captureWhen == null ? hit.hits : hit.matchingHits;
                    if (beforeFrame) {
                      if (frame.active) throw new InvalidDataException("Nested pending-frame entry, including a filtered entry.");
                      if (capture) {
                        uint caller = BitConverter.ToUInt32(Bytes(child.process, esp, 4), 0);
                        frame.Begin(observer, tid, esp, caller, matching);
                        if (o.heldForceInput != null) {
                          if (heldForceUsed) throw new InvalidDataException("Held force allows exactly one live entry; no automatic retry.");
                          if(o.controlledRaceSettings!=null){if(!controlledRaceSettingsUsed)throw new InvalidDataException("Held controlled-race entry lacks its one-shot guarded frontend input.");VerifyControlledRaceSettingsNativeOutputs(o,child,mainBase,tid,events,emit);}
                          heldForceUsed = true;
                          ApplyHeldForceInput(o,frame,child,threads[tid],mainBase,hit,tid,regs,context,predicateEvidence,events,ref snapshots,elapsed,emit);
                        }
                        BufferedSnapshot entrySnapshot=ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, "before", elapsed.ElapsedMilliseconds, events);
                        EmitHeldStorageProof(o,child,entrySnapshot,emit);
                        if(o.heldForceInput!=null){entrySnapshot.row["heldForceInputPhase"]="post-input";entrySnapshot.row["heldForcePreInputOrdinal"]=snapshots;}
                        bufferedFrame.Add(entrySnapshot);
                        Dictionary<string, object> started = FrameProof(frame); started["type"] = "pending-frame-started"; started["bufferedBytes"] = frame.bufferedBytes; emit(started);
                      }
                    } else if (eventFrame) {
                      if (frame.active) {
                        uint caller = BitConverter.ToUInt32(Bytes(child.process, esp, 4), 0);
                        MemoryRange poolSource = observer.eventPoolRoot, capacitySource = observer.eventPoolCapacity;
                        uint poolAddress = Resolve(child.process, mainBase, poolSource.address, poolSource.rva, poolSource.baseRegister, poolSource.dereferenceOffsets, poolSource.offset, regs);
                        uint capacityAddress = Resolve(child.process, mainBase, capacitySource.address, capacitySource.rva, capacitySource.baseRegister, capacitySource.dereferenceOffsets, capacitySource.offset, regs);
                        uint pool = BitConverter.ToUInt32(Bytes(child.process, poolAddress, 4), 0), capacity = BitConverter.ToUInt32(Bytes(child.process, capacityAddress, 4), 0), eventAddress = Number((string)regs[observer.eventPointerRegister]);
                        int slot = frame.ObserveEvent(observer, tid, esp, caller, Add(mainBase, Number(observer.eventReturnRva)), eventAddress, pool, capacity, capture);
                        if (capture) bufferedFrame.Add(ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, "event", elapsed.ElapsedMilliseconds, events));
                        Dictionary<string, object> observed = FrameProof(frame); observed["type"] = "pending-frame-event"; observed["qualifies"] = capture;
                        if (capture) observed["eventIndex"] = frame.qualifyingEventSnapshots;
                        observed["eventAddress"] = Hex(eventAddress); observed["eventSlot"] = slot; observed["poolBase"] = Hex(pool); observed["capacity"] = capacity; observed["recordBytes"] = observer.eventRecordBytes; observed["esp"] = Hex(esp); observed["returnAddress"] = Hex(caller); observed["rawHit"] = hit.hits; observed["captureWhen"] = predicateEvidence; emit(observed);
                      } else emit(Record("type", "pending-frame-event-outside", "breakpointId", hit.id, "rawHit", hit.hits, "tid", tid, "registers", regs));
                    } else if (afterFrame) {
                      if (frame.active) {
                        uint caller = BitConverter.ToUInt32(Bytes(child.process, esp, 4), 0);
                        frame.ValidateAfter(tid, esp, caller, matching, capture);
                        if(gainPolicy!=null) workerGainPair.ValidateParentClose(frame.candidateIndex,frame.qualifyingEventSnapshots!=0);
                        if (frame.qualifyingEventSnapshots == 0) {
                          Dictionary<string, object> discarded = FrameProof(frame); discarded["type"] = "pending-frame-discarded"; discarded["reason"] = "no-qualifying-event"; discarded["bufferedBytes"] = frame.bufferedBytes; discarded["beforeRawHit"] = bufferedFrame[0].row["rawHit"]; discarded["afterRawHit"] = hit.hits; emit(discarded);
                          candidateBound = frame.candidateIndex == observer.maxCandidateFrames;
                        } else {
                          BufferedSnapshot afterSnapshot=ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, "after", elapsed.ElapsedMilliseconds, events);EmitHeldStorageProof(o,child,afterSnapshot,emit);bufferedFrame.Add(afterSnapshot);
                          CommitBufferedGroup(o, frame, bufferedFrame, ref snapshots, emit); frameSelection = FrameProof(frame); frameComplete = true;
                          if(leafPolicy!=null){workerGainWindow.parentComplete=true;emit(Record("type","worker-gain-window-parent-retained","activationDebugEventOrdinal",workerGainWindow.activationDebugOrdinal,"parentStartDebugEventOrdinal",bufferedFrame[0].row["observedDebugEventOrdinal"],"parentEndDebugEventOrdinal",events,"sameParentInterleavingClaimed",false));}
                        }
                        bufferedFrame.Clear(); frame.active = false; frame.bufferedBytes = 0;
                      } else if (capture) throw new InvalidDataException("Pending-frame selected after has no matching entry.");
                    } else if (frame.active && capture && nestedFrame) {
                      // These are declared observer-only snapshots. They share
                      // the frame byte/global count bounds and publication
                      // order, but never qualify its selection event. Preserve
                      // the actual owned-thread id for posthoc lineage checks.
                      frame.ObserveNested(observer);
                      BufferedSnapshot observed = ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, gainAccepted ? (gainEntry ? "worker-gain-entry" : "worker-gain-exit") : workerAccepted ? "worker-once" : "nested", elapsed.ElapsedMilliseconds, events);
                      if(gainAccepted) {
                        workerGainPair.Commit(gainEntry); observed.row["ownedWorkerGainPair"]=gainProof;
                        Dictionary<string,object> admitted=new Dictionary<string,object>(gainProof);admitted["type"]="owned-worker-gain-admitted";emit(admitted);
                      }
                      if (workerAccepted) {
                        workerObservation.CommitSnapshot(); observed.row["ownedWorkerObservation"] = workerProof;
                        Dictionary<string, object> admitted = new Dictionary<string, object>(workerProof); admitted["type"] = "owned-worker-observation-admitted"; emit(admitted);
                      }
                      bufferedFrame.Add(observed);
                      capture = false;
                    } else if (frame.active && capture) throw new InvalidDataException("Unrelated observation inside a pending frame would interleave publication.");
                    if (beforeFrame || afterFrame || eventFrame) capture = false;
                  }
                  if(capture&&o.parentRttiObservation!=null&&hit.id.StartsWith("native-control-",StringComparison.Ordinal))parentRttiMap=PrepareParentRttiCheckpoint(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit,out parentRttiClosed);
                  if (capture) {
                  int snapshotOrdinal = snapshots + 1;
                  List<object> ranges = new List<object>(); List<MemoryRange> selected = new List<MemoryRange>(o.ranges); selected.AddRange(hit.ranges);
                  int rangeOrdinal = 0;
                  foreach (MemoryRange range in selected) {
                    GuardedPointerInfo guard = range.dereferenceMinimumValues == null ? null : ReadGuardedPointerRange(child.process, mainBase, range);
                    uint root = guard == null ? ResolveCaptureRange(child.process, mainBase, range, regs) : guard.address, start = root;
                    int length = guard != null && guard.stopIndex >= 0 ? 0 : range.length; MemoryRegionInfo region = null; VectorStorageInfo vector = null;
                    if (range.readableRegion) {region = QueryCaptureRange(child.process, root, range); start = (uint)region.baseAddress; length = checked((int)region.regionSize);}
                    if (range.vectorStorage) {vector = ReadVectorCaptureRange(child.process, root, range); start = vector.begin; length = vector.length;}
                    byte[] data = ReadCaptureRangeBytes(child.process, range, root, start, length, region); string file = "snapshot-" + snapshotOrdinal.ToString("D6") + "-range-" + (++rangeOrdinal).ToString("D3") + ".bin";
                    using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, file), FileMode.CreateNew)) blob.Write(data, 0, data.Length);
                    Dictionary<string, object> row = Record("id", range.id, "address", Hex(start), "rootAddress", range.address, "rootRva", range.rva, "moduleBaseAddress", !String.IsNullOrEmpty(range.rva) ? Hex(mainBase) : null, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "length", length, "file", file, "sha256", Digest(data));
                    if (region != null) {
                      row["rangeMode"] = "readable-region"; row["requestedResolvedRoot"] = Hex(root); row["regionBaseAddress"] = Hex((uint)region.baseAddress); row["regionSize"] = region.regionSize;
                      row["regionProtection"] = Hex(region.protection); row["regionState"] = Hex(region.state); row["regionType"] = Hex(region.type); row["maxRegionBytes"] = range.maxRegionBytes;
                    }
                    if (vector != null) AddVectorCaptureMetadata(row, root, range, vector);
                    if (guard != null) AddGuardedPointerMetadata(row, range, guard);
                    ranges.Add(row);
                  }
                  ThreadEnvironmentCapture capturedThreadEnvironment = o.captureThreadEnvironment ? ReadThreadEnvironment(child.process, threads[tid], context, tid) : null;
                  if (capturedThreadEnvironment != null) {
                    BufferedRange range = capturedThreadEnvironment.range;
                    string file = "snapshot-" + snapshotOrdinal.ToString("D6") + "-range-" + (++rangeOrdinal).ToString("D3") + ".bin";
                    using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, file), FileMode.CreateNew)) WriteRangeSegment(blob,range.data,range.dataOffset,range.length);
                    range.row["file"] = file; ranges.Add(range.row);
                  }
                  byte[] rawContext = new byte[716]; Marshal.Copy(context, rawContext, 0, rawContext.Length);
                  string contextFile = "snapshot-" + snapshotOrdinal.ToString("D6") + "-context.bin";
                  using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, contextFile), FileMode.CreateNew)) blob.Write(rawContext, 0, rawContext.Length);
                  snapshots = snapshotOrdinal;
                  hit.captureHits++;
                  Dictionary<string, object> snapshot = Record("type", "snapshot", "ordinal", snapshots, "breakpointId", hit.id, "hit", hit.captureHits, "tid", tid, "registers", regs, "contextFile", contextFile, "contextSha256", Digest(rawContext), "ranges", ranges, "capturePhase", "before-declared-writes-before-original-instruction", "observedElapsedMs", elapsed.ElapsedMilliseconds, "observedDebugEventOrdinal", events);
                  if (predicateEvidence != null) { snapshot["rawHit"] = hit.hits; snapshot["matchingHit"] = hit.matchingHits; snapshot["captureWhen"] = predicateEvidence; }
                  if (capturedThreadEnvironment != null) snapshot["threadEnvironment"] = capturedThreadEnvironment.metadata;
                  if(parentRttiAdmission!=null)snapshot["parentRttiObservation"]=parentRttiAdmission;
                  if(parentRttiMap!=null)snapshot["parentRttiMapPreflight"]=parentRttiMap;
                  if(parentRttiClosed!=null)snapshot["parentRttiClosure"]=parentRttiClosed;
                  if(o.parentRttiObservation!=null&&hit.id==o.parentRttiObservation.beginBreakpointId)snapshot["parentRttiActivation"]=ActivateParentRtti(o,parentRtti,child,mainBase,hit,tid,events,snapshots,breakpoints,emit);
                  emit(snapshot);
                  if(parentRttiAdmission!=null)parentRtti.CommitEndpoint(hit.id==o.parentRttiObservation.callBreakpointId);
                  if(o.parentRttiObservation!=null&&hit.id==o.parentRttiObservation.beginBreakpointId)parentRtti.MarkAuxiliaryPublished();
                  if(o.controlledRaceSettings!=null&&hit.id==o.controlledRaceSettings.breakpointId) {
                    if(controlledRaceSettingsUsed)throw new InvalidDataException("Controlled settings one-shot was already consumed.");
                    ApplyControlledRaceSettings(o,child,threads[tid],mainBase,hit,tid,rawContext,snapshot,events,emit);controlledRaceSettingsUsed=true;
                  }
                  foreach (PhaseAction action in o.phaseActions) if (action.breakpointId == hit.id && action.hit == hit.hits) foreach (MemoryWrite write in action.writes) {
                    uint target = Resolve(child.process, mainBase, write.address, write.rva, write.baseRegister, write.dereferenceOffsets, write.offset, regs);
                    byte[] replacement = ParseBytes(write.bytesHex), original = Bytes(child.process, target, replacement.Length);
                    string[] accepted = !String.IsNullOrEmpty(write.expectedBytesHex) ? new string[] {write.expectedBytesHex} : write.expectedAnyBytesHex;
                    bool matches = false; foreach (string expected in accepted) if (BytesHex(original) == BytesHex(ParseBytes(expected))) matches = true;
                    if (!matches) throw new InvalidDataException("Declared write original-byte mismatch at " + Hex(target));
                    foreach (Breakpoint bp in breakpoints) if (bp.resolved >= target && (ulong)bp.resolved < (ulong)target + (ulong)replacement.Length) throw new InvalidDataException("Declared write overlaps breakpoint.");
                    Write(child.process, target, replacement);
                    emit(Record("type", "intervention", "breakpointId", hit.id, "hit", hit.hits, "address", Hex(target), "originalBytesHex", BytesHex(original), "replacementBytesHex", BytesHex(replacement), "acceptedOriginalBytesHex", accepted));
                  }
                  }
                  ObservationActivation activation = o.observationActivation;
                  if (!observationsActivated && activation != null && activation.breakpointId == hit.id && activation.rawHit == hit.hits) {
                    List<object> installed = new List<object>();
                    foreach (string id in activation.observationBreakpointIds) {
                      Breakpoint point = null; foreach (Breakpoint candidate in breakpoints) if (candidate.id == id) point = candidate;
                      if (point == null || point.armed || point.hits != 0 || point.captureHits != 0 || point.matchingHits != 0) throw new InvalidDataException("Deferred observation site was already installed or observed before activation.");
                      byte original = Bytes(child.process, point.resolved, 1)[0];
                      if (original != point.original) throw new InvalidDataException("Deferred observation code changed before guarded activation.");
                      Write(child.process, point.resolved, new byte[] {0xcc}); point.armed = true;
                      Dictionary<string, object> record = Record("type", "breakpoint-activated", "id", point.id, "address", Hex(point.resolved), "originalBytesHex", original.ToString("x2"), "patchBytesHex", "cc", "activationBreakpointId", hit.id, "activationRawHit", hit.hits, "activationTid", tid, "rawHitBefore", point.hits, "matchingHitBefore", point.matchingHits, "captureHitBefore", point.captureHits, "observedDebugEventOrdinal", events, "beforeOriginalInstruction", true);
                      emit(record); installed.Add(Record("id", point.id, "address", Hex(point.resolved)));
                    }
                    observationsActivated = true;
                    ActivateOwnedWorkerGainWindow(o,workerGainWindow,events,tid,child.tid);
                    emit(Record("type", "observation-activation-complete", "breakpointId", hit.id, "rawHit", hit.hits, "tid", tid, "observedDebugEventOrdinal", events, "snapshotCount", snapshots, "installed", installed, "beforeOriginalInstruction", true, "guardActionCompleted", true));
                  }
                  Write(child.process, hit.resolved, new byte[] {hit.original}); hit.armed = false;
                  if(o.ownedWorkerGainWindow!=null&&workerGainWindow.Ready){reason="worker-gain-window-bound";break;}
                  if (frameComplete&&o.ownedWorkerGainWindow==null) { reason = "snapshot-bound"; break; }
                  if (candidateBound) { reason = "pending-frame-candidate-bound"; break; }
                  if (snapshots >= o.maxSnapshots || (capture && hit.stopAfterHits > 0 && hit.captureHits >= hit.stopAfterHits)) { reason = "snapshot-bound"; break; }
                  foreach (KeyValuePair<uint, IntPtr> thread in threads) if (thread.Key != tid) { uint previous; if (ChangeTrackedThreadSuspension(thread.Value, child.pid, thread.Key, false, "suspend-peer-thread", emit, out previous)) suspended.Add(thread.Value); }
                  Marshal.WriteInt32(context, 192, unchecked((int)(U32(context, 192) | 0x100)));
                  SetContext(threads[tid], context); pending = hit; pendingThread = tid;
                } finally { Marshal.FreeHGlobal(context); }
              } else if (isSingleStep && pending != null && tid == pendingThread) {
                IntPtr context = Context(threads[tid]);
                try { Marshal.WriteInt32(context, 192, unchecked((int)(U32(context, 192) & ~0x100u))); SetContext(threads[tid], context); } finally { Marshal.FreeHGlobal(context); }
                Write(child.process, pending.resolved, new byte[] {0xcc}); pending.armed = true; pending = null;
                foreach (IntPtr thread in suspended) { uint previous; ChangeTrackedThreadSuspension(thread, child.pid, TrackedThreadId(threads, thread), true, "resume-peer-thread", emit, out previous); }
                suspended.Clear();
              } else if (isBreakpoint && pending != null) {
                throw new InvalidDataException("Unowned breakpoint while an original instruction is pending.");
              } else if ((exception == Break && initialBreakpoint) || (exception == Wow64Break && initialWow64Breakpoint)) {
                if (exception == Break) initialBreakpoint = false; else initialWow64Breakpoint = false;
                emit(Record("type", "loader-breakpoint", "address", Hex(address), "architecture", IntPtr.Size == 8 && exception == Break ? "native-host-before-wow64-import-resolution" : "x86"));
                // A WOW64 child first stops in the 64-bit loader. Its PE32 IAT still contains
                // unresolved name RVAs then. Only the later WX86 loader breakpoint is ready.
                if (IntPtr.Size == 8 && exception == Break) { Check(ContinueDebugEvent(pid, tid, Continue), "Continue native loader breakpoint"); continue; }
                List<object> imports = new List<object>();
                foreach (Import import in Imports(File.ReadAllBytes(o.executablePath))) {
                  uint target = BitConverter.ToUInt32(Bytes(child.process, Add(mainBase, import.iatRva), 4), 0);
                  imports.Add(Record("dll", import.dll, "name", import.name, "iatRva", Hex(import.iatRva), "resolvedAddress", Hex(target)));
                  int arguments = RegistryArguments(import.name), processArguments = ProcessArguments(import.name), windowArguments = WindowArguments(import.name), modalArguments = ModalArguments(import.name);
                  bool fileAdapter = o.denyPlayerMailslot && (import.name == "CreateFileA" || import.name == "CreateFileW");
                  bool foregroundAdapter = o.foregroundWindowSource != null && import.name == "GetForegroundWindow";
                  if ((import.name == "SHGetFolderPathA" && !String.IsNullOrEmpty(o.redirectedDocumentsPath)) || (import.name == "SHGetPathFromIDListA" && !String.IsNullOrEmpty(o.redirectedShellFolderPath)) || (o.denyRegistryWrites && arguments != 0) || (o.denyChildProcesses && processArguments != 0) || fileAdapter || (o.hideOwnedWindows && (windowArguments != 0 || modalArguments != 0)) || foregroundAdapter) {
                    foreach (Breakpoint existing in breakpoints) if (existing.resolved == target) throw new InvalidDataException("API hook overlaps another breakpoint at " + Hex(target));
                    Breakpoint hook = new Breakpoint {id = "service:" + import.name, resolved = target, service = import.name, argumentCount = import.name == "SHGetFolderPathA" ? 5 : import.name == "SHGetPathFromIDListA" ? 2 : fileAdapter ? 7 : arguments != 0 ? arguments : processArguments != 0 ? processArguments : windowArguments != 0 ? windowArguments : modalArguments};
                    hook.original = Bytes(child.process, target, 1)[0];
                    if (hook.original == 0xcc) throw new InvalidDataException("Refusing original INT3 at service target " + Hex(target));
                    Write(child.process, target, new byte[] {0xcc}); hook.armed = true; breakpoints.Add(hook);
                    emit(Record("type", "service-hook-installed", "api", import.name, "dll", import.dll, "iatRva", Hex(import.iatRva), "address", Hex(target), "originalBytesHex", hook.original.ToString("x2"), "patchBytesHex", "cc"));
                  }
                }
                importsResolved = true;
                emit(Record("type", "imports", "entries", imports, "coverageLimitation", "Hooks cover listed main-executable imports only; dynamically resolved APIs and imports made solely by other modules are not enumerated."));
              }
              else { status = NotHandled; if (firstChance == 0) { fatal = true; reason = "unhandled-exception"; emit(Record("type", "fatal-exception", "code", Hex(exception), "address", Hex(address))); } }
            } else if (code == 5) {
              exited = true; reason = fatal ? "unhandled-exception" : "process-exit"; emit(Record("type", "process-exit", "exitCode", U32(eventData, u)));
            }
            Check(ContinueDebugEvent(pid, tid, status), "ContinueDebugEvent");
            if (exited) break;
          }
          if (frame.active) throw new InvalidDataException("Capture stopped before the pending frame's matching after boundary: " + (reason == "unknown" ? "duration/event/snapshot bound" : reason));
          if(o.ownedWorkerGainWindow!=null)workerGainWindow.RequireComplete();
          if(o.parentRttiObservation!=null)parentRtti.RequireComplete(snapshots);
          if (reason == "unknown") reason = elapsed.ElapsedMilliseconds >= o.maxDurationMs ? "duration-bound" : events >= o.maxEvents ? "event-bound" : "snapshot-bound";
          Dictionary<string, object> completion = Record("type", "complete", "reason", reason, "events", events, "snapshots", snapshots);
          if (deferredBreakpoints.Count != 0) {
            List<object> unfinished = new List<object>();
            foreach (DeferredOwnedBreakpoint deferred in deferredBreakpoints) unfinished.Add(Record("tid", deferred.tid, "breakpointId", deferred.breakpoint.id, "address", Hex(deferred.breakpoint.resolved), "deferredDebugEventOrdinal", deferred.observedDebugEventOrdinal, "previousDeferredDebugEventOrdinal", deferred.previousDebugEventOrdinal == 0 ? null : (object)deferred.previousDebugEventOrdinal, "deferralChainRootDebugEventOrdinal", deferred.chainRootDebugEventOrdinal, "state", "rewound-original-instruction-not-yet-replayed-before-terminal-bound"));
            completion["deferredBreakpointsOutstanding"] = unfinished;
          }
          if (frameSelection != null) completion["pendingFrameSelection"] = frameSelection;
          if(o.ownedWorkerGainWindow!=null)completion["workerGainWindow"]=Record("activationDebugEventOrdinal",workerGainWindow.activationDebugOrdinal,"parentRetained",workerGainWindow.parentComplete,"pairComplete",workerGainWindow.call.complete,"endpointSnapshots",workerGainWindow.call.captured,"sameParentInterleavingClaimed",false);
          if(o.parentRttiObservation!=null)completion["parentRttiObservation"]=Record("selectedParentCheckpoints",parentRtti.stage,"startupSnapshots",3,"externalPairs",parentRtti.pairs,"externalSnapshots",parentRtti.captured,"mapPreflights",parentRtti.mapChecks,"windowClosed",parentRtti.closed,"callOpen",parentRtti.callOpen,"activationDebugEventOrdinal",parentRtti.activationDebugOrdinal);
          emit(completion);
          return fatal ? 2 : 0;
        } catch (Exception error) {
          Dictionary<string, object> pendingFailure = frame.active ? FrameProof(frame) : null;
          bufferedFrame.Clear(); frame.active = false; frame.bufferedBytes = 0;
          Dictionary<string, object> failed = Record("type", "capture-error", "error", error.ToString(), "events", events, "snapshots", snapshots, "pendingFrame", pendingFailure);
          RangeCaptureException rangeFailure = error as RangeCaptureException;
          if (rangeFailure != null) failed["rangeFailure"] = rangeFailure.details;
          emit(failed); throw;
        } finally {
          if (created && o.captureThreadsOnStop) {
            if (!exited) {
              try {ProcessInfo diagnosticChild = child; if (processInformationThreadIsEventOwned) diagnosticChild.thread = IntPtr.Zero; CaptureThreadDiagnostics(diagnosticChild, threads, o.outputDirectory, o.stopThreadStackBytes, emit);}
              catch (Exception diagnosticError) {try {emit(Record("type", "thread-diagnostic-error", "stage", "initialization", "pid", child.pid, "error", diagnosticError.ToString()));} catch { }}
            }
            else try {emit(Record("type", "thread-diagnostics-skipped", "pid", child.pid, "reason", "Owned process already exited."));} catch { }
          }
          if (created && !exited) {
            // Diagnostic suspend increments have already been restored. Cleanup
            // freezes are terminal: never resume them into unpatched UI guards.
            Action<Dictionary<string, object>> cleanupReport = delegate(Dictionary<string, object> row) {try {emit(row);} catch { }};
            try {
              Dictionary<uint, IntPtr> cleanupThreads = new Dictionary<uint, IntPtr>(threads);
              if (!cleanupThreads.ContainsKey(child.tid) && child.thread != IntPtr.Zero && !processInformationThreadIsEventOwned) cleanupThreads.Add(child.tid, child.thread);
              bool allQuiescent = true; List<uint> frozen = new List<uint>(), inertTerminated = new List<uint>();
              foreach (KeyValuePair<uint, IntPtr> thread in cleanupThreads) {
                uint previous;
                try {
                  if (!ChangeTrackedThreadSuspension(thread.Value, child.pid, thread.Key, false, "freeze-terminal-cleanup", cleanupReport, out previous)) {inertTerminated.Add(thread.Key); continue;}
                  frozen.Add(thread.Key);
                  cleanupReport(Record("type", "owned-process-cleanup-thread-frozen", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "previousSuspendCount", previous));
                } catch (Win32Exception error) {
                  allQuiescent = false;
                  cleanupReport(Record("type", "owned-process-cleanup-freeze-error", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", error.NativeErrorCode, "error", error.Message));
                }
              }
              cleanupReport(Record("type", "owned-process-cleanup-freeze", "pid", child.pid, "requestedThreads", cleanupThreads.Count, "frozenTids", frozen, "inertTerminatedTids", inertTerminated, "allFrozen", frozen.Count == cleanupThreads.Count, "allTrackedThreadsQuiescent", allQuiescent));
              if (allQuiescent) {
                foreach (Breakpoint bp in breakpoints) if (bp.armed) try {
                  Write(child.process, bp.resolved, new byte[] {bp.original}); bp.armed = false;
                  byte restored = Bytes(child.process, bp.resolved, 1)[0];
                  if (restored != bp.original) throw new InvalidDataException("Owned breakpoint restoration readback differs.");
                  cleanupReport(Record("type", "owned-breakpoint-restored", "breakpointId", bp.id, "address", Hex(bp.resolved), "originalBytesHex", bp.original.ToString("x2"), "restoredBytesHex", restored.ToString("x2"), "readbackVerified", true));
                } catch (Exception error) {cleanupReport(Record("type", "cleanup-warning", "error", error.Message));}
              } else cleanupReport(Record("type", "owned-process-cleanup-unpatch-skipped", "pid", child.pid, "reason", "An owned thread could not be frozen; retain every remaining guard until process termination."));
            } catch (Exception freezeError) {
              cleanupReport(Record("type", "owned-process-cleanup-unpatch-skipped", "pid", child.pid, "reason", "Cleanup freeze failed; retain guards until process termination.", "error", freezeError.ToString()));
            } finally {
              // Always kill only the owned child, including when freezing, logging,
              // or unpatching fails. No terminal freeze receives ResumeThread.
              bool killed = TerminateProcess(child.process, 0xc000013a);
              int terminationError = killed ? 0 : Marshal.GetLastWin32Error();
              cleanupReport(Record("type", "owned-process-cleanup", "pid", child.pid, "terminated", killed, "win32Error", terminationError));
              if (killed) WaitForSingleObject(child.process, 5000);
            }
          }
          HashSet<IntPtr> handles = new HashSet<IntPtr>(threads.Values);
          if (!processInformationThreadIsEventOwned) handles.Add(child.thread);
          if (!processInformationProcessIsEventOwned) handles.Add(child.process);
          foreach (IntPtr handle in handles) if (handle != IntPtr.Zero) CloseHandle(handle);
          Marshal.FreeHGlobal(eventData);
        }
      }
    }
  }
}
