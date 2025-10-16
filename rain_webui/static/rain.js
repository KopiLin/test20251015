(() => {
  const canvas = document.getElementById('rain-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const weatherBtn = document.getElementById('weather-toggle');
  const musicBtn = document.getElementById('music-toggle');
  const labelEl = document.getElementById('weather-label');
  const hudChip = document.getElementById('weather-chip');
  const hudModeEl = document.getElementById('hud-mode');
  const hudDescriptionEl = document.getElementById('weather-description');
  const hudIconEl = document.getElementById('hud-icon');
  const equalizerEl = document.getElementById('equalizer');
  const body = document.body;

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  class RainScene {
    constructor() {
      this.drops = [];
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.needsFullClear = true;
      this.backgroundFill = 'rgba(10, 15, 29, 1)';
      this.trailFill = 'rgba(10, 15, 29, 0.5)';
      this.strokeStyle = '#bcd3ff';
    }

    targetCount() {
      return clamp(Math.floor((this.width * this.height) / 4500), 250, 1200);
    }

    makeDrop(randomStart = false) {
      const speed = rand(3, 9) * this.dpr;
      const len = rand(8, 18) * this.dpr;
      const thickness = rand(0.8, 1.6) * this.dpr;
      const drift = rand(-0.6, -0.1) * this.dpr;
      const startY = randomStart ? rand(-this.height, this.height * 0.6) : rand(-this.height, -10);
      return {
        x: rand(-20, this.width + 20),
        y: startY,
        len,
        speed,
        thickness,
        drift,
        alpha: rand(0.45, 0.9)
      };
    }

    reset(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.needsFullClear = true;
      const target = this.targetCount();
      this.drops = [];
      for (let i = 0; i < target; i++) {
        this.drops.push(this.makeDrop(true));
      }
    }

    resize(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      const target = this.targetCount();
      if (this.drops.length < target) {
        while (this.drops.length < target) this.drops.push(this.makeDrop(true));
      } else if (this.drops.length > target) {
        this.drops.length = target;
      }
    }

    render(ctx, _dt = 0.016) {
      if (this.needsFullClear) {
        ctx.fillStyle = this.backgroundFill;
        ctx.fillRect(0, 0, this.width, this.height);
        this.needsFullClear = false;
      } else {
        ctx.fillStyle = this.trailFill;
        ctx.fillRect(0, 0, this.width, this.height);
      }

      ctx.strokeStyle = this.strokeStyle;
      ctx.lineCap = 'round';

      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        ctx.globalAlpha = d.alpha;
        ctx.lineWidth = d.thickness;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.drift * 2, d.y + d.len);
        ctx.stroke();

        d.x += d.drift;
        d.y += d.speed;

        if (d.y - d.len > this.height || d.x < -40 || d.x > this.width + 40) {
          this.drops[i] = this.makeDrop();
        }
      }

      ctx.globalAlpha = 1;
    }
  }

  class StormScene extends RainScene {
    constructor() {
      super();
      this.backgroundFill = 'rgba(4, 6, 18, 1)';
      this.trailFill = 'rgba(4, 6, 18, 0.65)';
      this.strokeStyle = '#d0e1ff';
      this.flashTimer = 0;
      this.flashDuration = 0;
      this.flashStrength = 0;
    }

    targetCount() {
      return clamp(Math.floor((this.width * this.height) / 3200), 400, 1600);
    }

    makeDrop(randomStart = false) {
      const drop = super.makeDrop(randomStart);
      drop.speed *= 1.35;
      drop.len *= 1.25;
      drop.thickness *= 1.3;
      drop.drift = rand(-1.2, -0.2) * this.dpr;
      drop.alpha = rand(0.55, 1);
      return drop;
    }

    render(ctx, dt = 0.016) {
      super.render(ctx, dt);
      if (this.flashTimer > 0) {
        this.flashTimer = Math.max(0, this.flashTimer - dt);
        const fade = this.flashDuration > 0 ? this.flashTimer / this.flashDuration : 0;
        ctx.save();
        ctx.globalAlpha = this.flashStrength * (0.25 + 0.75 * fade);
        ctx.fillStyle = '#dff3ff';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.restore();
      } else if (Math.random() < 0.03) {
        this.flashDuration = rand(0.12, 0.25);
        this.flashTimer = this.flashDuration;
        this.flashStrength = rand(0.3, 0.5);
      }
    }
  }

  class SunnyScene {
    constructor() {
      this.clouds = [];
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.time = 0;
    }

    cloudCount() {
      return clamp(Math.round(this.width / 280) + 3, 4, 10);
    }

    makeCloud(initial = false) {
      const span = rand(150, 240);
      const scale = rand(0.85, 1.45);
      const y = rand(this.height * 0.15, this.height * 0.58);
      const speed = rand(8, 18) * (0.7 + scale * 0.35);
      const bobSpeed = rand(0.25, 0.55);
      const bobRange = rand(3, 10);
      const puffCount = Math.max(3, Math.floor(rand(4, 6)));
      const puffs = [];
      for (let i = 0; i < puffCount; i++) {
        const ratio = puffCount <= 1 ? 0.5 : i / (puffCount - 1);
        const offsetX = (ratio - 0.5) * span;
        const offsetY = rand(-18, 10);
        const radius = rand(span * 0.18, span * 0.28);
        puffs.push({ x: offsetX, y: offsetY, r: radius });
      }
      const startX = initial ? rand(-span, this.width + span) : -span * scale - rand(40, 240);
      return {
        x: startX,
        y,
        span,
        scale,
        speed,
        bobSpeed,
        bobRange,
        bobOffset: rand(0, Math.PI * 2),
        puffs
      };
    }

    reset(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.time = 0;
      const count = this.cloudCount();
      this.clouds = [];
      for (let i = 0; i < count; i++) {
        this.clouds.push(this.makeCloud(true));
      }
    }

    resize(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      const desired = this.cloudCount();
      if (this.clouds.length < desired) {
        while (this.clouds.length < desired) this.clouds.push(this.makeCloud(true));
      } else if (this.clouds.length > desired) {
        this.clouds.length = desired;
      }
    }

    recycleCloud(cloud) {
      Object.assign(cloud, this.makeCloud(false));
    }

    render(ctx, dt) {
      this.time += dt;

      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, '#7fc8ff');
      gradient.addColorStop(0.45, '#aee0ff');
      gradient.addColorStop(1, '#fef0c3');
      ctx.globalAlpha = 1;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);

      const sunRadius = Math.max(Math.min(this.width, this.height) * 0.12, 60);
      const sunX = this.width - Math.min(160, this.width * 0.22) - sunRadius * 0.2;
      const sunY = Math.max(90, this.height * 0.18);

      const sunGlow = ctx.createRadialGradient(
        sunX,
        sunY,
        sunRadius * 0.1,
        sunX,
        sunY,
        sunRadius * 1.8
      );
      sunGlow.addColorStop(0, 'rgba(255, 252, 214, 1)');
      sunGlow.addColorStop(0.55, 'rgba(255, 238, 170, 0.95)');
      sunGlow.addColorStop(1, 'rgba(255, 220, 120, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      const sunCore = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      sunCore.addColorStop(0, '#fff7c2');
      sunCore.addColorStop(1, '#ffd36e');
      ctx.fillStyle = sunCore;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();

      const aurora = ctx.createLinearGradient(0, this.height * 0.2, this.width, this.height * 0.35);
      aurora.addColorStop(0, 'rgba(120, 255, 232, 0.0)');
      aurora.addColorStop(0.5, 'rgba(255, 169, 224, 0.18)');
      aurora.addColorStop(1, 'rgba(120, 255, 232, 0.0)');
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, this.width, this.height * 0.6);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 1.2;

      for (const cloud of this.clouds) {
        cloud.x += cloud.speed * dt;
        if (cloud.x - cloud.span * cloud.scale > this.width + 180) {
          this.recycleCloud(cloud);
        }

        const bob = Math.sin(this.time * cloud.bobSpeed + cloud.bobOffset) * cloud.bobRange;

        ctx.beginPath();
        for (const puff of cloud.puffs) {
          const px = cloud.x + puff.x * cloud.scale;
          const py = cloud.y + puff.y * cloud.scale + bob;
          const radius = puff.r * cloud.scale;
          ctx.moveTo(px + radius, py);
          ctx.arc(px, py, radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
      }

      const sparkleCount = Math.max(4, Math.round(this.width / 200));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      for (let i = 0; i < sparkleCount; i++) {
        const phase = (this.time * 0.08 + i * 0.17) % 1;
        const sx = (i / sparkleCount) * this.width + Math.sin(this.time * 0.25 + i) * 40;
        const sy = phase * this.height;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const weatherModes = {
    sun: {
      label: 'Neon Sun',
      icon: '☀️',
      hudCode: 'SOL-84',
      description: 'Neon sunbeams warm the district.',
      voiceLabel: '霓虹晴天',
      canvasLabel: 'Neon sun animation',
      themeClass: 'theme-sun',
      accent: '#ffdd8a',
      glow: 'rgba(255, 218, 120, 0.5)',
      hudSurface: 'rgba(255, 255, 255, 0.22)',
      hudBorder: 'rgba(255, 223, 164, 0.55)',
      hudText: '#293046',
      hudTextRgb: '41, 48, 70',
      audio: {
        noiseLevel: 0.08,
        noiseCutoff: 7200,
        noiseFloor: 1200,
        osc1Freq: 220,
        osc1Type: 'sine',
        osc2Freq: 277.18,
        osc2Type: 'triangle',
        bassFreq: 55,
        bassType: 'sawtooth',
        padGain: 0.05,
        bassGain: 0.0,
        lfoRate: 0.1,
        lfoDepth: 6,
        ramp: 1.4
      }
    },
    rain: {
      label: 'Holographic Rain',
      icon: '🌧️',
      hudCode: 'PLV-09',
      description: 'Synth raindrops shimmer across the skyline.',
      voiceLabel: '賽博細雨',
      canvasLabel: 'Cyber rain animation',
      themeClass: 'theme-rain',
      accent: '#6fd6ff',
      glow: 'rgba(111, 214, 255, 0.35)',
      hudSurface: 'rgba(8, 14, 28, 0.7)',
      hudBorder: 'rgba(146, 198, 255, 0.3)',
      hudText: '#c7dcff',
      hudTextRgb: '199, 220, 255',
      audio: {
        noiseLevel: 0.16,
        noiseCutoff: 6000,
        noiseFloor: 900,
        osc1Freq: 196,
        osc1Type: 'sine',
        osc2Freq: 246.94,
        osc2Type: 'sawtooth',
        bassFreq: 55,
        bassType: 'triangle',
        padGain: 0.045,
        bassGain: 0.035,
        lfoRate: 0.12,
        lfoDepth: 9,
        ramp: 1.6
      }
    },
    storm: {
      label: 'Electric Storm',
      icon: '⚡',
      hudCode: 'STX-42',
      description: 'Voltage-charged thunderclouds pulse above the spires.',
      voiceLabel: '電氣風暴',
      canvasLabel: 'Electric storm animation',
      themeClass: 'theme-storm',
      accent: '#8f7dff',
      glow: 'rgba(140, 125, 255, 0.45)',
      hudSurface: 'rgba(10, 10, 26, 0.78)',
      hudBorder: 'rgba(170, 150, 255, 0.36)',
      hudText: '#d4d9ff',
      hudTextRgb: '212, 217, 255',
      audio: {
        noiseLevel: 0.24,
        noiseCutoff: 4200,
        noiseFloor: 650,
        osc1Freq: 110,
        osc1Type: 'sine',
        osc2Freq: 164.81,
        osc2Type: 'square',
        bassFreq: 48,
        bassType: 'sawtooth',
        padGain: 0.07,
        bassGain: 0.08,
        lfoRate: 0.18,
        lfoDepth: 14,
        ramp: 1.2
      }
    }
  };

  const weatherOrder = ['sun', 'rain', 'storm'];
  const themeClasses = Array.from(new Set(Object.values(weatherModes).map(meta => meta.themeClass)));

  const scenes = {
    sun: new SunnyScene(),
    rain: new RainScene(),
    storm: new StormScene()
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let current = 'sun';

  let audioCtx = null;
  let masterGain = null;
  let noiseSource = null;
  let noiseGain = null;
  let noiseHighpass = null;
  let noiseLowpass = null;
  let osc1 = null;
  let osc2 = null;
  let oscBass = null;
  let oscGain = null;
  let bassGain = null;
  let lfo = null;
  let lfoGain = null;
  let musicOn = false;
  let pendingProfile = weatherModes.sun.audio;

  function resizeCanvas() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = Math.floor(window.innerWidth);
    height = Math.floor(window.innerHeight);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    Object.values(scenes).forEach(scene => scene.resize(width, height, dpr));
  }

  function getNextWeather(mode) {
    const idx = weatherOrder.indexOf(mode);
    const nextIdx = (idx + 1) % weatherOrder.length;
    return weatherOrder[nextIdx];
  }

  function updateWeatherButton(mode) {
    if (!weatherBtn) return;
    const meta = weatherModes[mode];
    if (!meta) return;
    const next = getNextWeather(mode);
    const nextMeta = weatherModes[next];
    weatherBtn.dataset.current = mode;
    weatherBtn.textContent = nextMeta?.icon ?? '☀️';
    weatherBtn.setAttribute('aria-pressed', mode === 'sun' ? 'false' : 'true');
    if (nextMeta) {
      weatherBtn.setAttribute('aria-label', `目前${meta.voiceLabel}，按下切換為${nextMeta.voiceLabel}`);
      weatherBtn.setAttribute('title', `切換為${nextMeta.voiceLabel}`);
    }
  }

  function applyWeatherClasses(mode) {
    const meta = weatherModes[mode];
    if (!meta) return null;

    themeClasses.forEach(cls => body.classList.remove(cls));
    body.classList.add(meta.themeClass);
    body.setAttribute('data-weather', mode);

    if (meta.accent) body.style.setProperty('--accent-color', meta.accent);
    if (meta.glow) body.style.setProperty('--glow-color', meta.glow);
    if (meta.hudSurface) body.style.setProperty('--hud-surface', meta.hudSurface);
    if (meta.hudBorder) body.style.setProperty('--hud-border', meta.hudBorder);
    if (meta.hudText) body.style.setProperty('--hud-text', meta.hudText);
    if (meta.hudTextRgb) body.style.setProperty('--hud-text-rgb', meta.hudTextRgb);

    if (labelEl) labelEl.textContent = meta.label;
    if (hudChip) hudChip.textContent = meta.hudCode;
    if (hudModeEl) hudModeEl.textContent = meta.label;
    if (hudDescriptionEl) hudDescriptionEl.textContent = meta.description;
    if (hudIconEl) hudIconEl.textContent = meta.icon;
    if (equalizerEl) equalizerEl.setAttribute('data-tone', mode);

    canvas.setAttribute('aria-label', meta.canvasLabel);
    updateWeatherButton(mode);

    return meta;
  }

  function scheduleAudioProfile(profile, immediate = false) {
    pendingProfile = profile;
    if (musicOn && audioCtx && profile) {
      morphAudio(profile, immediate);
    }
  }

  function setWeather(mode) {
    const scene = scenes[mode];
    if (!scene) return;
    current = mode;
    scene.reset(width, height, dpr);
    const meta = applyWeatherClasses(mode);
    if (meta) {
      scheduleAudioProfile(meta.audio);
    }
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    const scene = scenes[current];
    if (scene) scene.reset(width, height, dpr);
  }, { passive: true });

  if (weatherBtn) {
    weatherBtn.addEventListener('click', () => {
      const next = getNextWeather(current);
      setWeather(next);
    }, { passive: true });
  }

  function createNoiseBuffer(ctx) {
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function buildAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 20;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    noiseHighpass = ctx.createBiquadFilter();
    noiseHighpass.type = 'highpass';
    noiseHighpass.frequency.value = 1200;

    noiseLowpass = ctx.createBiquadFilter();
    noiseLowpass.type = 'lowpass';
    noiseLowpass.frequency.value = 8000;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0;
    noiseGain.connect(masterGain);

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(ctx);
    noiseSource.loop = true;
    noiseSource.connect(noiseHighpass);
    noiseHighpass.connect(noiseLowpass);
    noiseLowpass.connect(noiseGain);

    oscGain = ctx.createGain();
    oscGain.gain.value = 0.0;
    oscGain.connect(masterGain);

    bassGain = ctx.createGain();
    bassGain.gain.value = 0.0;
    bassGain.connect(masterGain);

    osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 220;
    osc1.connect(oscGain);

    osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 277.18;
    osc2.connect(oscGain);

    oscBass = ctx.createOscillator();
    oscBass.type = 'sawtooth';
    oscBass.frequency.value = 55;
    oscBass.connect(bassGain);

    lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.1;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc2.frequency);

    noiseSource.start();
    osc1.start();
    osc2.start();
    oscBass.start();
    lfo.start();
  }

  function applyParam(param, value, duration) {
    if (!audioCtx || !param || typeof value !== 'number') return;
    const t = audioCtx.currentTime;
    const dur = Math.max(0.05, duration);
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(value, t + dur);
    } catch {
      // ignored
    }
  }

  function morphAudio(profile, immediate = false) {
    if (!audioCtx || !profile) return;
    const ramp = immediate ? 0.25 : profile.ramp ?? 1.6;
    applyParam(noiseGain?.gain, profile.noiseLevel, ramp);
    applyParam(noiseLowpass?.frequency, profile.noiseCutoff, ramp);
    applyParam(noiseHighpass?.frequency, profile.noiseFloor, ramp);
    applyParam(oscGain?.gain, profile.padGain, ramp);
    applyParam(bassGain?.gain, profile.bassGain, ramp);
    applyParam(osc1?.frequency, profile.osc1Freq, ramp);
    applyParam(osc2?.frequency, profile.osc2Freq, ramp);
    applyParam(oscBass?.frequency, profile.bassFreq, ramp);
    applyParam(lfo?.frequency, profile.lfoRate, ramp);
    applyParam(lfoGain?.gain, profile.lfoDepth, ramp);
    if (osc1 && profile.osc1Type) osc1.type = profile.osc1Type;
    if (osc2 && profile.osc2Type) osc2.type = profile.osc2Type;
    if (oscBass && profile.bassType) oscBass.type = profile.bassType;
  }

  async function startMusic() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = null;
      buildAudio();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    masterGain?.gain.cancelScheduledValues(t);
    masterGain?.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain?.gain.linearRampToValueAtTime(0.2, t + 0.8);
    musicOn = true;
    body.classList.add('music-active');
    updateMusicButton();
    if (pendingProfile) {
      morphAudio(pendingProfile, true);
    }
  }

  function stopMusic() {
    if (!audioCtx || !masterGain) {
      musicOn = false;
      body.classList.remove('music-active');
      updateMusicButton();
      pendingProfile = weatherModes[current].audio;
      return;
    }
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0.0, t + 0.6);
    setTimeout(() => {
      try { noiseSource?.stop(); } catch {}
      try { osc1?.stop(); } catch {}
      try { osc2?.stop(); } catch {}
      try { oscBass?.stop(); } catch {}
      try { audioCtx?.close(); } catch {}
      audioCtx = null;
      masterGain = null;
      noiseSource = null;
      noiseGain = null;
      noiseHighpass = null;
      noiseLowpass = null;
      osc1 = null;
      osc2 = null;
      oscBass = null;
      oscGain = null;
      bassGain = null;
      lfo = null;
      lfoGain = null;
    }, 700);
    musicOn = false;
    body.classList.remove('music-active');
    pendingProfile = weatherModes[current].audio;
    updateMusicButton();
  }

  function updateMusicButton() {
    if (!musicBtn) return;
    musicBtn.textContent = musicOn ? '🔊' : '♫';
    musicBtn.dataset.label = musicOn ? 'AUDIO ON' : 'AUDIO OFF';
    musicBtn.setAttribute('aria-label', musicOn ? '關閉聲景' : '啟動聲景');
    musicBtn.setAttribute('title', musicOn ? '關閉聲景' : '啟動聲景');
    musicBtn.setAttribute('aria-pressed', musicOn ? 'true' : 'false');
  }

  if (musicBtn) {
    updateMusicButton();
    musicBtn.addEventListener('click', async () => {
      if (!musicOn) await startMusic(); else stopMusic();
    }, { passive: true });
  }

  window.addEventListener('pagehide', () => { if (musicOn) stopMusic(); });

  resizeCanvas();
  setWeather('sun');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.12);
    last = now;
    const scene = scenes[current];
    if (scene) scene.render(ctx, dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(now => {
    last = now;
    frame(now);
  });
})();

// Clock overlay updater
const clockEl = document.getElementById('clock');
function pad(n) { return String(n).padStart(2, '0'); }
function formatTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function updateClock() {
  if (clockEl) {
    clockEl.textContent = formatTime();
  }
}
updateClock();
setInterval(updateClock, 1000);
