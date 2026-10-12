/* 188cm RUN — original game logic. Distances are metres, heights are centimetres. */
(function (root) {
  'use strict';
  // Adjust these values to tune the game. Simulation uses seconds, never frame counts.
  const CONFIG = Object.freeze({
    INITIAL_SPEED: 16, SPEED_ACCELERATION: 0.009, MAX_SPEED: 30,
    MIN_SPAWN_INTERVAL: 2.05, MAX_SPAWN_INTERVAL: 3.05,
    JUMP_POWER: 265, GRAVITY: 620,
    CROUCH_STRAIN_RATE: 15, STRAIN_RECOVERY_RATE: 7,
    JUMP_STRAIN: 16, ANKLE_RECOVERY_RATE: 1.5,
    PLAYER_HEIGHT: 188, CROUCH_HEIGHT: 122,
    SPAWN_DISTANCE: 100, TUTORIAL_SPEED: 9,
    ITEM_REACH_TIME: 0.24, HIGH_ITEM_MIN_JUMP: 25,
    FIXED_STEP: 1 / 120
  });
  const OBSTACLES = [
    { id: 'train', name: '通勤電車', style: 'train', low: false },
    { id: 'subway', name: '地下通路', style: 'concrete', low: false },
    { id: 'loading', name: '商業施設の搬入口', style: 'loading', low: false },
    { id: 'old', name: '古い建物の連絡通路', style: 'brick', low: false },
    { id: 'parking', name: '駐車場の歩行者通路', style: 'parking', low: false },
    { id: 'low-train', name: '電車の入口', style: 'train', low: true },
    { id: 'warehouse', name: '倉庫の梁', style: 'warehouse', low: true },
    { id: 'low-subway', name: '地下通路の梁', style: 'concrete', low: true },
    { id: 'gym', name: '体育館の器具庫', style: 'gym', low: true },
    { id: 'stairs', name: '階段下の通路', style: 'stairs', low: true },
    { id: 'shop', name: '店舗の搬入口', style: 'loading', low: true },
    { id: 'service', name: '設備通路', style: 'service', low: true }
  ];
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
  const LESSONS = [
    ['まずは体を動かそう', '↓ または Shift を押してしゃがむ。Space でジャンプ。E で手を伸ばす。3つの操作を試してみましょう。'],
    ['頭上の余裕を見よう', 'この入口は頭の上に少し余裕があります。何も押さず、立ったまま通過してみましょう。'],
    ['低い入口を通ろう', '入口の上端が頭に重なっています。↓ または Shift を、入口を抜けるまで押し続けましょう。'],
    ['体への負荷を知ろう', 'しゃがみ続けてゲージを12%以上にし、キーを離して6%以下まで回復させましょう。'],
    ['手を伸ばして取ろう', '飲み物が手元に近づいたら、立ったまま E を押しましょう。取り逃がしても再挑戦できます。'],
    ['高い物に届こう', 'タオルが近づいたら Space でジャンプし、空中で E を押しましょう。ジャンプだけでは取れません。'],
    ['ジャンプにも負担がある', 'Space で3回ジャンプしてゲージの変化を見ましょう。足首の負荷はゆっくり回復します。']
  ];
  class GameModel {
    constructor(random = Math.random) { this.random = random; this.mode = 'title'; this.reset(); }
    reset() {
      this.distance = 0; this.itemScore = 0; this.items = 0;
      this.crouchStrain = 0; this.ankleStrain = 0;
      this.jumpY = 0; this.jumpVelocity = 0; this.crouching = false;
      this.speed = CONFIG.INITIAL_SPEED; this.events = []; this.effects = [];
      this.spawnTimer = 0.6; this.lastId = ''; this.kindRun = 0; this.lastKind = '';
      this.elapsed = 0; this.reason = ''; this.paused = false; this.serial = 0;
      this.tutorial = { step: 0, done: false, actions: new Set(), peak: false, jumps: 0, retry: 0, feedback: '' };
    }
    get strain() { return Math.min(100, this.crouchStrain + this.ankleStrain); }
    get score() { return Math.floor(this.distance * 10) + this.itemScore; }
    get headHeight() { return (this.crouching && this.jumpY === 0 ? CONFIG.CROUCH_HEIGHT : CONFIG.PLAYER_HEIGHT) + this.jumpY; }
    start() { this.reset(); this.mode = 'playing'; }
    startTutorial() { this.reset(); this.mode = 'tutorial'; this.speed = CONFIG.TUTORIAL_SPEED; this.setupLesson(); }
    title() { this.reset(); this.mode = 'title'; }
    setupLesson() {
      this.events = []; this.jumpY = 0; this.jumpVelocity = 0; this.crouching = false;
      this.crouchStrain = 0; this.ankleStrain = 0;
      Object.assign(this.tutorial, { done: false, actions: new Set(), peak: false, jumps: 0, retry: 0, feedback: '' });
      this.spawnLessonEvent();
    }
    nextLesson() {
      if (!this.tutorial.done) return;
      if (this.tutorial.step === 6) { this.start(); return; }
      this.tutorial.step++; this.setupLesson();
    }
    spawnLessonEvent() {
      const step = this.tutorial.step;
      if (step === 1) this.events.push(this.makeObstacle(OBSTACLES[0], 192, 43));
      if (step === 2) this.events.push(this.makeObstacle(OBSTACLES[5], 184, 43));
      if (step === 4) this.events.push(this.makeItem(ITEMS[0], 43));
      if (step === 5) this.events.push(this.makeItem(ITEMS[6], 43));
    }
    makeObstacle(def, clearance, z = CONFIG.SPAWN_DISTANCE) {
      return { ...def, kind: 'obstacle', clearance, z, length: Math.max(5, this.speed * 0.36), uid: ++this.serial, failed: false };
    }
    makeItem(def, z = CONFIG.SPAWN_DISTANCE) {
      return { ...def, kind: 'item', z, height: def.high ? 246 : 201, uid: ++this.serial, collected: false };
    }
    spawn() {
      // Limit streaks, exclude the previous exact event, and keep jump/door windows separated.
      let kind = this.random() < 0.58 ? 'obstacle' : 'item';
      if (this.kindRun >= 3 && kind === this.lastKind) kind = kind === 'item' ? 'obstacle' : 'item';
      const choices = (kind === 'obstacle' ? OBSTACLES : ITEMS).filter(x => x.id !== this.lastId);
      const def = choices[Math.floor(this.random() * choices.length)];
      const event = kind === 'obstacle' ? this.makeObstacle(def, (def.low ? 182 : 189) + Math.floor(this.random() * 6)) : this.makeItem(def);
      this.events.push(event); this.lastId = def.id;
      this.kindRun = kind === this.lastKind ? this.kindRun + 1 : 1; this.lastKind = kind;
      this.spawnTimer += CONFIG.MIN_SPAWN_INTERVAL + this.random() * (CONFIG.MAX_SPAWN_INTERVAL - CONFIG.MIN_SPAWN_INTERVAL);
    }
    jump() {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused || this.jumpY > 0 || this.jumpVelocity > 0) return false;
      this.crouching = false; this.jumpVelocity = CONFIG.JUMP_POWER;
      this.ankleStrain += CONFIG.JUMP_STRAIN;
      if (this.mode === 'tutorial') { this.tutorial.actions.add('jump'); this.tutorial.jumps++; this.checkLesson(); }
      else this.checkStrain('jump');
      return true;
    }
    grab() {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused) return false;
      if (this.mode === 'tutorial') this.tutorial.actions.add('grab');
      const reachable = this.events.find(e => e.kind === 'item' && !e.collected && Math.abs(e.z) <= this.speed * CONFIG.ITEM_REACH_TIME);
      const airborne = this.jumpY >= CONFIG.HIGH_ITEM_MIN_JUMP;
      const valid = reachable && (reachable.high ? airborne : this.jumpY === 0 && this.jumpVelocity === 0 && !this.crouching);
      if (valid) {
        reachable.collected = true; this.items++; const bonus = reachable.high ? 500 : 300; this.itemScore += bonus;
        this.effects.push({ type: 'collect', text: '+' + bonus, life: 1, seed: this.random(), high: reachable.high });
        if (this.mode === 'tutorial' && [4, 5].includes(this.tutorial.step)) this.tutorial.done = true;
      } else this.effects.push({ type: 'reach', life: 0.25, high: Boolean(reachable?.high) });
      this.checkLesson(); return Boolean(valid);
    }
    checkLesson() {
      if (this.mode !== 'tutorial') return;
      const t = this.tutorial;
      if (t.step === 0 && ['crouch', 'jump', 'grab'].every(a => t.actions.has(a))) t.done = true;
      if (t.step === 3) {
        if (this.strain >= 12) t.peak = true;
        if (t.peak && !this.crouching && this.strain <= 6) t.done = true;
      }
      if (t.step === 6 && t.jumps >= 3) t.done = true;
    }
    checkStrain(cause) {
      if (this.mode !== 'playing' || this.strain < 100) return;
      this.gameOver(cause === 'jump' || this.ankleStrain > this.crouchStrain ? 'ジャンプのしすぎで足首をねんざしました！' : '体への負担が限界に達しました！');
    }
    gameOver(reason) { this.reason = reason; this.mode = 'gameover'; this.crouching = false; }
    update(dt, crouchHeld = false) {
      if (!['playing', 'tutorial'].includes(this.mode) || this.paused) return;
      // Consume all elapsed time in bounded physics steps. Swept door checks prevent tunnelling.
      let remaining = Math.max(0, dt);
      while (remaining > 1e-8 && ['playing', 'tutorial'].includes(this.mode)) {
        const step = Math.min(remaining, CONFIG.FIXED_STEP); this.tick(step, crouchHeld); remaining -= step;
      }
    }
    tick(dt, held) {
      this.elapsed += dt;
      this.speed = this.mode === 'tutorial' ? CONFIG.TUTORIAL_SPEED : Math.min(CONFIG.MAX_SPEED, CONFIG.INITIAL_SPEED + this.distance * CONFIG.SPEED_ACCELERATION);
      this.distance += this.speed * dt;
      const oldHead = this.headHeight;
      if (this.jumpVelocity !== 0 || this.jumpY > 0) {
        this.jumpY = Math.max(0, this.jumpY + this.jumpVelocity * dt - CONFIG.GRAVITY * dt * dt / 2);
        this.jumpVelocity -= CONFIG.GRAVITY * dt;
        if (this.jumpY === 0 && this.jumpVelocity < 0) this.jumpVelocity = 0;
      }
      this.crouching = held && this.jumpY === 0 && this.jumpVelocity === 0;
      if (this.crouching) {
        this.crouchStrain += CONFIG.CROUCH_STRAIN_RATE * dt;
        if (this.mode === 'tutorial') this.tutorial.actions.add('crouch');
      } else if (this.jumpY === 0) this.crouchStrain = Math.max(0, this.crouchStrain - CONFIG.STRAIN_RECOVERY_RATE * dt);
      this.ankleStrain = Math.max(0, this.ankleStrain - CONFIG.ANKLE_RECOVERY_RATE * dt);
      if (this.mode === 'tutorial') { this.crouchStrain = Math.min(this.crouchStrain, 65); this.ankleStrain = Math.min(this.ankleStrain, 65); }
      this.checkStrain(this.crouching ? 'crouch' : 'jump');
      if (this.mode === 'gameover') return;
      for (const event of this.events) {
        const oldZ = event.z; event.z -= this.speed * dt;
        if (event.kind === 'obstacle' && oldZ >= -event.length && event.z <= 0) {
          // Only use the previous head when the door was already occupied. A timely crouch at entry counts.
          const head = oldZ <= 0 ? Math.max(oldHead, this.headHeight) : this.headHeight;
          if (head > event.clearance) {
            event.failed = true;
            if (this.mode === 'playing') { this.gameOver('入口に頭をぶつけました！'); return; }
            this.tutorial.feedback = 'もう一度！入口を抜けるまで姿勢を保ちましょう。';
          }
          if (this.mode === 'tutorial' && this.tutorial.step === 1 && (this.crouching || this.jumpY > 0)) event.failed = true;
        }
        if (event.kind === 'obstacle' && oldZ >= -event.length && event.z < -event.length && this.mode === 'tutorial') {
          if (!event.failed) this.tutorial.done = true;
          else this.tutorial.retry = 1.2;
        }
        if (event.kind === 'item' && oldZ >= -this.speed * CONFIG.ITEM_REACH_TIME && event.z < -this.speed * CONFIG.ITEM_REACH_TIME && this.mode === 'tutorial' && !event.collected) {
          this.tutorial.feedback = '取り逃がしても大丈夫。次のアイテムで試しましょう。'; this.tutorial.retry = 1.2;
        }
      }
      this.events = this.events.filter(e => e.z > -(e.length || 12) - 12);
      for (const fx of this.effects) fx.life -= dt;
      this.effects = this.effects.filter(fx => fx.life > 0);
      if (this.mode === 'playing') { this.spawnTimer -= dt; if (this.spawnTimer <= 0) this.spawn(); }
      else {
        if (this.tutorial.retry > 0) {
          this.tutorial.retry -= dt;
          if (this.tutorial.retry <= 0 && !this.tutorial.done) { this.events = []; this.spawnLessonEvent(); }
        }
        this.checkLesson();
      }
    }
  }
  const api = { CONFIG, OBSTACLES, ITEMS, LESSONS, GameModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Run188 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
