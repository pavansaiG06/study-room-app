// Zero-dependency procedural Web Audio Soundscape Mixer (LifeAt-style ambient focus audio)

export const SOUNDSCAPE_TRACKS = [
  { id: 'rain', label: 'Soft Rain', emoji: '🌧️', desc: 'Filtered rainfall patter' },
  { id: 'cafe', label: 'Warm Café', emoji: '☕', desc: 'Cozy low murmur ambience' },
  { id: 'forest', label: 'Forest Wind', emoji: '🌿', desc: 'Gentle modulated breeze' },
  { id: 'lofi', label: 'Warm Pad', emoji: '🎧', desc: 'Calm ambient focus drone' },
  { id: 'white', label: 'Study Noise', emoji: '📚', desc: 'Soft brown/pink noise block' }
];

class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.tracks = {};
    this.volumes = { rain: 0, cafe: 0, forest: 0, lofi: 0, white: 0 };
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  createNoiseBuffer(ctx, seconds = 3, type = 'pink') {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let lastOut = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 2.5;
      } else {
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      }
    }
    return buffer;
  }

  startTrack(id) {
    const ctx = this.ensureContext();
    if (!ctx || this.tracks[id]) return;

    const masterGain = ctx.createGain();
    masterGain.gain.value = (this.volumes[id] || 0) / 100 * 0.35;
    masterGain.connect(ctx.destination);

    const disposables = [];

    if (id === 'lofi') {
      // Soft fifth chord warm pad
      [146.83, 220.0, 261.63].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const oscGain = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        oscGain.gain.value = 0.08;
        osc.connect(filter);
        filter.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        disposables.push(osc);
      });
    } else {
      const source = ctx.createBufferSource();
      source.buffer = this.createNoiseBuffer(ctx, 4, id === 'cafe' || id === 'rain' ? 'brown' : 'pink');
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      if (id === 'rain') {
        filter.type = 'bandpass';
        filter.frequency.value = 950;
        filter.Q.value = 0.55;
      } else if (id === 'cafe') {
        filter.type = 'lowpass';
        filter.frequency.value = 480;
      } else if (id === 'forest') {
        filter.type = 'bandpass';
        filter.frequency.value = 520;
        filter.Q.value = 1.1;

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.16;
        lfoGain.gain.value = 210;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        disposables.push(lfo);
      } else {
        filter.type = 'lowpass';
        filter.frequency.value = 800;
      }

      source.connect(filter);
      filter.connect(masterGain);
      source.start();
      disposables.push(source);
    }

    this.tracks[id] = { masterGain, disposables };
  }

  stopTrack(id) {
    const entry = this.tracks[id];
    if (!entry) return;
    entry.disposables.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    });
    try {
      entry.masterGain.disconnect();
    } catch {}
    delete this.tracks[id];
  }

  setVolume(id, value) {
    const vol = Math.min(Math.max(Number(value) || 0, 0), 100);
    this.volumes[id] = vol;
    if (vol === 0) {
      this.stopTrack(id);
    } else {
      if (!this.tracks[id]) this.startTrack(id);
      const entry = this.tracks[id];
      if (entry && this.ctx) {
        entry.masterGain.gain.setTargetAtTime((vol / 100) * 0.35, this.ctx.currentTime, 0.08);
      }
    }
    return { ...this.volumes };
  }

  stopAll() {
    Object.keys(this.tracks).forEach((id) => this.stopTrack(id));
    this.volumes = { rain: 0, cafe: 0, forest: 0, lofi: 0, white: 0 };
    return { ...this.volumes };
  }
}

export const ambientEngine = new AmbientAudioEngine();
