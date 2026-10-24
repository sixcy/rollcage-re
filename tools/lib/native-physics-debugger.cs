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
    public ParentRttiViewportMapGraph viewportMapGraph;
    public bool weatherScreenQueries;
    public ParentWeatherCounterObservation weatherCounterObservation;
    public ParentSoundBankOwnerGraph soundBankOwnerGraph;
    public ParentFinalTick finalTick;
  }
  public sealed class ParentFinalTick {
    public string returnBreakpointId;
    public ParentFinalLightBands lightBands;
    public ParentFinalListenerWrappers listenerWrappers;
    public ParentFinalMasterLevel masterLevel;
  }
  public sealed class ParentFinalLightBands {
    public string allocationRootRva,sectorTableRva,packRootRva;
    public int maxSectors,maxBandBytes;
  }
  public sealed class ParentFinalListenerWrappers {
    public string headerRva,poseRecordsRva;
    public int maxUsedSlots,wrapperBytes,poseRecordBytes;
  }
  public sealed class ParentFinalMasterLevel {
    public string managerRootRva,levelOffset,methodOffset,methodRva;
    public int vtableBytes;
  }
  public sealed class ParentFinalRange {
    public string id,role;
    public int index;
    public uint address;
    public byte[] data;
    public int[] referenceIndices;
  }
  public sealed class ParentFinalInputsRead {
    public Dictionary<string,object> lightBands,listenerWrappers,masterLevel;
    public List<ParentFinalRange> ranges=new List<ParentFinalRange>();
    public int additionalBytes,lightBandBytes,listenerCount,listenerBytes;
  }
  public sealed class ParentFinalProgress {
    public bool activated,admitted,complete;
    public int activationDebugOrdinal,returnDebugOrdinal,returnSnapshotOrdinal,inputChecks,inputBytes,lightBandBytes,listenerCount,listenerBytes,managerObservations;
    public uint result;
    public void ValidateInputs(ParentRttiProgress parent,uint ownerTid,uint actualTid,string id,int debugOrdinal) {
      int index=Array.IndexOf(ParentRttiProgress.Stages,id);if(id=="native-parent-return")index=10;
      if(parent==null||parent.finalTick!=this||!parent.selected||ownerTid==0||ownerTid!=actualTid||parent.tid!=actualTid||index<0||inputChecks!=index||(index==10?(!admitted||complete||parent.stage!=10||debugOrdinal!=returnDebugOrdinal):(parent.stage!=index+1||debugOrdinal!=parent.lastStageDebugOrdinal)))throw new InvalidDataException("Final typed inputs require the same stopped owned selected checkpoint in exact order.");
    }
    public void CommitInputs(ParentRttiProgress parent,ParentFinalInputsRead observed,uint ownerTid,uint actualTid,string id,int debugOrdinal) {
      ValidateInputs(parent,ownerTid,actualTid,id,debugOrdinal);if(observed==null||observed.lightBands==null||observed.listenerWrappers==null||observed.masterLevel==null||observed.additionalBytes<1||observed.additionalBytes>70000)throw new InvalidDataException("Final typed input publication is incomplete or over-bound.");inputChecks++;inputBytes=checked(inputBytes+observed.additionalBytes);lightBandBytes=checked(lightBandBytes+observed.lightBandBytes);listenerCount=checked(listenerCount+observed.listenerCount);listenerBytes=checked(listenerBytes+observed.listenerBytes);managerObservations++;
    }
    public void Activate(ParentRttiProgress parent,uint mainBase,uint ownerTid,uint actualTid,int debugOrdinal,byte original,bool armed,int hits,byte[] code) {
      if(parent==null||!parent.selected||parent.stage!=1||parent.tid!=actualTid||actualTid!=ownerTid||ownerTid==0||parent.parentEsp<16||(ulong)parent.parentEsp+12>0x100000000UL||parent.parentDebugOrdinal!=debugOrdinal||activated||parent.caller!=checked(mainBase+0x50e38)||original!=0x8b||armed||hits!=0||code==null||code.Length!=2||code[0]!=0x8b||code[1]!=0xd8)throw new InvalidDataException("Final return activation requires captured selected parent entry and exact cold original caller.");
      activated=true;activationDebugOrdinal=debugOrdinal;
    }
    public void Admit(ParentRttiProgress parent,uint mainBase,uint ownerTid,uint actualTid,uint eip,uint esp,uint eax,uint[] nonvolatileRegisters,byte[] stack,int debugOrdinal,int snapshotOrdinal) {
      if(parent==null||!activated||admitted||complete||!parent.selected||parent.stage!=10||!parent.closed||parent.windowOpen||parent.callOpen||parent.weatherPairs!=2||parent.counter==null||!parent.counter.complete||parent.mapChecks!=3||parent.graphChecks!=3||inputChecks!=10||parent.soundOwnerChecks!=10||parent.soundChannelChecks!=10||ownerTid==0||ownerTid!=actualTid||actualTid!=parent.tid||parent.parentEsp<16||(ulong)parent.parentEsp+12>0x100000000UL||eip!=checked(mainBase+0x50e38)||esp!=parent.parentEsp+4||eax>1||debugOrdinal<=parent.lastStageDebugOrdinal||debugOrdinal<=activationDebugOrdinal||snapshotOrdinal!=22||stack==null||stack.Length!=28||nonvolatileRegisters==null||nonvolatileRegisters.Length!=4||parent.incomingNonvolatile==null)throw new InvalidDataException("Final return lacks exact completed owned parent, caller stack, pair/snapshot lifecycle or return domain.");
      for(int i=0;i<4;i++)if(nonvolatileRegisters[i]!=parent.incomingNonvolatile[i]||BitConverter.ToUInt32(stack,i*4)!=parent.incomingNonvolatile[i])throw new InvalidDataException("Final native return changed a preserved parent register.");
      if(BitConverter.ToUInt32(stack,16)!=checked(mainBase+0x50e38)||BitConverter.ToUInt32(stack,20)!=parent.totalIterations)throw new InvalidDataException("Final native return word/argument differs from the original parent entry.");
      admitted=true;returnDebugOrdinal=debugOrdinal;returnSnapshotOrdinal=snapshotOrdinal;result=eax;
    }
    public void CommitReturn(ParentRttiProgress parent) {if(!admitted||complete||inputChecks!=11||parent.soundOwnerChecks!=11||parent.soundChannelChecks!=11||parent.mapChecks!=4||parent.graphChecks!=4)throw new InvalidDataException("Final return publication lacks complete typed/owner/map observations.");complete=true;}
  }
  public sealed class ParentSoundBankOwnerGraph {
    public string rootRva,headerRangeId,storageRangeId;
    public int maxUsedSlots,ownerBytes;
    public string[] breakpointIds;
    public ParentSoundBankChannelGraph channelGraph;
  }
  public sealed class ParentSoundBankChannelGraph {
    public int maxUsedChannelSlots,wrapperBytes,sourceBytes,vtableBytes;
    public string sourceVtableRva;
  }
  public sealed class ParentSoundChannelRange {
    public string id,role,probeBytesHex;
    public int index,length;
    public uint address,sourceAddress,vtableAddress;
    public byte[] data;
    public ParentSoundChannelRange source,vtable;
    public List<int> referenceIndices=new List<int>();
  }
  public sealed class ParentSoundChannelRead {
    public int usedChannelSlots,additionalBytes;
    public List<Dictionary<string,object>> owners=new List<Dictionary<string,object>>(),slots=new List<Dictionary<string,object>>();
    public List<ParentSoundChannelRange> storages=new List<ParentSoundChannelRange>(),wrappers=new List<ParentSoundChannelRange>(),sources=new List<ParentSoundChannelRange>(),vtables=new List<ParentSoundChannelRange>(),ranges=new List<ParentSoundChannelRange>();
  }
  public sealed class ParentSoundBankCapturedRange {
    public string id;
    public uint address,vectorHeaderAddress;
    public byte[] data;
    public VectorStorageInfo vector;
  }
  public sealed class ParentSoundBankOwnerRange {
    public string id;
    public int index;
    public uint address;
    public byte[] data;
    public List<int> slotIndices=new List<int>();
  }
  public sealed class ParentSoundBankOwnerRead {
    public uint headerAddress,begin,end,capacity;
    public int usedSlots,capacitySlots,additionalOwnerBytes;
    public ParentSoundBankCapturedRange header,storage;
    public List<int> nullSlots=new List<int>();
    public List<Dictionary<string,object>> slots=new List<Dictionary<string,object>>();
    public List<ParentSoundBankOwnerRange> owners=new List<ParentSoundBankOwnerRange>();
    public ParentSoundChannelRead channelGraph;
  }
  public sealed class ParentWeatherCounterObservation {
    public string callBreakpointId, returnBreakpointId;
    public int maxPairs, maxSnapshots;
  }
  public sealed class ParentWeatherCounterRead {
    public uint parentU,timerEntry,ebp,aligned,frame,beforeEsp,afterEsp,output;
    public List<ParentRttiObservedRange> ranges=new List<ParentRttiObservedRange>();
    public byte[] argument,outputBytes,frameBytes,timerReturn,screenReturn,parentReturn,iat,initialized,originFrequency,clockBytes;
  }
  public sealed class ParentWeatherCounterProgress {
    public byte[] initialFlag,initialOriginFrequency,initialIat;
    public bool originalLatched,open,complete;
    public int captured,pairs,callDebugEventOrdinal,returnDebugEventOrdinal,callSnapshotOrdinal;
    public uint parentU,iatTarget,moduleBaseAddress;
    byte[] beforeFrame;
    public void LatchOriginal(ParentRttiProgress parent,uint mainBase,uint actualTid,Func<uint,int,byte[]> read) {
      if(originalLatched||parent==null||!parent.selected||!parent.weatherScreenQueries||parent.stage!=1||parent.tid!=actualTid||parent.parentEsp<4096||parent.parentEsp%4!=0||mainBase==0||(ulong)mainBase+0x3135b4>0x100000000UL||read==null)throw new InvalidDataException("Counter original inputs require the actual selected owned parent entry.");
      byte[] flag=NativeDebugger.ReadParentCounterBytes(checked(mainBase+0x2e6c8c),4,read),origin=NativeDebugger.ReadParentCounterBytes(checked(mainBase+0x3135a4),16,read),iat=NativeDebugger.ReadParentCounterBytes(checked(mainBase+0x16e0fc),4,read);
      if(BitConverter.ToUInt32(flag,0)!=1||BitConverter.ToInt64(origin,0)<=0||BitConverter.ToUInt32(iat,0)==0)throw new InvalidDataException("Counter observation requires an already initialized original clock, positive frequency and actual nonnull IAT target.");
      initialFlag=(byte[])flag.Clone();initialOriginFrequency=(byte[])origin.Clone();initialIat=(byte[])iat.Clone();parentU=parent.parentEsp;moduleBaseAddress=mainBase;iatTarget=BitConverter.ToUInt32(iat,0);originalLatched=true;
    }
    public bool CanRead(ParentRttiProgress parent,uint actualTid,bool entry,uint esp) {
      if(!originalLatched||parent==null||!parent.selected||!parent.weatherScreenQueries||!parent.windowOpen||parent.closed||parent.stage!=9||parent.weatherPairs!=2||parent.callOpen||parent.tid!=actualTid||parent.parentEsp!=parentU)return false;
      uint aligned=(parentU-368)&~7u,frame=aligned-32;return esp==(entry?frame-4:frame);
    }
    public void Validate(ParentRttiProgress parent,bool entry,uint mainBase,uint actualTid,uint eip,uint ebp,uint esi,uint esp,ParentWeatherCounterRead observed,int debugOrdinal,int snapshotOrdinal,int snapshotLimit) {
      if(!CanRead(parent,actualTid,entry,esp)||mainBase!=moduleBaseAddress||eip!=checked(mainBase+(entry?0x89d11u:0x89d13u))||ebp!=parentU-368||esi!=iatTarget||observed==null||observed.parentU!=parentU||debugOrdinal<=parent.lastEndpointDebugOrdinal||debugOrdinal<=parent.activationDebugOrdinal||snapshotOrdinal!=3+parent.stage+parent.captured+(entry?0:1)+1||snapshotLimit!=(parent.finalTick==null?21:22)||NativeDebugger.RequiredParentCounterSnapshots(parent)>snapshotLimit)throw new InvalidDataException("Counter admission lacks exact caller/parent scope or the combined original checkpoint snapshot budget.");
      NativeDebugger.ValidateParentWeatherCounterRead(this,parent,mainBase,observed);
      if(entry){if(open||complete||captured!=0||pairs!=0)throw new InvalidDataException("Counter observation permits one genuine nonnested call only.");beforeFrame=(byte[])observed.frameBytes.Clone();callDebugEventOrdinal=debugOrdinal;callSnapshotOrdinal=snapshotOrdinal;open=true;}
      else {if(!open||complete||captured!=1||pairs!=0||debugOrdinal<=callDebugEventOrdinal||snapshotOrdinal!=callSnapshotOrdinal+1)throw new InvalidDataException("Counter return lacks its same original open call.");for(int i=0;i<24;i++)if(beforeFrame[i]!=observed.frameBytes[i])throw new InvalidDataException("Counter call changed captured non-output frame bytes.");returnDebugEventOrdinal=debugOrdinal;}
    }
    public void Commit(bool entry) {if(!open||complete||captured!=(entry?0:1))throw new InvalidDataException("Counter snapshot commit order differs.");captured++;if(!entry){open=false;complete=true;pairs=1;}}
    public void RequireComplete(int worldDebugOrdinal) {if(!originalLatched||open||!complete||pairs!=1||captured!=2||returnDebugEventOrdinal<=callDebugEventOrdinal||worldDebugOrdinal<=returnDebugEventOrdinal)throw new InvalidDataException("World checkpoint lacks one fully observed original performance-counter call/return.");}
  }
  public sealed class ParentRttiViewportMapGraph {
    public int maxNodes, maxKeyBytes;
    public string[] breakpointIds;
  }
  public sealed class ParentRttiMapGraphRange {
    public string id, role, path;
    public int nodeIndex;
    public uint address, nodeAddress;
    public byte[] data;
  }
  public sealed class ParentRttiMapGraphRead {
    public uint appAddress, headerAddress, headAddress, rootAddress, count;
    public byte[] headerBytes, headBytes;
    public List<ParentRttiMapGraphRange> ranges=new List<ParentRttiMapGraphRange>();
    public List<Dictionary<string,object>> nodes=new List<Dictionary<string,object>>();
  }
  public sealed class ParentRttiMapRead {
    public uint rootAddress, appAddress, headSlotAddress, headAddress;
    public byte[] rootBytes, headBytes;
  }
  public sealed class ParentRttiEndpointRead {
    public byte[] context, cameraReturn, clockBytes, singletonBytes;
    public byte[] queryReturn, screenReturn, parentReturn, name;
    public bool commonCaller, weather;
    public int weatherQueryIndex;
    public List<ParentRttiObservedRange> ranges=new List<ParentRttiObservedRange>();
  }
  public sealed class ParentRttiObservedRange {
    public string id;
    public uint address;
    public byte[] data;
  }
  public sealed class ParentRttiProgress {
    public ParentWeatherCounterProgress counter;
    public ParentFinalProgress finalTick;
    public uint tid, parentEsp, clock, iteration, caller, totalIterations, appAddress, headAddress;
    public uint[] incomingNonvolatile;
    public int parentDebugOrdinal, activationDebugOrdinal, auxiliarySnapshotOrdinal, lastStageDebugOrdinal, lastEndpointDebugOrdinal, stage, captured, pairs, mapChecks, graphChecks;
    public int soundOwnerChecks,soundOwnerRows,soundOwnerBytes;
    public int soundChannelChecks,soundChannelSlots,soundChannelStorages,soundChannelWrappers,soundChannelSources,soundChannelVtables,soundChannelBytes;
    public bool selected, windowOpen, closed, callOpen, auxiliaryCaptured, auxiliaryPublished, weatherScreenQueries, openWeather;
    public int weatherPairs, openWeatherQueryIndex;
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
        if(id=="native-control-after-cameras"||weatherScreenQueries&&id=="native-control-after-world-effects"){if(!windowOpen||closed||callOpen||captured!=pairs*2||debugOrdinal<=lastEndpointDebugOrdinal)throw new InvalidDataException("Parent RTTI camera/world boundary has an unmatched external call.");if(!weatherScreenQueries||id=="native-control-after-world-effects"){if(weatherScreenQueries&&weatherPairs!=2)throw new InvalidDataException("Parent RTTI mixed window lacks both original ordered weather queries.");if(counter!=null)counter.RequireComplete(debugOrdinal);windowOpen=false;closed=true;}}
      }
      stage++;lastStageDebugOrdinal=debugOrdinal;
    }
    public void ObserveMap(string id,uint app,uint head) {
      bool entry=id=="native-control-before";
      bool valid=entry?(stage==1&&mapChecks==0):id=="native-control-after-cameras"?(stage==9&&mapChecks==1):id=="native-parent-return"?(finalTick!=null&&finalTick.admitted&&stage==10&&mapChecks==3):id=="native-control-after-world-effects"&&(stage==10&&mapChecks==2);
      if(!selected||app==0||head==0||!valid)throw new InvalidDataException("Parent RTTI map preflight stage/null identity differs.");
      if(entry){appAddress=app;headAddress=head;}else if(appAddress!=app||headAddress!=head)throw new InvalidDataException("Parent RTTI singleton/head identity changed after selected parent entry.");mapChecks++;
    }
    public void Activate(int debugOrdinal,uint actualTid) {
      if(!selected||stage!=8||!auxiliaryCaptured||auxiliaryPublished||actualTid!=tid||activationDebugOrdinal!=0||debugOrdinal!=lastStageDebugOrdinal||debugOrdinal<=parentDebugOrdinal||mapChecks!=1)throw new InvalidDataException("Parent RTTI activation requires captured but unpublished selected auxiliary bytes.");activationDebugOrdinal=debugOrdinal;windowOpen=true;
    }
    public void MarkAuxiliaryCaptured(int ordinal){if(stage!=8||auxiliaryCaptured||ordinal<1)throw new InvalidDataException("Parent RTTI auxiliary capture order differs.");auxiliaryCaptured=true;auxiliarySnapshotOrdinal=ordinal;}
    public void MarkAuxiliaryPublished(){if(!auxiliaryCaptured||auxiliaryPublished||!windowOpen||activationDebugOrdinal==0)throw new InvalidDataException("Parent RTTI auxiliary publication precedes guarded activation.");auxiliaryPublished=true;}
    public bool CanRead(uint actualTid,uint esp) {return selected&&windowOpen&&!closed&&actualTid==tid&&(esp==parentEsp-276&&(!weatherScreenQueries||stage==8)||weatherScreenQueries&&stage==9&&esp==parentEsp-460);}
    public void ValidateEndpoint(bool entry,uint mainBase,uint actualTid,uint esp,uint actualClock,uint singleton,byte[] context,byte[] cameraReturn,int debugOrdinal) {
      if(!CanRead(actualTid,esp)||esp!=parentEsp-276||weatherScreenQueries&&(stage!=8||openWeather)||actualClock!=clock||singleton!=appAddress||debugOrdinal<=activationDebugOrdinal||debugOrdinal<=lastEndpointDebugOrdinal||context==null||context.Length!=52||cameraReturn==null||cameraReturn.Length!=4)throw new InvalidDataException("Parent RTTI endpoint scope/clock/extents differs.");
      //41a0c0 PUSH1;41a0c2 PUSHname: wrapper R+4 is NAME, R+8 is MODE.
      if(BitConverter.ToUInt32(context,40)!=checked(mainBase+0x1a0c8)||BitConverter.ToUInt32(context,44)!=parentEsp-60||BitConverter.ToUInt32(context,48)!=1||BitConverter.ToUInt32(cameraReturn,0)!=checked(mainBase+0x51107)||BitConverter.ToUInt32(context,0)!=appAddress||BitConverter.ToUInt32(context,4)!=0||BitConverter.ToUInt32(context,8)!=checked(mainBase+0x2e213c)||BitConverter.ToUInt32(context,12)!=checked(mainBase+0x2e20a4)||BitConverter.ToUInt32(context,16)!=0)throw new InvalidDataException("Parent RTTI common wrapper/camera/type arguments differ.");
      if(entry){if(callOpen||pairs>=4||captured!=pairs*2)throw new InvalidDataException("Parent RTTI external pair bound/nesting differs.");arguments=new byte[20];Buffer.BlockCopy(context,0,arguments,0,20);callOpen=true;}
      else {if(!callOpen||captured!=pairs*2+1)throw new InvalidDataException("Parent RTTI return lacks its captured call.");for(int i=0;i<20;i++)if(arguments[i]!=context[i])throw new InvalidDataException("Parent RTTI external arguments changed across its call.");}lastEndpointDebugOrdinal=debugOrdinal;
    }
    public void ValidateWeatherEndpoint(bool entry,uint mainBase,uint actualTid,uint esp,ParentRttiEndpointRead observed,int debugOrdinal) {
      if(!weatherScreenQueries||!CanRead(actualTid,esp)||stage!=9||esp!=parentEsp-460||observed==null||!observed.weather||!observed.commonCaller||!NativeDebugger.ParentRttiWeatherAbiMatches(this,mainBase,observed)||observed.clockBytes==null||observed.clockBytes.Length!=4||BitConverter.ToUInt32(observed.clockBytes,0)!=clock||observed.singletonBytes==null||observed.singletonBytes.Length!=4||BitConverter.ToUInt32(observed.singletonBytes,0)!=appAddress||debugOrdinal<=activationDebugOrdinal||debugOrdinal<=lastEndpointDebugOrdinal)throw new InvalidDataException("Parent RTTI direct weather scope/caller/arguments differs.");
      int query=observed.weatherQueryIndex;
      if(entry){if(callOpen||pairs>=4||captured!=pairs*2||query!=weatherPairs+1||query>2)throw new InvalidDataException("Parent RTTI weather queries must be separately observed in original first/second order.");arguments=new byte[20];Buffer.BlockCopy(observed.context,0,arguments,0,20);callOpen=true;openWeather=true;openWeatherQueryIndex=query;}
      else {if(!callOpen||!openWeather||query!=openWeatherQueryIndex||query!=weatherPairs+1||captured!=pairs*2+1)throw new InvalidDataException("Parent RTTI weather return lacks the same original query call.");for(int i=0;i<20;i++)if(arguments[i]!=observed.context[i])throw new InvalidDataException("Parent RTTI weather external arguments changed across its call.");}lastEndpointDebugOrdinal=debugOrdinal;
    }
    public void CommitEndpoint(bool entry) {if(!callOpen||captured!=(entry?pairs*2:pairs*2+1))throw new InvalidDataException("Parent RTTI endpoint commit differs.");captured++;if(!entry){pairs++;callOpen=false;if(openWeather){weatherPairs++;openWeather=false;openWeatherQueryIndex=0;}}}
    public void RequireComplete(int snapshots) {if(!selected||stage!=10||!closed||windowOpen||callOpen||!auxiliaryPublished||mapChecks!=(finalTick==null?3:4)||captured!=pairs*2||pairs>4||weatherScreenQueries&&weatherPairs!=2||snapshots!=13+captured+(counter==null?0:counter.captured)+(finalTick==null?0:1))throw new InvalidDataException("Parent RTTI capture lacks complete original checkpoints and matched scoped external snapshots.");if(counter!=null)counter.RequireComplete(lastStageDebugOrdinal);if(finalTick!=null&&!finalTick.complete)throw new InvalidDataException("Final purpose lacks the actual post-return endpoint.");}
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
  public sealed class RaceClockObservation {
    public string entryBreakpointId,counterCallBreakpointId,counterReturnBreakpointId,returnBreakpointId;
    public int minimumLogicalClock,stackBytesBefore,stackBytesAfter,maxCounterPairs,maxSnapshots;
  }
  public sealed class RaceClockRange { public string id;public uint address;public byte[] data; }
  public sealed class RaceClockRead {
    public string role,id;public uint moduleBase,entryEsp,session,logical,delivered;public uint[] nonvolatile;
    public int debugOrdinal,snapshotOrdinal,index;public byte[] context;
    public List<RaceClockRange> ranges=new List<RaceClockRange>();
  }
  public sealed class RaceClockProgress {
    public int stage,lastDebugOrdinal,entryDebugOrdinal,entrySnapshotOrdinal,activationDebugOrdinal,callDebugOrdinal,callSnapshotOrdinal,returnDebugOrdinal,returnSnapshotOrdinal;
    public uint tid,result;public RaceClockRead original;
    public bool activated;
    public void Commit(RaceClockRead read,uint ownerTid,uint actualTid) {
      string[] ids={"native-race-clock-entry","native-race-clock-counter-call","native-race-clock-counter-return","native-race-clock-return"};
      if(read==null||ownerTid==0||ownerTid!=actualTid||read.index!=stage+1||stage>=4||read.id!=ids[stage]||read.snapshotOrdinal!=4+stage||read.debugOrdinal<1||read.debugOrdinal<=lastDebugOrdinal||stage>0&&!activated)throw new InvalidDataException("Race clock commit lacks an actual published ordered snapshot.");
      if(stage==0){original=read;tid=actualTid;entryDebugOrdinal=read.debugOrdinal;entrySnapshotOrdinal=read.snapshotOrdinal;}
      if(stage==1){callDebugOrdinal=read.debugOrdinal;callSnapshotOrdinal=read.snapshotOrdinal;}
      if(stage==3){returnDebugOrdinal=read.debugOrdinal;returnSnapshotOrdinal=read.snapshotOrdinal;result=BitConverter.ToUInt32(read.context,176);}
      lastDebugOrdinal=read.debugOrdinal;stage++;
    }
    public void Activate(int debugOrdinal,int publishedSnapshotOrdinal) {
      if(stage!=1||activated||debugOrdinal!=entryDebugOrdinal||publishedSnapshotOrdinal!=entrySnapshotOrdinal)throw new InvalidDataException("Race clock activation must follow published selected entry at the same stopped event.");
      activated=true;activationDebugOrdinal=debugOrdinal;
    }
    public void RequireComplete(int snapshots){if(stage!=4||!activated||snapshots!=7||entrySnapshotOrdinal!=4||callSnapshotOrdinal!=5||returnSnapshotOrdinal!=7)throw new InvalidDataException("Race clock lacks its complete original four-observation group.");}
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
    public RaceClockObservation raceClockObservation;
  }
  public static class NativeDebugger {
    public const string ParentRttiCapability="scoped-parent-rtti-and-singleton-map-preflight-v1";
    public const string ParentRttiMapGraphCapability="scoped-parent-rtti-viewport-map-graph-v2";
    public const string ParentRttiWeatherCapability="scoped-parent-camera-weather-rtti-v3";
    public const string ParentWeatherCounterCapability="scoped-parent-weather-counter-v4";
    public const string ParentSoundBankOwnerCapability="scoped-parent-sound-bank-owner-graph-v1";
    public const string ParentSoundBankChannelCapability="scoped-parent-sound-bank-channel-graph-v1";
    public const string ParentFinalTickCapability="scoped-parent-final-tick-v1";
    public const string RaceClockCapability="scoped-race-step-clock-v1";
    public static void ValidateRaceClockPolicy(Options o) {
      RaceClockObservation p=o.raceClockObservation;if(p==null)return;
      if(p.entryBreakpointId!="native-race-clock-entry"||p.counterCallBreakpointId!="native-race-clock-counter-call"||p.counterReturnBreakpointId!="native-race-clock-counter-return"||p.returnBreakpointId!="native-race-clock-return"||p.minimumLogicalClock!=288||p.stackBytesBefore!=512||p.stackBytesAfter!=28||p.maxCounterPairs!=1||p.maxSnapshots!=4||o.maxSnapshots!=7||o.maxDurationMs!=90000||o.maxEvents!=1000000||!o.captureThreadEnvironment||o.ranges.Length!=0||o.breakpoints.Length!=7||o.phaseActions.Length!=3||o.parentRttiObservation!=null||o.pendingFrameObserver!=null||o.observationActivation!=null||o.ownedWorkerObservation!=null||o.ownedWorkerGainPair!=null||o.ownedWorkerGainWindow!=null||o.heldForceInput!=null||o.controlledRaceSettings!=null)throw new InvalidDataException("Race clock requires its exact separate warm bounded purpose.");
      if(!o.denyRegistryWrites||!o.denyChildProcesses||!o.denyPlayerMailslot||!o.hideOwnedWindows||!o.captureThreadsOnStop||o.stopThreadStackBytes!=128||o.showWindow||String.Join(",",o.arguments)!="/windowed,/width,800,/height,600"||!String.Equals(o.expectedSha256,"c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5",StringComparison.OrdinalIgnoreCase)||!SameRange(o.foregroundWindowSource,new MemoryRange{id="owned-application-hwnd",rva="0x2efb38",dereferenceOffsets=new string[]{"0"},offset="4",length=4}))throw new InvalidDataException("Race clock original owned/security startup policy differs.");
      string[] ids={"launcher-policy","graphics-policy","before-device-creation",p.entryBreakpointId,p.counterCallBreakpointId,p.counterReturnBreakpointId,p.returnBreakpointId};uint[] sites={0x42890,0x35be,0x112a30,0x41c70,0x89d11,0x89d13,0x50df0};
      for(int i=0;i<7;i++){Breakpoint b=o.breakpoints[i];if(b.id!=ids[i]||Number(b.rva)!=sites[i]||b.address!=null||b.service!=null||b.stopAfterHits!=0||b.captureWhen!=null||b.skipMatchingHits.HasValue||i>=3&&b.ranges.Length!=0)throw new InvalidDataException("Race clock extra/reordered/moved/filtering code site differs.");}
      MemoryRange[][] startup={new MemoryRange[]{new MemoryRange{id="launcher-skip",rva="0x2e66ec",length=4},new MemoryRange{id="launcher-config",rva="0x1ecefc",dereferenceOffsets=new string[]{"0"},offset="0x42c",length=10}},new MemoryRange[]{new MemoryRange{id="graphics-mode",rva="0x2e64a4",dereferenceOffsets=new string[]{"0"},offset="0x24",length=28}},new MemoryRange[]{new MemoryRange{id="presentation",baseRegister="ecx",offset="0x378",length=56},new MemoryRange{id="entry-stack",baseRegister="esp",length=32}}};
      for(int i=0;i<3;i++){if(o.breakpoints[i].ranges.Length!=startup[i].Length||o.phaseActions[i].breakpointId!=ids[i]||o.phaseActions[i].hit!=1||o.phaseActions[i].writes.Length!=(i==0?3:i==1?1:2))throw new InvalidDataException("Race clock startup observations/actions differ.");for(int j=0;j<startup[i].Length;j++)if(!SameRange(o.breakpoints[i].ranges[j],startup[i][j]))throw new InvalidDataException("Race clock startup input differs.");}
      uint[] roots={0x2e66ec,0x1ecefc,0x1ecefc,0x2e64a4,0,0};int[] offsets={0,10,14,60,0x398,0x3a8};string[] replacements={"01000000","01","01","00","01000000","00000000"};int slot=0;
      foreach(PhaseAction a in o.phaseActions)foreach(MemoryWrite w in a.writes){bool chain=slot>=1&&slot<=3;if(w.address!=null||Number(w.rva)!=roots[slot]||(slot>=4?w.baseRegister!="ecx":w.baseRegister!=null)||Offset(w.offset)!=offsets[slot]||w.dereferenceOffsets.Length!=(chain?1:0)||chain&&Offset(w.dereferenceOffsets[0])!=0||BytesHex(ParseBytes(w.bytesHex))!=replacements[slot])throw new InvalidDataException("Race clock forbids nonstartup/game writes.");if(slot<4){string[] expected=slot==0?new string[]{"00000000","01000000"}:new string[]{"00","01"};if(w.expectedBytesHex!=null||w.expectedAnyBytesHex==null||w.expectedAnyBytesHex.Length!=2||w.expectedAnyBytesHex[0]!=expected[0]||w.expectedAnyBytesHex[1]!=expected[1])throw new InvalidDataException("Race clock original startup guard differs.");}else if(w.expectedAnyBytesHex!=null||w.expectedBytesHex!=replacements[slot])throw new InvalidDataException("Race clock device writes must be exact guarded noops.");slot++;}
    }
    public static byte[] RaceClockCode(string id,uint mainBase) {
      if(id=="native-race-clock-entry")return ParseBytes("83ec08");if(id=="native-race-clock-counter-call")return ParseBytes("ffd6");if(id=="native-race-clock-counter-return")return ParseBytes("8b442418");
      if(id!="native-race-clock-return"||mainBase==0||(ulong)mainBase+0x2e6b50>0x100000000UL)throw new InvalidDataException("Unknown race clock code domain.");byte[] b=new byte[6];b[0]=0x8b;b[1]=0x35;Buffer.BlockCopy(BitConverter.GetBytes(mainBase+0x2e6b4c),0,b,2,4);return b;
    }
    public static void ValidateRaceClockDeferred(string id,uint mainBase,byte original,bool armed,int raw,int matching,int captured,byte[] code){byte[] expected=RaceClockCode(id,mainBase);if(id=="native-race-clock-entry"||armed||raw!=0||matching!=0||captured!=0||original!=expected[0]||code==null||Digest(code)!=Digest(expected))throw new InvalidDataException("Race clock deferred code/counters changed before arming.");}
    public static byte[] ValidateRaceClockStoppedCode(string id,uint mainBase,byte original,bool armed,byte[] code){byte[] expected=RaceClockCode(id,mainBase);if(!armed||original!=expected[0]||code==null||code.Length!=expected.Length||code[0]!=0xcc)throw new InvalidDataException("Race clock stopped code is not its actual armed original site.");byte[] normalized=(byte[])code.Clone();normalized[0]=original;if(Digest(normalized)!=Digest(expected))throw new InvalidDataException("Race clock actual relocated original instruction changed.");return normalized;}
    public static Dictionary<string,uint> RaceClockLayout(uint C){if(C<512||(C&3)!=0||(ulong)C+28>0x100000000UL)throw new InvalidDataException("Race clock stack exceeds bounded DWORD-aligned x86 extent.");uint T=C-16,A=(C-20)&~7u,F=A-32;return new Dictionary<string,uint>{{"entryEsp",C},{"timerEntryEsp",T},{"timerEbp",C-20},{"alignedAddress",A},{"frame",F},{"counterCallEsp",F-4},{"counterReturnEsp",F},{"outputAddress",F+24},{"returnEsp",C+4},{"stackAddress",C-512},{"stackBytes",540}};}
    static byte[] ClockPart(RaceClockRead r,string id){RaceClockRange p=r.ranges.Find(delegate(RaceClockRange x){return x.id==id;});if(p==null)throw new InvalidDataException("Race clock missing exact observed row.");return p.data;}
    static byte[] ClockRead(Func<uint,int,byte[]> read,uint address,int length){if(address==0||length<1||(ulong)address+(ulong)length>0x100000000UL)throw new InvalidDataException("Race clock real pointer span overflows.");byte[] b=read(address,length);if(b==null||b.Length!=length)throw new InvalidDataException("Race clock actual read extent differs.");return(byte[])b.Clone();}
    public static RaceClockRead ReadRaceClockObservation(RaceClockProgress state,uint ownerTid,uint tid,uint mainBase,string id,byte[] context,int debugOrdinal,int snapshotOrdinal,Func<uint,int,byte[]> read) {
      if(ownerTid==0||tid!=ownerTid)return null; //Before all foreign stack/root reads.
      if(state==null||context==null||context.Length!=716||read==null||mainBase==0||(ulong)mainBase+0x50a54c>0x100000000UL||debugOrdinal<1)throw new InvalidDataException("Race clock missing actual context/owned module/reader.");
      string[] sites={"native-race-clock-entry","native-race-clock-counter-call","native-race-clock-counter-return","native-race-clock-return"};uint[] rvas={0x41c70,0x89d11,0x89d13,0x50df0};int index=Array.IndexOf(sites,id);
      if(index<0||index!=state.stage||state.stage>=4||state.stage>0&&(!state.activated||state.tid!=tid||mainBase!=state.original.moduleBase))throw new InvalidDataException("Nested/reordered/duplicate selected race clock observation.");
      uint esp=BitConverter.ToUInt32(context,196),C=state.stage==0?esp:state.original.entryEsp;
      if(state.stage==0&&(C<512||(C&3)!=0||(ulong)C+28>0x100000000UL))return null;
      Dictionary<string,uint> l=RaceClockLayout(C);if(BitConverter.ToUInt32(context,184)!=mainBase+rvas[index]||esp!=(index==0?C:index==1?l["counterCallEsp"]:index==2?l["counterReturnEsp"]:l["returnEsp"]))throw new InvalidDataException("Race clock selected EIP/stack differs.");
      if(state.stage==0){if(BitConverter.ToUInt32(ClockRead(read,C,4),0)!=mainBase+0x50df0||BitConverter.ToUInt32(ClockRead(read,C+24,4),0)!=mainBase+0x40cd5)return null;}
      uint session=BitConverter.ToUInt32(ClockRead(read,mainBase+0x1ecb1c,4),0);if(session==0){if(state.stage==0)return null;throw new InvalidDataException("Race clock selected session became NULL.");}
      uint phase=BitConverter.ToUInt32(ClockRead(read,checked(session+0x57c),4),0),logical=BitConverter.ToUInt32(ClockRead(read,mainBase+0x50a548,4),0),delivered=BitConverter.ToUInt32(ClockRead(read,mainBase+0x2e66f8,4),0);
      if(state.stage==0&&(phase!=4||logical<288||delivered==0||BitConverter.ToUInt32(ClockRead(read,mainBase+0x2e6c8c,4),0)!=1||BitConverter.ToInt64(ClockRead(read,mainBase+0x3135a4,8),0)<=0||BitConverter.ToUInt32(ClockRead(read,mainBase+0x16e0fc,4),0)==0||BitConverter.ToUInt32(ClockRead(read,mainBase+0x16e114,4),0)==0))return null;
      if(snapshotOrdinal!=4+index||state.stage>0&&(session!=state.original.session||logical!=state.original.logical))throw new InvalidDataException("Race clock snapshot/root/logical lineage differs.");
      RaceClockRead observed=new RaceClockRead{id=id,role=index==0?"entry":index==1?"counter-call":index==2?"counter-return":"return",index=index+1,moduleBase=mainBase,entryEsp=C,session=session,logical=logical,delivered=delivered,debugOrdinal=debugOrdinal,snapshotOrdinal=snapshotOrdinal,context=(byte[])context.Clone(),nonvolatile=new uint[]{BitConverter.ToUInt32(context,164),BitConverter.ToUInt32(context,180),BitConverter.ToUInt32(context,160),BitConverter.ToUInt32(context,156)}};
      string[] ids={"race-clock-origin","race-clock-streak","race-clock-delivered","race-clock-network","race-clock-enabled","race-clock-frequency-origin","race-clock-qpc-import","race-clock-qpf-import","race-clock-scale","race-clock-conversion-tables","race-clock-logical","race-clock-sample","race-clock-session-root"};uint[] roots={0x2e66b0,0x2e66e4,0x2e66f8,0x2eafe0,0x2e6c8c,0x3135a4,0x16e0fc,0x16e114,0x1dc6e0,0x16f6a0,0x50a548,0x2e675c,0x1ecb1c};int[] lengths={8,4,4,4,4,16,4,4,8,130,4,4,4};
      for(int i=0;i<ids.Length;i++)observed.ranges.Add(new RaceClockRange{id=ids[i],address=mainBase+roots[i],data=ClockRead(read,mainBase+roots[i],lengths[i])});
      observed.ranges.Add(new RaceClockRange{id="race-clock-session-phase",address=checked(session+0x57c),data=ClockRead(read,checked(session+0x57c),4)});observed.ranges.Add(new RaceClockRange{id="race-clock-stack",address=C-512,data=ClockRead(read,C-512,540)});
      if(BitConverter.ToUInt32(ClockPart(observed,"race-clock-session-root"),0)!=session||BitConverter.ToUInt32(ClockPart(observed,"race-clock-logical"),0)!=logical||BitConverter.ToUInt32(ClockPart(observed,"race-clock-delivered"),0)!=delivered||BitConverter.ToUInt32(ClockPart(observed,"race-clock-session-phase"),0)!=phase)throw new InvalidDataException("Race clock guard/payload observations disagree.");
      byte[] stack=ClockPart(observed,"race-clock-stack");if(BitConverter.ToUInt32(stack,512)!=mainBase+0x50df0||BitConverter.ToUInt32(stack,536)!=mainBase+0x40cd5||phase!=4)throw new InvalidDataException("Race clock live caller/outer/phase guard differs.");
      if(index>0&&debugOrdinal<=state.lastDebugOrdinal)throw new InvalidDataException("Race clock observation event order differs.");
      if(index>0){byte[] oldStack=ClockPart(state.original,"race-clock-stack");for(int i=512;i<540;i++)if(stack[i]!=oldStack[i])throw new InvalidDataException("Race clock live entry/outer caller stack changed.");foreach(RaceClockRange row in observed.ranges){if(row.id=="race-clock-stack"||row.id=="race-clock-streak"||row.id=="race-clock-delivered")continue;if(Digest(row.data)!=Digest(ClockPart(state.original,row.id)))throw new InvalidDataException("Race clock original input changed: "+row.id);}if((BitConverter.ToUInt32(context,28)&65535)!=(BitConverter.ToUInt32(state.original.context,28)&65535)||(BitConverter.ToUInt32(context,228)&0xffc0)!=(BitConverter.ToUInt32(state.original.context,228)&0xffc0))throw new InvalidDataException("Race clock original numerical controls changed.");}
      if(index==1||index==2){uint qpc=BitConverter.ToUInt32(ClockPart(state.original,"race-clock-qpc-import"),0);if(observed.nonvolatile[0]!=state.original.nonvolatile[0]||observed.nonvolatile[1]!=l["timerEbp"]||observed.nonvolatile[2]!=qpc||observed.nonvolatile[3]!=state.original.nonvolatile[3]||BitConverter.ToUInt32(stack,checked((int)(l["counterCallEsp"]-(C-512))))!=l["outputAddress"]||BitConverter.ToUInt32(stack,496)!=mainBase+0x41cb0||delivered!=state.original.delivered||Digest(ClockPart(observed,"race-clock-streak"))!=Digest(ClockPart(state.original,"race-clock-streak"))||index==1&&BitConverter.ToUInt32(context,176)!=l["outputAddress"])throw new InvalidDataException("Race clock QPC actual caller/argument/nonvolatiles differ.");}
      if(index==1||index==2){int f=checked((int)(l["frame"]-(C-512)));uint[] saves={state.original.nonvolatile[3],state.original.nonvolatile[2],l["timerEbp"],state.original.nonvolatile[0]};for(int i=0;i<4;i++)if(BitConverter.ToUInt32(stack,f+i*4)!=saves[i])throw new InvalidDataException("Race clock QPC actual prologue save differs.");if(BitConverter.ToUInt32(stack,492)!=state.original.nonvolatile[1]||index==2&&BitConverter.ToUInt32(stack,checked((int)(l["frame"]-8-(C-512))))!=mainBase+0x89d13)throw new InvalidDataException("Race clock timer saved EBP/API return differs.");}
      if(index==3){uint eax=BitConverter.ToUInt32(context,176);if(eax<1||eax>3||delivered!=unchecked(state.original.delivered+eax)||BitConverter.ToUInt32(stack,500)!=state.original.nonvolatile[0])throw new InvalidDataException("Race clock selected return/count/save differs.");for(int i=0;i<4;i++)if(observed.nonvolatile[i]!=state.original.nonvolatile[i])throw new InvalidDataException("Race clock return did not restore original nonvolatiles.");}
      return observed;
    }
    public static Dictionary<string,object> RaceClockProof(RaceClockProgress state,RaceClockRead observed,uint pid,uint ownerTid,uint tid) {
      RaceClockRead initial=state.original??observed;Dictionary<string,object> input=new Dictionary<string,object>();foreach(RaceClockRange p in initial.ranges)input.Add(p.id,BytesHex(p.data));byte[] stack=ClockPart(initial,"race-clock-stack");
      Dictionary<string,object> proof=Record("type","race-clock-admitted","role",observed.role,"pid",pid,"tid",tid,"ownerMainTid",ownerTid,"breakpointId",observed.id,"mainModuleBaseAddress",Hex(observed.moduleBase),"observedDebugEventOrdinal",observed.debugOrdinal,"snapshotOrdinal",observed.snapshotOrdinal,"entryDebugEventOrdinal",initial.debugOrdinal,"entrySnapshotOrdinal",initial.snapshotOrdinal,"observationIndex",observed.index,"entryCaller",Hex(BitConverter.ToUInt32(stack,512)),"outerCaller",Hex(BitConverter.ToUInt32(stack,536)),"sessionAddress",Hex(initial.session),"logicalClock",initial.logical,"initialDelivered",initial.delivered,"entryNonvolatile",initial.nonvolatile,"initialControlWordHex",BytesHex(new byte[]{initial.context[28],initial.context[29]}),"initialStatusWordHex",BytesHex(new byte[]{initial.context[32],initial.context[33]}),"initialMxcsrHex",BytesHex(new byte[]{initial.context[228],initial.context[229],initial.context[230],initial.context[231]}),"initialInputHex",input,"activationDebugEventOrdinal",state.activationDebugOrdinal,"callDebugEventOrdinal",state.callDebugOrdinal,"callSnapshotOrdinal",state.callSnapshotOrdinal,"beforeSnapshotRangeResolution",true,"beforeOriginalInstruction",true,"originalInstructionBytesHex",BytesHex(RaceClockCode(observed.id,observed.moduleBase)),"originalInstructionVerified",true);
      foreach(KeyValuePair<string,uint> p in RaceClockLayout(initial.entryEsp))proof.Add(p.Key,p.Key=="stackBytes"?(object)p.Value:Hex(p.Value));return proof;
    }
    static void ActivateRaceClockSites(Options o,RaceClockProgress state,ProcessInfo child,uint mainBase,int debugOrdinal,int snapshotOrdinal,List<Breakpoint> breakpoints,Action<Dictionary<string,object>> emit) {
      if(state.stage!=1||state.activated||state.entrySnapshotOrdinal!=snapshotOrdinal||state.entryDebugOrdinal!=debugOrdinal)throw new InvalidDataException("Race clock activation is not after its actual published entry.");
      string[] ids={o.raceClockObservation.counterCallBreakpointId,o.raceClockObservation.counterReturnBreakpointId,o.raceClockObservation.returnBreakpointId};
      foreach(string id in ids){Breakpoint b=breakpoints.Find(delegate(Breakpoint p){return p.id==id;});byte[] expected=RaceClockCode(id,mainBase);ValidateRaceClockDeferred(id,mainBase,b.original,b.armed,b.hits,b.matchingHits,b.captureHits,Bytes(child.process,b.resolved,expected.Length));}
      foreach(string id in ids){Breakpoint b=breakpoints.Find(delegate(Breakpoint p){return p.id==id;});byte[] expected=RaceClockCode(id,mainBase);Write(child.process,b.resolved,new byte[]{0xcc});b.armed=true;emit(Record("type","race-clock-breakpoint-activated","pid",child.pid,"tid",state.tid,"ownerMainTid",child.tid,"id",b.id,"address",Hex(b.resolved),"originalBytesHex",BytesHex(expected),"patchBytesHex","cc","activationBreakpointId",o.raceClockObservation.entryBreakpointId,"activationSelection","selected-owned-warm-clock-entry","capability",RaceClockCapability,"codeModified",true,"observedDebugEventOrdinal",debugOrdinal,"entryDebugEventOrdinal",state.entryDebugOrdinal,"entrySnapshotOrdinal",state.entrySnapshotOrdinal,"mainModuleBaseAddress",Hex(mainBase),"rawHit",0,"matchingHit",0,"capturedHit",0,"afterEntrySnapshotPublication",true,"beforeOriginalInstruction",true));}
      state.Activate(debugOrdinal,snapshotOrdinal);
    }
    static void WriteRaceClockObservation(Options o,RaceClockProgress state,ProcessInfo child,IntPtr thread,uint mainBase,Breakpoint hit,uint tid,IntPtr context,Dictionary<string,object> regs,int events,long elapsed,List<Breakpoint> breakpoints,ref int snapshots,Action<Dictionary<string,object>> emit) {
      if(tid!=child.tid){emit(Record("type","race-clock-skipped","pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"observedDebugEventOrdinal",events,"rawHit",hit.hits,"reason","different-owned-thread","matchingHitAdvanced",false,"snapshotCountAdvanced",false,"originalInstructionSkipped",false,"beforePurposeRangeRead",true,"beforeStackGraphRead",true));return;}
      byte[] expected=RaceClockCode(hit.id,mainBase);ValidateRaceClockStoppedCode(hit.id,mainBase,hit.original,hit.armed,Bytes(child.process,hit.resolved,expected.Length));
      byte[] rawContext=new byte[716];Marshal.Copy(context,rawContext,0,716);RaceClockRead observed=ReadRaceClockObservation(state,child.tid,tid,mainBase,hit.id,rawContext,events,snapshots+1,delegate(uint address,int length){return Bytes(child.process,address,length);});
      if(observed==null){emit(Record("type","race-clock-skipped","pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"observedDebugEventOrdinal",events,"rawHit",hit.hits,"reason","warm-entry-selection-not-matched","matchingHitAdvanced",false,"snapshotCountAdvanced",false,"originalInstructionSkipped",false,"beforePurposeRangeRead",true,"beforeStackGraphRead",false));return;}
      Dictionary<string,object> proof=RaceClockProof(state,observed,child.pid,child.tid,tid);emit(proof);
      List<object> ranges=new List<object>();int ordinal=0;foreach(RaceClockRange part in observed.ranges){string file="snapshot-"+observed.snapshotOrdinal.ToString("D6")+"-range-"+(++ordinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);ranges.Add(Record("id",part.id,"address",Hex(part.address),"length",part.data.Length,"file",file,"sha256",Digest(part.data),"source","race-clock-observation"));}
      ThreadEnvironmentCapture environment=ReadThreadEnvironment(child.process,thread,context,tid);BufferedRange seh=environment.range;string sehFile="snapshot-"+observed.snapshotOrdinal.ToString("D6")+"-range-"+(++ordinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,sehFile),FileMode.CreateNew))WriteRangeSegment(blob,seh.data,seh.dataOffset,seh.length);seh.row["file"]=sehFile;ranges.Add(seh.row);
      string contextFile="snapshot-"+observed.snapshotOrdinal.ToString("D6")+"-context.bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,contextFile),FileMode.CreateNew))blob.Write(rawContext,0,716);
      emit(Record("type","snapshot","ordinal",observed.snapshotOrdinal,"breakpointId",hit.id,"hit",hit.captureHits+1,"tid",tid,"registers",regs,"contextFile",contextFile,"contextSha256",Digest(rawContext),"ranges",ranges,"capturePhase","before-declared-writes-before-original-instruction","observedElapsedMs",elapsed,"observedDebugEventOrdinal",events,"threadEnvironment",environment.metadata,"raceClockObservation",proof));
      snapshots=observed.snapshotOrdinal;hit.captureHits++;state.Commit(observed,child.tid,tid);if(observed.index==1)ActivateRaceClockSites(o,state,child,mainBase,events,snapshots,breakpoints,emit);
    }
    public static Dictionary<string,object> RaceClockPolicyMetadata(RaceClockObservation p){if(p==null)throw new ArgumentNullException("p");return Record("entryBreakpointId",p.entryBreakpointId,"counterCallBreakpointId",p.counterCallBreakpointId,"counterReturnBreakpointId",p.counterReturnBreakpointId,"returnBreakpointId",p.returnBreakpointId,"minimumLogicalClock",p.minimumLogicalClock,"stackBytesBefore",p.stackBytesBefore,"stackBytesAfter",p.stackBytesAfter,"maxCounterPairs",p.maxCounterPairs,"maxSnapshots",p.maxSnapshots);}
    public static Dictionary<string,object> CaptureHeader(Options o){Dictionary<string,object> header=Record("type", "capture", "schemaVersion", 1, "executablePath", o.executablePath, "workingDirectory", o.workingDirectory, "arguments", o.arguments, "executableSha256", o.expectedSha256.ToLowerInvariant(), "breakpointMode", "software-int3", "cleanupPolicy", "freeze-or-prove-terminated-owned-threads-before-unpatch-and-termination", "maxDurationMs", o.maxDurationMs, "maxEvents", o.maxEvents, "maxSnapshots", o.maxSnapshots, "timingLimitation", "Debugger-paused elapsed time does not establish native wall-clock simulation rate.");if(o.parentRttiObservation!=null||o.raceClockObservation!=null)header["helperCapabilities"]=GetCaptureCapabilities(o);if(o.raceClockObservation!=null)header["raceClockObservation"]=RaceClockPolicyMetadata(o.raceClockObservation);return header;}
    public static Dictionary<string,object> RaceClockCompletion(RaceClockProgress state){state.RequireComplete(7);return Record("selectedSnapshots",state.stage,"counterPairs",1,"counterSnapshots",2,"entryDebugEventOrdinal",state.entryDebugOrdinal,"entrySnapshotOrdinal",state.entrySnapshotOrdinal,"activationDebugEventOrdinal",state.activationDebugOrdinal,"returnDebugEventOrdinal",state.returnDebugOrdinal,"returnSnapshotOrdinal",state.returnSnapshotOrdinal,"returnValue",state.result);}
    public static string[] GetCapabilities(){return new string[]{ParentRttiCapability,ParentRttiMapGraphCapability,ParentRttiWeatherCapability,ParentWeatherCounterCapability,ParentSoundBankOwnerCapability,ParentSoundBankChannelCapability,ParentFinalTickCapability,RaceClockCapability};}
    public static string[] GetCaptureCapabilities(Options o){if(o.raceClockObservation!=null)return new string[]{RaceClockCapability};List<string> capabilities=new List<string>();capabilities.Add(ParentRttiCapability);if(o.parentRttiObservation!=null&&o.parentRttiObservation.viewportMapGraph!=null)capabilities.Add(ParentRttiMapGraphCapability);if(o.parentRttiObservation!=null&&o.parentRttiObservation.weatherScreenQueries)capabilities.Add(ParentRttiWeatherCapability);if(o.parentRttiObservation!=null&&o.parentRttiObservation.weatherCounterObservation!=null)capabilities.Add(ParentWeatherCounterCapability);if(o.parentRttiObservation!=null&&o.parentRttiObservation.soundBankOwnerGraph!=null){capabilities.Add(ParentSoundBankOwnerCapability);if(o.parentRttiObservation.soundBankOwnerGraph.channelGraph!=null)capabilities.Add(ParentSoundBankChannelCapability);}if(o.parentRttiObservation!=null&&o.parentRttiObservation.finalTick!=null)capabilities.Add(ParentFinalTickCapability);return capabilities.ToArray();}
    static bool SameRange(MemoryRange a,MemoryRange b) {
      return a!=null&&b!=null&&a.id==b.id&&a.address==b.address&&a.rva==b.rva&&a.baseRegister==b.baseRegister&&a.offset==b.offset&&a.length==b.length&&a.readableRegion==b.readableRegion&&a.maxRegionBytes==b.maxRegionBytes&&a.vectorStorage==b.vectorStorage&&a.maxVectorBytes==b.maxVectorBytes&&String.Join(",",a.dereferenceOffsets)==String.Join(",",b.dereferenceOffsets)&&(a.dereferenceMinimumValues==null?b.dereferenceMinimumValues==null:b.dereferenceMinimumValues!=null&&String.Join(",",a.dereferenceMinimumValues)==String.Join(",",b.dereferenceMinimumValues));
    }
    public static int RequiredParentCounterSnapshots(ParentRttiProgress parent){if(parent==null)throw new ArgumentNullException("parent");return checked(13+parent.captured+2+(parent.finalTick==null?0:1));}
    public static void ValidateParentFinalTickPolicy(ParentFinalTick p) {
      if(p==null||p.returnBreakpointId!="native-parent-return"||p.lightBands==null||p.lightBands.allocationRootRva!="0x40f208"||p.lightBands.sectorTableRva!="0x40f220"||p.lightBands.packRootRva!="0x50b98c"||p.lightBands.maxSectors!=127||p.lightBands.maxBandBytes!=65536||p.listenerWrappers==null||p.listenerWrappers.headerRva!="0x2f2408"||p.listenerWrappers.maxUsedSlots!=4||p.listenerWrappers.wrapperBytes!=80||p.listenerWrappers.poseRecordsRva!="0x449480"||p.listenerWrappers.poseRecordBytes!=84||p.masterLevel==null||p.masterLevel.managerRootRva!="0x314b08"||p.masterLevel.levelOffset!="0x850"||p.masterLevel.vtableBytes!=96||p.masterLevel.methodOffset!="0x5c"||p.masterLevel.methodRva!="0xa90e0")throw new InvalidDataException("Final parent purpose requires exact typed light/listener/master/return policy.");
    }
    static byte[] ReadParentFinalRange(ParentFinalInputsRead result,string id,string role,int index,uint address,int length,IList<ParentSoundBankCapturedRange> captured,ParentSoundBankOwnerRead ownerGraph,Func<uint,int,byte[]> read) {
      if(address==0||length<1||(ulong)address+(uint)length>0x100000000UL||result.additionalBytes+length>70000)throw new InvalidDataException("Final typed input extent is null/overflowing/over-bound.");byte[] bytes=null;
      foreach(ParentSoundBankCapturedRange row in captured)if(row.data!=null&&address>=row.address&&(ulong)address+(uint)length<=(ulong)row.address+(uint)row.data.Length){bytes=new byte[length];Buffer.BlockCopy(row.data,checked((int)(address-row.address)),bytes,0,length);break;}
      if(bytes==null)bytes=read(address,length);if(bytes==null||bytes.Length!=length)throw new InvalidDataException("Final typed inputs require complete actual bytes, never defaults.");
      foreach(ParentSoundBankCapturedRange row in captured)CheckParentSoundBankOverlap(address,bytes,row.address,row.data);
      if(ownerGraph!=null){foreach(ParentSoundBankOwnerRange row in ownerGraph.owners)CheckParentSoundBankOverlap(address,bytes,row.address,row.data);if(ownerGraph.channelGraph!=null)foreach(ParentSoundChannelRange row in ownerGraph.channelGraph.ranges)CheckParentSoundBankOverlap(address,bytes,row.address,row.data);}
      foreach(ParentFinalRange row in result.ranges)CheckParentSoundBankOverlap(address,bytes,row.address,row.data);
      result.ranges.Add(new ParentFinalRange{id=id,role=role,index=index,address=address,data=bytes});result.additionalBytes=checked(result.additionalBytes+length);return bytes;
    }
    public static ParentFinalInputsRead ReadParentFinalInputs(ParentFinalTick p,uint mainBase,IList<ParentSoundBankCapturedRange> captured,ParentSoundBankOwnerRead ownerGraph,Func<uint,int,byte[]> read) {
      ValidateParentFinalTickPolicy(p);if(mainBase==0||(ulong)mainBase+0x50b990>0x100000000UL||captured==null||read==null)throw new InvalidDataException("Final inputs lack the actual module/captured data/reader.");ParentFinalInputsRead result=new ParentFinalInputsRead();
      uint rootAddress=checked(mainBase+0x40f208),packRootAddress=checked(mainBase+0x50b98c),tableAddress=checked(mainBase+0x40f220);
      byte[] root=ReadParentFinalRange(result,"parent-final-light-root","light-root",0,rootAddress,4,captured,ownerGraph,read),packRoot=ReadParentFinalRange(result,"parent-final-light-pack-root","light-pack-root",0,packRootAddress,4,captured,ownerGraph,read);uint allocation=BitConverter.ToUInt32(root,0),pack=BitConverter.ToUInt32(packRoot,0);
      byte[] packHeader=ReadParentFinalRange(result,"parent-final-light-pack-header","light-pack-header",0,pack,20,captured,ownerGraph,read);uint sectorTable=BitConverter.ToUInt32(packHeader,0),count=BitConverter.ToUInt32(packHeader,16);if(count>127)throw new InvalidDataException("Final light sector count exceeds observation domain.");
      byte[] pointers=count==0?new byte[0]:ReadParentFinalRange(result,"parent-final-light-sector-pointers","light-sector-pointers",0,sectorTable,checked((int)count*4),captured,ownerGraph,read),table=ReadParentFinalRange(result,"parent-final-light-table","light-table",0,tableAddress,checked(((int)count+1)*4),captured,ownerGraph,read);List<object> sectors=new List<object>();ulong total=0;
      if(BitConverter.ToUInt32(table,0)!=allocation)throw new InvalidDataException("Final light table does not begin at actual allocation root.");
      for(int i=0;i<count;i++){
        uint address=BitConverter.ToUInt32(pointers,i*4);byte[] header=ReadParentFinalRange(result,"parent-final-light-sector-header-"+i,"light-sector-header",i,address,16,captured,ownerGraph,read);uint rows=BitConverter.ToUInt32(header,12);ulong bytes=((ulong)(rows>>4)<<5)+32,begin=(ulong)allocation+total,end=begin+bytes;
        if(total+bytes>65536||end>UInt32.MaxValue||allocation==0||BitConverter.ToUInt32(table,i*4)!=begin||BitConverter.ToUInt32(table,(i+1)*4)!=end)throw new InvalidDataException("Final light dimensions/root/table/sentinel overflow or disagree; no band backing read.");
        sectors.Add(Record("index",i,"address",Hex(address),"headerBytesHex",BytesHex(header),"rows",rows,"bytes",(int)bytes,"begin",Hex((uint)begin),"end",Hex((uint)end),"offset",(int)total));total+=bytes;
      }
      if(total!=0)ReadParentFinalRange(result,"parent-final-light-bands","light-bands",0,allocation,(int)total,captured,ownerGraph,read);result.lightBandBytes=(int)total;
      result.lightBands=Record("allocationRootAddress",Hex(rootAddress),"allocationRootBytesHex",BytesHex(root),"allocationBase",Hex(allocation),"packRootAddress",Hex(packRootAddress),"packRootBytesHex",BytesHex(packRoot),"packAddress",Hex(pack),"packHeaderHex",BytesHex(packHeader),"sectorTableAddress",Hex(sectorTable),"sectorCount",count,"pointerTableAddress",Hex(tableAddress),"pointerTableHex",BytesHex(table),"sectors",sectors,"totalBytes",(int)total,"endAddress",Hex(checked(allocation+(uint)total)));
      uint listenerHeaderAddress=checked(mainBase+0x2f2408);byte[] listenerHeader=ReadParentFinalRange(result,"parent-final-listener-header","listener-header",0,listenerHeaderAddress,12,captured,ownerGraph,read);uint beginListeners=BitConverter.ToUInt32(listenerHeader,0),endListeners=BitConverter.ToUInt32(listenerHeader,4),capacityListeners=BitConverter.ToUInt32(listenerHeader,8);
      if(beginListeners==0&&(endListeners!=0||capacityListeners!=0)||beginListeners>endListeners||endListeners>capacityListeners||(endListeners-beginListeners)%4!=0||(capacityListeners-beginListeners)%4!=0||(endListeners-beginListeners)/4>4)throw new InvalidDataException("Final listener vector exceeds actual ordered used-slot domain.");
      int used=checked((int)((endListeners-beginListeners)/4));byte[] listenerSlots=used==0?new byte[0]:ReadParentFinalRange(result,"parent-final-listener-slots","listener-slots",0,beginListeners,used*4,captured,ownerGraph,read);List<object> slots=new List<object>(),wrappers=new List<object>();Dictionary<uint,ParentFinalRange> seenWrappers=new Dictionary<uint,ParentFinalRange>();Dictionary<uint,List<int>> wrapperRefs=new Dictionary<uint,List<int>>();
      for(int i=0;i<used;i++){
        uint address=BitConverter.ToUInt32(listenerSlots,i*4);ParentFinalRange row=null;
        if(address!=0){if(!seenWrappers.TryGetValue(address,out row)){int index=seenWrappers.Count;ReadParentFinalRange(result,"parent-final-listener-wrapper-"+index,"listener-wrapper",index,address,80,captured,ownerGraph,read);row=result.ranges[result.ranges.Count-1];seenWrappers.Add(address,row);wrapperRefs.Add(address,new List<int>());}wrapperRefs[address].Add(i);}
        slots.Add(Record("index",i,"slotAddress",Hex(checked(beginListeners+(uint)i*4)),"wrapperAddress",Hex(address),"wrapperIndex",row==null?null:(object)row.index,"wrapperRangeId",row==null?null:row.id));
      }
      for(int i=0;i<seenWrappers.Count;i++)foreach(ParentFinalRange row in seenWrappers.Values)if(row.index==i){row.referenceIndices=wrapperRefs[row.address].ToArray();wrappers.Add(Record("index",i,"address",Hex(row.address),"rangeId",row.id,"bytes",80,"sha256",Digest(row.data),"referenceIndices",row.referenceIndices));}
      uint poseRecordsAddress=checked(mainBase+0x449480);byte[] poseRecords=ReadParentFinalRange(result,"parent-final-listener-pose-records","listener-pose-records",0,poseRecordsAddress,336,captured,ownerGraph,read);List<object> poses=new List<object>(),poseRanges=new List<object>();Dictionary<string,ParentFinalRange> seenPoses=new Dictionary<string,ParentFinalRange>();Dictionary<string,List<int>> poseRefs=new Dictionary<string,List<int>>();
      for(int i=0;i<4;i++){
        bool active=poseRecords[i*84]!=0,dynamic=active&&BitConverter.ToUInt16(poseRecords,i*84+2)!=0;Dictionary<string,object> pose=Record("index",i,"active",active,"dynamic",dynamic);string[] names={"position","velocity","rotation"};int[] lengths={12,12,18};
        for(int role=0;role<3;role++){
          uint address=active?BitConverter.ToUInt32(poseRecords,i*84+(dynamic?16+role*16:4+role*4)):0;ParentFinalRange row=null;
          if(active&&address!=0){string key=Hex(address)+":"+lengths[role];if(!seenPoses.TryGetValue(key,out row)){int index=seenPoses.Count;ReadParentFinalRange(result,"parent-final-listener-pose-"+index,"listener-pose",index,address,lengths[role],captured,ownerGraph,read);row=result.ranges[result.ranges.Count-1];seenPoses.Add(key,row);poseRefs.Add(key,new List<int>());}poseRefs[key].Add(i*3+role);}
          pose[names[role]+"Address"]=active?(object)Hex(address):null;pose[names[role]+"Index"]=row==null?null:(object)row.index;pose[names[role]+"RangeId"]=row==null?null:row.id;
        }poses.Add(pose);
      }
      for(int i=0;i<seenPoses.Count;i++)foreach(KeyValuePair<string,ParentFinalRange> item in seenPoses)if(item.Value.index==i){ParentFinalRange row=item.Value;row.referenceIndices=poseRefs[item.Key].ToArray();poseRanges.Add(Record("index",i,"address",Hex(row.address),"rangeId",row.id,"bytes",row.data.Length,"sha256",Digest(row.data),"referenceIndices",row.referenceIndices));}
      result.listenerCount=seenWrappers.Count;result.listenerBytes=seenWrappers.Count*80;result.listenerWrappers=Record("headerAddress",Hex(listenerHeaderAddress),"headerBytesHex",BytesHex(listenerHeader),"begin",Hex(beginListeners),"end",Hex(endListeners),"capacity",Hex(capacityListeners),"usedSlots",used,"uniqueWrappers",seenWrappers.Count,"slots",slots,"wrappers",wrappers,"poseRecordsAddress",Hex(poseRecordsAddress),"poseRecordsHex",BytesHex(poseRecords),"poses",poses,"poseRanges",poseRanges);
      uint managerRootAddress=checked(mainBase+0x314b08);byte[] managerRoot=ReadParentFinalRange(result,"parent-final-manager-root","manager-root",0,managerRootAddress,4,captured,ownerGraph,read);uint manager=BitConverter.ToUInt32(managerRoot,0);byte[] vptr=ReadParentFinalRange(result,"parent-final-manager-vtable-pointer","manager-vtable-pointer",0,manager,4,captured,ownerGraph,read);uint vtable=BitConverter.ToUInt32(vptr,0);byte[] vtableBytes=ReadParentFinalRange(result,"parent-final-manager-vtable","manager-vtable",0,vtable,96,captured,ownerGraph,read);uint method=BitConverter.ToUInt32(vtableBytes,0x5c);
      if(method!=checked(mainBase+0xa90e0))throw new InvalidDataException("Final manager method5c is not the proven master-level setter; no850 field read.");uint level=Add(manager,0x850);byte[] levelBytes=ReadParentFinalRange(result,"parent-final-manager-level","manager-level",0,level,4,captured,ownerGraph,read);
      byte[] methodBytes=new byte[4];Buffer.BlockCopy(vtableBytes,0x5c,methodBytes,0,4);result.masterLevel=Record("rootAddress",Hex(managerRootAddress),"rootBytesHex",BytesHex(managerRoot),"managerAddress",Hex(manager),"vtablePointerBytesHex",BytesHex(vptr),"vtableAddress",Hex(vtable),"levelAddress",Hex(level),"levelBytesHex",BytesHex(levelBytes),"methodAddress",Hex(method),"methodBytesHex",BytesHex(methodBytes),"vtableSha256",Digest(vtableBytes));return result;
    }
    public static Dictionary<string,object> ParentFinalInputsDetails(ParentFinalInputsRead observed) {
      return Record("lightBands",observed.lightBands,"listenerWrappers",observed.listenerWrappers,"masterLevel",observed.masterLevel,"additionalBytes",observed.additionalBytes,"sameStoppedDebugEvent",true,"afterParentAdmission",true,"beforeOriginalInstruction",true,"completeInputsObserved",true);
    }
    public static Dictionary<string,object> ParentFinalRangeMetadata(ParentFinalRange row,string file) {
      Dictionary<string,object> result=Record("id",row.id,"address",Hex(row.address),"length",row.data.Length,"file",file,"sha256",Digest(row.data),"source","parent-final-inputs","graphRole",row.role,"graphIndex",row.index);if(row.referenceIndices!=null)result["referenceIndices"]=row.referenceIndices;return result;
    }
    public static void ValidateParentRttiPolicy(Options o) {
      ParentRttiObservation p=o.parentRttiObservation;if(p==null)return;if(o.raceClockObservation!=null)throw new InvalidDataException("Parent and clock purposes are mutually exclusive.");
      if(p.parentBreakpointId!="native-control-before"||p.beginBreakpointId!="native-control-after-auxiliary"||p.endBreakpointId!=(p.weatherScreenQueries?"native-control-after-world-effects":"native-control-after-cameras")||p.callBreakpointId!="native-parent-rtti-call"||p.returnBreakpointId!="native-parent-rtti-return"||p.maxPairs!=4||p.maxSnapshots!=8||o.maxSnapshots!=(p.finalTick==null?21:22)||o.maxDurationMs!=90000||o.maxEvents!=1000000||!o.captureThreadEnvironment||o.ranges.Length!=0||o.pendingFrameObserver!=null||o.observationActivation!=null||o.ownedWorkerObservation!=null||o.ownedWorkerGainPair!=null||o.ownedWorkerGainWindow!=null||o.heldForceInput!=null||o.controlledRaceSettings!=null||o.breakpoints.Length!=(p.finalTick!=null?18:p.weatherCounterObservation==null?15:17)||o.phaseActions.Length!=3)throw new InvalidDataException("Parent RTTI requires its exact separate bounded parent policy.");
      if(p.weatherCounterObservation!=null&&(!p.weatherScreenQueries||p.weatherCounterObservation.callBreakpointId!="native-parent-weather-counter-call"||p.weatherCounterObservation.returnBreakpointId!="native-parent-weather-counter-return"||p.weatherCounterObservation.maxPairs!=1||p.weatherCounterObservation.maxSnapshots!=2))throw new InvalidDataException("Weather counter requires its exact separate paired mixed profile.");
      if(p.finalTick!=null){ValidateParentFinalTickPolicy(p.finalTick);if(!p.weatherScreenQueries||p.weatherCounterObservation==null||p.viewportMapGraph==null||p.soundBankOwnerGraph==null||p.soundBankOwnerGraph.channelGraph==null)throw new InvalidDataException("Final purpose requires all existing V8 typed parent observations.");}
      ParentRttiMapPreflight map=p.singletonMapPreflight;
      if(map==null||map.rootRva!="0x2efb38"||map.dereferenceOffsets==null||String.Join(",",map.dereferenceOffsets)!="0,0x7c"||map.fixedHeadRangeId!="late-singleton-candidate-viewport-map-head"||map.regionRangeId!="late-singleton-candidate-viewport-map-region"||map.maxRegionBytes!=16*1024*1024||map.breakpointIds==null||String.Join(",",map.breakpointIds)!=("native-control-before,native-control-after-cameras,native-control-after-world-effects"+(p.finalTick==null?"":",native-parent-return")))throw new InvalidDataException("Parent RTTI singleton map preflight policy differs.");
      if(p.viewportMapGraph!=null)ValidateParentRttiMapGraphPolicy(p.viewportMapGraph,p.finalTick!=null);
      if(p.soundBankOwnerGraph!=null)ValidateParentSoundBankOwnerPolicy(p.soundBankOwnerGraph,p.finalTick!=null);
      if(!o.denyRegistryWrites||!o.denyChildProcesses||!o.denyPlayerMailslot||!o.hideOwnedWindows||!o.captureThreadsOnStop||o.stopThreadStackBytes!=128||o.showWindow||String.Join(",",o.arguments)!="/windowed,/width,800,/height,600"||!String.Equals(o.expectedSha256,"c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5",StringComparison.OrdinalIgnoreCase)||!SameRange(o.foregroundWindowSource,new MemoryRange{id="owned-application-hwnd",rva="0x2efb38",dereferenceOffsets=new string[]{"0"},offset="4",length=4}))throw new InvalidDataException("Parent RTTI original owned/security startup policy differs.");
      string[] ids={"launcher-policy","graphics-policy","before-device-creation","native-control-before","native-control-after","native-control-after-ai","native-control-after-physics","native-control-after-attachments","native-control-after-recovery","native-control-after-drive","native-control-after-auxiliary","native-control-after-cameras","native-control-after-world-effects","native-parent-rtti-call","native-parent-rtti-return"};
      uint[] sites={0x42890,0x35be,0x112a30,0x50e50,0x749e0,0x50f18,0x74b1e,0x5101c,0x51021,0x5109c,0x510ef,0x51111,0x51120,0x2d86,0x2d8b};
      if(p.weatherCounterObservation!=null){Array.Resize(ref ids,17);Array.Resize(ref sites,17);ids[15]=p.weatherCounterObservation.callBreakpointId;ids[16]=p.weatherCounterObservation.returnBreakpointId;sites[15]=0x89d11;sites[16]=0x89d13;}
      if(p.finalTick!=null){Array.Resize(ref ids,18);Array.Resize(ref sites,18);ids[17]="native-parent-return";sites[17]=0x50e38;}
      int? skip=o.breakpoints[3].skipMatchingHits;if(!skip.HasValue||skip.Value<0)throw new InvalidDataException("Parent RTTI selected skip window differs.");
      MemoryRange fixedHead=new MemoryRange{id=map.fixedHeadRangeId,rva="0x2efb38",dereferenceOffsets=new string[]{"0","0x7c"},dereferenceMinimumValues=new int[]{1,1},length=100},region=new MemoryRange{id=map.regionRangeId,rva="0x2efb38",dereferenceOffsets=new string[]{"0","0x7c"},readableRegion=true,maxRegionBytes=16*1024*1024};
      int stackBefore=0;
      for(int i=0;i<ids.Length;i++) {
        Breakpoint b=o.breakpoints[i];if(b.id!=ids[i]||Number(b.rva)!=sites[i]||!String.IsNullOrEmpty(b.address)||b.service!=null||b.stopAfterHits!=(p.finalTick!=null?(i==17?1:0):(i==12?1:0)))throw new InvalidDataException("Parent RTTI extra/reordered/moved/stopping site differs.");
        HashSet<string> rangeIds=new HashSet<string>();foreach(MemoryRange r in b.ranges)if(!rangeIds.Add(r.id))throw new InvalidDataException("Parent RTTI duplicated range id.");
        if(i>=3&&i<=12){CaptureCondition g=b.captureWhen;if(g==null||g.equalsBytesHex!="04000000"||!SameRange(g.range,new MemoryRange{id="active-race-phase",rva="0x1ecb1c",dereferenceOffsets=new string[]{"0"},offset="0x57c",length=4})||b.skipMatchingHits!=skip)throw new InvalidDataException("Parent RTTI actual phase/skip checkpoints differ.");MemoryRange stack=Array.Find(b.ranges,delegate(MemoryRange r){return r.id=="frame-stack";});int depth=stack==null?0:checked((int)-Offset(stack.offset));if(stack==null||stack.baseRegister!="esp"||stack.address!=null||stack.rva!=null||stack.dereferenceOffsets.Length!=0||stack.readableRegion||stack.vectorStorage||depth<4||depth>65536||stack.length!=depth+32||i>3&&depth!=stackBefore)throw new InvalidDataException("Parent RTTI full parent stack bounds differ.");stackBefore=depth;}
        else if(b.captureWhen!=null||b.skipMatchingHits.HasValue)throw new InvalidDataException("Parent RTTI startup/external sites cannot be filtered/skipped.");
        bool wantsMap=Array.IndexOf(map.breakpointIds,b.id)>=0;MemoryRange[] observed=Array.FindAll(b.ranges,delegate(MemoryRange r){return r.id==map.fixedHeadRangeId||r.id==map.regionRangeId;});if(wantsMap?(observed.Length!=2||!SameRange(observed[0],fixedHead)||!SameRange(observed[1],region)):observed.Length!=0)throw new InvalidDataException("Parent RTTI map observations/preflight points differ.");
        if(p.soundBankOwnerGraph!=null)ValidateParentSoundBankOwnerDescriptors(p.soundBankOwnerGraph,b,i>=3&&i<=12||p.finalTick!=null&&i==17,p.finalTick!=null);
        if(p.weatherCounterObservation!=null&&(i>=3&&i<=12||p.finalTick!=null&&i==17)){MemoryRange[] imports=Array.FindAll(b.ranges,delegate(MemoryRange r){return r.id=="parent-weather-counter-import";});if(imports.Length!=1||!SameRange(imports[0],new MemoryRange{id="parent-weather-counter-import",rva="0x16e0fc",length=4}))throw new InvalidDataException("Weather counter requires the original IAT input at all ten parent checkpoints.");}
        if(i>=13&&!(p.finalTick!=null&&i==17)&&(p.weatherScreenQueries?b.ranges.Length!=0:(b.ranges.Length!=3||!SameRange(b.ranges[0],new MemoryRange{id="native-parent-rtti-context",baseRegister="esp",length=52})||!SameRange(b.ranges[1],new MemoryRange{id="native-parent-rtti-camera-return",baseRegister="esp",offset="256",length=4})||!SameRange(b.ranges[2],new MemoryRange{id="native-parent-rtti-clock",rva="0x50a548",length=4}))))throw new InvalidDataException("Parent RTTI exact external range ABI differs.");
      }
      if(p.finalTick!=null){MemoryRange[] world=o.breakpoints[12].ranges,final=o.breakpoints[17].ranges;if(final.Length!=world.Length)throw new InvalidDataException("Final return requires all unchanged world observation ranges.");for(int i=0;i<world.Length;i++)if(!SameRange(world[i],final[i]))throw new InvalidDataException("Final return ordinary observation range differs from world.");}
      MemoryRange[][] startup={new MemoryRange[]{new MemoryRange{id="launcher-skip",rva="0x2e66ec",length=4},new MemoryRange{id="launcher-config",rva="0x1ecefc",dereferenceOffsets=new string[]{"0"},offset="0x42c",length=10}},new MemoryRange[]{new MemoryRange{id="graphics-mode",rva="0x2e64a4",dereferenceOffsets=new string[]{"0"},offset="0x24",length=28}},new MemoryRange[]{new MemoryRange{id="presentation",baseRegister="ecx",offset="0x378",length=56},new MemoryRange{id="entry-stack",baseRegister="esp",length=32}}};
      for(int i=0;i<3;i++){if(o.breakpoints[i].ranges.Length!=startup[i].Length||o.phaseActions[i].breakpointId!=ids[i]||o.phaseActions[i].hit!=1||o.phaseActions[i].writes.Length!=(i==0?3:i==1?1:2))throw new InvalidDataException("Parent RTTI original startup action differs.");for(int j=0;j<startup[i].Length;j++)if(!SameRange(o.breakpoints[i].ranges[j],startup[i][j]))throw new InvalidDataException("Parent RTTI original startup observation differs.");}
      uint[] roots={0x2e66ec,0x1ecefc,0x1ecefc,0x2e64a4,0,0};int[] offsets={0,10,14,60,0x398,0x3a8};string[] replacements={"01000000","01","01","00","01000000","00000000"};int slot=0;
      foreach(PhaseAction a in o.phaseActions)foreach(MemoryWrite w in a.writes){bool chain=slot>=1&&slot<=3;if(w.address!=null||Number(w.rva)!=roots[slot]||(slot>=4?w.baseRegister!="ecx":w.baseRegister!=null)||Offset(w.offset)!=offsets[slot]||w.dereferenceOffsets.Length!=(chain?1:0)||chain&&Offset(w.dereferenceOffsets[0])!=0||BytesHex(ParseBytes(w.bytesHex))!=replacements[slot])throw new InvalidDataException("Parent RTTI undeclared startup/game write.");if(slot<4){string[] expected=slot==0?new string[]{"00000000","01000000"}:new string[]{"00","01"};if(w.expectedBytesHex!=null||w.expectedAnyBytesHex==null||w.expectedAnyBytesHex.Length!=2||w.expectedAnyBytesHex[0]!=expected[0]||w.expectedAnyBytesHex[1]!=expected[1])throw new InvalidDataException("Parent RTTI startup write guard differs.");}else if(w.expectedAnyBytesHex!=null||w.expectedBytesHex!=replacements[slot])throw new InvalidDataException("Parent RTTI device writes require exact no-op guards.");slot++;}
    }
    public static void ValidateParentSoundBankOwnerPolicy(ParentSoundBankOwnerGraph p,bool finalPurpose=false) {
      if(p==null||p.rootRva!="0x2f2414"||p.headerRangeId!="sound-owner-vector-roots"||p.storageRangeId!="control-sound-bank-storage"||p.maxUsedSlots!=256||p.ownerBytes!=0x490||p.breakpointIds==null||String.Join(",",p.breakpointIds)!=(String.Join(",",ParentRttiProgress.Stages)+(finalPurpose?",native-parent-return":"")))throw new InvalidDataException("Sound owner graph requires its exact root, typed extent and ten bounded checkpoints.");
      if(p.channelGraph!=null)ValidateParentSoundBankChannelPolicy(p.channelGraph);
    }
    public static void ValidateParentSoundBankOwnerDescriptors(ParentSoundBankOwnerGraph p,Breakpoint b,bool wanted,bool finalPurpose=false) {
      ValidateParentSoundBankOwnerPolicy(p,finalPurpose);MemoryRange header=null,storage=null;int headers=0,stores=0;
      foreach(MemoryRange r in b.ranges){if(r.id!=null&&(r.id.StartsWith("parent-sound-bank-owner-",StringComparison.Ordinal)||p.channelGraph!=null&&r.id.StartsWith("parent-sound-channel-",StringComparison.Ordinal)))throw new InvalidDataException("Sound owner graph dynamic rows cannot be configured ordinary ranges.");if(r.id==p.headerRangeId){headers++;header=r;}if(r.id==p.storageRangeId){stores++;storage=r;}}
      if(wanted){if(headers!=1||stores!=1||!SameRange(header,new MemoryRange{id=p.headerRangeId,rva=p.rootRva,length=12})||!SameRange(storage,new MemoryRange{id=p.storageRangeId,rva=p.rootRva,vectorStorage=true,maxVectorBytes=65536}))throw new InvalidDataException("Sound owner graph requires its exact ordinary header and full-capacity vector storage at every parent checkpoint.");}
      else if(headers!=0||stores!=0)throw new InvalidDataException("Sound owner graph cannot observe its bank at startup/external sites.");
    }
    public static void ValidateParentSoundBankOwnerCheckpoint(ParentRttiProgress state,uint ownerMainTid,uint actualTid,string id,int debugOrdinal) {
      if(id=="native-parent-return"){if(state==null||state.finalTick==null||!state.finalTick.admitted||state.finalTick.complete||ownerMainTid==0||ownerMainTid!=actualTid||actualTid!=state.tid||state.stage!=10||state.soundOwnerChecks!=10||debugOrdinal!=state.finalTick.returnDebugOrdinal)throw new InvalidDataException("Final owner graph requires the admitted same stopped return endpoint.");return;}
      int index=Array.IndexOf(ParentRttiProgress.Stages,id);
      if(state==null||!state.selected||ownerMainTid==0||actualTid!=ownerMainTid||actualTid!=state.tid||index<0||state.stage!=index+1||state.soundOwnerChecks!=index||debugOrdinal!=state.lastStageDebugOrdinal||debugOrdinal<state.parentDebugOrdinal)throw new InvalidDataException("Sound owner graph requires the same stopped admitted owned-main parent checkpoint in exact order.");
    }
    static void CheckParentSoundBankOverlap(uint a,byte[] first,uint b,byte[] second) {
      if(first==null||second==null||(ulong)a+(ulong)first.Length>0x100000000UL||(ulong)b+(ulong)second.Length>0x100000000UL)throw new InvalidDataException("Sound owner graph captured extent is unavailable or overflows32bits.");
      ulong start=Math.Max((ulong)a,(ulong)b),end=Math.Min((ulong)a+(ulong)first.Length,(ulong)b+(ulong)second.Length);
      for(ulong address=start;address<end;address++)if(first[checked((int)(address-a))]!=second[checked((int)(address-b))])throw new InvalidDataException("Sound owner graph overlapping actual captured bytes disagree.");
    }
    public static void ValidateParentSoundBankChannelPolicy(ParentSoundBankChannelGraph p) {
      if(p==null||p.maxUsedChannelSlots!=256||p.wrapperBytes!=12||p.sourceBytes!=0x9a8||p.sourceVtableRva!="0x1d3f60"||p.vtableBytes!=0x88)throw new InvalidDataException("Sound channel graph requires exact used-slot, wrapper/source/class/vtable bounds.");
    }
    static ParentSoundChannelRange AddParentSoundChannelRange(ParentSoundChannelRead result,List<ParentSoundChannelRange> kind,string role,uint address,int length) {
      if(address==0||length<1||(ulong)address+(uint)length>0x100000000UL||result.additionalBytes+length>637064)throw new InvalidDataException("Sound channel graph descendant extent is null/overflowing/over its bounded transport.");
      ParentSoundChannelRange row=new ParentSoundChannelRange{index=kind.Count,id="parent-sound-channel-"+role+"-"+kind.Count,role=role,address=address,length=length};kind.Add(row);result.ranges.Add(row);result.additionalBytes=checked(result.additionalBytes+length);return row;
    }
    static void CheckParentSoundChannelBytes(uint address,byte[] data,IList<ParentSoundBankCapturedRange> captured,IList<ParentSoundBankOwnerRange> owners,ParentSoundChannelRead graph) {
      foreach(ParentSoundBankCapturedRange row in captured)CheckParentSoundBankOverlap(address,data,row.address,row.data);
      foreach(ParentSoundBankOwnerRange row in owners)CheckParentSoundBankOverlap(address,data,row.address,row.data);
      foreach(ParentSoundChannelRange row in graph.ranges)if(row.data!=null)CheckParentSoundBankOverlap(address,data,row.address,row.data);
    }
    static void ReadParentSoundChannelRange(ParentSoundChannelRange row,IList<ParentSoundBankCapturedRange> captured,IList<ParentSoundBankOwnerRange> owners,ParentSoundChannelRead graph,Func<uint,int,byte[]> read) {
      byte[] data=read(row.address,row.length);if(data==null||data.Length!=row.length)throw new InvalidDataException("Sound channel graph requires all exact descendant bytes; no missing/zero-filled replacement.");CheckParentSoundChannelBytes(row.address,data,captured,owners,graph);row.data=data;
    }
    public static ParentSoundChannelRead ReadParentSoundBankChannels(ParentSoundBankChannelGraph p,uint mainBase,IList<ParentSoundBankCapturedRange> captured,IList<ParentSoundBankOwnerRange> owners,Func<uint,int,byte[]> read) {
      ValidateParentSoundBankChannelPolicy(p);if(mainBase==0||(ulong)mainBase+0x1d3fe8>0x100000000UL||captured==null||owners==null||owners.Count>256||read==null)throw new InvalidDataException("Sound channel graph requires its actual original owner observations and module.");
      ParentSoundChannelRead result=new ParentSoundChannelRead();Dictionary<string,ParentSoundChannelRange> storages=new Dictionary<string,ParentSoundChannelRange>();Dictionary<uint,ParentSoundChannelRange> wrappers=new Dictionary<uint,ParentSoundChannelRange>(),sources=new Dictionary<uint,ParentSoundChannelRange>(),vtables=new Dictionary<uint,ParentSoundChannelRange>();ParentSoundChannelRange[] ownerStorage=new ParentSoundChannelRange[owners.Count];
      //Validate ALL owner headers and the aggregate observation bound before any descendant read.
      for(int i=0;i<owners.Count;i++){
        ParentSoundBankOwnerRange owner=owners[i];if(owner==null||owner.index!=i||owner.data==null||owner.data.Length!=0x490)throw new InvalidDataException("Sound channel graph owner identity/extent is not the original typed observation.");
        uint begin=BitConverter.ToUInt32(owner.data,4),end=BitConverter.ToUInt32(owner.data,8),capacity=BitConverter.ToUInt32(owner.data,12);
        if(begin==0&&(end!=0||capacity!=0)||begin>end||end>capacity||(end-begin)%4!=0||(capacity-begin)%4!=0)throw new InvalidDataException("Sound channel graph actual vector header is malformed.");
        uint used=(end-begin)/4;if(used>256||used>256-result.usedChannelSlots)throw new InvalidDataException("Sound channel graph aggregate used slots exceed observation bound; no descendant read.");result.usedChannelSlots+=checked((int)used);ParentSoundChannelRange storage=null;
        if(used!=0){string key=Hex(begin)+":"+(end-begin);if(!storages.TryGetValue(key,out storage)){storage=AddParentSoundChannelRange(result,result.storages,"storage",begin,checked((int)(end-begin)));storages.Add(key,storage);}storage.referenceIndices.Add(i);}ownerStorage[i]=storage;
        result.owners.Add(Record("ownerIndex",i,"ownerAddress",Hex(owner.address),"begin",Hex(begin),"end",Hex(end),"capacity",Hex(capacity),"usedSlots",used,"storageIndex",storage==null?null:(object)storage.index,"storageRangeId",storage==null?null:storage.id));
      }
      foreach(ParentSoundChannelRange storage in result.storages)ReadParentSoundChannelRange(storage,captured,owners,result,read);
      for(int ownerIndex=0;ownerIndex<owners.Count;ownerIndex++){
        ParentSoundChannelRange storage=ownerStorage[ownerIndex];if(storage==null)continue;
        for(int i=0;i<storage.length/4;i++){
          uint address=BitConverter.ToUInt32(storage.data,i*4);ParentSoundChannelRange wrapper=null;
          if(address!=0){if(!wrappers.TryGetValue(address,out wrapper)){wrapper=AddParentSoundChannelRange(result,result.wrappers,"wrapper",address,p.wrapperBytes);wrappers.Add(address,wrapper);}wrapper.referenceIndices.Add(result.slots.Count);}
          result.slots.Add(Record("ownerIndex",ownerIndex,"index",i,"slotAddress",Hex(checked(storage.address+(uint)i*4)),"wrapperAddress",Hex(address),"wrapperIndex",wrapper==null?null:(object)wrapper.index,"wrapperRangeId",wrapper==null?null:wrapper.id,"sourceAddress",null,"sourceIndex",null,"sourceRangeId",null));
        }
      }
      foreach(ParentSoundChannelRange wrapper in result.wrappers){ReadParentSoundChannelRange(wrapper,captured,owners,result,read);wrapper.sourceAddress=BitConverter.ToUInt32(wrapper.data,0);ParentSoundChannelRange source=null;if(wrapper.sourceAddress!=0){if(!sources.TryGetValue(wrapper.sourceAddress,out source)){source=AddParentSoundChannelRange(result,result.sources,"source",wrapper.sourceAddress,p.sourceBytes);sources.Add(source.address,source);}source.referenceIndices.Add(wrapper.index);}wrapper.source=source;}
      foreach(ParentSoundChannelRange source in result.sources){
        byte[] probe=read(source.address,4);if(probe==null||probe.Length!=4)throw new InvalidDataException("Sound channel graph requires the actual source class DWORD before full source resolution.");CheckParentSoundChannelBytes(source.address,probe,captured,owners,result);source.vtableAddress=BitConverter.ToUInt32(probe,0);source.probeBytesHex=BytesHex(probe);
        if(source.vtableAddress!=mainBase+0x1d3f60)throw new InvalidDataException("Sound channel graph unclassified source; no9a8 range read.");ReadParentSoundChannelRange(source,captured,owners,result,read);if(BytesHex(new byte[]{source.data[0],source.data[1],source.data[2],source.data[3]})!=source.probeBytesHex)throw new InvalidDataException("Sound channel graph source prefix changed after its guarded class probe.");
        ParentSoundChannelRange vtable;if(!vtables.TryGetValue(source.vtableAddress,out vtable)){vtable=AddParentSoundChannelRange(result,result.vtables,"vtable",source.vtableAddress,p.vtableBytes);vtables.Add(vtable.address,vtable);}vtable.referenceIndices.Add(source.index);source.vtable=vtable;
      }
      foreach(ParentSoundChannelRange vtable in result.vtables)ReadParentSoundChannelRange(vtable,captured,owners,result,read);
      foreach(Dictionary<string,object> slot in result.slots){if(slot["wrapperIndex"]==null)continue;ParentSoundChannelRange wrapper=result.wrappers[(int)slot["wrapperIndex"]];slot["sourceAddress"]=Hex(wrapper.sourceAddress);slot["sourceIndex"]=wrapper.source==null?null:(object)wrapper.source.index;slot["sourceRangeId"]=wrapper.source==null?null:wrapper.source.id;}
      return result;
    }
    static List<object> ParentSoundChannelInventory(List<ParentSoundChannelRange> rows) {
      List<object> result=new List<object>();foreach(ParentSoundChannelRange row in rows){Dictionary<string,object> item=Record("index",row.index,"address",Hex(row.address),"rangeId",row.id,"bytes",row.data.Length,"sha256",Digest(row.data),"referenceIndices",row.referenceIndices.ToArray());if(row.role=="wrapper"){item["sourceAddress"]=Hex(row.sourceAddress);item["sourceIndex"]=row.source==null?null:(object)row.source.index;item["sourceRangeId"]=row.source==null?null:row.source.id;}if(row.role=="source"){item["vtableAddress"]=Hex(row.vtableAddress);item["vtableIndex"]=row.vtable.index;item["vtableRangeId"]=row.vtable.id;item["probeBytesHex"]=row.probeBytesHex;item["beforeSourceRangeRead"]=true;}result.Add(item);}return result;
    }
    public static Dictionary<string,object> ParentSoundChannelDetails(ParentSoundChannelRead observed) {
      return Record("maxUsedChannelSlots",256,"usedChannelSlots",observed.usedChannelSlots,"storageRows",observed.storages.Count,"wrapperRows",observed.wrappers.Count,"sourceRows",observed.sources.Count,"vtableRows",observed.vtables.Count,"additionalBytes",observed.additionalBytes,"owners",observed.owners,"slots",observed.slots,"storages",ParentSoundChannelInventory(observed.storages),"wrappers",ParentSoundChannelInventory(observed.wrappers),"sources",ParentSoundChannelInventory(observed.sources),"vtables",ParentSoundChannelInventory(observed.vtables));
    }
    public static Dictionary<string,object> ParentSoundChannelRangeMetadata(ParentSoundChannelRange row,string file) {
      return Record("id",row.id,"address",Hex(row.address),"length",row.data.Length,"file",file,"sha256",Digest(row.data),"source","parent-sound-bank-channel-graph","graphRole",row.role,"graphIndex",row.index,"referenceIndices",row.referenceIndices.ToArray());
    }
    public static ParentSoundBankOwnerRead ReadParentSoundBankOwners(ParentSoundBankOwnerGraph p,uint mainBase,IList<ParentSoundBankCapturedRange> captured,Func<uint,int,byte[]> read,bool finalPurpose=false) {
      ValidateParentSoundBankOwnerPolicy(p,finalPurpose);
      if(mainBase==0||(ulong)mainBase+0x2f2420>0x100000000UL||captured==null||read==null)throw new InvalidDataException("Sound owner graph lacks its actual module/captured ranges/reader.");
      ParentSoundBankOwnerRead result=new ParentSoundBankOwnerRead();HashSet<string> ids=new HashSet<string>();
      foreach(ParentSoundBankCapturedRange row in captured){if(row==null||row.id==null||!ids.Add(row.id)||row.id.StartsWith("parent-sound-bank-owner-",StringComparison.Ordinal)||row.data==null||(ulong)row.address+(ulong)row.data.Length>0x100000000UL)throw new InvalidDataException("Sound owner graph ordinary captured row is missing/duplicated/overflowing.");if(row.id==p.headerRangeId)result.header=row;if(row.id==p.storageRangeId)result.storage=row;}
      if(result.header==null||result.storage==null||result.header.address!=mainBase+0x2f2414||result.header.data.Length!=12||result.header.vector!=null||result.storage.vector==null)throw new InvalidDataException("Sound owner graph lacks the exact already captured ordinary header/storage.");
      result.headerAddress=result.header.address;VectorStorageInfo vector=DecodeVectorStorage(result.header.data,65536),stored=result.storage.vector;
      if(result.storage.vectorHeaderAddress!=result.headerAddress||stored.header==null||BytesHex(stored.header)!=BytesHex(result.header.data)||stored.begin!=vector.begin||stored.end!=vector.end||stored.capacity!=vector.capacity||stored.length!=vector.length||result.storage.address!=vector.begin||result.storage.data.Length!=vector.length||(vector.end-vector.begin)%4!=0||(vector.capacity-vector.begin)%4!=0)throw new InvalidDataException("Sound owner graph header/full-capacity bytes and actual vector metadata disagree.");
      result.begin=vector.begin;result.end=vector.end;result.capacity=vector.capacity;result.usedSlots=checked((int)((vector.end-vector.begin)/4));result.capacitySlots=checked((int)((vector.capacity-vector.begin)/4));
      if(result.usedSlots>p.maxUsedSlots)throw new InvalidDataException("Sound owner graph actual used slots exceed observation bound; no owner read attempted.");
      Dictionary<uint,ParentSoundBankOwnerRange> owners=new Dictionary<uint,ParentSoundBankOwnerRange>();
      //Enumerate actual used slots first; never follow unused capacity or null.
      for(int i=0;i<result.usedSlots;i++){
        uint owner=BitConverter.ToUInt32(result.storage.data,i*4);ParentSoundBankOwnerRange part=null;
        if(owner!=0){if((ulong)owner+(uint)p.ownerBytes>0x100000000UL)throw new InvalidDataException("Sound owner graph nonnull owner extent overflows32bits.");if(!owners.TryGetValue(owner,out part)){part=new ParentSoundBankOwnerRange{index=result.owners.Count,id="parent-sound-bank-owner-"+result.owners.Count,address=owner};owners.Add(owner,part);result.owners.Add(part);}part.slotIndices.Add(i);}else result.nullSlots.Add(i);
        result.slots.Add(Record("index",i,"slotAddress",Hex(checked(result.begin+(uint)i*4)),"ownerAddress",Hex(owner),"ownerIndex",part==null?null:(object)part.index,"rangeId",part==null?null:part.id));
      }
      result.additionalOwnerBytes=checked(result.owners.Count*p.ownerBytes);
      if(result.additionalOwnerBytes>299008)throw new InvalidDataException("Sound owner graph additional storage exceeds its unchanged bounded domain.");
      foreach(ParentSoundBankOwnerRange part in result.owners){part.data=read(part.address,p.ownerBytes);if(part.data==null||part.data.Length!=p.ownerBytes)throw new InvalidDataException("Sound owner graph requires an exact successful490h nonnull read, never default/missing bytes.");foreach(ParentSoundBankCapturedRange row in captured)CheckParentSoundBankOverlap(part.address,part.data,row.address,row.data);foreach(ParentSoundBankOwnerRange earlier in result.owners){if(earlier==part)break;CheckParentSoundBankOverlap(part.address,part.data,earlier.address,earlier.data);}}
      if(p.channelGraph!=null)result.channelGraph=ReadParentSoundBankChannels(p.channelGraph,mainBase,captured,result.owners,read);
      return result;
    }
    public static void CommitParentSoundBankOwners(ParentRttiProgress state,ParentSoundBankOwnerRead observed,uint ownerMainTid,uint actualTid,string id,int debugOrdinal) {
      ValidateParentSoundBankOwnerCheckpoint(state,ownerMainTid,actualTid,id,debugOrdinal);if(observed==null||observed.additionalOwnerBytes!=observed.owners.Count*0x490||observed.additionalOwnerBytes>299008)throw new InvalidDataException("Sound owner graph snapshot lacks its actual completed owner-byte accounting.");
      foreach(ParentSoundBankOwnerRange row in observed.owners)if(row.data==null||row.data.Length!=0x490)throw new InvalidDataException("Sound owner graph cannot commit partial owner reads.");
      if(observed.channelGraph!=null){ParentSoundChannelRead c=observed.channelGraph;if(state.soundChannelChecks!=state.soundOwnerChecks||c.usedChannelSlots>256||c.additionalBytes>637064)throw new InvalidDataException("Sound channel graph cannot commit an out-of-order or over-bound checkpoint.");foreach(ParentSoundChannelRange row in c.ranges)if(row.data==null)throw new InvalidDataException("Sound channel graph cannot commit an unread descendant.");state.soundChannelChecks++;state.soundChannelSlots=checked(state.soundChannelSlots+c.usedChannelSlots);state.soundChannelStorages=checked(state.soundChannelStorages+c.storages.Count);state.soundChannelWrappers=checked(state.soundChannelWrappers+c.wrappers.Count);state.soundChannelSources=checked(state.soundChannelSources+c.sources.Count);state.soundChannelVtables=checked(state.soundChannelVtables+c.vtables.Count);state.soundChannelBytes=checked(state.soundChannelBytes+c.additionalBytes);}
      state.soundOwnerChecks++;state.soundOwnerRows=checked(state.soundOwnerRows+observed.owners.Count);state.soundOwnerBytes=checked(state.soundOwnerBytes+observed.additionalOwnerBytes);
    }
    public static Dictionary<string,object> ParentSoundBankOwnerDetails(ParentSoundBankOwnerRead observed) {
      List<object> owners=new List<object>();foreach(ParentSoundBankOwnerRange row in observed.owners)owners.Add(Record("index",row.index,"address",Hex(row.address),"slotIndices",row.slotIndices.ToArray(),"rangeId",row.id,"bytes",row.data.Length,"sha256",Digest(row.data)));
      Dictionary<string,object> details=Record("headerAddress",Hex(observed.headerAddress),"headerBytesHex",BytesHex(observed.header.data),"headerRangeId",observed.header.id,"headerSha256",Digest(observed.header.data),"begin",Hex(observed.begin),"end",Hex(observed.end),"capacity",Hex(observed.capacity),"usedSlots",observed.usedSlots,"capacitySlots",observed.capacitySlots,"storageRangeId",observed.storage.id,"storageAddress",Hex(observed.storage.address),"storageBytes",observed.storage.data.Length,"storageSha256",Digest(observed.storage.data),"maxUsedSlots",256,"ownerBytes",0x490,"uniqueOwners",observed.owners.Count,"nullSlots",observed.nullSlots.Count,"slots",observed.slots,"owners",owners,"additionalOwnerBytes",observed.additionalOwnerBytes,"sameStoppedDebugEvent",true,"afterParentAdmission",true,"beforeOriginalInstruction",true,"completeUsedOwnerObservation",true);
      if(observed.channelGraph!=null)details["channelGraph"]=ParentSoundChannelDetails(observed.channelGraph);return details;
    }
    public static ParentRttiMapRead ReadParentRttiMapSource(uint mainBase,uint ownerTid,uint actualTid,Func<uint,int,byte[]> read) {
      if(ownerTid==0||actualTid!=ownerTid||read==null||mainBase==0||(ulong)mainBase+0x2efb3c>0x100000000UL)throw new InvalidDataException("Parent RTTI map source requires the owned main thread and actual image root.");
      ParentRttiMapRead p=new ParentRttiMapRead {rootAddress=Add(mainBase,0x2efb38)};p.rootBytes=read(p.rootAddress,4);if(p.rootBytes==null||p.rootBytes.Length!=4)throw new InvalidDataException("Parent RTTI singleton DWORD is unobserved.");p.appAddress=BitConverter.ToUInt32(p.rootBytes,0);
      if(p.appAddress==0||(ulong)p.appAddress+0x80>0x100000000UL)throw new InvalidDataException("Parent RTTI actual singleton is null/overflow; no map range resolved.");p.headSlotAddress=Add(p.appAddress,0x7c);p.headBytes=read(p.headSlotAddress,4);if(p.headBytes==null||p.headBytes.Length!=4)throw new InvalidDataException("Parent RTTI actual map-head DWORD is unobserved.");p.headAddress=BitConverter.ToUInt32(p.headBytes,0);
      if(p.headAddress==0||(ulong)p.headAddress+100>0x100000000UL)throw new InvalidDataException("Parent RTTI actual map head is null/overflow; no map range resolved.");return p;
    }
    public static void ValidateParentRttiMapGraphPolicy(ParentRttiViewportMapGraph p,bool finalPurpose=false) {
      if(p==null||p.maxNodes!=8||p.maxKeyBytes!=256||p.breakpointIds==null||String.Join(",",p.breakpointIds)!=("native-control-before,native-control-after-cameras,native-control-after-world-effects"+(finalPurpose?",native-parent-return":"")))throw new InvalidDataException("Parent RTTI viewport graph requires exact node/key/three-checkpoint bounds.");
    }
    static byte[] ReadParentRttiGraphBytes(uint address,int length,Func<uint,int,byte[]> read) {
      if(address==0||length<1||(ulong)address+(ulong)length>0x100000000UL)throw new InvalidDataException("Parent RTTI graph pointer/extent is null or overflows32bits.");
      byte[] bytes=read(address,length);if(bytes==null||bytes.Length!=length)throw new InvalidDataException("Parent RTTI graph requires all actual bytes; no missing/default storage.");return bytes;
    }
    public static ParentRttiMapGraphRead ReadParentRttiViewportMapGraph(ParentRttiViewportMapGraph policy,uint app,uint expectedHead,Func<uint,int,byte[]> read,bool finalPurpose=false) {
      ValidateParentRttiMapGraphPolicy(policy,finalPurpose);if(read==null)throw new ArgumentNullException("read");
      if(app==0||(ulong)app+0x84>0x100000000UL||expectedHead==0)throw new InvalidDataException("Parent RTTI graph requires the preflight's bounded actual APP/head.");
      ParentRttiMapGraphRead result=new ParentRttiMapGraphRead {appAddress=app,headerAddress=Add(app,0x7c),headAddress=expectedHead};
      result.headerBytes=ReadParentRttiGraphBytes(result.headerAddress,8,read);uint head=BitConverter.ToUInt32(result.headerBytes,0);result.count=BitConverter.ToUInt32(result.headerBytes,4);
      if(head!=expectedHead||result.count>policy.maxNodes)throw new InvalidDataException("Parent RTTI graph head changed or actual node count exceeds bound.");
      result.headBytes=ReadParentRttiGraphBytes(head,16,read);if(result.headBytes[12]!=1||result.headBytes[13]!=1)throw new InvalidDataException("Parent RTTI map head is not the actual nil/color sentinel.");
      uint minimum=BitConverter.ToUInt32(result.headBytes,0),root=BitConverter.ToUInt32(result.headBytes,4),maximum=BitConverter.ToUInt32(result.headBytes,8);result.rootAddress=root;
      result.ranges.Add(new ParentRttiMapGraphRange{id="parent-rtti-map-graph-header",role="header",address=result.headerAddress,data=result.headerBytes});
      result.ranges.Add(new ParentRttiMapGraphRange{id="parent-rtti-map-graph-head",role="head",address=head,data=result.headBytes});
      if(result.count==0){if(root!=head||minimum!=head||maximum!=head)throw new InvalidDataException("Parent RTTI empty map sentinel links disagree with actual count.");return result;}
      if(root==0||root==head||minimum==0||minimum==head||maximum==0||maximum==head)throw new InvalidDataException("Parent RTTI nonempty graph has a null/nil root or extrema.");
      List<uint> addresses=new List<uint>(),parents=new List<uint>();List<string> paths=new List<string>();HashSet<uint> discovered=new HashSet<uint>();Dictionary<uint,byte[]> bytesByAddress=new Dictionary<uint,byte[]>();
      addresses.Add(root);parents.Add(head);paths.Add("root");discovered.Add(root);
      for(int index=0;index<addresses.Count;index++) {
        uint address=addresses[index];byte[] node=ReadParentRttiGraphBytes(address,100,read);bytesByAddress.Add(address,node);
        uint left=BitConverter.ToUInt32(node,0),parent=BitConverter.ToUInt32(node,4),right=BitConverter.ToUInt32(node,8);
        if(node[13]!=0||node[12]>1||parent!=parents[index])throw new InvalidDataException("Parent RTTI node nil/color or actual parent backlink differs.");
        uint length=BitConverter.ToUInt32(node,32),capacity=BitConverter.ToUInt32(node,36);bool heap=capacity>=16;
        if(length>capacity||(ulong)length+1>(ulong)policy.maxKeyBytes||!heap&&length>=16)throw new InvalidDataException("Parent RTTI key length/capacity exceeds native storage or bounded bytes.");
        uint key=heap?BitConverter.ToUInt32(node,16):Add(address,16);string nodeId="parent-rtti-map-node-"+index,keyId=heap?"parent-rtti-map-key-"+index:null;
        result.ranges.Add(new ParentRttiMapGraphRange{id=nodeId,role="node",address=address,nodeAddress=address,nodeIndex=index,path=paths[index],data=node});
        byte[] keyBytes;if(heap){keyBytes=ReadParentRttiGraphBytes(key,checked((int)length+1),read);result.ranges.Add(new ParentRttiMapGraphRange{id=keyId,role="heap-key",address=key,nodeAddress=address,nodeIndex=index,path=paths[index],data=keyBytes});}else{keyBytes=new byte[checked((int)length+1)];Buffer.BlockCopy(node,16,keyBytes,0,keyBytes.Length);}
        if(keyBytes[(int)length]!=0)throw new InvalidDataException("Parent RTTI actual key length has no observed terminating NUL.");
        result.nodes.Add(Record("index",index,"path",paths[index],"address",Hex(address),"parentAddress",Hex(parent),"leftAddress",Hex(left),"rightAddress",Hex(right),"keyAddress",Hex(key),"keyLength",length,"keyCapacity",capacity,"heapKey",heap,"nodeRangeId",nodeId,"keyRangeId",keyId));
        for(int side=0;side<2;side++){uint child=side==0?left:right;if(child==head)continue;if(child==0||!discovered.Add(child))throw new InvalidDataException("Parent RTTI graph contains a null child, duplicate/shared node or cycle.");if(discovered.Count>result.count||discovered.Count>policy.maxNodes)throw new InvalidDataException("Parent RTTI actual graph exceeds declared node count/bound.");addresses.Add(child);parents.Add(address);paths.Add(paths[index]+(side==0?".left":".right"));}
      }
      if(addresses.Count!=result.count)throw new InvalidDataException("Parent RTTI actual reachable node count disagrees with map header.");
      uint first=root,last=root;while(BitConverter.ToUInt32(bytesByAddress[first],0)!=head)first=BitConverter.ToUInt32(bytesByAddress[first],0);while(BitConverter.ToUInt32(bytesByAddress[last],8)!=head)last=BitConverter.ToUInt32(bytesByAddress[last],8);
      if(first!=minimum||last!=maximum)throw new InvalidDataException("Parent RTTI actual sentinel minimum/maximum links disagree with graph.");return result;
    }
    public static ParentRttiEndpointRead ReadParentRttiEndpoint(ParentRttiProgress state,uint mainBase,uint actualTid,uint esp,Func<uint,int,byte[]> read) {
      if(state==null||read==null)throw new ArgumentNullException("state/read");if(!state.CanRead(actualTid,esp))return null;
      ParentRttiEndpointRead p=new ParentRttiEndpointRead {clockBytes=read(Add(mainBase,0x50a548),4)};if(p.clockBytes==null||p.clockBytes.Length!=4||BitConverter.ToUInt32(p.clockBytes,0)!=state.clock)throw new InvalidDataException("Parent RTTI scoped logical clock changed before range reads.");
      if(state.weatherScreenQueries&&esp==state.parentEsp-460) {
        p.weather=true;p.context=read(esp,68);p.queryReturn=read(Add(esp,84),4);p.screenReturn=read(Add(esp,416),4);p.parentReturn=read(Add(esp,440),4);p.name=read(Add(esp,140),9);p.singletonBytes=read(Add(mainBase,0x2efb38),4);
        if(p.context==null||p.context.Length!=68||p.queryReturn==null||p.queryReturn.Length!=4||p.screenReturn==null||p.screenReturn.Length!=4||p.parentReturn==null||p.parentReturn.Length!=4||p.name==null||p.name.Length!=9||p.singletonBytes==null||p.singletonBytes.Length!=4)throw new InvalidDataException("Parent RTTI weather argument/return/name extent is unobserved.");
        uint queryReturn=BitConverter.ToUInt32(p.queryReturn,0);p.weatherQueryIndex=queryReturn==Add(mainBase,0x98092)?1:queryReturn==Add(mainBase,0x980f5)?2:0;p.commonCaller=ParentRttiWeatherAbiMatches(state,mainBase,p);
        p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-context",address=esp,data=p.context});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-clock",address=Add(mainBase,0x50a548),data=p.clockBytes});
        p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-weather-query-return",address=Add(esp,84),data=p.queryReturn});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-weather-screen-return",address=Add(esp,416),data=p.screenReturn});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-weather-parent-return",address=Add(esp,440),data=p.parentReturn});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-weather-name",address=Add(esp,140),data=p.name});return p;
      }
      p.context=read(esp,52);p.cameraReturn=read(Add(esp,256),4);p.singletonBytes=read(Add(mainBase,0x2efb38),4);
      if(p.context==null||p.context.Length!=52||p.cameraReturn==null||p.cameraReturn.Length!=4||p.singletonBytes==null||p.singletonBytes.Length!=4)throw new InvalidDataException("Parent RTTI actual scoped argument extent is unobserved.");
      p.commonCaller=BitConverter.ToUInt32(p.context,40)==Add(mainBase,0x1a0c8)&&BitConverter.ToUInt32(p.context,44)==state.parentEsp-60&&BitConverter.ToUInt32(p.context,48)==1&&BitConverter.ToUInt32(p.cameraReturn,0)==Add(mainBase,0x51107);
      if(state.weatherScreenQueries){p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-context",address=esp,data=p.context});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-camera-return",address=Add(esp,256),data=p.cameraReturn});p.ranges.Add(new ParentRttiObservedRange{id="native-parent-rtti-clock",address=Add(mainBase,0x50a548),data=p.clockBytes});}return p;
    }
    public static bool ParentRttiWeatherAbiMatches(ParentRttiProgress state,uint mainBase,ParentRttiEndpointRead p) {
      if(state==null||p==null||!p.weather||p.weatherQueryIndex<1||p.weatherQueryIndex>2||p.context==null||p.context.Length!=68||p.queryReturn==null||p.queryReturn.Length!=4||p.screenReturn==null||p.screenReturn.Length!=4||p.parentReturn==null||p.parentReturn.Length!=4||p.name==null||p.name.Length!=9)return false;
      uint U=state.parentEsp;bool second=p.weatherQueryIndex==2;
      return BytesHex(p.name)=="3020506c6179657200"&&BitConverter.ToUInt32(p.context,0)==state.appAddress&&BitConverter.ToUInt32(p.context,4)==0&&BitConverter.ToUInt32(p.context,8)==Add(mainBase,0x2e213c)&&BitConverter.ToUInt32(p.context,12)==Add(mainBase,0x2e20a4)&&BitConverter.ToUInt32(p.context,16)==0&&BitConverter.ToUInt32(p.context,40)==Add(mainBase,0xabf3)&&BitConverter.ToUInt32(p.context,44)==U-319&&BitConverter.ToUInt32(p.context,48)==U-320&&BitConverter.ToUInt32(p.context,52)==U-(second?344u:336u)&&BitConverter.ToUInt32(p.context,56)==U-(second?336u:332u)&&BitConverter.ToUInt32(p.context,60)==U-(second?332u:340u)&&BitConverter.ToUInt32(p.context,64)==U-328&&BitConverter.ToUInt32(p.queryReturn,0)==Add(mainBase,second?0x980f5u:0x98092u)&&BitConverter.ToUInt32(p.screenReturn,0)==Add(mainBase,0x96822)&&BitConverter.ToUInt32(p.parentReturn,0)==Add(mainBase,0x51116);
    }
    public static byte[] ReadParentCounterBytes(uint address,int length,Func<uint,int,byte[]> read) {
      if(read==null||address==0||length<1||(ulong)address+(ulong)length>0x100000000UL)throw new InvalidDataException("Counter observation requires a bounded actual address/extent.");byte[] bytes=read(address,length);if(bytes==null||bytes.Length!=length)throw new InvalidDataException("Counter observation lacks its complete actual bytes.");return bytes;
    }
    static bool CounterBytesEqual(byte[] a,byte[] b) {if(a==null||b==null||a.Length!=b.Length)return false;for(int i=0;i<a.Length;i++)if(a[i]!=b[i])return false;return true;}
    public static ParentWeatherCounterRead ReadParentWeatherCounter(ParentRttiProgress parent,ParentWeatherCounterProgress state,uint mainBase,uint actualTid,bool entry,uint esp,uint eip,uint ebp,uint esi,Func<uint,int,byte[]> read) {
      if(state==null||parent==null||read==null)throw new ArgumentNullException("counter state/parent/read");if(!state.CanRead(parent,actualTid,entry,esp))return null;
      if(mainBase!=state.moduleBaseAddress||eip!=checked(mainBase+(entry?0x89d11u:0x89d13u))||ebp!=state.parentU-368||esi!=state.iatTarget||RequiredParentCounterSnapshots(parent)>(parent.finalTick==null?21:22)||entry&&(state.open||state.complete||state.captured!=0)||!entry&&(!state.open||state.complete||state.captured!=1))throw new InvalidDataException("Counter raw context/call lifecycle or full checkpoint reservation differs before range reads.");
      uint U=state.parentU,A=(U-368)&~7u,B=A-32;ParentWeatherCounterRead p=new ParentWeatherCounterRead {parentU=U,timerEntry=U-364,ebp=U-368,aligned=A,frame=B,beforeEsp=B-4,afterEsp=B,output=B+24};
      p.argument=ReadParentCounterBytes(p.beforeEsp,4,read);p.outputBytes=ReadParentCounterBytes(p.output,8,read);p.frameBytes=ReadParentCounterBytes(p.frame,32,read);p.timerReturn=ReadParentCounterBytes(p.timerEntry,4,read);p.screenReturn=ReadParentCounterBytes(U-44,4,read);p.parentReturn=ReadParentCounterBytes(U-20,4,read);p.iat=ReadParentCounterBytes(checked(mainBase+0x16e0fc),4,read);p.initialized=ReadParentCounterBytes(checked(mainBase+0x2e6c8c),4,read);p.originFrequency=ReadParentCounterBytes(checked(mainBase+0x3135a4),16,read);p.clockBytes=ReadParentCounterBytes(checked(mainBase+0x50a548),4,read);
      ValidateParentWeatherCounterRead(state,parent,mainBase,p);
      string[] ids={"argument","output","frame","timer-return","screen-return","parent-return","iat","initialized","origin-frequency","clock"};uint[] addresses={p.beforeEsp,p.output,p.frame,p.timerEntry,U-44,U-20,checked(mainBase+0x16e0fc),checked(mainBase+0x2e6c8c),checked(mainBase+0x3135a4),checked(mainBase+0x50a548)};byte[][] bytes={p.argument,p.outputBytes,p.frameBytes,p.timerReturn,p.screenReturn,p.parentReturn,p.iat,p.initialized,p.originFrequency,p.clockBytes};for(int i=0;i<ids.Length;i++)p.ranges.Add(new ParentRttiObservedRange{id="native-parent-counter-"+ids[i],address=addresses[i],data=bytes[i]});return p;
    }
    public static void ValidateParentWeatherCounterRead(ParentWeatherCounterProgress state,ParentRttiProgress parent,uint mainBase,ParentWeatherCounterRead p) {
      if(state==null||parent==null||p==null||!state.originalLatched||mainBase!=state.moduleBaseAddress)throw new InvalidDataException("Counter has no original parent input identity.");uint U=state.parentU,A=(U-368)&~7u,B=A-32;
      if(p.parentU!=U||p.timerEntry!=U-364||p.ebp!=U-368||p.aligned!=A||p.frame!=B||p.beforeEsp!=B-4||p.afterEsp!=B||p.output!=B+24||p.argument==null||p.argument.Length!=4||p.outputBytes==null||p.outputBytes.Length!=8||p.frameBytes==null||p.frameBytes.Length!=32||p.timerReturn==null||p.timerReturn.Length!=4||p.screenReturn==null||p.screenReturn.Length!=4||p.parentReturn==null||p.parentReturn.Length!=4||p.iat==null||p.iat.Length!=4||p.initialized==null||p.initialized.Length!=4||p.originFrequency==null||p.originFrequency.Length!=16||p.clockBytes==null||p.clockBytes.Length!=4)throw new InvalidDataException("Counter actual frame/row extents differ.");
      if(BitConverter.ToUInt32(p.argument,0)!=p.output||BitConverter.ToUInt32(p.frameBytes,8)!=p.ebp||BitConverter.ToUInt32(p.timerReturn,0)!=checked(mainBase+0x98458)||BitConverter.ToUInt32(p.screenReturn,0)!=checked(mainBase+0x96822)||BitConverter.ToUInt32(p.parentReturn,0)!=checked(mainBase+0x51116)||BitConverter.ToUInt32(p.clockBytes,0)!=parent.clock||BitConverter.ToUInt32(p.initialized,0)!=1||!CounterBytesEqual(p.initialized,state.initialFlag)||!CounterBytesEqual(p.originFrequency,state.initialOriginFrequency)||!CounterBytesEqual(p.iat,state.initialIat)||BitConverter.ToUInt32(p.iat,0)!=state.iatTarget)throw new InvalidDataException("Counter original caller/clock/IAT/initialized frequency-origin guards differ.");
      for(int i=0;i<8;i++)if(p.frameBytes[24+i]!=p.outputBytes[i])throw new InvalidDataException("Counter frame/output overlapping actual bytes disagree.");
    }
    public static void ValidateParentCounterDeferredCode(bool call,byte original,bool armed,int rawHits,int matchingHits,int captureHits,byte[] code) {
      string expected=call?"ffd6":"8b442418";if(armed||rawHits!=0||matchingHits!=0||captureHits!=0||code==null||code.Length!=expected.Length/2||original!=code[0]||BytesHex(code)!=expected)throw new InvalidDataException("Counter deferred original code/counters changed before selected activation.");
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
      ValidateRaceClockPolicy(o);
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
    static Dictionary<string,object> ActivateParentFinalReturn(Options o,ParentRttiProgress parent,ProcessInfo child,uint mainBase,Breakpoint entry,uint tid,int debugOrdinal,int snapshotOrdinal,List<Breakpoint> breakpoints,Action<Dictionary<string,object>> emit) {
      Breakpoint point=breakpoints.Find(delegate(Breakpoint b){return b.id==o.parentRttiObservation.finalTick.returnBreakpointId;});byte[] code=Bytes(child.process,point.resolved,2);parent.finalTick.Activate(parent,mainBase,child.tid,tid,debugOrdinal,point.original,point.armed,point.hits,code);Write(child.process,point.resolved,new byte[]{0xcc});point.armed=true;
      Dictionary<string,object> proof=ParentRttiProof(parent,child,entry,tid,debugOrdinal,"parent-final-return-activated");proof["mainModuleBaseAddress"]=Hex(mainBase);proof["snapshotOrdinal"]=snapshotOrdinal;proof["id"]=point.id;proof["address"]=Hex(point.resolved);proof["originalBytesHex"]=BytesHex(code);proof["patchBytesHex"]="cc";proof["activationSelection"]="selected-owned-parent-entry";proof["afterSnapshotBytesCaptured"]=true;proof["beforeSnapshotPublication"]=true;proof["beforeOriginalInstruction"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> AdmitParentFinalReturn(Options o,ParentRttiProgress parent,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit) {
      ParentFinalProgress progress=parent.finalTick;
      if(tid!=child.tid){emit(Record("type","parent-final-return-skipped","pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"breakpointId",hit.id,"observedDebugEventOrdinal",debugOrdinal,"reason","different-owned-thread","matchingHitAdvanced",false,"snapshotCountAdvanced",false,"originalInstructionSkipped",false));return null;}
      uint esp=Number((string)regs["esp"]),eip=Number((string)regs["eip"]),eax=Number((string)regs["eax"]);
      if(progress==null||!progress.activated||progress.admitted||progress.complete||!parent.selected||parent.stage!=10||!parent.closed||parent.windowOpen||parent.callOpen||parent.parentEsp<16||(ulong)parent.parentEsp+12>0x100000000UL||esp!=parent.parentEsp+4||eip!=checked(mainBase+0x50e38))throw new InvalidDataException("Unproved same-main final caller is unsupported before endpoint range reads.");
      byte[] stack=Bytes(child.process,parent.parentEsp-16,28);uint[] nonvolatileRegisters={Number((string)regs["edi"]),Number((string)regs["esi"]),Number((string)regs["ebp"]),Number((string)regs["ebx"])};progress.Admit(parent,mainBase,child.tid,tid,eip,esp,eax,nonvolatileRegisters,stack,debugOrdinal,snapshotOrdinal);
      byte[] returned=new byte[4],total=new byte[4];Buffer.BlockCopy(stack,16,returned,0,4);Buffer.BlockCopy(stack,20,total,0,4);
      Dictionary<string,object> proof=ParentRttiProof(parent,child,hit,tid,debugOrdinal,"parent-final-return-admitted");proof["mainModuleBaseAddress"]=Hex(mainBase);proof["snapshotOrdinal"]=snapshotOrdinal;proof["returnActivationDebugEventOrdinal"]=progress.activationDebugOrdinal;proof["afterWorldDebugEventOrdinal"]=parent.lastStageDebugOrdinal;proof["entryEsp"]=Hex(parent.parentEsp);proof["returnEsp"]=Hex(esp);proof["stackAddress"]=Hex(parent.parentEsp-16);proof["stackBytesHex"]=BytesHex(stack);proof["entryNonvolatile"]=parent.incomingNonvolatile;proof["actualNonvolatile"]=nonvolatileRegisters;proof["returnValue"]=eax;proof["returnWordBytesHex"]=BytesHex(returned);proof["totalWordBytesHex"]=BytesHex(total);proof["beforeSnapshotRangeResolution"]=true;proof["beforeOriginalInstruction"]=true;proof["observationPhase"]="native-caller-after-parent-return";emit(proof);return proof;
    }
    static Dictionary<string,object> PrepareParentRttiCheckpoint(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit,out Dictionary<string,object> closed) {
      closed=null;bool finalPoint=o.parentRttiObservation.finalTick!=null&&hit.id==o.parentRttiObservation.finalTick.returnBreakpointId;bool entry=false;
      if(!finalPoint){
      if(tid!=child.tid||hit.captureHits!=0||hit.matchingHits!=hit.skipMatchingHits.Value+1)throw new InvalidDataException("Parent RTTI selected checkpoint is not its first owned main observation.");
      uint esp=Number((string)regs["esp"]),clock=BitConverter.ToUInt32(Bytes(child.process,Add(mainBase,0x50a548),4),0);entry=hit.id==o.parentRttiObservation.parentBreakpointId;bool physical=hit.id=="native-control-after"||hit.id=="native-control-after-physics";
      uint[] nonvolatileRegisters={Number((string)regs["edi"]),Number((string)regs["esi"]),Number((string)regs["ebp"]),Number((string)regs["ebx"])};
      state.ObserveStage(hit.id,mainBase,child.tid,tid,esp,clock,Number((string)regs[entry?"edx":"ebp"]),Bytes(child.process,esp,entry?8:physical?28:24),nonvolatileRegisters,debugOrdinal);
      if(entry&&state.counter!=null)state.counter.LatchOriginal(state,mainBase,tid,delegate(uint address,int length){return Bytes(child.process,address,length);});
      if(hit.id==o.parentRttiObservation.endBreakpointId){closed=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-closed");closed["snapshotOrdinal"]=snapshotOrdinal;closed["actualPairs"]=state.pairs;closed["actualSnapshots"]=state.captured;closed["callOpen"]=false;closed["windowOpen"]=false;closed["breakpointsRemainArmedForDeferredReplay"]=true;closed["beforeSnapshotRangeResolution"]=true;closed["beforeOriginalInstruction"]=true;if(state.counter!=null){closed["actualCounterPairs"]=state.counter.pairs;closed["actualCounterSnapshots"]=state.counter.captured;}emit(closed);}
      }
      if(Array.IndexOf(o.parentRttiObservation.singletonMapPreflight.breakpointIds,hit.id)<0)return null;
      ParentRttiMapRead map;
      try {map=ReadParentRttiMapSource(mainBase,child.tid,tid,delegate(uint address,int length){return Bytes(child.process,address,length);});state.ObserveMap(hit.id,map.appAddress,map.headAddress);}
      catch(Exception error){Dictionary<string,object> failed=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-preflight-failed");failed["beforeSnapshotRangeResolution"]=true;failed["sameStoppedDebugEvent"]=true;failed["error"]=error.ToString();emit(failed);throw;}
      Dictionary<string,object> proof=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-preflight");proof["snapshotOrdinal"]=snapshotOrdinal;proof["rootAddress"]=Hex(map.rootAddress);proof["rootBytesHex"]=BytesHex(map.rootBytes);proof["appAddress"]=Hex(map.appAddress);proof["headSlotAddress"]=Hex(map.headSlotAddress);proof["headBytesHex"]=BytesHex(map.headBytes);proof["headAddress"]=Hex(map.headAddress);proof["identitiesLatchedOrStable"]=true;proof["identityAction"]=entry?"latched":"stable";proof["beforeSnapshotRangeResolution"]=true;proof["phasePredicateAlreadySelected"]=!finalPoint;proof["sameStoppedDebugEvent"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> ActivateParentRtti(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint auxiliary,uint tid,int debugOrdinal,int snapshotOrdinal,List<Breakpoint> breakpoints,Action<Dictionary<string,object>> emit) {
      state.MarkAuxiliaryCaptured(snapshotOrdinal);state.Activate(debugOrdinal,tid);List<object> installed=new List<object>();
      List<string> ids=new List<string>(new string[]{o.parentRttiObservation.callBreakpointId,o.parentRttiObservation.returnBreakpointId});ParentWeatherCounterObservation counter=o.parentRttiObservation.weatherCounterObservation;if(counter!=null){ids.Add(counter.callBreakpointId);ids.Add(counter.returnBreakpointId);}
      foreach(string id in ids) {
        bool counterSite=counter!=null&&(id==counter.callBreakpointId||id==counter.returnBreakpointId);Breakpoint b=breakpoints.Find(delegate(Breakpoint point){return point.id==id;});string expected=counterSite?(id==counter.callBreakpointId?"ffd6":"8b442418"):id==o.parentRttiObservation.callBreakpointId?"e89f651600":"83c414";
        byte[] code=Bytes(child.process,b.resolved,expected.Length/2);if(counterSite)ValidateParentCounterDeferredCode(id==counter.callBreakpointId,b.original,b.armed,b.hits,b.matchingHits,b.captureHits,code);else ValidateParentRttiDeferredCode(id==o.parentRttiObservation.callBreakpointId,b.original,b.armed,b.hits,b.matchingHits,b.captureHits,code);
        Write(child.process,b.resolved,new byte[]{0xcc});b.armed=true;Dictionary<string,object> armed=ParentRttiProof(state,child,auxiliary,tid,debugOrdinal,"parent-rtti-breakpoint-activated");armed["id"]=b.id;armed["address"]=Hex(b.resolved);armed["originalBytesHex"]=expected;armed["patchBytesHex"]="cc";armed["beforeOriginalInstruction"]=true;emit(armed);installed.Add(Record("id",b.id,"address",Hex(b.resolved),"originalBytesHex",expected,"patchBytesHex","cc"));
      }
      Dictionary<string,object> proof=ParentRttiProof(state,child,auxiliary,tid,debugOrdinal,"parent-rtti-activation");proof["auxiliarySnapshotOrdinal"]=snapshotOrdinal;proof["installed"]=installed;proof["afterSnapshotBytesCaptured"]=true;proof["beforeSnapshotPublication"]=true;proof["beforeOriginalInstruction"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> PrepareParentRttiMapGraph(Options o,ParentRttiProgress state,ProcessInfo child,Breakpoint hit,uint tid,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit,out ParentRttiMapGraphRead graph) {
      graph=null;ParentRttiViewportMapGraph policy=o.parentRttiObservation.viewportMapGraph;
      if(policy==null||Array.IndexOf(policy.breakpointIds,hit.id)<0)return null;
      if(tid!=child.tid||tid!=state.tid||state.mapChecks!=state.graphChecks+1)throw new InvalidDataException("Parent RTTI graph requires the same stopped owned checkpoint after its actual preflight.");
      try {graph=ReadParentRttiViewportMapGraph(policy,state.appAddress,state.headAddress,delegate(uint address,int length){return Bytes(child.process,address,length);},o.parentRttiObservation.finalTick!=null);}
      catch(Exception error){Dictionary<string,object> failed=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-graph-failed");failed["afterSingletonPreflight"]=true;failed["sameStoppedDebugEvent"]=true;failed["error"]=error.ToString();emit(failed);throw;}
      state.graphChecks++;Dictionary<string,object> proof=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-map-graph");
      proof["snapshotOrdinal"]=snapshotOrdinal;proof["appAddress"]=Hex(graph.appAddress);proof["headerAddress"]=Hex(graph.headerAddress);proof["headerBytesHex"]=BytesHex(graph.headerBytes);proof["headAddress"]=Hex(graph.headAddress);proof["headBytesHex"]=BytesHex(graph.headBytes);proof["rootAddress"]=Hex(graph.rootAddress);proof["count"]=graph.count;proof["maxNodes"]=policy.maxNodes;proof["maxKeyBytes"]=policy.maxKeyBytes;proof["nodes"]=graph.nodes;proof["sameStoppedDebugEvent"]=true;proof["afterSingletonPreflight"]=true;proof["beforeOriginalInstruction"]=true;proof["completeGraphObserved"]=true;emit(proof);return proof;
    }
    static Dictionary<string,object> AdmitParentRtti(Options o,ParentRttiProgress state,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit,out ParentRttiEndpointRead captured) {
      captured=null;
      uint esp=Number((string)regs["esp"]);ParentRttiEndpointRead observed=ReadParentRttiEndpoint(state,mainBase,tid,esp,delegate(uint address,int length){return Bytes(child.process,address,length);});bool entry=hit.id==o.parentRttiObservation.callBreakpointId;
      if(state.weatherScreenQueries&&state.windowOpen&&tid==state.tid&&(observed==null||!observed.commonCaller))throw new InvalidDataException("Parent RTTI mixed camera/weather window reached an unproved same-thread caller or argument layout.");
      if(observed==null||!observed.commonCaller){if(observed!=null&&!entry&&state.callOpen)throw new InvalidDataException("Parent RTTI matched return changed its common wrapper lineage.");Dictionary<string,object> skipped=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-skipped");skipped["rawHit"]=hit.hits;skipped["reason"]=observed==null?(!state.windowOpen?"outside-selected-parent-camera-window":tid!=state.tid?"different-owned-thread":"different-derived-stack"):"different-common-camera-caller";skipped["matchingHitAdvanced"]=false;skipped["snapshotCountAdvanced"]=false;skipped["originalInstructionSkipped"]=false;emit(skipped);return null;}
      if(observed.weather)state.ValidateWeatherEndpoint(entry,mainBase,tid,esp,observed,debugOrdinal);else state.ValidateEndpoint(entry,mainBase,tid,esp,BitConverter.ToUInt32(observed.clockBytes,0),BitConverter.ToUInt32(observed.singletonBytes,0),observed.context,observed.cameraReturn,debugOrdinal);
      Dictionary<string,object> proof=ParentRttiProof(state,child,hit,tid,debugOrdinal,"parent-rtti-admitted");proof["role"]=entry?"call":"return";proof["rawHit"]=hit.hits;proof["pairIndex"]=state.pairs+1;proof["snapshotOrdinal"]=snapshotOrdinal;proof["derivedQ"]=Hex(esp);proof["stackAddress"]=Hex(esp);proof["stackBytesHex"]=BytesHex(observed.context);
      if(observed.weather){proof["weatherQueryIndex"]=observed.weatherQueryIndex;proof["queryReturnAddress"]=Hex(Add(esp,84));proof["queryReturnBytesHex"]=BytesHex(observed.queryReturn);proof["screenReturnAddress"]=Hex(Add(esp,416));proof["screenReturnBytesHex"]=BytesHex(observed.screenReturn);proof["parentReturnAddress"]=Hex(Add(esp,440));proof["parentReturnBytesHex"]=BytesHex(observed.parentReturn);proof["nameAddress"]=Hex(Add(esp,140));proof["nameBytesHex"]=BytesHex(observed.name);}else{proof["cameraReturnAddress"]=Hex(state.parentEsp-20);proof["cameraReturnBytesHex"]=BytesHex(observed.cameraReturn);}
      if(state.weatherScreenQueries)proof["family"]=observed.weather?"weather-screen":"camera";
      proof["actualSingletonBytesHex"]=BytesHex(observed.singletonBytes);proof["actualClockBytesHex"]=BytesHex(observed.clockBytes);proof["actualArgumentsHex"]=BytesHex(CopyRangeSegment(observed.context,0,20));proof["commonAbiMatched"]=true;proof["beforeSnapshotRangeResolution"]=true;proof["beforeOriginalInstruction"]=true;captured=observed;emit(proof);return proof;
    }
    static Dictionary<string,object> AdmitParentWeatherCounter(Options o,ParentRttiProgress parent,ProcessInfo child,uint mainBase,Breakpoint hit,uint tid,Dictionary<string,object> regs,int debugOrdinal,int snapshotOrdinal,Action<Dictionary<string,object>> emit,out ParentWeatherCounterRead observed) {
      observed=null;ParentWeatherCounterProgress state=parent.counter;bool entry=hit.id==o.parentRttiObservation.weatherCounterObservation.callBreakpointId;uint esp=Number((string)regs["esp"]),eip=Number((string)regs["eip"]),ebp=Number((string)regs["ebp"]),esi=Number((string)regs["esi"]);
      if(!state.CanRead(parent,tid,entry,esp)){if(parent.selected&&parent.windowOpen&&!parent.closed&&tid==parent.tid&&parent.stage==9&&parent.weatherPairs==2&&!parent.callOpen)throw new InvalidDataException("Counter selected main-thread window reached an unproved derived caller frame.");if(!entry&&state.open&&tid==parent.tid)throw new InvalidDataException("Counter return lost the exact original open frame.");Dictionary<string,object> skipped=ParentRttiProof(parent,child,hit,tid,debugOrdinal,"parent-weather-counter-skipped");skipped["rawHit"]=hit.hits;skipped["reason"]=tid!=parent.tid?"different-owned-thread":!parent.windowOpen?"outside-selected-parent-window":parent.weatherPairs!=2?"before-second-weather-return":"different-derived-stack";skipped["matchingHitAdvanced"]=false;skipped["snapshotCountAdvanced"]=false;skipped["originalInstructionSkipped"]=false;emit(skipped);return null;}
      observed=ReadParentWeatherCounter(parent,state,mainBase,tid,entry,esp,eip,ebp,esi,delegate(uint address,int length){return Bytes(child.process,address,length);});state.Validate(parent,entry,mainBase,tid,eip,ebp,esi,esp,observed,debugOrdinal,snapshotOrdinal,o.maxSnapshots);
      Dictionary<string,object> proof=ParentRttiProof(parent,child,hit,tid,debugOrdinal,"parent-weather-counter-admitted");proof["role"]=entry?"call":"return";proof["rawHit"]=hit.hits;proof["snapshotOrdinal"]=snapshotOrdinal;proof["pairIndex"]=1;proof["observationIndex"]=entry?1:2;proof["callDebugEventOrdinal"]=state.callDebugEventOrdinal;proof["callSnapshotOrdinal"]=state.callSnapshotOrdinal;proof["open"]=state.open;proof["completesPair"]=!entry;proof["parentU"]=Hex(observed.parentU);proof["timerEntryAddress"]=Hex(observed.timerEntry);proof["timerEbp"]=Hex(observed.ebp);proof["alignedAddress"]=Hex(observed.aligned);proof["beforeEsp"]=Hex(observed.beforeEsp);proof["afterEsp"]=Hex(observed.afterEsp);proof["outputAddress"]=Hex(observed.output);proof["initialFlagHex"]=BytesHex(state.initialFlag);proof["initialOriginFrequencyHex"]=BytesHex(state.initialOriginFrequency);proof["initialIatHex"]=BytesHex(state.initialIat);proof["initialInputDebugEventOrdinal"]=parent.parentDebugOrdinal;proof["totalRequiredSnapshots"]=RequiredParentCounterSnapshots(parent);proof["snapshotLimit"]=o.maxSnapshots;proof["beforeSnapshotRangeResolution"]=true;proof["beforeOriginalInstruction"]=true;
      string[] names={"argument","output","frame","timerReturn","screenReturn","parentReturn","iat","initialized","originFrequency","clock"};for(int i=0;i<names.Length;i++){proof[names[i]+"Address"]=Hex(observed.ranges[i].address);proof[names[i]+"BytesHex"]=BytesHex(observed.ranges[i].data);}emit(proof);return proof;
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
      RaceClockProgress raceClock=new RaceClockProgress();
      ParentRttiProgress parentRtti = new ParentRttiProgress {weatherScreenQueries=o.parentRttiObservation!=null&&o.parentRttiObservation.weatherScreenQueries};
      if(o.parentRttiObservation!=null&&o.parentRttiObservation.weatherCounterObservation!=null)parentRtti.counter=new ParentWeatherCounterProgress();
      if(o.parentRttiObservation!=null&&o.parentRttiObservation.finalTick!=null)parentRtti.finalTick=new ParentFinalProgress();
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
          emit(CaptureHeader(o));
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
                bool raceSite=o.raceClockObservation!=null&&b.id.StartsWith("native-race-clock-",StringComparison.Ordinal);byte[] raceCode=raceSite?RaceClockCode(b.id,mainBase):null;if(raceSite&&Digest(Bytes(child.process,b.resolved,raceCode.Length))!=Digest(raceCode))throw new InvalidDataException("Race clock original module code differs before any arming.");bool raceDeferred=raceSite&&b.id!=o.raceClockObservation.entryBreakpointId;
                bool finalDeferred=o.parentRttiObservation!=null&&o.parentRttiObservation.finalTick!=null&&b.id==o.parentRttiObservation.finalTick.returnBreakpointId;
                bool parentDeferred=o.parentRttiObservation!=null&&(b.id==o.parentRttiObservation.callBreakpointId||b.id==o.parentRttiObservation.returnBreakpointId||o.parentRttiObservation.weatherCounterObservation!=null&&(b.id==o.parentRttiObservation.weatherCounterObservation.callBreakpointId||b.id==o.parentRttiObservation.weatherCounterObservation.returnBreakpointId));
                bool deferredInstallation = raceDeferred||finalDeferred||parentDeferred||o.observationActivation != null && Array.IndexOf(o.observationActivation.observationBreakpointIds, b.id) >= 0;
                if(raceDeferred)emit(Record("type","breakpoint-installation-deferred","id",b.id,"address",Hex(b.resolved),"originalBytesHex",BytesHex(raceCode),"activationBreakpointId",o.raceClockObservation.entryBreakpointId,"activationSelection","selected-owned-warm-clock-entry","capability",RaceClockCapability,"codeModified",false));
                else if(finalDeferred)emit(Record("type","breakpoint-installation-deferred","id",b.id,"address",Hex(b.resolved),"originalBytesHex",b.original.ToString("x2"),"activationBreakpointId",o.parentRttiObservation.parentBreakpointId,"activationSelection","selected-owned-parent-entry","capability",ParentFinalTickCapability,"codeModified",false));
                else if (deferredInstallation) emit(parentDeferred?Record("type","breakpoint-installation-deferred","id",b.id,"address",Hex(b.resolved),"originalBytesHex",b.original.ToString("x2"),"activationBreakpointId",o.parentRttiObservation.beginBreakpointId,"activationSelection","selected-owned-parent-auxiliary","capability",ParentRttiCapability,"codeModified",false):Record("type", "breakpoint-installation-deferred", "id", b.id, "address", Hex(b.resolved), "originalBytesHex", b.original.ToString("x2"), "activationBreakpointId", o.observationActivation.breakpointId, "activationRawHit", o.observationActivation.rawHit, "codeModified", false));
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
                  if(capture&&o.raceClockObservation!=null&&hit.id.StartsWith("native-race-clock-",StringComparison.Ordinal)){WriteRaceClockObservation(o,raceClock,child,threads[tid],mainBase,hit,tid,context,regs,events,elapsed.ElapsedMilliseconds,breakpoints,ref snapshots,emit);capture=false;}
                  Dictionary<string, object> predicateEvidence = null;
                  Dictionary<string,object> parentRttiAdmission=null,parentRttiMap=null,parentRttiClosed=null,parentRttiGraphProof=null,parentCounterAdmission=null,parentFinalAdmission=null;ParentRttiMapGraphRead parentRttiGraph=null;ParentRttiEndpointRead parentRttiEndpoint=null;ParentWeatherCounterRead parentCounterEndpoint=null;
                  bool parentFinalSite=o.parentRttiObservation!=null&&o.parentRttiObservation.finalTick!=null&&hit.id==o.parentRttiObservation.finalTick.returnBreakpointId;
                  bool parentRttiSite=o.parentRttiObservation!=null&&(hit.id==o.parentRttiObservation.callBreakpointId||hit.id==o.parentRttiObservation.returnBreakpointId);
                  bool parentCounterSite=o.parentRttiObservation!=null&&o.parentRttiObservation.weatherCounterObservation!=null&&(hit.id==o.parentRttiObservation.weatherCounterObservation.callBreakpointId||hit.id==o.parentRttiObservation.weatherCounterObservation.returnBreakpointId);
                  if(capture&&o.parentRttiObservation!=null&&hit.id.StartsWith("native-control-",StringComparison.Ordinal)&&tid!=child.tid){capture=false;emit(Record("type","parent-rtti-checkpoint-skipped","breakpointId",hit.id,"pid",child.pid,"tid",tid,"ownerMainTid",child.tid,"observedDebugEventOrdinal",events,"rawHit",hit.hits,"reason","different-owned-thread","matchingHitAdvanced",false,"snapshotCountAdvanced",false,"originalInstructionSkipped",false));}
                  if(capture&&parentFinalSite){parentFinalAdmission=AdmitParentFinalReturn(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit);capture=parentFinalAdmission!=null;}
                  if(capture&&parentRttiSite){parentRttiAdmission=AdmitParentRtti(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit,out parentRttiEndpoint);capture=parentRttiAdmission!=null;}
                  if(capture&&parentCounterSite){parentCounterAdmission=AdmitParentWeatherCounter(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit,out parentCounterEndpoint);capture=parentCounterAdmission!=null;}
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
                  if(capture&&parentFinalSite)parentRttiMap=PrepareParentRttiCheckpoint(o,parentRtti,child,mainBase,hit,tid,regs,events,snapshots+1,emit,out parentRttiClosed);
                  if(parentRttiMap!=null&&o.parentRttiObservation.viewportMapGraph!=null)parentRttiGraphProof=PrepareParentRttiMapGraph(o,parentRtti,child,hit,tid,events,snapshots+1,emit,out parentRttiGraph);
                  if (capture) {
                  int snapshotOrdinal = snapshots + 1;
                  List<object> ranges = new List<object>(); List<MemoryRange> selected = new List<MemoryRange>(o.ranges); selected.AddRange(hit.ranges);
                  ParentSoundBankOwnerGraph ownerGraphPolicy=o.parentRttiObservation==null?null:o.parentRttiObservation.soundBankOwnerGraph;
                  bool observeOwners=ownerGraphPolicy!=null&&Array.IndexOf(ownerGraphPolicy.breakpointIds,hit.id)>=0;
                  List<ParentSoundBankCapturedRange> ownerInputs=observeOwners?new List<ParentSoundBankCapturedRange>():null;ParentSoundBankOwnerRead ownerGraph=null;ParentFinalInputsRead finalInputs=null;
                  if(observeOwners)ValidateParentSoundBankOwnerCheckpoint(parentRtti,child.tid,tid,hit.id,events);
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
                    if(observeOwners)ownerInputs.Add(new ParentSoundBankCapturedRange{id=range.id,address=start,data=data,vector=vector,vectorHeaderAddress=vector==null?0:root});
                  }
                  if(observeOwners){
                    ownerGraph=ReadParentSoundBankOwners(ownerGraphPolicy,mainBase,ownerInputs,delegate(uint ownerAddress,int ownerLength){return Bytes(child.process,ownerAddress,ownerLength);},o.parentRttiObservation.finalTick!=null);
                    foreach(ParentSoundBankOwnerRange part in ownerGraph.owners){
                      string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);
                      ranges.Add(Record("id",part.id,"address",Hex(part.address),"length",part.data.Length,"file",file,"sha256",Digest(part.data),"source","parent-sound-bank-owner-graph","graphRole","owner","ownerIndex",part.index,"bankSlotIndices",part.slotIndices.ToArray()));
                    }
                    if(o.parentRttiObservation.finalTick!=null){parentRtti.finalTick.ValidateInputs(parentRtti,child.tid,tid,hit.id,events);finalInputs=ReadParentFinalInputs(o.parentRttiObservation.finalTick,mainBase,ownerInputs,ownerGraph,delegate(uint finalAddress,int finalLength){return Bytes(child.process,finalAddress,finalLength);});foreach(ParentFinalRange part in finalInputs.ranges){string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);ranges.Add(ParentFinalRangeMetadata(part,file));}}
                    if(ownerGraph.channelGraph!=null)foreach(ParentSoundChannelRange part in ownerGraph.channelGraph.ranges){
                      string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);
                      ranges.Add(ParentSoundChannelRangeMetadata(part,file));
                    }
                  }
                  if(parentRttiGraph!=null)foreach(ParentRttiMapGraphRange part in parentRttiGraph.ranges) {
                    string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";
                    using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);
                    Dictionary<string,object> row=Record("id",part.id,"address",Hex(part.address),"length",part.data.Length,"file",file,"sha256",Digest(part.data),"source","parent-rtti-viewport-map-graph","graphRole",part.role);
                    if(part.path!=null){row["graphNodeIndex"]=part.nodeIndex;row["graphPath"]=part.path;row["nodeAddress"]=Hex(part.nodeAddress);}ranges.Add(row);
                  }
                  if(parentRttiEndpoint!=null&&o.parentRttiObservation.weatherScreenQueries)foreach(ParentRttiObservedRange part in parentRttiEndpoint.ranges) {
                    string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);
                    ranges.Add(Record("id",part.id,"address",Hex(part.address),"length",part.data.Length,"file",file,"sha256",Digest(part.data),"source","parent-rtti-scoped-caller"));
                  }
                  if(parentCounterEndpoint!=null)foreach(ParentRttiObservedRange part in parentCounterEndpoint.ranges) {
                    string file="snapshot-"+snapshotOrdinal.ToString("D6")+"-range-"+(++rangeOrdinal).ToString("D3")+".bin";using(FileStream blob=new FileStream(Path.Combine(o.outputDirectory,file),FileMode.CreateNew))blob.Write(part.data,0,part.data.Length);
                    ranges.Add(Record("id",part.id,"address",Hex(part.address),"length",part.data.Length,"file",file,"sha256",Digest(part.data),"source","parent-weather-counter-observation"));
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
                  if(parentCounterAdmission!=null)snapshot["parentWeatherCounterObservation"]=parentCounterAdmission;
                  if(parentFinalAdmission!=null)snapshot["parentFinalReturn"]=parentFinalAdmission;
                  if(parentRttiMap!=null)snapshot["parentRttiMapPreflight"]=parentRttiMap;
                  if(parentRttiGraphProof!=null)snapshot["parentRttiViewportMapGraph"]=parentRttiGraphProof;
                  if(parentRttiClosed!=null)snapshot["parentRttiClosure"]=parentRttiClosed;
                  if(ownerGraph!=null){Dictionary<string,object> proof=ParentRttiProof(parentRtti,child,hit,tid,events,"parent-sound-bank-owners-observed");foreach(KeyValuePair<string,object> field in ParentSoundBankOwnerDetails(ownerGraph))proof.Add(field.Key,field.Value);proof["mainModuleBaseAddress"]=Hex(mainBase);proof["snapshotOrdinal"]=snapshotOrdinal;snapshot["parentSoundBankOwnerGraph"]=proof;emit(proof);}
                  if(finalInputs!=null){Dictionary<string,object> finalProof=ParentRttiProof(parentRtti,child,hit,tid,events,"parent-final-inputs-observed");foreach(KeyValuePair<string,object> field in ParentFinalInputsDetails(finalInputs))finalProof.Add(field.Key,field.Value);finalProof["mainModuleBaseAddress"]=Hex(mainBase);finalProof["snapshotOrdinal"]=snapshotOrdinal;snapshot["parentFinalInputs"]=finalProof;emit(finalProof);}
                  if(o.parentRttiObservation!=null&&o.parentRttiObservation.finalTick!=null&&hit.id==o.parentRttiObservation.parentBreakpointId)snapshot["parentFinalReturnActivation"]=ActivateParentFinalReturn(o,parentRtti,child,mainBase,hit,tid,events,snapshots,breakpoints,emit);
                  if(o.parentRttiObservation!=null&&hit.id==o.parentRttiObservation.beginBreakpointId)snapshot["parentRttiActivation"]=ActivateParentRtti(o,parentRtti,child,mainBase,hit,tid,events,snapshots,breakpoints,emit);
                  emit(snapshot);
                  if(ownerGraph!=null)CommitParentSoundBankOwners(parentRtti,ownerGraph,child.tid,tid,hit.id,events);
                  if(finalInputs!=null)parentRtti.finalTick.CommitInputs(parentRtti,finalInputs,child.tid,tid,hit.id,events);
                  if(parentFinalAdmission!=null)parentRtti.finalTick.CommitReturn(parentRtti);
                  if(parentRttiAdmission!=null)parentRtti.CommitEndpoint(hit.id==o.parentRttiObservation.callBreakpointId);
                  if(parentCounterAdmission!=null)parentRtti.counter.Commit(hit.id==o.parentRttiObservation.weatherCounterObservation.callBreakpointId);
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
          if(o.raceClockObservation!=null)raceClock.RequireComplete(snapshots);
          if(o.parentRttiObservation!=null)parentRtti.RequireComplete(snapshots);
          if(o.parentRttiObservation!=null&&o.parentRttiObservation.viewportMapGraph!=null&&parentRtti.graphChecks!=(o.parentRttiObservation.finalTick==null?3:4))throw new InvalidDataException("Parent RTTI opt-in graph lacks all three actual checkpoint observations.");
          if(o.parentRttiObservation!=null&&o.parentRttiObservation.soundBankOwnerGraph!=null&&parentRtti.soundOwnerChecks!=(o.parentRttiObservation.finalTick==null?10:11))throw new InvalidDataException("Sound owner graph lacks all ten completed original parent checkpoint observations.");
          if(o.parentRttiObservation!=null&&o.parentRttiObservation.soundBankOwnerGraph!=null&&o.parentRttiObservation.soundBankOwnerGraph.channelGraph!=null&&parentRtti.soundChannelChecks!=(o.parentRttiObservation.finalTick==null?10:11))throw new InvalidDataException("Sound channel graph lacks all ten completed original parent checkpoint observations.");
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
          if(parentRtti.counter!=null){Dictionary<string,object> summary=(Dictionary<string,object>)completion["parentRttiObservation"];summary["counterPairs"]=parentRtti.counter.pairs;summary["counterSnapshots"]=parentRtti.counter.captured;}
          if(o.parentRttiObservation!=null&&o.parentRttiObservation.soundBankOwnerGraph!=null)completion["soundBankOwnerGraph"]=Record("checkpoints",parentRtti.soundOwnerChecks,"ownerRows",parentRtti.soundOwnerRows,"ownerBytes",parentRtti.soundOwnerBytes);
          if(o.parentRttiObservation!=null&&o.parentRttiObservation.soundBankOwnerGraph!=null&&o.parentRttiObservation.soundBankOwnerGraph.channelGraph!=null)((Dictionary<string,object>)completion["soundBankOwnerGraph"])["channelGraph"]=Record("checkpoints",parentRtti.soundChannelChecks,"usedChannelSlots",parentRtti.soundChannelSlots,"storageRows",parentRtti.soundChannelStorages,"wrapperRows",parentRtti.soundChannelWrappers,"sourceRows",parentRtti.soundChannelSources,"vtableRows",parentRtti.soundChannelVtables,"additionalBytes",parentRtti.soundChannelBytes);
          if(parentRtti.finalTick!=null){ParentFinalProgress final=parentRtti.finalTick;completion["parentFinalTick"]=Record("completed",final.complete,"returnSnapshots",final.complete?1:0,"returnSnapshotOrdinal",final.returnSnapshotOrdinal,"returnDebugEventOrdinal",final.returnDebugOrdinal,"returnValue",final.result,"activationDebugEventOrdinal",final.activationDebugOrdinal,"inputs",Record("checkpoints",final.inputChecks,"lightBandBytes",final.lightBandBytes,"listenerWrappers",final.listenerCount,"listenerBytes",final.listenerBytes,"managerObservations",final.managerObservations,"additionalBytes",final.inputBytes));}
          if(o.raceClockObservation!=null)completion["raceClockObservation"]=RaceClockCompletion(raceClock);
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
