//Independent read-only Windows input availability probe. No game/debugger,
//device acquisition, cooperative level, input injection or device changes.
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const reduxSha256 = 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => `'${value.replaceAll("'", "''")}'`;
const windowsArgument = value => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;

const launcherSource = String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class OwnedInputProbeLauncher {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
    public uint cb;public string reserved,desktop,title;public uint x,y,xSize,ySize,xChars,yChars,fill,flags;public ushort show,reservedBytes;public IntPtr reservedData,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public uint pid,tid;}
  [DllImport("kernel32.dll",EntryPoint="CreateProcessW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr handle,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint tid);
  [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder output,uint bytes,out uint required);
  static string ObjectName(IntPtr handle) {uint required;StringBuilder name=new StringBuilder(4096);if(handle==IntPtr.Zero||!GetUserObjectInformation(handle,2,name,8192,out required))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return name.ToString();}
  public static object Run(string application,string command,string desktop,string directory) {
    string callerDesktop=ObjectName(GetThreadDesktop(GetCurrentThreadId())),callerStation=ObjectName(GetProcessWindowStation());
    if(desktop=="__current__"){if(callerStation!="WinSta0")throw new Exception("Current profile requires observed WinSta0.");desktop=callerStation+"\\"+callerDesktop;}
    Startup startup=new Startup();startup.cb=(uint)Marshal.SizeOf(typeof(Startup));startup.desktop=desktop;startup.flags=1;startup.show=0;
    ProcessInfo child;
    if(!CreateProcess(application,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x08000000,IntPtr.Zero,directory,ref startup,out child))return new {launched=false,callerDesktop,callerStation,desktopRequested=desktop,error=Marshal.GetLastWin32Error()};
    try {
      uint waited=WaitForSingleObject(child.process,15000);bool terminated=false;
      if(waited!=0){terminated=TerminateProcess(child.process,1);if(terminated)WaitForSingleObject(child.process,5000);}
      uint code;bool codeAvailable=GetExitCodeProcess(child.process,out code);
      return new {launched=true,callerDesktop,callerStation,desktopRequested=desktop,pid=child.pid,tid=child.tid,creationFlags="CREATE_NO_WINDOW",showWindow="SW_HIDE",waitResult=waited,terminatedByBound=terminated,exitCodeAvailable=codeAvailable,exitCode=code,complete=waited==0&&codeAvailable&&code==0};
    } finally {CloseHandle(child.thread);CloseHandle(child.process);}
  }
}`;

const nativeSource = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class OwnedInputEnvironmentProbe {
  [StructLayout(LayoutKind.Sequential)] struct RawDevice {public IntPtr handle; public uint type;}
  [DllImport("user32.dll",SetLastError=true)] static extern uint GetRawInputDeviceList(IntPtr list,ref uint count,uint size);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int metric);
  [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint threadId);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetUserObjectInformation(IntPtr handle,int index,IntPtr output,uint length,out uint required);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetModuleFileName(IntPtr module,StringBuilder output,int capacity);
  [DllImport("dinput8.dll",CallingConvention=CallingConvention.StdCall)] static extern int DirectInput8Create(IntPtr instance,uint version,ref Guid iid,out IntPtr output,IntPtr outer);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumCallback(IntPtr instance,IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumDevicesCall(IntPtr self,uint type,EnumCallback callback,IntPtr context,uint flags);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateDeviceCall(IntPtr self,ref Guid guid,out IntPtr output,IntPtr outer);
  static string Hr(int value) {return "0x"+unchecked((uint)value).ToString("x8");}
  static byte[] Hex(string value) {if(value.Length!=32)throw new Exception("Expected16 target GUID bytes.");byte[] bytes=new byte[16];for(int i=0;i<16;i++)bytes[i]=Convert.ToByte(value.Substring(i*2,2),16);return bytes;}
  static string ObjectName(IntPtr handle) {
    if(handle==IntPtr.Zero)return null;uint bytes;
    GetUserObjectInformation(handle,2,IntPtr.Zero,0,out bytes);
    if(bytes<2||bytes>8192)throw new Exception("Unexpected user-object name bound.");
    IntPtr buffer=Marshal.AllocHGlobal((int)bytes);
    try {if(!GetUserObjectInformation(handle,2,buffer,bytes,out bytes))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return Marshal.PtrToStringUni(buffer);}
    finally {Marshal.FreeHGlobal(buffer);}
  }
  static object RawDevices() {
    uint size=(uint)Marshal.SizeOf(typeof(RawDevice)),requested=0;int lastError=0;
    for(int attempt=1;attempt<=3;attempt++) {
      uint count=0,query=GetRawInputDeviceList(IntPtr.Zero,ref count,size);
      if(query==UInt32.MaxValue)return new {available=false,error=Marshal.GetLastWin32Error(),attempts=attempt,structureBytes=size};
      requested=count;if(count>4096)throw new Exception("RawInput device count exceeds4096 bound.");
      if(count==0)return new {available=true,attempts=attempt,structureBytes=size,total=0,mouse=0,keyboard=0,hid=0,other=0};
      IntPtr buffer=Marshal.AllocHGlobal(checked((int)(count*size)));
      try {
        uint actual=GetRawInputDeviceList(buffer,ref count,size);
        if(actual==UInt32.MaxValue){lastError=Marshal.GetLastWin32Error();if(lastError==122)continue;return new {available=false,error=lastError,attempts=attempt,structureBytes=size};}
        if(actual>requested)throw new Exception("RawInput returned more entries than allocated.");
        int mouse=0,keyboard=0,hid=0,other=0;
        for(uint i=0;i<actual;i++){uint type=unchecked((uint)Marshal.ReadInt32(buffer,checked((int)(i*size)+IntPtr.Size)));if(type==0)mouse++;else if(type==1)keyboard++;else if(type==2)hid++;else other++;}
        return new {available=true,attempts=attempt,structureBytes=size,total=actual,mouse,keyboard,hid,other};
      } finally {Marshal.FreeHGlobal(buffer);}
    }
    return new {available=false,error=lastError,attempts=3,structureBytes=size};
  }
  static object Enumerate(IntPtr owner,uint deviceClass,string name) {
    int count=0;bool stopped=false,badStructure=false;Dictionary<string,int> types=new Dictionary<string,int>();
    EnumCallback callback=delegate(IntPtr instance,IntPtr context) {
      if(instance==IntPtr.Zero||unchecked((uint)Marshal.ReadInt32(instance))<40){badStructure=true;return 0;}
      if(count>=4096){stopped=true;return 0;}
      uint type=unchecked((uint)Marshal.ReadInt32(instance,36));string key="0x"+type.ToString("x8");
      if(!types.ContainsKey(key))types[key]=0;types[key]++;count++;return 1;
    };
    IntPtr target=Marshal.ReadIntPtr(Marshal.ReadIntPtr(owner),4*IntPtr.Size);
    EnumDevicesCall enumerate=(EnumDevicesCall)Marshal.GetDelegateForFunctionPointer(target,typeof(EnumDevicesCall));
    int hr=enumerate(owner,deviceClass,callback,IntPtr.Zero,1);GC.KeepAlive(callback);
    return new {name,deviceClass,flags=1,hresultHex=Hr(hr),count,types,boundReached=stopped,badStructure,complete=hr>=0&&!stopped&&!badStructure};
  }
  static object CreateDevice(IntPtr owner,string name,string guidHex) {
    Guid guid=new Guid(Hex(guidHex));IntPtr device=IntPtr.Zero;
    IntPtr target=Marshal.ReadIntPtr(Marshal.ReadIntPtr(owner),3*IntPtr.Size);
    CreateDeviceCall create=(CreateDeviceCall)Marshal.GetDelegateForFunctionPointer(target,typeof(CreateDeviceCall));
    int hr=create(owner,ref guid,out device,IntPtr.Zero);bool outputNonNull=device!=IntPtr.Zero;
    int? released=null;
    if(device!=IntPtr.Zero&&hr>=0){released=Marshal.Release(device);device=IntPtr.Zero;}
    return new {name,guidHex,hresultHex=Hr(hr),outputNonNull,acquired=false,cooperativeLevelSet=false,releaseRemainingReferences=released};
  }
  static object DirectInput(string iidHex,string mouseGuidHex,string keyboardGuidHex) {
    Guid iid=new Guid(Hex(iidHex));IntPtr owner=IntPtr.Zero;
    int hr=DirectInput8Create(GetModuleHandle(null),0x800,ref iid,out owner,IntPtr.Zero);
    StringBuilder module=new StringBuilder(32768);IntPtr dll=GetModuleHandle("dinput8.dll");
    if(dll!=IntPtr.Zero&&GetModuleFileName(dll,module,module.Capacity)==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    Dictionary<string,object> result=new Dictionary<string,object>();
    result["createHresultHex"]=Hr(hr);result["ownerNonNull"]=owner!=IntPtr.Zero;result["iidHex"]=iidHex;result["iidText"]=iid.ToString();result["version"]=0x800;result["modulePath"]=module.ToString();
    if(owner==IntPtr.Zero||hr<0){result["complete"]=false;return result;}
    try {
      result["enumerations"]=new object[]{Enumerate(owner,0,"all-attached"),Enumerate(owner,2,"pointers-attached"),Enumerate(owner,3,"keyboards-attached"),Enumerate(owner,4,"game-controllers-attached")};
      result["devices"]=new object[]{CreateDevice(owner,"system-mouse",mouseGuidHex),CreateDevice(owner,"system-keyboard",keyboardGuidHex)};
      result["complete"]=true;
    } finally {result["releaseRemainingReferences"]=Marshal.Release(owner);}
    return result;
  }
  public static object Run(string iidHex,string mouseGuidHex,string keyboardGuidHex) {
    if(IntPtr.Size!=4)throw new Exception("Probe requires an owned32-bit host to match the target ABI.");
    return new {timestampUtc=DateTime.UtcNow.ToString("o"),processId=Process.GetCurrentProcess().Id,pointerBytes=IntPtr.Size,
      host=new {sessionId=Process.GetCurrentProcess().SessionId,activeConsoleSessionId=WTSGetActiveConsoleSessionId(),windowStation=ObjectName(GetProcessWindowStation()),desktop=ObjectName(GetThreadDesktop(GetCurrentThreadId())),remoteSession=GetSystemMetrics(0x1000),remoteControl=GetSystemMetrics(0x2001),mousePresent=GetSystemMetrics(19),mouseButtons=GetSystemMetrics(43),mouseWheel=GetSystemMetrics(75),mouseHorizontalWheel=GetSystemMetrics(91)},
      rawInput=RawDevices(),directInput=DirectInput(iidHex,mouseGuidHex,keyboardGuidHex)};
  }
}`;

function targetGuidBytes(bytes) {
  if (digest(bytes) !== reduxSha256) throw Error('Expected the verified Redux1.3.8.0 target.');
  const pe = bytes.readUInt32LE(60), optional = pe + 24, base = bytes.readUInt32LE(optional + 28), sectionTable = optional + bytes.readUInt16LE(pe + 20);
  const at = address => {
    const rva = address - base, matches = [];
    for (let index = 0; index < bytes.readUInt16LE(pe + 6); index++) {
      const row = sectionTable + index * 40, start = bytes.readUInt32LE(row + 12), length = bytes.readUInt32LE(row + 16), raw = bytes.readUInt32LE(row + 20);
      if (rva >= start && rva + 16 <= start + length) matches.push(bytes.subarray(raw + rva - start, raw + rva - start + 16));
    }
    if (matches.length !== 1 || matches[0].length !== 16) throw Error('Target GUID has no unique complete mapped bytes.');
    return matches[0].toString('hex');
  };
  return {iidHex: at(0x56f828), mouseGuidHex: at(0x56f788), keyboardGuidHex: at(0x56f778)};
}

export async function probeNativeInputEnvironment(output, executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe', desktop = 'inherited') {
  if (process.platform !== 'win32') throw Error('This probe requires Windows.');
  if (!['inherited', 'current', 'default', 'compare'].includes(desktop)) throw Error('Probe desktop must be inherited, current, default or compare.');
  const settings = targetGuidBytes(await readFile(executable));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'rollcage-input-env-'));
  const observations = [];
  try {
    const sourceFile = path.join(temporary, 'input-environment.cs'), launcherFile = path.join(temporary, 'launcher.cs'), settingsFile = path.join(temporary, 'settings.json'), script = path.join(temporary, 'probe.ps1');
    await writeFile(sourceFile, nativeSource); await writeFile(settingsFile, JSON.stringify(settings));
    await writeFile(launcherFile, launcherSource);
    await writeFile(script, `param([string]$ResultFile)\n$ErrorActionPreference='Stop'\nAdd-Type -Path ${quote(sourceFile)}\n$probeSettings=Get-Content -Raw -LiteralPath ${quote(settingsFile)} | ConvertFrom-Json\n$probeJson=[OwnedInputEnvironmentProbe]::Run($probeSettings.iidHex,$probeSettings.mouseGuidHex,$probeSettings.keyboardGuidHex) | ConvertTo-Json -Compress -Depth 12\n[IO.File]::WriteAllText($ResultFile,$probeJson,[Text.UTF8Encoding]::new($false))\n`);
    const host = path.join(process.env.WINDIR ?? 'C:/Windows', 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe');
    for (const profile of desktop === 'compare' ? ['inherited', 'current', 'default'] : [desktop]) {
      const resultFile = path.join(temporary, `${profile}-observation.json`), launcherScript = path.join(temporary, `${profile}-launcher.ps1`);
      const command = [host, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ResultFile', resultFile].map(windowsArgument).join(' ');
      const requested = profile === 'default' ? 'WinSta0\\Default' : profile === 'current' ? '__current__' : null;
      await writeFile(launcherScript, `$ErrorActionPreference='Stop'\nAdd-Type -Path ${quote(launcherFile)}\n[OwnedInputProbeLauncher]::Run(${quote(host)},${quote(command)},${requested ? quote(requested) : '$null'},${quote(temporary)}) | ConvertTo-Json -Compress -Depth 8\n`);
      const child = spawnSync(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherScript], {windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024});
      if (child.error) throw child.error;
      if (child.status !== 0) throw Error(`Independent input launcher failed: ${child.stderr || child.stdout}`);
      const launch = JSON.parse(child.stdout.trim());
      if (!launch.complete) {observations.push({profile, launch, observation: null}); continue;}
      const observation = JSON.parse(await readFile(resultFile, 'utf8'));
      if (observation.pointerBytes !== 4 || observation.directInput.iidHex !== settings.iidHex || observation.processId !== launch.pid) throw Error('Independent probe architecture, actual owned PID or original IID differs.');
      if (profile === 'default' && (observation.host.windowStation !== 'WinSta0' || observation.host.desktop !== 'Default')) throw Error('Explicit Default child did not reach its requested desktop.');
      if (profile === 'current' && (observation.host.windowStation !== launch.callerStation || observation.host.desktop !== launch.callerDesktop)) throw Error('Explicit current-desktop child did not reach its requested desktop.');
      observations.push({profile, launch, observation});
    }
  } finally {
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('rollcage-input-env-')) throw Error('Refusing unexpected probe temporary path.');
    await rm(resolved, {recursive: true, force: true});
  }
  const report = {schemaVersion: 1, authority: 'independent-owned-x86-host-input-availability-probe', target: {path: path.resolve(executable), sha256: reduxSha256},
    method: 'Separate unhooked32-bit PowerShell/C# process. Hash-verified original IID/GUID bytes; Win32 session/mouse metrics and RawInput type counts; native DirectInput8Create, attached-only EnumDevices and system CreateDevice. Successful owned COM interfaces released. No names, identifiers or device handles retained.',
    guidSources: [{name: 'IID_IDirectInput8W', address: '0x56f828', bytesHex: settings.iidHex}, {name: 'GUID_SysMouse', address: '0x56f788', bytesHex: settings.mouseGuidHex}, {name: 'GUID_SysKeyboard', address: '0x56f778', bytesHex: settings.keyboardGuidHex}],
    helperSourceSha256: digest(Buffer.from(nativeSource)), launcherSourceSha256: digest(Buffer.from(launcherSource)),
    desktopPolicy: 'Owned child only; unspecified launch desktop, explicit observed caller-thread desktop, or WinSta0\\Default, all with CREATE_NO_WINDOW/SW_HIDE. Actual child station/desktop verified. No SwitchDesktop, SetThreadDesktop, activation or global desktop/sandbox setting changes.',
    ...(observations.length === 1 ? observations[0] : {observations}),
    limits: ['No game or debugger was launched. No Acquire, SetCooperativeLevel, SetDataFormat, polling, input injection, RawInput registration, device/driver/registry/settings changes or window activation was performed.',
      'The helper HINSTANCE is its own PowerShell process, not Redux. These observations do not establish original acquisition/polling behavior or retrospectively recover a missing prior-process HRESULT.',
      'RawInput enumeration omits RDP-accessed devices according to Microsoft; absence is not proof of physically disconnected hardware. Session metrics do not identify every possible remote/virtual forwarding path.',
      'Current host/device state can change after this one observation. An independent matching failure supports a host-availability limitation; it does not prove that all capture policies are irrelevant.'],
    references: ['https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getrawinputdevicelist', 'https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputdevicelist',
      'https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee416756(v=vs.85)', 'https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee417804(v=vs.85)', 'https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee417803(v=vs.85)']};
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, executable, desktop] = process.argv.slice(2);
  if (!output || process.argv.length > 5) throw Error('Usage: node tools/probe-native-input-environment.mjs NEW_REPORT_JSON [REDUX_EXE] [inherited|current|default|compare]');
  const report = await probeNativeInputEnvironment(output, executable, desktop);
  console.log(JSON.stringify({output, ...(report.observations ? {observations: report.observations} : {launch: report.launch, observation: report.observation})}));
}
