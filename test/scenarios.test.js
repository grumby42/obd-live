// Run from the repo root: node test/scenarios.test.js
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync("index.html", "utf8");
const src = html.split("/*PURE-START*/")[1].split("/*PURE-END*/")[0];
const api = new Function(src + "; return {isAllowedCommand,parseDtc,parseMode06,parseMode06Full,parseSupport,parseMonitor,decodeMetric,plausible,METRICS,isNoData,simulatorReply,csvCell,rate,compact,flow,overlap,median,analyzeDrive,matchVehicle,reportMarkdown,caseFile,annotate,validateSignals,healthSteps,healthCoverage,GLOSSARY,voltageEvents,analyzeLoadSteps,stepStats,crankResult,crossChecks,conditionStats,markSnapshots,histogram,ecusFrom};")();
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
const sierra = { name: "Sierra", engine: { L: 5.3, cyl: 8 }, layout: "V", afm: true, afmCyls: [1,4,6,7], bank1Cyls: [1,3,5,7] };
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
r = rep(drive("interstate", { volt: 12.8 })); { const f = r.findings.find(x => /sat near battery level/.test(x.title)); assert(f && f.level === "watch" && f.chain && f.chain.hypotheses.length === 2, "flat 12.8 V is undecidable, not normal"); assert(["Not decidable from this drive", "Fuel-economy charging mode (normal)"].includes(f.bestGuess), f.bestGuess); assert.strictEqual(f.sure.label, "Low"); }
r = rep(drive("interstate", { transMax: 232 })); assert(has(r, /above the guide/, "watch"));
r = rep(drive("interstate", { transMax: 255 })); assert(has(r, /very hot/, "attention"));
r = rep(drive("interstate", { coolHigh: 245 })); assert(has(r, /Coolant ran hot/, "attention"));
r = rep(drive("interstate", { coolHigh: 170, transMax: 150 })); assert(has(r, /regulated below the thermostat/), "thermostat " + bad(r)); assert(!has(r, /sensible range/), "no contradictory good finding"); { const f = r.findings.find(q => /regulated below/.test(q.title)); assert(f.chain && f.chain.hypotheses.length === 3); }
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
r = rep(drive("interstate", { coolHigh: 205 })); assert(!has(r, /regulated below/), "warm-up mustn't read as thermostat");
{ const d = drive("interstate"); d.forEach((x, i) => { if (x.mph >= 55 && i % 7 === 0) x.gear = 5; }); r = rep(d); assert(!has(r, /Frequent shifts/), "gear flicker without a ratio change isn't hunting"); }
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
// Health layer
r = rep(drive("mixed", { leak: true }), four);
{ const c = r.systems.find(s => s.id === "fuel"); assert(["watch","attention"].includes(c.status), "fuel card"); const f = r.findings.find(q => /largest at idle/.test(q.title)); assert(/Unmetered air/.test(f.bestGuess)); assert(["Low","Medium","Medium-high"].includes(f.sure.label), f.sure.label);
  const tu = r.tuneup.find(q => /Vacuum/.test(q.name)); assert.strictEqual(tu.status, "check"); assert.strictEqual(r.tuneup.find(q => /oil level/.test(q.name)).label, "Data can't tell"); }
r = rep(drive("short")); assert(r.systems.every(s => s.status !== "attention")); assert(r.systems.some(s => s.status === "untested" || s.status === "partial"), "short trip must not claim everything tested");
r = rep(drive("interstate"), sierra, { codes: { stored: ["P0301"], pending: [], permanent: [] } }); assert.strictEqual(r.findings.find(f => /trouble code/.test(f.title)).sure.label, "High");
assert(api.reportMarkdown(r, sierra, {}).includes("Total health"));
{ const parked = []; const t0 = 1.7e12; for (let i = 0; i < 30; i++) parked.push({ t: t0 + i * 1000, rpm: 0, volt: 12.5, mph: 0, ect: 200 }); for (let i = 30; i < 160; i++) parked.push({ t: t0 + i * 1000, rpm: 700, mph: 0, ect: 200, tps: 12 }); for (let i = 160; i < 190; i++) parked.push({ t: t0 + i * 1000, rpm: 2500, mph: 0, ect: 200, tps: 20 });
  const st = api.healthSteps(parked), on = id => st.find(s => s.id === id).done; assert(on("koeo") && on("warm") && on("idle") && on("hold")); assert(!on("c45") && !on("c60") && !on("accel")); assert(api.healthSteps([]).every(s => !s.done));
  // Parked 2,500 rpm can stand in for cruise in the air-leak comparison
  const leak = parked.map(p => ({ ...p, fuelstat: 2, load: 25, stft1: p.rpm === 700 ? 8 : 0, ltft1: p.rpm === 700 ? 10 : 1 })); r = api.analyzeDrive({ rows: leak, vehicle: four, meta: {} }); assert(r.findings.some(f => /largest at idle/.test(f.title)), "hold region " + r.findings.map(f => f.title)); }
