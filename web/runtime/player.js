import {sampleTimeline, validateManifest} from './timeline.js';

export class MVPlayer {
  constructor(manifest, clock, {lowPower = false, onchange = () => {}} = {}) {
    this.manifest = validateManifest(manifest);
    this.clock = clock;
    this.lowPower = lowPower;
    this.onchange = onchange;
    this.tracked = false;
    this.visible = true;
    this.authorized = false;
    this.wantsPlay = false;
    this.unlocking = false;
    this.state = 'ready';
    this.error = null;
    this.clock.onended = () => this.tick();
  }
  async start() {
    if (this.unlocking) return;
    this.unlocking = true;
    this.wantsPlay = true;
    try {
      // Called synchronously within the Start/Resume user gesture.
      await this.clock.unlock();
      this.authorized = true;
      this.error = null;
      if (this.clock.now() >= this.manifest.duration) this.clock.seek(0);
      this.sync();
    } catch (error) {
      this.error = error.message;
      this.wantsPlay = false;
      this.state = 'error';
      this.onchange(this);
    } finally { this.unlocking = false; }
  }
  pause() { this.wantsPlay = false; this.sync(); }
  restart() { this.clock.pause(); this.clock.seek(0); return this.start(); }
  targetFound(name) { if (name === this.manifest.target) { this.tracked = true; this.sync(); } }
  targetLost(name) { if (name === this.manifest.target) { this.tracked = false; this.sync(); } }
  setVisible(visible) { this.visible = visible; this.sync(); }
  sync() {
    const allowed = this.tracked || this.manifest.tracking_lost_policy === 'continue';
    if (!this.wantsPlay || !this.authorized || !this.visible || !allowed) {
      this.clock.pause();
      this.state = !this.visible || (this.authorized && !this.wantsPlay) ? 'paused' :
        this.authorized && !allowed ? 'waiting-target' : 'ready';
    } else if (this.clock.now() < this.manifest.duration) {
      this.clock.play();
      this.state = 'playing';
    }
    this.onchange(this);
  }
  tick() {
    const time = this.clock.now();
    if (time >= this.manifest.duration) {
      this.clock.pause();
      this.wantsPlay = false;
      this.state = 'ended';
    }
    return sampleTimeline(this.manifest, time, this.lowPower);
  }
}
