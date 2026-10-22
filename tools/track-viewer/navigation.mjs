const add = (a, b, scale = 1) => a.map((n, i) => n + b[i] * scale);
const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalize = a => { const length = Math.hypot(...a) || 1; return a.map(n => n / length); };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export class Navigation {
  constructor() { this.reset([[-1, 1], [-1, 1], [-1, 1]]); }
  reset(bounds) {
    this.radius = Math.max(1, Math.hypot(...bounds.map(([min, max]) => max - min)) / 2);
    this.target = bounds.map(([min, max]) => (min + max) / 2);
    this.yaw = 0.4; this.pitch = 0.85; this.distance = this.radius * 2.6;
    this.speed = this.radius * 0.35; this.mode = 'orbit'; this.eye = this.orbitEye();
  }
  forward() { return [-Math.sin(this.yaw)*Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw)*Math.cos(this.pitch)]; }
  right() { return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)]; }
  up() { return cross(this.right(), this.forward()); }
  orbitEye() { return add(this.target, this.forward(), -this.distance); }
  position() { return this.mode !== 'fly' ? this.orbitEye() : [...this.eye]; }
  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'fly') this.eye = this.orbitEye();
    else if (this.mode === 'fly') this.target = add(this.eye, this.forward(), this.distance);
    this.mode = mode;
  }
  follow(car, seconds, reset = false) {
    const target = [car.position[0], -car.position[1] + 25, -car.position[2]];
    const heading = Math.atan2(-car.rotation[2], car.rotation[8]);
    const amount = reset ? 1 : 1 - Math.exp(-Math.max(0, seconds) * 7);
    this.target = this.target.map((value, i) => value + (target[i] - value) * amount);
    const difference = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    this.yaw += difference * amount; this.pitch = 0.3; this.distance = 280;
    this.mode = 'follow';
  }
  look(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.006, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }
  pan(dx, dy, height) {
    const units = 2 * this.distance * Math.tan(Math.PI / 8) / Math.max(1, height);
    this.target = add(add(this.target, this.right(), -dx * units), this.up(), dy * units);
  }
  wheel(delta) {
    if (this.mode === 'fly') this.speed = clamp(this.speed * Math.exp(-delta * 0.001), this.radius * 0.001, this.radius * 10);
    else this.distance = clamp(this.distance * Math.exp(delta * 0.001), this.radius * 0.003, this.radius * 10);
  }
  step(keys, seconds) {
    if (this.mode === 'follow') return;
    const dt = clamp(seconds, 0, 0.05), pressed = (...codes) => codes.some(code => keys.has(code)) ? 1 : 0;
    const fast = pressed('ShiftLeft', 'ShiftRight') ? 4 : 1;
    const horizontal = pressed('KeyD') - pressed('KeyA'), vertical = pressed('KeyW') - pressed('KeyS');
    this.look((pressed('ArrowRight') - pressed('ArrowLeft')) * dt * 160,
      (pressed('ArrowDown') - pressed('ArrowUp')) * dt * 160);
    if (this.mode === 'fly') {
      const rise = pressed('KeyE') - pressed('KeyQ');
      let direction = add(add(this.forward().map(n => n * vertical), this.right(), horizontal), [0, 1, 0], rise);
      direction = normalize(direction);
      this.eye = add(this.eye, direction, this.speed * fast * dt);
    } else {
      const length = Math.hypot(horizontal, vertical) || 1;
      this.target = add(add(this.target, this.right(), horizontal / length * this.distance * dt * fast * 0.6),
        this.up(), vertical / length * this.distance * dt * fast * 0.6);
      this.wheel((pressed('Minus', 'NumpadSubtract') - pressed('Equal', 'NumpadAdd')) * dt * 1200);
    }
  }
  matrix(aspect) {
    const eye = this.position(), z = this.forward().map(n => -n), x = this.right(), y = cross(z, x);
    const view = [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
    const near = Math.max(this.radius * 0.00002, 0.01);
    const far = Math.max(this.radius * 30, Math.hypot(...eye.map((n, i) => n - this.target[i])) + this.radius * 3);
    const f = 1 / Math.tan(Math.PI / 8);
    const projection = [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c*4+r] += projection[k*4+r]*view[c*4+k];
    return out;
  }
}
