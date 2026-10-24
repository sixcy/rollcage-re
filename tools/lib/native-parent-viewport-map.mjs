//Semantic comparison of ORIGINAL entry bytes reached by the source lookup.
//The caller authenticates CRT transport first. No map or native after values
//are installed into replay; whole readable-region transports are not admitted.
import {createCapturedMemory} from './captured-memory.mjs';

const pointer = (value, length, label) => {
  if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(length) || length < 1 || value + length > 0x100000000) throw Error(`Invalid original viewport ${label} span.`);
  return value;
};
const compare = (a, an, b, bn) => {
  for (let i = 0; i < Math.min(an,bn); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return an < bn ? -1 : an > bn ? 1 : 0;
};

export function nativeParentViewportObservedRegions(snapshot, {events, moduleBaseAddress, maxVisitedNodes = 8, maxKeyBytes = 256} = {}) {
  if (snapshot?.breakpointId !== 'native-control-before' || Number(snapshot.registers?.eip) !== moduleBaseAddress + 0x50e50 || !Array.isArray(events) || !Number.isInteger(maxVisitedNodes) || maxVisitedNodes < 1 || maxVisitedNodes > 256 || !Number.isInteger(maxKeyBytes) || maxKeyBytes < 1 || maxKeyBytes > 65536) throw Error('Viewport comparison requires original parent entry and explicit bounded source lookups.');
  const original = createCapturedMemory(snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges);
  const regions = [], lookups = [], declared = new Set();
  const read = (address,length) => original.span(pointer(address,length,'input'),length);
  const word = address => read(address,4).readUInt32LE();
  const add = (id,address,length) => {
    read(address,length); const key = `${address}:${length}`;
    if (!declared.has(key)) {declared.add(key); regions.push({id,address,length,comparison:'mutable',evidence:'Original parent-entry storage actually traversed by source405720/404e10/404fa0 after authenticated CRT EAX; no native after bytes.'});}
  };
  for (const event of events) {
    if (event.authority !== 'observed-external-MSVCR120-__RTDynamicCast' || event.args?.length !== 5 || !/^(?:[0-9a-f]{2}){1,31}$/.test(event.sourceNameHex ?? '')) throw Error('Viewport comparison lacks its authenticated cast and source formatter key.');
    const app = pointer(event.eax,0x84,'application'), singleton = word(moduleBaseAddress + 0x2efb38);
    if (event.args[0] !== singleton || app !== singleton) throw Error('Observed cast does not identify the candidate application map.');
    const map = app + 0x7c, head = word(map), count = word(map + 4);
    if (count > maxVisitedNodes) throw Error('Original viewport map exceeds its explicit node limit.');
    add('viewport-map-header',map,8); add('viewport-map-head',head,16);
    if (read(head,16)[13] !== 1) throw Error('Original viewport sentinel is not nil.');
    const incoming = Buffer.from(event.sourceNameHex,'hex');
    if (incoming.includes(0)) throw Error('Source camera formatter key contains an embedded NUL.');
    const seen = new Set(), visited = [], nodes = new Map();
    function nodeAt(address,parent) {
      if (address === head) return null;
      if (seen.has(address)) throw Error('Original viewport lookup contains a cycle.');
      if (seen.size >= count || seen.size >= maxVisitedNodes) throw Error('Original viewport traversal exceeds its observed count.');
      const bytes = read(address,100);
      if (bytes[13] !== 0 || bytes[12] > 1 || bytes.readUInt32LE(4) !== parent) throw Error('Original viewport node nil/color/backlink differs.');
      seen.add(address); visited.push(address); add('viewport-map-node',address,100);
      const length = bytes.readUInt32LE(32), capacity = bytes.readUInt32LE(36);
      if (length > capacity || length + 1 > maxKeyBytes || capacity < 16 && length > 15) throw Error('Original viewport key length/capacity exceeds its observed string domain.');
      const dataAddress = capacity < 16 ? address + 16 : bytes.readUInt32LE(16), data = read(dataAddress,length + 1);
      if (data[length] !== 0) throw Error('Original viewport key lacks its terminating NUL.');
      if (capacity >= 16) add('viewport-map-key',dataAddress,length + 1);
      const node = {address,bytes,data,length,cLength:data.indexOf(0)}; nodes.set(address,node); return node;
    }
    let found = head, cursor = word(head + 4), parent = head;
    while (cursor !== head) {
      const node = nodeAt(cursor,parent); parent = cursor;
      if (compare(node.data,node.length,incoming,incoming.length) < 0) cursor = node.bytes.readUInt32LE(8);
      else {found = cursor; cursor = node.bytes.readUInt32LE();}
      pointer(cursor,14,'child');
    }
    //404e10 compares the incoming stored length with strlen(nodeKey), which
    //can differ from the stored node length when a key has embedded NULs.
    const selected = nodes.get(found);
    if (!selected || compare(incoming,incoming.length,selected.data,selected.cLength) < 0) throw Error('Source viewport lookup requires its genuine missing-key allocation.');
    lookups.push({application:app,map,head,count,nameHex:event.sourceNameHex,visitedNodes:visited,record:found + 44});
  }
  return {regions,lookups,limits:['Only original-entry map header, sentinel16B, source-traversed nodes100B and reached heap key length+1 are compared.','Captured map transports and other tree nodes remain outside semantic admission.']};
}
