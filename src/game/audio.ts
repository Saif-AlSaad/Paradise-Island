// Procedural Web Audio engine — no external assets needed.
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientNodes: AudioNode[] = [];
  volume = 0.8;
  private lastFootstep = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.5;
      this.ambientGain.connect(this.master);
      // shared noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  private get ready() {
    return !!(this.ctx && this.master && this.ctx.state === "running");
  }

  private noise(dur: number, filterFreq: number, filterQ: number, gainVal: number, type: BiquadFilterType = "lowpass", when = 0, slideTo?: number) {
    if (!this.ready || !this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (slideTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    f.Q.value = filterQ;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gainVal: number, type: OscillatorType = "sine", when = 0, slideTo?: number) {
    if (!this.ready || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------- SFX ----------------
  shoot(kind: "rifle" | "smg" | "pistol" | "shotgun" | "sniper" | "bow" | "enemy" | "boss") {
    if (kind === "bow") {
      this.bowRelease();
      return;
    }
    const cfg = {
      rifle: { f: 1800, g: 0.5, d: 0.16, punch: 120 },
      smg: { f: 2400, g: 0.38, d: 0.11, punch: 160 },
      pistol: { f: 1400, g: 0.55, d: 0.2, punch: 90 },
      shotgun: { f: 1100, g: 0.75, d: 0.28, punch: 65 },
      sniper: { f: 2600, g: 0.85, d: 0.36, punch: 50 },
      enemy: { f: 1100, g: 0.3, d: 0.14, punch: 110 },
      boss: { f: 700, g: 0.6, d: 0.24, punch: 70 },
    }[kind];
    this.noise(cfg.d, cfg.f, 0.8, cfg.g, "lowpass", 0, 180);
    this.tone(cfg.punch, cfg.d * 0.9, cfg.g * 0.9, "square", 0, 40);
    // crack / supersonic boom for sniper & shotgun
    if (kind === "sniper") {
      this.noise(0.12, 6500, 1.2, 0.6, "highpass");
      this.tone(85, 0.5, 0.4, "sine", 0.04, 25);
    } else if (kind === "shotgun") {
      this.noise(0.08, 4000, 1, 0.45, "bandpass");
      this.tone(60, 0.22, 0.4, "sawtooth", 0.02, 30);
    } else {
      this.noise(0.05, 5000, 1, cfg.g * 0.5, "highpass");
    }
  }

  bowDraw() {
    this.noise(0.2, 1200, 1.5, 0.15, "bandpass", 0, 1800);
    this.tone(280, 0.15, 0.08, "triangle", 0, 340);
  }

  bowRelease() {
    this.noise(0.12, 2800, 2.0, 0.28, "bandpass", 0, 800);
    this.tone(420, 0.08, 0.15, "sine", 0, 210);
  }

  arrowHit() {
    this.noise(0.12, 1400, 1.2, 0.35, "lowpass");
    this.tone(200, 0.08, 0.25, "triangle", 0, 90);
  }

  macheteSlash() {
    this.noise(0.18, 3200, 1.8, 0.35, "bandpass", 0, 900);
    this.tone(440, 0.12, 0.2, "sawtooth", 0, 180);
  }

  macheteTakedown() {
    this.noise(0.24, 2400, 1.2, 0.55, "lowpass", 0, 300);
    this.tone(160, 0.2, 0.4, "sawtooth", 0, 70);
    this.noise(0.15, 3800, 2, 0.3, "bandpass", 0.06);
  }

  rockThrow() {
    this.noise(0.08, 1600, 1, 0.15, "bandpass");
    this.tone(320, 0.06, 0.08, "sine", 0, 420);
  }

  rockClatter() {
    this.noise(0.06, 2200, 1.5, 0.25, "highpass");
    this.tone(240, 0.05, 0.2, "square", 0, 120);
    this.noise(0.05, 1800, 1.2, 0.18, "highpass", 0.07);
  }

  molotovShatter() {
    this.noise(0.35, 4500, 1.2, 0.7, "highpass");
    this.tone(180, 0.25, 0.45, "sawtooth", 0, 60);
    this.noise(0.6, 900, 0.8, 0.5, "lowpass", 0.05, 200);
  }

  fireBurn() {
    this.noise(0.3, 1400, 1.8, 0.2, "bandpass");
  }

  detectionTension(urgency: number) { // urgency 0..1
    const freq = 400 + urgency * 600;
    this.tone(freq, 0.14, 0.12 + urgency * 0.15, "sawtooth", 0, freq + 150);
  }

  sabotageAlarm() {
    this.noise(0.18, 4200, 2.5, 0.35, "highpass");
    this.tone(120, 0.25, 0.3, "sawtooth", 0, 40);
  }

  dryFire() {
    this.tone(2200, 0.05, 0.12, "square");
  }

  reload() {
    this.tone(340, 0.07, 0.2, "square");
    this.tone(220, 0.08, 0.2, "square", 0.12);
    this.tone(520, 0.09, 0.22, "square", 0.28);
    this.noise(0.08, 3000, 1, 0.15, "bandpass", 0.28);
  }

  weaponSwitch() {
    this.noise(0.1, 2500, 1, 0.2, "bandpass");
    this.tone(500, 0.06, 0.12, "square", 0.05);
  }

  hit(headshot: boolean) {
    if (headshot) {
      this.tone(2400, 0.08, 0.25, "square", 0, 1200);
      this.tone(3400, 0.1, 0.2, "sine", 0.02);
    } else {
      this.tone(1700, 0.07, 0.22, "square", 0, 900);
    }
  }

  kill() {
    this.tone(700, 0.12, 0.25, "sawtooth", 0, 1400);
    this.tone(1050, 0.14, 0.2, "sine", 0.06, 2100);
  }

  headshotKill() {
    this.tone(900, 0.1, 0.3, "sawtooth", 0, 1800);
    this.tone(1400, 0.16, 0.25, "sine", 0.05, 2800);
    this.noise(0.15, 4000, 1, 0.2, "highpass");
  }

  explosion(big = false) {
    const m = big ? 1.5 : 1;
    this.noise(0.9 * m, 900, 0.6, 0.8, "lowpass", 0, 60);
    this.tone(70, 0.8 * m, 0.7, "sine", 0, 28);
    this.noise(0.25, 4000, 0.8, 0.4, "highpass");
    this.tone(300, 0.3, 0.3, "sawtooth", 0.02, 60);
  }

  hurt() {
    this.tone(160, 0.18, 0.35, "sawtooth", 0, 80);
    this.noise(0.15, 600, 1, 0.3, "lowpass");
  }

  heal() {
    this.tone(440, 0.15, 0.2, "sine", 0, 660);
    this.tone(660, 0.2, 0.2, "sine", 0.12, 880);
  }

  pickup() {
    this.tone(880, 0.08, 0.2, "sine", 0, 1320);
    this.tone(1320, 0.1, 0.15, "sine", 0.07, 1760);
  }

  footstep(sprint: boolean) {
    const now = performance.now();
    if (now - this.lastFootstep < (sprint ? 280 : 380)) return;
    this.lastFootstep = now;
    this.noise(0.09, 500 + Math.random() * 300, 1, sprint ? 0.12 : 0.07, "lowpass");
  }

  jump() {
    this.noise(0.1, 800, 1, 0.1, "lowpass");
  }

  land() {
    this.noise(0.14, 400, 1, 0.2, "lowpass");
    this.tone(90, 0.12, 0.15, "sine", 0, 50);
  }

  melee() {
    this.noise(0.16, 2000, 2, 0.35, "bandpass", 0, 400);
  }

  meleeHit() {
    this.noise(0.2, 700, 1, 0.5, "lowpass");
    this.tone(140, 0.15, 0.35, "square", 0, 60);
  }

  grenadeThrow() {
    this.noise(0.12, 1500, 1, 0.2, "bandpass");
  }

  grenadeBounce() {
    this.tone(700, 0.06, 0.15, "square", 0, 400);
  }

  uiClick() {
    this.tone(900, 0.05, 0.15, "square", 0, 700);
  }

  uiHover() {
    this.tone(1400, 0.03, 0.06, "sine");
  }

  objective() {
    this.tone(523, 0.18, 0.22, "sine");
    this.tone(659, 0.18, 0.22, "sine", 0.14);
    this.tone(784, 0.3, 0.25, "sine", 0.28);
  }

  outpostCaptured() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 0.22, "triangle", i * 0.13));
    this.noise(0.4, 3000, 1, 0.12, "highpass", 0.2);
  }

  waveHorn() {
    this.tone(98, 1.2, 0.4, "sawtooth", 0, 92);
    this.tone(147, 1.2, 0.3, "sawtooth", 0.05, 139);
    this.tone(196, 1.0, 0.2, "square", 0.1, 185);
  }

  bossRoar() {
    this.tone(65, 1.4, 0.55, "sawtooth", 0, 45);
    this.tone(98, 1.2, 0.4, "square", 0.1, 55);
    this.noise(1.0, 500, 0.7, 0.4, "lowpass", 0.1, 100);
  }

  victory() {
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.4, 0.22, "triangle", i * 0.16));
  }

  defeat() {
    [400, 350, 300, 220, 160].forEach((f, i) => this.tone(f, 0.5, 0.25, "sawtooth", i * 0.22, f * 0.9));
  }

  enemyAlert() {
    this.tone(300, 0.12, 0.18, "square", 0, 450);
    this.tone(450, 0.1, 0.15, "square", 0.1, 600);
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(660, 0.3, 0.16, "square", i * 0.6, 520);
      this.tone(520, 0.25, 0.16, "square", i * 0.6 + 0.3, 660);
    }
  }

  // ------------- ambient jungle loop -------------
  startAmbient() {
    if (!this.ctx || !this.ambientGain || this.ambientNodes.length > 0) return;
    try {
      const ctx = this.ctx;
      // ocean wash: filtered noise LFO
      const ocean = ctx.createBufferSource();
      if (!this.noiseBuffer) return;
      ocean.buffer = this.noiseBuffer;
      ocean.loop = true;
      const oceanFilter = ctx.createBiquadFilter();
      oceanFilter.type = "lowpass";
      oceanFilter.frequency.value = 420;
      const oceanGain = ctx.createGain();
      oceanGain.gain.value = 0.16;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.08;
      lfo.connect(lfoGain); lfoGain.connect(oceanGain.gain);
      ocean.connect(oceanFilter); oceanFilter.connect(oceanGain); oceanGain.connect(this.ambientGain);
      ocean.start(); lfo.start();
      // wind: bandpass noise
      const wind = ctx.createBufferSource();
      wind.buffer = this.noiseBuffer;
      wind.loop = true;
      wind.playbackRate.value = 0.5;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 900;
      windFilter.Q.value = 0.6;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.05;
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.07;
      const lfo2Gain = ctx.createGain();
      lfo2Gain.gain.value = 0.03;
      lfo2.connect(lfo2Gain); lfo2Gain.connect(windGain.gain);
      wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.ambientGain);
      wind.start(); lfo2.start();
      this.ambientNodes = [ocean, lfo, wind, lfo2];
      // random bird chirps
      const chirp = () => {
        if (!this.ctx || this.ambientNodes.length === 0) return;
        const n = 2 + Math.floor(Math.random() * 4);
        const base = 2200 + Math.random() * 1800;
        for (let i = 0; i < n; i++) {
          this.tone(base + Math.random() * 600, 0.09, 0.035, "sine", i * 0.13, base * 1.3);
        }
        window.setTimeout(chirp, 4000 + Math.random() * 9000);
      };
      window.setTimeout(chirp, 2500);
    } catch { /* ignore */ }
  }

  stopAmbient() {
    this.ambientNodes.forEach((n) => {
      try { (n as OscillatorNode).stop?.(); } catch { /*noop*/ }
      try { n.disconnect(); } catch { /*noop*/ }
    });
    this.ambientNodes = [];
  }
}
