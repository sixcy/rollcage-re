//The bounded interpreter's opaque external service does not push a return
//word. These are original CPU CALL stores, needed when later game cleanup
//publishes the same private stack bytes. COM internals remain opaque.
export const rendererTextureExternalReturnStores = new Map([
  [0x4a3295, 0x4a329b],
  [0x51f2dd, 0x51f2e0], [0x51f334, 0x51f337], [0x51f35b, 0x51f35e],
  [0x520120, 0x520123], [0x52013a, 0x52013d], [0x52016e, 0x520171], [0x52017c, 0x52017f],
  [0x520212, 0x520215], [0x520254, 0x520257], [0x520293, 0x520296], [0x5202c9, 0x5202cc],
  [0x5202e0, 0x5202e3], [0x520314, 0x520317], [0x520322, 0x520325],
]);
