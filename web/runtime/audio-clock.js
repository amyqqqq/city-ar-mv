export class AudioClock {
  constructor(context, buffer, duration = 15) {
    this.context = context;
    this.buffer = buffer;
    this.duration = duration;
    this.offset = 0;
    this.anchor = 0;
    this.source = null;
    this.onended = () => {};
  }
  unlock() { return this.context.resume(); }
  now() {
    return Math.min(this.duration, this.offset + (this.source ? Math.max(0, this.context.currentTime - this.anchor) : 0));
  }
  play() {
    if (this.source || this.offset >= this.duration) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    this.anchor = this.context.currentTime;
    this.source = source;
    source.onended = () => {
      if (this.source !== source) return;
      this.offset = this.duration;
      this.source = null;
      source.disconnect();
      this.onended();
    };
    source.start(this.anchor, this.offset, this.duration - this.offset);
  }
  pause() {
    this.offset = this.now();
    const old = this.source;
    this.source = null;
    if (old) { old.stop(); old.disconnect(); }
  }
  seek(time) {
    const running = Boolean(this.source);
    this.pause();
    this.offset = Math.max(0, Math.min(this.duration, time));
    if (running) this.play();
  }
}
