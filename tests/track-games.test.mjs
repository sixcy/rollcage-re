import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { games, getGame, identifyGame } from '../src/track-games.mjs';
import { buildTrackManifest } from '../src/track-manifest.mjs';
import { parseGameOptions } from '../tools/lib/game-options.mjs';
import { buildViewerBundle } from '../tools/lib/track-viewer-bundle.mjs';

function unidentifiedArchive(gameId) {
  const game = getGame(gameId), geometry = Buffer.alloc(0x120), texture = Buffer.alloc(0x70);
  geometry.write('GFXM'); geometry.writeUInt16LE(game.headerFlags[0], 4); texture.write('BTP ');
  return { indexData: Buffer.from('not a known index'), entries: Array.from({ length: 344 }, () => ({})),
    readResource: async index => ({ data: index === game.tracks[0].index ? geometry : texture }) };
}

test('game adapters inventory forty original tracks and sixty-six Stage II environments with explicit pairs', () => {
  assert.deepEqual(games.map(game => [game.id, game.tracks.length]), [['rollcage', 40], ['stage2', 66]]);
  for (const game of games) {
    assert.equal(new Set(game.tracks.map(track => track.index)).size, game.tracks.length);
    for (const track of game.tracks) {
      assert.equal(track.game, game.id); assert.ok(track.label.startsWith(game.label));
      assert.ok(Number.isInteger(track.textureIndex));
      assert.equal(game.findResourceIndex(track.name), track.index);
    }
    assert.equal(game.findResourceIndex('DOES-NOT-EXIST.BLP'), -1);
    assert.equal(game.listTracks({ entries: [] }).length, 0);
  }
  assert.throws(() => getGame('unknown'), /Unknown game/);
});

test('archive identification rejects counts alone and requires an explicit choice for an unknown index', async () => {
  for (const game of games) {
    const archive = unidentifiedArchive(game.id);
    await assert.rejects(identifyGame(archive), /Unrecognized archive/);
    const identified = await identifyGame(archive, game.id);
    assert.equal(identified.game, game); assert.equal(identified.verified, false);
    const other = games.find(candidate => candidate !== game);
    await assert.rejects(identifyGame(archive, other.id), /Invalid GFXM/);
  }
});

test('archive identification and adapters reject truncated, absent and foreign game resources', async () => {
  const archive = unidentifiedArchive('stage2');
  archive.entries = [];
  await assert.rejects(identifyGame(archive, 'stage2'), /No supported/);
  archive.entries = Array.from({ length: 290 }, () => ({}));
  archive.readResource = async () => ({ data: Buffer.from('GFXM') });
  await assert.rejects(identifyGame(archive, 'stage2'), /Invalid GFXM/);
  await assert.rejects(getGame('stage2').loadTrack(archive, getGame('rollcage').tracks[0]), /does not belong/);
});

test('host game options preserve original positional arguments and allow an explicit Stage II installation', () => {
  const original = parseGameOptions(['LOW/LEV1.BLP', 'output', 'custom-install']);
  assert.equal(original.game.id, 'rollcage'); assert.equal(original.installation, 'custom-install');
  const stage2 = parseGameOptions(['--game', 'stage2', '80', 'output']);
  assert.equal(stage2.game.id, 'stage2'); assert.ok(stage2.installation.endsWith('Rollcage Stage II'));
  assert.equal(parseGameOptions(['--game=stage2']).game.id, 'stage2');
  assert.throws(() => parseGameOptions(['--game']), /requires/);
  assert.throws(() => parseGameOptions(['--game=bad']), /Unknown game/);
  assert.throws(() => parseGameOptions(['--bad']), /Unknown option/);
});

test('scene manifests retain game identity, explicit resource pairing and complete-scene counts', () => {
  const track = getGame('stage2').tracks[0];
  const scene = { segments: 1, instances: 2, vertices: 12, quads: 3, triangles: 7,
    placementTypes: { 0: 2, 1: 1 }, bounds: [[0, 1], [2, 3], [4, 5]], textures: new Map([[5, { width: 64, height: 128 }]]) };
  const manifest = buildTrackManifest(scene, track);
  assert.equal(manifest.game, 'stage2'); assert.equal(manifest.resource, track.index);
  assert.equal(manifest.textureResource, track.textureIndex); assert.equal(manifest.instances, 2);
  assert.deepEqual(manifest.pages, [{ page: 5, width: 64, height: 128 }]);
});

test('standalone bundle exposes both adapters and preserves browser game identification', async () => {
  const packed = await buildViewerBundle(['src/track-games.mjs']);
  const modules = runInNewContext(packed, { btoa, atob, crypto });
  const browser = modules['src/track-games.mjs'];
  assert.deepEqual(JSON.parse(JSON.stringify(browser.games.map(game => [game.id, game.tracks.length]))), [['rollcage', 40], ['stage2', 66]]);
  const empty = { entries: [], indexData: null, readResource: async () => { throw new Error('Must not read'); } };
  await assert.rejects(browser.identifyGame(empty), /Unrecognized archive/);
});
