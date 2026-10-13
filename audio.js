/* Original synthesized effects. No recordings, downloads or third-party assets. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Run188Audio = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const MAX_VOICES = 6;
  class Sound {
    constructor(storage) {
      this.storage = storage;
      this.enabled = storage.get('soundEnabled', 'true') !== 'false';
      const savedVolume = storage.get('soundVolume', '0.4');
      const volume = savedVolume.trim() === '' ? NaN : Number(savedVolume);
      this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.4;
      this.context = null; this.voices = new Set(); this.lastUI = -Infinity;
      this.error = ''; this.onPlay = null; this.onStateChange = null;
      this.resumePromise = null; this.pending = [];
    }
    unlock() {
      // Called only by a user gesture; simulation and page load never create audio.
      if (!this.enabled) return Promise.resolve(false);
      if (!this.resumePromise) this.error = '';
      if (this.context?.state === 'closed') { this.stopAll(); this.context = null; this.resumePromise = null; }
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) { this.error = 'このブラウザでは効果音を利用できません。'; this.onStateChange?.(); return Promise.resolve(false); }
          this.context = new Audio(); this.lastUI = -Infinity;
          this.master = this.context.createGain(); this.master.gain.value = this.volume * 0.75;
          this.master.connect(this.context.destination);
          this.noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.24), this.context.sampleRate);
          const samples = this.noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        if (this.context.state === 'running') { this.error = ''; return Promise.resolve(true); }
        if (!this.resumePromise) {
          this.resumePromise = this.context.resume().then(() => {
            if (this.context.state !== 'running') throw new Error('Audio not running');
            this.error = '';
            const pending = this.pending.splice(0);
            for (const event of pending) if (event.detail.confirmation || Date.now() - event.at < 250) this.play(event.name, event.detail);
            this.onStateChange?.();
            return true;
          }).catch(() => {
            this.stopAll(); this.error = '音を有効にするには、効果音をオフにしてからもう一度オンにしてください。';
            this.onStateChange?.(); return false;
          }).finally(() => { this.resumePromise = null; });
        }
        return this.resumePromise;
      } catch { this.error = '効果音を開始できませんでした。ゲームはそのまま遊べます。'; this.onStateChange?.(); return Promise.resolve(false); }
    }
    setEnabled(value) {
      this.enabled = Boolean(value); this.storage.set('soundEnabled', this.enabled);
      if (!this.enabled) this.stopAll();
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value) || 0));
      this.storage.set('soundVolume', this.volume);
      if (this.master) this.master.gain.setTargetAtTime(this.volume * 0.75, this.context.currentTime, 0.015);
      if (!this.volume) this.stopAll();
    }
    stopAll() { this.pending.length = 0; for (const voice of [...this.voices]) voice.stop(); }
    stopMovement() {
      this.pending = this.pending.filter(event => event.name === 'ui');
      for (const voice of [...this.voices]) if (voice.name !== 'ui') voice.stop();
    }
    play(name, detail = {}) {
      const c = this.context;
      if (!this.enabled || !this.volume || !c || c.state === 'closed' || this.error) return false;
      if (c.state !== 'running' && typeof c.startRendering !== 'function') {
        // Short first-gesture effects wait for resume; never accumulate a backlog.
        if (this.resumePromise) {
          if (name === 'foot') this.pending = this.pending.filter(event => event.name !== 'foot');
          if (this.pending.length < MAX_VOICES) this.pending.push({ name, detail, at: Date.now() });
        }
        return false;
      }
      const now = c.currentTime;
      if (name === 'ui' && now - this.lastUI < 0.07) return false;
      if (name === 'foot' && [...this.voices].some(v => v.name === 'foot')) return false;
      if (this.voices.size >= MAX_VOICES) {
        const quiet = [...this.voices].find(v => v.name === 'foot' || v.name === 'ui');
        if (!quiet) return false;
        quiet.stop();
      }
      let duration = 0.10, frequency = 180, end = 70, level = 0.08, noise = 0.025, cutoff = 900;
      switch (name) {
        case 'foot': duration = 0.09; frequency = detail.foot === 'left' ? 160 : 178; end = 100;
          level = detail.straddling ? 0.07 : detail.crouching ? 0.09 : 0.13; noise = level * 0.38; cutoff = 1900; break;
        case 'jump': duration = 0.12; frequency = 190; end = 330; level = 0.14; noise = 0.035; break;
        case 'land': duration = 0.14; frequency = 150; end = 72; level = 0.13; noise = 0.05; cutoff = 1300; break;
        case 'crouch': case 'straddle': case 'stand': duration = name === 'stand' ? 0.06 : 0.11;
          level = 0; noise = name === 'stand' ? 0.045 : 0.08; cutoff = name === 'straddle' ? 1600 : 1800; break;
        case 'collect': duration = 0.22; frequency = detail.high ? 1046 : 880;
          end = detail.high ? 1568 : 1320; level = 0.16; noise = 0; break;
        case 'collision': duration = 0.17; frequency = 105; end = 44; level = 0.11; noise = 0.065; break;
        case 'over': duration = 0.43; frequency = detail.cause === 'fatigue' ? 220 : detail.cause === 'collision' ? 105 : 260;
          end = 65; level = 0.12; noise = detail.cause === 'collision' ? 0.065 : 0; break;
        case 'alarm': duration = 0.10; frequency = 620; end = 620; level = 0.025; noise = 0; break;
        case 'ui': duration = detail.confirmation ? 0.12 : 0.07; frequency = detail.confirmation ? 660 : 540;
          end = detail.confirmation ? 880 : 370; level = 0.10; noise = 0; break;
        default: return false;
      }
      const sources = [], nodes = [];
      const voice = { name, stop: () => {
        for (const source of sources) { source.onended = null; try { source.stop(); } catch {} }
        for (const node of [...sources, ...nodes]) node.disconnect();
        this.voices.delete(voice);
      } };
      const envelope = (source, peak, seconds) => {
        const gain = c.createGain(); nodes.push(gain);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
        source.connect(gain); gain.connect(this.master);
      };
      if (level) {
        const oscillator = c.createOscillator(); oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, now);
        if (name === 'collect') oscillator.frequency.setValueAtTime(end, now + 0.08);
        else if (name === 'over') {
          // Impact/fatigue and ending form one voice; no duplicated game-over tone.
          oscillator.frequency.exponentialRampToValueAtTime(end * 2, now + 0.10);
          oscillator.frequency.setValueAtTime(end * 2, now + 0.14);
          oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        } else oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        sources.push(oscillator); envelope(oscillator, level, duration);
      }
      if (noise) {
        const source = c.createBufferSource(), filter = c.createBiquadFilter();
        source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = cutoff;
        source.connect(filter); nodes.push(filter); sources.push(source);
        envelope(filter, noise, Math.min(duration, 0.13));
      }
      this.voices.add(voice);
      // One completion callback stops and disconnects every node in the voice.
      sources[0].onended = voice.stop;
      for (const source of sources) { source.start(now); source.stop(now + duration); }
      if (name === 'ui') this.lastUI = now;
      if (this.onPlay) this.onPlay({ name, ...detail, audioTime: now, voices: this.voices.size, level });
      return true;
    }
    consume(events, model) {
      const over = events.find(e => e.name === 'over');
      if (over) { this.stopAll(); this.play('over', over); return; }
      if (model.paused || !['playing', 'tutorial'].includes(model.mode)) { this.stopMovement(); return; }
      let latestFoot;
      for (const event of events) if (event.name === 'foot') latestFoot = event;
      for (const event of events) {
        // Never replay a backlog after a slow frame or resume.
        if (event.name === 'foot' && (event !== latestFoot || model.jumpY > 0 || model.jumpVelocity > 0 || model.elapsed - event.time > 0.12)) continue;
        if (event.name === 'jump') for (const voice of [...this.voices]) if (voice.name === 'foot') voice.stop();
        this.play(event.name, event);
      }
    }
  }
  return { Sound, MAX_VOICES };
});
