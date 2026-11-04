// Run from the repo root: node test/scenarios.test.js
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync("index.html", "utf8");
const src = html.split("/*PURE-START*/")[1].split("/*PURE-END*/")[0];
const api = new Function(src + "; return {isAllowedCommand,parseDtc,parseMode06,parseMode06Full,parseSupport,parseMonitor,decodeMetric,plausible,METRICS,isNoData,simulatorReply,csvCell,rate,compact,flow,overlap,median,analyzeDrive,matchVehicle,reportMarkdown,annotate,validateSignals};")();
const m = id => api.METRICS.find(x => x.id === id);

// ---- Safety allowlist
for (const ok of ["ATZ","ATSH7E2","010C","03","07","0A","06A5","221940","0902","020C00"]) assert(api.isAllowedCommand(ok), ok);
for (const bad of ["04","14","2E1940","1003","2701","3101","3E","ATMA","ATPP","ATWS","010C;04","0401","22","221","2219401","STDI"]) assert(!api.isAllowedCommand(bad), bad);

// ---- Decoders
assert.strictEqual(api.decodeMetric(m("rpm"), "410C1AF8\r\r>"), 1726);
assert.strictEqual(api.decodeMetric(m("ect"), "41 05 5C\r\r>").toFixed(1), "125.6");
assert.strictEqual(api.decodeMetric(m("trans"), "621940BC\r\r>").toFixed(1), "298.4");
assert.strictEqual(api.decodeMetric(m("trans"), "7F2231\r\r>"), null);
assert.strictEqual(api.decodeMetric(m("slip"), "621991FF70\r\r>"), -18);
assert.strictEqual(api.decodeMetric(m("gratio"), "41A4000000FA\r\r>"), null);
assert.strictEqual(m("cat2").cmd, "013D"); assert.strictEqual(m("cat1s2").cmd, "013E");
assert.strictEqual(api.decodeMetric(m("o2v2"), "4115" + "96" + "FF"), 0.75);
assert.strictEqual(m("o2t2").parent, "o2v2");
assert.deepStrictEqual([...api.parseSupport("4100BE1FA813\r\r>", 0)].slice(0, 5), [1,3,4,5,6]);
assert.deepStrictEqual([...api.parseSupport("462080000001", 0x20, "46")], [0x21, 0x40]);
const t = api.parseMode06Full("46A50B24000100000064A50C24000200000064\r\r>", 0xA5);
assert.strictEqual(t.length, 2); assert.strictEqual(t[1].val, 2); assert.strictEqual(t[1].pass, true); assert.strictEqual(t[0].name, "Misfire cylinder 4");
assert.strictEqual(api.parseMode06Full("462180240064000000 50".replace(" ", ""), 0x21)[0].pass, false);
assert.strictEqual(api.parseMode06Full("4621802400000000000000", 0x21)[0].pass, null);
const mon = api.parseMonitor([0x82, 0x07, 0xE5, 0x20]);
assert.strictEqual(mon.mil, true); assert.strictEqual(mon.monitors.find(x => x.name === "Oxygen sensor").state, "incomplete");
assert.deepStrictEqual(api.parseDtc("00A\r0:430401710300\r1:03010420000000\r\r>", "43"), ["P0171","P0300","P0301","P0420"]);

// ---- VIN matching uses profile rules; no real VIN in the code
const V = { sierra: { match: { wmi: ["1GT"], year: "G" } }, equinox: { match: { wmi: ["2GN","2CN"], year: "E" } } };
assert.strictEqual(api.matchVehicle("1GTAAAAAAGZ000000", V), "sierra");
assert.strictEqual(api.matchVehicle("2GNAAAAAAE6000000", V), "equinox");
assert.strictEqual(api.matchVehicle("1FTAAAAAAGZ000000", V), null);
assert.strictEqual(api.matchVehicle("SIMULATOR00000000", V), null);

// ---- Layout
for (const cols of [4, 12]) for (let i = 0; i < 100; i++) {
  const items = Array.from({ length: 12 }, (_, k) => ({ id: "w" + k, x: Math.floor(Math.random() * 20) - 4, y: Math.floor(Math.random() * 20), w: 1 + Math.floor(Math.random() * 14), h: 1 + Math.floor(Math.random() * 6) }));
  api.compact(items, cols, "w3");
  items.forEach((a, p) => { assert(a.x >= 0 && a.x + a.w <= cols); items.forEach((b, q) => { if (p < q) assert(!api.overlap(a, b)); }); });
}

