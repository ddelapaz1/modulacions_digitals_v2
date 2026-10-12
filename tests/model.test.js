// Proves del model: node tests/model.test.js
'use strict';
const L = require('../js/model.js');

let failures = 0, passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error('✗ ' + msg); }
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const P = { Ts: 1, fc: 5, df: 1 };

// --- Validació d'entrades (criteri 9)
check(L.parseBits('1010 11\n01').ok && L.parseBits('1010 11\n01').bits === '10101101', 'espais i salts de línia com a separadors');
check(!L.parseBits('').ok, 'entrada buida rebutjada');
check(!L.parseBits('   \n ').ok, 'entrada només amb espais rebutjada');
check(!L.parseBits('10a2').ok && /«a», «2»/.test(L.parseBits('10a2').error), 'caràcters no vàlids identificats');
check(!L.parseBits('1'.repeat(97)).ok, 'més de 96 bits rebutjats');
check(L.parseBits('1'.repeat(96)).ok && L.parseBits('1').ok, '1 i 96 bits acceptats');

// --- Agrupació i farciment (criteri 1)
for (const v of L.VARIANTS) {
  for (const n of [1, 5, 7, 24, 23, 96]) {
    const bits = Array.from({ length: n }, (_, i) => (i * 7 + 3) % 5 > 2 ? '1' : '0').join('');
    const R = L.compute(bits, v.mod, v.M, P);
    const k = Math.log2(v.M);
    check(R.k === k, `${v.key}: k = log2(M)`);
    check(R.symbols.every(s => s.bits.length === k), `${v.key}/${n}: cada símbol té k bits`);
    check(R.nPad === (k - n % k) % k && R.padded.length % k === 0, `${v.key}/${n}: farciment correcte`);
    check(R.padded.startsWith(bits) && R.bits === bits, `${v.key}/${n}: seqüència original conservada`);
    const padCount = R.symbols.reduce((a, s) => a + s.padMask.filter(Boolean).length, 0);
    check(padCount === R.nPad, `${v.key}/${n}: bits de farciment marcats`);
    // Durades i taxes (criteri 7)
    check(near(R.Ttotal, R.nSym * P.Ts) && near(R.Rs, 1000 / P.Ts) && near(R.Rb, k * R.Rs), `${v.key}: taxes coherents`);
    // Mostres per cicle
    check(R.samplesPerCycle >= 40, `${v.key}: >= 40 mostres per cicle`);
    // Coherència símbol <-> alfabet (criteri 6)
    check(R.symbols.every(s => s.state === R.alphabet[s.m] && s.state.bits === s.bits), `${v.key}: bits ↔ estat`);
  }
}

// --- ASK (criteri 2)
{
  const R2 = L.compute('01', 'ASK', 2, P);
  check(R2.alphabet[0].A === 0 && R2.alphabet[1].A === 1, 'OOK: 0→0, 1→1');
  check(R2.alphabet[0].phaseDeg === null, 'OOK: fase no observable amb A=0');
  const R4 = L.compute('00011011', 'ASK', 4, P);
  [0, 1 / 3, 2 / 3, 1].forEach((a, m) => check(near(R4.alphabet[m].A, a), `4-ASK nivell ${m}`));
  // amplitud mesurada del senyal en cada símbol
  R4.symbols.forEach(sym => {
    let mx = 0;
    for (let j = 0; j < R4.per; j++) mx = Math.max(mx, Math.abs(R4.s[sym.n * R4.per + j]));
    check(near(mx, sym.state.A, 1e-3), `4-ASK amplitud mesurada símbol ${sym.n}`);
  });
  // portadora contínua amb temps global (no es reinicia)
  const sym = R4.symbols[2];
  check(near(L.valueAt(R4, sym, 2.13), (2 / 3) * Math.cos(2 * Math.PI * 5 * 2.13)), '4-ASK usa temps global');
}

