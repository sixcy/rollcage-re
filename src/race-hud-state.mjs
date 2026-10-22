import tables from './race-hud-tables.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
export function initializeRaceHudTables(memory) {for (const table of tables.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}

//47e890: signed wrapped numerator, unsigned WORD target and two sequential
//smoothing comparisons. The second comparison rereads the potentially changed WORD.
export function updateRaceHudGauge(index, {memory: m}) {
  const body = ptr(m, 0x5ecb18); let value = 0, minimum = 0, maximum = 10;
  switch (index | 0) {case 0: value = get(m, body + 0x3cfc); minimum = 0x40000; maximum = 0x120000; break; case 1: value = get(m, body + 0x3cf4); minimum = -80000; maximum = 80000; break; case 2: value = get(m, body + 0x3d00); maximum = 3; break; case 3: value = get(m, body + 0x3cf8); minimum = -3500; maximum = 5000; break;}
  const target = Math.trunc(Math.imul(value - minimum, 255) / (maximum - minimum)) & 65535, p = ptr(m, 0x902018) + Math.imul(index, 0x298), previous = m.readUInt16LE(p + 0x294); word(m, p + 0x296, target);
  if (Math.abs(previous - target) <= 16) word(m, p + 0x294, target);
  else {if (previous < target) word(m, p + 0x294, previous + 16); if (target < m.readUInt16LE(p + 0x294)) word(m, p + 0x294, m.readUInt16LE(p + 0x294) - 16);}
  return m.readUInt16LE(p + 0x294);
}

//47e760: the selected render buffer receives colors, while smoothing always
//uses the first buffer's gauge WORDs, exactly as the original.
export function setRaceHudGaugeColors(color, runtime) {
  const m = runtime.memory; if (get(m, 0x5ecb18) === -1) return;
  let cursor = ptr(m, get(m, 0x91d518) === 0x91d520 ? 0x902018 : 0x90201c) + 5; const red = color & 255, green = color >>> 8 & 255, blue = color >>> 16 & 255;
  for (let row = 0; row < 4; row++, cursor += 0x298) {
    m[cursor - 1] = red; m[cursor] = green; m[cursor + 1] = blue;
    const threshold = updateRaceHudGauge(row, {...runtime, scratchBase: runtime.scratchBase - 0x38}); let amount = green * 960;
    for (let i = 0; i < 16; i++, amount -= green * 64) {const p = cursor + 20 + i * 40; m[p + 1] = 0; if ((i * 16 >>> 0) > (threshold >>> 0)) word(m, p - 1, 0); else {m[p - 1] = Math.min(Math.imul(i * 64, red) >> 8, 255) & 255; m[p] = Math.min(amount >> 8, 255) & 255;}}
  }
}

//445e30. Only the first record in each pair receives these color writes;
//the following WORD is a distinct packed field and deliberately clears byte+1.
export function setRaceHudBrightness(index, brightness, mode, runtime) {
  const m = runtime.memory, value = Math.min(brightness >>> 0, 255), high = get(m, 0x90d9a4) & 0xff000000, rgb = value << 16 | value << 8 | value, full = high | rgb; m[0x911abc] = value;
  const special = mode === 1 ? full & 0xff0000ff : mode === 2 ? full & 0xff00ff00 : full, counter = 0x911ac0 + Math.imul(index, 4), count = m[counter + 1];
  if (count > 1) m[counter + 1] = count - 1; else if (count === 1) word(m, counter, 1); else m[counter] = 0;
  for (let i = 0, cursor = 0x90d9c2; i < 67; i++, cursor += 240) {
    if (i === 2 || i === 3 || i === 65) continue;
    let color = full;
    if ((i >= 4 && i <= 20) || (i >= 29 && i <= 36) || i === 50 || i === 52) color = special;
    else if (i >= 21 && i <= 28) color = high | value;
    else if (i === 49 || i === 51) color = high | value << 16;
    put(m, cursor - 30, color); word(m, cursor, color & 255);
  }
  const session = ptr(m, 0x5ecb1c); if (m[session + 0x551] === 4) setRaceHudGaugeColors(full, {...runtime, scratchBase: runtime.scratchBase - 28});
  if (m[session + 0x552]) {const v = Math.min(value << 2, 160), color = get(m, 0x911a90) & 0xff000000 | v << 16 | v << 8 | v; put(m, 0x911a90, color); put(m, 0x911aac, color);}
}