// ---- Synthetic drives
const sierra = { name: "Sierra", engine: { L: 5.3, cyl: 8 }, layout: "V", afm: true, afmCyls: [1,4,6,7] };
const four = { name: "Equinox", engine: { L: 2.4, cyl: 4 }, layout: "I" };
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647, noise = a => (rand() - .5) * 2 * a;
function drive(kind, o = {}) {
  const prof = { city: [[0,20,0],[25,90,35],[0,30,0],[32,120,35],[0,45,0],[28,120,35],[0,30,0],[35,180,35],[0,25,0],[30,200,35],[0,40,0],[35,240,35]], interstate: [[0,30,0],[45,120,30],[70,1500,70]], short: [[0,15,0],[25,120,25],[0,10,0]], mixed: [[0,30,0],[32,300,35],[0,30,0],[65,600,70],[0,30,0],[30,300,35]] }[kind];
  const total = prof.reduce((n, p) => n + p[1], 0), rows = [], t0 = 1.7e12; let t = 0, mph = 0, ect = o.warmStart ? 195 : 70, trans = o.warmStart ? 170 : 70;
  for (const [, dur, target] of prof) for (let i = 0; i < dur; i++, t++) {
    const prev = mph; mph += Math.max(-3, Math.min(2.5, target - mph)); if (target && Math.abs(mph - target) < 1) mph = target + noise(.4);
    const acc = mph - prev, ratio = mph >= 62 ? 26 : mph >= 40 ? 36 : mph >= 25 ? 52 : 75;
    let rpm = mph < 1 ? 620 + noise(15) : Math.max(800, mph * ratio + noise(6));
    if (o.scatter && mph >= 40) rpm += noise(180);
    const tps = mph < 1 ? 12 : acc > 1 ? 45 : 19 + noise(.8), load = mph < 1 ? 28 : acc > 1 ? 70 : 42 + noise(2);
    ect = Math.min(o.coolHigh || 205, ect + .55); trans = Math.min(o.transMax || 180, trans + .18);
    const warm = ect >= 170, idle = mph < 1;
    const r = { t: t0 + t * 1000, rpm, mph, tps, load, ect, iat: 70, amb: 65, baro: 99, map: idle ? 34 : 30 + load * .55, maf: idle ? (o.idleMaf || 6) + noise(.2) : rpm * load / 100 * 5.3 / 120 * .75 * 1.0, volt: o.volt ? o.volt + noise(.1) : 14 + noise(.15), fuelstat: warm ? 2 : 1, trans };
    let base1 = 1 + noise(1), base2 = 1 + noise(1);
    if (o.leak) { const a = idle ? 16 : mph >= 40 ? 2 : 6; base1 += a; base2 += a; }
    if (o.lean) { const a = load > 50 ? 18 : mph >= 40 ? 11 : 3; base1 += a; base2 += a; }
    if (o.rich) { base1 -= 15; base2 -= 15; }
    if (o.bank) { base2 += 16; }
    r.stft1 = base1 * .4; r.ltft1 = base1 * .6;
    if (!o.noBank2) { r.stft2 = base2 * .4; r.ltft2 = base2 * .6; }
    if (o.gearOK !== false) { r.gear = mph >= 62 ? 6 : mph >= 40 ? 5 : mph >= 25 ? 4 : 3; }
    if (o.gearBad) r.gear = Math.floor(rand() * 6) + 1;
    r.slip = o.slip !== undefined ? (mph >= 40 ? o.slip + noise(10) : 80 + noise(40)) : (mph >= 40 ? 8 + noise(5) : 60 + noise(30));
    if (o.slipFlat) r.slip = 42;
    for (let c = 1; c <= (o.cyl || 8); c++) r["mis" + c] = 0;
    if (o.mis4) r.mis4 = Math.floor(o.mis4 * (t + 1) / total);
    if (o.misHeld) r.mis4 = o.misHeld;
    rows.push(r);
  }
  if (o.flares) [400, 700, 1000, 1300].forEach(k => { if (rows[k]) { rows[k].rpm += 400; rows[k + 1].rpm += 450; rows[k + 2].rpm += 250; } });
  return rows;
}
const rep = (rows, vehicle = sierra, meta = {}, history = []) => api.analyzeDrive({ rows, vehicle, meta: { codes: { stored: [], pending: [], permanent: [] }, ...meta }, history });
const has = (r, rx, lv) => r.findings.some(f => rx.test(f.title) && (!lv || f.level === lv));
const bad = r => r.findings.filter(f => f.level === "attention" || f.level === "watch").map(f => f.title);

