/*
 * Collapse Factor - procedural level generator
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 *
 * Every play generates a fresh level. To guarantee the level can be beaten
 * with the material the player receives, the generator designs its own
 * reference structure and runs it through the real physics simulation.
 * If the reference fails, the load is eased until it passes. The player's
 * material allowance is then based on that verified design.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};
  const P = CF.Physics;
  const { PARTS, RNG } = P;

  const TOTAL_LEVELS = 20;

  // theme / test-type schedule for the 20 levels
  const SCHEDULE = [
    ['river', 'weight'], ['river', 'weight'], ['river', 'weight'], ['tower', 'weight'],
    ['lake', 'weight'], ['mountain', 'wind'], ['river', 'both'], ['tower', 'both'],
    ['lake', 'both'], ['mountain', 'weight'], ['river', 'wind'], ['tower', 'both'],
    ['lake', 'both'], ['mountain', 'both'], ['river', 'both'], ['tower', 'both'],
    ['lake', 'both'], ['mountain', 'both'], ['tower', 'both'], ['mountain', 'both']
  ];

  const VEHICLE_TIERS = [['car'], ['suv', 'pickup'], ['van'], ['boxtruck'], ['bus'], ['dump'], ['semi']];

  const DIFF = {
    easy:   { mat: 1.9, tier: -1, wind: 0.75, extraVeh: 0, timeOfDay: null },
    medium: { mat: 1.5, tier: 0, wind: 1.0, extraVeh: 0 },
    hard:   { mat: 1.22, tier: 1, wind: 1.18, extraVeh: 1 }
  };

  function allowedParts(n, theme) {
    const parts = ['wood_road', 'wood_beam'];
    if (n >= 3) parts.push('steel_road', 'steel_beam');
    if (n >= 5) parts.push('concrete_road', 'concrete_beam');
    if (n >= 7) parts.push('steel_cable');
    if (theme === 'tower') return parts.filter((p) => PARTS[p].kind !== 'road');
    return parts;
  }

  // ------------------------------------------------------------------
  // terrain builders
  // ------------------------------------------------------------------
  function buildBridgeTerrain(r, theme, n, p) {
    let span, hL, hR, slope, bed, waterY, faceAnchorMinY;
    if (theme === 'river') {
      span = Math.round(10 + p * 19 + r.range(-1, 2));
      hL = r.int(3, 6); hR = r.int(3, 6); slope = 2; bed = -4; waterY = 0; faceAnchorMinY = 1;
    } else if (theme === 'lake') {
      span = Math.round(16 + p * 24 + r.range(-1, 2));
      hL = r.int(2, 3); hR = r.int(2, 3); slope = 1; bed = -6; waterY = 0; faceAnchorMinY = 1;
    } else { // mountain
      span = Math.round(14 + p * 26 + r.range(-1, 2));
      hL = r.int(10, 16); hR = Math.max(8, Math.min(20, hL + r.int(-6, 6))); slope = 3; bed = -12; waterY = -11; faceAnchorMinY = bed + 6;
    }
    const eL = 0, eR = span;
    const sL = r.pick([-1, 0, 0, 1]), sR = r.pick([-1, 0, 0, 1]);
    const terrain = [];
    const anchors = [];
    // left bank
    terrain.push({ x: eL - 80, y: hL + 2 * sL });
    terrain.push({ x: eL - 4, y: hL + 2 * sL });
    terrain.push({ x: eL - 2, y: hL + sL });
    terrain.push({ x: eL, y: hL });
    anchors.push({ x: eL - 4, y: hL + 2 * sL, road: true }, { x: eL - 2, y: hL + sL, road: true }, { x: eL, y: hL, road: true });
    // left face
    let k = 1;
    while (hL - slope * k > bed) {
      const y = hL - slope * k;
      if (y >= faceAnchorMinY && (k % (slope === 1 ? 2 : 1) === 0)) anchors.push({ x: eL + k, y, road: false });
      k++;
    }
    const leftFoot = eL + (hL - bed) / slope;
    terrain.push({ x: leftFoot, y: bed });
    // riverbed / islands
    const rightFoot = eR - (hR - bed) / slope;
    const islands = [];
    if (theme === 'lake' && span > 21) {
      const count = span > 34 ? 2 : 1;
      for (let i = 1; i <= count; i++) {
        const cx = Math.round(eL + (span * i) / (count + 1) + r.int(-1, 1));
        islands.push({ cx, top: r.int(1, 2), half: 2 });
      }
    } else if (theme === 'mountain' && span > 29) {
      const cx = Math.round((eL + eR) / 2 + r.int(-2, 2));
      islands.push({ cx, top: Math.min(hL, hR) - r.int(5, 8), half: 2 });
    } else if (theme === 'river' && span > 24) {
      const cx = Math.round((eL + eR) / 2 + r.int(-2, 2));
      islands.push({ cx, top: 1, half: 2 });
    }
    // riverbed with gentle bumps
    let x = leftFoot + 2;
    const bedPts = [];
    while (x < rightFoot - 1) { bedPts.push({ x, y: bed + r.range(-0.8, 0.6) }); x += r.range(2, 4); }
    for (const isl of islands) {
      for (let i = bedPts.length - 1; i >= 0; i--) if (Math.abs(bedPts[i].x - isl.cx) < isl.half + 2.5) bedPts.splice(i, 1);
      const steep = theme === 'mountain' ? 0.6 : 2;
      bedPts.push({ x: isl.cx - isl.half - steep, y: bed + 0.3 });
      bedPts.push({ x: isl.cx - isl.half, y: isl.top - 0.4 });
      bedPts.push({ x: isl.cx - 1, y: isl.top });
      bedPts.push({ x: isl.cx + 1, y: isl.top });
      bedPts.push({ x: isl.cx + isl.half, y: isl.top - 0.4 });
      bedPts.push({ x: isl.cx + isl.half + steep, y: bed + 0.3 });
      anchors.push({ x: isl.cx - 1, y: isl.top, road: false }, { x: isl.cx + 1, y: isl.top, road: false });
    }
    bedPts.sort((a, b) => a.x - b.x);
    for (const b of bedPts) terrain.push(b);
    terrain.push({ x: rightFoot, y: bed });
    // right face
    const rf = [];
    k = 1;
    while (hR - slope * k > bed) {
      const y = hR - slope * k;
      if (y >= faceAnchorMinY && (k % (slope === 1 ? 2 : 1) === 0)) anchors.push({ x: eR - k, y, road: false });
      k++;
    }
    terrain.push({ x: eR, y: hR });
    terrain.push({ x: eR + 2, y: hR + sR });
    terrain.push({ x: eR + 4, y: hR + 2 * sR });
    terrain.push({ x: eR + 80, y: hR + 2 * sR });
    anchors.push({ x: eR, y: hR, road: true }, { x: eR + 2, y: hR + sR, road: true }, { x: eR + 4, y: hR + 2 * sR, road: true });
    terrain.sort((a, b) => a.x - b.x);
    const water = { y: waterY, x0: eL, x1: eR };
    const top = Math.max(hL + 2 * Math.abs(sL), hR + 2 * Math.abs(sR));
    return {
      terrain, anchors, water, span, hL, hR, eL, eR, bed, islands,
      build: { x0: eL - 6, x1: eR + 6, y0: bed + 1, y1: top + 12 },
      view: { x0: eL - 10, x1: eR + 10, y0: Math.min(bed - 1, waterY - 3), y1: top + 14 }
    };
  }

  function buildTowerTerrain(r, n, p, diff) {
    const target = Math.round(8 + p * 16 + r.range(0, 2));
    const halfW = r.pick(diff === 'easy' ? [4, 5] : diff === 'hard' ? [3, 4] : [3, 4, 5]);
    const terrain = [
      { x: -90, y: r.range(1, 3) }, { x: -30, y: 0.4 }, { x: -halfW - 3, y: 0 },
      { x: halfW + 3, y: 0 }, { x: 30, y: 0.5 }, { x: 90, y: r.range(1, 3) }
    ];
    const anchors = [];
    for (let x = -halfW; x <= halfW; x += 2) anchors.push({ x, y: 0, road: false });
    if (anchors[anchors.length - 1].x !== halfW) anchors.push({ x: halfW, y: 0, road: false });
    const top = target + 5;
    return {
      terrain, anchors, water: null, target, halfW,
      build: { x0: -halfW - 6, x1: halfW + 6, y0: 0, y1: top },
      view: { x0: -Math.max(14, top * 0.75), x1: Math.max(14, top * 0.75), y0: -3, y1: top + 2 }
    };
  }

  // ------------------------------------------------------------------
  // reference designs (used to prove the level is solvable)
  // ------------------------------------------------------------------
  function DesignBuilder(level) {
    const nodes = [], beams = [];
    const key = (x, y) => x.toFixed(3) + ',' + y.toFixed(3);
    const map = new Map();
    const anchorSet = new Set(level.anchors.map((a) => key(a.x, a.y)));
    return {
      node(x, y) {
        const k = key(x, y);
        if (map.has(k)) return map.get(k);
        const i = nodes.length;
        nodes.push({ x, y, anchor: anchorSet.has(k) });
        map.set(k, i);
        return i;
      },
      beam(a, b, part) { if (a !== b) beams.push({ a, b, part }); },
      design: () => ({ nodes, beams })
    };
  }

  function bestPart(level, kind) {
    const order = kind === 'road' ? ['steel_road', 'wood_road', 'concrete_road'] : ['steel_beam', 'wood_beam', 'concrete_beam'];
    return order.find((p) => level.allowedParts.includes(p));
  }

  function refBridge(level, variant) {
    const db = DesignBuilder(level);
    const road = bestPart(level, 'road');
    const beam = bestPart(level, 'beam');
    const rp = PARTS[road], bp = PARTS[beam];
    const L = { x: level.leftEdge, y: level.hL }, R = { x: level.rightEdge, y: level.hR };
    const span = R.x - L.x;
    const panelMax = Math.min(rp.maxLen, bp.maxLen) - 0.01;
    let n = Math.ceil(span / panelMax);
    if (variant === 1) n = Math.ceil(span / (panelMax * 0.75));
    const h0 = variant === 2 ? 1.3 : 1;
    const roadIdx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      roadIdx.push(db.node(L.x + span * t, L.y + (R.y - L.y) * t));
    }
    const panel = span / n;
    const hMax = Math.sqrt(Math.max(1, bp.maxLen * bp.maxLen - (panel / 2) * (panel / 2))) - 0.05;
    const h = Math.min(hMax, Math.max(2.5, Math.min(5.5, span / 7) * h0));
    const tops = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      tops.push(db.node(L.x + span * t, L.y + (R.y - L.y) * t + h));
    }
    for (let i = 0; i < n; i++) {
      db.beam(roadIdx[i], roadIdx[i + 1], road);
      db.beam(roadIdx[i], tops[i], beam);
      db.beam(tops[i], roadIdx[i + 1], beam);
      if (i < n - 1) db.beam(tops[i], tops[i + 1], beam);
    }
    // braced two-leg piers from islands / spires up to the deck
    const pillar = level.allowedParts.includes('concrete_beam') ? 'concrete_beam' : beam;
    const design = db.design();
    for (const is of level.islands) {
      const cx = is.cx, top = is.top;
      if (cx < L.x + 2 || cx > R.x - 2) continue;
      // nearest road node
      let best = 0, bd = 1e9;
      roadIdx.forEach((ri, k) => { const d = Math.abs(design.nodes[ri].x - cx); if (d < bd) { bd = d; best = k; } });
      const rn = design.nodes[roadIdx[best]];
      const deckY = rn.y;
      const rise = deckY - top;
      if (rise < 1) continue;
      const m = Math.max(1, Math.ceil((rise - 0.5) / 3.5));
      let pl = db.node(cx - 1, top), pr = db.node(cx + 1, top);
      for (let i = 1; i < m; i++) {
        const y = top + (rise * i) / m;
        const l = db.node(cx - 1, y), r2 = db.node(cx + 1, y);
        db.beam(pl, l, pillar); db.beam(pr, r2, pillar); db.beam(l, r2, beam);
        db.beam(pl, r2, beam); db.beam(pr, l, beam);
        pl = l; pr = r2;
      }
      db.beam(pl, roadIdx[best], pillar); db.beam(pr, roadIdx[best], pillar);
      if (best > 0) db.beam(pl, roadIdx[best - 1], beam);
      if (best < roadIdx.length - 1) db.beam(pr, roadIdx[best + 1], beam);
    }
    return db.design();
  }

  function refTower(level, variant) {
    const db = DesignBuilder(level);
    const beam = bestPart(level, 'beam');
    const bp = PARTS[beam];
    const H = level.targetHeight;
    const ph = Math.min(variant === 1 ? 3 : 4, bp.maxLen * 0.6);
    // pick the widest anchor pair whose diagonal fits the max length
    const xs = level.anchors.map((a) => a.x).filter((x) => x > 0 && level.anchors.some((b) => b.x === -x)).sort((a, b) => b - a);
    let half = xs.find((x) => Math.hypot(x * 2, ph) <= bp.maxLen) || xs[xs.length - 1];
    const levels = Math.ceil(H / ph);
    let prevL = db.node(-half, 0), prevR = db.node(half, 0);
    for (let i = 1; i <= levels; i++) {
      const y = Math.min(H, i * ph);
      const l = db.node(-half, y), rr = db.node(half, y);
      db.beam(prevL, l, beam); db.beam(prevR, rr, beam);
      db.beam(l, rr, beam);
      db.beam(prevL, rr, beam); db.beam(prevR, l, beam);
      prevL = l; prevR = rr;
    }
    return db.design();
  }

  function usage(design) {
    const u = {};
    for (const b of design.beams) {
      const A = design.nodes[b.a], B = design.nodes[b.b];
      u[b.part] = (u[b.part] || 0) + Math.hypot(B.x - A.x, B.y - A.y);
    }
    return u;
  }

  // ------------------------------------------------------------------
  // decoration (pure visuals)
  // ------------------------------------------------------------------
  function makeDecor(r, theme, geo) {
    const tod = r.pick(['day', 'day', 'morning', 'sunset', 'dusk']);
    const trees = [];
    const left0 = geo.view.x0 - 30, right1 = geo.view.x1 + 30;
    const leftEdge = theme === 'tower' ? -geo.halfW - 4 : geo.eL - 6;
    const rightEdge = theme === 'tower' ? geo.halfW + 4 : geo.eR + 6;
    const nTrees = theme === 'tower' ? 6 : 14;
    for (let i = 0; i < nTrees; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side < 0 ? r.range(left0, leftEdge) : r.range(rightEdge, right1);
      trees.push({ x, s: r.range(0.75, 1.35), kind: theme === 'mountain' ? 'pine' : r.pick(['round', 'round', 'pine']), hue: r.range(-12, 12) });
    }
    const clouds = [];
    for (let i = 0; i < 7; i++) clouds.push({ x: r(), y: r.range(0.05, 0.4), s: r.range(0.6, 1.5), sp: r.range(0.4, 1) });
    const hills = [];
    for (let l = 0; l < 3; l++) {
      const pts = [];
      const amp = theme === 'mountain' ? 0.35 - l * 0.08 : 0.15 - l * 0.03;
      let ph = r() * 10;
      for (let i = 0; i <= 24; i++) pts.push(Math.max(0, Math.sin(i * 0.7 + ph) * 0.5 + Math.sin(i * 1.9 + ph * 2) * 0.25 + 0.6) * amp + (theme === 'mountain' && (i % 5 === 2) ? amp * 0.6 : 0));
      hills.push(pts);
    }
    const buildings = [];
    if (theme === 'tower') {
      let x = -1;
      while (x < 2) { const w = r.range(0.03, 0.07); buildings.push({ x, w, h: r.range(0.12, 0.42), lit: r() }); x += w + r.range(0.005, 0.02); }
    }
    const houses = [];
    if (theme !== 'tower' && theme !== 'mountain') {
      for (let i = 0; i < 2; i++) houses.push({ x: i ? r.range(rightEdge + 4, right1 - 6) : r.range(left0 + 6, leftEdge - 4), hue: r.pick([0, 20, 200, 30]), s: r.range(0.9, 1.2) });
    }
    return { tod, trees, clouds, hills, buildings, houses, birds: r.int(0, 4) };
  }

  // ------------------------------------------------------------------
  // main entry
  // ------------------------------------------------------------------
  function generate(levelNumber, difficulty, seed) {
    seed = (seed === undefined ? (Math.random() * 4294967296) : seed) >>> 0;
    const r = RNG(seed);
    const n = Math.max(1, Math.min(TOTAL_LEVELS, levelNumber));
    const p = (n - 1) / (TOTAL_LEVELS - 1);
    const d = DIFF[difficulty] || DIFF.medium;
    const [theme, test] = SCHEDULE[n - 1];
    const type = theme === 'tower' ? 'tower' : 'bridge';

    const level = {
      number: n, theme, type, test, seed, difficulty,
      allowedParts: allowedParts(n, theme),
      windScale: 4.0,
      buildTime: 300
    };

    let geo;
    if (type === 'bridge') {
      geo = buildBridgeTerrain(r, theme, n, p);
      Object.assign(level, {
        terrain: geo.terrain, anchors: geo.anchors, water: geo.water, span: geo.span,
        leftEdge: geo.eL, rightEdge: geo.eR, hL: geo.hL, hR: geo.hR, islands: geo.islands
      });
    } else {
      geo = buildTowerTerrain(r, n, p, difficulty);
      Object.assign(level, { terrain: geo.terrain, anchors: geo.anchors, water: null, targetHeight: geo.target, halfW: geo.halfW, islands: [] });
    }
    level.build = geo.build; level.view = geo.view;
    level.xMin = geo.view.x0; level.xMax = geo.view.x1;

    // ---- loads ----
    const wantsWeight = test === 'weight' || test === 'both';
    const wantsWind = test === 'wind' || test === 'both';
    let tier = Math.round(p * 6.2) + d.tier;
    if (d.tier > 0 && n < 6) tier = Math.round(p * 6.2); // hard mode starts gently
    tier = Math.max(0, Math.min(6, tier));
    const vehicles = [];
    if (type === 'bridge' && wantsWeight) {
      const count = 2 + Math.floor(p * 2.5) + d.extraVeh;
      vehicles.push(r.pick(VEHICLE_TIERS[tier]));
      for (let i = 1; i < count; i++) vehicles.push(r.pick(VEHICLE_TIERS[r.int(0, Math.max(0, tier - 1))]));
      // shuffle
      for (let i = vehicles.length - 1; i > 0; i--) { const j = r.int(0, i); [vehicles[i], vehicles[j]] = [vehicles[j], vehicles[i]]; }
    }
    // wind-only bridges still send one light test car across in full wind
    if (type === 'bridge' && !wantsWeight) vehicles.push('car');
    level.vehicles = vehicles;
    level.vehicleStart = wantsWeight ? 1.6 : 6.5;
    level.wind = wantsWind ? {
      speed: Math.round((13 + p * 23) * d.wind), dir: r() < 0.5 ? 1 : -1,
      start: type === 'tower' ? 3.0 : 1.5, ramp: 4
    } : null;
    level.testDuration = wantsWind ? (type === 'tower' ? 17 : 15) : (type === 'tower' ? 8 : 6);
    if (type === 'tower') level.loadMass = wantsWeight || true ? Math.round((2500 + p * 16000) * (difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.15 : 1) / 100) * 100 : 0;

    // ---- verify with a reference design; ease loads until it passes ----
    let ref = null, verified = false, eased = 0;
    for (let attempt = 0; attempt < 8 && !verified; attempt++) {
      for (let variant = 0; variant < 3 && !verified; variant++) {
        const des = type === 'bridge' ? refBridge(level, variant) : refTower(level, variant);
        const sim = new P.Sim(level, des, { headless: true });
        if (sim.runHeadless(80)) { ref = des; verified = true; }
        else if (!ref) ref = des;
      }
      if (!verified) {
        eased++;
        if (type === 'bridge' && level.vehicles.length) {
          // replace the heaviest vehicle with a lighter one
          let hi = 0;
          level.vehicles.forEach((v, i) => { if (P.VEHICLES[v].mass > P.VEHICLES[level.vehicles[hi]].mass) hi = i; });
          const t = VEHICLE_TIERS.findIndex((tt) => tt.includes(level.vehicles[hi]));
          if (t > 0) level.vehicles[hi] = VEHICLE_TIERS[t - 1][0];
          else if (level.vehicles.length > 1) level.vehicles.splice(hi, 1);
        }
        if (level.wind) level.wind.speed = Math.max(8, Math.round(level.wind.speed * 0.88));
        if (type === 'tower') level.loadMass = Math.max(1000, Math.round(level.loadMass * 0.8 / 100) * 100);
      }
    }
    level.verified = verified;
    level.eased = eased;
    level.reference = ref;

    // ---- material allowance ----
    const u = usage(ref);
    const inv = {};
    const mult = d.mat;
    const roadNeed = type === 'bridge' ? Object.keys(u).filter((k) => PARTS[k].kind === 'road').reduce((s, k) => s + u[k], 0) : 0;
    const beamNeed = Object.keys(u).filter((k) => PARTS[k].kind === 'beam').reduce((s, k) => s + u[k], 0);
    for (const part of level.allowedParts) {
      const pp = PARTS[part];
      let m = 0;
      if (u[part]) m = u[part] * mult;
      else if (pp.kind === 'road') m = roadNeed * 0.45 * mult;
      else if (pp.kind === 'beam') m = beamNeed * (pp.mat === 'concrete' ? 0.3 : 0.45) * mult;
      else if (pp.kind === 'cable') m = (type === 'bridge' ? level.span * 1.2 : level.targetHeight * 1.6) * mult;
      if (pp.kind === 'road') m = Math.max(m, roadNeed * 0.3);
      inv[part] = Math.max(pp.kind === 'road' ? 6 : 8, Math.ceil(m / 2) * 2);
    }
    level.inventory = inv;
    level.decor = makeDecor(RNG(seed ^ 0x51ed27), theme, geo);
    return level;
  }

  CF.LevelGen = { generate, TOTAL_LEVELS, SCHEDULE, usage };
})(typeof window !== 'undefined' ? window : globalThis);
