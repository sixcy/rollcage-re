import { getGame } from '../../src/track-games.mjs';

// Compatibility entry point for the existing Rollcage checks and callers.
export const tracks = getGame('rollcage').tracks;

export function decodeTrack(data, textureData) {
  return getGame('rollcage').decodeTrack(data, textureData);
}
