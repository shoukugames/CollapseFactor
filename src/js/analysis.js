/*
 * Collapse Factor - test analysis: friendly explanations of weak points
 * Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
 */
(function (G) {
  'use strict';
  const CF = G.CF = G.CF || {};

  function analyse(level, sim, usageFrac, refRatio) {
    const t = CF.I18n.t, fmt = CF.I18n.fmtNum;
    const rec = sim.record;
    const success = sim.status === 'success';
    const out = { success, reason: rec.failReason, lines: [], tips: [], stars: 0 };
    const peak = sim.beams.reduce((m, b) => Math.max(m, b.peak), 0);
    out.peak = peak;

    if (success) {
      out.stars = refRatio <= 1.1 ? 3 : refRatio <= 1.4 ? 2 : 1;
      out.lines.push(t('success_msg'));
      return out;
    }

    const tips = new Set();
    out.opener = t(['open1', 'open2', 'open3', 'open4'][Math.floor(Math.random() * 4)]);
    const reason = rec.failReason || 'collapse';
    out.lines.push(t('a_' + reason));

    const first = rec.breaks[0];
    if (first) {
      const partName = t('part_' + first.part);
      out.lines.push(t('b_' + first.mode, { part: partName, len: first.len.toFixed(1) }));
      if (first.mode === 'tension') {
        tips.add(first.mat === 'concrete' ? 't_tension_concrete' : first.mat === 'wood' ? 't_tension_wood' : 't_tension_steel');
      } else if (first.mode === 'buckle') tips.add('t_buckle');
      else tips.add('t_compression');
      if (first.vehicles && first.vehicles.length) {
        const heaviest = first.vehicles.reduce((a, b) => (CF.Physics.VEHICLES[a].mass >= CF.Physics.VEHICLES[b].mass ? a : b));
        out.lines.push(t('b_vehicle', { veh: t('veh_' + heaviest), mass: fmt(CF.Physics.VEHICLES[heaviest].mass) }));
        if (CF.Physics.VEHICLES[heaviest].mass >= 7000) tips.add('t_vehicle');
      }
      if (first.load) out.lines.push(t('b_tank', { mass: fmt(first.load) }));
      if (first.wind > 6) {
        out.lines.push(t('b_wind', { kmh: fmt(first.wind * 3.6) }));
        if (level.wind && first.wind > level.wind.speed * 0.45) tips.add('t_wind');
      }
      if (first.nearAnchor) { out.lines.push(t('b_anchor')); tips.add('t_anchor'); }
    }
    if (rec.maxDispBeforeBreak > 1.4 || reason === 'sag' || (reason === 'tower_low' && !first)) {
      out.lines.push(t('b_wobble'));
      tips.add('t_wobble');
    }
    const reasonTip = { gap: 't_gap', no_road: 't_no_road', steep: 't_steep', sag: 't_sag', tank_fell: 't_tank', tower_low: 't_tower_low', no_height: 't_no_height' }[reason];
    if (reasonTip) tips.add(reasonTip);
    if (level.wind && reason !== 'gap' && reason !== 'no_road' && reason !== 'no_height') tips.add('t_wind');
    if (usageFrac > 0.9) tips.add('t_material');
    if (!tips.size) tips.add('t_wobble');
    out.tips = Array.from(tips).slice(0, 4).map((k) => t(k));
    out.closer = t(Math.random() < 0.5 ? 'close1' : 'close2');
    return out;
  }

  CF.Analysis = { analyse };
})(typeof window !== 'undefined' ? window : globalThis);
