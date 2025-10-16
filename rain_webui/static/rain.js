(() => {
  const canvas = document.getElementById('rain-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const weatherBtn = document.getElementById('weather-toggle');
  const labelEl = document.getElementById('weather-label');
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

    render(ctx) {
      if (this.needsFullClear) {
        ctx.fillStyle = 'rgba(10, 15, 29, 1)';
        ctx.fillRect(0, 0, this.width, this.height);
        this.needsFullClear = false;
      } else {
        ctx.fillStyle = 'rgba(10, 15, 29, 0.5)';
        ctx.fillRect(0, 0, this.width, this.height);
      }

      ctx.strokeStyle = '#bcd3ff';
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

  const scenes = {
    sun: new SunnyScene(),
    rain: new RainScene()
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let current = 'sun';

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

  function applyWeatherClasses(mode) {
    if (mode === 'rain') {
      body.classList.add('theme-rain');
      body.classList.remove('theme-sun');
      labelEl && (labelEl.textContent = 'Rainy Day');
      if (weatherBtn) {
        weatherBtn.textContent = '🌧️';
        weatherBtn.setAttribute('aria-pressed', 'true');
        weatherBtn.setAttribute('aria-label', '目前下雨天，按下切換為多雲晴天');
        weatherBtn.setAttribute('title', '切換為晴天');
      }
    } else {
      body.classList.add('theme-sun');
      body.classList.remove('theme-rain');
      labelEl && (labelEl.textContent = 'Sunny Skies');
      if (weatherBtn) {
        weatherBtn.textContent = '⛅';
        weatherBtn.setAttribute('aria-pressed', 'false');
        weatherBtn.setAttribute('aria-label', '目前多雲晴天，按下切換為下雨天');
        weatherBtn.setAttribute('title', '切換為下雨天');
      }
    }

    canvas.setAttribute('aria-label', mode === 'rain' ? 'Rain animation' : 'Sunny animation');
  }

  function setWeather(mode) {
    if (!scenes[mode]) return;
    current = mode;
    scenes[mode].reset(width, height, dpr);
    applyWeatherClasses(mode);
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    scenes[current].reset(width, height, dpr);
  }, { passive: true });

  if (weatherBtn) {
    weatherBtn.addEventListener('click', () => {
      const next = current === 'sun' ? 'rain' : 'sun';
      setWeather(next);
    }, { passive: true });
  }

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
  const clockEl = document.getElementById("clock");
  function pad(n){ return String(n).padStart(2, "0"); }
  function formatTime(){ const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
  function updateClock(){ if(clockEl){ clockEl.textContent = formatTime(); } }
  updateClock();
  setInterval(updateClock, 1000);


// Background music (WebAudio). Starts on user click.
(() => {
  const musicBtn = document.getElementById('music-toggle');
  let audioCtx = null;
  let masterGain = null;
  let noiseSource = null, noiseGain = null;
  let osc1 = null, osc2 = null, oscGain = null;
  let musicOn = false;

  function createNoiseBuffer(ctx) {
    const sr = ctx.sampleRate;
    const len = sr * 2; // 2 seconds loop
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1; // white noise
    return buf;
  }

  function buildAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0;
    masterGain.connect(ctx.destination);

    // Noise -> HPF -> LPF -> noiseGain -> master
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;

    noiseGain = ctx.createGain(); noiseGain.gain.value = 0.12;
    lp.connect(noiseGain); noiseGain.connect(masterGain);

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(ctx);
    noiseSource.loop = true;
    noiseSource.connect(hp); hp.connect(lp);

    // Gentle pad
    oscGain = ctx.createGain(); oscGain.gain.value = 0.05; oscGain.connect(masterGain);

    osc1 = ctx.createOscillator(); osc1.type = 'sine';     osc1.frequency.value = 220;    // A3
    osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = 277.18; // C#4

    // Slow LFO -> osc2 frequency for subtle movement
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 6; // +-6 Hz
    lfo.connect(lfoGain); lfoGain.connect(osc2.frequency);

    osc1.connect(oscGain); osc2.connect(oscGain);

    noiseSource.start();
    osc1.start(); osc2.start(); lfo.start();
  }

  async function startMusic() {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = null; // ensure fresh context
      buildAudio();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0.18, t + 0.8);
    musicOn = true;
    musicBtn?.setAttribute('aria-pressed', 'true');
  }

  function stopMusic() {
    if (!audioCtx || !masterGain) return;
    const t = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0.0, t + 0.6);
    setTimeout(() => {
      try { noiseSource?.stop(); } catch {}
      try { osc1?.stop(); } catch {}
      try { osc2?.stop(); } catch {}
      try { audioCtx?.close(); } catch {}
      audioCtx = null; masterGain = null; noiseSource = null; noiseGain = null; osc1 = null; osc2 = null; oscGain = null;
    }, 700);
    musicOn = false;
    musicBtn?.setAttribute('aria-pressed', 'false');
  }

  if (musicBtn) {
    musicBtn.addEventListener('click', async () => {
      if (!musicOn) await startMusic(); else stopMusic();
    }, { passive: true });
  }

  window.addEventListener('pagehide', () => { if (musicOn) stopMusic(); });
})();
