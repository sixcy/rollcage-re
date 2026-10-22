import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createReduxCaptureConfig, reduxCaptureScenarios} from '../tools/lib/redux-capture-config.mjs';

const pathKeys = ['executablePath', 'workingDirectory', 'outputDirectory', 'redirectedDocumentsPath', 'redirectedShellFolderPath', 'temporaryDirectory'];
const policy = config => Object.fromEntries(Object.entries(config).filter(([key]) => !pathKeys.includes(key)));

test('hidden capture policies match the actual successful no-launcher/pre-device and six-AI native configurations', async () => {
  for (const [scenario, retained] of [['hidden-device-boundary', 'physics-native-hidden-device-20261022'], ['hidden-idle', 'physics-native-hidden-idle-20261022']]) {
    const actual = JSON.parse(await readFile(new URL(`../analysis/${retained}/configuration.json`, import.meta.url), 'utf8'));
    assert.deepEqual(policy(createReduxCaptureConfig('new-isolated-run', scenario)), policy(actual));
  }
});

test('fresh configs isolate every path and cannot mutate shared window/launcher policies', () => {
  const root = path.resolve('new-isolated-run');
  for (const scenario of reduxCaptureScenarios) {
    const config = createReduxCaptureConfig(root, scenario);
    for (const key of pathKeys) assert.ok(config[key].startsWith(`${root}${path.sep}`), key);
    assert.equal(config.hideOwnedWindows, true); assert.equal(config.showWindow, false);
    assert.equal(config.denyRegistryWrites, true); assert.equal(config.denyChildProcesses, true);
    const stops = config.breakpoints.filter(row => row.stopAfterHits === 1);
    assert.ok(stops.length > 0, 'A bounded observed stage must terminate each scenario.');
    config.breakpoints[0].rva = '0xdeadbeef';
    assert.notEqual(createReduxCaptureConfig(root, scenario).breakpoints[0].rva, '0xdeadbeef');
  }
  assert.throws(() => createReduxCaptureConfig(root, 'fullscreen'), /Unknown/);
});
