/* Optional online ranking. Gameplay never depends on Firebase or this network. */
(function (root) {
  'use strict';
  const SDK_VERSION = '13.0.0', MAX_DISTANCE = 10000000, SEND_INTERVAL = 60000;
  function understanding(distance) { return Math.min(100, Math.floor(Math.max(0, Number(distance) || 0) / 10)); }
  function nickname(value) {
    const name = String(value).normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if ([...name].length < 1 || [...name].length > 16 || !/^[\p{L}\p{N}\p{M} _・ー.\-]+$/u.test(name) || /死ね|殺す|しね|\b(fuck|shit)\b/i.test(name)) {
      throw new Error('名前は1〜16文字の文字・数字・空白・「_・ー.-」で入力してください。攻撃的な言葉は使えません。');
    }
    return name;
  }
  function configured(c) { return Boolean(c?.firebase?.apiKey && c.firebase.projectId && c.firebase.appId && /^[a-zA-Z0-9_-]{1,40}$/.test(c.season || '')); }
  async function firebaseAdapter(config) {
    const base = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
    const [appSDK, authSDK, dbSDK] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    const app = appSDK.initializeApp(config.firebase, '188cm-ranking');
    if (config.appCheckSiteKey) {
      const sdk = await import(base + 'firebase-app-check.js');
      sdk.initializeAppCheck(app, { provider: new sdk.ReCaptchaV3Provider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = authSDK.getAuth(app);
    try { await authSDK.setPersistence(auth, authSDK.browserLocalPersistence); }
    catch { await authSDK.setPersistence(auth, authSDK.inMemoryPersistence); }
    await auth.authStateReady();
    const user = auth.currentUser || (await authSDK.signInAnonymously(auth)).user;
    const db = dbSDK.getFirestore(app), collection = dbSDK.collection(db, 'seasons', config.season, 'players');
    const own = dbSDK.doc(collection, user.uid);
    return {
      async best() { const doc = await dbSDK.getDoc(own); return doc.exists() ? doc.data().distance : 0; },
      async top() {
        const snap = await dbSDK.getDocs(dbSDK.query(collection, dbSDK.orderBy('distance', 'desc'), dbSDK.limit(10)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      },
      async save(name, distance) {
        return dbSDK.runTransaction(db, async transaction => {
          const doc = await transaction.get(own), previous = doc.exists() ? doc.data() : null;
          const best = Math.max(previous?.distance || 0, distance);
          if (previous?.nickname === name && previous.distance >= distance) return { distance: best, changed: false };
          // Rules independently require owner ID, integer distance, non-decreasing best and a 60s interval.
          transaction.set(own, { nickname: name, distance: best, updatedAt: dbSDK.serverTimestamp() });
          return { distance: best, changed: true };
        });
      }
    };
  }
  function timeout(promise, ms = 12000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('通信がタイムアウトしました。')), ms); })]).finally(() => clearTimeout(timer));
  }
  class Ranking {
    constructor(config, storage, factory = firebaseAdapter, now = Date.now) {
      this.config = config || {}; this.storage = storage; this.factory = factory; this.now = now;
      this.name = storage.get('nickname', ''); this.best = Math.max(0, Number(storage.get('distanceBest:' + this.season, '0')) || 0);
      this.pending = this.best > 0 ? this.best : null; this.adapter = null; this.connecting = null; this.busy = false; this.lastSend = -Infinity;
    }
    get season() { return this.config.season || 'season-1'; }
    get enabled() { return configured(this.config); }
    setName(value) { this.name = nickname(value); this.storage.set('nickname', this.name); return this.name; }
    async connect() {
      if (!this.enabled) throw new Error('オンラインランキングは未設定です。この端末の記録で遊べます。');
      if (this.adapter) return this.adapter;
      if (!this.connecting) this.connecting = this.factory(this.config).then(a => this.adapter = a).catch(e => { this.connecting = null; throw e; });
      return timeout(this.connecting);
    }
    record(distance, elapsed) {
      const value = Math.floor(distance);
      if (!Number.isFinite(value) || value < 0 || value > MAX_DISTANCE || !Number.isFinite(elapsed) || elapsed < 0 || distance > elapsed * 56 + 2) return false;
      this.best = Math.max(this.best, value); this.storage.set('distanceBest:' + this.season, this.best);
      this.pending = Math.max(this.pending || 0, value); return true;
    }
    async send() {
      if (!this.name) throw new Error('ニックネームを設定するとオンラインに送信できます。');
      if (this.pending === null) return { distance: this.best, changed: false };
      if (this.busy) throw new Error('記録を送信中です。');
      if (this.now() - this.lastSend < SEND_INTERVAL) throw new Error('次の送信まで少しお待ちください（送信間隔は60秒）。');
      this.busy = true;
      const sending = this.pending, sendingName = this.name;
      // Attempts are throttled too, including errors/timeouts. Never silently retry a write.
      this.lastSend = this.now();
      try {
        const adapter = await this.connect();
        const result = await timeout(adapter.save(sendingName, sending));
        this.best = Math.max(this.best, result.distance); this.storage.set('distanceBest:' + this.season, this.best);
        if (this.pending === sending && this.name === sendingName) this.pending = null;
        return result;
      } finally { this.busy = false; }
    }
    async top() {
      const adapter = await this.connect();
      const [rows, best] = await timeout(Promise.all([adapter.top(), adapter.best()]));
      this.best = Math.max(this.best, best); this.storage.set('distanceBest:' + this.season, this.best); return rows;
    }
  }
  const api = { understanding, nickname, configured, Ranking, MAX_DISTANCE, SEND_INTERVAL, SDK_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Run188Ranking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
