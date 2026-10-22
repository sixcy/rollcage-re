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
    public string offset = "0";
    public int length;
    public bool readableRegion;
    public int maxRegionBytes;
  }
  public sealed class MemoryRegionInfo {
    public ulong baseAddress, allocationBaseAddress, regionSize;
    public uint allocationProtection, state, protection, type;
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
    public int maxPendingBytes, maxCandidateFrames, maxEventSnapshots;
    public int eventStackOffset, eventRecordBytes;
    public string eventReturnRva, eventPointerRegister;
    public MemoryRange eventPoolRoot, eventPoolCapacity;
  }
  // Pure state checks are shared by runtime capture and configuration/ABI tests.
  public sealed class PendingFrameProgress {
    public bool active;
    public int candidateIndex, frameMatchingHit, observedEventHits, qualifyingEventSnapshots;
    public uint frameTid, frameEntryEsp, frameReturnAddress;
    public long bufferedBytes;
    public void Begin(PendingFrameObserver policy, uint tid, uint esp, uint caller, int matchingHit) {
      if (active) throw new InvalidDataException("Nested pending-frame entry.");
      if (candidateIndex >= policy.maxCandidateFrames) throw new InvalidDataException("Pending-frame candidate bound exceeded.");
      active = true; candidateIndex++; frameTid = tid; frameEntryEsp = esp; frameReturnAddress = caller;
      frameMatchingHit = matchingHit; observedEventHits = 0; qualifyingEventSnapshots = 0; bufferedBytes = 0;
    }
    public void Reserve(PendingFrameObserver policy, long bytes) {
      if (!active || bytes < 0 || bytes > policy.maxPendingBytes - bufferedBytes) throw new InvalidDataException("Pending-frame host-buffer byte bound exceeded.");
      bufferedBytes += bytes;
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
  }
  public static class NativeDebugger {
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
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("user32.dll", EntryPoint = "GetForegroundWindow")] static extern IntPtr ReadForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

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
      Dictionary<string, object> details = Record("id", range.id, "stage", stage, "rootAddress", range.address, "rootRva", range.rva, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "rangeMode", range.readableRegion ? "readable-region" : "fixed-length", "declaredLength", range.length, "maxRegionBytes", range.maxRegionBytes, "requestedResolvedRoot", root.HasValue ? Hex(root.Value) : null, "readAddress", start.HasValue ? Hex(start.Value) : null, "readLength", length, "region", RegionDiagnostic(region));
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
    static MemoryRegionInfo QueryCaptureRange(IntPtr process, uint root, MemoryRange range) {
      try {return QueryReadableRegion(process, root, range.maxRegionBytes);}
      catch (Exception error) {throw new RangeCaptureException(BuildRangeFailureDetails(range, "query-readable-region", root, null, null, null, error), error);}
    }
    static byte[] ReadCaptureRangeBytes(IntPtr process, MemoryRange range, uint root, uint start, int length, MemoryRegionInfo region) {
      try {return Bytes(process, start, length);}
      catch (Exception error) {throw new RangeCaptureException(BuildRangeFailureDetails(range, "read-bytes", root, start, length, region, error), error);}
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
      if (o.foregroundWindowSource != null && (o.foregroundWindowSource.length != 4 || o.foregroundWindowSource.readableRegion || o.foregroundWindowSource.maxRegionBytes != 0)) throw new InvalidDataException("foregroundWindowSource length must be exactly four bytes in fixed-length mode.");
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
          if (predicate == null || predicate.readableRegion || predicate.maxRegionBytes != 0 || predicate.length < 1 || predicate.length > 64) throw new InvalidDataException("captureWhen requires a fixed-length range of one to 64 bytes.");
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
          if (source == null || source.length != 4 || source.readableRegion || source.maxRegionBytes != 0) throw new InvalidDataException("Pending-frame event pool sources must be fixed four-byte ranges.");
          ranges.Add(source);
        }
        Breakpoint before = null, after = null, eventPoint = null;
        foreach (Breakpoint b in o.breakpoints) {if (b.id == observer.beforeBreakpointId) before = b; if (b.id == observer.afterBreakpointId) after = b; if (b.id == observer.eventBreakpointId) eventPoint = b;}
        if (before.stopAfterHits != 0 || eventPoint.stopAfterHits != 0 || after.stopAfterHits != 1 || before.skipMatchingHits.GetValueOrDefault() != after.skipMatchingHits.GetValueOrDefault()) throw new InvalidDataException("Pending-frame entry/event cannot stop independently; after must stop at one committed frame and entry/after skip windows must agree.");
      }
      foreach (MemoryRange r in ranges) {
        if (o.captureThreadEnvironment && r.id == "thread-seh-head") throw new InvalidDataException("thread-seh-head is reserved for captured thread environment bytes.");
        if (String.IsNullOrEmpty(r.id)) throw new InvalidDataException("Range requires an id.");
        if (r.readableRegion) {
          if (r.length != 0 || r.maxRegionBytes < 1 || r.maxRegionBytes > 64 * 1024 * 1024) throw new InvalidDataException("Readable-region mode requires omitted/zero length and positive maxRegionBytes at most 64 MiB.");
        } else if (r.length < 1 || r.length > 64 * 1024 * 1024 || r.maxRegionBytes != 0) throw new InvalidDataException("Fixed-length range requires bounded positive length and no region bound.");
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
        if (observer != null && (action.breakpointId == observer.beforeBreakpointId || action.breakpointId == observer.afterBreakpointId || action.breakpointId == observer.eventBreakpointId)) throw new InvalidDataException("phaseActions cannot reference a pending-frame observer breakpoint.");
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
    sealed class BufferedRange {
      public uint start;
      public int length;
      public byte[] data;
      public Dictionary<string, object> row;
      public MemoryRange descriptor;
      public uint root;
      public MemoryRegionInfo region;
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
      return Record("candidateIndex", progress.candidateIndex, "frameTid", progress.frameTid, "frameEntryEsp", Hex(progress.frameEntryEsp), "frameReturnAddress", Hex(progress.frameReturnAddress), "frameMatchingHit", progress.frameMatchingHit, "observedEventHits", progress.observedEventHits, "qualifyingEventSnapshots", progress.qualifyingEventSnapshots);
    }
    static BufferedSnapshot ReadBufferedSnapshot(Options options, PendingFrameProgress progress, IntPtr process, IntPtr thread, uint mainBase, Breakpoint hit, uint tid, Dictionary<string, object> regs, IntPtr context, Dictionary<string, object> predicate, string role, long elapsedMs, int debugOrdinal) {
      BufferedSnapshot buffered = new BufferedSnapshot {breakpoint = hit, role = role, eventIndex = progress.qualifyingEventSnapshots};
      long bytes = 716 + (options.captureThreadEnvironment ? 4 : 0);
      List<MemoryRange> selected = new List<MemoryRange>(options.ranges); selected.AddRange(hit.ranges);
      // Query and reserve the entire duplicated snapshot footprint BEFORE reading
      // any full-range blobs. A region query is metadata, never a memory sweep.
      foreach (MemoryRange range in selected) {
        uint root = ResolveCaptureRange(process, mainBase, range, regs), start = root;
        int length = range.length; MemoryRegionInfo region = null;
        if (range.readableRegion) {region = QueryCaptureRange(process, root, range); start = (uint)region.baseAddress; length = checked((int)region.regionSize);}
        Dictionary<string, object> row = Record("id", range.id, "address", Hex(start), "rootAddress", range.address, "rootRva", range.rva, "moduleBaseAddress", !String.IsNullOrEmpty(range.rva) ? Hex(mainBase) : null, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "length", length);
        if (region != null) {
          row["rangeMode"] = "readable-region"; row["requestedResolvedRoot"] = Hex(root); row["regionBaseAddress"] = Hex((uint)region.baseAddress); row["regionSize"] = region.regionSize;
          row["regionProtection"] = Hex(region.protection); row["regionState"] = Hex(region.state); row["regionType"] = Hex(region.type); row["maxRegionBytes"] = range.maxRegionBytes;
        }
        buffered.ranges.Add(new BufferedRange {start = start, length = length, row = row, descriptor = range, root = root, region = region}); bytes = checked(bytes + length);
      }
      progress.Reserve(options.pendingFrameObserver, bytes);
      foreach (BufferedRange range in buffered.ranges) {range.data = ReadCaptureRangeBytes(process, range.descriptor, range.root, range.start, range.length, range.region); range.row["sha256"] = Digest(range.data);}
      ThreadEnvironmentCapture environment = options.captureThreadEnvironment ? ReadThreadEnvironment(process, thread, context, tid) : null;
      if (environment != null) buffered.ranges.Add(environment.range);
      buffered.context = new byte[716]; Marshal.Copy(context, buffered.context, 0, buffered.context.Length);
      buffered.row = Record("type", "snapshot", "breakpointId", hit.id, "tid", tid, "registers", regs, "contextSha256", Digest(buffered.context), "capturePhase", "before-declared-writes-before-original-instruction", "rawHit", hit.hits, "matchingHit", hit.captureWhen == null ? hit.hits : hit.matchingHits, "deferredPublication", true, "observedElapsedMs", elapsedMs, "observedDebugEventOrdinal", debugOrdinal);
      if (predicate != null) buffered.row["captureWhen"] = predicate;
      if (environment != null) buffered.row["threadEnvironment"] = environment.metadata;
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
          using (FileStream stream = new FileStream(Path.Combine(options.outputDirectory, file), FileMode.CreateNew)) stream.Write(range.data, 0, range.data.Length);
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
          uint previous = SuspendThread(thread.Value);
          if (previous == UInt32.MaxValue) {
            errors++; report(Record("type", "thread-diagnostic-error", "stage", "suspend", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", Marshal.GetLastWin32Error()));
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
          uint previous = ResumeThread(thread.Value);
          if (previous == UInt32.MaxValue) {errors++; report(Record("type", "thread-diagnostic-error", "stage", "resume-own-diagnostic-suspension", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", Marshal.GetLastWin32Error()));}
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
      bool exited = false, created = false, fatal = false; int snapshots = 0, events = 0; string reason = "unknown";
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
          emit(Record("type", "capture", "schemaVersion", 1, "executablePath", o.executablePath, "workingDirectory", o.workingDirectory, "arguments", o.arguments, "executableSha256", o.expectedSha256.ToLowerInvariant(), "breakpointMode", "software-int3", "cleanupPolicy", "freeze-owned-threads-before-unpatch-and-termination", "maxDurationMs", o.maxDurationMs, "maxEvents", o.maxEvents, "maxSnapshots", o.maxSnapshots, "timingLimitation", "Debugger-paused elapsed time does not establish native wall-clock simulation rate."));
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
              // DEBUG_EVENT handles may be aliases of PROCESS_INFORMATION handles.
              if (process != child.process) CloseHandle(process);
              threads[tid] = thread;
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
                Write(child.process, b.resolved, new byte[] {0xcc}); b.armed = true;
                emit(Record("type", "breakpoint-installed", "id", b.id, "address", Hex(b.resolved), "originalBytesHex", b.original.ToString("x2"), "patchBytesHex", "cc"));
              }
            } else if (code == 2) {
              IntPtr thread = Ptr(eventData, u); threads[tid] = thread;
              if (pending != null && tid != pendingThread) { if (SuspendThread(thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error(), "Suspend new thread"); suspended.Add(thread); }
            } else if (code == 4) {
              IntPtr handle; if (threads.TryGetValue(tid, out handle)) { threads.Remove(tid); suspended.Remove(handle); if (handle != child.thread) CloseHandle(handle); }
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
              Breakpoint hit = null; foreach (Breakpoint b in breakpoints) if (b.armed && b.resolved == address && isBreakpoint) hit = b;
              if (hit != null) {
                if (!importsResolved && (!String.IsNullOrEmpty(o.redirectedDocumentsPath) || !String.IsNullOrEmpty(o.redirectedShellFolderPath) || o.denyRegistryWrites || o.denyChildProcesses || o.denyPlayerMailslot || o.hideOwnedWindows || o.foregroundWindowSource != null)) throw new InvalidDataException("Target reached a declared stage before required imported-service adapters were installed.");
                if (pending != null) throw new InvalidDataException("Nested owned breakpoint while stepping.");
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
                    uint esp = Number((string)regs["esp"]);
                    int matching = hit.captureWhen == null ? hit.hits : hit.matchingHits;
                    if (beforeFrame) {
                      if (frame.active) throw new InvalidDataException("Nested pending-frame entry, including a filtered entry.");
                      if (capture) {
                        uint caller = BitConverter.ToUInt32(Bytes(child.process, esp, 4), 0);
                        frame.Begin(observer, tid, esp, caller, matching);
                        bufferedFrame.Add(ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, "before", elapsed.ElapsedMilliseconds, events));
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
                        if (frame.qualifyingEventSnapshots == 0) {
                          Dictionary<string, object> discarded = FrameProof(frame); discarded["type"] = "pending-frame-discarded"; discarded["reason"] = "no-qualifying-event"; discarded["bufferedBytes"] = frame.bufferedBytes; discarded["beforeRawHit"] = bufferedFrame[0].row["rawHit"]; discarded["afterRawHit"] = hit.hits; emit(discarded);
                          candidateBound = frame.candidateIndex == observer.maxCandidateFrames;
                        } else {
                          bufferedFrame.Add(ReadBufferedSnapshot(o, frame, child.process, threads[tid], mainBase, hit, tid, regs, context, predicateEvidence, "after", elapsed.ElapsedMilliseconds, events));
                          CommitBufferedGroup(o, frame, bufferedFrame, ref snapshots, emit); frameSelection = FrameProof(frame); frameComplete = true;
                        }
                        bufferedFrame.Clear(); frame.active = false; frame.bufferedBytes = 0;
                      } else if (capture) throw new InvalidDataException("Pending-frame selected after has no matching entry.");
                    } else if (frame.active && capture) throw new InvalidDataException("Unrelated observation inside a pending frame would interleave publication.");
                    if (beforeFrame || afterFrame || eventFrame) capture = false;
                  }
                  if (capture) {
                  int snapshotOrdinal = snapshots + 1;
                  List<object> ranges = new List<object>(); List<MemoryRange> selected = new List<MemoryRange>(o.ranges); selected.AddRange(hit.ranges);
                  int rangeOrdinal = 0;
                  foreach (MemoryRange range in selected) {
                    uint root = ResolveCaptureRange(child.process, mainBase, range, regs), start = root;
                    int length = range.length; MemoryRegionInfo region = null;
                    if (range.readableRegion) {region = QueryCaptureRange(child.process, root, range); start = (uint)region.baseAddress; length = checked((int)region.regionSize);}
                    byte[] data = ReadCaptureRangeBytes(child.process, range, root, start, length, region); string file = "snapshot-" + snapshotOrdinal.ToString("D6") + "-range-" + (++rangeOrdinal).ToString("D3") + ".bin";
                    using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, file), FileMode.CreateNew)) blob.Write(data, 0, data.Length);
                    Dictionary<string, object> row = Record("id", range.id, "address", Hex(start), "rootAddress", range.address, "rootRva", range.rva, "moduleBaseAddress", !String.IsNullOrEmpty(range.rva) ? Hex(mainBase) : null, "baseRegister", range.baseRegister, "dereferenceOffsets", range.dereferenceOffsets, "offset", range.offset, "length", length, "file", file, "sha256", Digest(data));
                    if (region != null) {
                      row["rangeMode"] = "readable-region"; row["requestedResolvedRoot"] = Hex(root); row["regionBaseAddress"] = Hex((uint)region.baseAddress); row["regionSize"] = region.regionSize;
                      row["regionProtection"] = Hex(region.protection); row["regionState"] = Hex(region.state); row["regionType"] = Hex(region.type); row["maxRegionBytes"] = range.maxRegionBytes;
                    }
                    ranges.Add(row);
                  }
                  ThreadEnvironmentCapture capturedThreadEnvironment = o.captureThreadEnvironment ? ReadThreadEnvironment(child.process, threads[tid], context, tid) : null;
                  if (capturedThreadEnvironment != null) {
                    BufferedRange range = capturedThreadEnvironment.range;
                    string file = "snapshot-" + snapshotOrdinal.ToString("D6") + "-range-" + (++rangeOrdinal).ToString("D3") + ".bin";
                    using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, file), FileMode.CreateNew)) blob.Write(range.data, 0, range.data.Length);
                    range.row["file"] = file; ranges.Add(range.row);
                  }
                  byte[] rawContext = new byte[716]; Marshal.Copy(context, rawContext, 0, rawContext.Length);
                  string contextFile = "snapshot-" + snapshotOrdinal.ToString("D6") + "-context.bin";
                  using (FileStream blob = new FileStream(Path.Combine(o.outputDirectory, contextFile), FileMode.CreateNew)) blob.Write(rawContext, 0, rawContext.Length);
                  snapshots = snapshotOrdinal;
                  hit.captureHits++;
                  Dictionary<string, object> snapshot = Record("type", "snapshot", "ordinal", snapshots, "breakpointId", hit.id, "hit", hit.captureHits, "tid", tid, "registers", regs, "contextFile", contextFile, "contextSha256", Digest(rawContext), "ranges", ranges, "capturePhase", "before-declared-writes-before-original-instruction");
                  if (predicateEvidence != null) { snapshot["rawHit"] = hit.hits; snapshot["matchingHit"] = hit.matchingHits; snapshot["captureWhen"] = predicateEvidence; }
                  if (capturedThreadEnvironment != null) snapshot["threadEnvironment"] = capturedThreadEnvironment.metadata;
                  emit(snapshot);
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
                  Write(child.process, hit.resolved, new byte[] {hit.original}); hit.armed = false;
                  if (frameComplete) { reason = "snapshot-bound"; break; }
                  if (candidateBound) { reason = "pending-frame-candidate-bound"; break; }
                  if (snapshots >= o.maxSnapshots || (capture && hit.stopAfterHits > 0 && hit.captureHits >= hit.stopAfterHits)) { reason = "snapshot-bound"; break; }
                  foreach (KeyValuePair<uint, IntPtr> thread in threads) if (thread.Key != tid) { if (SuspendThread(thread.Value) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error(), "Suspend peer thread"); suspended.Add(thread.Value); }
                  Marshal.WriteInt32(context, 192, unchecked((int)(U32(context, 192) | 0x100)));
                  SetContext(threads[tid], context); pending = hit; pendingThread = tid;
                } finally { Marshal.FreeHGlobal(context); }
              } else if (isSingleStep && pending != null && tid == pendingThread) {
                IntPtr context = Context(threads[tid]);
                try { Marshal.WriteInt32(context, 192, unchecked((int)(U32(context, 192) & ~0x100u))); SetContext(threads[tid], context); } finally { Marshal.FreeHGlobal(context); }
                Write(child.process, pending.resolved, new byte[] {0xcc}); pending.armed = true; pending = null;
                foreach (IntPtr thread in suspended) if (ResumeThread(thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error(), "Resume peer thread");
                suspended.Clear();
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
          if (reason == "unknown") reason = elapsed.ElapsedMilliseconds >= o.maxDurationMs ? "duration-bound" : events >= o.maxEvents ? "event-bound" : "snapshot-bound";
          Dictionary<string, object> completion = Record("type", "complete", "reason", reason, "events", events, "snapshots", snapshots);
          if (frameSelection != null) completion["pendingFrameSelection"] = frameSelection;
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
              try {CaptureThreadDiagnostics(child, threads, o.outputDirectory, o.stopThreadStackBytes, emit);}
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
              if (!cleanupThreads.ContainsKey(child.tid) && child.thread != IntPtr.Zero) cleanupThreads.Add(child.tid, child.thread);
              bool allFrozen = true; List<uint> frozen = new List<uint>();
              foreach (KeyValuePair<uint, IntPtr> thread in cleanupThreads) {
                uint previous = SuspendThread(thread.Value);
                if (previous == UInt32.MaxValue) {
                  allFrozen = false;
                  cleanupReport(Record("type", "owned-process-cleanup-freeze-error", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "win32Error", Marshal.GetLastWin32Error()));
                } else {
                  frozen.Add(thread.Key);
                  cleanupReport(Record("type", "owned-process-cleanup-thread-frozen", "pid", child.pid, "tid", thread.Key, "mainThread", thread.Key == child.tid, "previousSuspendCount", previous));
                }
              }
              cleanupReport(Record("type", "owned-process-cleanup-freeze", "pid", child.pid, "requestedThreads", cleanupThreads.Count, "frozenTids", frozen, "allFrozen", allFrozen));
              if (allFrozen) {
                foreach (Breakpoint bp in breakpoints) if (bp.armed) try {Write(child.process, bp.resolved, new byte[] {bp.original}); bp.armed = false;} catch (Exception error) {cleanupReport(Record("type", "cleanup-warning", "error", error.Message));}
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
          HashSet<IntPtr> handles = new HashSet<IntPtr>(threads.Values); handles.Add(child.thread); handles.Add(child.process);
          foreach (IntPtr handle in handles) if (handle != IntPtr.Zero) CloseHandle(handle);
          Marshal.FreeHGlobal(eventData);
        }
      }
    }
  }
}
