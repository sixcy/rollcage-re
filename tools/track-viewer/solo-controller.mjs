import {SOLO_STEP_SECONDS} from '../../src/solo-session.mjs';

// Viewer pacing is deliberately explicit: one recovered tick at 60 Hz.
// Native 90a548 still increments by one per tick; UI times use viewer seconds.
export class SoloController {
  constructor(session) { this.session = session; this.state = 'ready'; this.accumulator = 0; this.message = ''; }
  get snapshot() { return this.session.snapshot; }
  start() { if (this.state === 'ready' || this.state === 'paused') { this.state = 'running'; this.accumulator = 0; } }
  pause() { if (this.state === 'running') this.state = 'paused'; this.accumulator = 0; }
  reset() {
    this.accumulator = 0; this.message = ''; this.state = 'ready';
    try { this.session.reset(); } catch (error) { this.state = 'error'; this.message = error.message; }
  }
  advance(seconds) {
    if (this.state !== 'running') return;
    // Limit catch-up to eight ticks; slow rendering slows practice, never
    // stretches physics dt or queues minutes of hidden/background time.
    this.accumulator += Math.min(Math.max(0, seconds), SOLO_STEP_SECONDS * 8);
    try {
      while (this.accumulator + 1e-10 >= SOLO_STEP_SECONDS) { this.session.step(); this.accumulator -= SOLO_STEP_SECONDS; }
    } catch (error) { this.state = 'error'; this.accumulator = 0; this.message = error.message; }
  }
  dispose() { this.session.dispose(); this.state = 'disposed'; }
}
