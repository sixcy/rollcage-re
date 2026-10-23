// The runtime keeps native axes; the viewer applies S=diag(1,-1,-1) once.
export function carDisplayMatrix({position, rotation}) {
  const signs = [1,-1,-1], matrix = new Float32Array(16);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) matrix[column * 4 + row] = signs[row] * rotation[row * 3 + column] * signs[column];
  for (let axis = 0; axis < 3; axis++) matrix[12 + axis] = position[axis] * signs[axis];
  matrix[15] = 1;
  return matrix;
}

//Display only: interpolate two completed30Hz states at the render clock.
//Never write these floating-point poses back to native simulation memory.
const mix = (a, b, amount) => a + (b - a) * amount;
function rotationQuaternion(matrix) {
  const scale = [0,1,2].map(column => Math.hypot(matrix[column], matrix[column + 3], matrix[column + 6]));
  if (scale.some(value => value < 1e-12)) return null;
  const m = matrix.map((value, index) => value / scale[index % 3]), trace = m[0] + m[4] + m[8];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
  }
  const length = Math.hypot(...q);
  return {quaternion: q.map(value => value / length), scale};
}
function blendRotation(before, after, amount) {
  const first = rotationQuaternion(before), second = rotationQuaternion(after);
  if (!first || !second) return after.slice();
  const a = first.quaternion, b = second.quaternion;
  let dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  if (dot < 0) {for (let index = 0; index < 4; index++) b[index] = -b[index]; dot = -dot;}
  let q;
  if (dot > 0.9995) q = a.map((value, index) => mix(value, b[index], amount));
  else {
    const angle = Math.acos(Math.min(1, dot)), sine = Math.sin(angle);
    const left = Math.sin((1 - amount) * angle) / sine, right = Math.sin(amount * angle) / sine;
    q = a.map((value, index) => value * left + b[index] * right);
  }
  const length = Math.hypot(...q), [x,y,z,w] = q.map(value => value / length);
  const rotation = [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)];
  return rotation.map((value, index) => value * mix(first.scale[index % 3], second.scale[index % 3], amount));
}
function blendPose(before, after, amount) {
  if (!before || !after || amount >= 1) return after;
  if (amount <= 0) return {...after, position: before.position, rotation: before.rotation};
  return {...after, position: before.position.map((value, index) => mix(value, after.position[index], amount)), rotation: blendRotation(before.rotation, after.rotation, amount)};
}
function blendCar(before, after, amount) {
  //Respawn is a discontinuity, never a drive across the intervening scenery.
  if (!before || before.recoveries !== after.recoveries || before.parts?.length !== after.parts?.length) return after;
  const parts = after.parts.map((part, index) => blendPose(before.parts[index], part, amount));
  return {...after, position: parts[0].position, rotation: parts[0].rotation, parts};
}
export function interpolateRacingPresentation(before, after, amount) {
  if (!before || !after || !after.parts || amount >= 1) return after;
  const alpha = Math.max(0, Math.min(1, amount));
  const cars = after.cars?.map((car, index) => blendCar(before.cars?.[index], car, alpha));
  const first = cars?.[0] ?? blendCar(before, after, alpha);
  const worldObjects = after.worldObjects?.map((object, index) => {
    const previous = before.worldObjects?.[index];
    return previous?.placementIndex === object.placementIndex && previous.visible === object.visible ? blendPose(previous, object, alpha) : object;
  });
  const terrain = after.terrain && {...after.terrain, segments: after.terrain.segments.map(segment => {
    const previous = before.terrain?.segments.find(row => row.index === segment.index);
    if (!previous || previous.vertices.length !== segment.vertices.length) return segment;
    return {...segment, vertices: segment.vertices.map((vertex, index) => vertex.map((value, axis) => axis < 3 ? mix(previous.vertices[index][axis], value, alpha) : value))};
  })};
  return {...after, ...first, ...(cars ? {cars} : {}), ...(worldObjects ? {worldObjects} : {}), ...(terrain ? {terrain} : {})};
}

export function formatPracticeTime(seconds) {
  if (seconds === null) return '—';
  const centiseconds = Math.floor(seconds * 100 + 1e-6);
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
