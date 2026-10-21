import { getGame } from '../../src/track-games.mjs';

// Keep the historical positional arguments and default installation. A game
// option is explicit so a numeric resource never silently selects another game.
export function parseGameOptions(argumentsList) {
  const positional = [];
  let gameId = 'rollcage';
  for (let index = 0; index < argumentsList.length; index++) {
    const value = argumentsList[index];
    if (value === '--game') {
      gameId = argumentsList[++index];
      if (!gameId) throw new Error('--game requires rollcage, stage2 or firebugs.');
    } else if (value.startsWith('--game=')) gameId = value.slice(7);
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else positional.push(value);
  }
  const game = getGame(gameId);
  return { game, positional, installation: positional[2] ?? game.installation };
}
