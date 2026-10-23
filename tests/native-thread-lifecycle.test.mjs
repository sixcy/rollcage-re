import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

//These are native kernel threads created in this isolated PowerShell test host.
//No debugger target, game, GUI, .NET callback, runtime thread or foreign thread
//is opened/suspended/terminated. ExitThread is the real native start routine.
const fixture = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using RollcageCapture;
public static class OwnedNativeThreadFixture {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi, SetLastError=true)] static extern IntPtr GetProcAddress(IntPtr module, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateThread(IntPtr attributes, UIntPtr stackSize, IntPtr entry, IntPtr argument, uint flags, out uint tid);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  static void Need(bool value, string message) {if(!value)throw new Exception(message);}
  static IntPtr NewThread(IntPtr entry, uint flags, out uint tid) {
    IntPtr handle=CreateThread(IntPtr.Zero, UIntPtr.Zero, entry, new IntPtr(259), flags, out tid);
    if(handle==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());return handle;
  }
  static IntPtr RestrictedOwnHandle(IntPtr thread) {
    IntPtr duplicate,process=GetCurrentProcess();
    //SYNCHRONIZE|THREAD_QUERY_LIMITED_INFORMATION: never suspend rights.
    if(!DuplicateHandle(process,thread,process,out duplicate,0x100800,false,0))throw new Win32Exception(Marshal.GetLastWin32Error());return duplicate;
  }
  public static object Run() {
    IntPtr module=GetModuleHandle("kernel32.dll"),entry=GetProcAddress(module,"ExitThread");
    Need(entry!=IntPtr.Zero,"Missing native ExitThread routine.");
    uint pid=(uint)Process.GetCurrentProcess().Id,tid,previous;
    List<IntPtr> owned=new List<IntPtr>(), restricted=new List<IntPtr>();
    List<Dictionary<string,object>> deadLog=new List<Dictionary<string,object>>(),liveLog=new List<Dictionary<string,object>>(),invalidLog=new List<Dictionary<string,object>>();
    try {
      IntPtr dead=NewThread(entry,0,out tid);owned.Add(dead);
      Need(WaitForSingleObject(dead,5000)==0,"Owned native thread did not finish.");
      ThreadTerminationObservation deadState=NativeDebugger.ObserveOwnedThreadTermination(dead);
      IntPtr deadProbe=RestrictedOwnHandle(dead);restricted.Add(deadProbe);
      bool deadSuspend=NativeDebugger.ChangeTrackedThreadSuspension(deadProbe,pid,tid,false,"fixture-dead-suspend",deadLog.Add,out previous);
      bool deadResume=NativeDebugger.ChangeTrackedThreadSuspension(deadProbe,pid,tid,true,"fixture-dead-resume",deadLog.Add,out previous);
      Need(!deadSuspend&&!deadResume,"A failed operation on the proven dead thread must be skipped.");

      IntPtr live=NewThread(entry,4,out tid);owned.Add(live);
      ThreadTerminationObservation liveState=NativeDebugger.ObserveOwnedThreadTermination(live);
      //Restricted duplicate of the exact native handle just created. Failure5
      //must remain fatal while the owned object is still unsignaled.
      IntPtr readOnly=RestrictedOwnHandle(live);restricted.Add(readOnly);
      int denied=0,deniedResume=0;
      try {NativeDebugger.ChangeTrackedThreadSuspension(readOnly,pid,tid,false,"fixture-live-denied",liveLog.Add,out previous);throw new Exception("Live access denial was admitted.");}
      catch(Win32Exception error){denied=error.NativeErrorCode;}
      try {NativeDebugger.ChangeTrackedThreadSuspension(readOnly,pid,tid,true,"fixture-live-resume-denied",liveLog.Add,out previous);throw new Exception("Live resume access denial was admitted.");}
      catch(Win32Exception error){deniedResume=error.NativeErrorCode;}
      List<uint> counts=new List<uint>();
      Need(NativeDebugger.ChangeTrackedThreadSuspension(live,pid,tid,false,"fixture-first-increment",liveLog.Add,out previous),"First live suspend skipped.");counts.Add(previous);
      Need(NativeDebugger.ChangeTrackedThreadSuspension(live,pid,tid,false,"fixture-second-increment",liveLog.Add,out previous),"Second live suspend skipped.");counts.Add(previous);
      Need(NativeDebugger.ChangeTrackedThreadSuspension(live,pid,tid,true,"fixture-first-restore",liveLog.Add,out previous),"First own restore skipped.");counts.Add(previous);
      Need(NativeDebugger.ChangeTrackedThreadSuspension(live,pid,tid,true,"fixture-second-restore",liveLog.Add,out previous),"Second own restore skipped.");counts.Add(previous);
      uint stillSuspended=WaitForSingleObject(live,0);
      Need(stillSuspended==0x102,"Restoring our increments released the fixture's original suspension.");
      Need(ResumeThread(live)==1,"Fixture original suspend count changed.");
      Need(WaitForSingleObject(live,5000)==0,"Restored native thread failed to exit normally.");

      int invalid=0;
      try {NativeDebugger.ChangeTrackedThreadSuspension(IntPtr.Zero,pid,0,false,"fixture-invalid-handle",invalidLog.Add,out previous);throw new Exception("Invalid handle was admitted.");}
      catch(Win32Exception error){invalid=error.NativeErrorCode;}
      return new {pid,deadState,deadSuspend,deadResume,deadLog,liveState,denied,deniedResume,counts,stillSuspended,liveLog,invalid,invalidLog};
    } finally {
      foreach(IntPtr handle in restricted)CloseHandle(handle);
      foreach(IntPtr handle in owned) {
        //Only our CreateThread handles: restore any fixture-owned counts if an
        //assertion failed. No TerminateThread and no process-wide enumeration.
        for(int i=0;i<16;i++){uint count=ResumeThread(handle);if(count==0||count==UInt32.MaxValue)break;}
        WaitForSingleObject(handle,5000);CloseHandle(handle);
      }
    }
  }
}`;

test('actual owned native threads distinguish signaled exit259, live access denial and invalid handles', {skip: process.platform !== 'win32'}, async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-owned-thread-'));
  try {
    const helper = fileURLToPath(new URL('../tools/lib/native-physics-debugger.cs', import.meta.url));
    const script = path.join(temporary, 'owned-threads.ps1'), fixtureFile = path.join(temporary, 'owned-threads.cs');
    await writeFile(fixtureFile, fixture, {flag: 'wx'});
    await writeFile(script, `$ErrorActionPreference = 'Stop'\nAdd-Type -Path @('${helper.replaceAll("'", "''")}','${fixtureFile.replaceAll("'", "''")}')\n[OwnedNativeThreadFixture]::Run() | ConvertTo-Json -Depth 8 -Compress\n`, {flag: 'wx'});
    const child = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024});
    assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stdout + child.stderr);
    const result = JSON.parse(child.stdout.trim());
    await t.test('exit259 is admitted solely by zero-time signaled wait and retains operation diagnostics', () => {
      assert.equal(result.deadState.terminated, true); assert.equal(result.deadState.waitResult, 0);
      assert.equal(result.deadState.exitCodeAvailable, true); assert.equal(result.deadState.exitCode, 259);
      assert.equal(result.deadSuspend, false); assert.equal(result.deadResume, false); assert.equal(result.deadLog.length, 2);
      for (const row of result.deadLog) {
        assert.equal(row.pid, result.pid); assert.ok(row.tid > 0); assert.equal(row.waitMilliseconds, 0);
        assert.equal(row.waitResult, '0x00000000'); assert.equal(row.terminated, true);
        assert.equal(row.exitCode, '0x00000103'); assert.equal(row.proof, 'zero-time-wait-object-signaled');
        assert.equal(row.disposition, 'terminated-handle-retained-until-exit-event'); assert.equal(row.win32Error, 5);
      }
    });
    await t.test('live exitcode259 is rejected on access denial and own suspend increments restore exactly', () => {
      assert.equal(result.liveState.terminated, false); assert.equal(result.liveState.waitResult, 0x102);
      assert.equal(result.liveState.exitCodeAvailable, true); assert.equal(result.liveState.exitCode, 259);
      assert.equal(result.denied, 5); assert.equal(result.deniedResume, 5);
      assert.deepEqual(result.counts, [1, 2, 3, 2]); assert.equal(result.stillSuspended, 0x102);
      assert.equal(result.liveLog.length, 2);
      assert.deepEqual(result.liveLog.map(row => row.resume), [false, true]);
      for (const row of result.liveLog) {
        assert.equal(row.terminated, false); assert.equal(row.waitResult, '0x00000102');
        assert.equal(row.win32Error, 5); assert.equal(row.disposition, 'unproven-failure');
      }
    });
    await t.test('invalid handle cannot become termination proof', () => {
      assert.equal(result.invalid, 6); assert.equal(result.invalidLog.length, 1);
      const row = result.invalidLog[0]; assert.equal(row.terminated, false);
      assert.equal(row.waitResult, '0xffffffff'); assert.equal(row.waitWin32Error, 6);
      assert.equal(row.exitCodeAvailable, false); assert.equal(row.disposition, 'unproven-failure');
    });
  } finally {await rm(temporary, {recursive: true, force: true});}
});
