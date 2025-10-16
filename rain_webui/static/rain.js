(() => {
  const canvas = document.getElementById('rain-canvas');
  const ctx = canvas.getContext('2d');

  let width = 0, height = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
  let drops = [];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function makeDrop() {
    const speed = rand(3, 9) * dpr;
    const len = rand(8, 18) * dpr;
    const thickness = rand(0.8, 1.6) * dpr;
    const drift = rand(-0.6, -0.1) * dpr; // slight wind to left
    return {
      x: rand(-20, width + 20),
      y: rand(-height, -10),
      len, speed, thickness, drift,
      alpha: rand(0.45, 0.9)
    };
  }

  function resize() {
    width = Math.floor(window.innerWidth);
    height = Math.floor(window.innerHeight);

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = clamp(Math.floor((width * height) / 4500), 250, 1200);
    if (drops.length < target) {
      while (drops.length < target) drops.push(makeDrop());
    } else if (drops.length > target) {
      drops.length = target;
    }
  }

  function step() {
    // Soft clear for slight motion blur
    ctx.fillStyle = 'rgba(10, 15, 29, 0.5)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#bcd3ff';
    ctx.lineCap = 'round';

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      ctx.globalAlpha = d.alpha;
      ctx.lineWidth = d.thickness;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.drift * 2, d.y + d.len);
      ctx.stroke();

      d.x += d.drift;
      d.y += d.speed;

      if (d.y - d.len > height || d.x < -40 || d.x > width + 40) {
        drops[i] = makeDrop();
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  requestAnimationFrame(step);
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
