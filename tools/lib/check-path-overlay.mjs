import assert from 'node:assert/strict';
import { buildViewerBundle } from './track-viewer-bundle.mjs';

// Independent source-byte oracle: do not use the route parser/adapter here.
export function assertStoredPathBytes(paths, data) {
  assert.notEqual(paths.status, 'unavailable', paths.message);
  const table = data.readUInt32LE(0x8c), base = data.readUInt32LE(0x98), expected = [];
  for (let index = 0; index < data[0x79]; index++) {
    const offset = table + index * 12, count = data.readUInt16LE(offset);
    if (!count) continue;
    const start = base + data.readUInt32LE(offset + 8), positions = [];
    for (let i = 0; i < count; i++) {
      const x = data.readInt16LE(start + i * 16), y = data.readInt16LE(start + i * 16 + 2), z = data.readInt16LE(start + i * 16 + 4);
      positions.push([x, y === 0 ? 0 : -y, z === 0 ? 0 : -z]);
    }
    expected.push({ index, offset, positions });
  }
  assert.deepEqual(paths.groups, expected);
  assert.equal(paths.status, expected.length ? 'available' : 'empty');
}

export async function checkPathOverlay(page, expected, exercise = false) {
  const inspect = () => page.evaluate(() => window.rollcageViewer.inspect());
  const state = await inspect();
  assert.deepEqual(state.paths, expected);
  assert.equal(state.pathBuffers, expected.groups.length);
  assert.equal(await page.locator('#path-group').inputValue(), '-1');
  assert.equal(await page.locator('#path-group option').count(), expected.groups.length + 1);
  assert.equal(await page.locator('#paths').isDisabled(), expected.status !== 'available');
  if (state.practice && expected.status === 'available') assert.match(await page.locator('#path-note').textContent(), /consecutive authored points.*AI car selects its routes independently/);
  else assert.equal(await page.locator('#path-note').textContent(), expected.message);
  if (!exercise || !expected.groups.length) return;
  const groups = expected.groups, points = groups.reduce((sum, group) => sum + group.positions.length, 0);
  const segments = groups.reduce((sum, group) => sum + Math.max(0, group.positions.length - 1), 0);
  await page.locator('#paths').check(); await page.locator('#path-points').check();
  await page.waitForFunction(points => window.rollcageViewer.inspect().pathDraws.points === points, points);
  assert.equal((await inspect()).pathDraws.segments, segments);
  assert.equal((await inspect()).pathDraws.groups, groups.length);
  const group = groups.find(group => group.positions.length === 1) ?? groups.at(-1);
  await page.selectOption('#path-group', String(group.index));
  await page.waitForFunction(count => window.rollcageViewer.inspect().pathDraws.points === count, group.positions.length);
  assert.equal((await inspect()).pathDraws.groups, 1);
  assert.equal((await inspect()).pathDraws.segments, Math.max(0, group.positions.length - 1));
  assert.match(await page.locator('#path-counts').textContent(), new RegExp(`Group ${group.index}`));
  assert.equal(await page.locator('#path-color').isVisible(), true);
  await page.locator('#path-through').check();
  await page.waitForFunction(() => window.rollcageViewer.inspect().pathDraws.through);
  await page.locator('#path-points').uncheck();
  await page.waitForFunction(() => window.rollcageViewer.inspect().pathDraws.points === 0);
  await page.selectOption('#path-group', '-1'); await page.locator('#path-points').check();
  // Terrain/object filters must not filter the path pass.
  const previous = await page.locator('#objects').isChecked();
  await page.locator('#objects').uncheck(); await page.selectOption('#sector', '0');
  await page.waitForFunction(points => window.rollcageViewer.inspect().pathDraws.points === points, points);
  if (previous) await page.locator('#objects').check();
  await page.selectOption('#sector', '-1');
  assert.equal(await page.evaluate(() => {
    const gl = document.getElementById('canvas').getContext('webgl');
    return gl.isEnabled(gl.DEPTH_TEST) && gl.getParameter(gl.DEPTH_WRITEMASK);
  }), true);
  await page.locator('#paths').uncheck();
  await page.waitForFunction(() => window.rollcageViewer.inspect().pathDraws.groups === 0);
  await page.locator('#paths').check();
}

