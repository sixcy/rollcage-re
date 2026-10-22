import {SOLO_STEP_SECONDS} from '../../src/solo-session.mjs';
import {interpolateRacingPresentation} from './solo-presentation.mjs';

// 441c70's timer factor and the native HUD clock establish 30 logical ticks/s.
// Render scheduling and hidden-tab policy remain viewer behavior.
export class SoloController {
  constructor(session) { this.session = session; this.state = 'ready'; this.accumulator = 0; this.message = ''; this.syncPresentation(); }
  get snapshot() { return this.session.snapshot; }
  get renderAlpha() { return this.state === 'running' ? Math.max(0, Math.min(1, this.accumulator / SOLO_STEP_SECONDS)) : 1; }
  get renderSnapshot() { return this.state === 'running' ? interpolateRacingPresentation(this.previous, this.current, this.renderAlpha) : this.snapshot; }
  syncPresentation() { this.previous = this.current = this.snapshot; }
  start() { if (this.state === 'ready' || this.state === 'paused') { this.syncPresentation(); this.state = 'running'; this.accumulator = 0; } }
  pause() { if (this.state === 'running') {this.state = 'paused'; this.syncPresentation();} this.accumulator = 0; }
  stepFrame() {
    if (this.state !== 'ready' && this.state !== 'paused') return false;
    this.accumulator = 0;
    try { this.session.step(); this.syncPresentation(); this.state = 'paused'; return true; }
    catch (error) { this.state = 'error'; this.message = error.message; return false; }
  }
  requestRecovery(index = 0) {
    if (!['ready', 'paused', 'running'].includes(this.state)) return false;
    try { this.session.requestRecovery(index); }
    catch (error) { this.state = 'error'; this.accumulator = 0; this.message = error.message; return false; }
    return this.state === 'running' ? true : this.stepFrame();
  }
  reset() {
    this.accumulator = 0; this.message = ''; this.state = 'ready';
    try { this.session.reset(); this.syncPresentation(); } catch (error) { this.state = 'error'; this.message = error.message; }
  }
  advance(seconds) {
    if (this.state !== 'running') return;
    // Limit catch-up to eight ticks; slow rendering slows practice, never
    // stretches physics dt or queues minutes of hidden/background time.
    this.accumulator += Math.min(Math.max(0, seconds), SOLO_STEP_SECONDS * 8);
    try {
      while (this.accumulator + 1e-10 >= SOLO_STEP_SECONDS) {
        this.previous = this.current; this.session.step(); this.current = this.snapshot; this.accumulator -= SOLO_STEP_SECONDS;
      }
    } catch (error) { this.state = 'error'; this.accumulator = 0; this.message = error.message; }
  }
  dispose() { this.session.dispose(); this.state = 'disposed'; }
}
