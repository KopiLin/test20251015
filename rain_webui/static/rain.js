(() => {
  const canvas = document.getElementById('rain-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const musicBtn = document.getElementById('music-toggle');
  const labelEl = document.getElementById('weather-label');
  const hudChip = document.getElementById('weather-chip');
  const hudModeEl = document.getElementById('hud-mode');
  const hudDescriptionEl = document.getElementById('weather-description');
  const hudIconEl = document.getElementById('hud-icon');
  const equalizerEl = document.getElementById('equalizer');
  const body = document.body;
  const dock = document.getElementById('control-dock');
  const dockToggle = document.getElementById('dock-toggle');
  const dockPanel = document.getElementById('dock-panel');
  const dockWeatherIcon = document.getElementById('dock-weather-icon');
  const dockWeatherLabel = document.getElementById('dock-weather-label');
  const dockTrackLabel = document.getElementById('dock-track-label');
  const weatherOptionsEl = document.getElementById('weather-options');
  const musicOptionsEl = document.getElementById('music-options');
  const musicCreditEl = document.getElementById('music-credit');
  const audioEl = document.getElementById('bg-audio');

  const weatherButtons = new Map();
  const musicButtons = new Map();

  if (audioEl) {
    audioEl.crossOrigin = 'anonymous';
    audioEl.loop = true;
    audioEl.preload = 'auto';
    audioEl.volume = 0.6;
  }

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

  class MistScene extends RainScene {
    constructor() {
      super();
      this.backgroundFill = 'rgba(8, 12, 22, 1)';
      this.trailFill = 'rgba(12, 20, 34, 0.55)';
      this.strokeStyle = 'rgba(168, 198, 255, 0.4)';
    }

    targetCount() {
      return clamp(Math.floor((this.width * this.height) / 5200), 200, 900);
    }

    makeDrop(randomStart = false) {
      const drop = super.makeDrop(randomStart);
      drop.speed *= 0.38;
      drop.len = rand(4, 12) * this.dpr;
      drop.thickness = rand(1.2, 2.6) * this.dpr;
      drop.drift = rand(-0.4, 0.5) * this.dpr;
      drop.alpha = rand(0.12, 0.3);
      return drop;
    }

    render(ctx, dt = 0.016) {
      super.render(ctx, dt);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, 'rgba(120, 170, 255, 0.08)');
      gradient.addColorStop(0.45, 'rgba(162, 198, 255, 0.12)');
      gradient.addColorStop(1, 'rgba(40, 66, 110, 0.25)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  class SnowScene {
    constructor() {
      this.flakes = [];
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.time = 0;
    }

    targetCount() {
      return clamp(Math.floor((this.width * this.height) / 5200), 220, 880);
    }

    makeFlake(randomStart = false) {
      return {
        x: rand(-20, this.width + 20),
        y: randomStart ? rand(-this.height, this.height) : rand(-this.height, -10),
        size: rand(1.2, 3.6) * this.dpr,
        speed: rand(16, 32),
        drift: rand(12, 26),
        sway: rand(0.5, 1.3),
        twinkle: rand(0, Math.PI * 2),
        sparkle: rand(0.4, 1)
      };
    }

    reset(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.time = 0;
      const target = this.targetCount();
      this.flakes = [];
      for (let i = 0; i < target; i++) {
        this.flakes.push(this.makeFlake(true));
      }
    }

    resize(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      const target = this.targetCount();
      if (this.flakes.length < target) {
        while (this.flakes.length < target) this.flakes.push(this.makeFlake(true));
      } else if (this.flakes.length > target) {
        this.flakes.length = target;
      }
    }

    recycleFlake(flake) {
      Object.assign(flake, this.makeFlake(false));
    }

    render(ctx, dt = 0.016) {
      this.time += dt;

      const background = ctx.createLinearGradient(0, 0, 0, this.height);
      background.addColorStop(0, '#112034');
      background.addColorStop(1, '#3c5878');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.save();
      ctx.fillStyle = 'rgba(240, 248, 255, 0.9)';
      for (const flake of this.flakes) {
        flake.y += flake.speed * dt;
        flake.x += Math.sin(this.time * flake.sway + flake.twinkle) * flake.drift * dt * 0.4;
        flake.twinkle += dt * flake.sway;

        if (flake.y - flake.size > this.height) {
          this.recycleFlake(flake);
          continue;
        }
        if (flake.x < -40) flake.x = this.width + 20;
        if (flake.x > this.width + 40) flake.x = -20;

        const twinkle = 0.65 + Math.sin(this.time * 3 + flake.twinkle) * 0.35;
        ctx.globalAlpha = clamp(flake.sparkle * twinkle, 0.3, 1);
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.35;
      const haze = ctx.createLinearGradient(0, this.height * 0.45, 0, this.height);
      haze.addColorStop(0, 'rgba(255, 255, 255, 0)');
      haze.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  class AuroraScene {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.time = 0;
      this.stars = [];
      this.ribbons = [];
    }

    makeStar(initial = false) {
      return {
        x: rand(-40, this.width + 40),
        y: rand(0, this.height * 0.7),
        radius: rand(0.6, 1.8) * this.dpr,
        twinkle: rand(0, Math.PI * 2),
        speed: rand(1.5, 3.2)
      };
    }

    makeRibbon() {
      return {
        baseY: rand(0.25, 0.62),
        amplitude: rand(28, 72),
        thickness: rand(60, 140),
        speed: rand(0.08, 0.18),
        hue: rand(140, 190),
        wave: rand(0.003, 0.0055)
      };
    }

    reset(width, height, dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.time = 0;

      const starCount = clamp(Math.floor((width * height) / 2800), 120, 320);
      this.stars = [];
      for (let i = 0; i < starCount; i++) this.stars.push(this.makeStar(true));

      const ribbonCount = 3;
      this.ribbons = [];
      for (let i = 0; i < ribbonCount; i++) this.ribbons.push(this.makeRibbon());
    }

    resize(width, height, dpr) {
      this.reset(width, height, dpr);
    }

    render(ctx, dt = 0.016) {
      this.time += dt;

      const sky = ctx.createLinearGradient(0, 0, 0, this.height);
      sky.addColorStop(0, '#050c16');
      sky.addColorStop(0.5, '#061a32');
      sky.addColorStop(1, '#0a213a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.save();
      for (const star of this.stars) {
        star.twinkle += dt * star.speed;
        const sparkle = 0.45 + Math.sin(star.twinkle) * 0.55;
        ctx.globalAlpha = clamp(sparkle, 0.2, 1);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius * (0.8 + sparkle * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(214, 255, 251, 0.85)';
        ctx.fill();
      }
      ctx.restore();

      for (let i = 0; i < this.ribbons.length; i++) {
        const ribbon = this.ribbons[i];
        const baseY = this.height * ribbon.baseY;
        const grad = ctx.createLinearGradient(0, baseY - ribbon.thickness, 0, baseY + ribbon.thickness);
        grad.addColorStop(0, `hsla(${ribbon.hue}, 90%, 70%, 0)`);
        grad.addColorStop(0.5, `hsla(${ribbon.hue}, 95%, 75%, 0.55)`);
        grad.addColorStop(1, `hsla(${ribbon.hue + 40}, 85%, 65%, 0)`);

        ctx.save();
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(0, baseY + ribbon.thickness);
        const segments = 64;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const x = t * this.width;
          const wave = Math.sin(this.time * ribbon.speed + x * ribbon.wave + i);
          const y = baseY + wave * ribbon.amplitude;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(this.width, baseY + ribbon.thickness);
        ctx.lineTo(this.width, baseY - ribbon.thickness);
        ctx.lineTo(0, baseY - ribbon.thickness);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 0.25;
      const mist = ctx.createLinearGradient(0, this.height * 0.6, 0, this.height);
      mist.addColorStop(0, 'rgba(120, 244, 216, 0.0)');
      mist.addColorStop(1, 'rgba(120, 244, 216, 0.35)');
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
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
    mist: {
      label: 'Holographic Mist',
      icon: '🌫️',
      hudCode: 'NBL-22',
      description: 'Pearlescent fog drifts between neon towers.',
      voiceLabel: '霧光流轉',
      canvasLabel: 'Holographic mist animation',
      themeClass: 'theme-mist',
      accent: '#b6d4ff',
      glow: 'rgba(182, 212, 255, 0.45)',
      hudSurface: 'rgba(32, 46, 72, 0.55)',
      hudBorder: 'rgba(168, 198, 255, 0.35)',
      hudText: '#e3edff',
      hudTextRgb: '227, 237, 255',
      audio: {
        noiseLevel: 0.12,
        noiseCutoff: 5200,
        noiseFloor: 1400,
        osc1Freq: 184,
        osc1Type: 'sine',
        osc2Freq: 233.08,
        osc2Type: 'triangle',
        bassFreq: 48,
        bassType: 'sine',
        padGain: 0.05,
        bassGain: 0.018,
        lfoRate: 0.09,
        lfoDepth: 8,
        ramp: 1.5
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
    },
    snow: {
      label: 'Crystal Snowfall',
      icon: '❄️',
      hudCode: 'CRY-73',
      description: 'Iridescent snowflakes spiral through the plaza.',
      voiceLabel: '晶華飄雪',
      canvasLabel: 'Crystal snowfall animation',
      themeClass: 'theme-snow',
      accent: '#d4f2ff',
      glow: 'rgba(212, 242, 255, 0.55)',
      hudSurface: 'rgba(255, 255, 255, 0.28)',
      hudBorder: 'rgba(184, 214, 255, 0.4)',
      hudText: '#2c3f66',
      hudTextRgb: '44, 63, 102',
      audio: {
        noiseLevel: 0.09,
        noiseCutoff: 6400,
        noiseFloor: 2200,
        osc1Freq: 246.94,
        osc1Type: 'triangle',
        osc2Freq: 329.63,
        osc2Type: 'sine',
        bassFreq: 65.41,
        bassType: 'triangle',
        padGain: 0.06,
        bassGain: 0.02,
        lfoRate: 0.07,
        lfoDepth: 5,
        ramp: 1.8
      }
    },
    aurora: {
      label: 'Aurora Pulse',
      icon: '🌌',
      hudCode: 'AUR-19',
      description: 'Charged aurora waves ripple across the skyline.',
      voiceLabel: '極光脈衝',
      canvasLabel: 'Aurora pulse animation',
      themeClass: 'theme-aurora',
      accent: '#7cf4d8',
      glow: 'rgba(124, 244, 216, 0.55)',
      hudSurface: 'rgba(10, 20, 36, 0.65)',
      hudBorder: 'rgba(120, 230, 210, 0.35)',
      hudText: '#d6fffb',
      hudTextRgb: '214, 255, 251',
      audio: {
        noiseLevel: 0.18,
        noiseCutoff: 5600,
        noiseFloor: 1000,
        osc1Freq: 174.61,
        osc1Type: 'sine',
        osc2Freq: 261.63,
        osc2Type: 'sawtooth',
        bassFreq: 55,
        bassType: 'square',
        padGain: 0.065,
        bassGain: 0.05,
        lfoRate: 0.14,
        lfoDepth: 11,
        ramp: 1.5
      }
    }
  };

  const weatherOrder = ['sun', 'mist', 'rain', 'storm', 'snow', 'aurora'];
  const themeClasses = Array.from(new Set(Object.values(weatherModes).map(meta => meta.themeClass)));

  const scenes = {
    sun: new SunnyScene(),
    mist: new MistScene(),
    rain: new RainScene(),
    storm: new StormScene(),
    snow: new SnowScene(),
    aurora: new AuroraScene()
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let current = 'sun';

  const musicTracks = [
    {
      id: 'synth-lab',
      name: 'Synth Lab',
      description: 'Procedural neon soundscape',
      type: 'synth',
      credit: '原創聲景 · 程式即時合成，適合依天氣漸變。'
    },
    {
      id: 'calm-soundscape',
      name: 'Calm Soundscape',
      description: 'ZakharValaha · Ambient',
      type: 'file',
      src: 'https://cdn.pixabay.com/download/audio/2022/03/01/audio_c956099f16.mp3?filename=calm-soundscape-ambient-11013.mp3',
      credit: 'Calm Soundscape - ZakharValaha (Pixabay License · 無版權音樂)'
    },
    {
      id: 'digital-dream',
      name: 'Digital Dream',
      description: 'Mixaund · Chillwave',
      type: 'file',
      src: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_dae0d37340.mp3?filename=digital-dream-11259.mp3',
      credit: 'Digital Dream - Mixaund (Pixabay License · 無版權音樂)'
    }
  ];

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
  let currentTrackId = musicTracks[0]?.id ?? 'synth-lab';
  let dockOpen = false;

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

  function setDockOpen(open) {
    dockOpen = open;
    if (!dock || !dockToggle) return;
    dock.classList.toggle('open', open);
    dockToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggleDock(force) {
    const next = typeof force === 'boolean' ? force : !dockOpen;
    setDockOpen(next);
  }

  function getCurrentTrack() {
    return musicTracks.find(track => track.id === currentTrackId) ?? musicTracks[0];
  }

  function updateDockTrackDisplay() {
    const track = getCurrentTrack();
    if (dockTrackLabel) dockTrackLabel.textContent = track ? track.name : '';
    if (musicCreditEl) musicCreditEl.textContent = track?.credit ?? '';
  }

  function highlightWeather(mode) {
    weatherButtons.forEach((btn, key) => {
      if (!btn) return;
      btn.classList.toggle('is-active', key === mode);
    });
  }

  function highlightTrack(id) {
    musicButtons.forEach((btn, key) => {
      if (!btn) return;
      btn.classList.toggle('is-active', key === id);
    });
    updateDockTrackDisplay();
  }

  function buildWeatherOptions() {
    if (!weatherOptionsEl) return;
    weatherOptionsEl.innerHTML = '';
    weatherButtons.clear();
    for (const key of weatherOrder) {
      const meta = weatherModes[key];
      if (!meta) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dock-option';
      btn.dataset.weather = key;
      btn.innerHTML = `<span class="option-icon">${meta.icon}</span><span>${meta.label}</span>`;
      btn.addEventListener('click', () => {
        setWeather(key);
        highlightWeather(key);
        toggleDock(false);
      });
      weatherButtons.set(key, btn);
      weatherOptionsEl.appendChild(btn);
    }
  }

  function buildMusicOptions() {
    if (!musicOptionsEl) return;
    musicOptionsEl.innerHTML = '';
    musicButtons.clear();
    for (const track of musicTracks) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dock-option';
      btn.dataset.track = track.id;
      btn.innerHTML = `<span class="option-icon">${track.type === 'synth' ? '🪐' : '🎵'}</span><span>${track.name}</span>`;
      btn.title = track.description ?? track.name;
      btn.addEventListener('click', () => {
        selectTrack(track.id);
      });
      musicButtons.set(track.id, btn);
      musicOptionsEl.appendChild(btn);
    }
  }

  if (dock) {
    dock.addEventListener('mouseenter', () => setDockOpen(true));
    dock.addEventListener('mouseleave', () => setDockOpen(false));
    dock.addEventListener('focusin', () => setDockOpen(true));
    dock.addEventListener('focusout', event => {
      if (!dock.contains(event.relatedTarget)) {
        setDockOpen(false);
      }
    });
  }
  if (dockToggle) {
    dockToggle.addEventListener('click', () => toggleDock());
    dockToggle.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDockOpen(false);
      }
    });
  }
  if (dockPanel) {
    dockPanel.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDockOpen(false);
        dockToggle?.focus();
      }
    });
  }

  async function selectTrack(id) {
    if (!id || id === currentTrackId) {
      highlightTrack(currentTrackId);
      toggleDock(false);
      return;
    }
    const track = musicTracks.find(item => item.id === id);
    if (!track) return;
    const wasPlaying = musicOn;
    if (wasPlaying) {
      stopMusic();
    }
    currentTrackId = id;
    highlightTrack(id);
    if (track.type === 'file' && audioEl) {
      audioEl.src = track.src ?? '';
      if (typeof audioEl.load === 'function') audioEl.load();
    }
    if (track.type === 'synth') {
      pendingProfile = weatherModes[current].audio;
    }
    updateMusicButton();
    if (wasPlaying) {
      await startMusic({ immediate: true });
    }
    toggleDock(false);
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
    if (dockWeatherIcon) dockWeatherIcon.textContent = meta.icon;
    if (dockWeatherLabel) dockWeatherLabel.textContent = meta.label;

    canvas.setAttribute('aria-label', meta.canvasLabel);

    return meta;
  }

  function scheduleAudioProfile(profile, immediate = false) {
    pendingProfile = profile;
    if (getCurrentTrack()?.type !== 'synth') return;
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
    highlightWeather(mode);
    if (meta && getCurrentTrack()?.type === 'synth') {
      scheduleAudioProfile(meta.audio);
    }
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
    const scene = scenes[current];
    if (scene) scene.reset(width, height, dpr);
  }, { passive: true });

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

  async function startSynthSoundscape(immediate = false) {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = null;
      buildAudio();
    }
    if (!audioCtx) return false;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    masterGain?.gain.cancelScheduledValues(t);
    masterGain?.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain?.gain.linearRampToValueAtTime(0.2, t + 0.8);
    if (pendingProfile) {
      morphAudio(pendingProfile, immediate);
    }
    return true;
  }

  function stopSynthSoundscape() {
    if (!audioCtx || !masterGain) {
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
  }

  async function startFileTrack(track) {
    if (!audioEl || track.type !== 'file' || !track.src) return false;
    if (audioEl.src !== track.src) {
      audioEl.src = track.src;
    }
    try {
      await audioEl.play();
      return true;
    } catch {
      return false;
    }
  }

  function stopFileTrack() {
    if (!audioEl) return;
    audioEl.pause();
    audioEl.currentTime = 0;
  }

  async function startMusic(options = {}) {
    const track = getCurrentTrack();
    if (!track) return false;
    let started = false;
    if (track.type === 'synth') {
      started = await startSynthSoundscape(options.immediate);
    } else if (track.type === 'file') {
      started = await startFileTrack(track);
    }
    if (started) {
      musicOn = true;
      body.classList.add('music-active');
      updateMusicButton();
    }
    return started;
  }

  function stopMusic() {
    const track = getCurrentTrack();
    if (track?.type === 'synth') {
      stopSynthSoundscape();
    } else {
      stopFileTrack();
    }
    musicOn = false;
    body.classList.remove('music-active');
    pendingProfile = weatherModes[current].audio;
    updateMusicButton();
  }

  function updateMusicButton() {
    if (!musicBtn) return;
    const track = getCurrentTrack();
    musicBtn.textContent = musicOn ? '🔊' : '♫';
    const labelBase = track ? track.name : musicOn ? 'AUDIO ON' : 'AUDIO OFF';
    musicBtn.dataset.label = musicOn ? `${labelBase} 播放中` : labelBase;
    musicBtn.setAttribute('aria-label', musicOn ? `關閉聲景：${track?.name ?? ''}` : `啟動聲景：${track?.name ?? labelBase}`);
    musicBtn.setAttribute('title', musicOn ? `關閉聲景：${track?.name ?? ''}` : `啟動聲景：${track?.name ?? labelBase}`);
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
  buildWeatherOptions();
  buildMusicOptions();
  highlightWeather(current);
  highlightTrack(currentTrackId);
  updateDockTrackDisplay();
  updateMusicButton();
  setWeather(current);

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