let r = rep(drive("city")); assert.strictEqual(r.trip.kind, "City"); assert.deepStrictEqual(bad(r), [], "city clean " + bad(r)); assert.strictEqual(r.verdict.level, "good");
assert(r.notAssessed.some(n => /load/i.test(n.system)), "city must admit load wasn't tested");
r = rep(drive("interstate")); assert.strictEqual(r.trip.kind, "Interstate / highway"); assert.deepStrictEqual(bad(r), [], "interstate clean " + bad(r)); assert(has(r, /tracked road speed/, "good"));
assert(r.stats.transCruise && r.stats.slipCruise < 20);
r = rep(drive("mixed")); assert.strictEqual(r.trip.kind, "Mixed"); assert.deepStrictEqual(bad(r), [], "mixed clean " + bad(r));
r = rep(drive("short")); assert.strictEqual(r.trip.kind, "Short trip"); assert.deepStrictEqual(bad(r), []); assert(r.notAssessed.some(n => n.system === "Fuel trims"), "short trip can't judge trims");

r = rep(drive("mixed", { leak: true })); assert(has(r, /largest at idle/), "leak " + bad(r));
r = rep(drive("mixed", { lean: true })); assert(has(r, /grows with airflow/), "lean load " + bad(r)); assert(!has(r, /largest at idle/));
r = rep(drive("mixed", { rich: true })); assert(has(r, /Rich correction/), "rich " + bad(r));
r = rep(drive("mixed", { bank: true })); assert(has(r, /Banks disagree/), "bank " + bad(r));
r = rep(drive("interstate", { volt: 12.0 })); assert(has(r, /Charging voltage stayed low/, "attention"), "volt");
r = rep(drive("interstate", { volt: 12.8 })); assert(!bad(r).some(x => /voltage/i.test(x)), "GM low-voltage strategy shouldn't alarm");
r = rep(drive("interstate", { transMax: 232 })); assert(has(r, /above the guide/, "watch"));
r = rep(drive("interstate", { transMax: 255 })); assert(has(r, /very hot/, "attention"));
r = rep(drive("interstate", { coolHigh: 245 })); assert(has(r, /Coolant ran hot/, "attention"));
r = rep(drive("interstate", { coolHigh: 170, transMax: 150 })); assert(has(r, /Coolant stayed low/), "thermostat " + bad(r));
r = rep(drive("interstate", { slip: 70 })); assert(has(r, /Moderate torque converter slip/, "info"), "slip mod " + bad(r));
r = rep(drive("interstate", { slip: 180 })); assert(has(r, /High torque converter slip/, "watch"), "slip high unconfirmed");
r = rep(drive("interstate", { slip: 180, scatter: true })); assert(has(r, /High torque converter slip/, "watch"), "slip capped " + bad(r)); assert(has(r, /wasn't locked/), "ratio scatter");
r = rep(drive("interstate", { flares: true })); assert(has(r, /rpm flare/), "flares " + bad(r));
r = rep(drive("interstate", { mis4: 6 })); assert(has(r, /concentrated on cylinder 4/, "watch")); { const f = r.findings.find(x => /cylinder 4/.test(x.title)); assert(/AFM lifter/.test(f.causes.join()), "AFM link"); assert(/Bank 2/.test(f.evidence), "bank link"); }
r = rep(drive("interstate", { mis4: 30, bank: true })); assert(has(r, /How these findings may connect/), "cross-link");
r = rep(drive("interstate", { misHeld: 25 })); assert(has(r, /No new misfire counts/, "info"), "held counter"); assert(!bad(r).some(x => /Misfire/.test(x)));
r = rep(drive("interstate", { mis4: 800 })); assert(has(r, /concentrated on cylinder 4/, "attention"), "high rate");
assert.strictEqual(api.parseMode06Full("46A10B2400320000000000".slice(0, 20), 0xA1)[0].pass, null);
r = rep(drive("interstate"), sierra, { mode06: [{ mid: 0xA5, name: "Misfire cylinder 4", tid: 12, val: 9, min: 0, max: 1, pass: false }] }); assert(!has(r, /self-test/), "misfire MID neither pass nor fail");
const missing = drive("interstate"); missing.slice(100, 110).forEach(x => delete x.rpm); r = rep(missing); assert(!has(r, /MAP and barometric/), "missing rpm isn't engine off");
const lows = drive("interstate"); lows.slice(200, 400).forEach(x => x.volt = 11.9); r = rep(lows); assert(has(r, /dipped low/, "watch"), "median mustn't hide low voltage");
r = rep(drive("interstate", { coolHigh: 205 })); assert(!has(r, /Coolant stayed low/), "warm-up mustn't read as thermostat");
r = rep(drive("interstate", { gearBad: true })); assert.strictEqual(r.validation.gear, "suspect"); assert(has(r, /Ignored a questionable GM reading: gear/));
r = rep(drive("interstate", { slipFlat: true })); assert.strictEqual(r.validation.slip, "suspect"); assert(!has(r, /torque converter slip/i));
r = rep(drive("interstate", { noBank2: true, cyl: 4 }), four); assert(!has(r, /Banks disagree/)); assert.deepStrictEqual(bad(r), [], "4cyl " + bad(r));
r = rep(drive("interstate", { noBank2: true, cyl: 4 }), { name: "Equinox", engine: null }); assert(r.notAssessed.some(n => /engine/i.test(n.why)), "unknown engine says so");
r = rep(drive("interstate"), sierra, { codes: { stored: ["P0304"], pending: [], permanent: [] } }); assert(has(r, /trouble code/, "attention")); assert(r.findings.find(f => /trouble code/.test(f.title)).evidence.includes("Ignition or misfire"));
r = rep(drive("interstate"), sierra, { mode06: [{ mid: 0x21, name: "Catalyst bank 1", tid: 0x80, val: 100, min: 0, max: 80, pass: false }] }); assert(has(r, /outside the computer's limits/, "attention"));
r = rep(drive("interstate"), sierra, { mode06: [{ mid: 0x21, name: "Catalyst bank 1", tid: 0x80, val: 40, min: 0, max: 80, pass: true }] }); assert(has(r, /within the computer's limits/, "good"));
{ const six = { ...sierra, trans: "6L80 (RPO MYC)", gears: 6 }, d = drive("interstate", { transMax: 255 }); r = rep(d, six); assert(r.findings.find(f => /very hot/.test(f.title)).next.join().includes("6L80")); d.forEach(x => x.gear = 8); r = rep(d, six); assert.strictEqual(r.validation.gear, "suspect", "6-speed can't report gear 8"); }
assert.strictEqual(api.analyzeDrive({ rows: [] }).verdict.level, "nodata");
// Baseline only compares same kind of drive
const past = [1, 2, 3].map(i => ({ id: "h" + i, review: { stats: { kind: "Interstate / highway", transPeak: 170, ectPlateau: 205, mpg: 20 } } }));
r = rep(drive("interstate", { transMax: 200 }), sierra, {}, past); assert(has(r, /Peak transmission temperature changed/), "baseline " + bad(r));
const cityPast = past.map(p => ({ ...p, review: { stats: { ...p.review.stats, kind: "City" } } }));
r = rep(drive("interstate", { transMax: 200 }), sierra, {}, cityPast); assert(!has(r, /changed from your normal/)); assert(r.notAssessed.some(n => n.system === "Baseline comparison"));
assert(api.reportMarkdown(rep(drive("city")), sierra, { start: 1.7e12 }).includes("Drive review: Sierra"));
for (const x of api.METRICS.filter(x => x.cmd && x.basis === "standard" && !x.pid)) assert(x.raw, x.id);
assert(!/1GTV2MEC/.test(html), "Real VIN must not ship in the public file");
console.log("all tests passed");
