/* 188cm RUN — original game logic. Distances are metres, heights are centimetres. */
(function (root) {
  'use strict';
  // Adjust these values to tune the game. Simulation uses seconds, never frame counts.
  const CONFIG = Object.freeze({
    PLAYER_HEIGHT: 188, PASSAGE_HEIGHT: 190, INSEAM: 90,
    VERTICAL_JUMP: 75, STANDING_REACH: 252, MAX_REACH: 327,
    INITIAL_SPEED: 16, MAX_SPEED: 56, TUTORIAL_SPEED: 9,
    GRAVITY: 600, JUMP_POWER: 300, CROUCH_HEIGHT: 122,
    MAX_STRADDLE_WIDTH: 80, STRADDLE_STRAIN_RATE: 20,
    CROUCH_STRAIN_RATES: [15, 25, 35], CROUCH_STAGE_SECONDS: [2, 4],
    CROUCH_RESET_SECONDS: 1, STRAIN_RECOVERY_RATE: 8,
    JUMP_STRAIN: 12, ANKLE_RECOVERY_RATE: 2,
    ITEM_REACH_TIME: 0.42, GRAB_BUFFER_SECONDS: 0.4, REACH_TOLERANCE: 2,
    MIN_REACTION_TIME: 3.4, ACTION_BUFFER: 0.3, PLANNER_STRAIN_LIMIT: 55, ENDURANCE_SECONDS: 3.9, ENDURANCE_MARGIN: 0.3, RECOVERY_TARGET: 20,
    AREA_LENGTH: 180, SPAWN_DISTANCE: 100, FIXED_STEP: 1 / 120
  });
  const SPEED_POINTS = [[0, 1], [100, 1.4], [200, 1.9], [300, 2.4], [500, 3.1], [800, 3.5]];
  function speedAt(distance) {
    for (let i = 1; i < SPEED_POINTS.length; i++) {
      const [end, value] = SPEED_POINTS[i], [start, previous] = SPEED_POINTS[i - 1];
      if (distance <= end) {
        const t = Math.max(0, (distance - start) / (end - start));
        return CONFIG.INITIAL_SPEED * (previous + (value - previous) * t * t * (3 - 2 * t));
      }
    }
    return CONFIG.MAX_SPEED;
  }
  const AREAS = [
    { id: 'street', name: '通学路', sky: '#79979c', floor: '#263b42', accent: '#a5c59b' },
    { id: 'school', name: '学校・大学', sky: '#8da9ba', floor: '#6d756d', accent: '#c8d9a4' },
    { id: 'station', name: '電車・駅', sky: '#7e99a5', floor: '#344751', accent: '#a1c7cd' },
    { id: 'bus', name: '路線バス', sky: '#8c9d9e', floor: '#3c4e61', accent: '#c9b78c' },
    { id: 'store', name: 'コンビニ・スーパー', sky: '#97b4b0', floor: '#566967', accent: '#bcdaaa' },
    { id: 'park', name: '公園', sky: '#8db7af', floor: '#556c49', accent: '#c2d194' },
    { id: 'home', name: '自宅', sky: '#b5a6a0', floor: '#685e48', accent: '#d6bc91' }
  ];
  const areaAt = distance => AREAS[Math.floor(Math.max(0, distance) / CONFIG.AREA_LENGTH) % AREAS.length];
  const OBSTACLES = [];
  const ITEMS = [
    { id: 'drink', prop: 'vending', object: 'drink', high: false },
    { id: 'low-hat', prop: 'locker', object: 'hat', high: false },
    { id: 'trinket', prop: 'desk', object: 'trinket', high: false },
    { id: 'book', prop: 'shelf', object: 'book', high: false },
    { id: 'wallet', prop: 'counter', object: 'wallet', high: false },
    { id: 'low-ball', prop: 'shop-shelf', object: 'ball', high: false },
    { id: 'towel', prop: 'basket', object: 'towel', high: true },
    { id: 'high-hat', prop: 'shelf', object: 'hat', high: true },
    { id: 'high-ball', prop: 'locker', object: 'ball', high: true },
    { id: 'storage', prop: 'storage', object: 'trinket', high: true },
    { id: 'sign', prop: 'sign', object: 'trinket', high: true }
  ];
  // Curated, visually distinct obstacles for the student-life route.
  const overhead = (id, name, style, min, max, areas) => ({ id, name, style, min, max, areas, rule: 'overhead', low: min < CONFIG.PASSAGE_HEIGHT });
  OBSTACLES.push(
    overhead('strap', '電車の吊り革', 'strap', 160, 165, ['station']),
    overhead('rack-bar', '電車の網棚', 'rack', 180, 185, ['station']),
    overhead('bus-roof', 'バスの後方天井', 'bus', 180, 185, ['bus']),
    overhead('club-door', '古い部室の引き戸', 'club', 175, 180, ['school']),
    overhead('tatami', '和室の鴨居', 'tatami', 175, 180, ['home']),
    overhead('new-class', '新しい教室のドア', 'classroom', 200, 200, ['school']),
    overhead('convenience', 'コンビニの自動ドア', 'auto-door', 200, 210, ['store']),
    overhead('supermarket', 'スーパーの自動ドア', 'supermarket', 200, 210, ['store']),
    { id: 'ticket-gate', name: '駅の自動改札', style: 'gate', rule: 'open', min: Infinity, max: Infinity, areas: ['station'] },
    { id: 'lane-pole', name: '車線分離ポール', style: 'pole', rule: 'straddle', min: 60, max: 75, width: 20, areas: ['street'] },
    { id: 'cone', name: 'カラーコーン', style: 'cone', rule: 'straddle', min: 50, max: 50, width: 38, areas: ['street', 'school'] },
    ...[['panda', 'パンダ', 45], ['elephant', 'ゾウ', 50], ['turtle', 'カメ', 35], ['horse', 'ウマ', 55]].map(([id, animal, height]) =>
      ({ id, name: animal + 'のスプリング遊具', style: id, rule: 'jump', min: height, max: height, width: 130, areas: ['park'] })),
    { id: 'mini-train', name: 'ミニ電車', style: 'mini-train', rule: 'straddle', min: 70, max: 70, width: 66, areas: ['park', 'street'] },
    { id: 'suitcase', name: 'スーツケース', style: 'suitcase', rule: 'straddle', min: 65, max: 65, width: 40, areas: ['station', 'bus', 'street'] },
    { id: 'double-cone', name: 'カラーコーン2個', style: 'double-cone', rule: 'jump', min: 50, max: 50, width: 130, areas: ['street', 'school'] },
    { id: 'vault', name: '跳び箱5段', style: 'vault', rule: 'straddle', min: 75, max: 75, width: 64, areas: ['school'] },
  );
  const objectNames = { drink: '飲み物', hat: '帽子', trinket: '小物', book: '本', wallet: '財布', ball: 'ボール', towel: 'タオル' };
  for (const def of ITEMS) {
    def.name = objectNames[def.object]; def.min = def.high ? (def.prop === 'basket' ? 305 : 300) : 201;
    def.max = def.high && def.prop === 'sign' ? 325 : def.min;
    def.areas = def.prop === 'sign' ? ['street'] : ['locker', 'desk', 'basket', 'storage'].includes(def.prop) ? ['school'] : ['store'];
  }
  ITEMS.find(d => d.id === 'wallet').areas.push('bus', 'home');
  ITEMS.push(
    { id: 'phone', name: 'スマートフォン', object: 'phone', prop: 'bench', min: 115, max: 115, areas: ['street', 'bus', 'park', 'home'] },
    { id: 'student-id', name: '学生証', object: 'student-id', prop: 'desk', min: 140, max: 140, areas: ['school', 'station'] },
    { id: 'earphones', name: 'イヤホン', object: 'earphones', prop: 'bench', min: 130, max: 130, areas: ['street', 'station', 'park', 'home'] },
    { id: 'notebook', name: 'ノート', object: 'notebook', prop: 'desk', min: 140, max: 140, areas: ['school', 'home'] },
    { id: 'pencil-case', name: '筆箱', object: 'pencil-case', prop: 'desk', min: 145, max: 145, areas: ['school'] },
    { id: 'blackboard-item', name: '黒板の上の学生証', object: 'student-id', prop: 'blackboard', min: 240, max: 250, areas: ['school'] },
    { id: 'locker-item', name: 'ロッカーの上のノート', object: 'notebook', prop: 'locker', min: 230, max: 250, areas: ['school'] },
    { id: 'volley-item', name: 'アンテナ付近のタオル', object: 'towel', prop: 'volley', min: 323, max: 323, areas: ['school'] },
    { id: 'gym-towel', name: '体育館のタオル', object: 'towel', prop: 'gym-wall', min: 310, max: 310, areas: ['school'] },
    { id: 'park-ball', name: '木の枝のボール', object: 'ball', prop: 'tree', min: 305, max: 305, areas: ['park'] }
  );
  const LESSONS = [
    ['4つの動作を試そう', '↓ / Shiftでしゃがむ、Sを押してまたぐ、Spaceでジャンプ、Eで手を伸ばす。4つを試しましょう。'],
    ['立ったまま通過しよう', '新しい教室の入口には頭上の余裕があります。何も押さず、立ったまま抜けましょう。'],
    ['頭上を避けよう', '吊り革の輪が頭に重なります。↓ / Shiftを、通過が終わるまで押し続けましょう。'],
    ['脚を広げてまたごう', 'ミニ電車が迫ります。Sを押して脚を左右に広げ、抜けるまで維持しましょう。'],
    ['足元を上げて飛び越えよう', '横2個のコーンに近づいたらSpace。足が上を通るよう、少し手前でジャンプしましょう。'],
    ['立ってEで取得しよう', '学生証が手元に近づいたら、立ったままE。自動では取得しません。通常プレイは取り逃がすと終了です。'],
    ['空中でEを押そう', '高いタオルはSpaceでジャンプしてE。少し早いE入力は0.4秒間予約され、手が届くと取得できます。'],
    ['疲労を管理しよう', 'しゃがんで12%以上にし、立って6%以下まで回復。最後に1回ジャンプして負荷を見ましょう。長押しほど疲労が増えます。'],
    ['動作を組み合わせよう', 'しゃがむ → 立ってE → ジャンプしてE → Sでまたぐ → ジャンプで回避。見た目で判断して5つを続けましょう。']
  ];
  class GameModel {
    constructor(random = Math.random) { this.random = random; this.mode = 'title'; this.reset(); }
    reset() {
      this.distance = 0; this.itemScore = 0; this.items = 0;
      this.crouchStrain = 0; this.ankleStrain = 0; this.crouchEffort = 0; this.uprightTime = 0;
      this.jumpY = 0; this.jumpVelocity = 0; this.crouching = false; this.straddling = false;
      this.speed = CONFIG.INITIAL_SPEED; this.events = []; this.effects = [];
      this.spawnTimer = 0.6; this.lastId = ''; this.kindRun = 0; this.lastKind = '';
      this.elapsed = 0; this.reason = ''; this.paused = false; this.serial = 0;
      this.planTime = 0; this.planLoad = 0; this.planEndTime = 0; this.recoveryUntil = 0; this.nextChallengeDistance = 350; this.challenges = 0; this.completedEvents = 0;
      this.grabReservation = { remaining: 0, uid: null };
      this.tutorial = { step: 0, done: false, actions: new Set(), peak: false, recovered: false, retry: 0, feedback: '', passed: 0 };
    }
    get strain() { return Math.min(100, this.crouchStrain + this.ankleStrain); }
    get score() { return Math.floor(this.distance * 10) + this.itemScore; }
    get headHeight() { return (this.crouching && this.jumpY === 0 ? CONFIG.CROUCH_HEIGHT : CONFIG.PASSAGE_HEIGHT) + this.jumpY; }
    get handHeight() { return CONFIG.STANDING_REACH + this.jumpY; }
    get area() { return areaAt(this.distance); }
    get nextEvent() { return this.events.filter(e => !e.completed && !e.collected).reduce((first, event) => !first || event.z < first.z ? event : first, null); }
    start() { this.reset(); this.mode = 'playing'; }
    startTutorial() { this.reset(); this.mode = 'tutorial'; this.speed = CONFIG.TUTORIAL_SPEED; this.setupLesson(); }
    title() { this.reset(); this.mode = 'title'; }
    setupLesson() {
      this.events = []; this.jumpY = 0; this.jumpVelocity = 0; this.crouching = false; this.straddling = false;
      this.crouchStrain = 0; this.ankleStrain = 0; this.crouchEffort = 0; this.uprightTime = 0;
      this.grabReservation = { remaining: 0, uid: null };
      Object.assign(this.tutorial, { done: false, actions: new Set(), peak: false, recovered: false, retry: 0, feedback: '', passed: 0 });
      this.spawnLessonEvent();
    }
    nextLesson() {
      if (!this.tutorial.done) return;
      if (this.tutorial.step === LESSONS.length - 1) { this.start(); return; }
      this.tutorial.step++; this.setupLesson();
    }
    spawnLessonEvent() {
      const obstacle = (id, z = 43) => { const def = OBSTACLES.find(e => e.id === id); this.events.push(this.makeObstacle(def, def.min, z)); };
      const item = (id, z = 43) => this.events.push(this.makeItem(ITEMS.find(e => e.id === id), z));
      const step = this.tutorial.step;
      if (step === 1) obstacle('new-class');
      if (step === 2) obstacle('strap');
      if (step === 3) obstacle('mini-train');
      if (step === 4) obstacle('double-cone');
      if (step === 5) item('student-id');
      if (step === 6) item('towel');
      if (step === 8) { obstacle('club-door'); item('student-id', 61); item('towel', 79); obstacle('vault', 97); obstacle('panda', 115); }
    }
    makeObstacle(def, clearance = def.min, z = CONFIG.SPAWN_DISTANCE) {
      const rule = def.rule || 'overhead';
      const arrivalSpeed = this.mode === 'tutorial' ? CONFIG.TUTORIAL_SPEED : speedAt(this.distance + z);
      const duration = def.duration ?? (rule === 'jump' ? 0.12 : rule === 'straddle' ? 0.16 : 0.32);
      return { ...def, rule, kind: 'obstacle', clearance, height: clearance, z, width: def.width || 460,
        length: arrivalSpeed * duration, uid: ++this.serial, failed: false, completed: false };
    }
    makeItem(def, z = CONFIG.SPAWN_DISTANCE) {
      const min = def.min ?? (def.high ? 305 : 201), max = def.max ?? min;
      const height = min + Math.floor(this.random() * (max - min + 1));
      if (height > CONFIG.MAX_REACH || height < 0) throw new RangeError('Item is outside the reachable world');
      const arrivalSpeed = this.mode === 'tutorial' ? CONFIG.TUTORIAL_SPEED : speedAt(this.distance + z);
      return { ...def, name: def.name || objectNames[def.object] || 'アイテム', kind: 'item', z, height,
        high: height > CONFIG.STANDING_REACH, reachDistance: arrivalSpeed * CONFIG.ITEM_REACH_TIME,
        uid: ++this.serial, collected: false, completed: false };
    }
    futureDistance(seconds) {
      // The speed curve depends only on distance. Integrate it to place events in arrival-time slots.
      let distance = this.distance;
      const step = 1 / 60;
      for (let t = 0; t < seconds - 1e-8; t += step) distance += speedAt(distance) * Math.min(step, seconds - t);
      return distance;
    }
    intervalRange() {
      if (this.distance < 200) return [2.5, 3.5];
      if (this.distance < 500) return [1.7, 2.5];
      return [1.1, 1.8];
    }
    actionCost(def) {
      if (def.rule === 'open') return 0;
      const jump = def.rule === 'jump' || (def.min ?? 0) > CONFIG.STANDING_REACH;
      if (jump) return CONFIG.JUMP_STRAIN + CONFIG.STRAIN_RECOVERY_RATE * (2 * CONFIG.JUMP_POWER / CONFIG.GRAVITY);
      if (def.rule === 'straddle') return (0.16 + CONFIG.ACTION_BUFFER) * (CONFIG.STRADDLE_STRAIN_RATE + CONFIG.STRAIN_RECOVERY_RATE);
      if (def.rule === 'overhead' && def.min < CONFIG.PASSAGE_HEIGHT) return (0.32 + CONFIG.ACTION_BUFFER) * (CONFIG.CROUCH_STRAIN_RATES[2] + CONFIG.STRAIN_RECOVERY_RATE);
      return 0;
    }
    crouchLoad(seconds) {
      const [a, b] = CONFIG.CROUCH_STAGE_SECONDS, [low, mid, high] = CONFIG.CROUCH_STRAIN_RATES;
      return Math.min(seconds, a) * low + Math.min(Math.max(0, seconds - a), b - a) * mid + Math.max(0, seconds - b) * high;
    }
    spawn() {
      const [min, max] = this.intervalRange();
      const interval = Math.max(min + this.random() * (max - min), 2 * CONFIG.JUMP_POWER / CONFIG.GRAVITY + CONFIG.ACTION_BUFFER);
      let arrival = Math.max(this.elapsed + CONFIG.MIN_REACTION_TIME, this.planTime + interval, this.planEndTime + CONFIG.ACTION_BUFFER + 0.5);
      const baseLoad = Math.max(this.planLoad, this.strain);
      let target = this.futureDistance(arrival - this.elapsed), area = areaAt(target);
      let endurance = null;
      // An occasional visibly long low passage creates genuine 80–95% fatigue.
      // It starts after full recovery and is followed by standing-only recovery events.
      if (this.distance >= this.nextChallengeDistance && arrival >= this.recoveryUntil) {
        const ready = Math.max(arrival, this.planTime + (baseLoad + 1) / CONFIG.STRAIN_RECOVERY_RATE);
        const readyTarget = this.futureDistance(ready - this.elapsed), readyArea = areaAt(readyTarget);
        const corridors = OBSTACLES.filter(d => ['strap', 'rack-bar', 'bus-roof'].includes(d.id) && d.areas.includes(readyArea.id) && d.id !== this.lastId);
        if (corridors.length) {
          endurance = { ...corridors[Math.floor(this.random() * corridors.length)], duration: CONFIG.ENDURANCE_SECONDS, endurance: true };
          arrival = ready; target = readyTarget; area = readyArea;
        }
      }
      const forecast = Math.max(0, baseLoad - Math.max(0, arrival - this.planTime) * CONFIG.STRAIN_RECOVERY_RATE);
      const legal = def => {
        const cost = this.actionCost(def);
        return def.id !== this.lastId && def.areas.includes(area.id) && (cost === 0 || arrival >= this.recoveryUntil && forecast + cost <= CONFIG.PLANNER_STRAIN_LIMIT);
      };
      const obstacles = OBSTACLES.filter(legal), items = ITEMS.filter(d => d.max <= CONFIG.MAX_REACH && legal(d));
      let kind = this.random() < (area.id === 'park' ? 0.78 : 0.6) ? 'obstacle' : 'item';
      if (this.kindRun >= 3 && kind === this.lastKind) kind = kind === 'item' ? 'obstacle' : 'item';
      if (!obstacles.length) kind = 'item'; if (!items.length) kind = 'obstacle';
      const choices = kind === 'obstacle' ? obstacles : items;
      if (!endurance && !choices.length) { this.spawnTimer = 0.25; return; }
      const weighted = area.id === 'park' && kind === 'obstacle' ? choices.flatMap(d => ['panda', 'elephant', 'turtle', 'horse'].includes(d.id) ? [d, d, d, d] : [d]) : choices;
      const def = endurance || weighted[Math.floor(this.random() * weighted.length)], z = target - this.distance;
      if (endurance) kind = 'obstacle';
      const height = def.min === Infinity ? Infinity : def.min + Math.floor(this.random() * (def.max - def.min + 1));
      const event = kind === 'obstacle' ? this.makeObstacle(def, height, z) : this.makeItem(def, z);
      event.areaId = area.id; event.arrivalTime = arrival; event.plannedCost = this.actionCost(def);
      this.planEndTime = arrival + (endurance ? CONFIG.ENDURANCE_SECONDS : kind === 'item' ? (event.high ? 0.55 : CONFIG.ITEM_REACH_TIME) : event.length / speedAt(target));
      if (endurance) {
        event.length = this.futureDistance(arrival - this.elapsed + CONFIG.ENDURANCE_SECONDS) - target;
        const peak = this.crouchLoad(CONFIG.ENDURANCE_SECONDS + CONFIG.ENDURANCE_MARGIN);
        this.planTime = this.planEndTime; this.planLoad = peak;
        this.recoveryUntil = this.planEndTime + (peak - CONFIG.RECOVERY_TARGET) / CONFIG.STRAIN_RECOVERY_RATE + CONFIG.ACTION_BUFFER;
        this.nextChallengeDistance = target + 1000 + this.random() * 400; this.challenges++;
        event.plannedCost = peak;
      } else { this.planTime = arrival; this.planLoad = forecast + event.plannedCost; }
      this.events.push(event); this.lastId = def.id;
      this.kindRun = kind === this.lastKind ? this.kindRun + 1 : 1; this.lastKind = kind;
      // Keep the lookahead bounded when a long passage adds time to the schedule.
      this.spawnTimer = Math.max(interval, this.planTime + interval - CONFIG.MIN_REACTION_TIME - this.elapsed);
    }
    jump() {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused || this.jumpY > 0 || this.jumpVelocity > 0) return false;
      this.crouching = false; this.straddling = false; this.jumpVelocity = CONFIG.JUMP_POWER;
      this.ankleStrain += CONFIG.JUMP_STRAIN;
      if (this.mode === 'tutorial') {
        this.tutorial.actions.add('jump');
        if (this.tutorial.step === 7 && this.tutorial.recovered) this.tutorial.actions.add('fatigue-jump');
        this.checkLesson();
      }
      else this.checkStrain('jump');
      return true;
    }
    grab() {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused) return false;
      if (this.mode === 'tutorial') this.tutorial.actions.add('grab');
      const item = this.events.find(e => e.kind === 'item' && !e.collected && !e.completed);
      this.grabReservation = { remaining: CONFIG.GRAB_BUFFER_SECONDS, uid: item?.uid ?? null };
      this.effects.push({ type: 'reach', life: 0.25, high: Boolean(item?.high), height: item?.height });
      const taken = this.tryGrab(); this.checkLesson(); return taken;
    }
    tryGrab() {
      if (this.grabReservation.remaining <= 0) return false;
      const reachable = this.events.find(e => e.uid === this.grabReservation.uid && e.kind === 'item' && !e.collected && !e.completed && Math.abs(e.z) <= e.reachDistance);
      const airborne = this.jumpY > 0;
      const valid = reachable && !this.crouching && !this.straddling && (reachable.high ? airborne && this.handHeight + CONFIG.REACH_TOLERANCE >= reachable.height : !airborne && this.jumpVelocity === 0);
      if (!valid) return false;
      this.grabReservation = { remaining: 0, uid: null }; // Exactly one object per key press.
      reachable.collected = true; this.items++; const bonus = reachable.high ? 500 : 300; this.itemScore += bonus;
      this.effects.push({ type: 'collect', text: '+' + bonus, life: 1, seed: this.random(), high: reachable.high, height: reachable.height });
      if (this.mode === 'tutorial') this.lessonPass();
      return true;
    }
    lessonPass() {
      this.tutorial.passed++;
      if (this.tutorial.step !== 8 || this.tutorial.passed === 5) this.tutorial.done = true;
    }
    failLesson(message) {
      this.tutorial.feedback = message; this.tutorial.retry = 1.2; this.events = [];
    }
    checkLesson() {
      if (this.mode !== 'tutorial') return;
      const t = this.tutorial;
      if (t.step === 0 && ['crouch', 'straddle', 'jump', 'grab'].every(a => t.actions.has(a))) t.done = true;
      if (t.step === 7) {
        if (this.crouching && this.crouchStrain >= 12) t.peak = true;
        if (t.peak && !this.crouching && !this.straddling && this.jumpY === 0 && this.strain <= 6) t.recovered = true;
        if (t.recovered && t.actions.has('fatigue-jump')) t.done = true;
      }
    }
    checkStrain(cause) {
      if (this.mode !== 'playing' || this.strain < 100) return;
      const reason = cause === 'crouch' ? 'ヘルニアになりました' : cause === 'straddle' ? 'またぎのしすぎで体への負担が限界に達しました！' : cause === 'jump' ? 'ジャンプのしすぎで足首をねんざしました！' : '体への負担が限界に達しました！';
      this.gameOver(reason);
    }
    collisionReason(event) {
      if (event.rule === 'jump' && this.straddling) return 'そこまでの柔軟性はありません';
      if (event.rule === 'straddle' && (this.jumpY > 0 || this.jumpVelocity > 0)) return 'そこまでの跳躍力はありません';
      return event.name + (event.rule === 'overhead' ? 'に頭をぶつけました！' : 'にぶつかりました！');
    }
    gameOver(reason) { this.reason = reason; this.mode = 'gameover'; this.crouching = false; this.straddling = false; }
    update(dt, crouchHeld = false, straddleHeld = false) {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused) return;
      let remaining = Math.max(0, dt);
      while (remaining > 1e-8 && ['playing', 'tutorial'].includes(this.mode)) {
        const step = Math.min(remaining, CONFIG.FIXED_STEP); this.tick(step, crouchHeld, straddleHeld); remaining -= step;
      }
    }
    tick(dt, crouchHeld, straddleHeld) {
      this.elapsed += dt;
      this.speed = this.mode === 'tutorial' ? CONFIG.TUTORIAL_SPEED : speedAt(this.distance);
      this.distance += this.speed * dt;
      const oldHead = this.headHeight, oldFoot = this.jumpY;
      if (this.jumpVelocity !== 0 || this.jumpY > 0) {
        this.jumpY = Math.max(0, this.jumpY + this.jumpVelocity * dt - CONFIG.GRAVITY * dt * dt / 2);
        this.jumpVelocity -= CONFIG.GRAVITY * dt;
        if (this.jumpY < 1e-8 && this.jumpVelocity < 0) this.jumpY = 0;
        if (this.jumpY === 0 && this.jumpVelocity < 0) this.jumpVelocity = 0;
      }
      const grounded = this.jumpY === 0 && this.jumpVelocity === 0;
      this.crouching = crouchHeld && grounded;
      this.straddling = !crouchHeld && straddleHeld && grounded;
      if (this.crouching) {
        this.uprightTime = 0; this.crouchEffort += dt;
        const rate = this.crouchEffort <= CONFIG.CROUCH_STAGE_SECONDS[0] ? CONFIG.CROUCH_STRAIN_RATES[0] : this.crouchEffort <= CONFIG.CROUCH_STAGE_SECONDS[1] ? CONFIG.CROUCH_STRAIN_RATES[1] : CONFIG.CROUCH_STRAIN_RATES[2];
        this.crouchStrain += rate * dt;
      } else {
        if (grounded && !this.straddling) this.uprightTime += dt; else this.uprightTime = 0;
        this.crouchEffort = Math.max(0, this.crouchEffort - dt * 0.75);
        if (this.uprightTime >= CONFIG.CROUCH_RESET_SECONDS - 1e-8) this.crouchEffort = 0;
        if (this.straddling) this.crouchStrain += CONFIG.STRADDLE_STRAIN_RATE * dt;
      }
      // One displayed gauge; normal running recovers a total of 8%/s, not 8% per component.
      let recovery = dt * (grounded && !this.crouching && !this.straddling ? CONFIG.STRAIN_RECOVERY_RATE : CONFIG.ANKLE_RECOVERY_RATE);
      const ankleRecovery = Math.min(this.ankleStrain, recovery); this.ankleStrain -= ankleRecovery; recovery -= ankleRecovery;
      if (grounded && !this.crouching && !this.straddling) this.crouchStrain = Math.max(0, this.crouchStrain - recovery);
      if (this.mode === 'tutorial') {
        this.crouchStrain = Math.min(this.crouchStrain, 65); this.ankleStrain = Math.min(this.ankleStrain, 65);
        if (this.crouching) this.tutorial.actions.add('crouch');
        if (this.straddling) this.tutorial.actions.add('straddle');
      }
      this.checkStrain(this.crouching ? 'crouch' : this.straddling ? 'straddle' : 'idle');
      if (this.mode === 'gameover') return;
      for (const event of this.events) {
        const oldZ = event.z; event.z -= this.speed * dt;
        if (event.kind === 'item') this.tryGrab();
        if (event.kind === 'obstacle' && oldZ >= -event.length && event.z <= 0) {
          const head = oldZ <= 0 ? Math.max(oldHead, this.headHeight) : this.headHeight;
          const foot = oldZ <= 0 ? Math.min(oldFoot, this.jumpY) : this.jumpY;
          const valid = event.rule === 'open' || (event.rule === 'overhead' ? head <= event.clearance :
            event.rule === 'straddle' ? this.straddling && event.height <= CONFIG.INSEAM * 0.85 && event.width <= CONFIG.MAX_STRADDLE_WIDTH : foot >= event.height);
          if (!valid) {
            event.failed = true;
            if (this.mode === 'playing') { this.gameOver(this.collisionReason(event)); return; }
            this.failLesson('もう一度！タイミングと姿勢を確かめましょう。'); break;
          }
          if (this.mode === 'tutorial' && this.tutorial.step === 1 && (this.crouching || this.straddling || this.jumpY > 0)) event.failed = true;
        }
        if (event.kind === 'obstacle' && !event.completed && oldZ >= -event.length && event.z < -event.length) {
          event.completed = true; this.completedEvents++;
          if (this.mode === 'tutorial') {
            if (!event.failed) this.lessonPass();
            else { this.failLesson('立ったまま通過してみましょう。'); break; }
          }
        }
        if (event.kind === 'item' && !event.completed && event.z < -event.reachDistance) {
          event.completed = true; this.completedEvents++;
          if (!event.collected) {
            if (this.mode === 'playing') { this.gameOver(event.name + 'を取り逃がしました！'); return; }
            this.failLesson('取り逃がしても大丈夫。近づいたらEを押しましょう。'); break;
          }
        }
      }
      this.events = this.events.filter(e => e.z > -(e.length || e.reachDistance || 12) - 12);
      this.grabReservation.remaining = Math.max(0, this.grabReservation.remaining - dt);
      for (const fx of this.effects) fx.life -= dt;
      this.effects = this.effects.filter(fx => fx.life > 0);
      if (this.mode === 'playing') { this.spawnTimer -= dt; if (this.spawnTimer <= 0) this.spawn(); }
      else {
        if (this.tutorial.retry > 0) {
          this.tutorial.retry -= dt;
          if (this.tutorial.retry <= 0 && !this.tutorial.done) this.setupLesson();
        }
        this.checkLesson();
      }
    }
  }
  const api = { CONFIG, OBSTACLES, ITEMS, LESSONS, AREAS, SPEED_POINTS, speedAt, areaAt, GameModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Run188 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