// --- FSK (criteri 3)
{
  const R = L.compute('00011011', 'FSK', 4, P);
  [3.5, 4.5, 5.5, 6.5].forEach((f, m) => check(near(R.alphabet[m].f, f), `4-FSK to ${m} = ${f} kHz`));
  const R2 = L.compute('01', 'FSK', 2, P);
  check(near(R2.alphabet[0].f, 4.5) && near(R2.alphabet[1].f, 5.5), '2-FSK tons');
  check(R.symbols.every(s => s.state.A === 1), 'FSK amplitud constant');
  // continuïtat de fase en cada límit de símbol
  for (let n = 1; n < R.nSym; n++) {
    const endPrev = R.s[(n - 1) * R.per + R.sps], startNext = R.s[n * R.per];
    check(near(endPrev, startNext, 1e-9), `FSK continuïtat al límit ${n}`);
  }
  // freqüències sempre positives (Δf limitat)
  const Rlim = L.compute('00011011', 'FSK', 4, { Ts: 1, fc: 1, df: 4 });
  check(Rlim.dfClamped && Rlim.alphabet.every(a => a.f > 0), 'FSK Δf limitat: tons positius');
  // freqüència instantània: comptar passos per zero dins d'un símbol
  const sym = R.symbols[3]; // 11 → 6,5 kHz
  let crossings = 0;
  for (let j = 1; j <= R.sps; j++) {
    const a = R.s[sym.n * R.per + j - 1], b = R.s[sym.n * R.per + j];
    if ((a < 0) !== (b < 0)) crossings++;
  }
  check(Math.abs(crossings - 2 * 6.5) <= 1, 'FSK: passos per zero coherents amb el to');
}

// --- PSK (criteri 4)
{
  const expect = { 2: [0, 180], 4: [0, 90, 180, 270], 8: [0, 45, 90, 135, 180, 225, 270, 315] };
  for (const M of [2, 4, 8]) {
    const bits = Array.from({ length: M }, (_, m) => m.toString(2).padStart(Math.log2(M), '0')).join('');
    const R = L.compute(bits, 'PSK', M, P);
    R.alphabet.forEach((a, m) => check(near(a.phaseDeg, expect[M][m]) && a.A === 1, `PSK M=${M} fase ${m}`));
    R.symbols.forEach(sym => {
      let mx = 0;
      for (let j = 0; j < R.per; j++) mx = Math.max(mx, Math.abs(R.s[sym.n * R.per + j]));
      check(near(mx, 1, 1e-3), `PSK M=${M} amplitud constant símbol ${sym.n}`);
      check(near(R.s[sym.n * R.per], Math.cos(2 * Math.PI * 5 * sym.t0 + sym.state.phi)), `PSK M=${M} fase aplicada`);
    });
  }
}

// --- QAM (criteri 5)
{
  const all16 = Array.from({ length: 16 }, (_, m) => m.toString(2).padStart(4, '0')).join('');
  const R = L.compute(all16, 'QAM', 16, P);
  const pts = new Set(R.alphabet.map(a => (a.I * Math.sqrt(10)).toFixed(6) + ',' + (a.Q * Math.sqrt(10)).toFixed(6)));
  check(pts.size === 16, '16-QAM: 16 punts diferents');
  const lv = [-3, -1, 1, 3];
  check(R.alphabet.every(a => lv.includes(Math.round(a.I * Math.sqrt(10))) && lv.includes(Math.round(a.Q * Math.sqrt(10)))), '16-QAM: graella ±1, ±3 /√10');
  check(R.alphabet[0b1001].levelI === 1 && R.alphabet[0b1001].levelQ === -1, '16-QAM: 10→+1 (I), 01→−1 (Q)');
  check(R.alphabet[0b0011].levelI === -3 && R.alphabet[0b0011].levelQ === 3, '16-QAM: 00→−3, 11→+3');
  check(R.distinctAmplitudes.length === 3, '16-QAM: 3 amplituds diferents');
  R.symbols.forEach(sym => {
    const st = sym.state;
    [0, 0.137, 0.5, 0.91].forEach(fr => {
      const tt = sym.t0 + fr * P.Ts;
      const exp = st.I * Math.cos(2 * Math.PI * 5 * tt) - st.Q * Math.sin(2 * Math.PI * 5 * tt);
      check(near(L.valueAt(R, sym, tt), exp), `16-QAM senyal símbol ${sym.n}`);
      check(near(exp, st.A * Math.cos(2 * Math.PI * 5 * tt + st.phi)), `16-QAM A·cos(ωt+φ) ≡ I·cos − Q·sin`);
    });
  });
  const R4 = L.compute('00011011', 'QAM', 4, P);
  check(R4.alphabet.every(a => near(Math.abs(a.I), Math.SQRT1_2) && near(Math.abs(a.Q), Math.SQRT1_2) && near(a.A, 1)), '4-QAM ±1/√2');
  check(R4.alphabet[0b10].I > 0 && R4.alphabet[0b10].Q < 0, '4-QAM: 1r bit → I, 2n bit → Q');
}

