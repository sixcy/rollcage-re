const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const s16 = value => value << 16 >> 16;
const popcount = value => {let count = 0; for (value >>>= 0; value; value >>>= 1) count += value & 1; return count;};

//44b970. Iterative-depth route search, with the native two-DWORD visited set,
//eight-entry path limit and byte counters. Same-group EAX is participant+58;
//all graph-search exits return -1, even after publishing a successful path.
export function findProjectileParticipantRoute(body, {memory: m, scratchBase}) {
  const frame = scratchBase - 140;
  put(m, scratchBase - 4, get(m, 0x5e8890) ^ (scratchBase - 124));
  let graph = ptr(m, ptr(m, 0x90b98c) + 0x94), participant = 0;
  const count = m[ptr(m, 0x5ecb1c) + 0x54d];
  while (participant < count && m[0x90931d + participant * 0x30c] !== 1) participant++;
  const record = 0x909300 + participant * 0x30c;
  put(m, body + 0x198, get(m, record));
  const start = m[ptr(m, body + 0x6cc) + 5], destination = m[ptr(m, record + 0x54) + 5];
  put(m, frame + 0x18, body); put(m, frame + 0x1c, graph); put(m, frame + 0x20, start); put(m, frame + 0x14, destination);
  if (start === destination) return get(m, record + 0x58);
  put(m, frame + 0x30, 0); put(m, frame + 0x34, 0); put(m, frame + 0x24, 0); put(m, frame + 0x28, 0);
  word(m, body + 0x6da, destination); m[frame + 0x80] = 1;
  put(m, frame + 0x30 + (start >> 5) * 4, 1 << (start & 31));
  put(m, frame + 0x2c, destination >> 5); m[frame + 0x70] = 0; put(m, frame + 0x10, 1 << (destination & 31));
  let depth = 0, level = 0, node = start;
  search: for (;;) {
    put(m, frame + 0x38 + level * 8, get(m, graph + node * 8)); put(m, frame + 0x3c + level * 8, get(m, graph + node * 8 + 4)); m[frame + 0x78 + level] = node & 255;
    while (level < depth) {
      let bits = ptr(m, frame + 0x38 + level * 8); level++;
      const high = ptr(m, frame + 0x34 + level * 8); m[frame + 0x80 + level] = popcount(bits) + popcount(high) & 255;
      node = 0;
      while (!(bits & 1)) {node++; bits >>>= 1; if (node === 32) bits = high;}
      m[frame + 0x78 + level] = node & 255; graph = ptr(m, frame + 0x1c);
      put(m, frame + 0x38 + level * 8, get(m, graph + node * 8)); put(m, frame + 0x3c + level * 8, get(m, graph + node * 8 + 4));
    }
    if (get(m, frame + 0x38 + (get(m, frame + 0x2c) + level * 2) * 4) & get(m, frame + 0x10)) {
      if (depth <= 7) {const output = ptr(m, frame + 0x18) + 0x6bc; if (depth >= 1) m.copy(m, output, frame + 0x79, frame + 0x79 + depth); m[output + depth] = m[frame + 0x14]; m[output + depth + 1] = 255;}
      return -1;
    }
    const visited = frame + 0x24 + (node >> 5) * 4; put(m, visited, get(m, visited) | 1 << (node & 31));
    let highAddress = frame + 0x34 + level * 8;
    for (;;) {
      m[frame + 0x70 + level] = m[frame + 0x70 + level] + 1 & 255;
      if (m[frame + 0x70 + level] < m[frame + 0x80 + level]) {
        node = m[frame + 0x78 + level];
        let bits = (ptr(m, frame + 0x30 + ((node >> 5) + level * 2) * 4) >>> (node & 31)) & 0xfffffffe;
        do {node++; bits >>>= 1; if (node === 32) bits = ptr(m, highAddress);} while (!(bits & 1));
        if (!(get(m, frame + 0x24 + (node >> 5) * 4) & 1 << (node & 31))) continue search;
        m[frame + 0x78 + level] = node & 255;
      } else {
        highAddress -= 8; level--; if (level >= 0) continue;
        depth++; if (depth > 7) return -1;
        for (let i = 0; i <= depth; i++) m[frame + 0x70 + i] = 0;
        level = 0; node = get(m, frame + 0x20); continue search;
      }
    }
  }
}

