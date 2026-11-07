/*
 * Collapse Factor - menus, screens, attract mode and main loop
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF;
  const t = (k, v) => CF.I18n.t(k, v);
  const $ = (id) => document.getElementById(id);
  const Store = CF.Store;

  const THEME_ICON = {
    river: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M2 15c3-2 5 2 8 0s5 2 8 0 3-1 4-1" stroke="#fff" stroke-width="2" fill="none"/><path d="M2 19c3-2 5 2 8 0s5 2 8 0 3-1 4-1" stroke="#cfeaff" stroke-width="2" fill="none"/><path d="M3 10h18M6 10l3-4h6l3 4" stroke="#ffd28a" stroke-width="2" fill="none"/></svg>',
    lake: '<svg viewBox="0 0 24 24" width="24" height="24"><ellipse cx="12" cy="16" rx="10" ry="4" fill="#bfe6ff"/><path d="M2 11h20M7 11v5M17 11v5" stroke="#ffd28a" stroke-width="2"/></svg>',
    mountain: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M1 21l7-13 4 6 3-4 8 11z" fill="#e6edf5"/><path d="M8 8l2 4-2-1-2 2z" fill="#fff"/></svg>',
    tower: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M8 22V6h8v16M8 10h8M8 14h8M8 18h8M8 6l8 4M16 10l-8 4M8 14l8 4" stroke="#fff" stroke-width="1.6" fill="none"/><rect x="9" y="2" width="6" height="4" fill="#4fc3ff"/></svg>'
  };
  const LOCK = '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="5" y="10" width="14" height="11" rx="2" fill="#fff"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#fff" stroke-width="2.5" fill="none"/></svg>';

  let renderer, screen = 'title', attract = null, tutPage = 0, parentDiff = null;

  // ------------------------------------------------------------
  // i18n application
  // ------------------------------------------------------------
  function applyText() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.title = 'Collapse Factor' + (CF.I18n.getLang() === 'ja' ? ' - コラプス・ファクター' : '');
  }

  function syncSeg(id, value) { document.querySelectorAll('#' + id + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === value)); }
  function bindSeg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', () => { CF.Audio.resume(); fn(b.dataset.v); CF.Audio.sfx.toggle(); }));
  }
  function syncSettings() {
    const s = Store.settings;
    syncSeg('seg-lang', s.lang); syncSeg('seg-diff', s.difficulty);
    syncSeg('seg-bgm', s.bgm ? 'on' : 'off'); syncSeg('seg-sfx', s.sfx ? 'on' : 'off');
    syncSeg('seg-bgm2', s.bgm ? 'on' : 'off'); syncSeg('seg-sfx2', s.sfx ? 'on' : 'off');
  }

  // ------------------------------------------------------------
  // screens
  // ------------------------------------------------------------
  function show(name) {
    screen = name;
    ['title', 'levels', 'tutorial', 'parents', 'credits'].forEach((s) => $('scr-' + s).classList.toggle('hidden', s !== name));
    if (name !== 'tutorial') CF.Tutorial.close();
    if (name === 'levels') renderLevels();
    if (name === 'parents') renderParents();
    if (name === 'tutorial') { CF.Tutorial.open($('tut-canvas'), tutPage); renderTut(); }
    if (name !== 'game' && !attract) startAttract();
  }

  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function confirmBox(text, yes) {
    $('confirm-text').textContent = text;
    $('modal-confirm').classList.remove('hidden');
    $('confirm-yes').onclick = () => { $('modal-confirm').classList.add('hidden'); CF.Audio.sfx.click(); yes(); };
    $('confirm-no').onclick = () => { $('modal-confirm').classList.add('hidden'); CF.Audio.sfx.click(); };
  }

  // ---------------- level select ----------------
  function renderLevels() {
    const diff = Store.settings.difficulty;
    const prog = Store.data.progress[diff];
    $('levels-diff').textContent = t('difficulty') + ': ' + t(diff);
    const grid = $('level-grid');
    grid.innerHTML = '';
    for (let n = 1; n <= CF.LevelGen.TOTAL_LEVELS; n++) {
      const [theme] = CF.LevelGen.SCHEDULE[n - 1];
      const rec = prog.levels[n] || {};
      const locked = n > prog.unlocked;
      const el = document.createElement('div');
      el.className = `lvl t-${theme}` + (locked ? ' locked' : '');
      const stars = [0, 1, 2].map((i) => `<span class="${i < (rec.stars || 0) ? '' : 'off'}">★</span>`).join('');
      el.innerHTML = `<span class="num">${n}</span><span class="ico">${locked ? LOCK : THEME_ICON[theme]}</span>
        <span class="name">${t('theme_' + theme)}</span><span class="st">${stars}</span>`;
      el.onclick = () => {
        if (locked) { CF.Audio.sfx.error(); toast(t('locked')); return; }
        CF.Audio.sfx.click();
        startLevel(n);
      };
      el.onmouseenter = () => CF.Audio.sfx.hover();
      grid.appendChild(el);
    }
  }

  function startLevel(n) {
    stopAttract();
    ['title', 'levels', 'tutorial', 'parents', 'credits'].forEach((s) => $('scr-' + s).classList.add('hidden'));
    screen = 'game';
    CF.Game.start(n, Store.settings.difficulty);
  }

  // ---------------- tutorial ----------------
  function renderTut() {
    const n = CF.Tutorial.count;
    $('tut-heading').textContent = t('tut' + (tutPage + 1) + '_t');
    $('tut-text').textContent = t('tut' + (tutPage + 1) + '_b');
    $('tut-count').textContent = (tutPage + 1) + ' / ' + n;
    $('tut-prev').style.visibility = tutPage === 0 ? 'hidden' : 'visible';
    $('tut-next').textContent = tutPage === n - 1 ? t('close') : t('next');
    const dots = $('tut-dots');
    dots.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      if (i === tutPage) d.className = 'on';
      d.onclick = () => { tutPage = i; CF.Tutorial.setPage(i); renderTut(); CF.Audio.sfx.toggle(); };
      dots.appendChild(d);
    }
  }

  // ---------------- parents ----------------
  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (CF.I18n.getLang() === 'ja') return (h ? h + '時間' : '') + m + '分' + (h ? '' : s + '秒');
    return (h ? h + 'h ' : '') + m + 'm' + (h ? '' : ' ' + s + 's');
  }
  function fmtDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString(CF.I18n.getLang() === 'ja' ? 'ja-JP' : 'en-US') + ' ' + d.toLocaleTimeString(CF.I18n.getLang() === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function renderParents() {
    const st = Store.data.stats;
    const diff = parentDiff || Store.settings.difficulty;
    syncSeg('seg-pdiff', diff);
    const prog = Store.data.progress[diff];
    const levels = prog.levels;
    const completed = Object.values(levels).filter((l) => l.completed).length;
    const highest = Math.max(prog.unlocked, 1);
    const rate = st.attempts ? Math.round((st.successes / st.attempts) * 100) + '%' : '-';
    const stat = (k, v) => `<div class="stat"><div class="k">${t(k)}</div><div class="v">${v}</div></div>`;
    $('parent-stats').innerHTML = [
      stat('total_time', fmtTime(st.totalTime)),
      stat('today_time', fmtTime(st.days[Store.today()] || 0)),
      stat('highest', highest + ' / 20'),
      stat('completed', completed + ' / 20'),
      stat('attempts', st.attempts),
      stat('success_rate', rate),
      stat('sessions', st.sessions),
      stat('first_played', fmtDate(st.firstPlayed)),
      stat('last_played', fmtDate(st.lastPlayed))
    ].join('');
    let rows = `<tr><th>${t('col_level')}</th><th>${t('col_attempts')}</th><th>${t('col_fails')}</th><th>${t('col_stars')}</th><th>${t('col_common')}</th></tr>`;
    let any = false;
    for (let n = 1; n <= 20; n++) {
      const l = levels[n];
      if (!l) continue;
      any = true;
      const common = Object.entries(l.reasons || {}).sort((a, b) => b[1] - a[1])[0];
      rows += `<tr><td>${n} · ${t('theme_' + CF.LevelGen.SCHEDULE[n - 1][0])}</td><td>${l.attempts}</td><td>${l.fails}</td><td style="color:#ffd23c">${'★'.repeat(l.stars)}${'<span style="opacity:.25">★</span>'.repeat(3 - l.stars)}</td><td>${common ? t('r_' + common[0]) + ' (' + common[1] + ')' : '-'}</td></tr>`;
    }
    if (!any) rows += `<tr><td colspan="5">${t('none_yet')}</td></tr>`;
    $('parent-levels').innerHTML = rows;
    let fr = `<tr><th>${t('col_date')}</th><th>${t('difficulty')}</th><th>${t('col_level')}</th><th>${t('col_reason')}</th></tr>`;
    if (!st.failLog.length) fr += `<tr><td colspan="4">${t('none_yet')}</td></tr>`;
    for (const f of st.failLog.slice(0, 30)) fr += `<tr><td>${fmtDate(f.date)}</td><td>${t(f.diff)}</td><td>${f.level}</td><td>${t('r_' + f.reason)}</td></tr>`;
    $('parent-fails').innerHTML = fr;
  }

  // ------------------------------------------------------------
  // attract mode: a verified design being tested behind the title
  // ------------------------------------------------------------
  function startAttract() {
    const pool = [2, 3, 5, 7, 9, 10, 13, 14, 15, 17, 18, 20];
    const n = pool[Math.floor(Math.random() * pool.length)];
    const level = CF.LevelGen.generate(n, 'medium');
    const sim = new CF.Physics.Sim(level, level.reference);
    attract = { level, sim, t: 0 };
    renderer.setMargins({ top: 40, bottom: 40, left: 0, right: 0 });
    renderer.setLevel(level);
  }
  function stopAttract() { attract = null; CF.Audio.stopLoops(); }
  function updateAttract(dt) {
    if (!attract) return;
    const a = attract;
    a.t += dt;
    a.acc = (a.acc || 0) + dt;
    let n = 0;
    while (a.acc >= 1 / 60 && n < 6) { a.sim.step(1 / 60); a.acc -= 1 / 60; n++; }
    if (n >= 6) a.acc = 0;
    for (const ev of a.sim.events) {
      if (ev.type === 'break') renderer.spawnBreak(ev);
      if (ev.type === 'splash') renderer.spawnSplash(ev.x, ev.y, ev.big);
    }
    a.sim.events.length = 0;
    renderer.frame({ dt, mode: 'test', nodes: a.sim.nodes, beams: a.sim.beams, wind: a.sim.windNow, windDir: a.sim.wind.dir, vehicles: a.sim.vehicles, tank: a.sim.tank, stress: false, usedAnchors: new Set(a.sim.nodes.filter((n) => n.fixed).map((n) => n.x0 + ',' + n.y0)) });
    if ((a.sim.status !== 'running' && a.sim.t > a.sim.doneAt + 2) || a.t > 40) startAttract();
  }

  // ------------------------------------------------------------
  // main loop + play-time tracking
  // ------------------------------------------------------------
  let last = performance.now(), timeAcc = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) {
      timeAcc += dt;
      if (timeAcc >= 10) { Store.addTime(timeAcc); timeAcc = 0; Store.save(); }
    }
    if (screen === 'game') CF.Game.update(dt);
    else updateAttract(dt);
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------
  // boot
  // ------------------------------------------------------------
  function boot() {
    Store.load();
    Store.startSession();
    const s = Store.settings;
    CF.I18n.setLang(s.lang);
    applyText();
    syncSettings();
    CF.Audio.init();
    CF.Audio.setMusic(s.bgm);
    CF.Audio.setSfx(s.sfx);

    renderer = new CF.Renderer($('world'));
    G.addEventListener('resize', () => renderer.resize());

    CF.Game.init(renderer, {
      confirm: confirmBox, toast,
      toMenu: () => show('title'),
      toLevels: () => show('levels'),
      showLoading: (on) => $('loading').classList.toggle('hidden', !on)
    });

    bindSeg('seg-lang', (v) => { s.lang = v; CF.I18n.setLang(v); applyText(); syncSettings(); Store.save(); if (screen === 'tutorial') renderTut(); if (screen === 'parents') renderParents(); });
    bindSeg('seg-diff', (v) => { s.difficulty = v; syncSettings(); Store.save(); });
    const setBgm = (v) => { s.bgm = v === 'on'; CF.Audio.setMusic(s.bgm); syncSettings(); Store.save(); };
    const setSfx = (v) => { s.sfx = v === 'on'; CF.Audio.setSfx(s.sfx); syncSettings(); Store.save(); };
    bindSeg('seg-bgm', setBgm); bindSeg('seg-bgm2', setBgm);
    bindSeg('seg-sfx', setSfx); bindSeg('seg-sfx2', setSfx);
    bindSeg('seg-pdiff', (v) => { parentDiff = v; renderParents(); });

    const click = (id, fn) => $(id).addEventListener('click', () => { CF.Audio.resume(); CF.Audio.sfx.click(); fn(); });
    click('btn-play', () => show('levels'));
    click('btn-tutorial', () => { tutPage = 0; show('tutorial'); });
    click('btn-parents', () => { parentDiff = null; show('parents'); });
    click('btn-credits', () => show('credits'));
    click('btn-quit', () => { Store.addTime(timeAcc); timeAcc = 0; Store.save(); if (G.cfNative) G.cfNative.quit(); else G.close(); });
    click('btn-fullscreen', () => { if (G.cfNative) G.cfNative.toggleFullscreen(); else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); });
    click('tut-prev', () => { if (tutPage > 0) { tutPage--; CF.Tutorial.setPage(tutPage); renderTut(); } });
    click('tut-next', () => { if (tutPage < CF.Tutorial.count - 1) { tutPage++; CF.Tutorial.setPage(tutPage); renderTut(); } else show('title'); });
    click('btn-reset', () => confirmBox(t('confirm_reset'), () => { Store.reset(); renderParents(); }));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { CF.Audio.sfx.click(); show('title'); }));
    document.querySelectorAll('[data-link]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const url = a.dataset.link;
      if (G.cfNative) G.cfNative.openExternal(url); else G.open(url, '_blank');
    }));
    document.querySelectorAll('.menu .btn').forEach((b) => b.addEventListener('mouseenter', () => CF.Audio.sfx.hover()));
    G.addEventListener('keydown', (e) => {
      if (e.key === 'F11') { e.preventDefault(); if (G.cfNative) G.cfNative.toggleFullscreen(); }
      if (e.key === 'Escape' && screen !== 'game' && screen !== 'title') show('title');
    });
    // browsers need a gesture before audio can start
    const kick = () => { CF.Audio.resume(); if (s.bgm) CF.Audio.startMusic(); };
    G.addEventListener('pointerdown', kick, { once: true });
    G.addEventListener('keydown', kick, { once: true });
    kick();
    G.addEventListener('beforeunload', () => { Store.addTime(timeAcc); Store.save(); });

    show('title');
    requestAnimationFrame(loop);
  }

  CF.UI = { startLevel, show };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot); else G.addEventListener('load', boot);
})(typeof window !== 'undefined' ? window : globalThis);