// --- Disposició natural / Gray
{
  const G = Object.assign({}, P, { mapping: 'gray' });
  const hd = (a, b) => { let x = a ^ b, c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  check([0, 1, 2, 3, 4, 5, 6, 7].every(i => L.grayInverse(L.gray(i)) === i), 'grayInverse és la inversa de gray');
  // 4-ASK: nivells consecutius difereixen en 1 bit
  const A = L.compute('00011011', 'ASK', 4, G);
  const byLevel = A.alphabet.slice().sort((a, b) => a.A - b.A).map(a => a.m);
  check(byLevel.join() === [0, 1, 3, 2].join(), '4-ASK Gray: 00, 01, 11, 10 per amplitud creixent');
  check(byLevel.every((m, i) => i === 0 || hd(m, byLevel[i - 1]) === 1), '4-ASK Gray: veïns a 1 bit');
  // PSK: fases consecutives (circulars) difereixen en 1 bit
  for (const M of [4, 8]) {
    const R = L.compute('0'.repeat(Math.log2(M)), 'PSK', M, G);
    const order = R.alphabet.slice().sort((a, b) => a.phaseDeg - b.phaseDeg).map(a => a.m);
    check(order.every((m, i) => hd(m, order[(i + 1) % M]) === 1), `PSK M=${M} Gray: fases veïnes a 1 bit`);
    check(R.alphabet.every(a => Math.abs(a.phaseDeg - 360 * a.pos / M) < 1e-9 && L.gray(a.pos) === a.m), `PSK M=${M} Gray: φ = 360·i/M amb gray(i) = m`);
  }
  // 16-QAM: punts adjacents de la graella difereixen en 1 bit
  const Q = L.compute('0000', 'QAM', 16, G);
  const at = {};
  Q.alphabet.forEach(a => { at[a.levelI + ',' + a.levelQ] = a.m; });
  check(Object.keys(at).length === 16, '16-QAM Gray: 16 punts diferents');
  let ok = true;
  for (const i of [-3, -1, 1, 3]) for (const q of [-3, -1, 1, 3]) {
    if (i < 3 && hd(at[i + ',' + q], at[(i + 2) + ',' + q]) !== 1) ok = false;
    if (q < 3 && hd(at[i + ',' + q], at[i + ',' + (q + 2)]) !== 1) ok = false;
  }
  check(ok, '16-QAM Gray: veïns horitzontals i verticals a 1 bit');
  check(Q.alphabet[0b1001].levelI === 3 && Q.alphabet[0b1001].levelQ === -1, '16-QAM Gray: 10 → +3 (I), 01 → −1 (Q)');
  check(Q.alphabet[0b1101].levelI === 1, '16-QAM Gray: 11 → +1 a l’eix I');
  // la disposició natural té almenys un parell de veïns que difereixen en 2 bits
  const N = L.compute('0000', 'QAM', 16, P);
  check(N.alphabet[0b0100].levelI === -1 && N.alphabet[0b1000].levelI === 1 && hd(0b01, 0b10) === 2, '16-QAM natural: −1 (01) i +1 (10) difereixen en 2 bits');
  // M = 2 i 4-QAM: les dues disposicions coincideixen
  for (const [mod, M] of [['ASK', 2], ['PSK', 2], ['QAM', 4]]) {
    const a = L.compute('0110', mod, M, P), b = L.compute('0110', mod, M, G);
    check(a.alphabet.every((s, i) => s.I === b.alphabet[i].I && s.Q === b.alphabet[i].Q) && !L.mappingDiffers(mod, M), `${mod} M=${M}: natural = Gray`);
  }
  // FSK no es veu afectada
  const F1 = L.compute('0110', 'FSK', 4, P), F2 = L.compute('0110', 'FSK', 4, G);
  check(F2.mapping === 'natural' && F1.alphabet.every((s, i) => s.f === F2.alphabet[i].f), 'FSK ignora la disposició');
  // el senyal Gray segueix sent coherent amb l’estat
  const sym = Q.symbols[0];
  check(near(Q.s[0], sym.state.I * Math.cos(0) - 0), '16-QAM Gray: senyal coherent');
}

// --- Símbol per temps
{
  const R = L.compute(L.DEFAULT_BITS.replace(/\s/g, ''), 'QAM', 16, P);
  check(L.symbolAtTime(R, 0) === 0 && L.symbolAtTime(R, 2.5) === 2 && L.symbolAtTime(R, R.Ttotal) === R.nSym - 1, 'symbolAtTime');
  check(L.parseBits(L.DEFAULT_BITS).bits.length === 24, 'seqüència inicial de 24 bits');
}

console.log(`${passes} comprovacions correctes, ${failures} errors`);
process.exit(failures ? 1 : 0);
