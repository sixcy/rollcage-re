// Native producers 40f310/4130c0/44fbc0 encode the six low texture-ID bits
// at0..5 and the next three at8..10. Bits6/7 and11..15 are packet flags.
// 407ee0/408270 initialize/free the512-entry logical texture map at6e1620.
export const TEXTURE_PAGE_INDEX_MASK=0x073f;
export const TEXTURE_PAGE_FLAGS_MASK=0xf8c0;
export const NATIVE_TEXTURE_PAGE_COUNT=512;
const word=value=>{if(!Number.isInteger(value)||value<0||value>65535)throw Error('Texture page word requires an unsigned16-bit value.');return value;};
export function decodeTexturePageWord(value) {value=word(value);return (value&63)|((value>>>2)&448);}
export function encodeTexturePageWord(index,previousWord=0) {
  if(!Number.isInteger(index)||index<0||index>=NATIVE_TEXTURE_PAGE_COUNT)throw Error('Texture page index exceeds the native512-entry map.');
  return (word(previousWord)&TEXTURE_PAGE_FLAGS_MASK)|(index&63)|((index&448)<<2);
}
export function isSupportedStaticTextureWord(value) {return Number.isInteger(value)&&value>=0&&value<=65535&&(value&TEXTURE_PAGE_FLAGS_MASK&~0x40)===0;}

// Original installed startup, not an invented renderer bound: <=2 backdrop
// clouds(4130c0), one rain/snow texture(401b70/401be0), fixed112-glyph HUD
// passes with46x50/16x100 cells(439150/44fbc0; <=11 shelf-packed pages),
// Timewarp+procedural target+12 Icesheet256-square tiles(4900a0/409bd0).
// Original Icesheet.jpg is1024x640; enlarged external bitmap replacements
// are outside this original-installed asset contract.
export const TRACK_RUNTIME_TEXTURE_RESERVE=Object.freeze({clouds:2,weather:1,hudFonts:11,timewarp:1,procedural:1,iceTiles:12,total:28});
export function trackTextureCapacity(textureCount) {
  if(!Number.isInteger(textureCount)||textureCount<0)throw Error('Invalid authored texture count.');
  const reserved63Skip=textureCount<=63?1:0,required=textureCount+TRACK_RUNTIME_TEXTURE_RESERVE.total+reserved63Skip;
  return {nativeSlots:NATIVE_TEXTURE_PAGE_COUNT,authoredCount:textureCount,runtimeReserve:TRACK_RUNTIME_TEXTURE_RESERVE.total,reserved63Skip,remaining:NATIVE_TEXTURE_PAGE_COUNT-required,valid:required<=NATIVE_TEXTURE_PAGE_COUNT};
}
