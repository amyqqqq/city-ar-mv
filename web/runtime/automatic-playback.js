import {sampleTimeline} from './timeline.js';

export function desktopDebug({search='', userAgent='', platform='', maxTouchPoints=0, mobile=false} = {}) {
  const handheld = mobile || /Android|iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return !handheld && new URLSearchParams(search).get('debug') === '1';
}

// Real tracking can arrive before media decoding; remember it without simulating detection.
export class AutomaticPlayback {
  constructor(manifest, onGesture = () => {}) {
    this.manifest = manifest;
    this.onGesture = onGesture;
    this.player = null;
    this.tracked = false;
    this.pending = false;
    this.stopped = false;
    this.manuallyPaused = false;
    this.gestureVisible = false;
  }
  setGesture(show) {
    if (show === this.gestureVisible) return;
    this.gestureVisible = show;
    this.onGesture(show);
  }
  bind(player) {
    this.player = player;
    if (this.tracked) player.targetFound(this.manifest.target);
    return this.activate();
  }
  tick() { return this.player ? this.player.tick() : sampleTimeline(this.manifest, 0, true); }
  targetFound(name) {
    if (name !== this.manifest.target) return;
    this.tracked = true;
    this.player?.targetFound(name);
    if (!this.manuallyPaused) return this.activate();
  }
  targetLost(name) {
    if (name !== this.manifest.target) return;
    this.tracked = false;
    this.player?.targetLost(name);
  }
  async activate(gesture = false, replay = false) {
    if (!this.player || this.stopped || this.pending) return;
    // A suspended resume() may never settle without user activation. Keep XR independent.
    if (!gesture && this.player.clock.context.state !== 'running') {
      this.setGesture(true);
      return;
    }
    this.pending = true;
    this.manuallyPaused = false;
    try {
      // No await precedes resume: keep the real button/tap gesture.
      await (replay ? this.player.restart() : this.player.start());
      if (!this.stopped) this.setGesture(this.player.clock.context.state !== 'running' || !this.player.authorized);
    } finally { this.pending = false; }
  }
  pause() { this.manuallyPaused = true; this.player?.pause(); }
  replay() { return this.activate(true, true); }
  setVisible(visible) {
    this.player?.setVisible(visible);
    if (visible && !this.manuallyPaused && this.player && this.player.clock.now() < this.manifest.duration) return this.activate();
  }
  interrupt() { this.player?.pause(); }
  stop() { this.stopped = true; this.player?.pause(); this.setGesture(false); }
}