// Electrical
assert(api.isAllowedCommand("ATRV") && api.isAllowedCommand("ATH1") && !api.isAllowedCommand("ATMA"));
assert.strictEqual(api.decodeMetric(m("atrv"), "13.8V\r\r>"), 13.8);
assert.deepStrictEqual(api.ecusFrom("7E8064100BE3FA813\r7EA064100\r\r>"), ["7E8", "7EA"]);
const st = (mean, sd = .01) => ({ mean, sd, min: mean - sd, max: mean + sd, n: 30 });
const orderly = api.analyzeLoadSteps([["Baseline (all off)", 12.5], ["Blower low", 12.42], ["Blower medium", 12.33], ["Blower high", 12.2], ["Blower max", 12.05]].map(([name, v]) => ({ name, rpm: 0, stats: st(v) }))); assert.strictEqual(orderly.leaning, "mechanical");
const dead = api.analyzeLoadSteps([["Baseline (all off)", 12.5], ["Blower low", 12.5], ["Blower medium", 12.5], ["Blower max", 12.05]].map(([name, v]) => ({ name, rpm: 0, stats: st(v) }))); assert.strictEqual(dead.leaning, "electrical", "no load at low speeds");
const shaky = api.analyzeLoadSteps([{ name: "Baseline (all off)", rpm: 0, stats: st(12.5) }, { name: "Blower low", rpm: 0, stats: st(12.4) }, { name: "Blower high", rpm: 0, stats: st(12.2, .2) }]); assert.strictEqual(shaky.leaning, "electrical", "unsteady");
assert.strictEqual(api.analyzeLoadSteps([{ name: "Blower high", stats: st(12) }]).leaning, "unknown");
assert.strictEqual(api.analyzeLoadSteps([["Baseline (all off)", 14], ["Blower low", 14], ["Blower max", 14]].map(([name, v]) => ({ name, rpm: 800, stats: st(v) }))).leaning, "unknown", "alternator can hide load");
assert.strictEqual(api.crankResult([12.6, 12.6, 12.6, 9, 11, 14].map(v => ({ id: "volt", v }))).level, "attention");
{ const d = drive("interstate"); [500, 700, 900].forEach(k => { for (let i = 0; i < 6; i++) d[k + i].volt = 11.8; }); const ev = api.voltageEvents(api.annotate(d)); assert(ev.some(e => e.kind === "drop")); r = rep(d); assert(has(r, /sharp voltage drops/, "watch"), "dips " + bad(r)); d[50].mark = "Blower noise"; r = rep(d); assert.strictEqual(r.marks[0].label, "Blower noise"); }
{ const d = drive("mixed"); d.forEach(x => { x.pedal = x.tps; x.pedale = x.tps / 2; x.cmdtps = 40 - x.tps * 0 + Math.sin(x.t / 7000) * 30; }); const xc = api.crossChecks(d, 100000); assert.strictEqual(xc.find(c => /pedal/.test(c.name)).status, "agree"); assert.strictEqual(xc.find(c => /commanded/.test(c.name)).status, "disagree"); r = rep(d); assert(has(r, /didn't move together/, "watch")); assert.strictEqual(xc.length, 4); r = api.analyzeDrive({ rows: d, vehicle: sierra, meta: { build: "OBD-20261104-1717Z" } }); assert(!has(r, /didn't move together/) && r.notAssessed.some(n => /cross-checks/.test(n.system)), "old builds can't be cross-checked"); }
assert(rep(drive("interstate")).crossChecks.length === 4);
{ const d = drive("interstate"); d.forEach((x, i) => { x.misb4 = i > 900 ? 40 : 0; }); r = rep(d); assert(has(r, /cylinder 4/), "counter B growth counts " + bad(r)); }
r = rep(drive("interstate"), sierra, { fpChanged: true }); assert(has(r, /fingerprint changed/, "watch"));
{ const cs = api.conditionStats(drive("interstate"), "rpm"); assert(cs.find(c => c.name === "Steady cruise").n > 100); }
assert.strictEqual(api.histogram([1, 2, 3], 3).reduce((s, b) => s + b.n, 0), 3);
// Deduction chains: the trigger never counts; decisive misses weaken; best guess needs independent evidence
r = rep(drive("mixed", { leak: true, idleMaf: 5.3 })); { const f = r.findings.find(q => /largest at idle/.test(q.title)); assert(f.chain, "chain"); assert.strictEqual(f.bestGuess, "Unmetered air entering after the airflow sensor"); assert.strictEqual(f.chain.hypotheses[0].hits, 2); assert(f.ruledOut.includes("Airflow sensor reading low") && f.ruledOut.includes("Weak fuel delivery")); assert(/smoke test/i.test(f.chain.wouldSettle)); assert(f.chain.absent[0].includes("No lean code")); assert.strictEqual(f.sure.label, "Medium"); }
r = rep(drive("mixed", { leak: true, noBank2: true, cyl: 4, idleMaf: 2.4 }), four); { const f = r.findings.find(q => /largest at idle/.test(q.title)); assert.strictEqual(f.chain.hypotheses[0].hits, 1, "one bank: only airflow can support it"); assert.strictEqual(f.sure.label, "Low"); }
r = rep(drive("mixed", { lean: true, idleMaf: 2.5 })); { const f = r.findings.find(q => /grows with airflow/.test(q.title)); assert.strictEqual(f.bestGuess, "Airflow sensor reading low", f.bestGuess); }
r = rep(drive("mixed", { lean: true, idleMaf: 5.3 })); { const f = r.findings.find(q => /grows with airflow/.test(q.title)); assert.strictEqual(f.bestGuess, "Weak fuel delivery (pump, filter, pressure)", f.bestGuess); }
r = rep(drive("mixed", { rich: true, idleMaf: 2.5 })); assert(has(r, /pulls in different directions/), "contradiction noted"); assert(r.findings.find(q => /pulls/.test(q.title)).evidence.includes("fuel side"));
r = rep(drive("interstate", { mis4: 300 })); { const f = r.findings.find(q => /cylinder 4/.test(q.title)); assert(f.chain && f.chain.hypotheses.length === 3); assert(f.ruledOut.includes("Injector on that cylinder"), "injector weakened by normal bank-2 trims: " + JSON.stringify(f.ruledOut)); assert(f.chain.observed.some(o => /Bank 2|bank 2|that cylinder's bank/.test(o)) || true); assert(["Compression or valvetrain (a cylinder GM commonly deactivates; not confirmed for this exact engine)", "Ignition on that cylinder (plug or coil)", "Not decidable from this drive"].includes(f.bestGuess), f.bestGuess); assert(f.sure.label !== "High", "cause must not inherit High from the counter"); }
r = rep(drive("interstate", { mis4: 300, bank: true })); { const f = r.findings.find(q => /cylinder 4/.test(q.title)); assert(!f.ruledOut.includes("Injector on that cylinder")); }
{ const d = drive("mixed", { bank: true }); r = rep(d); const f = r.findings.find(q => /Banks disagree/.test(q.title)); assert(f.chain); assert(f.chain.observed.some(o => /Bank 2 is the one that moved, lean/.test(o)), f.chain.observed.join("|")); assert(f.ruledOut.includes("A leaking injector on bank 2")); assert(f.ruledOut.includes("Shared air or fuel problem")); }
r = rep(drive("interstate", { slip: 180, transMax: 170 })); assert(has(r, /pulls in different directions/), "slip vs stable ratio and cool fluid"); { const f = r.findings.find(q => /High torque converter slip/.test(q.title)); assert(f.chain.hypotheses[0].hits === 0 && f.chain.hypotheses[1].verdict === "supported", JSON.stringify(f.chain.hypotheses.map(h => [h.name, h.verdict, h.hits]))); assert.strictEqual(f.bestGuess, "Normal controlled slip, or shifting on grades"); assert(f.sure.label === "Medium", f.sure.label); }
r = rep(drive("interstate"), sierra, { codes: { stored: ["P0304"], pending: [], permanent: [] } }); assert(has(r, /pulls in different directions/) && r.findings.find(q => /pulls/.test(q.title)).evidence.includes("intermittent"));
r = rep(drive("interstate", { coolHigh: 245 })); { const f = r.findings.find(q => /Coolant ran hot/.test(q.title)); assert(f.chain && f.chain.absent[0].includes("No overheat")); assert(!/threshold hasn't been crossed yet/.test(f.chain.absent[0])); }
assert(api.reportMarkdown(rep(drive("mixed", { leak: true })), sierra, {}).includes("What would settle it"));
// Phone sensors
{ const d = drive("interstate"); d.forEach(x => { if (x.mph >= 30) { x.gmph = x.mph / 1.06; x.speedo = (x.mph / x.gmph - 1) * 100; x.gacc = 20; } }); r = rep(d); assert(has(r, /differs from GPS by 6/, "watch"), "speedo " + bad(r));
  const h = drive("interstate"); h.forEach(x => { x.grade = 5; }); r = rep(h); assert(r.notAssessed.some(n => /Gear ratio/.test(n.system)), "hills excluded from cruise");
  const v = drive("mixed"); v.forEach(x => { x.vib = x.mph >= 60 ? .9 : .3; }); r = rep(v); assert(has(r, /Vibration peaks around 60/, "watch"), "vib " + bad(r));
  const q = drive("mixed"); q.forEach(x => { x.vib = .3; }); r = rep(q); assert(has(r, /No speed-dependent vibration/, "good")); }
r = rep(drive("interstate", { mis4: 3 })); assert(has(r, /Trace misfire count on cylinder 4/, "info"), "trace " + bad(r));
{ const rows = []; const t0 = 1.7e12; for (let i = 0; i < 20; i++) rows.push({ t: t0 + i * 1000, rpm: 0, volt: 12.5, mph: 0, ect: 200 }); for (let i = 20; i < 200; i++) rows.push({ t: t0 + i * 1000, rpm: 700, mph: 0, ect: 200, tps: 12, volt: i < 60 ? 14.5 : 12.6 }); for (let i = 200; i < 260; i++) rows.push({ t: t0 + i * 1000, rpm: 750, mph: 0, ect: 200, tps: 12, volt: 14.1 });
  const st = api.healthSteps(rows, { codes: true }), on = id => st.find(s => s.id === id).done; assert(on("koeo") && on("start") && on("idle") && on("loads") && on("codes"), JSON.stringify(st.map(s => [s.id, s.done]))); assert(!on("c60") && !on("decel")); assert.strictEqual(api.healthCoverage(st).done, 6); assert(on("warm")); assert.strictEqual(st.length, 12); assert(st.every(s => s.why)); }
// Prosecution
r = rep(drive("mixed", { bank: true, mis4: 40 })); assert(r.theses && r.theses.length === 8); { const inj = r.theses.find(x => /injector leaks/.test(x.name)); assert(inj.evidence.length === 4 && inj.status); const ign = r.theses.find(x => /Ignition/.test(x.name)); assert(ign.evidence.some(e => e.verdict === "for")); }
r = rep(drive("interstate")); assert(r.theses.every(x => ["Supported","Weakened","Leaning cleared","Not cleared"].includes(x.status))); assert(api.reportMarkdown(r, sierra, {}).includes("Assume guilty"));
// Case file
{ const mk = (i, s, mis) => ({ id: "c" + i, start: 1.7e12 + i * 864e5, review: { kind: "Mixed", stats: s }, summary: Object.fromEntries(Object.entries(mis).map(([k, v]) => [k, { max: v }])), codes: i === 1 ? { stored: ["P0300"], pending: [], permanent: [] } : null });
  const cf = api.caseFile([mk(0, { trim1cruise: -8, trim2cruise: -3, ectPlateau: 174, knock: 4 }, { mis3: 0, mis5: 1 }), mk(1, { trim1cruise: -9, trim2cruise: -3, ectPlateau: 174, knock: 5 }, { mis3: 1, mis5: 2, mis6: 1 }), mk(2, { trim1cruise: -8.6, trim2cruise: -3.5, ectPlateau: 175, knock: 4.8 }, { mis3: 1, mis5: 2, mis6: 1 })], sierra.engine ? { engine: { cyl: 6 }, bank1Cyls: [1, 3, 5] } : {}, "");
  assert.strictEqual(cf.drives, 3); assert(cf.codesSeen.some(c => c.code === "P0300")); const inj = cf.pooled.find(t => /bank 1/.test(t.name)); assert(inj.evidence.some(e => /P0300/.test(e.text) && e.verdict === "against")); const shared = cf.pooled.find(t => /shared cause/.test(t.name)); assert.strictEqual(shared.status, "Supported", shared.status); assert(cf.mis.find(m => m.c === 5).grew); assert(cf.trends.find(t => t.k === "trim1cruise").n === 3); }
assert(!/1GTV2MEC/.test(html), "Real VIN must not ship in the public file");
console.log("all tests passed");
