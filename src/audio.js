// A synthesised parallel twin. No samples; starts only after a user gesture.
export class Engine {
  constructor() { this.ctx = null; this.on = false; }
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = 0;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);

      this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 4;
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 3.2); }
      shaper.curve = curve;
      this.pulse = c.createGain(); this.pulse.gain.value = 0.5;
      shaper.connect(this.filter).connect(this.pulse).connect(this.master);

      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
      this.o2 = c.createOscillator(); this.o2.type = 'square';
      this.o3 = c.createOscillator(); this.o3.type = 'sine';
      const g1 = c.createGain(); g1.gain.value = 0.6;
      const g2 = c.createGain(); g2.gain.value = 0.18;
      const g3 = c.createGain(); g3.gain.value = 0.7;
      this.o1.connect(g1).connect(shaper); this.o2.connect(g2).connect(shaper); this.o3.connect(g3).connect(shaper);

      // combustion lumpiness: amplitude LFO at half firing rate (uneven 270° twin feel)
      this.lfo = c.createOscillator(); this.lfo.type = 'triangle';
      const lg = c.createGain(); lg.gain.value = 0.45;
      this.lfo.connect(lg).connect(this.pulse.gain);

      // intake/mechanical noise
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = c.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
      this.nf = c.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.Q.value = 0.8;
      this.ng = c.createGain(); this.ng.gain.value = 0.05;
      this.noise.connect(this.nf).connect(this.ng).connect(this.master);
      [this.o1, this.o2, this.o3, this.lfo, this.noise].forEach((o) => o.start());
    }
    this.ctx.resume?.();
    this.on = true;
  }
  set(rpm, level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = rpm / 60; // firings per second for a 4-stroke twin
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 2, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.filter.frequency.setTargetAtTime(260 + rpm * 0.16, t, 0.04);
    this.nf.frequency.setTargetAtTime(500 + rpm * 0.25, t, 0.05);
    this.ng.gain.setTargetAtTime(0.02 + (rpm / 9500) * 0.08, t, 0.05);
    this.master.gain.setTargetAtTime(this.on ? level : 0, t, 0.12);
  }
  stop() { this.on = false; }
}
