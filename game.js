/* Canvas scenery, interface, input and sound. The rules live in game-engine.js. */
(function () {
  'use strict';
  const { CONFIG, LESSONS, GameModel } = window.Run188;
  const $ = id => document.getElementById(id);
  const game = $('game'), canvas = $('canvas');
  let ctx = canvas.getContext('2d');
  const model = new GameModel();
  const held = new Set();
  const storage = {
    get(key, fallback) { try { return localStorage.getItem('188cm-run:' + key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('188cm-run:' + key, String(value)); } catch { /* Colab may disable storage. Keep playing. */ } }
  };
  const ranking = new Run188Ranking.Ranking(window.RUN188_ONLINE_CONFIG, storage);
  let nicknameStart = false, nicknameAsked = storage.get('nicknameAsked', 'false') === 'true';
  let best = Number(storage.get('best', '0')) || 0;
  let lastTime = null, uiMode = '', lessonIndex = -1, soundEnabled = false, audioContext;
  let resumeAt = 0, touchCrouch = false, touchStraddle = false, lastItems = 0, ambientTime = 0;
  let reducedEffects = storage.get('reducedEffects', String(matchMedia('(prefers-reduced-motion: reduce)').matches)) === 'true';
  let lastWarningAt = -Infinity, resultVersion = 0;
  let renderScale = 1, hazeGradient, vignetteGradient;
  const drawEvents = [];
  const W = 960, H = 680, CX = 480, HORIZON = 246, GROUND = 636, CM = 1.38;

  function focusGame() { game.focus({ preventScroll: true }); $('focus-tip').hidden = true; }
  function clearInput(resetPose = true) {
    held.clear(); touchCrouch = false; touchStraddle = false;
    if (resetPose) { model.crouching = false; model.straddling = false; }
  }
  function activate(action) {
    clearInput(); resumeAt = 0; lastWarningAt = -Infinity; action(); uiMode = ''; lastItems = model.items; focusGame(); syncUI();
  }
  function pause() {
    if (!['playing', 'tutorial'].includes(model.mode)) return;
    model.paused = true; resumeAt = 0; clearInput(false); syncUI();
  }
  function resume() {
    focusGame(); clearInput(false); resumeAt = performance.now() + 3000;
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
  function grab() { model.grab(); }

  $('start-button').addEventListener('click', startWithName);
  $('tutorial-button').addEventListener('click', () => activate(() => model.startTutorial()));
  $('lesson-title-button').addEventListener('click', () => activate(() => model.title()));
  $('restart-button').addEventListener('click', startWithName);
  $('back-button').addEventListener('click', () => activate(() => model.title()));
  $('home-link').addEventListener('click', e => { e.preventDefault(); activate(() => model.title()); });
  $('next-button').addEventListener('click', () => {
    if (model.mode === 'tutorial' && model.tutorial.done && model.tutorial.step === LESSONS.length - 1) startWithName();
    else activate(() => model.nextLesson());
  });
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  $('skip-checkbox').checked = storage.get('skipTutorial', 'false') === 'true';
  $('skip-checkbox').addEventListener('change', () => {
    storage.set('skipTutorial', $('skip-checkbox').checked);
    $('skip-button').disabled = !$('skip-checkbox').checked;
  });
  $('skip-button').addEventListener('click', () => { if ($('skip-checkbox').checked) startWithName(); });
  $('sound-button').addEventListener('click', () => {
    soundEnabled = !soundEnabled; $('sound-button').textContent = '音：' + (soundEnabled ? 'オン' : 'オフ');
    $('sound-button').setAttribute('aria-pressed', String(soundEnabled)); tone(660); focusGame();
  });
  $('sound-button').addEventListener('pointerdown', e => e.preventDefault());
  $('effects-button').addEventListener('pointerdown', e => e.preventDefault());
  $('effects-button').addEventListener('click', () => {
    reducedEffects = !reducedEffects; storage.set('reducedEffects', reducedEffects); focusGame(); syncUI();
  });
  game.addEventListener('pointerdown', e => {
    if (!e.target.closest('button, input, label')) focusGame();
  });
  const relevantKeys = new Set(['ArrowDown', 'ShiftLeft', 'ShiftRight', 'KeyS', 'Space', 'KeyE', 'Enter', 'Escape']);
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
    if (e.code === 'Enter' && model.mode === 'gameover') startWithName();
  });
  window.addEventListener('keyup', e => {
    held.delete(e.code);
    if (game.contains(document.activeElement) && relevantKeys.has(e.code) && !e.target.matches('input, button')) e.preventDefault();
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  game.addEventListener('focusout', e => {
    if (!game.contains(e.relatedTarget) && ['playing', 'tutorial'].includes(model.mode)) pause();
  });
  function bindTouch(id, action, release) {
    const button = $(id);
    button.addEventListener('pointerdown', e => { e.preventDefault(); focusGame(); button.setPointerCapture(e.pointerId); action(); });
    button.addEventListener('pointerup', () => release?.());
    button.addEventListener('pointercancel', () => release?.());
    button.addEventListener('lostpointercapture', () => release?.());
  }
  bindTouch('touch-crouch', () => { touchCrouch = true; }, () => { touchCrouch = false; });
  bindTouch('touch-straddle', () => { touchStraddle = true; }, () => { touchStraddle = false; });
  bindTouch('touch-jump', jump); bindTouch('touch-grab', grab);

  function updateDistanceBest() {
    const text = '距離自己ベスト ' + ranking.best.toLocaleString('ja-JP') + ' m　高身長への理解度：' + Run188Ranking.understanding(ranking.best) + '％';
    document.querySelectorAll('.distance-best').forEach(el => { el.textContent = text; });
  }
  function startWithName() {
    if (!ranking.name && !nicknameAsked) {
      nicknameStart = true; openRanking(false); $('nickname-skip').hidden = false; $('nickname').focus(); return;
    }
    activate(() => model.start());
  }
  async function sendRecord() {
    const version = resultVersion;
    $('save-status').textContent = 'オンラインに記録を送信中…';
    $('ranking-send').disabled = true;
    try {
      const result = await ranking.send();
      const text = ranking.pending !== null ? '前の記録の送信が完了しました。最新の記録は未送信です。60秒後に再送信してください。' : result.changed ? 'オンラインに自己ベストを保存しました。' : 'オンラインの自己ベストを確認しました。';
      if (version === resultVersion) $('save-status').textContent = text;
      $('ranking-status').textContent = text; updateDistanceBest();
    } catch (e) {
      const text = 'オンライン保存を確認できませんでした。' + onlineError(e) + ' 記録はこの端末に残っています。';
      if (version === resultVersion) $('save-status').textContent = text;
      $('ranking-status').textContent = text;
    } finally { $('ranking-send').disabled = ranking.busy; }
  }
  function onlineError(e) {
    if (e.code === 'permission-denied' || e.code === 'firestore/permission-denied') return '送信間隔（60秒）・アクセス設定を確認し、後で再送信してください。';
    if (e.code?.includes('auth/')) return '匿名認証またはブラウザの接続を確認してください。';
    return e.message || '通信に失敗しました。時間をおいて再試行してください。';
  }
  async function refreshRanking() {
    const request = ++rankingRequest;
    $('ranking-rows').replaceChildren();
    $('ranking-status').textContent = 'ランキングを読み込み中…'; $('ranking-refresh').disabled = true;
    try {
      const rows = await ranking.top();
      if (request !== rankingRequest) return;
      rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        if (index < 3) tr.classList.add('rank-' + (index + 1));
        if (row.isSelf) tr.classList.add('ranking-self');
        for (const value of [index + 1, row.nickname, row.distance.toLocaleString('ja-JP') + ' m', Run188Ranking.understanding(row.distance) + '％']) {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        if (row.isSelf) { const badge = document.createElement('small'); badge.className = 'self-badge'; badge.textContent = 'あなた'; tr.children[1].append(badge); }
        $('ranking-rows').append(tr);
      });
      $('ranking-status').textContent = rows.length ? '距離順のランキングです。' : 'まだ記録がありません。最初の記録を目指そう。'; updateDistanceBest();
    } catch (e) { if (request === rankingRequest) $('ranking-status').textContent = onlineError(e); }
    finally { if (request === rankingRequest) $('ranking-refresh').disabled = false; }
  }
  let rankingRequest = 0;
  function openRanking(load = true) {
    $('nickname').value = ranking.name; $('nickname-error').textContent = ''; updateDistanceBest();
    $('nickname-skip').hidden = !nicknameStart;
    $('ranking-send').hidden = !ranking.enabled || ranking.pending === null;
    $('ranking-refresh').hidden = !ranking.enabled;
    if (!$('ranking-dialog').open) $('ranking-dialog').showModal();
    if (load && ranking.enabled) refreshRanking();
    else $('ranking-status').textContent = ranking.enabled ? '名前を決めて走り出そう。' : 'オンラインランキングは未設定です。ゲームとこの端末の記録は利用できます。';
  }
  document.querySelectorAll('.ranking-open').forEach(button => button.addEventListener('click', () => openRanking()));
  $('ranking-close').addEventListener('click', () => $('ranking-dialog').close());
  $('ranking-dialog').addEventListener('close', () => {
    ++rankingRequest; $('ranking-refresh').disabled = false;
    if (nicknameStart) { nicknameStart = false; nicknameAsked = true; storage.set('nicknameAsked', true); activate(() => model.start()); }
    else focusGame();
  });
  $('nickname-skip').addEventListener('click', () => $('ranking-dialog').close());
  $('nickname-form').addEventListener('submit', e => {
    e.preventDefault();
    try {
      ranking.setName($('nickname').value); nicknameAsked = true; storage.set('nicknameAsked', true); $('nickname-error').textContent = '名前を保存しました。';
      // A renamed player keeps the same anonymous account and its existing best.
      if (ranking.best > 0) ranking.pending = Math.max(ranking.pending || 0, ranking.best);
      if (nicknameStart) $('ranking-dialog').close();
      else if (ranking.enabled && ranking.pending !== null) sendRecord();
    } catch (error) { $('nickname-error').textContent = error.message; }
  });
  $('ranking-refresh').addEventListener('click', refreshRanking);
  $('ranking-send').addEventListener('click', sendRecord);
  updateDistanceBest();

  function syncUI() {
    const active = ['playing', 'tutorial'].includes(model.mode);
    if (uiMode !== model.mode) {
      if (model.mode === 'gameover') {
        resultVersion++; $('save-status').textContent = '記録が範囲外のため、オンラインに送信しませんでした。';
        best = Math.max(best, model.score); storage.set('best', best); tone(120, 0.45, 'triangle');
        $('over-reason').textContent = model.reason;
        $('final-score').textContent = model.score.toLocaleString('ja-JP');
        $('final-distance').textContent = Math.floor(model.distance).toLocaleString('ja-JP') + ' m';
        $('final-items').textContent = model.items + ' 個';
        const percent = Run188Ranking.understanding(model.distance);
        $('final-understanding').textContent = '高身長への理解度：' + percent + '％';
        $('understanding-bar').style.width = percent + '%';
        $('understanding-track').setAttribute('aria-valuenow', String(percent));
        if (ranking.record(model.distance, model.elapsed)) {
          $('save-status').textContent = 'この端末に記録しました。';
          updateDistanceBest();
          if (ranking.enabled && ranking.name) sendRecord();
        }

      }
      $('title-panel').hidden = model.mode !== 'title';
      $('over-panel').hidden = model.mode !== 'gameover';
      $('tutorial-panel').hidden = model.mode !== 'tutorial';
      game.classList.toggle('tutorial-mode', model.mode === 'tutorial');
      game.dataset.mode = model.mode;
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
    $('strain-bar').style.background = strain < 60 ? '#86df9e' : strain < 80 ? '#f2d66d' : strain < 95 ? '#f1a259' : '#fa7777';
    $('strain-track').setAttribute('aria-valuenow', String(Math.floor(strain)));
    game.dataset.strainLevel = strain < 60 ? 'low' : strain < 80 ? 'medium' : strain < 95 ? 'high' : 'critical';
    const warning = active && strain >= 95 ? '体への負荷が限界に近づいています' : active && strain >= 80 ? '体への負荷が高くなっています' : '';
    $('strain-warning').hidden = !warning;
    if ($('strain-warning').textContent !== warning) $('strain-warning').textContent = warning;
    game.classList.toggle('reduced-effects', reducedEffects);
    document.body.classList.toggle('reduced-effects', reducedEffects);
    $('effects-button').setAttribute('aria-pressed', String(reducedEffects));
    $('effects-button').textContent = '演出：' + (reducedEffects ? '弱め' : '通常');
    if (active && !model.paused && strain >= 95 && !reducedEffects && soundEnabled && model.elapsed - lastWarningAt >= 1.5) {
      tone(620, 0.1, 'triangle', 0.025); lastWarningAt = model.elapsed;
    }
    const event = model.nextEvent;
    $('next-event').hidden = !active || !event;
    const name = event ? '次の' + (event.kind === 'item' ? 'アイテム' : '障害物') + '：' + event.name : '';
    if ($('next-event').textContent !== name) $('next-event').textContent = name;
    if (model.mode === 'tutorial') {
      const t = model.tutorial;
      if (lessonIndex !== t.step) {
        $('lesson-step').textContent = (t.step + 1) + ' / ' + LESSONS.length;
        $('lesson-title').textContent = LESSONS[t.step][0]; $('lesson-text').textContent = LESSONS[t.step][1]; lessonIndex = t.step;
      }
      $('next-button').disabled = !t.done;
      $('next-button').textContent = t.step === LESSONS.length - 1 ? '走り出す →' : '次へ →';
      let progress = t.feedback;
      if (t.step === 0) progress = ['crouch', 'straddle', 'jump', 'grab'].map((k, i) => (t.actions.has(k) ? '✓ ' : '○ ') + ['しゃがむ', 'またぐ', 'ジャンプ', '手を伸ばす'][i]).join('　');
      if (t.step === 7) progress = t.recovered ? 'Spaceでジャンプの負荷も確認しましょう。' : t.peak ? 'キーを離して、ゲージの回復を見ましょう。' : 'しゃがんで、ゲージの増加を見ましょう。';
      if (t.step === 8) progress = '通過・取得 ' + t.passed + ' / 5';
      $('lesson-feedback').textContent = t.done ? 'できました！次へ進みましょう。' : progress;
      $('skip-button').disabled = !$('skip-checkbox').checked;
    }
    if (model.items > lastItems) { tone(880); setTimeout(() => tone(1320, 0.18), 80); lastItems = model.items; }
    if (model.mode === 'playing') $('mode-label').textContent = model.area.name + '　・　速度 ' + (model.speed / CONFIG.INITIAL_SPEED).toFixed(1) + '倍';
  }

  // Perspective uses the same physical clearance as collision detection.
  // At z=0 the runner's shoe-inclusive 190cm head aligns with the opening's 190cm plane.
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
  const skyCache = new Map();
  function skyLayer(area) {
    if (skyCache.has(area.id)) return skyCache.get(area.id);
    const surface = document.createElement('canvas'); surface.width = Math.ceil(W * renderScale); surface.height = Math.ceil((HORIZON + 70) * renderScale);
    const mainContext = ctx; ctx = surface.getContext('2d'); ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    try {
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 70);
    sky.addColorStop(0, '#273e52'); sky.addColorStop(0.55, area.sky); sky.addColorStop(1, '#d3ceae');
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
    if (['station', 'bus', 'store', 'home'].includes(area.id)) {
      rect(0, 0, W, HORIZON, area.sky);
      poly([[0, 0], [W, 0], [580, HORIZON - 85], [380, HORIZON - 85]], '#344856');
      for (let i = 0; i < 6; i++) { const y = 80 + i * 37; line([[100 + i * 55, y], [860 - i * 55, y]], '#cad1bb', 4 - i * .4); }
      if (area.id === 'bus') { rect(386, 258, 188, 86, '#749798'); rect(394, 266, 172, 70, '#a0b8ad'); label('路線バス', 480, 298, 14, '#34545b'); }
      if (area.id === 'home') { rect(363, 242, 234, 102, '#8b8167'); rect(386, 260, 188, 84, '#c3c3a2'); }
    }
    } finally { ctx = mainContext; }
    skyCache.set(area.id, surface); return surface;
  }
  function sceneryAt(distance) {
    const lookup = model.mode === 'tutorial' ? Run188.areaAt : d => model.areaAt(d);
    const block = Math.floor(Math.max(0, distance) / CONFIG.AREA_LENGTH);
    const current = lookup(distance), previous = block ? lookup(block * CONFIG.AREA_LENGTH - .01) : current;
    const t = Math.min(1, (distance % CONFIG.AREA_LENGTH) / 40);
    return { current, previous, mix: t * t * (3 - 2 * t) };
  }
  function mixColor(a, b, t) {
    const n = parseInt(a.slice(1), 16), m = parseInt(b.slice(1), 16);
    const channels = [16, 8, 0].map(shift => Math.round(((n >> shift) & 255) * (1-t) + ((m >> shift) & 255) * t));
    return 'rgb(' + channels.join(',') + ')';
  }
  // A fixed 88cm arm reaches 252cm with a 14cm shoulder lift during overhead reach.
  // Only direction changes; shoulder-to-elbow + elbow-to-hand is identical in every pose.
  function armPose(shoulder, target, extension = 1) {
    const length = 88 * CM, dx = target[0] - shoulder[0], dy = target[1] - shoulder[1];
    const angle = Math.atan2(dy, dx), bend = (1 - extension) * .9 * (shoulder[0] < 0 ? -1 : 1);
    const elbow = [shoulder[0] + Math.cos(angle - bend) * length * .5, shoulder[1] + Math.sin(angle - bend) * length * .5];
    const hand = [elbow[0] + Math.cos(angle + bend) * length * .5, elbow[1] + Math.sin(angle + bend) * length * .5];
    return { shoulder, elbow, hand, length };
  }

  function background() {
    const area = model.area;
    const travel = ['title', 'gameover'].includes(model.mode) ? ambientTime * 4 : model.distance;
    const scene = sceneryAt(travel);
    ctx.drawImage(skyLayer(scene.previous), 0, 0, W, HORIZON + 70);
    if (scene.mix > 0) { ctx.globalAlpha = scene.mix; ctx.drawImage(skyLayer(scene.current), 0, 0, W, HORIZON + 70); ctx.globalAlpha = 1; }
    // A continuous pavement grid, curbs and side structures move with travelled distance.
    const floor = ctx.createLinearGradient(0, HORIZON, 0, H);
    floor.addColorStop(0, mixColor(scene.previous.sky, scene.current.sky, scene.mix)); floor.addColorStop(1, mixColor(scene.previous.floor, scene.current.floor, scene.mix));
    poly([[CX - 45, HORIZON], [CX + 45, HORIZON], [W + 80, H], [-80, H]], floor);
    poly([[0, HORIZON], [CX - 45, HORIZON], [25, H], [0, H]], '#263e49');
    poly([[CX + 45, HORIZON], [W, HORIZON], [W, H], [935, H]], '#344953');
    line([[CX - 45, HORIZON], [25, H]], '#c7d2bc', 4); line([[CX + 45, HORIZON], [935, H]], '#c7d2bc', 4);
    for (const x of [-250, -125, 0, 125, 250]) line([[CX + x * 0.05, HORIZON], [CX + x * 1.55, H]], '#bdd2c425', 1);
    const firstLine = Math.floor((travel - 5) / 7);
    for (let i = firstLine; i < firstLine + 25; i++) {
      const z = i * 7 - travel, { s, y } = project(z);
      if (y < H + 30) line([[CX - 295 * s, y], [CX + 295 * s, y]], '#c7d4c63c', 1 + s);
    }
    const firstFixture = Math.floor((travel - 8) / 15);
    for (let i = firstFixture + 10; i >= firstFixture; i--) {
      const z = i * 15 - travel;
      if (z < -8) continue;
      const fixtureArea = model.mode === 'tutorial' ? Run188.areaAt(Math.max(0, i * 15)) : model.areaAt(Math.max(0, i * 15));
      const { s, y } = project(z);
      const x = CX + (i % 2 ? -405 : 405) * s;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      if (fixtureArea.id !== 'street') { areaFixture(fixtureArea.id, i); ctx.restore(); continue; }
      rect(-4, -245, 8, 245, '#2a414e'); line([[0, -245], [32, -270], [80, -270]], '#3e5562', 9);
      rect(55, -272, 31, 8, '#e0d5ac'); circle(69, -263, 14, '#f3da9320');
      rect(-115, -130, 82, 130, i % 3 ? '#52665e' : '#738277', '#758d89');
      for (let q = 0; q < 4; q++) rect(-108, -112 + q * 25, 68, 3, '#a8b8a13b');
      rect(-115, -145, 84, 15, '#c0ac80');
      rect(22, -30, 48, 30, '#9b8460'); circle(40, -41, 25, '#486d59'); circle(61, -39, 20, '#608263');
      ctx.restore();
    }
    if (model.mode === 'playing' && !reducedEffects) {
      ctx.globalAlpha = 0.1 + (model.speed / CONFIG.MAX_SPEED) * 0.12;
      for (let i = 0; i < 15; i++) {
        const p = (ambientTime * (2 + i % 3) + i * 0.13) % 1;
        const side = i % 2 ? -1 : 1;
        line([[CX + side * (100 + p * 390), HORIZON + p * 290], [CX + side * (115 + p * 430), HORIZON + p * 330]], '#d9e8d5', 1);
      }
      ctx.globalAlpha = 1;
    }
    if (!hazeGradient) {
      hazeGradient = ctx.createLinearGradient(0, HORIZON - 35, 0, HORIZON + 55);
      hazeGradient.addColorStop(0, '#c6caae00'); hazeGradient.addColorStop(.5, '#c6caae40'); hazeGradient.addColorStop(1, '#c6caae00');
    }
    const haze = hazeGradient;
    rect(0, HORIZON - 35, W, 90, haze);
  }

  function areaFixture(area, index) {
    if (area === 'park') {
      rect(-12, -185, 24, 185, '#7f7051'); circle(0, -213, 75, '#477b60'); circle(-44, -170, 46, '#5c8b64'); circle(48, -185, 52, '#719765');
      rect(-85, -40, 170, 12, '#bb9b68'); rect(-69, -28, 8, 28, '#6c715c'); rect(59, -28, 8, 28, '#6c715c');
    } else if (area === 'school') {
      rect(-90, -330, 180, 330, '#8c9e9d'); rect(-79, -296, 158, 142, '#5c7d83', '#cdd7bd');
      for (const x of [-32, 25]) line([[x, -296], [x, -154]], '#cad9c3', 5);
      rect(-75, -101, 150, 42, '#456b63'); label(index % 2 ? 'キャンパス' : '学び舎', 0, -74, 15, '#d4dfc3');
      rect(-95, -15, 190, 15, '#bca88b');
    } else if (area === 'station') {
      rect(-53, -328, 106, 328, '#a1b1a6'); rect(-53, -121, 106, 15, '#6c96a5');
      rect(-83, -283, 166, 47, '#426675'); label('通学線', 0, -253, 20, '#caddcc');
      rect(-80, -38, 160, 10, '#b1bead'); rect(-70, -28, 9, 28, '#465965'); rect(61, -28, 9, 28, '#465965');
    } else if (area === 'bus') {
      rect(-88, -326, 176, 326, '#748c98'); rect(-76, -292, 152, 142, '#a5b9b2', '#d1d9bf');
      line([[-68, -280], [67, -160]], '#e0e8cf64', 4); rect(-73, -129, 146, 88, '#356f81', '#95b6b7'); rect(-83, -44, 166, 20, '#3b6176');
      line([[83, -321], [83, -15]], '#d6bd76', 7); circle(70, -194, 8, '#bb8870');
    } else if (area === 'store') {
      rect(-91, -266, 182, 266, '#658683');
      for (let row = 0; row < 4; row++) { rect(-94, -230 + row * 57, 188, 7, '#d3d7bd'); for (let col = 0; col < 7; col++) rect(-80 + col * 24, -258 + row * 57, 18, 28, ['#b98b70', '#abc799', '#c7b876'][col % 3]); }
      rect(-97, -291, 194, 26, '#b9ce9e'); label('街のお店', 0, -273, 14, '#3d675b');
    } else if (area === 'home') {
      rect(-94, -321, 188, 321, '#a68f6d'); rect(-79, -305, 158, 279, '#d3c9a3');
      for (let y = -270; y < -20; y += 48) line([[-78, y], [78, y]], '#9f8b69', 4);
      for (const x of [-27, 27]) line([[x, -303], [x, -29]], '#9f8b69', 4);
      rect(-102, -20, 204, 20, '#b2b48a');
    }
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
  const doorDrawers = {};
  Object.assign(doorDrawers, {
    strap(e, top) {
      rect(-330, -395, 660, 25, '#8aa1a3'); line([[-315, -375], [315, -375]], '#d8ddce', 8);
      for (const x of [-130, 0, 130]) {
        rect(x - 7, -375, 14, top + 375 - 42, '#c1ccbe');
        ctx.beginPath(); ctx.ellipse(x, top - 22, 24, 18.5, 0, 0, Math.PI * 2); ctx.strokeStyle = '#e6e8d3'; ctx.lineWidth = 7; ctx.stroke();
      }
      for (const x of [-310, 245]) { rect(x, -255, 65, 150, '#86a5a5', '#bdd0c2'); rect(x, -82, 65, 54, '#466c79'); }
    },
    rack(e, top) {
      rect(-340, -373, 680, 17, '#7c949a');
      line([[-315, top - 30], [315, top - 30]], '#a8bfc0', 8);
      for (let x = -310; x <= 310; x += 27) line([[x, top - 27], [x + 10, top - 9]], '#d0dacb', 3);
      line([[-315, top - 7], [315, top - 7]], '#dbe4d2', 14);
      line([[-315, top - 7], [-315, -370]], '#91a9b0', 8); line([[315, top - 7], [315, -370]], '#91a9b0', 8);
      rect(-202, top - 61, 99, 30, '#977c63', '#d3baa1'); rect(97, top - 57, 66, 26, '#5d7c83');
    },
    bus(e, top) {
      doorBase(top, '#b9c8c1', '#84999d', 35); rect(-330, -369, 660, 369 + top, '#66818e');
      for (const x of [-315, 250]) { rect(x, top + 40, 64, 92, '#a6c1b7'); rect(x, -97, 67, 65, '#3c778c'); rect(x - 6, -36, 78, 16, '#365b73'); }
      line([[-274, -300], [-274, -20]], '#e0c784', 8); line([[279, -300], [279, -20]], '#e0c784', 8);
      rect(-90, top - 43, 180, 25, '#a0b5ad'); label('後方座席', 0, top - 24, 14, '#415f64');
    },
    club(e, top) {
      doorBase(top, '#8e7459', '#b0a68c');
      for (const x of [-329, 248]) { rect(x, top + 6, 80, -top - 13, '#917b5c'); rect(x + 8, top + 22, 64, 58, '#c1c4a0', '#6c715e'); line([[x + 42, top + 23], [x + 42, top + 80]], '#6c715e', 3); rect(x + 20, -140, 5, 27, '#d3c2a0'); }
      rect(-319, -69, 42, 47, '#6f9a82'); circle(291, -30, 22, '#bd9866'); label('部室', 0, top - 34, 19, '#e4dcc4');
    },
    tatami(e, top) {
      doorBase(top, '#8f7958', '#b8b291');
      for (const x of [-327, 247]) { rect(x, top + 8, 80, -top - 17, '#ded2a9'); for (let y = top + 45; y < -10; y += 43) line([[x, y], [x + 80, y]], '#9e8866', 4); line([[x + 40, top + 8], [x + 40, -10]], '#9e8866', 4); }
      poly([[-235, 0], [235, 0], [270, 28], [-270, 28]], '#aab08a'); line([[-30, 0], [-30, 27]], '#647556', 5);
    },
    classroom(e, top) {
      doorBase(top, '#b0bdb4', '#a3aea0');
      for (const x of [-327, 248]) { rect(x, top + 7, 79, -top - 13, e.low ? '#9e8a6d' : '#c1c9ba'); rect(x + 8, top + 28, 64, 103, '#86a8a5', '#dfe2c7'); line([[x + 40, top + 28], [x + 40, top + 131]], '#ced8bf', 3); rect(x + 18, -128, 6, 29, '#687d7d'); }
      rect(-97, top - 54, 194, 28, '#45696e'); label(e.low ? '旧校舎' : '教室', 0, top - 34, 16, '#e1e3c5');
    },
    'auto-door'(e, top) {
      doorBase(top, '#c4d6cb', '#6c9794');
      for (const x of [-329, 248]) { rect(x, top + 7, 81, -top - 14, '#a1c3ba99', '#e5ebcf'); rect(x, -159, 81, 11, '#dfd89f'); }
      rect(-328, top - 43, 656, 26, '#b8d4a7'); line([[-328, top - 17], [328, top - 17]], '#609b9a', 9); label('街のコンビニ', 0, top - 23, 17, '#3c6762'); rect(-26, top - 15, 52, 8, '#445d62');
    },
    supermarket(e, top) {
      doorDrawers['auto-door'](e, top); rect(-328, top - 61, 656, 35, '#bd965e'); label('スーパーマーケット', 0, top - 36, 20, '#f0e7c7');
      for (const x of [-288, 276]) { rect(x - 29, -77, 58, 45, '#a4bbb0', '#e2d9bc'); line([[x - 24, -69], [x + 24, -69]], '#647f7c', 3); circle(x - 19, -23, 8, '#506571'); circle(x + 19, -23, 8, '#506571'); }
    },
    gate() {
      for (const side of [-1, 1]) { const x = side < 0 ? -158 : 72; rect(x, -155, 86, 155, '#69878b', '#b9cec3'); poly([[x, -155], [x + 86, -155], [x + 99, -172], [x + 13, -172]], '#bed0be'); rect(x + 26, -176, 36, 8, '#46746e'); rect(x + 9, -109, 64, 36, '#304d5c'); circle(x + 39, -91, 7, '#95bea6'); }
      line([[-72, -8], [72, -8]], '#c0d3ac', 3);
    }
  });
  function coneShape(h, width) {
    rect(-width / 2, -7, width, 7, '#a66d44');
    poly([[-width * .4, -7], [-5, -h], [5, -h], [width * .4, -7]], '#e58e49');
    poly([[-width * .24, -h * .45], [-width * .15, -h * .67], [width * .15, -h * .67], [width * .24, -h * .45]], '#efe9d5');
  }
  function groundObstacle(e) {
    const h = e.height * CM, width = e.width * CM;
    ctx.fillStyle = '#132c384d'; ctx.beginPath(); ctx.ellipse(0, 2, width * .6, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (e.style === 'suitcase') {
      rect(-width * .22, -h, width * .44, 7, '#495c64');
      rect(-width / 2, -h + 7, width, h - 19, '#ad8876', '#dbbda0');
      for (let i = 1; i < 5; i++) line([[-width / 2 + i * width / 5, -h + 17], [-width / 2 + i * width / 5, -19]], '#7e675f', 3);
      rect(-12, -h + 19, 24, 5, '#dbc6a5');
      for (const x of [-width * .32, width * .32]) circle(x, -6, 6, '#344d56');
    } else if (e.style === 'double-cone') {
      for (const x of [-width * .27, width * .27]) { ctx.save(); ctx.translate(x, 0); coneShape(h, width * .42); ctx.restore(); }
    } else if (e.style === 'vault') {
      for (let row = 0; row < 5; row++) {
        const y = -h + row * h / 5, upper = width * (.72 + .28 * row / 5) / 2, lower = width * (.72 + .28 * (row + 1) / 5) / 2;
        poly([[-upper, y], [upper, y], [lower, y + h / 5], [-lower, y + h / 5]], row % 2 ? '#b78c5c' : '#c6a16b', '#7f7058');
        for (const x of [-width * .16, width * .16]) rect(x - 4, y + h / 10 - 2, 8, 4, '#745e4e');
      }
      rect(-width * .36, -h, width * .72, h / 10, '#6a9596');
    } else if (['pole', 'park-pole'].includes(e.style)) {
      ctx.beginPath(); ctx.ellipse(0, -5, 27, 8, 0, 0, Math.PI * 2); ctx.fillStyle = '#4e5b56'; ctx.fill();
      rect(-width / 2, -h, width, h - 5, e.style === 'pole' ? '#db874f' : '#a48960');
      ctx.beginPath(); ctx.ellipse(0, -h + 7, width / 2, 7, 0, 0, Math.PI * 2); ctx.fillStyle = e.style === 'pole' ? '#e89d63' : '#b1a17b'; ctx.fill();
      for (const ratio of [.2, .46]) rect(-width / 2, -h + h * ratio, width, 10, '#e9e3c8');
    } else if (e.style === 'cone') {
      coneShape(h, width);
    } else if (e.style === 'marker') {
      poly([[-width / 2, -4], [-width / 4, -h], [width / 4, -h], [width / 2, -4]], '#d3b860'); circle(0, -h + 4, 3, '#6f8c7a');
    } else if (e.style === 'divider') {
      rect(-width / 2, -h, width, 15, '#bdb58c'); for (const x of [-width * .35, width * .35]) rect(x, -h + 15, 8, h - 15, '#819088');
    } else if (['balance', 'hurdle', 'play-base'].includes(e.style)) {
      if (e.style === 'play-base') { poly([[-width / 2, 0], [-width / 2 + 15, -h], [width / 2 - 15, -h], [width / 2, 0]], '#719b8c', '#a9c7ab'); rect(-width / 2 + 20, -h + 10, width - 40, 8, '#c1d0af'); }
      else { rect(-width / 2, -h, width, 10, e.style === 'balance' ? '#b7a074' : '#ddd4a4'); for (const x of [-width * .43, width * .43]) { rect(x, -h + 10, 7, h - 10, '#859e8b'); rect(x - 15, -6, 35, 6, '#799084'); } }
    } else {
      ctx.save(); ctx.scale(width / ({ panda: 114, elephant: 137, turtle: 133, horse: 143 }[e.style] || 143), 1);
      rect(-35, -9, 70, 9, '#728274');
      const spring = []; for (let j = 0; j < 7; j++) spring.push([j % 2 ? 13 : -13, -12 - j * h * .025]); line(spring, '#d3d5b7', 5);
      if (e.style === 'panda') {
        ctx.beginPath(); ctx.ellipse(-9, -h * .46, 44, h * .24, 0, 0, Math.PI * 2); ctx.fillStyle = '#e2e3d1'; ctx.fill();
        circle(28, -h * .76, h * .20, '#e3e6d2'); circle(12, -h + 10, 10, '#30464c'); circle(42, -h + 10, 10, '#30464c');
        circle(20, -h * .77, 9, '#33484c'); circle(39, -h * .77, 9, '#33484c'); circle(23, -h * .79, 2, '#f3f0d7'); circle(42, -h * .79, 2, '#f3f0d7'); circle(31, -h * .64, 5, '#33484c');
        line([[-32, -h * .5], [-42, -h * .29]], '#33484c', 16); line([[15, -h * .47], [16, -h * .25]], '#33484c', 16);
      } else if (e.style === 'elephant') {
        ctx.beginPath(); ctx.ellipse(-13, -h * .5, 51, h * .28, 0, 0, Math.PI * 2); ctx.fillStyle = '#9eb2b0'; ctx.fill();
        circle(33, -h * .72, h * .26, '#aabbb5'); circle(11, -h * .72, h * .23, '#8fa7a7'); circle(43, -h * .81, 4, '#344e56');
        line([[53, -h * .65], [66, -h * .45], [63, -h * .26], [53, -h * .24]], '#b2c3b9', 14); line([[-42, -h * .38], [-42, -h * .2]], '#8ca4a5', 14);
      } else if (e.style === 'turtle') {
        ctx.beginPath(); ctx.ellipse(-5, -h * .57, 55, h * .42, 0, Math.PI, Math.PI * 2); ctx.fillStyle = '#608d6b'; ctx.fill();
        rect(-60, -h * .57, 110, h * .21, '#75a07a'); circle(58, -h * .49, 15, '#a3b780'); circle(62, -h * .59, 3, '#34574e');
        for (const x of [-35, 20]) circle(x, -h * .29, 10, '#a4b986'); line([[-43, -h * .65], [-14, -h * .89], [15, -h * .62], [39, -h * .68]], '#bfd1a0', 3);
      } else {
        ctx.beginPath(); ctx.ellipse(-16, -h * .47, 47, h * .23, 0, 0, Math.PI * 2); ctx.fillStyle = '#b99672'; ctx.fill();
        poly([[5, -h * .48], [18, -h * .90], [43, -h * .98], [67, -h * .75], [62, -h * .62], [40, -h * .64], [30, -h * .40]], '#c5a67e');
        poly([[26, -h * .89], [23, -h], [35, -h * .92]], '#c5a67e'); circle(46, -h * .79, 4, '#3c5052'); line([[12, -h * .86], [2, -h * .55]], '#736451', 8);
        for (const x of [-40, 12]) line([[x, -h * .39], [x + 4, -h * .2]], '#a88665', 13); line([[-61, -h * .52], [-76, -h * .29]], '#786751', 8);
      }
      // Common handles and saddle on otherwise distinct animal silhouettes.
      line([[-5, -h * .67], [-5, -h * .80], [6, -h * .80]], '#657c78', 4); rect(-30, -h * .67, 31, 6, '#d2bc86');
      ctx.restore();
    }
  }
  function trainGeometry(e) {
    const near = Math.max(0, e.z), far = Math.max(near, e.z + e.length);
    const point = (z, x, h) => { const p = project(z); return [CX + x * CM * p.s, p.y - h * CM * p.s]; };
    return { near, far, point };
  }
  function miniTrain(e) {
    if (e.completed || e.z + e.length <= 0) return;
    const { near, far, point } = trainGeometry(e), half = e.width / 2, h = e.height;
    const split = e.z + e.length * .52, gap = e.length * .035;
    const car = (start, end, engine) => {
      start = Math.max(near, start); end = Math.max(start, end); if (end - start < .01) return;
      const pt = (z, x, height) => point(z, x, height);
      poly([pt(start,-half,8),pt(start,half,8),pt(end,half,8),pt(end,-half,8)], '#273037');
      // Distinct side panels and a copper roof use the same near/rear planes as collision depth.
      for (const side of [-1,1]) {
        poly([pt(start,side*half,15),pt(end,side*half,15),pt(end,side*half,h-7),pt(start,side*half,h-7)], side<0?'#48788b':'#345968', '#c3c8ba');
        poly([pt(start,side*half,h-7),pt(end,side*half,h-7),pt(end,side*half,h),pt(start,side*half,h)], '#bb8165');
        for (let i=0;i<3;i++) {
          const a=start+(end-start)*(.13+i*.25),b=Math.min(end,a+(end-start)*.16);
          poly([pt(a,side*half,h*.48),pt(b,side*half,h*.48),pt(b,side*half,h*.78),pt(a,side*half,h*.78)], '#a8c2c7', '#d7e0d2');
        }
        for (const t of [.16,.82]) {
          const z=start+(end-start)*t,p=project(z),wheel=pt(z,side*(half+1),7);
          circle(...wheel, 7*CM*p.s, '#202b34'); circle(...wheel, 2.4*CM*p.s, '#c0c7bb');
        }
      }
      poly([pt(start,-half,h),pt(start,half,h),pt(end,half,h),pt(end,-half,h)], engine?'#c69877':'#8baeb4', '#e2d8c5');
      if (!engine) {
        const a=start+(end-start)*.13,b=end-(end-start)*.13;
        poly([pt(a,-half*.72,h),pt(a,half*.72,h),pt(b,half*.72,h),pt(b,-half*.72,h)],'#354e59','#b8d0d0');
        for(const t of [.32,.66]) { const z=start+(end-start)*t; line([pt(z,-half*.65,h),pt(z,half*.65,h)],'#bba283',4); }
      } else {
        const z=start+(end-start)*.57;
        line([pt(z,-half*.85,h),pt(z,half*.85,h)],'#ead2b7',2);
      }
      const front=project(start);ctx.save();ctx.translate(CX,front.y);ctx.scale(front.s,front.s);
      rect(-half*CM,-(h-7)*CM,e.width*CM,(h-22)*CM,engine?'#6794a5':'#527e90','#d2dace');
      rect(-half*CM,-h*CM,e.width*CM,7*CM,'#c99473');
      for (const x of [-half*.76,half*.08]) rect(x*CM,-h*.77*CM,half*.63*CM,h*.23*CM,'#a8c7d0','#e1e5d4');
      rect(-half*CM,-h*.4*CM,e.width*CM,5*CM,'#deb77e');
      for (const x of [-half*.67,half*.67]) circle(x*CM,-h*.29*CM,3.3*CM,'#f1dfae');
      rect(-half*.75*CM,-14*CM,half*1.5*CM,5*CM,'#304956');
      if(engine) { circle(0,-h*.31*CM,4*CM,'#ac5d64'); rect(-3*CM,-6*CM,6*CM,6*CM,'#596775'); }
      ctx.restore();
    };
    ctx.save();
    if (split+gap<far) car(split+gap,far,false);
    if (split>near) {
      line([point(Math.max(near,split-gap),0,18),point(Math.min(far,split+gap),0,18)],'#b5b9ad',4);
      car(near,Math.min(far,split-gap),true);
    }
    ctx.restore();
  }

  function obstacle(e) {
    if (e.style === 'mini-train') { miniTrain(e); return; }
    if (e.z < -e.length - 5) return;
    if (e.endurance && e.completed) return;
    if (e.endurance) {
      for (let i = 4; i >= 1; i--) {
        const z = e.z + e.length * i / 4;
        if (z <= 0) continue;
        const p = project(z); ctx.save(); ctx.translate(CX, p.y); ctx.scale(p.s, p.s); ctx.globalAlpha = .7;
        doorDrawers[e.style](e, -e.clearance * CM); ctx.restore();
      }
    }
    const { s, y } = project(e.endurance ? Math.max(0, e.z) : e.z);
    const top = -e.clearance * CM;
    ctx.save(); ctx.translate(CX, y); ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, (e.z + e.length + 5) / 5);
    // A second inner frame communicates the depth and passage duration.
    if (['straddle', 'jump'].includes(e.rule)) groundObstacle(e);
    else {
      if (e.rule !== 'open') { rect(-258, -370, 28, 370, '#344e5959'); rect(230, -370, 28, 370, '#344e5959'); }
      doorDrawers[e.style](e, top);
    }
    ctx.restore();
  }

  function itemObject(type, x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    switch (type) {
      case 'phone': rect(-13, -35, 26, 35, '#233c49', '#bbcab6'); rect(-9, -31, 18, 24, '#79a8a2'); circle(0, -4, 2, '#d8ddba'); break;
      case 'student-id': rect(-20, -26, 40, 26, '#dddcca', '#6c9990'); rect(-15, -21, 11, 15, '#84a5a5'); circle(-10, -18, 3, '#d9c4a1'); for (let y = -20; y < -4; y += 5) rect(1, y, 15, 2, '#859c88'); break;
      case 'earphones': ctx.beginPath(); ctx.arc(0, -18, 17, Math.PI, Math.PI * 2); ctx.strokeStyle = '#b3c8b6'; ctx.lineWidth = 4; ctx.stroke(); rect(-20, -20, 8, 16, '#536e7b'); rect(12, -20, 8, 16, '#536e7b'); line([[18, -4], [12, 0]], '#d2d9bd', 2); break;
      case 'notebook': rect(-19, -30, 38, 30, '#c1d2b1', '#567f75'); for (let y = -24; y < -3; y += 6) line([[-12, y], [14, y]], '#849b8b'); for (let y = -26; y < -3; y += 7) circle(-19, y, 2, '#e4deba'); break;
      case 'pencil-case': rect(-24, -18, 48, 18, '#c3a880', '#86765c'); line([[-20, -13], [18, -13]], '#e0d3a1', 2); rect(15, -13, 5, 7, '#637d7b'); break;
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
  Object.assign(propDrawers, {
    bench(h) { rect(-73, -h, 146, 10, '#b9a077'); for (const x of [-56, 48]) rect(x, -h + 10, 8, h - 10, '#687e78'); rect(-68, -h + 25, 136, 6, '#7d8d7c'); },
    blackboard(h) { rect(-130, -h, 260, 145, '#395e56', '#bfb990'); label('放課後の予定', 0, -h + 50, 19, '#cbd9b6'); line([[-90, -h + 79], [55, -h + 79]], '#c0cfaf', 2); line([[-90, -h + 105], [81, -h + 105]], '#c0cfaf', 2); rect(-138, -h + 145, 276, 9, '#d6c39b'); for (const x of [-110, 104]) rect(x, -h + 154, 6, h - 154, '#7d998a'); },
    volley(h) { rect(-4, -h, 8, h, '#cfccc1'); for (let y = -h + 8; y < -h + 92; y += 17) rect(-4, y, 8, 8, '#b07564'); rect(-101, -h + 112, 200, 8, '#d7d6bf'); for (let x = -96; x < 100; x += 20) line([[x, -h + 120], [x, -h + 208]], '#becab54d'); for (let y = -h + 135; y < -h + 210; y += 20) line([[-99, y], [99, y]], '#becab54d'); },
    'gym-wall'(h) { rect(-105, -h, 210, h, '#8da18d'); for (let y = -h + 29; y < -10; y += 36) line([[-91, y], [91, y]], '#bcc8a6', 7); line([[-91, -h], [-91, 0]], '#667d72', 7); line([[91, -h], [91, 0]], '#667d72', 7); },
    tree(h) { rect(-13, -h + 23, 26, h - 23, '#83714f'); line([[0, -h + 63], [55, -h + 5]], '#83714f', 14); circle(9, -h + 56, 59, '#477859'); circle(-39, -h + 41, 44, '#5e8d63'); circle(56, -h + 68, 43, '#709567'); }
  });
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
    ctx.globalAlpha *= runnerOpacity();
    ctx.translate(CX, GROUND - jumpOffset);
    const height = (crouched ? CONFIG.CROUCH_HEIGHT : CONFIG.PASSAGE_HEIGHT) * CM;
    const headY = -height + 21;
    const hips = crouched ? -75 : -CONFIG.INSEAM * CM;
    const shoulder = -(crouched ? CONFIG.CROUCH_HEIGHT - 38 : CONFIG.PASSAGE_HEIGHT - 40) * CM;
    // Back foot, forward foot and bright soles provide a clear running cycle.
    ctx.lineCap = 'round';
    const stride = model.jumpY > 0 ? 14 : Math.sin(phase) * (crouched ? 14 : 24);
    if (model.straddling) {
      const gap = (CONFIG.MAX_STRADDLE_WIDTH / 2 + 10) * CM;
      line([[-13, hips], [-gap * .65, -70], [-gap, -10]], '#29475b', 24);
      line([[14, hips], [gap * .65, -70], [gap, -10]], '#3d5e70', 25);
      line([[-gap - 9, -5], [-gap + 10, -5]], '#c4d8c9', 11); line([[gap - 10, -5], [gap + 10, -5]], '#d5e5d2', 11);
    } else {
      line([[-13, hips], [-21 - stride * .65, -65 + stride * .55], [-18 - stride, -10 - Math.max(0, stride * .6)]], '#29475b', 24);
      line([[14, hips], [20 + stride * .65, -65 - stride * .55], [19 + stride, -10 - Math.max(0, -stride * .6)]], '#3d5e70', 25);
      line([[-21 - stride, -5 - Math.max(0, stride * .6)], [-4 - stride, -5 - Math.max(0, stride * .6)]], '#c4d8c9', 11);
      line([[11 + stride, -5 - Math.max(0, -stride * .6)], [30 + stride, -5 - Math.max(0, -stride * .6)]], '#d5e5d2', 11);
    }
    const reachEffect = model.effects.find(f => ['reach', 'collect'].includes(f.type));
    const reaching = Boolean(reachEffect);
    const shoulderLift = reaching && reachEffect.high ? 14 * CM : 0;
    // Body and backpack, with folded torso when crouching.
    poly([[-32 + sway * .3, shoulder + bob], [31 + sway * .3, shoulder + bob - shoulderLift], [27, hips + 10], [-27, hips + 10]], '#a63b57', '#733047');
    rect(-18 + sway * .3, shoulder + 13 + bob, 37, 67, '#34333c');
    rect(-13 + sway * .3, shoulder + 22 + bob, 27, 43, '#59505b');
    line([[-22, shoulder + 7], [-24, hips - 17]], '#d8b0bd', 4);
    line([[23, shoulder + 7], [25, hips - 17]], '#d8b0bd', 4);
    // Arms extend only after E, independent of whether the attempt succeeds.
    const rightShoulder = [32 + sway * .3, shoulder + bob - shoulderLift];
    const target = reaching ? [reachEffect?.high ? 40 : 106, -(reachEffect?.high ? CONFIG.STANDING_REACH : Math.max(100, reachEffect?.height ?? 150)) * CM] : [60 + stride * .5, shoulder + 100];
    const rightArm = armPose(rightShoulder, target, reaching ? 1 : .25);
    const leftArm = armPose([-31 + sway * .3, shoulder + bob], [-65 - stride * .5, shoulder + 100], .25);
    line([leftArm.shoulder, leftArm.elbow, leftArm.hand], '#87324d', 15);
    line([rightArm.shoulder, rightArm.elbow, rightArm.hand], '#bc647d', 16);
    circle(...rightArm.hand, 8, '#dcba95'); circle(...leftArm.hand, 8, '#cba681');
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
      label(fx.text, CX + 94, y, 29, '#f1bacb');
      if (reducedEffects) { ctx.restore(); continue; }
      for (let i = 0; i < 14; i++) {
        const a = i * Math.PI * 2 / 14 + fx.seed;
        circle(CX + 100 + Math.cos(a) * t * 100, 330 + Math.sin(a) * t * 85 + t * t * 55, 3 * fx.life + 1, i % 2 ? '#dda3b5' : '#d8c3a1');
      }
      ctx.restore();
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H); background();
    drawEvents.length = 0;
    for (const event of model.events) drawEvents.push(event);
    const events = drawEvents.sort((a, b) => b.z - a.z);
    if (model.mode === 'title') {
      obstacle({ style: 'mini-train', rule: 'straddle', clearance: 70, height: 70, width: 66, z: 12, length: 6 });
      item({ prop: 'vending', object: 'drink', height: 201, z: 8, kind: 'item' });
    }
    for (const event of events) if (event.z >= 0) (event.kind === 'obstacle' ? obstacle : item)(event);
    runner();
    for (const event of events) if (event.z < 0) (event.kind === 'obstacle' ? obstacle : item)(event);
    effects();
    if (!vignetteGradient) {
      vignetteGradient = ctx.createRadialGradient(CX, 350, 180, CX, 350, 610);
      vignetteGradient.addColorStop(0, '#06132200'); vignetteGradient.addColorStop(1, '#0613227a');
    }
    const vignette = vignetteGradient; rect(0, 0, W, H, vignette);
    heightReference();
  }
  function heightReference() {
    if (!['playing', 'tutorial'].includes(model.mode)) return;
    const x = 943, top = GROUND - CONFIG.PASSAGE_HEIGHT * CM;
    line([[x, top], [x, GROUND]], '#d5ddc84d', 1);
    for (const y of [top, GROUND - 100 * CM, GROUND]) line([[x - 5, y], [x + 4, y]], '#d5ddc88a', 1);
    label('190cm', x - 9, top + 4, 10, '#d9e1cb', 'right');
  }
  function runnerOpacity() {
    const top = GROUND - (model.headHeight * CM), bottom = GROUND - model.jumpY * CM;
    const covered = model.events.some(e => {
      if (e.kind !== 'obstacle' || !['straddle', 'jump'].includes(e.rule) || e.completed || e.z < -e.length) return false;
      const p = project(e.z), objectTop = p.y - e.height * CM * p.s;
      return objectTop < bottom && p.y > top;
    });
    return covered ? 0.38 : 1;
  }
  function frame(now) {
    const dt = lastTime === null ? 0 : (now - lastTime) / 1000; lastTime = now;
    ambientTime += Math.min(dt, 0.1);
    // A long interruption pauses rather than fast-forwarding into an unseen door.
    // Up to 500ms is simulated in full; longer stalls pause instead of a visible teleport.
    if (dt > 0.5 && !model.paused) pause();
    if (resumeAt) {
      const remaining = resumeAt - now;
      $('countdown').textContent = String(Math.max(1, Math.ceil(remaining / 1000)));
      if (remaining <= 0) { resumeAt = 0; model.paused = false; }
    } else model.update(dt, touchCrouch || ['ArrowDown', 'ShiftLeft', 'ShiftRight'].some(k => held.has(k)), touchStraddle || held.has('KeyS'));
    syncUI(); draw(); requestAnimationFrame(frame);
  }
  function resizeCanvas() {
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const scale = width / W * Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(W * scale), pixelHeight = Math.round(H * scale);
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    canvas.width = pixelWidth; canvas.height = pixelHeight; renderScale = pixelWidth / W;
    ctx.setTransform(renderScale,0,0,renderScale,0,0); skyCache.clear(); hazeGradient = vignetteGradient = null;
  }
  if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(canvas);
  window.addEventListener('resize',resizeCanvas);
  resizeCanvas();
  if (storage.get('skipTutorial', 'false') !== 'true') model.startTutorial();
  syncUI(); draw(); requestAnimationFrame(frame);
  // The iframe needs an explicit click in some browsers; autofocus is only a convenience.
  focusGame();
  // Opt-in inspection for automated tests. Never enabled during ordinary play.
  if (new URLSearchParams(location.search).has('test')) window.__RUN188_TEST__ = { model, ranking, openRanking, refreshRanking, pause, draw, syncUI, project, storage, runnerOpacity, armPose, trainGeometry, resizeCanvas, sceneryAt, skyCache, camera: { HORIZON, GROUND, CM } };
})();
