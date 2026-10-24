//Fixed module data operands and values read from native pointers have different
//address roles. Only explicit instruction-global call sites use this helper.
const globalRoutes = new WeakMap();
export const nativeExplicitGlobalDomain = Object.freeze({start:0x902000,end:0x903300});
export const nativeExplicitGlobalDomains = Object.freeze([
  Object.freeze({start:0x80b5e0,end:0x812660}),
  Object.freeze({start:0x82e880,end:0x8479d0}),
  nativeExplicitGlobalDomain,
  Object.freeze({start:0x91cd60,end:0x91d360}),
]);

export function registerNativeGlobalAddresses(memory,routes){
  if(!Buffer.isBuffer(memory)||globalRoutes.has(memory)||!Array.isArray(routes))throw Error('Native globals require one explicit memory/route registration.');
  const declared=routes.map(({address,targetAddress,length})=>{
    if(!Number.isSafeInteger(address)||!Number.isSafeInteger(targetAddress)||!Number.isSafeInteger(length)||length<=0||!nativeExplicitGlobalDomains.some(domain=>address>=domain.start&&address+length<=domain.end)||targetAddress<0||targetAddress+length>0x100000000)throw Error('Invalid explicit native global route.');
    return {address,targetAddress,length};
  }).sort((a,b)=>a.address-b.address);
  for(let i=1;i<declared.length;i++)if(declared[i-1].address+declared[i-1].length>declared[i].address)throw Error('Explicit native global routes overlap.');
  globalRoutes.set(memory,declared);
}

export function nativeGlobalAddress(memory,preferredAddress){
  if(!Buffer.isBuffer(memory)||!Number.isSafeInteger(preferredAddress)||preferredAddress<0||preferredAddress>0xffffffff)throw Error('Native global access requires a fixed uint32 operand and memory.');
  const routes=globalRoutes.get(memory);
  //Ordinary original-base buffers and legacy sparse facades retain their
  //existing storage contract. This never guesses a native module or pointer.
  if(!routes)return preferredAddress;
  if(!nativeExplicitGlobalDomains.some(domain=>preferredAddress>=domain.start&&preferredAddress<domain.end))throw Error('Native global operand is outside the explicitly migrated domain.');
  const route=routes.find(row=>preferredAddress>=row.address&&preferredAddress<row.address+row.length);
  if(!route)throw Error(`Unobserved native global operand0x${preferredAddress.toString(16)}.`);
  return route.targetAddress+preferredAddress-route.address;
}
