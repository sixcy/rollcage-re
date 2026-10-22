import {getViewportApplication} from './weather-viewport.mjs';
import {updateCameraViewportScale} from './camera-viewport.mjs';
import {updateCameraAspectProjection} from './camera-projection.mjs';
import {removeBodySpatial} from './body-retirement.mjs';
import {registerRawBodySpatial} from './raw-body-construction.mjs';

const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), short = v => (v << 16) >> 16;
const cLength = (m, p) => {let end = p; while (m[end]) end++; return end - p;};

//41a6c0. Publish the participant camera pose, optional named viewport scalar,
//actual aspect/projection graph and camera-body spatial relocation. The pose
//and participant/controller references are live after all viewport calls.
export function publishCameraPose(participant, pose, smooth, name, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 44;
  put(m, scratchBase + 4, smooth); put(m, scratchBase + 8, name);
  put(m, frame + 0x1c, participant); put(m, frame + 0x28, pose);
  const speed = m.readInt16LE(ptr(m, participant) + 0x668), option = m[ptr(m, 0x5ecefc) + 0x95];
  const scaled = Math.imul(Math.min(speed, option ? 450 : 425), option ? 6 : 5) >> 4;
  put(m, frame + 0x18, (200 - scaled) & 65535);
  const limit = m[ptr(m, 0x5ecb1c) + 0x587] ? 525 : 425;
  m.writeFloatLE(speed > limit ? m.readFloatLE(0x5dc774) : speed > 300 ? Math.fround(Math.fround(speed - 300) / Math.fround(limit - 300)) : 0, frame + 0x14);
  const length = cLength(m, name), flag = get(m, 0x91ce90) & 2;
  if ((!length && !flag) || (length && flag)) {
    //The incoming name can be replaced by the current viewport's inline/heap
    //std::string only in this call's registers, leaving the argument intact.
    let selected = name;
    if (!cLength(m, selected)) {
      const current = ptr(m, 0x6efb3c);
      selected = current ? ptr(m, current + 0x28) >= 16 ? ptr(m, current + 0x14) : current + 0x14 : 0;
    }
    if (selected) {
      const mode = get(m, frame + 0x30) ? 0 : 1;
      put(m, frame - 4, mode); put(m, frame - 8, selected);
      const application = getViewportApplication({...runtime, scratchBase: frame - 12});
      const value = mode ? 0 : m.readFloatLE(frame + 0x14);
      updateCameraViewportScale(application, selected, mode, value, {...runtime, scratchBase: frame - 12});
    }
  }
  updateCameraAspectProjection(get(m, frame + 0x18), {...runtime, scratchBase: frame - 4});
  //Read desired XYZ first, then the tracked body behind the controller. Native
  //numeric locals preserve original target coordinates through spatial updates.
  let x = get(m, pose), y = get(m, pose + 4), z = get(m, pose + 8);
  const owner = ptr(m, frame + 0x1c), tracked = ptr(m, ptr(m, owner + 0x18) + 4);
  const targetX = get(m, tracked + 0x34); x = (x - targetX) | 0; put(m, frame + 0x24, targetX);
  const targetY = get(m, tracked + 0x38); y = (y - targetY) | 0;
  const targetZ = get(m, tracked + 0x3c); z = (z - targetZ) | 0; put(m, frame + 0x20, targetZ); put(m, frame + 0x14, targetY);
  const multiplier = m[ptr(m, 0x5ecefc) + 0x95] ? 200 : 240;
  const adjusted = short(200 - (Math.imul(200 - short(get(m, frame + 0x18)), multiplier) >> 8));
  const ratio = Math.trunc((adjusted << 8) / 104) | 0;
  let weight = (480 - ratio) | 0;
  x = Math.imul(x >> 8, ratio); y = Math.imul(y >> 8, ratio); z = Math.imul(z >> 8, ratio);
  if (weight > 480) weight = 480;
  if (weight > 0) {
    const controller = ptr(m, ptr(m, frame + 0x1c) + 0x18);
    x = (x + Math.imul(get(m, controller + 8) >> 4, weight)) | 0;
    y = (y + Math.imul(get(m, controller + 12) >> 4, weight)) | 0;
    z = (z + Math.imul(get(m, controller + 16) >> 4, weight)) | 0;
  }
  const output = ptr(m, frame + 0x28), finalX = (get(m, frame + 0x24) + x) | 0, finalY = (get(m, frame + 0x14) + y) | 0, finalZ = (get(m, frame + 0x20) + z) | 0;
  const originalOwner = ptr(m, frame + 0x1c);
  put(m, output, finalX); put(m, output + 4, finalY); put(m, output + 8, finalZ);
  removeBodySpatial(ptr(m, ptr(m, originalOwner + 0x18)), {...runtime, scratchBase: frame - 4});
  //The final474600 tail calls4286e0 atentry-28. Its actual return address
  //survives into417b50's short20 local: that child writes only the low word.
  //Preserve the proven producer rather than initialize the stale high word.
  put(m, scratchBase - 28, 0x474619);
  registerRawBodySpatial(ptr(m, ptr(m, originalOwner + 0x18)), runtime);
}
