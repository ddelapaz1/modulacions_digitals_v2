/*
 * Laboratori de modulacions digitals — model de càlcul.
 * Unitats internes: temps en ms, freqüències en kHz (kHz · ms = cicles).
 * Funciona al navegador (window.ModLab) i a Node (module.exports) per a les proves.
 */
(function (global) {
  'use strict';

  const MAX_BITS = 96;
  const SAMPLES_PER_CYCLE = 48; // >= 40 mostres per cicle de la freqüència màxima
  const MIN_TONE = 0.5;         // kHz: to FSK mínim permès (evita freqüències nul·les o negatives)
  const DEFAULT_BITS = '11010010 11100011 01011000';

  const MODULATIONS = {
    ASK: { orders: [2, 4] },
    FSK: { orders: [2, 4] },
    PSK: { orders: [2, 4, 8] },
    QAM: { orders: [4, 16] },
  };

  const VARIANTS = [];
  Object.keys(MODULATIONS).forEach(mod => MODULATIONS[mod].orders.forEach(M => VARIANTS.push({ key: mod + '-' + M, mod, M })));

  function variantName(mod, M) {
    if (mod === 'ASK') return M === 2 ? '2-ASK (OOK)' : M + '-ASK';
    if (mod === 'PSK') return M === 2 ? 'BPSK' : M === 4 ? 'QPSK' : M + '-PSK';
    return M + '-' + mod;
  }

  /** Valida el text introduït. Accepta 0, 1 i espais o salts de línia com a separadors. */
  function parseBits(text) {
    const raw = String(text == null ? '' : text);
    const invalid = [];
    let firstPos = -1;
    let bits = '';
    let pos = 0;
    for (const ch of raw) {
      pos++;
      if (ch === '0' || ch === '1') bits += ch;
      else if (/\s/.test(ch)) continue;
      else {
        if (firstPos < 0) firstPos = pos;
        if (!invalid.includes(ch)) invalid.push(ch);
      }
    }
    if (invalid.length) {
      const list = invalid.slice(0, 6).map(c => '«' + c + '»').join(', ') + (invalid.length > 6 ? '…' : '');
      return {
        ok: false, bits,
        error: 'Només es poden escriure els dígits 0 i 1. Hi ha caràcters no vàlids: ' + list +
          ' (el primer és a la posició ' + firstPos + '). Pots separar els bits amb espais o salts de línia.',
      };
    }
    if (!bits.length) return { ok: false, bits, error: 'El camp és buit. Escriu almenys 1 bit (0 o 1) o fes servir «Bits aleatoris».' };
    if (bits.length > MAX_BITS) {
      return { ok: false, bits, error: 'Has escrit ' + bits.length + ' bits i el màxim és ' + MAX_BITS + '. Elimina’n ' + (bits.length - MAX_BITS) + '.' };
    }
    return { ok: true, bits, error: null };
  }

  /** Separació màxima entre tons perquè el to més baix sigui >= MIN_TONE (en passos de 0,25 kHz). */
  function maxDf(fc, M) {
    const half = (M - 1) / 2;
    return Math.max(0.25, Math.floor(((fc - MIN_TONE) / half) / 0.25) * 0.25);
  }

  function clean(x) { return Math.abs(x) < 1e-12 ? 0 : x; }

  /** Codi Gray de la posició i. */
  function gray(i) { return i ^ (i >> 1); }
  /** Posició i que té el codi Gray g (inversa de gray). */
  function grayInverse(g) { let i = g; while ((g >>= 1)) i ^= g; return i; }
  /** Modulacions amb constel·lació, on es pot triar la disposició natural o Gray (FSK no). */
  function hasMapping(mod) { return mod === 'ASK' || mod === 'PSK' || mod === 'QAM'; }
  /** Les dues disposicions només difereixen si algun eix té més de dos nivells. */
  function mappingDiffers(mod, M) { return hasMapping(mod) && !(M === 2 || (mod === 'QAM' && M === 4)); }

  const QAM16_LEVELS = [-3, -1, 1, 3];

  /**
   * Estat (paràmetres del senyal) associat al valor m d'un grup de bits.
   * p.mapping: 'natural' (posició i = m) o 'gray' (posició i amb gray(i) = m), només ASK/PSK/QAM.
   */
  function symbolState(mod, M, m, p) {
    const k = Math.round(Math.log2(M));
    const bits = m.toString(2).padStart(k, '0');
    const isGray = p.mapping === 'gray' && hasMapping(mod);
    const pos = isGray ? grayInverse(m) : m;   // posició a la constel·lació (ordre geomètric)
    const s = { m, bits, mod, M, pos };
    if (mod === 'ASK') {
      s.A = pos / (M - 1);
      s.phi = 0;
      s.I = s.A; s.Q = 0;
      s.f = p.fc;
      s.phaseDeg = s.A > 0 ? 0 : null; // amb A = 0 la fase no és observable
    } else if (mod === 'FSK') {
      s.f = p.fc + (m - (M - 1) / 2) * p.df;
      s.A = 1;
      s.offset = s.f - p.fc;
    } else if (mod === 'PSK') {
      s.A = 1;
      s.phi = 2 * Math.PI * pos / M;
      s.phaseDeg = 360 * pos / M;
      s.I = clean(Math.cos(s.phi));
      s.Q = clean(Math.sin(s.phi));
      s.f = p.fc;
    } else if (mod === 'QAM') {
      if (M === 4) {
        s.levelI = bits[0] === '1' ? 1 : -1;
        s.levelQ = bits[1] === '1' ? 1 : -1;
        s.norm = Math.SQRT2;
      } else {
        // cada eix: 2 bits → índex de nivell 0..3 (natural o Gray) → −3, −1, +1, +3
        const axis = b => { const v = parseInt(b, 2); return QAM16_LEVELS[isGray ? grayInverse(v) : v]; };
        s.levelI = axis(bits.slice(0, 2));
        s.levelQ = axis(bits.slice(2, 4));
        s.norm = Math.sqrt(10);
      }
      s.I = s.levelI / s.norm;
      s.Q = s.levelQ / s.norm;
      s.A = Math.hypot(s.I, s.Q);
      let phi = Math.atan2(s.Q, s.I);
      if (phi < 0) phi += 2 * Math.PI;
      s.phi = phi;
      s.phaseDeg = phi * 180 / Math.PI;
      s.f = p.fc;
    }
    return s;
  }

  /** Valor instantani del símbol `sym` en el temps global t (ms). */
  function valueAt(R, sym, t) {
    const st = sym.state;
    const w = 2 * Math.PI * R.params.fc;
    switch (R.mod) {
      case 'ASK':
      case 'PSK':
        return st.A * Math.cos(w * t + st.phi);
      case 'QAM':
        return st.I * Math.cos(w * t) - st.Q * Math.sin(w * t);
      case 'FSK': // fase contínua: la fase s'acumula des de l'inici del símbol
        return Math.cos(sym.phaseStart + 2 * Math.PI * st.f * (t - sym.t0));
    }
    return 0;
  }

  function carrierAt(R, t) { return Math.cos(2 * Math.PI * R.params.fc * t); }

  /**
   * Calcula totes les dades del laboratori a partir de la mateixa seqüència.
   * @param {string} bits seqüència original (només 0/1)
   * @param {string} mod 'ASK' | 'FSK' | 'PSK' | 'QAM'
   * @param {number} M nombre de símbols diferents
   * @param {{Ts:number, fc:number, df:number}} p Ts en ms, fc i df en kHz
   */
  function compute(bits, mod, M, p) {
    const k = Math.round(Math.log2(M));
    const nBits = bits.length;
    const nPad = (k - (nBits % k)) % k;
    const padded = bits + '0'.repeat(nPad);
    const nSym = padded.length / k;

    let df = p.df, dfClamped = false, dfMax = null;
    if (mod === 'FSK') {
      dfMax = maxDf(p.fc, M);
      if (df > dfMax) { df = dfMax; dfClamped = true; }
    }
    const mapping = p.mapping === 'gray' && hasMapping(mod) ? 'gray' : 'natural';
    const params = { Ts: p.Ts, fc: p.fc, df, mapping };

    const alphabet = [];
    for (let m = 0; m < M; m++) alphabet.push(symbolState(mod, M, m, params));

    const R = {
      mod, M, k, name: variantName(mod, M), params, dfClamped, dfMax, mapping,
      bits, padded, nBits, nPad, nSym, alphabet,
      symbols: [], occurrences: alphabet.map(() => []),
    };

    for (let n = 0; n < nSym; n++) {
      const b = padded.substr(n * k, k);
      const m = parseInt(b, 2);
      const padMask = [];
      for (let j = 0; j < k; j++) padMask.push(n * k + j >= nBits);
      R.symbols.push({ n, bits: b, m, padMask, hasPad: padMask.some(Boolean), t0: n * p.Ts, t1: (n + 1) * p.Ts, state: alphabet[m] });
      R.occurrences[m].push(n);
    }

    // Mostratge: almenys 40 mostres per cicle de la freqüència més alta.
    const fmax = mod === 'FSK' ? Math.max.apply(null, alphabet.map(s => s.f)) : p.fc;
    const sps = Math.max(40, Math.ceil(SAMPLES_PER_CYCLE * fmax * p.Ts));
    const per = sps + 1; // cada símbol inclou els dos extrems: el salt al límit queda vertical
    const t = new Float64Array(nSym * per);
    const s = new Float64Array(nSym * per);
    let phaseAcc = 0;
    for (const sym of R.symbols) {
      sym.phaseStart = phaseAcc;
      for (let j = 0; j <= sps; j++) {
        const tt = sym.t0 + j * p.Ts / sps;
        const idx = sym.n * per + j;
        t[idx] = tt;
        s[idx] = valueAt(R, sym, tt);
      }
      if (mod === 'FSK') phaseAcc += 2 * Math.PI * sym.state.f * p.Ts;
    }

    R.fmax = fmax;
    R.sps = sps;
    R.samplesPerCycle = sps / (fmax * p.Ts);
    R.per = per;
    R.t = t;
    R.s = s;
    R.Ts = p.Ts;
    R.Rs = 1000 / p.Ts;          // baud
    R.Rb = k * R.Rs;             // bit/s
    R.Ttotal = nSym * p.Ts;      // ms
    R.cyclesPerSymbol = p.fc * p.Ts;
    R.peak = Math.max.apply(null, alphabet.map(a => a.A));
    R.distinctAmplitudes = Array.from(new Set(alphabet.map(a => a.A.toFixed(9)))).map(Number).sort((a, b) => a - b);
    return R;
  }

  /** Símbol que conté el temps t (ms). */
  function symbolAtTime(R, t) {
    if (t < 0 || t > R.Ttotal) return null;
    return Math.min(R.nSym - 1, Math.floor(t / R.Ts));
  }

  const api = {
    MAX_BITS, SAMPLES_PER_CYCLE, MIN_TONE, DEFAULT_BITS, MODULATIONS, VARIANTS,
    variantName, parseBits, maxDf, symbolState, gray, grayInverse, hasMapping, mappingDiffers, compute, valueAt, carrierAt, symbolAtTime,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ModLab = api;
})(typeof window !== 'undefined' ? window : globalThis);
