//Descriptive labels follow47be20's recovered launch dispatcher, rather than
//claiming the original frontend's localized wording or icon order.
const labels = ['Missile', 'Homing missile', 'Triple missiles', 'Shockwave', 'Boost', 'Time warp', 'Shield', 'Wormhole'];

export function pickupLabel(code) {
  if (code === 255) return 'Empty';
  if (!Number.isInteger(code) || code < 0 || code > 255) return '—';
  const kind = code & 63, name = labels[kind] ?? `Item ${kind}`;
  return `${name}${code & 64 ? ' (active)' : ''}`;
}
