// Complete only the native geometry header fields omitted by older synthetic
// candidate/simulation fixtures. This helper produces test inputs, never runtime
// evidence, and does not load or infer anything from an installed archive.
export function completeNativeFrameGeometryFixture(fixture, {headerAddress = 0x8d000, packAddress = fixture.memory.readUInt32LE(0x90b98c) || 0x909240} = {}) {
  const {memory, addresses: a} = fixture;
  const grid = fixture.grid, models = fixture.models;
  if (!Buffer.isBuffer(memory) || !a || !grid?.sectors || !grid?.spatial?.nodes) throw Error('Expected a declared connected geometry fixture.');
  memory.writeUInt32LE(packAddress, 0x90b98c); memory.writeUInt32LE(headerAddress, 0x90b990);
  memory.writeUInt32LE(grid.spatial.nodes.length, headerAddress + 12);
  const linkCount = Math.max(0, ...grid.spatial.nodes.map(node => (node.boundsWord >>> 22) + (node.boundsWord >>> 19 & 7))) + 1;
  memory.writeUInt16LE(linkCount, headerAddress + 0x96);
  for (const [offset,value] of [[0,a.sectors],[0x10,grid.sectors.length],[0x14,a.rows],[0x1c,a.normals],[0x20,grid.normals.length],[0x38,a.nodes],[0x7c,a.links],[0x80,a.regions]]) memory.writeUInt32LE(value,packAddress+offset);
  for (const sector of grid.sectors) memory.writeUInt32LE(sector.rows,memory.readUInt32LE(a.sectors+sector.index*4)+12);
  for (const instance of models?.instances?.values() ?? []) {
    const {object} = fixture.candidateMapping.modelPointersFor({...instance,shape:instance.collision.shapes[0]}), model=memory.readUInt32LE(object+0x10);
    memory.writeUInt16LE(instance.collision.vertices.length,model+4); memory.writeUInt16LE(instance.collision.faces.length,model+6);
  }
  return {headerAddress,packAddress};
}
