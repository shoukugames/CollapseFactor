/*
 * Collapse Factor - saved settings, progress and parent statistics
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};
  const KEY = 'collapsefactor.save.v1';

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fresh() {
    const prog = () => ({ unlocked: 1, levels: {} });
    return {
      version: 1,
      settings: { lang: (navigator.language || 'en').startsWith('ja') ? 'ja' : 'en', bgm: true, sfx: true, difficulty: 'medium' },
      progress: { easy: prog(), medium: prog(), hard: prog() },
      stats: { totalTime: 0, days: {}, sessions: 0, attempts: 0, successes: 0, firstPlayed: null, lastPlayed: null, failLog: [] }
    };
  }

  let data = fresh();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const f = fresh();
        data = Object.assign(f, d);
        data.settings = Object.assign(f.settings, d.settings || {});
        data.stats = Object.assign(f.stats, d.stats || {});
        for (const k of ['easy', 'medium', 'hard']) data.progress[k] = Object.assign({ unlocked: 1, levels: {} }, (d.progress || {})[k] || {});
      }
    } catch (e) { data = fresh(); }
    return data;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ } }

  function startSession() {
    data.stats.sessions++;
    const now = new Date().toISOString();
    if (!data.stats.firstPlayed) data.stats.firstPlayed = now;
    data.stats.lastPlayed = now;
    save();
  }
  function addTime(sec) {
    data.stats.totalTime += sec;
    const d = today();
    data.stats.days[d] = (data.stats.days[d] || 0) + sec;
    data.stats.lastPlayed = new Date().toISOString();
  }

  function levelRec(diff, n) {
    const p = data.progress[diff];
    if (!p.levels[n]) p.levels[n] = { attempts: 0, fails: 0, stars: 0, completed: false, reasons: {} };
    return p.levels[n];
  }

  function recordResult(diff, n, success, stars, reason) {
    const rec = levelRec(diff, n);
    rec.attempts++;
    data.stats.attempts++;
    if (success) {
      data.stats.successes++;
      rec.completed = true;
      rec.stars = Math.max(rec.stars, stars);
      const p = data.progress[diff];
      p.unlocked = Math.max(p.unlocked, Math.min(CF.LevelGen.TOTAL_LEVELS, n + 1));
      if (n === CF.LevelGen.TOTAL_LEVELS) p.finished = true;
    } else {
      rec.fails++;
      rec.reasons[reason] = (rec.reasons[reason] || 0) + 1;
      data.stats.failLog.unshift({ date: new Date().toISOString(), diff, level: n, reason });
      if (data.stats.failLog.length > 60) data.stats.failLog.length = 60;
    }
    save();
  }

  function reset() {
    const s = data.settings;
    data = fresh();
    data.settings = s;
    save();
  }

  CF.Store = {
    load, save, startSession, addTime, recordResult, levelRec, reset, today,
    get data() { return data; },
    get settings() { return data.settings; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
