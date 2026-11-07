/*
 * Collapse Factor - physics engine
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 *
 * Structures are simulated as pin-jointed trusses using small-step XPBD
 * (eXtended Position Based Dynamics). Every beam is an elastic member with
 * a real axial stiffness (k = E*A/L), a tension limit, a crushing limit and
 * an Euler buckling limit (P = pi^2 * E * I / L^2), so long members that are
 * squeezed buckle much earlier than short ones - exactly like real beams.
 *
 * Units are SI: metres, kilograms, seconds, Newtons. y points UP.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};

  const GRAVITY = 9.81;
  const AIR_DENSITY = 1.225;         // kg/m^3 at sea level
  const SUBSTEPS = 24;
  const JOINT_MASS = 12;             // kg of bolts / gusset plate per joint
  const FORCE_SMOOTH_TAU = 0.035;    // s - filter for force readings
  const MAX_ROAD_SLOPE = 0.52;       // ~ 27.5 degrees - vehicles cannot climb steeper

  // ---------------------------------------------------------------------
  // Materials & parts. Strengths are force capacities of the cross-section
  // the game uses (N). EA / EI from real E (wood 11 GPa, steel 200 GPa,
  // concrete 30 GPa) with game-sized sections.
  // ---------------------------------------------------------------------
  const PARTS = {
    wood_road: {
      id: 'wood_road', mat: 'wood', kind: 'road', maxLen: 5, massPerM: 55,
      tension: 170e3, crush: 150e3, EA: 2.2e8, EI: 6.0e5, depth: 0.35, windDepth: 1.6
    },
    wood_beam: {
      id: 'wood_beam', mat: 'wood', kind: 'beam', maxLen: 6, massPerM: 11,
      tension: 140e3, crush: 120e3, EA: 1.6e8, EI: 2.4e5, depth: 0.16, windDepth: 0.16
    },
    steel_road: {
      id: 'steel_road', mat: 'steel', kind: 'road', maxLen: 6, massPerM: 110,
      tension: 520e3, crush: 460e3, EA: 9.0e8, EI: 2.6e6, depth: 0.4, windDepth: 1.8
    },
    steel_beam: {
      id: 'steel_beam', mat: 'steel', kind: 'beam', maxLen: 8, massPerM: 28,
      tension: 420e3, crush: 380e3, EA: 6.4e8, EI: 1.4e6, depth: 0.18, windDepth: 0.18
    },
    steel_cable: {
      id: 'steel_cable', mat: 'steel', kind: 'cable', maxLen: 22, massPerM: 6,
      tension: 480e3, crush: 0, EA: 2.4e8, EI: 0, depth: 0.05, windDepth: 0.05
    },
    concrete_road: {
      id: 'concrete_road', mat: 'concrete', kind: 'road', maxLen: 6, massPerM: 260,
      tension: 110e3, crush: 1300e3, EA: 3.6e9, EI: 3.0e7, depth: 0.55, windDepth: 2.0
    },
    concrete_beam: {
      id: 'concrete_beam', mat: 'concrete', kind: 'beam', maxLen: 8, massPerM: 120,
      tension: 60e3, crush: 1100e3, EA: 1.5e9, EI: 1.1e7, depth: 0.32, windDepth: 0.32
    }
  };
  const PART_ORDER = ['wood_road', 'wood_beam', 'steel_road', 'steel_beam', 'steel_cable', 'concrete_road', 'concrete_beam'];

  // Real-world vehicle masses (kg) and approximate dimensions (m)
  const VEHICLES = {
    car:     { id: 'car',     mass: 1500,  length: 4.5,  height: 1.45, wheelbase: 2.7, speed: 11, side: 6 },
    suv:     { id: 'suv',     mass: 2200,  length: 4.9,  height: 1.8,  wheelbase: 2.9, speed: 10.5, side: 8 },
    pickup:  { id: 'pickup',  mass: 2600,  length: 5.6,  height: 1.9,  wheelbase: 3.5, speed: 10, side: 9 },
    van:     { id: 'van',     mass: 3500,  length: 5.9,  height: 2.6,  wheelbase: 3.7, speed: 9.5, side: 14 },
    boxtruck:{ id: 'boxtruck',mass: 8000,  length: 7.5,  height: 3.4,  wheelbase: 4.6, speed: 8, side: 24 },
    bus:     { id: 'bus',     mass: 13000, length: 12.0, height: 3.2,  wheelbase: 6.5, speed: 8, side: 36 },
    dump:    { id: 'dump',    mass: 25000, length: 8.5,  height: 3.4,  wheelbase: 4.8, speed: 7, side: 26 },
    semi:    { id: 'semi',    mass: 36000, length: 16.5, height: 4.0,  wheelbase: 12.0, speed: 7, side: 60 }
  };

  function compressionCapacity(part, len) {
    if (part.kind === 'cable') return 0;
    const euler = Math.PI * Math.PI * part.EI / (len * len);
    return Math.min(part.crush, euler);
  }
  function beamMass(part, len) { return part.massPerM * len; }

  // ---------------------------------------------------------------------
  // Seeded RNG
  // ---------------------------------------------------------------------
  function RNG(seed) {
    let s = seed >>> 0;
    const r = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  }

  // ---------------------------------------------------------------------
  // Terrain helpers (heightfield polyline, sorted by x)
  // ---------------------------------------------------------------------
  function groundAt(terrain, x) {
    const p = terrain;
    if (x <= p[0].x) return p[0].y;
    for (let i = 1; i < p.length; i++) {
      if (x <= p[i].x) {
        const a = p[i - 1], b = p[i];
        const t = (x - a.x) / ((b.x - a.x) || 1e-9);
        return a.y + (b.y - a.y) * t;
      }
    }
    return p[p.length - 1].y;
  }

  // ---------------------------------------------------------------------
  // Wind model: deterministic gusty wind from the level seed
  // ---------------------------------------------------------------------
  function makeWind(level) {
    const w = level.wind;
    if (!w || w.speed <= 0) return { speed: () => 0, dir: 1, active: false };
    const r = RNG(level.seed ^ 0x9e3779b9);
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
    const fr = [0.31 + r() * 0.1, 0.83 + r() * 0.2, 1.9 + r() * 0.4, 0.13 + r() * 0.05];
    return {
      active: true,
      dir: w.dir,
      // wind speed (m/s) at test-time t
      speed(t) {
        const t0 = w.start;
        if (t < t0) return 0;
        const ramp = Math.min(1, (t - t0) / w.ramp);
        const gust = 0.78 + 0.12 * Math.sin(fr[0] * t + ph[0]) + 0.07 * Math.sin(fr[1] * t + ph[1]) +
          0.04 * Math.sin(fr[2] * t + ph[2]) + 0.10 * Math.max(0, Math.sin(fr[3] * 6.28 * t + ph[3]));
        return w.speed * ramp * Math.min(1.1, gust);
      }
    };
  }

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------
  class Sim {
    /**
     * @param level  generated level
     * @param design {nodes:[{x,y,anchor}], beams:[{a,b,part}]}
     */
    constructor(level, design, opts) {
      opts = opts || {};
      this.level = level;
      this.headless = !!opts.headless;
      this.t = 0;
      this.status = 'running';
      this.events = [];
      this.wind = makeWind(level);
      this.windNow = 0;
      this.loadRamp = 0;
      this.water = level.water;

      // nodes
      this.nodes = design.nodes.map((n) => ({
        x: n.x, y: n.y, x0: n.x, y0: n.y, px: n.x, py: n.y, vx: 0, vy: 0,
        fx: 0, fy: 0, mass: JOINT_MASS, extra: 0, w: 0,
        fixed: !!n.anchor, inWater: false, beams: 0
      }));
      // beams
      this.beams = design.beams.map((b) => {
        const part = PARTS[b.part];
        const A = this.nodes[b.a], B = this.nodes[b.b];
        const L = Math.hypot(B.x - A.x, B.y - A.y);
        const m = beamMass(part, L);
        A.mass += m / 2; B.mass += m / 2; A.beams++; B.beams++;
        return {
          a: b.a, b: b.b, part, L, mass: m,
          compliance: L / part.EA,
          tcap: part.tension, ccap: compressionCapacity(part, L),
          lambda: 0, force: 0, fs: 0, ratio: 0, peak: 0, peakMode: null,
          broken: false, len: L
        };
      });
      this.updateInvMass();

      this.record = {
        breaks: [], failReason: null, maxDispBeforeBreak: 0, firstBreakT: null,
        windPeak: 0, vehiclesCrossed: 0, vehiclesTotal: 0, maxSag: 0,
        steepest: 0, roadConnected: false, hasRoad: false, reachedHeight: true,
        loadMass: 0, tankFell: false
      };

      if (level.type === 'bridge') this.setupVehicles();
      else this.setupTower();
      this.endTime = level.testDuration;
      this.failTimer = -1;
    }

    updateInvMass() {
      for (const n of this.nodes) n.w = n.fixed ? 0 : 1 / (n.mass + n.extra);
    }

    // ---------------- bridge: road path + vehicles ----------------
    setupVehicles() {
      const lv = this.level;
      const N = this.nodes.length;
      const adj = Array.from({ length: N }, () => []);
      this.beams.forEach((b, i) => {
        if (b.part.kind === 'road') { adj[b.a].push([b.b, i]); adj[b.b].push([b.a, i]); }
      });
      const mid = (lv.leftEdge + lv.rightEdge) / 2;
      const isRoadAnchor = (i, side) => {
        const n = this.nodes[i];
        if (!n.fixed) return false;
        const an = lv.anchors.find((a) => a.x === n.x0 && a.y === n.y0);
        return an && an.road && (side < 0 ? an.x < mid : an.x > mid);
      };
      this.record.hasRoad = this.beams.some((b) => b.part.kind === 'road');
      // BFS from every left road anchor that touches a road beam
      const prev = new Array(N).fill(-2), prevBeam = new Array(N).fill(-1);
      const q = [];
      for (let i = 0; i < N; i++) if (isRoadAnchor(i, -1) && adj[i].length) { prev[i] = -1; q.push(i); }
      let goal = -1;
      while (q.length && goal < 0) {
        const u = q.shift();
        if (isRoadAnchor(u, 1)) { goal = u; break; }
        for (const [v, bi] of adj[u]) if (prev[v] === -2) { prev[v] = u; prevBeam[v] = bi; q.push(v); }
      }
      let end = goal;
      this.record.roadConnected = goal >= 0;
      if (goal < 0) {
        // partial path - go to the reached node farthest to the right
        let best = -1, bx = -1e9;
        for (let i = 0; i < N; i++) if (prev[i] !== -2 && this.nodes[i].x > bx) { bx = this.nodes[i].x; best = i; }
        end = best;
      }
      const chain = [];
      const chainBeams = [];
      if (end >= 0) {
        let c = end;
        while (c >= 0) { chain.unshift(c); if (prevBeam[c] >= 0) chainBeams.unshift(prevBeam[c]); c = prev[c]; }
      }
      // build path segments
      const segs = [];
      const terr = lv.terrain;
      const startX = lv.xMin - 25;
      const pushStatic = (ax, ay, bx2, by) => { if (Math.abs(bx2 - ax) > 1e-6 || Math.abs(by - ay) > 1e-6) segs.push({ beam: -1, ax, ay, bx: bx2, by }); };
      const leftEndX = chain.length ? this.nodes[chain[0]].x0 : lv.leftEdge;
      // approach along terrain
      let px = startX, py = groundAt(terr, startX);
      for (const p of terr) {
        if (p.x > px && p.x < leftEndX) { pushStatic(px, py, p.x, p.y); px = p.x; py = p.y; }
      }
      pushStatic(px, py, leftEndX, groundAt(terr, leftEndX));
      for (let k = 0; k < chainBeams.length; k++) {
        segs.push({ beam: chainBeams[k], na: chain[k], nb: chain[k + 1] });
      }
      this.pathOpenEnd = !this.record.roadConnected;
      if (this.record.roadConnected) {
        const rx = this.nodes[end].x0;
        px = rx; py = groundAt(terr, rx);
        for (const p of terr) { if (p.x > px) { pushStatic(px, py, p.x, p.y); px = p.x; py = p.y; } if (p.x > lv.xMax + 30) break; }
        pushStatic(px, py, lv.xMax + 40, groundAt(terr, lv.xMax + 40));
      }
      this.path = segs;
      // steepness
      for (const bi of chainBeams) {
        const b = this.beams[bi], A = this.nodes[b.a], B = this.nodes[b.b];
        const sl = Math.abs(Math.atan2(B.y - A.y, Math.abs(B.x - A.x)));
        this.record.steepest = Math.max(this.record.steepest, sl);
      }
      this.roadNodes = chain.slice();
      this.exitX = lv.xMax + 18;
      // vehicles
      this.vehicles = [];
      let s0 = -4;
      for (let i = 0; i < lv.vehicles.length; i++) {
        const spec = VEHICLES[lv.vehicles[i]];
        const v = {
          spec, s: s0, speed: 0, state: 'drive', x: 0, y: 0, ang: 0, vx: 0, vy: 0, w: 0,
          wheels: [], delay: lv.vehicleStart + i * 0.25, stuckT: 0, wheelRot: 0, onBridge: false
        };
        s0 -= spec.length + 7;
        this.vehicles.push(v);
      }
      this.record.vehiclesTotal = this.vehicles.length;
    }

    segPoints(seg) {
      if (seg.beam < 0) return [seg.ax, seg.ay, seg.bx, seg.by];
      const A = this.nodes[seg.na], B = this.nodes[seg.nb];
      return [A.x, A.y, B.x, B.y];
    }

    // locate arc length s on the path -> {x,y,seg,t,ang}
    locate(s) {
      let acc = 0;
      const segs = this.path;
      for (let i = 0; i < segs.length; i++) {
        const p = this.segPoints(segs[i]);
        const L = Math.hypot(p[2] - p[0], p[3] - p[1]);
        if (s <= acc + L || i === segs.length - 1) {
          let t = L > 0 ? (s - acc) / L : 0;
          if (i === 0 && t < 0) { // before path start - extrapolate flat
            return { x: p[0] + (s - acc), y: p[1], seg: -1, t: 0, ang: 0 };
          }
          t = Math.min(Math.max(t, 0), this.pathOpenEnd && i === segs.length - 1 ? 1 : 1e9);
          return { x: p[0] + (p[2] - p[0]) * t, y: p[1] + (p[3] - p[1]) * t, seg: i, t, ang: Math.atan2(p[3] - p[1], p[2] - p[0]) };
        }
        acc += L;
      }
      return { x: 0, y: 0, seg: -1, t: 0, ang: 0 };
    }

    pathLength() {
      let acc = 0;
      for (const s of this.path) { const p = this.segPoints(s); acc += Math.hypot(p[2] - p[0], p[3] - p[1]); }
      return acc;
    }

    // arc position where the road becomes impassable (broken beam / open end / too steep)
    blockedAt() {
      let acc = 0;
      for (let i = 0; i < this.path.length; i++) {
        const seg = this.path[i];
        const p = this.segPoints(seg);
        const L = Math.hypot(p[2] - p[0], p[3] - p[1]);
        if (seg.beam >= 0) {
          const b = this.beams[seg.beam];
          if (b.broken) return { s: acc, why: 'broken' };
          const slope = Math.atan2(p[3] - p[1], p[2] - p[0]);
          if (slope > MAX_ROAD_SLOPE) return { s: acc, why: 'steep' };
        }
        acc += L;
      }
      if (this.pathOpenEnd) return { s: acc, why: 'gap' };
      return null;
    }

    stepVehicles(dt) {
      const block = this.blockedAt();
      const total = this.pathLength();
      let leaderBack = Infinity; // rear position of vehicle ahead
      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        if (v.state === 'fall' || v.state === 'done' || v.state === 'sunk') {
          if (v.state === 'fall') this.stepFallingVehicle(v, dt);
          if (v.state !== 'done') leaderBack = Infinity;
          continue;
        }
        if (this.t < v.delay) { this.placeVehicle(v); leaderBack = v.s - v.spec.length - 0; continue; }
        // speed control
        let target = v.spec.speed;
        let limit = leaderBack - 4;                          // keep distance from vehicle ahead
        if (block && v.s < block.s + 0.01) limit = Math.min(limit, block.s - 1.2);
        const gap = limit - v.s;
        const brakeSpeed = Math.sqrt(Math.max(0, 2 * 5.5 * Math.max(0, gap)));
        target = Math.min(target, brakeSpeed);
        if (gap <= 0.05) target = 0;
        const acc = target > v.speed ? 2.6 : -7;
        v.speed += acc * dt;
        if ((acc > 0 && v.speed > target) || (acc < 0 && v.speed < target)) v.speed = target;
        if (v.speed < 0) v.speed = 0;
        v.s += v.speed * dt;
        v.wheelRot += v.speed * dt / 0.4;
        this.placeVehicle(v);
        // On a broken / collapsing segment -> fall
        let falls = false;
        for (const wh of v.wheels) {
          if (wh.seg >= 0) {
            const seg = this.path[wh.seg];
            if (seg.beam >= 0) {
              const b = this.beams[seg.beam];
              const A = this.nodes[seg.na], B = this.nodes[seg.nb];
              const sl = Math.abs(Math.atan2(B.y - A.y, B.x - A.x));
              const vy = (A.vy + B.vy) / 2;
              if (b.broken || sl > 1.0 || vy < -7) falls = true;
            }
          }
        }
        if (this.pathOpenEnd && v.s > total + 0.5) falls = true;
        if (falls) { this.startFall(v); leaderBack = Infinity; continue; }
        // stuck detection
        if (v.speed < 0.05 && block && v.s >= block.s - 2.5) v.stuckT += dt; else v.stuckT = 0;
        v.onBridge = v.wheels.some((wh) => wh.seg >= 0 && this.path[wh.seg].beam >= 0);
        if (v.x > this.exitX) { v.state = 'done'; this.record.vehiclesCrossed++; this.events.push({ type: 'vehicleDone', v }); }
        leaderBack = v.s - v.spec.wheelbase - (v.spec.length - v.spec.wheelbase) * 0.5 - 0.5;
      }
    }

    // place the vehicle: rear wheel at s - wheelbase, front wheel at s
    placeVehicle(v) {
      const front = this.locate(v.s);
      const rear = this.locate(v.s - v.spec.wheelbase);
      v.wheels = [rear, front];
      v.x = (front.x + rear.x) / 2; v.y = (front.y + rear.y) / 2;
      v.ang = Math.atan2(front.y - rear.y, front.x - rear.x);
    }

    startFall(v) {
      v.state = 'fall';
      v.vx = Math.cos(v.ang) * v.speed;
      v.vy = Math.sin(v.ang) * v.speed;
      // inherit motion of the structure under it
      const wh = v.wheels[1];
      if (wh && wh.seg >= 0 && this.path[wh.seg].beam >= 0) {
        const seg = this.path[wh.seg];
        v.vx += (this.nodes[seg.na].vx + this.nodes[seg.nb].vx) * 0.5;
        v.vy += (this.nodes[seg.na].vy + this.nodes[seg.nb].vy) * 0.5;
      }
      v.w = (Math.random() - 0.5) * 1.2 - 0.6;
      this.events.push({ type: 'vehicleFall', v });
      if (!this.record.failReason) this.record.failReason = 'vehicle_fell';
    }

    stepFallingVehicle(v, dt) {
      v.vy -= GRAVITY * dt;
      if (v.inWater) { v.vx *= 0.96; v.vy *= 0.9; v.vy += 6 * dt; v.w *= 0.95; }
      v.x += v.vx * dt; v.y += v.vy * dt; v.ang += v.w * dt;
      const g = groundAt(this.level.terrain, v.x);
      if (this.water && v.x > this.water.x0 && v.x < this.water.x1 && v.y < this.water.y && !v.inWater) {
        v.inWater = true;
        this.events.push({ type: 'splash', x: v.x, y: this.water.y, big: true, mass: v.spec.mass });
      }
      if (v.y < g + 0.5) {
        if (!v.landed && Math.abs(v.vy) > 3) this.events.push({ type: 'crash', x: v.x, y: g, mass: v.spec.mass });
        v.landed = true;
        v.y = g + 0.5; v.vy = Math.abs(v.vy) * 0.15; v.vx *= 0.6; v.w *= 0.5;
      }
      if (v.inWater && v.y < this.water.y - 3) v.state = 'sunk';
    }

    applyVehicleLoads() {
      if (!this.vehicles) return;
      for (const v of this.vehicles) {
        if (v.state !== 'drive' || this.t < v.delay) continue;
        const per = v.spec.mass * GRAVITY / 2;
        for (const wh of v.wheels) {
          if (wh.seg < 0) continue;
          const seg = this.path[wh.seg];
          if (seg.beam < 0) continue;
          const t = Math.min(1, Math.max(0, wh.t));
          this.nodes[seg.na].fy -= per * (1 - t);
          this.nodes[seg.nb].fy -= per * t;
        }
      }
    }

    // ---------------- tower ----------------
    setupTower() {
      const lv = this.level;
      let maxY = -1e9;
      this.nodes.forEach((n) => { if (n.beams > 0) maxY = Math.max(maxY, n.y); });
      this.record.reachedHeight = maxY >= lv.targetHeight - 1e-6;
      this.loadNodes = [];
      if (this.record.reachedHeight) {
        this.nodes.forEach((n, i) => { if (!n.fixed && n.beams > 0 && n.y >= maxY - 0.6 && n.y >= lv.targetHeight - 1e-6) this.loadNodes.push(i); });
        if (!this.loadNodes.length) this.nodes.forEach((n, i) => { if (n.beams > 0 && n.y >= maxY - 0.6) this.loadNodes.push(i); });
      }
      this.tank = { attached: false, mass: lv.loadMass, fallen: false, x: 0, y: maxY + 25, vx: 0, vy: 0, ang: 0, w: 0, dropY: maxY + 25 };
      this.record.loadMass = lv.loadMass;
    }

    stepTower(dt) {
      const lv = this.level, tank = this.tank;
      if (!this.loadNodes.length) {
        if (this.t > 2 && !this.record.failReason) { this.record.failReason = 'no_height'; this.finish(false); }
        return;
      }
      const ln = this.loadNodes.map((i) => this.nodes[i]);
      const cx = ln.reduce((s, n) => s + n.x, 0) / ln.length;
      const cy = ln.reduce((s, n) => s + n.y, 0) / ln.length;
      if (!tank.attached && !tank.fallen) {
        // the tank is lowered by crane between t=1.2 and t=2.4
        const k = Math.min(1, Math.max(0, (this.t - 1.2) / 1.2));
        tank.x = cx; tank.y = cy + (1 - k * k) * 20 + 1.6; tank.ang = 0;
        if (k >= 1) { tank.attached = true; tank.attachT = this.t; this.events.push({ type: 'tankLand', x: cx, y: cy }); }
      }
      if (tank.attached && !tank.fallen) {
        // ramp in the mass over 0.5 s
        const m = tank.mass * Math.min(1, (this.t - tank.attachT) / 0.5);
        for (const n of ln) n.extra = m / ln.length;
        this.updateInvMass();
        // tank wind area: 3.2 m x 3.2 m box, Cd 1.05
        const ws = this.windNow;
        const F = 0.5 * AIR_DENSITY * 1.05 * 10.2 * ws * ws * this.level.windScale * this.wind.dir;
        for (const n of ln) n.fx += F / ln.length;
        tank.x = cx; tank.y = cy + 1.6;
        let ang = 0;
        if (ln.length >= 2) {
          const l = ln.reduce((a, b) => (a.x < b.x ? a : b)), r = ln.reduce((a, b) => (a.x > b.x ? a : b));
          ang = Math.atan2(r.y - l.y, r.x - l.x);
        }
        tank.ang = ang;
        // does the tank fall off?
        let spread = 0;
        for (const n of ln) spread = Math.max(spread, Math.hypot(n.x - cx, n.y - cy));
        const anyBroken = this.loadNodes.some((i) => !this.nodeConnected(i));
        if (Math.abs(ang) > 0.7 || anyBroken || cy < lv.targetHeight - 4 || ln.some((n) => n.vy < -9)) {
          tank.fallen = true; tank.attached = false;
          for (const n of ln) n.extra = 0;
          this.updateInvMass();
          tank.vx = ln.reduce((s, n) => s + n.vx, 0) / ln.length;
          tank.vy = ln.reduce((s, n) => s + n.vy, 0) / ln.length;
          tank.w = (Math.random() - 0.5) * 2;
          this.record.tankFell = true;
          if (!this.record.failReason) this.record.failReason = 'tank_fell';
          this.events.push({ type: 'tankFall', x: tank.x, y: tank.y });
        }
      }
      if (tank.fallen) {
        tank.vy -= GRAVITY * dt; tank.x += tank.vx * dt; tank.y += tank.vy * dt; tank.ang += tank.w * dt;
        const g = groundAt(lv.terrain, tank.x);
        if (tank.y < g + 1.6) {
          if (!tank.landed) this.events.push({ type: 'crash', x: tank.x, y: g, mass: tank.mass, splash: true });
          tank.landed = true; tank.y = g + 1.6; tank.vy = 0; tank.vx *= 0.5; tank.w = 0;
        }
      }
      this.record.towerTop = cy;
    }

    nodeConnected(i) {
      for (const b of this.beams) if (!b.broken && (b.a === i || b.b === i)) return true;
      return false;
    }

    // ---------------- main step ----------------
    step(dt) {
      if (this.status !== 'running' && this.t > this.doneAt + 6) return;
      dt = dt || 1 / 60;
      this.t += dt;
      this.loadRamp = Math.min(1, this.t / 0.9);
      this.windNow = this.wind.speed(this.t);
      this.record.windPeak = Math.max(this.record.windPeak, this.windNow);

      for (const n of this.nodes) { n.fx = 0; n.fy = 0; }
      if (this.level.type === 'bridge') this.applyVehicleLoads(); else this.stepTower(dt);
      this.applyWind();

      const h = dt / SUBSTEPS;
      const h2 = h * h;
      const tauK = 1 - Math.exp(-h / FORCE_SMOOTH_TAU);
      const g = GRAVITY * this.loadRamp;
      const nodes = this.nodes, beams = this.beams;
      const water = this.water;
      for (let sub = 0; sub < SUBSTEPS; sub++) {
        // integrate
        for (const n of nodes) {
          if (n.w === 0) continue;
          const m = n.mass + n.extra;
          n.vx += h * (n.fx / m);
          n.vy += h * (n.fy / m - g);
          n.vx *= 0.99985; n.vy *= 0.99985;
          n.px = n.x; n.py = n.y;
          n.x += h * n.vx; n.y += h * n.vy;
        }
        // constraints (Gauss-Seidel, one pass per substep)
        for (const b of beams) {
          if (b.broken) continue;
          const A = nodes[b.a], B = nodes[b.b];
          const wsum = A.w + B.w;
          if (wsum === 0) continue;
          let dx = A.x - B.x, dy = A.y - B.y;
          const len = Math.hypot(dx, dy) || 1e-9;
          const C = len - b.L;
          if (b.part.kind === 'cable' && C < 0) { b.lambda = 0; b.len = len; continue; }
          const at = b.compliance / h2;
          const dl = (-C) / (wsum + at);
          dx /= len; dy /= len;
          A.x += A.w * dl * dx; A.y += A.w * dl * dy;
          B.x -= B.w * dl * dx; B.y -= B.w * dl * dy;
          b.lambda = dl;
          b.len = len;
        }
        // velocities + ground / water
        for (const n of nodes) {
          if (n.w === 0) continue;
          n.vx = (n.x - n.px) / h; n.vy = (n.y - n.py) / h;
        }
        // force readings (tension positive)
        for (const b of beams) {
          if (b.broken) continue;
          const T = -b.lambda / h2;
          b.fs += (T - b.fs) * tauK;
        }
      }
      // terrain + water interaction (once per frame is enough for debris)
      for (const n of nodes) {
        if (n.w === 0) continue;
        const gy = groundAt(this.level.terrain, n.x);
        if (n.y < gy) {
          if (n.vy < -6 && n.beams > 0) this.events.push({ type: 'thud', x: n.x, y: gy, v: -n.vy });
          n.y = gy; n.vy = Math.max(0, n.vy) * 0.1; n.vx *= 0.5;
        }
        if (water && n.x > water.x0 && n.x < water.x1) {
          const under = n.y < water.y;
          if (under && !n.inWater && n.vy < -2.5 && n.beams > 0) this.events.push({ type: 'splash', x: n.x, y: water.y, big: n.vy < -8 });
          n.inWater = under;
          if (under) { n.vx *= 0.95; n.vy *= 0.92; }
        }
      }
      this.checkBreaks();
      if (this.level.type === 'bridge') this.stepVehicles(dt);
      this.checkEnd(dt);
    }

    applyWind() {
      const ws = this.windNow;
      if (ws <= 0) return;
      const q = 0.5 * AIR_DENSITY * ws * ws * this.level.windScale;
      const dir = this.wind.dir;
      for (const b of this.beams) {
        if (b.broken) continue;
        const A = this.nodes[b.a], B = this.nodes[b.b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        // area facing a horizontal wind: vertical projection, plus a share
        // of the face for decks (cross-wind / turbulence).
        const proj = Math.abs(dy) / len;
        const area = len * b.part.windDepth * (0.3 + 0.7 * proj);
        const F = q * 1.2 * area * dir;
        A.fx += F / 2; B.fx += F / 2;
        if (b.part.kind === 'road') {
          // aerodynamic flutter on decks: oscillating lift
          const mx = (A.x + B.x) / 2;
          const lift = q * 0.35 * len * 1.5 * Math.sin(this.t * 2.6 + mx * 0.45);
          A.fy += lift / 2; B.fy += lift / 2;
        }
      }
    }

    checkBreaks() {
      for (let i = 0; i < this.beams.length; i++) {
        const b = this.beams[i];
        if (b.broken) continue;
        const T = b.fs;
        let ratio, mode;
        if (T >= 0) { ratio = T / b.tcap; mode = 'tension'; }
        else if (b.part.kind === 'cable') { ratio = 0; mode = 'slack'; }
        else { ratio = -T / b.ccap; mode = b.ccap < b.part.crush ? 'buckle' : 'compression'; }
        b.ratio = ratio;
        if (ratio > b.peak) { b.peak = ratio; b.peakMode = mode; }
        if (ratio > 1) this.breakBeam(i, mode, ratio);
      }
      if (!this.record.breaks.length) {
        let md = 0;
        for (const n of this.nodes) if (!n.fixed) md = Math.max(md, Math.hypot(n.x - n.x0, n.y - n.y0));
        this.record.maxDispBeforeBreak = Math.max(this.record.maxDispBeforeBreak, md);
        if (this.roadNodes) for (const i of this.roadNodes) this.record.maxSag = Math.max(this.record.maxSag, this.nodes[i].y0 - this.nodes[i].y);
      }
    }

    breakBeam(i, mode, ratio) {
      const b = this.beams[i];
      if (b.broken) return;
      b.broken = true;
      const A = this.nodes[b.a], B = this.nodes[b.b];
      A.mass -= b.mass / 2; B.mass -= b.mass / 2; A.beams--; B.beams--;
      A.mass = Math.max(A.mass, JOINT_MASS); B.mass = Math.max(B.mass, JOINT_MASS);
      this.updateInvMass();
      const onBridge = (this.vehicles || []).filter((v) => v.state === 'drive' && v.onBridge).map((v) => v.spec.id);
      const info = {
        t: this.t, beam: i, part: b.part.id, mat: b.part.mat, kind: b.part.kind, mode, ratio,
        len: b.L, x: (A.x0 + B.x0) / 2, y: (A.y0 + B.y0) / 2,
        wind: this.windNow, vehicles: onBridge,
        nearAnchor: A.fixed || B.fixed, load: (this.tank && this.tank.attached) ? this.tank.mass : 0
      };
      this.record.breaks.push(info);
      if (this.record.firstBreakT === null) this.record.firstBreakT = this.t;
      this.events.push({
        type: 'break', mat: b.part.mat, kind: b.part.kind, mode,
        ax: A.x, ay: A.y, bx: B.x, by: B.y,
        avx: A.vx, avy: A.vy, bvx: B.vx, bvy: B.vy, part: b.part.id
      });
    }

    checkEnd(dt) {
      if (this.status !== 'running') return;
      const lv = this.level;
      if (lv.type === 'bridge') {
        const fallen = this.vehicles.some((v) => v.state === 'fall' || v.state === 'sunk');
        const stuck = this.vehicles.some((v) => v.stuckT > 1.5);
        const allDone = this.vehicles.every((v) => v.state === 'done');
        if (fallen) return this.finishLater(false, 'vehicle_fell', 4.5);
        if (stuck) {
          const blk = this.blockedAt();
          const why = blk ? (blk.why === 'gap' ? (this.record.hasRoad ? 'gap' : 'no_road') : blk.why === 'steep' ? 'steep' : 'collapse') : 'collapse';
          return this.finishLater(false, why, 1.5);
        }
        // wind-only: the road must stay usable
        if (this.vehicles.length === 0) {
          if (!this.record.roadConnected && this.t > 1.5) return this.finishLater(false, this.record.hasRoad ? 'gap' : 'no_road', 2.5);
          const roadBroken = this.path.some((s) => s.beam >= 0 && this.beams[s.beam].broken);
          if (roadBroken) return this.finishLater(false, 'collapse', 4.5);
          if (this.record.maxSag > Math.max(0.9, lv.span / 40)) return this.finishLater(false, 'sag', 3);
        }
        const windDone = !this.wind.active || this.t >= lv.testDuration;
        if (allDone && windDone && this.t > 3) return this.finish(true);
        if (this.t > lv.testDuration + 40) return this.finish(false, 'timeout');
      } else {
        if (this.record.failReason) return this.finishLater(false, this.record.failReason, 4);
        if (this.t >= lv.testDuration) {
          const ok = this.tank.attached && this.record.towerTop >= lv.targetHeight - 1.2;
          if (ok) return this.finish(true);
          return this.finishLater(false, 'tower_low', 2);
        }
      }
    }

    finishLater(success, reason, delay) {
      if (this.failTimer < 0) { this.failTimer = this.t + delay; if (!this.record.failReason) this.record.failReason = reason; }
      if (this.t >= this.failTimer) this.finish(success, this.record.failReason);
    }

    finish(success, reason) {
      if (this.status !== 'running') return;
      this.status = success ? 'success' : 'fail';
      if (!success && reason && !this.record.failReason) this.record.failReason = reason;
      if (success) this.record.failReason = null;
      this.doneAt = this.t;
      this.events.push({ type: 'end', success });
    }

    // run a full test without rendering (used to verify generated levels)
    runHeadless(maxT) {
      maxT = maxT || 90;
      while (this.status === 'running' && this.t < maxT) this.step(1 / 60);
      return this.status === 'success';
    }
  }

  CF.Physics = {
    GRAVITY, PARTS, PART_ORDER, VEHICLES, MAX_ROAD_SLOPE,
    compressionCapacity, beamMass, RNG, groundAt, Sim
  };
})(typeof window !== 'undefined' ? window : globalThis);
