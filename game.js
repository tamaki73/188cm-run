/* Canvas scenery, interface, input and sound. The rules live in game-engine.js. */
(function () {
  'use strict';
  const { CONFIG, LESSONS, GameModel } = window.Run188;
  const $ = id => document.getElementById(id);
  const game = $('game'), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const model = new GameModel();
  const held = new Set();
  const storage = {
    get(key, fallback) { try { return localStorage.getItem('188cm-run:' + key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('188cm-run:' + key, String(value)); } catch { /* Colab may disable storage. Keep playing. */ } }
  };
  let best = Number(storage.get('best', '0')) || 0;
  let lastTime = null, uiMode = '', lessonIndex = -1, soundEnabled = false, audioContext;
  let resumeAt = 0, touchCrouch = false, lastItems = 0, ambientTime = 0;
  const W = 960, H = 680, CX = 480, HORIZON = 344, GROUND = 628, CM = (GROUND - HORIZON) / 188;

  function focusGame() { game.focus({ preventScroll: true }); $('focus-tip').hidden = true; }
  function clearInput() { held.clear(); touchCrouch = false; model.crouching = false; }
  function activate(action) {
    clearInput(); resumeAt = 0; action(); uiMode = ''; lastItems = model.items; focusGame(); syncUI();
  }
  function pause() {
    if (!['playing', 'tutorial'].includes(model.mode)) return;
    model.paused = true; resumeAt = 0; clearInput(); syncUI();
  }
  function resume() {
    focusGame(); clearInput(); resumeAt = performance.now() + 3000;
    $('pause-panel').hidden = true; $('countdown').hidden = false;
  }
  function tone(frequency, duration = 0.12, type = 'sine', volume = 0.07) {
    if (!soundEnabled) return;
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
    } catch { soundEnabled = false; $('sound-button').textContent = '音：オフ'; }
  }
  function jump() { if (model.jump()) tone(290, 0.13, 'triangle'); }
  function grab() { if (model.grab()) { tone(880); setTimeout(() => tone(1320, 0.18), 80); } }

  $('start-button').addEventListener('click', () => activate(() => model.start()));
  $('tutorial-button').addEventListener('click', () => activate(() => model.startTutorial()));
  $('lesson-title-button').addEventListener('click', () => activate(() => model.title()));
  $('restart-button').addEventListener('click', () => activate(() => model.start()));
  $('back-button').addEventListener('click', () => activate(() => model.title()));
  $('home-link').addEventListener('click', e => { e.preventDefault(); activate(() => model.title()); });
  $('next-button').addEventListener('click', () => activate(() => model.nextLesson()));
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  $('skip-checkbox').checked = storage.get('skipTutorial', 'false') === 'true';
  $('skip-checkbox').addEventListener('change', () => {
    storage.set('skipTutorial', $('skip-checkbox').checked);
    $('skip-button').disabled = !$('skip-checkbox').checked;
  });
  $('skip-button').addEventListener('click', () => { if ($('skip-checkbox').checked) activate(() => model.start()); });
  $('sound-button').addEventListener('click', () => {
    soundEnabled = !soundEnabled; $('sound-button').textContent = '音：' + (soundEnabled ? 'オン' : 'オフ');
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled)); tone(660); focusGame();
  });
  $('sound-button').addEventListener('pointerdown', e => e.preventDefault());
  game.addEventListener('pointerdown', e => {
    if (!e.target.closest('button, input, label')) focusGame();
  });
  const relevantKeys = new Set(['ArrowDown', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Enter', 'Escape']);
  window.addEventListener('keydown', e => {
    if (!game.contains(document.activeElement) || !relevantKeys.has(e.code)) return;
    if (e.target.matches('input, button') && (e.code === 'Space' || e.code === 'Enter')) return;
    e.preventDefault();
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === 'Escape') { if (model.paused && !resumeAt) resume(); else pause(); return; }
    if (model.paused) return;
    if (e.code === 'Space') jump();
    if (e.code === 'KeyE') grab();
    if (e.code === 'Enter' && model.mode === 'gameover') activate(() => model.start());
  });
  window.addEventListener('keyup', e => {
    held.delete(e.code);
    if (game.contains(document.activeElement) && relevantKeys.has(e.code) && !e.target.matches('input, button')) e.preventDefault();
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  game.addEventListener('focusout', e => {
    if (!game.contains(e.relatedTarget) && ['playing', 'tutorial'].includes(model.mode)) { clearInput(); pause(); }
  });
  function bindTouch(id, action, release) {
    const button = $(id);
    button.addEventListener('pointerdown', e => { e.preventDefault(); focusGame(); button.setPointerCapture(e.pointerId); action(); });
    button.addEventListener('pointerup', () => release?.());
    button.addEventListener('pointercancel', () => release?.());
    button.addEventListener('lostpointercapture', () => release?.());
  }
  bindTouch('touch-crouch', () => { touchCrouch = true; }, () => { touchCrouch = false; });
  bindTouch('touch-jump', jump); bindTouch('touch-grab', grab);

  function syncUI() {
    const active = ['playing', 'tutorial'].includes(model.mode);
    if (uiMode !== model.mode) {
      if (model.mode === 'gameover') {
        best = Math.max(best, model.score); storage.set('best', best); tone(120, 0.45, 'triangle');
        $('over-reason').textContent = model.reason;
        $('final-score').textContent = model.score.toLocaleString('ja-JP');
        $('final-distance').textContent = Math.floor(model.distance).toLocaleString('ja-JP') + ' m';
        $('final-items').textContent = model.items + ' 個';
      }
      $('title-panel').hidden = model.mode !== 'title';
      $('over-panel').hidden = model.mode !== 'gameover';
      $('tutorial-panel').hidden = model.mode !== 'tutorial';
      game.classList.toggle('tutorial-mode', model.mode === 'tutorial');
      $('pause-button').hidden = !active;
      $('best-score').textContent = best.toLocaleString('ja-JP');
      $('mode-label').textContent = model.mode === 'tutorial' ? '練習中' : model.mode === 'playing' ? '街を、走り抜けろ。' : '街を走る、あなたの物語。';
      uiMode = model.mode;
    }
    $('pause-panel').hidden = !model.paused || Boolean(resumeAt) || !active;
    $('countdown').hidden = !resumeAt;
    $('score').textContent = String(model.score).padStart(6, '0');
    $('distance').textContent = Math.floor(model.distance).toLocaleString('ja-JP');
    $('items').textContent = String(model.items);
    const strain = model.strain;
    $('strain-value').textContent = Math.floor(strain) + '%';
    $('strain-bar').style.width = strain + '%';
    $('strain-bar').style.background = strain < 40 ? '#86df9e' : strain < 75 ? '#f2d66d' : '#fa7777';
    $('strain-track').setAttribute('aria-valuenow', String(Math.floor(strain)));
    if (model.mode === 'tutorial') {
      const t = model.tutorial;
      if (lessonIndex !== t.step) {
        $('lesson-step').textContent = (t.step + 1) + ' / 7';
        $('lesson-title').textContent = LESSONS[t.step][0]; $('lesson-text').textContent = LESSONS[t.step][1]; lessonIndex = t.step;
      }
      $('next-button').disabled = !t.done;
      $('next-button').textContent = t.step === 6 ? '走り出す →' : '次へ →';
      let progress = t.feedback;
      if (t.step === 0) progress = ['crouch', 'jump', 'grab'].map((k, i) => (t.actions.has(k) ? '✓ ' : '○ ') + ['しゃがむ', 'ジャンプ', '手を伸ばす'][i]).join('　');
      if (t.step === 3) progress = t.peak ? 'キーを離して、ゲージの回復を見ましょう。' : 'しゃがんで、ゲージの増加を見ましょう。';
      if (t.step === 6) progress = 'ジャンプ ' + Math.min(3, t.jumps) + ' / 3 回';
      $('lesson-feedback').textContent = t.done ? 'できました！次へ進みましょう。' : progress;
      $('skip-button').disabled = !$('skip-checkbox').checked;
    }
    if (model.items > lastItems) lastItems = model.items;
  }

  // Perspective uses the same physical clearance as collision detection.
  // At z=0 the runner's 188cm head aligns exactly with the opening's 188cm plane.
  function project(z) {
    const scale = 1 / (1 + Math.max(-5, z) / 23);
    return { s: scale, y: HORIZON + (GROUND - HORIZON) * scale };
  }
  function rect(x, y, w, h, fill, stroke) {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    if (stroke) { ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
  }
  function line(points, color, width = 1) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function poly(points, fill, stroke) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function circle(x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function label(text, x, y, size, color = '#dde8ec', align = 'center') {
    ctx.font = `600 ${size}px "Yu Gothic", sans-serif`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function background() {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 70);
    sky.addColorStop(0, '#273e52'); sky.addColorStop(0.55, '#79979c'); sky.addColorStop(1, '#d3ceae');
    rect(0, 0, W, H, sky);
    const sun = ctx.createRadialGradient(730, 200, 4, 730, 200, 150);
    sun.addColorStop(0, '#fff3bb98'); sun.addColorStop(1, '#fff3bb00'); rect(540, 15, 370, 355, sun);
    circle(730, 200, 32, '#efdec192');
    // Layered original city skyline, rooftop tanks and lit windows.
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 17; i++) {
        const x = i * 66 - 18 + layer * 26, height = 62 + (i * 43 % 119) + layer * 18;
        const y = HORIZON - height;
        rect(x, y, 55, height + 10, layer ? '#354954' : '#597078');
        rect(x + 7, y - 5, 39, 5, layer ? '#405564' : '#6b8285');
        for (let row = 0; row < height / 17 - 1; row++) for (let col = 0; col < 3; col++) {
          rect(x + 9 + col * 13, y + 12 + row * 17, 6, 7, (row + col + i) % 5 === 0 ? '#d0c59985' : '#89adb32a');
        }
        if (i % 4 === 0) { rect(x + 17, y - 22, 21, 17, '#617980'); line([[x + 27, y - 22], [x + 27, y - 37]], '#637e84', 2); }
      }
    }
    // A continuous pavement grid, curbs and side structures move with travelled distance.
    const floor = ctx.createLinearGradient(0, HORIZON, 0, H);
    floor.addColorStop(0, '#78918b'); floor.addColorStop(1, '#263b42');
    poly([[CX - 45, HORIZON], [CX + 45, HORIZON], [W + 80, H], [-80, H]], floor);
    poly([[0, HORIZON], [CX - 45, HORIZON], [25, H], [0, H]], '#263e49');
    poly([[CX + 45, HORIZON], [W, HORIZON], [W, H], [935, H]], '#344953');
    line([[CX - 45, HORIZON], [25, H]], '#c7d2bc', 4); line([[CX + 45, HORIZON], [935, H]], '#c7d2bc', 4);
    for (const x of [-250, -125, 0, 125, 250]) line([[CX + x * 0.05, HORIZON], [CX + x * 1.55, H]], '#bdd2c425', 1);
    const travel = ['title', 'gameover'].includes(model.mode) ? ambientTime * 4 : model.distance;
    for (let i = 0; i < 22; i++) {
      const z = i * 7 - travel % 7, { s, y } = project(z);
      if (y < H + 30) line([[CX - 295 * s, y], [CX + 295 * s, y]], '#c7d4c63c', 1 + s);
    }
    for (let i = 9; i >= 0; i--) {
      const z = i * 15 - travel % 15;
      if (z < 0) continue;
      const { s, y } = project(z);
      const x = CX + (i % 2 ? -405 : 405) * s;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      rect(-4, -245, 8, 245, '#2a414e'); line([[0, -245], [32, -270], [80, -270]], '#3e5562', 9);
      rect(55, -272, 31, 8, '#e0d5ac'); circle(69, -263, 14, '#f3da9320');
      rect(-115, -130, 82, 130, i % 3 ? '#52665e' : '#738277', '#758d89');
      for (let q = 0; q < 4; q++) rect(-108, -112 + q * 25, 68, 3, '#a8b8a13b');
      rect(-115, -145, 84, 15, '#c0ac80');
      rect(22, -30, 48, 30, '#9b8460'); circle(40, -41, 25, '#486d59'); circle(61, -39, 20, '#608263');
      ctx.restore();
    }
    if (model.mode === 'playing') {
      ctx.globalAlpha = 0.1 + (model.speed / CONFIG.MAX_SPEED) * 0.12;
      for (let i = 0; i < 15; i++) {
        const p = (ambientTime * (2 + i % 3) + i * 0.13) % 1;
        const side = i % 2 ? -1 : 1;
        line([[CX + side * (100 + p * 390), HORIZON + p * 290], [CX + side * (115 + p * 430), HORIZON + p * 330]], '#d9e8d5', 1);
      }
      ctx.globalAlpha = 1;
    }
    const haze = ctx.createLinearGradient(0, HORIZON - 35, 0, HORIZON + 55);
    haze.addColorStop(0, '#c6caae00'); haze.addColorStop(.5, '#c6caae40'); haze.addColorStop(1, '#c6caae00');
    rect(0, HORIZON - 35, W, 90, haze);
  }

  function doorBase(top, frame, wall, depth = 28) {
    // The open aperture is -230..230 wide and top..0 high in world-projected pixels.
    rect(-335, -370, 105, 370, wall); rect(230, -370, 105, 370, wall);
    rect(-335, -370, 670, 370 + top, wall);
    rect(-243, top - 14, 486, 14, frame); rect(-243, top, 13, -top, frame); rect(230, top, 13, -top, frame);
    poly([[-230, top], [-210, top - depth], [-210, -depth], [-230, 0]], '#142a3559');
    poly([[230, top], [210, top - depth], [210, -depth], [230, 0]], '#13273377');
    line([[-230, 0], [230, 0]], '#d0d3bd', 4);
    line([[-230, top], [230, top]], '#e2dfc399', 2);
  }
  const doorDrawers = {
    train(e, top) {
      doorBase(top, '#bbc5c9', '#79949d', 19);
      rect(-380, -345, 140, 320, '#8da2aa'); rect(240, -345, 140, 320, '#8da2aa');
      for (const side of [-1, 1]) {
        const x = side < 0 ? -368 : 251;
        rect(x, -308, 105, 117, '#273e50', '#cbd6d4');
        poly([[x + 8, -302], [x + 98, -302], [x + 72, -202], [x + 5, -202]], '#68898a6a');
        rect(x + 10, -179, 90, 139, '#b4c2c3', '#5d737d');
        line([[x + 48, -160], [x + 48, -77]], '#617981', 3);
      }
      rect(-380, -97, 137, 16, '#d0b879'); rect(243, -97, 137, 16, '#d0b879');
      rect(-380, -30, 760, 17, '#3b525c'); rect(-228, -5, 456, 9, '#8a9390');
      for (let i = 0; i < 6; i++) line([[-220, -4 + i * 1.6], [220, -4 + i * 1.6]], '#d1d1be', 1);
      label('都市環状線', -305, -116, 13, '#dce5df');
    },
    concrete(e, top) {
      doorBase(top, '#73827d', '#86958b', 40);
      for (let i = 0; i < 8; i++) {
        line([[-335, -355 + i * 45], [-247, -355 + i * 45]], '#c4cbb442');
        line([[247, -355 + i * 45], [335, -355 + i * 45]], '#4b64554f');
      }
      rect(-335, top - 40, 670, 25, '#5c706c');
      rect(-68, -350, 136, 10, '#fff3c0'); rect(-61, -340, 122, 4, '#d3c89b');
      for (const x of [-305, 290]) { line([[x, -320], [x + 9, -210], [x - 6, -120]], '#5b71655c'); circle(x + 9, -200, 2, '#b3c0a7'); }
    },
    loading(e, top) {
      doorBase(top, '#667f8b', '#4d6877', 24);
      for (let i = -355; i < top - 20; i += 12) line([[-315, i], [315, i]], '#9bb2b544', 3);
      for (const x of [-308, 284]) { rect(x, -185, 24, 185, '#d1b86e'); for (let y = -170; y < 0; y += 30) poly([[x, y], [x + 24, y + 13], [x + 24, y + 27], [x, y + 14]], '#394b4e'); }
      rect(-327, -53, 65, 53, '#9c7953'); line([[-295, -53], [-295, 0]], '#cab384', 4);
      rect(252, -68, 80, 68, '#a2855f'); label('搬入口', 0, -330, 17, '#b7ccd1');
    },
    brick(e, top) {
      doorBase(top, '#bba487', '#8d7667', 36);
      for (let row = 0; row < 12; row++) {
        const y = -366 + row * 30;
        for (let col = 0; col < 9; col++) {
          const x = -337 + col * 80 + (row % 2) * 40;
          if (x < -242 || x > 242 || y < top - 30) rect(x + 2, y + 2, 74, 24, '#a58a7437', '#564f492b');
        }
      }
      rect(-335, -370, 670, 10, '#d0c0a0');
      rect(-292, -236, 33, 8, '#d6c895'); rect(-287, -228, 23, 35, '#e5d8a868');
      line([[274, -332], [274, -30], [320, -30]], '#526564', 8);
      circle(281, -102, 17, '#628272'); circle(312, -85, 24, '#486a54');
    },
    parking(e, top) {
      doorBase(top, '#6d7c7b', '#748787', 30);
      rect(-330, -112, 93, 50, '#d6ba71'); rect(237, -112, 93, 50, '#d6ba71');
      line([[-327, -340], [323, -340]], '#a28567', 10);
      for (const x of [-298, 285]) { line([[x, -338], [x, -275]], '#8d7c6a', 8); rect(x - 17, -272, 40, 6, '#e2dfbe'); }
      for (const x of [-300, 300]) { rect(x - 42, -64, 82, 42, '#385361'); poly([[x - 31, -65], [x - 15, -93], [x + 23, -93], [x + 36, -65]], '#658184'); circle(x - 23, -20, 11, '#22333b'); circle(x + 24, -20, 11, '#22333b'); }
      label('P', -279, -168, 42, '#e6e9d8');
    },
    warehouse(e, top) {
      doorBase(top, '#546773', '#7a8784', 37);
      rect(-335, top - 25, 670, 22, '#3d525b'); line([[-326, top - 23], [326, top - 23]], '#95a9a5', 3);
      for (const x of [-329, 245]) {
        rect(x, -249, 78, 249, '#455e63');
        for (let row = 0; row < 3; row++) { rect(x + 4, -235 + row * 78, 70, 58, '#aa8d61'); line([[x + 37, -235 + row * 78], [x + 37, -179 + row * 78]], '#d5be8d', 3); rect(x, -170 + row * 78, 78, 7, '#b3bcab'); }
      }
      line([[-300, -346], [300, -346], [300, -285]], '#a59374', 8); rect(-335, -10, 105, 10, '#bda983');
    },
    gym(e, top) {
      doorBase(top, '#b7a37d', '#7b968a', 25);
      rect(-331, -343, 81, 320, '#b6a180', '#d7c8a3'); rect(250, -343, 81, 320, '#b6a180', '#d7c8a3');
      for (const x of [-307, 288]) for (let y = -320; y < -25; y += 30) line([[x, y], [x + 34, y]], '#807861', 3);
      rect(-330, -65, 87, 55, '#3c8586'); rect(-330, -73, 87, 8, '#60a3a0');
      circle(290, -27, 24, '#d5a76a', '#8b633e'); line([[268, -26], [313, -26]], '#805e3a', 2); line([[291, -50], [291, -4]], '#805e3a', 2);
      poly([[-243, 0], [243, 0], [275, 22], [-275, 22]], '#bda578');
      for (let y = 5; y < 22; y += 6) line([[-250, y], [250, y]], '#806b473e'); label('器具庫', 0, -335, 17, '#e6e6c6');
    },
    stairs(e, top) {
      doorBase(top, '#c0bcac', '#7d8c83', 35);
      poly([[-345, -370], [-345, top - 27], [270, top - 27], [270, -370]], '#626f68');
      // Stepped side profile and diagonal underside are separate from the horizontal opening lintel.
      for (let i = 0; i < 10; i++) { const x = -320 + i * 63, y = top - 39 - i * 8; rect(x, y - 13, 65, 13, '#b5b7a5'); line([[x, y - 13], [x + 65, y - 13]], '#e0debf', 2); }
      line([[-330, top - 24], [300, top - 105]], '#d1c8b0', 8);
      line([[-318, top - 50], [305, top - 136]], '#2e494e', 5);
      rect(251, -80, 65, 80, '#879a91');
    },
    service(e, top) {
      doorBase(top, '#4a6470', '#506a74', 45);
      for (const [x, color] of [[-307, '#9d9274'], [-281, '#6d989c'], [290, '#b49469']]) { line([[x, -362], [x, -37], [x + 14, -37]], color, 13); for (const y of [-280, -140]) rect(x - 12, y, 24, 8, '#b6bbaa'); }
      rect(-187, top - 36, 374, 28, '#374e5a');
      for (let x = -175; x < 180; x += 18) line([[x, top - 30], [x + 10, top - 15]], '#94a6a859', 4);
      rect(248, -245, 80, 90, '#849b9b', '#354c55'); circle(265, -220, 5, '#d3d08b'); rect(277, -225, 37, 10, '#344e5c');
      rect(-70, -360, 140, 7, '#dbe3c4');
    }
  };
  function obstacle(e) {
    if (e.z < -e.length - 5) return;
    const { s, y } = project(e.z);
    const top = -e.clearance * CM;
    ctx.save(); ctx.translate(CX, y); ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, (e.z + e.length + 5) / 5);
    // A second inner frame communicates the depth and passage duration.
    rect(-258, -370, 28, 370, '#344e5959'); rect(230, -370, 28, 370, '#344e5959');
    doorDrawers[e.style](e, top);
    ctx.restore();
  }

  function itemObject(type, x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    switch (type) {
      case 'drink': rect(-8, -23, 16, 23, '#d6edda', '#668c88'); rect(-5, -28, 10, 6, '#405f64'); rect(-8, -15, 16, 8, '#bb6565'); break;
      case 'hat': poly([[-21, -5], [-15, -9], [-12, -24], [12, -24], [17, -9], [25, -5], [25, 0], [-21, 0]], '#d3b183', '#8c7155'); line([[-14, -9], [16, -9]], '#688275', 5); break;
      case 'book': rect(-18, -24, 36, 24, '#d9ce9c', '#705f58'); rect(-18, -24, 5, 24, '#ba7868'); line([[-9, -18], [12, -18]], '#9c9870', 2); break;
      case 'wallet': rect(-17, -19, 34, 19, '#b78660', '#78523c'); rect(7, -12, 12, 7, '#bd9772'); circle(12, -8, 2, '#e6cf9b'); break;
      case 'ball': circle(0, -17, 18, '#dba36b', '#795b49'); line([[-18, -17], [18, -17]], '#815c3f', 2); line([[0, -34], [0, 0]], '#815c3f', 2); ctx.beginPath(); ctx.ellipse(0, -17, 9, 18, 0, 0, Math.PI * 2); ctx.stroke(); break;
      case 'towel': poly([[-20, -27], [17, -27], [17, -6], [10, 3], [-20, 0]], '#e1e7d2', '#a5b4a9'); line([[-17, -7], [15, -7]], '#769db0', 5); line([[-9, -24], [-9, -5]], '#a8b8ac', 1); break;
      default: circle(0, -12, 12, '#e1c46d', '#a08743'); circle(0, -12, 6, '#f5e1a3'); rect(-2, -25, 4, 4, '#9da690');
    }
    ctx.restore();
  }
  const propDrawers = {
    vending(h) {
      rect(-54, -h, 108, h, '#b3c9bd', '#678b8b'); rect(-45, -h + 16, 75, h - 57, '#334f60');
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) { rect(-39 + col * 16, -h + 27 + row * 44, 10, 27, ['#c4b778', '#b96d6b', '#89b5bd'][col % 3]); rect(-39 + col * 16, -h + 55 + row * 44, 10, 4, '#dcdabd'); }
      rect(36, -100, 10, 24, '#44646b'); circle(41, -60, 6, '#d7cc8b'); rect(-32, -28, 65, 16, '#304d56');
    },
    locker(h) {
      rect(-55, -h, 110, h, '#879da1', '#c1ccc1');
      for (const x of [-50, 3]) { rect(x, -h + 5, 47, h - 12, '#6e8893', '#a3b7b4'); for (let j = 0; j < 4; j++) rect(x + 8, -h + 15 + j * 6, 29, 2, '#3c5a63'); rect(x + 35, -h * .5, 4, 19, '#d6d5b8'); }
    },
    desk(h) {
      rect(-63, -h, 126, 12, '#c6b588', '#756c56'); rect(-56, -h + 12, 8, h - 12, '#66777a'); rect(49, -h + 12, 8, h - 12, '#66777a'); rect(-43, -h + 20, 80, 42, '#8d8875'); rect(-5, -h + 34, 14, 3, '#dbcfaa');
    },
    shelf(h) {
      rect(-55, -h, 110, h, '#937f60');
      for (let y = -h + 14; y < -15; y += 62) { rect(-45, y, 90, 45, '#354e51'); for (let j = 0; j < 6; j++) rect(-38 + j * 13, y + 8 + j % 3 * 3, 10, 35 - j % 3 * 3, ['#b88e70', '#8ba3a1', '#c2ba82'][j % 3]); }
      rect(-61, -h - 5, 122, 8, '#c5b188');
    },
    counter(h) {
      rect(-72, -h, 144, h, '#798a7b'); for (let x = -62; x < 70; x += 18) line([[x, -h + 12], [x, -3]], '#aebda040', 3); rect(-79, -h - 6, 158, 10, '#cab793'); rect(30, -h - 35, 32, 29, '#435d64'); rect(32, -h - 32, 26, 17, '#adc8ba');
    },
    'shop-shelf'(h) {
      rect(-60, -h, 120, h, '#66848a'); for (let y = -h + 24; y < -14; y += 64) { rect(-54, y, 108, 5, '#c0c6af'); for (let j = 0; j < 4; j++) { rect(-46 + j * 24, y - 30, 19, 29, ['#bdaa70', '#b67c71', '#b2c4b4'][j % 3]); rect(-43 + j * 24, y - 22, 13, 6, '#e4ddbb'); } } rect(-63, -h - 5, 126, 8, '#a8baad');
    },
    basket(h) {
      rect(-6, -h - 26, 12, h + 26, '#647e86'); rect(-71, -h - 99, 142, 78, '#c7d8c9', '#62878b'); rect(-28, -h - 72, 56, 42, '#d0deca', '#7f999a'); line([[-31, -h - 20], [31, -h - 20]], '#c38763', 7);
      for (let j = 0; j < 6; j++) line([[-29 + j * 12, -h - 20], [-17 + j * 7, -h + 22]], '#e0dbbb', 1.5);
      line([[-18, -h + 19], [18, -h + 19]], '#d6d4b9', 2);
    },
    storage(h) {
      rect(-64, -h, 128, h, '#9ba497'); for (let y = -h + 7; y < -10; y += 56) { rect(-54, y, 49, 49, '#708583', '#bdc4ad'); rect(4, y, 49, 49, '#7f8d82', '#bdc4ad'); rect(-36, y + 20, 12, 3, '#e1dabb'); rect(22, y + 20, 12, 3, '#e1dabb'); }
    },
    sign(h) {
      rect(-8, -h, 16, h, '#506e78'); rect(-78, -h, 156, 67, '#a1b5a6', '#d7d4b5'); label('街の案内', 0, -h + 28, 16, '#385c63'); line([[-38, -h + 46], [38, -h + 46]], '#5b7c78', 3); poly([[30, -h + 40], [40, -h + 46], [30, -h + 52]], '#5b7c78');
    }
  };
  function item(e) {
    if (e.collected || e.z < -10) return;
    const { s, y } = project(e.z);
    ctx.save(); ctx.translate(CX + 130 * s, y); ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, (e.z + 10) / 8);
    const height = e.height * CM;
    // Fixtures stand at the curb; objects remain within the runner's arm reach.
    const propHeight = e.prop === 'basket' ? height + 4 : height;
    propDrawers[e.prop](propHeight);
    const glow = ctx.createRadialGradient(0, -height - 18, 2, 0, -height - 18, 40);
    glow.addColorStop(0, '#f7e7a77c'); glow.addColorStop(1, '#f7e7a700');
    rect(-45, -height - 62, 90, 90, glow);
    itemObject(e.object, 0, -height);
    for (let i = 0; i < 3; i++) {
      const a = ambientTime * 1.5 + i * 2.1, x = Math.cos(a) * 28, yy = -height - 15 + Math.sin(a) * 24;
      line([[x - 3, yy], [x + 3, yy]], '#f5e4a7', 1.5); line([[x, yy - 3], [x, yy + 3]], '#f5e4a7', 1.5);
    }
    ctx.restore();
  }

  function runner() {
    const crouched = model.crouching;
    const jumpOffset = model.jumpY * CM;
    const running = ['playing', 'tutorial'].includes(model.mode) && !model.paused;
    const phase = running ? model.elapsed * (10 + model.speed * 0.17) : ambientTime * 5;
    const sway = Math.sin(phase) * 5, bob = model.jumpY ? 0 : Math.abs(Math.sin(phase)) * 3;
    ctx.save();
    ctx.fillStyle = '#0b253b50'; ctx.beginPath(); ctx.ellipse(CX, GROUND + 4, 47 - Math.min(15, model.jumpY * .2), 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(CX, GROUND - jumpOffset);
    const height = (crouched ? CONFIG.CROUCH_HEIGHT : CONFIG.PLAYER_HEIGHT) * CM;
    const headY = -height + 21;
    const hips = crouched ? -75 : -132;
    const shoulder = crouched ? -143 : -226;
    // Back foot, forward foot and bright soles provide a clear running cycle.
    ctx.lineCap = 'round';
    const stride = model.jumpY > 0 ? 14 : Math.sin(phase) * (crouched ? 14 : 24);
    line([[-13, hips], [-21 - stride * .65, -65 + stride * .55], [-18 - stride, -10 - Math.max(0, stride * .6)]], '#29475b', 24);
    line([[14, hips], [20 + stride * .65, -65 - stride * .55], [19 + stride, -10 - Math.max(0, -stride * .6)]], '#3d5e70', 25);
    line([[-21 - stride, -5 - Math.max(0, stride * .6)], [-4 - stride, -5 - Math.max(0, stride * .6)]], '#c4d8c9', 11);
    line([[11 + stride, -5 - Math.max(0, -stride * .6)], [30 + stride, -5 - Math.max(0, -stride * .6)]], '#d5e5d2', 11);
    // Body and backpack, with folded torso when crouching.
    poly([[-32 + sway * .3, shoulder + bob], [31 + sway * .3, shoulder + bob], [27, hips + 10], [-27, hips + 10]], '#c2df73', '#7eae68');
    rect(-18 + sway * .3, shoulder + 13 + bob, 37, 67, '#3b6770');
    rect(-13 + sway * .3, shoulder + 22 + bob, 27, 43, '#537f81');
    line([[-22, shoulder + 7], [-24, hips - 17]], '#e5edaa', 4);
    line([[23, shoulder + 7], [25, hips - 17]], '#e5edaa', 4);
    // Arms extend only after E, independent of whether the attempt succeeds.
    const reaching = model.effects.some(f => ['reach', 'collect'].includes(f.type));
    const reachHigh = model.effects.some(f => f.high);
    const handY = reaching ? -(reachHigh ? 228 : 201) * CM : shoulder + 63;
    line([[-31, shoulder + 11], [-43 - stride * .4, shoulder + 42], [-38 - stride * .55, shoulder + 76]], '#c4df78', 15);
    line([[32, shoulder + 11], [reaching ? 61 : 44 + stride * .4, reaching ? shoulder - 6 : shoulder + 38], [reaching ? 106 : 39 + stride * .55, handY]], '#cce68b', 16);
    circle(reaching ? 106 : 39 + stride * .55, handY, 8, '#dcba95');
    circle(-38 - stride * .55, shoulder + 76, 8, '#cba681');
    rect(-8, headY + 17, 16, shoulder - headY - 8, '#d6b392');
    // Head top is exactly -height: drawing and collisions share their geometry.
    circle(sway * .3, headY, 21, '#cbaa8a');
    ctx.beginPath(); ctx.arc(sway * .3, headY, 21, Math.PI, Math.PI * 2); ctx.fillStyle = '#243943'; ctx.fill();
    rect(-20 + sway * .3, headY - 3, 40, 9, '#2c424d');
    line([[-14 + sway * .3, headY + 11], [14 + sway * .3, headY + 11]], '#b48e70', 2);
    ctx.restore();
  }
  function effects() {
    for (const fx of model.effects) {
      if (fx.type !== 'collect') continue;
      ctx.save(); ctx.globalAlpha = Math.min(1, fx.life * 2);
      const t = 1 - fx.life, y = 320 - t * 75;
      label(fx.text, CX + 94, y, 29, '#e4ff9d');
      for (let i = 0; i < 14; i++) {
        const a = i * Math.PI * 2 / 14 + fx.seed;
        circle(CX + 100 + Math.cos(a) * t * 100, 330 + Math.sin(a) * t * 85 + t * t * 55, 3 * fx.life + 1, i % 2 ? '#c5ef7c' : '#e3d58f');
      }
      ctx.restore();
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); background();
    const events = [...model.events].sort((a, b) => b.z - a.z);
    if (model.mode === 'title') {
      obstacle({ style: 'train', clearance: 192, z: 23, length: 6 });
      item({ prop: 'vending', object: 'drink', height: 201, z: 8, kind: 'item' });
    }
    for (const event of events) if (event.z >= 0) (event.kind === 'obstacle' ? obstacle : item)(event);
    runner();
    for (const event of events) if (event.z < 0) (event.kind === 'obstacle' ? obstacle : item)(event);
    effects();
    const vignette = ctx.createRadialGradient(CX, 350, 180, CX, 350, 610);
    vignette.addColorStop(0, '#06132200'); vignette.addColorStop(1, '#0613227a'); rect(0, 0, W, H, vignette);
  }
  function frame(now) {
    const dt = lastTime === null ? 0 : (now - lastTime) / 1000; lastTime = now;
    ambientTime += Math.min(dt, 0.1);
    // A long interruption pauses rather than fast-forwarding into an unseen door.
    // Short frame delays still consume their full elapsed time, just like normal frames.
    if (dt > 0.75 && !model.paused) pause();
    if (resumeAt) {
      const remaining = resumeAt - now;
      $('countdown').textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
      if (remaining <= 0) { resumeAt = 0; model.paused = false; clearInput(); }
    } else model.update(dt, touchCrouch || ['ArrowDown', 'ShiftLeft', 'ShiftRight'].some(k => held.has(k)));
    syncUI(); draw(); requestAnimationFrame(frame);
  }
  if (storage.get('skipTutorial', 'false') !== 'true') model.startTutorial();
  syncUI(); draw(); requestAnimationFrame(frame);
  // The iframe needs an explicit click in some browsers; autofocus is only a convenience.
  focusGame();
  // Opt-in inspection for automated tests. Never enabled during ordinary play.
  if (new URLSearchParams(location.search).has('test')) window.__RUN188_TEST__ = { model, pause, draw, syncUI, project, storage };
})();
