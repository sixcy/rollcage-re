// Reconstructs Redux FUN_00447ae0 for its ASCII resource names.
import resourceMap from './resource-map.json' with { type: 'json' };

export function normalizeResourceName(name) {
  if (typeof name !== 'string' || /[^\x00-\x7f]/.test(name)) throw new TypeError('Resource names must be ASCII strings.');
  // The original is a C string; content after its first NUL is ignored.
  return name.split('\0', 1)[0].toUpperCase().replace(/__|_|\\/g, token => token === '_' ? '.' : '/');
}
const lookup = new Map();
for (const { name, index } of resourceMap.mappings) {
  const normalized = normalizeResourceName(name);
  if (!lookup.has(normalized)) lookup.set(normalized, index);
}
export function findResourceIndex(name) { return lookup.get(normalizeResourceName(name)) ?? -1; }
export const resourceMappings = Object.freeze(resourceMap.mappings.map(mapping => Object.freeze({ ...mapping })));
