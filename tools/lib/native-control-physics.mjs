//Carry genuine450e50 source output directly into4749e0. Native intermediate
//and exit snapshots are deliberately absent from this replay API.
import {replayNativeControlPrefix, nativeControlAdditionalRegions, nativeControlOwnedRegions} from './native-frame-control-continuation.mjs';
import {deriveNativePhysicsEntryRegisters} from './native-control-physics-registers.mjs';
import {buildNativeFrameManifest} from './native-frame-manifest.mjs';
import {mergeNativeDriveModuleAliases} from './native-frame-drive-continuation.mjs';
import {createNativeFrameContext, extendNativeFrameGeometryComparison, extendNativeFrameSoundComparison} from './native-frame-replay.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {stepSimulationFrame} from '../../src/simulation-frame.mjs';
import {nativeSourceCarriedRanges} from './native-source-carried-ranges.mjs';

export function replayNativeControlThroughPhysics(snapshot, options = {}) {
  let stage = 'joined-control-prefix';
  try {
    const source = replayNativeControlPrefix(snapshot, options), prefixReport = source.report;
    if (options.onPrefixComplete !== undefined && typeof options.onPrefixComplete !== 'function') throw Error('Joined prefix observer must be a function.');
    options.onPrefixComplete?.(source);
    stage = 'source-physics-registers';
    const derived = deriveNativePhysicsEntryRegisters({memory: source.memory, moduleBaseAddress: source.manifest.moduleBaseAddress,
      parentEntryEsp: prefixReport.entryEsp, parentEntryEdx: Number(snapshot.registers.edx), trace: prefixReport.parentTrace});
    //No native physics-entry register is supplied. Unproved volatile/status
    //registers stay absent; the physics adapter consumes derived EBX/EBP.
    const registers = derived.registers;
    const depth = options.stackBytesBefore - 20;
    if (!Number.isInteger(depth) || depth < 4) throw Error('Joined replay requires parent stack depth covering the20-byte call displacement.');
    stage = 'carried-physics-coverage';
    const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
    const carried = {moduleBaseAddress: source.manifest.moduleBaseAddress, registers,
      ranges: nativeSourceCarriedRanges(rows,source)};
    const manifestOptions = {...options, moduleBaseAddress: source.manifest.moduleBaseAddress, stackBytesBefore: depth};
    //Coverage/counts/views are rebuilt from carried SOURCE bytes. A world
    //producer can change a list or arena cursor before the physics call.
    const additionalRegions = [...(options.additionalRegions ?? []), ...nativeControlAdditionalRegions(carried, manifestOptions)];
    const manifest = buildNativeFrameManifest(carried, {...manifestOptions, additionalRegions});
    manifest.aliases = mergeNativeDriveModuleAliases(manifest.aliases, manifest.moduleBaseAddress);
    extendNativeFrameSoundComparison(manifest, source.manifest.requiredRegions.filter(row => row.comparison !== 'abi-input'));
    const geometry = createNativeFrameGeometry({...options.geometryOptions, memory: source.memory});
    const bound = createNativeFrameContext({memory: source.memory, manifest, geometry, numericalContext: source.numericalContext, sound: source.sound});
    stage = 'joined-physics';
    const physicsReport = stepSimulationFrame(bound.views.physicalGroup, bound.bindings.vehicles, bound.context);
    extendNativeFrameGeometryComparison(manifest, geometry.comparisonRegions);
    extendNativeFrameSoundComparison(manifest, [...source.sound.comparisonRegions, ...source.threadEnvironment.comparisonRegions]);
    return {...source, ...bound, manifest, prefixReport, derivedPhysicsRegisters: derived,
      report: {...physicsReport, childEsp: prefixReport.childEsp}, ownedRegions: nativeControlOwnedRegions({...source, ...bound}),
      joinedLimits: ['Only450e50 entry through4749e0 preRET is executed; postphysics producers and the next scheduling decision remain open.',
        'Physics consumes the completed source prefix without intermediate state or register refresh.',
        'The available physics scratch depth is the observed parent depth minus20 bytes; no deeper native memory is invented.',
        'Unproved volatile/status registers, complete private CPU ABI and unobserved branches remain outside this comparison.']};
  } catch (error) {error.replayStage = stage; throw error;}
}