export async function checkPathRendering(page) {
  const bundle = await buildViewerBundle(['tools/track-viewer/renderer.mjs']);
  const result = await page.evaluate(bundle => {
    const { Renderer } = (0, eval)(bundle)['tools/track-viewer/renderer.mjs'];
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;right:0;bottom:0;width:128px;height:128px;pointer-events:none';
    document.body.append(canvas);
    const renderer = new Renderer(canvas), gl = renderer.gl;
    let deleted = 0;
    const deleteBuffer = gl.deleteBuffer.bind(gl);
    gl.deleteBuffer = buffer => { deleted++; deleteBuffer(buffer); };
    const vertices = [[-1,-1,0],[1,-1,0],[-1,1,0],[1,-1,0],[1,1,0],[-1,1,0]].flatMap(p => [...p,0,0,0,0,1]);
    const bytes = new Uint8Array(new Float32Array(vertices).buffer);
    const scene = { groups: [{ kind:'terrain',segment:0,page:0,vertices:6,buffer:btoa(String.fromCharCode(...bytes)) }], textures:new Map(),
      paths:{ groups:[{index:0,positions:[[-0.75,-0.5,0.5],[0.75,-0.5,0.5],[0.75,0.5,0.5]]}, {index:3,positions:[[-0.5,0.5,-0.5]]}] } };
    const navigation = { matrix:() => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]) };
    const options = { textures:false,lighting:false,objects:true,sector:-1,paths:false,pathPoints:true,pathThrough:false,pathGroup:-1 };
    const draw = changes => { Object.assign(options, changes); renderer.render(navigation, options); };
    const pixel = (x,y) => { const data = new Uint8Array(4); gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,data); return [...data]; };
    try {
      renderer.setScene(scene); draw({});
      const terrain = pixel(64,32), markerBase = pixel(37,96);
      draw({paths:true}); const occluded = pixel(64,32), marker = pixel(37,96);
      draw({pathThrough:true}); const visible = pixel(64,32), noClosingEdge = pixel(64,64);
      const restored = gl.isEnabled(gl.DEPTH_TEST) && gl.getParameter(gl.DEPTH_WRITEMASK);
      draw({pathGroup:3,pathPoints:false}); const markerOff = pixel(37,96),centerOff=pixel(32,96),cornerOff=pixel(38,102);
      draw({pathPoints:true}); const markerOn = pixel(37,96),centerOn=pixel(32,96),cornerOn=pixel(38,102),singlePointDraws = {...renderer.pathDraws};
      draw({paths:false}); const terrainAfter = pixel(64,32);
      renderer.setScene(scene); const deletedOnReplace = deleted;
      renderer.clear();
      const deletedTotal=deleted;
      // Both directions share a physical segment: the previous offset dash
      // phases filled the midpoint gap and made this connection look solid.
      const a=[-.75,0,-.5],b=[.75,0,-.5];
      renderer.setScene({...scene,paths:{groups:[{index:1,positions:[a]},{index:2,positions:[b]}],graph:{nodes:[{id:'a',group:1,position:a,incoming:['b'],outgoing:['b']},{id:'b',group:2,position:b,incoming:['a'],outgoing:['a']}],edges:[{from:'a',to:'b',kind:'branch',branchSlots:[0]},{from:'b',to:'a',kind:'branch',branchSlots:[0]}],pendingEdges:[]}}});
      draw({paths:false,pathPoints:false,pathGroup:-1});const gapBase=pixel(64,64),dashBase=pixel(40,64);
      draw({paths:true,pathThrough:true});const dashGap=pixel(64,64),dashInk=pixel(40,64);renderer.clear();
      return {terrain,markerBase,occluded,marker,visible,noClosingEdge,restored,markerOff,markerOn,centerOff,centerOn,cornerOff,cornerOn,singlePointDraws,terrainAfter,deletedOnReplace,deletedTotal,gapBase,dashBase,dashGap,dashInk,dashDeletedTotal:deleted,error:gl.getError()};
    } finally { renderer.clear(); gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove(); }
  }, bundle);
  assert.deepEqual(result.occluded, result.terrain);
  assert.notDeepEqual(result.visible, result.terrain);
  assert.deepEqual(result.noClosingEdge, result.terrain);
  assert.notDeepEqual(result.marker, result.markerBase);
  assert.deepEqual(result.markerOff, result.markerBase);
  assert.deepEqual(result.markerOn, result.marker);
  assert.deepEqual(result.centerOn,result.centerOff,'Small point circles have a hollow centre');
  assert.deepEqual(result.cornerOn,result.cornerOff,'Small point circles discard square corners');
  assert.deepEqual(result.dashGap,result.gapBase,'Reciprocal branch arrows preserve their visible midpoint gap');
  assert.notDeepEqual(result.dashInk,result.dashBase,'Reciprocal branch arrows still draw their dashes');
  assert.deepEqual(result.terrainAfter, result.terrain);
  assert.equal(result.restored, true);
  assert.equal(result.singlePointDraws.segments, 0);
  assert.equal(result.singlePointDraws.points, 1);
  assert.equal(result.deletedOnReplace, 3); assert.equal(result.deletedTotal, 6);
  assert.equal(result.dashDeletedTotal,10);
  assert.equal(result.error, 0);
  return result;
}
