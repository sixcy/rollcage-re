// The runtime keeps native axes; the viewer applies S=diag(1,-1,-1) once.
export function carDisplayMatrix({position, rotation}) {
  const signs = [1,-1,-1], matrix = new Float32Array(16);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) matrix[column * 4 + row] = signs[row] * rotation[row * 3 + column] * signs[column];
  for (let axis = 0; axis < 3; axis++) matrix[12 + axis] = position[axis] * signs[axis];
  matrix[15] = 1;
  return matrix;
}

export function formatPracticeTime(seconds) {
  if (seconds === null) return '—';
  const centiseconds = Math.floor(seconds * 100 + 1e-6);
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