//44bc30. Choose the closer endpoint, refresh the participant route, traverse
//authored packed links, and retain native signed-short reversal/wrap behavior.
export function updateProjectileRoute(body, mode, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 28;
  const short = p => m.readInt16LE(p), pointFor = (group, index) => ptr(m, group + 8) + (s16(index) << 4);
  const distance = point => {const x = short(body + 0x36) - short(point), y = short(body + 0x3a) - short(point + 2), z = short(body + 0x3e) - short(point + 4); return Math.imul(z, z) + Math.imul(y, y) + Math.imul(x, x) | 0;};
  put(m, frame + 0x18, mode); put(m, frame + 0x10, short(body + 0x3a));
  if (mode) {const target = ptr(m, body + 0x198); let squared = 0; for (const offset of [0x36, 0x3a, 0x3e]) {const delta = short(body + offset) - short(target + offset); squared = squared + Math.imul(delta, delta) | 0;} if (squared < 0x100000) return 1;}
  const nextGroup = ptr(m, body + 0x6d4), oldGroup = ptr(m, body + 0x6cc);
  put(m, frame + 0x14, oldGroup);
  put(m, frame + 0x10, get(m, frame + 0x10) - short(pointFor(oldGroup, short(body + 0x6d0)) + 2));
  if (distance(pointFor(nextGroup, short(body + 0x6d8))) > distance(pointFor(oldGroup, short(body + 0x6d0)))) return 0;
  word(m, body + 0x6d0, m.readUInt16LE(body + 0x6d8)); put(m, body + 0x6cc, nextGroup);
  if (oldGroup !== nextGroup && m[oldGroup + 2] !== m[nextGroup + 2]) word(m, body + 0x6d2, -short(body + 0x6d2));
  const targetIndex = findProjectileParticipantRoute(body, {...runtime, scratchBase: frame - 4}), wantedGroup = m[body + 0x6bc]; let reverse = false;
  if (targetIndex > -1) {
    if (mode && !m[ptr(m, body + 0x6cc) + 4]) {const direction = targetIndex >= short(body + 0x6d0) ? 1 : -1; reverse = short(body + 0x6d2) !== direction; word(m, body + 0x6d2, direction);}
  } else {
    const point = pointFor(ptr(m, body + 0x6d4), short(body + 0x6d8));
    let link = ptr(m, point + 12), group = link & 31, shift = 5;
    if (group !== wantedGroup) {group = link >>> 14 & 31; shift = 19;}
    if (group === wantedGroup) {
      put(m, body + 0x6d4, ptr(m, ptr(m, 0x90b98c) + 0x60) + group * 12); link = ptr(m, point + 12); word(m, body + 0x6d8, link >>> shift & 511);
      let p = body + 0x6bc; while (m[p] !== 255) {m[p] = m[p + 1]; p++;}
    }
  }
  const group = ptr(m, body + 0x6d4); let direction = short(body + 0x6d2);
  let step = direction; if (m[group + 2] !== m[ptr(m, body + 0x6cc) + 2]) step = -step;
  word(m, body + 0x6d8, short(body + 0x6d8) + step);
  if (m[group + 4]) {
    const index = short(body + 0x6d8); if (index < 0) word(m, body + 0x6d8, m.readUInt16LE(group) + index); else if (index >= m.readUInt16LE(group)) word(m, body + 0x6d8, 0);
    return 0;
  }
  if (reverse) {direction = -direction; word(m, body + 0x6d2, direction); word(m, body + 0x6d8, short(body + 0x6d8) + direction * 2);}
  let index = short(body + 0x6d8), endpoint = true;
  if (index <= 0) word(m, body + 0x6d8, 0);
  else if (index >= m.readUInt16LE(group) - 1) word(m, body + 0x6d8, m.readUInt16LE(group) - 1);
  else endpoint = reverse;
  if (!endpoint) return 0;
  const point = pointFor(group, short(body + 0x6d8)), pack = ptr(m, 0x90b98c);
  let link = ptr(m, point + 12), linked = link >>> 14 & 31;
  if (linked) {put(m, body + 0x6d4, ptr(m, pack + 0x60) + linked * 12); word(m, body + 0x6d8, ptr(m, point + 12) >>> 19 & 511);}
  if (!m[ptr(m, body + 0x6d4) + 4]) {
    link = ptr(m, point + 12); linked = link & 31;
    if (linked) {put(m, body + 0x6d4, ptr(m, pack + 0x60) + linked * 12); word(m, body + 0x6d8, ptr(m, point + 12) >>> 5 & 511);}
  }
  const current = ptr(m, body + 0x6cc);
  if (m[ptr(m, body + 0x6d4) + 5] === m[current + 5]) {
    direction = m.readUInt16LE(body + 0x6d2); index = s16(m.readUInt16LE(body + 0x6d0) + direction); word(m, body + 0x6d8, index);
    if (index < 0) {word(m, body + 0x6d8, 1); word(m, body + 0x6d2, -direction);}
    else if (index >= m.readUInt16LE(current)) {word(m, body + 0x6d8, m.readUInt16LE(current) - 2); word(m, body + 0x6d2, -direction);}
  }
  return 0;
}
