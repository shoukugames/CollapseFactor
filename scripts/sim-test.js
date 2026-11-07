// Headless physics / level-generation test harness.
// Usage: node scripts/sim-test.js [seedsPerLevel]
require('../src/js/physics.js');
require('../src/js/levelgen.js');
const CF = globalThis.CF;
const seeds = +process.argv[2] || 3;
let fails = 0;
for (const diff of ['easy', 'medium', 'hard']) {
  console.log(`\n=== ${diff} ===`);
  for (let n = 1; n <= 20; n++) {
    const rows = [];
    for (let s = 0; s < seeds; s++) {
      const t0 = Date.now();
      const lv = CF.LevelGen.generate(n, diff, 1000 * n + s * 7919 + diff.length);
      const ms = Date.now() - t0;
      if (!lv.verified) fails++;
      // a "naive" road-only design must fail on weight levels
      let naive = '';
      if (lv.type === 'bridge') {
        const L = lv.anchors.find((a) => a.road && a.x === lv.leftEdge), R = lv.anchors.find((a) => a.road && a.x === lv.rightEdge);
        const nodes = [{ x: L.x, y: L.y, anchor: true }];
        const k = Math.ceil(lv.span / 5);
        for (let i = 1; i < k; i++) nodes.push({ x: L.x + (R.x - L.x) * i / k, y: L.y + (R.y - L.y) * i / k });
        nodes.push({ x: R.x, y: R.y, anchor: true });
        const beams = []; for (let i = 0; i < k; i++) beams.push({ a: i, b: i + 1, part: 'wood_road' });
        const sim = new CF.Physics.Sim(lv, { nodes, beams }, { headless: true });
        naive = sim.runHeadless(60) ? 'NAIVE-PASSED!' : 'naive:' + sim.record.failReason;
      }
      rows.push(`${lv.verified ? 'ok' : 'XX'} eased=${lv.eased} ${ms}ms ` +
        (lv.type === 'bridge' ? `span=${lv.span} veh=[${lv.vehicles}]` : `H=${lv.targetHeight} load=${lv.loadMass}`) +
        ` wind=${lv.wind ? lv.wind.speed : 0} ${naive}`);
    }
    console.log(`L${n} ${CF.LevelGen.SCHEDULE[n - 1].join('/')}:\n   ` + rows.join('\n   '));
  }
}
console.log('\nunverified levels:', fails);
