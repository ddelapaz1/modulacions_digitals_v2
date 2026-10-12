/* Laboratori de modulacions digitals — interfície. Depèn de js/model.js (window.ModLab). */
(function () {
  'use strict';
  const L = window.ModLab;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------------------------------------------------------------- utilitats
  const nfCache = {};
  function fmt(x, d) {
    d = d == null ? 2 : d;
    if (!nfCache[d]) nfCache[d] = new Intl.NumberFormat('ca-ES', { maximumFractionDigits: d, useGrouping: false });
    return nfCache[d].format(Math.abs(x) < 1e-9 ? 0 : x).replace('-', '−');
  }
  const signed = x => (x > 0 ? '+' : '') + fmt(x, 3);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function bitsHTML(bits, padMask) {
    return Array.from(bits).map((b, j) => padMask && padMask[j]
      ? '<span class="pad-bit" title="bit de farciment">' + b + '</span>' : b).join('');
  }
  function bitsTXT(bits, padMask) {
    return Array.from(bits).map((b, j) => padMask && padMask[j] ? '[' + b + ']' : b).join('');
  }
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const fileSafe = s => s.replace(/[^A-Za-z0-9-]+/g, '_').replace(/_+$/, '');

  const C = {
    bg: '#ffffff', plot: '#f9fafe', grid: '#e7ebf3', zero: '#b4bccc', text: '#141b2d', muted: '#525c72',
    bound: '#9aa3b6', sig: '#3451d1', car: '#8a93a5', bit: '#0e8a5f', pad: '#c2410c', padFill: 'rgba(194,65,12,0.10)',
    sel: 'rgba(255,196,50,0.36)', selLine: '#a86400', occ: 'rgba(255,196,50,0.13)', cursor: '#c2185b',
    freq: '#6d28d9', end: 'rgba(120,128,145,0.14)', unused: '#8a93a5', good: '#7fbf9f', bad: '#c62828',
  };
  const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const FONT_B = 'bold 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MONO = '13px ui-monospace, Menlo, Consolas, monospace';
  const MONO_B = 'bold 13px ui-monospace, Menlo, Consolas, monospace';

  // ---------------------------------------------------------------- estat
  const DEFAULTS = { text: L.DEFAULT_BITS, mod: 'ASK', M: 4, Ts: 1, fc: 5, df: 1, overlay: false, speed: 1, mapping: 'natural', showLinks: true };
  const DEFAULT_M = { ASK: 4, FSK: 2, PSK: 4, QAM: 16 };
  const MODS = ['ASK', 'FSK', 'PSK', 'QAM'];
  const state = {
    bits: L.parseBits(DEFAULTS.text).bits,
    mod: DEFAULTS.mod, M: DEFAULTS.M, Ts: DEFAULTS.Ts, fc: DEFAULTS.fc, df: DEFAULTS.df,
    overlay: DEFAULTS.overlay, speed: DEFAULTS.speed, mapping: DEFAULTS.mapping, showLinks: DEFAULTS.showLinks,
    lastM: Object.assign({}, DEFAULT_M),
    sel: 0, selM: null,
    cursor: null, playing: false,
    view: { t0: 0, span: 1 }, viewKey: '',
    howOpen: false,
  };
  let R = null;     // resultat del laboratori
  let constHits = [];

  // ---------------------------------------------------------------- textos
  const INFO = {
    ASK: {
      title: 'ASK — modulació per desplaçament d’amplitud',
      lead: 'La informació es representa canviant l’amplitud de la portadora entre uns nivells determinats.',
      more: 'La freqüència i la fase de la portadora es mantenen constants. En 2-ASK, també anomenada OOK (<i>On-Off Keying</i>), el bit 0 apaga la portadora i el bit 1 l’encén.',
    },
    FSK: {
      title: 'FSK — modulació per desplaçament de freqüència',
      lead: 'La informació es representa seleccionant una freqüència diferent per a cada símbol.',
      more: 'L’amplitud és constant: el que canvia és la rapidesa amb què oscil·la la portadora. En aquest laboratori, els símbols FSK s’identifiquen per la freqüència; per això es mostren en un diagrama de tons i no en una constel·lació I/Q.',
    },
    PSK: {
      title: 'PSK — modulació per desplaçament de fase',
      lead: 'La informació es representa canviant la fase de la portadora.',
      more: 'L’amplitud i la freqüència es mantenen constants. Cada símbol desplaça l’ona un angle diferent; al límit entre símbols es veu un canvi brusc de forma.',
    },
    QAM: {
      title: 'QAM — modulació d’amplitud en quadratura',
      lead: 'La informació es representa combinant dues components en quadratura, I i Q, que determinen l’amplitud i la fase.',
      more: 'Cada símbol és un punt d’una graella I/Q. A diferència de PSK, alguns símbols tenen amplituds diferents i alguns comparteixen amplitud però tenen fases diferents.',
    },
  };

  const askAmpStr = (m, M) => M === 2 ? String(m) : ['0', '1/3', '2/3', '1'][m];
  const qamStr = (lv, M) => (lv < 0 ? '−' : '+') + (M === 4 ? '1/√2' : Math.abs(lv) + '/√10');

  const isGray = R => R.mapping === 'gray' && L.mappingDiffers(R.mod, R.M);
  /** Llista «bits → valor» en ordre geomètric (posició i). */
  const byPos = (R, f) => R.alphabet.slice().sort((a, b) => a.pos - b.pos).map(a => a.bits + ' → ' + f(a)).join(', ');
  function posText(R) {
    if (!L.mappingDiffers(R.mod, R.M)) return '';
    return isGray(R)
      ? '<p><b>Disposició Gray:</b> i és la posició a la constel·lació (0, 1, 2…) i el grup de bits és el <i>codi Gray</i> de i, de manera que dues posicions veïnes només difereixen en un bit.</p>'
      : '<p><b>Disposició natural:</b> la posició i coincideix amb el valor binari m del grup de bits.</p>';
  }

  function howHTML(R) {
    const p = R.params, M = R.M;
    if (R.mod === 'ASK') {
      return '<div class="formula">s(t) = A<sub>n</sub> · cos(2π f<sub>c</sub> t)</div>' +
        '<p>Durant el símbol n, l’amplitud A<sub>n</sub> depèn del grup de bits. La fase de referència és 0° i la freqüència és sempre f<sub>c</sub> = ' + fmt(p.fc) + ' kHz.</p>' +
        '<div class="formula">A<sub>i</sub> = i / (M − 1)</div>' + posText(R) +
        '<p>' + (M === 2 ? 'En 2-ASK: 0 → A = 0 (sense portadora) i 1 → A = 1.' : 'En 4-ASK: ' + byPos(R, a => askAmpStr(a.pos, M)) + '.') + '</p>' +
        '<p>Quan A = 0 no hi ha portadora: en aquell interval la fase no es pot observar.</p>';
    }
    if (R.mod === 'FSK') {
      const tones = R.alphabet.map(a => a.bits + ' → ' + fmt(a.f, 3) + ' kHz').join(' · ');
      return '<div class="formula">f<sub>m</sub> = f<sub>c</sub> + [m − (M − 1)/2] · Δf</div>' +
        '<p>Els tons es reparteixen al voltant de la freqüència central f<sub>c</sub> = ' + fmt(p.fc) + ' kHz, separats Δf = ' + fmt(p.df, 3) + ' kHz. Ara: ' + tones + '.</p>' +
        '<p><b>Model de FSK de fase contínua (CPFSK).</b> La fase no es reinicia: s’acumula segons la freqüència activa.</p>' +
        '<div class="formula">φ(t) = φ<sub>n</sub> + 2π f<sub>m</sub> (t − t<sub>n</sub>) &nbsp;&nbsp; s(t) = cos φ(t) &nbsp;&nbsp; φ<sub>n+1</sub> = φ<sub>n</sub> + 2π f<sub>m</sub> T<sub>s</sub></div>' +
        '<p>Així l’ona no fa salts en canviar de símbol: només canvia la rapidesa d’oscil·lació. L’amplitud és constant (1). Δf es limita perquè cap to sigui inferior a ' + fmt(L.MIN_TONE) + ' kHz (no hi pot haver freqüències nul·les o negatives).</p>';
    }
    if (R.mod === 'PSK') {
      const list = byPos(R, a => fmt(a.phaseDeg, 0) + '°');
      return '<div class="formula">s(t) = cos(2π f<sub>c</sub> t + φ<sub>n</sub>) &nbsp;&nbsp;&nbsp; φ<sub>i</sub> = 2π i / M = 360° · i / M</div>' + posText(R) +
        '<p>La fase φ depèn del grup de bits. ' + (M === 2 ? 'En BPSK hi ha dues fases separades 180°: 0 → 0° i 1 → 180°.' :
          M === 4 ? 'En QPSK hi ha quatre fases separades 90°: ' + list + '.' :
            'En 8-PSK hi ha vuit fases separades 45°: ' + list + '.') + '</p>' +
        '<p>El temps t és global: la portadora no es reinicia a cada símbol. A la constel·lació, cada fase és un punt de la circumferència de radi 1, amb I = cos φ i Q = sin φ.</p>';
    }
    const amps = R.distinctAmplitudes.map(a => fmt(a, 3)).join('; ');
    return '<div class="formula">s(t) = I<sub>n</sub> · cos(2π f<sub>c</sub> t) − Q<sub>n</sub> · sin(2π f<sub>c</sub> t)</div>' +
      (M === 4
        ? '<p>En 4-QAM, I i Q valen ±1/√2. El primer bit selecciona I i el segon Q (0 → negatiu, 1 → positiu).</p>'
        : '<p>En 16-QAM, cada eix té els nivells −3, −1, +1 i +3, dividits per √10. Els dos primers bits seleccionen I i els dos darrers Q: ' +
          (isGray(R) ? '00 → −3, 01 → −1, 11 → +1, 10 → +3 (<b>codi Gray</b> a cada eix: nivells veïns només difereixen en un bit).'
            : '00 → −3, 01 → −1, 10 → +1, 11 → +3 (binari natural: entre −1 i +1 canvien els dos bits).') + '</p>') +
      '<div class="formula">A = √(I² + Q²) &nbsp;&nbsp;&nbsp; φ = atan2(Q, I)</div>' +
      (M === 16 ? '<p>Les 16 combinacions I/Q <b>no</b> són 16 amplituds diferents: només hi ha ' + R.distinctAmplitudes.length + ' amplituds (' + amps + '). Molts símbols es distingeixen per la fase. Les circumferències discontínues de la constel·lació les marquen.</p>' : '') +
      '<p>4-QAM i QPSK tenen geometries equivalents: quatre punts sobre una circumferència. Amb una rotació de 45° i una correspondència de bits adequada són la mateixa modulació.</p>' +
      (M === 16 ? '<p>La normalització amb √10 fa que la potència mitjana dels 16 símbols sigui 1; per això l’amplitud màxima és ' + fmt(R.peak, 3) + '.</p>' : '');
  }

  /** Nombre de bits diferents entre dos grups. */
  function hamming(a, b) { let x = a ^ b, c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
  /** Parells de símbols veïns a la constel·lació (valors m). */
  function neighbours(R) {
    const out = [], A = R.alphabet;
    if (R.mod === 'ASK' || R.mod === 'PSK') {
      const byPos = A.slice().sort((a, b) => a.pos - b.pos);
      for (let i = 0; i + 1 < byPos.length; i++) out.push([byPos[i].m, byPos[i + 1].m]);
      if (R.mod === 'PSK' && R.M > 2) out.push([byPos[R.M - 1].m, byPos[0].m]);
    } else if (R.mod === 'QAM') {
      const step = 2; // nivells consecutius: ±1 (4-QAM) o −3, −1, +1, +3 (16-QAM)
      A.forEach(a => A.forEach(b => {
        if (a.m >= b.m) return;
        const dI = Math.abs(a.levelI - b.levelI), dQ = Math.abs(a.levelQ - b.levelQ);
        if ((dI === step && dQ === 0) || (dI === 0 && dQ === step)) out.push([a.m, b.m]);
      }));
    }
    return out;
  }

  // ---------------------------------------------------------------- columnes per estat
  function columns(R) {
    const p = R.params, M = R.M;
    const posCol = isGray(R) && R.mod !== 'QAM' ? [{ h: 'Posició i', f: s => String(s.pos), csv: s => s.pos }] : [];
    switch (R.mod) {
      case 'ASK': return posCol.concat([
        { h: 'Amplitud A', f: s => askAmpStr(s.pos, M) + (M === 4 && s.pos > 0 && s.pos < 3 ? ' ≈ ' + fmt(s.A, 3) : ''), csv: s => s.A },
        { h: 'Fase', f: s => s.A > 0 ? '0°' : 'no observable (A = 0)', csv: s => s.A > 0 ? 0 : '' },
      ]);
      case 'FSK': return [
        { h: 'm − (M−1)/2', f: s => signed(s.m - (M - 1) / 2), csv: s => s.m - (M - 1) / 2 },
        { h: 'Freqüència (kHz)', f: s => fmt(s.f, 3), csv: s => s.f },
        { h: 'Cicles per símbol', f: s => fmt(s.f * p.Ts, 3), csv: s => s.f * p.Ts },
      ];
      case 'PSK': return posCol.concat([
        { h: 'Fase φ', f: s => fmt(s.phaseDeg, 1) + '°', csv: s => s.phaseDeg },
        { h: 'I = cos φ', f: s => fmt(s.I, 3), csv: s => s.I },
        { h: 'Q = sin φ', f: s => fmt(s.Q, 3), csv: s => s.Q },
      ]);
      default: return [
        { h: 'I', f: s => qamStr(s.levelI, M) + ' ≈ ' + fmt(s.I, 3), csv: s => s.I },
        { h: 'Q', f: s => qamStr(s.levelQ, M) + ' ≈ ' + fmt(s.Q, 3), csv: s => s.Q },
        { h: 'Amplitud √(I²+Q²)', f: s => fmt(s.A, 3), csv: s => s.A },
        { h: 'Fase atan2(Q, I)', f: s => fmt(s.phaseDeg, 1) + '°', csv: s => s.phaseDeg },
      ];
    }
  }

  // ---------------------------------------------------------------- càlcul
  function recompute() {
    R = L.compute(state.bits, state.mod, state.M, { Ts: state.Ts, fc: state.fc, df: state.df, mapping: state.mapping });
    const key = [state.mod, state.M, R.nSym, state.Ts].join('|');
    if (key !== state.viewKey) {
      state.viewKey = key;
      const cw = document.getElementById('cv-signal').clientWidth || 900;
      const nVis = clamp(Math.floor((cw - 80) / 70), 4, 12);
      state.view = { t0: 0, span: Math.min(R.Ttotal, nVis * R.Ts) };
      stopPlay();
      state.cursor = null;
    }
    clampView(state.view, R.Ttotal, R.Ts);
    if (state.sel != null) state.sel = Math.min(state.sel, R.nSym - 1);
    if (state.sel != null) state.selM = R.symbols[state.sel].m;
    else if (state.selM == null || state.selM >= R.M) { state.sel = 0; state.selM = R.symbols[0].m; }
    if (state.cursor != null && state.cursor > R.Ttotal) state.cursor = null;
    renderAll();
  }

  // ---------------------------------------------------------------- dibuix temporal
  function setupCanvas(cv, h) {
    const w = Math.max(200, cv.clientWidth || cv.parentNode.clientWidth);
    const dpr = window.devicePixelRatio || 1;
    if (h == null) h = w;
    cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  const FRAME = { l: 66, r: 14 };

  /** Polilínia amb decimació per píxel (mín./màx.) per a molts punts. */
  function drawSeries(ctx, R, nA, nB, xOf, yOf, get) {
    ctx.beginPath();
    let key = null, xk = 0, first = 0, mn = 0, mx = 0, last = 0, started = false;
    const flush = () => {
      if (key === null) return;
      if (!started) { ctx.moveTo(xk, yOf(first)); started = true; } else ctx.lineTo(xk, yOf(first));
      if (mn !== first || mx !== first || last !== first) { ctx.lineTo(xk, yOf(mn)); ctx.lineTo(xk, yOf(mx)); ctx.lineTo(xk, yOf(last)); }
    };
    const i1 = (nB + 1) * R.per;
    for (let i = nA * R.per; i < i1; i++) {
      const x = xOf(R.t[i]);
      const k = Math.round(x * 2);
      const v = get(i);
      if (k !== key) { flush(); key = k; xk = x; first = mn = mx = last = v; }
      else { if (v < mn) mn = v; if (v > mx) mx = v; last = v; }
    }
    flush();
    ctx.stroke();
  }

  function drawBitsText(ctx, x, y, bits, padMask, bold) {
    ctx.font = bold ? MONO_B : MONO;
    const tw = ctx.measureText(bits).width;
    let cx = x - tw / 2;
    ctx.textAlign = 'left';
    for (let j = 0; j < bits.length; j++) {
      ctx.fillStyle = padMask && padMask[j] ? C.pad : C.text;
      ctx.fillText(bits[j], cx, y);
      cx += ctx.measureText(bits[j]).width;
    }
    return tw;
  }

  /**
   * Gràfica temporal. kind: 'bits' | 'carrier' | 'signal' | 'freq'.
   * o: { sel, selM, cursor, overlay, ymax }
   */
  function drawTime(ctx, w, h, kind, R, view, o) {
    o = o || {};
    const F = { l: FRAME.l, r: FRAME.r, t: (kind === 'bits' || kind === 'signal') ? 26 : 10, b: 24 };
    const pw = w - F.l - F.r, ph = h - F.t - F.b;
    const tEnd = view.t0 + view.span;
    const xOf = t => F.l + (t - view.t0) / view.span * pw;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.plot; ctx.fillRect(F.l, F.t, pw, ph);

    let ymin, ymax, ticks, ylab;
    if (kind === 'bits') { ymin = -0.3; ymax = 1.3; ticks = [[0, '0'], [1, '1']]; ylab = 'bit'; }
    else if (kind === 'freq') {
      ymin = 0; ymax = R.fmax * 1.12 + 0.3; ylab = 'f (kHz)';
      ticks = [[0, '0']].concat(R.alphabet.map(a => [a.f, fmt(a.f, 2)]));
    } else {
      const pk = kind === 'carrier' ? 1 : (o.ymax || Math.max(1, R.peak));
      ymax = pk * 1.12; ymin = -ymax; ylab = h >= 140 ? 'amplitud relativa' : 'amplitud';
      ticks = [[-1, '−1'], [-0.5, '−0,5'], [0, '0'], [0.5, '0,5'], [1, '1']];
      if (kind === 'signal' && R.peak > 1.01) ticks.push([R.peak, fmt(R.peak, 2)], [-R.peak, fmt(-R.peak, 2)]);
    }
    const yOf = v => F.t + (ymax - v) / (ymax - ymin) * ph;

    const nA = Math.max(0, Math.floor(view.t0 / R.Ts + 1e-9));
    const nB = Math.min(R.nSym - 1, Math.ceil(tEnd / R.Ts - 1e-9) - 1);
    const pxSym = R.Ts / view.span * pw;

    // ressaltat del símbol seleccionat i de les altres ocurrències
    for (let n = nA; n <= nB; n++) {
      const sym = R.symbols[n];
      const isSel = n === o.sel, isOcc = o.selM != null && sym.m === o.selM;
      if (!isSel && !isOcc) continue;
      const xa = Math.max(F.l, xOf(sym.t0)), xb = Math.min(F.l + pw, xOf(sym.t1));
      ctx.fillStyle = isSel ? C.sel : C.occ;
      ctx.fillRect(xa, F.t, xb - xa, ph);
      if (isSel) { ctx.strokeStyle = C.selLine; ctx.lineWidth = 1.5; ctx.strokeRect(xa + 0.75, F.t + 0.75, xb - xa - 1.5, ph - 1.5); }
    }
    // final de la transmissió
    if (R.Ttotal < tEnd - 1e-9) {
      const xe = Math.max(F.l, xOf(R.Ttotal));
      ctx.fillStyle = C.end; ctx.fillRect(xe, F.t, F.l + pw - xe, ph);
      if (F.l + pw - xe > 130) {
        ctx.fillStyle = C.muted; ctx.font = FONT; ctx.textAlign = 'center';
        ctx.fillText('fi de la transmissió', (xe + F.l + pw) / 2, F.t + ph / 2 + 4);
      }
    }
    // graella horitzontal i etiquetes de l'eix vertical
    ctx.font = FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    let lastY = -1e9;
    ticks.sort((a, b) => b[0] - a[0]).forEach(([v, lab]) => {
      const y = yOf(v);
      ctx.strokeStyle = v === 0 ? C.zero : C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(F.l, Math.round(y) + 0.5); ctx.lineTo(F.l + pw, Math.round(y) + 0.5); ctx.stroke();
      if (y - lastY >= 12) { ctx.fillStyle = C.muted; ctx.fillText(lab, F.l - 6, y); lastY = y; }
    });
    ctx.save();
    ctx.translate(13, F.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillStyle = C.muted; ctx.fillText(ylab, 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';

    // límits dels símbols
    if (pxSym >= 4) {
      ctx.strokeStyle = C.bound; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      for (let n = nA; n <= nB + 1; n++) {
        const t = n * R.Ts;
        if (t < view.t0 - 1e-9 || t > tEnd + 1e-9) continue;
        const x = Math.round(xOf(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, F.t); ctx.lineTo(x, F.t + ph); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // eix de temps
    const step = niceStep(view.span / Math.max(2, pw / 80));
    const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    ctx.fillStyle = C.muted; ctx.strokeStyle = C.zero; ctx.textAlign = 'center'; ctx.font = FONT;
    for (let t = Math.ceil(view.t0 / step - 1e-9) * step; t <= tEnd + 1e-9; t += step) {
      const x = xOf(t);
      ctx.beginPath(); ctx.moveTo(x, F.t + ph); ctx.lineTo(x, F.t + ph + 4); ctx.stroke();
      ctx.fillText(fmt(t, dec + 1), x, F.t + ph + 16);
    }
    ctx.textAlign = 'right';
    ctx.fillText('t (ms)', F.l - 6, F.t + ph + 16);

    // sèries (retallades a l'àrea de la gràfica)
    ctx.save();
    ctx.beginPath(); ctx.rect(F.l, F.t - 2, pw, ph + 4); ctx.clip();
    if (nB >= nA) {
      if (kind === 'bits') {
        const tb = R.Ts / R.k;
        const cellW = tb / view.span * pw;
        for (let n = nA; n <= nB; n++) {
          const sym = R.symbols[n];
          for (let j = 0; j < R.k; j++) {
            if (!sym.padMask[j]) continue;
            const xa = xOf(sym.t0 + j * tb);
            ctx.fillStyle = C.padFill; ctx.fillRect(xa, F.t, cellW, ph);
          }
        }
        let prevV = null;
        if (nA > 0) { const ps = R.symbols[nA - 1]; prevV = +ps.bits[R.k - 1]; }
        ctx.lineWidth = 2.2;
        for (let n = nA; n <= nB; n++) {
          const sym = R.symbols[n];
          for (let j = 0; j < R.k; j++) {
            const v = +sym.bits[j], pad = sym.padMask[j];
            const xa = xOf(sym.t0 + j * tb), xb = xOf(sym.t0 + (j + 1) * tb);
            ctx.strokeStyle = pad ? C.pad : C.bit;
            ctx.setLineDash(pad ? [6, 4] : []);
            ctx.beginPath();
            ctx.moveTo(xa, yOf(prevV == null ? v : prevV));
            ctx.lineTo(xa, yOf(v)); ctx.lineTo(xb, yOf(v));
            ctx.stroke();
            prevV = v;
            if (cellW >= 11) {
              ctx.font = n === o.sel ? MONO_B : MONO; ctx.textAlign = 'center';
              ctx.fillStyle = pad ? C.pad : C.muted;
              ctx.fillText(sym.bits[j], (xa + xb) / 2, yOf(0.5) + 5);
            }
          }
        }
        ctx.setLineDash([]);
      } else if (kind === 'carrier') {
        const wc = 2 * Math.PI * R.params.fc;
        ctx.strokeStyle = C.car; ctx.lineWidth = 1.5;
        drawSeries(ctx, R, nA, nB, xOf, yOf, i => Math.cos(wc * R.t[i]));
      } else if (kind === 'signal') {
        if (o.overlay) {
          const wc = 2 * Math.PI * R.params.fc;
          ctx.strokeStyle = C.car; ctx.lineWidth = 1.1; ctx.setLineDash([5, 4]);
          drawSeries(ctx, R, nA, nB, xOf, yOf, i => Math.cos(wc * R.t[i]));
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = C.sig; ctx.lineWidth = 1.7;
        drawSeries(ctx, R, nA, nB, xOf, yOf, i => R.s[i]);
        if (R.mod === 'ASK') {
          ctx.font = FONT; ctx.textAlign = 'center'; ctx.fillStyle = C.muted;
          for (let n = nA; n <= nB; n++) {
            const sym = R.symbols[n];
            if (sym.state.A !== 0) continue;
            const xa = Math.max(F.l, xOf(sym.t0)), xb = Math.min(F.l + pw, xOf(sym.t1));
            const txt = xb - xa >= 120 ? 'A = 0: sense portadora' : xb - xa >= 40 ? 'A = 0' : '';
            if (txt) ctx.fillText(txt, (xa + xb) / 2, yOf(0) - 10);
          }
        }
      } else if (kind === 'freq') {
        ctx.strokeStyle = C.car; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(F.l, yOf(R.params.fc)); ctx.lineTo(F.l + pw, yOf(R.params.fc)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
        ctx.fillText('fc = ' + fmt(R.params.fc) + ' kHz', F.l + pw - 4, yOf(R.params.fc) - 4);
        ctx.strokeStyle = C.freq; ctx.lineWidth = 2.4;
        ctx.beginPath();
        for (let n = nA; n <= nB; n++) {
          const sym = R.symbols[n];
          const y = yOf(sym.state.f);
          if (n === nA) ctx.moveTo(xOf(sym.t0), y); else ctx.lineTo(xOf(sym.t0), y);
          ctx.lineTo(xOf(sym.t1), y);
        }
        ctx.stroke();
      }
    }
    // cursor de reproducció
    if (o.cursor != null && o.cursor >= view.t0 && o.cursor <= tEnd) {
      const x = xOf(o.cursor);
      ctx.strokeStyle = C.cursor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, F.t); ctx.lineTo(x, F.t + ph); ctx.stroke();
    }
    ctx.restore();

    // etiquetes superiors
    if (kind === 'bits' || kind === 'signal') {
      ctx.save();
      ctx.beginPath(); ctx.rect(F.l, 0, pw, F.t); ctx.clip();
      for (let n = nA; n <= nB; n++) {
        const sym = R.symbols[n];
        const xa = Math.max(F.l, xOf(sym.t0)), xb = Math.min(F.l + pw, xOf(sym.t1));
        const cx = (xa + xb) / 2, wid = xb - xa;
        if (kind === 'bits') {
          const lab = 'S' + (n + 1);
          ctx.font = n === o.sel ? FONT_B : FONT;
          if (ctx.measureText(lab).width + 4 <= wid) {
            ctx.fillStyle = n === o.sel ? C.text : C.muted; ctx.textAlign = 'center';
            ctx.fillText(lab, cx, F.t - 9);
          }
        } else {
          ctx.font = n === o.sel ? MONO_B : MONO;
          if (ctx.measureText(sym.bits).width + 4 <= wid) drawBitsText(ctx, cx, F.t - 9, sym.bits, sym.padMask, n === o.sel);
        }
      }
      ctx.restore();
    }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.strokeRect(F.l + 0.5, F.t + 0.5, pw - 1, ph - 1);
  }

  // ---------------------------------------------------------------- constel·lació / tons
  function drawConst(ctx, S, R, selM) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, S, S);
    if (R.mod === 'FSK') return drawTones(ctx, S, S, R, selM);
    const hits = [];
    const pad = 30, c = S / 2, lim = 1.3, sc = (S / 2 - pad) / lim;
    const X = v => c + v * sc, Y = v => c - v * sc;
    ctx.fillStyle = C.plot; ctx.fillRect(X(-lim), Y(lim), 2 * lim * sc, 2 * lim * sc);
    // graella (mateixa escala als dos eixos)
    ctx.lineWidth = 1; ctx.strokeStyle = C.grid;
    [-1, -0.5, 0.5, 1].forEach(g => {
      ctx.beginPath(); ctx.moveTo(X(g), Y(-lim)); ctx.lineTo(X(g), Y(lim)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-lim), Y(g)); ctx.lineTo(X(lim), Y(g)); ctx.stroke();
    });
    ctx.strokeStyle = C.zero; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(X(-lim), c); ctx.lineTo(X(lim), c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c, Y(-lim)); ctx.lineTo(c, Y(lim)); ctx.stroke();
    ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    [-1, -0.5, 0.5, 1].forEach(g => {
      if (R.mod !== 'ASK' || Math.abs(g) === 1) ctx.fillText(fmt(g, 1), X(g), c + 15);
      ctx.textAlign = 'right'; ctx.fillText(fmt(g, 1), c - 5, Y(g) + 4); ctx.textAlign = 'center';
    });
    ctx.font = FONT_B; ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    if (R.mod === 'ASK') ctx.fillText('I (amplitud) →', X(lim) - 2, c + 50);
    else ctx.fillText('I', X(lim) - 2, c - 13);
    ctx.textAlign = 'left'; ctx.fillText('Q', c + 6, Y(lim) + 12);
    // circumferències de referència
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    const circles = R.mod === 'PSK' || (R.mod === 'QAM' && R.M === 4) ? [1] : R.mod === 'QAM' ? R.distinctAmplitudes : [];
    circles.forEach(r => { ctx.strokeStyle = '#aab2c2'; ctx.beginPath(); ctx.arc(c, c, r * sc, 0, 2 * Math.PI); ctx.stroke(); });
    ctx.setLineDash([]);
    // vector del símbol seleccionat
    if (selM != null) {
      const a = R.alphabet[selM];
      if (a.A > 0) {
        ctx.strokeStyle = C.selLine; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(X(a.I), Y(a.Q)); ctx.stroke();
        if (R.mod !== 'ASK' && a.phaseDeg > 0.01) {
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(c, c, 24, 0, -a.phi, true); ctx.stroke();
        }
      }
      ctx.font = FONT_B; ctx.fillStyle = C.selLine; ctx.textAlign = 'left';
      ctx.fillText(a.bits + ': A = ' + fmt(a.A, 3) + (R.mod === 'ASK' ? '' : ', φ = ' + (a.A > 0 ? fmt(a.phaseDeg, 1) + '°' : '—')), 6, 16);
    }
    // línies entre veïns: quants bits canvien
    if (state.showLinks && L.mappingDiffers(R.mod, R.M)) {
      neighbours(R).forEach(([ma, mb]) => {
        const a = R.alphabet[ma], b = R.alphabet[mb];
        let x1 = X(a.I), y1 = Y(a.Q), x2 = X(b.I), y2 = Y(b.Q);
        const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
        x1 += ux * 10; y1 += uy * 10; x2 -= ux * 10; y2 -= uy * 10;
        const hd = hamming(ma, mb);
        ctx.strokeStyle = hd > 1 ? C.bad : C.good; ctx.lineWidth = hd > 1 ? 2.5 : 2;
        ctx.setLineDash(hd > 1 ? [5, 3] : []);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
        if (hd > 1) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(mx, my, 8, 0, 2 * Math.PI); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = FONT_B; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(hd), mx, my + 0.5); ctx.textBaseline = 'alphabetic';
        }
      });
    }
    // punts
    const small = R.M >= 16;
    R.alphabet.forEach(a => {
      const x = X(a.I), y = Y(a.Q);
      const used = R.occurrences[a.m].length > 0;
      ctx.beginPath(); ctx.arc(x, y, used ? 7 : 6, 0, 2 * Math.PI);
      if (used) { ctx.fillStyle = C.sig; ctx.fill(); }
      else { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.unused; ctx.lineWidth = 2; ctx.stroke(); }
      let dx, dy;
      if (R.mod === 'ASK') { dx = 0; dy = -1; }
      else { const r = Math.hypot(a.I, a.Q) || 1; dx = a.I / r; dy = -a.Q / r; }
      const off = small ? 17 : 20;
      ctx.font = small ? 'bold 11px ui-monospace, Menlo, monospace' : MONO_B;
      ctx.fillStyle = used ? C.text : C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(a.bits, x + dx * off, y + dy * off);
      if (R.mod === 'ASK') { ctx.font = FONT; ctx.fillStyle = C.muted; ctx.fillText(askAmpStr(a.pos, R.M), x, y + 30); }
      ctx.textBaseline = 'alphabetic';
      hits.push({ m: a.m, x, y });
    });
    if (selM != null) {
      const a = R.alphabet[selM];
      ctx.strokeStyle = C.selLine; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(X(a.I), Y(a.Q), 12, 0, 2 * Math.PI); ctx.stroke();
    }
    return hits;
  }

  function drawTones(ctx, W, H, R, selM) {
    const hits = [];
    const F = { l: 40, r: 18, t: 44, b: 70 };
    const pw = W - F.l - F.r, ph = H - F.t - F.b;
    const fs = R.alphabet.map(a => a.f);
    const df = R.params.df;
    const margin = Math.max(df, 0.75);
    const a0 = Math.max(0, Math.min.apply(null, fs) - margin), a1 = Math.max.apply(null, fs) + margin;
    const xOf = f => F.l + (f - a0) / (a1 - a0) * pw;
    const yOf = v => F.t + (1.15 - v) / 1.15 * ph;
    const base = yOf(0);
    ctx.fillStyle = C.plot; ctx.fillRect(F.l, F.t, pw, ph);
    // eix de freqüències
    ctx.strokeStyle = C.zero; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(F.l, base); ctx.lineTo(F.l + pw, base); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(F.l, F.t); ctx.lineTo(F.l, base); ctx.stroke();
    const step = niceStep((a1 - a0) / 5);
    ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    for (let f = Math.ceil(a0 / step - 1e-9) * step; f <= a1 + 1e-9; f += step) {
      ctx.beginPath(); ctx.moveTo(xOf(f), base); ctx.lineTo(xOf(f), base + 4); ctx.stroke();
      ctx.fillText(fmt(f, 2), xOf(f), base + 16);
    }
    ctx.textAlign = 'right'; ctx.fillText('f (kHz)', F.l + pw, base + 32);
    ctx.textAlign = 'right'; ctx.fillText('1', F.l - 5, yOf(1) + 4); ctx.fillText('0', F.l - 5, base + 4);
    ctx.save(); ctx.translate(12, F.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    ctx.fillText('amplitud', 0, 0); ctx.restore();
    // fc
    ctx.strokeStyle = C.car; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xOf(R.params.fc), F.t - 8); ctx.lineTo(xOf(R.params.fc), base); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.font = FONT;
    ctx.fillText('fc = ' + fmt(R.params.fc) + ' kHz (central)', xOf(R.params.fc), F.t - 14);
    // Δf
    if (xOf(fs[1]) - xOf(fs[0]) > 34) {
      const y = base - 14;
      ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xOf(fs[0]) + 4, y); ctx.lineTo(xOf(fs[1]) - 4, y); ctx.stroke();
      ctx.fillText('Δf', (xOf(fs[0]) + xOf(fs[1])) / 2, y - 4);
    }
    // tons
    R.alphabet.forEach((a, i) => {
      const x = xOf(a.f), y = yOf(1);
      const used = R.occurrences[a.m].length > 0;
      const isSel = a.m === selM;
      ctx.strokeStyle = isSel ? C.selLine : used ? C.freq : C.unused;
      ctx.lineWidth = isSel ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI);
      if (used) { ctx.fillStyle = C.freq; ctx.fill(); } else { ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.unused; ctx.stroke(); }
      if (isSel) { ctx.strokeStyle = C.selLine; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, 0, 2 * Math.PI); ctx.stroke(); }
      ctx.font = MONO_B; ctx.fillStyle = used ? C.text : C.muted; ctx.textAlign = 'center';
      const stagger = (R.M > 2 && i % 2) ? 14 : 0;
      ctx.fillText(a.bits, x, y - 16 - stagger);
      ctx.font = FONT_B; ctx.fillStyle = used ? C.freq : C.muted;
      ctx.fillText(fmt(a.f, 3), x, base + 48 + stagger * 0.0 + (i % 2 && R.M > 2 ? 14 : 0));
      hits.push({ m: a.m, x, y, stem: { base } });
    });
    ctx.font = FONT; ctx.fillStyle = C.muted; ctx.textAlign = 'left';
    ctx.fillText('kHz:', 4, base + 48);
    return hits;
  }

  // ---------------------------------------------------------------- vistes temporals
  function clampView(v, total, Ts) {
    v.span = clamp(v.span, Math.min(Ts, total), total);
    v.t0 = clamp(v.t0, 0, Math.max(0, total - v.span));
  }
  const NAVS = {
    lab: { view: () => state.view, total: () => R.Ttotal, Ts: () => R.Ts, redraw: () => drawTimeCharts() },
  };
  // emplena la pista dels controls lliscants fins al valor actual (només estètic)
  function paintRange(el) {
    const min = +el.min || 0, max = +el.max || 100, pct = max > min ? (+el.value - min) / (max - min) * 100 : 0;
    el.style.setProperty('--pct', pct + '%');
  }
  function paintRanges() { $$('input[type="range"]').forEach(paintRange); }
  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[type="range"]')) paintRange(e.target); });

  function updateNav(name) {
    const nav = NAVS[name], v = nav.view(), total = nav.total();
    const row = $('.nav-row[data-nav="' + name + '"]');
    const sl = $('[data-scroll]', row);
    const free = total - v.span;
    sl.disabled = free <= 1e-9;
    sl.value = free > 1e-9 ? Math.round(v.t0 / free * 1000) : 0;
    paintRange(sl);
    const nS = v.span / nav.Ts();
    $('[data-window]', row).textContent = 'Es veu de ' + fmt(v.t0, 2) + ' a ' + fmt(v.t0 + v.span, 2) + ' ms de ' + fmt(total, 2) + ' ms (' + fmt(nS, 1) + ' Tₛ)';
  }
  function zoomNav(name, how) {
    const nav = NAVS[name], v = nav.view(), total = nav.total(), Ts = nav.Ts();
    if (how === 'all') { v.t0 = 0; v.span = total; }
    else {
      const centre = name === 'lab' && state.sel != null ? R.symbols[state.sel].t0 + Ts / 2 : v.t0 + v.span / 2;
      v.span *= how === 'in' ? 1 / 1.6 : 1.6;
      clampView(v, total, Ts);
      v.t0 = centre - v.span / 2;
    }
    clampView(v, total, Ts);
    nav.redraw();
  }
  function ensureVisible(n) {
    const v = state.view, sym = R.symbols[n];
    if (sym.t0 >= v.t0 - 1e-9 && sym.t1 <= v.t0 + v.span + 1e-9) return;
    v.t0 = sym.t0 + R.Ts / 2 - v.span / 2;
    clampView(v, R.Ttotal, R.Ts);
  }

  // ---------------------------------------------------------------- renderització
  function drawTimeCharts() {
    if (!R) return;
    const o = { sel: state.sel, selM: state.selM, cursor: state.cursor, overlay: state.overlay };
    const list = [['cv-bits', 'bits'], ['cv-carrier', 'carrier'], ['cv-signal', 'signal']];
    if (R.mod === 'FSK') list.push(['cv-freq', 'freq']);
    list.forEach(([id, kind]) => {
      const cv = document.getElementById(id);
      const { ctx, w, h } = setupCanvas(cv, +cv.dataset.h);
      drawTime(ctx, w, h, kind, R, state.view, o);
    });
    updateNav('lab');
  }
  function drawConstellation() {
    if (!R) return;
    const cv = $('#cv-const');
    const w = Math.min(400, cv.parentNode.clientWidth);
    cv.style.width = w + 'px';
    const { ctx } = setupCanvas(cv, w);
    constHits = drawConst(ctx, w, R, state.selM);
  }

  function renderControls() {
    MODS.forEach(m => {
      const t = $('#tab-' + m), on = m === state.mod;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    $('#panel-lab').setAttribute('aria-labelledby', 'tab-' + state.mod);
    const selM = $('#sel-M');
    selM.innerHTML = L.MODULATIONS[state.mod].orders.map(M =>
      '<option value="' + M + '">M = ' + M + ' · ' + L.variantName(state.mod, M) + ' · ' + Math.log2(M) + ' bit' + (M > 2 ? 's' : '') + '/símbol</option>').join('');
    selM.value = state.M;
    $('#rng-Ts').value = state.Ts; $('#out-Ts').textContent = fmt(state.Ts, 1) + ' ms';
    $('#rng-fc').value = state.fc; $('#out-fc').textContent = fmt(state.fc, 1) + ' kHz';
    const isF = state.mod === 'FSK';
    $('#field-df').hidden = !isF;
    $('#fig-freq').hidden = !isF;
    const mx = Math.min(4, L.maxDf(state.fc, state.M));
    $('#rng-df').max = mx;
    if (state.df > mx) state.df = mx;
    $('#rng-df').value = state.df; $('#out-df').textContent = fmt(state.df, 2) + ' kHz';
    const hasMap = L.hasMapping(state.mod);
    $('#mapping-field').hidden = !hasMap;
    $$('input[name="mapping"]').forEach(r => { r.checked = r.value === state.mapping; });
    $('#chk-links').checked = state.showLinks;
    $('#chk-overlay').checked = state.overlay;
    $('#overlay-legend').hidden = !state.overlay;
    $('#sel-speed').value = String(state.speed);
    paintRanges();
  }

  function renderTexts() {
    const p = R.params, k = R.k;
    $('#mk-hint').innerHTML = 'M = ' + R.M + ' símbols diferents → k = log<sub>2</sub>(' + R.M + ') = <b>' + k + ' bit' + (k > 1 ? 's' : '') + ' per símbol</b>.';
    $('#mk-live').innerHTML = 'Ara: M = ' + R.M + ', k = ' + k + ' i la teva transmissió té <b>N = ' + R.nSym + ' símbols</b> (' + R.nBits + ' bits + ' + R.nPad + ' de farciment = ' + (R.nBits + R.nPad) + ' bits, dividits entre ' + k + ').';
    if (R.mod === 'FSK') {
      const lo = R.alphabet[0].f, hi = R.alphabet[R.M - 1].f;
      $('#cycles-hint').innerHTML = 'Cicles per símbol: entre ' + fmt(lo * p.Ts, 2) + ' i ' + fmt(hi * p.Ts, 2) + ' (f · T<sub>s</sub>, segons el to).';
      $('#df-hint').innerHTML = 'Tons de ' + fmt(lo, 3) + ' a ' + fmt(hi, 3) + ' kHz. Amb f<sub>c</sub> = ' + fmt(p.fc) + ' kHz, Δf pot arribar a ' + fmt(Math.min(4, L.maxDf(p.fc, R.M)), 2) + ' kHz perquè el to més baix sigui ≥ ' + fmt(L.MIN_TONE) + ' kHz.' +
        (R.dfClamped ? ' <span class="warn">S’ha limitat Δf.</span>' : '');
    } else {
      $('#cycles-hint').innerHTML = 'Cicles de portadora per símbol: f<sub>c</sub> · T<sub>s</sub> = <b>' + fmt(R.cyclesPerSymbol, 2) + '</b>.';
    }
    $('#carrier-legend').innerHTML = '<span>cos(2π f<sub>c</sub> t), f<sub>c</sub> = ' + fmt(p.fc) + ' kHz (un cicle cada ' + fmt(1 / p.fc, 3) + ' ms)' + (R.mod === 'FSK' ? ' · en FSK és la freqüència central de referència' : '') + '</span>';

    // Introducció
    const info = INFO[R.mod];
    $('#intro-card').innerHTML =
      '<h2>' + info.title + ' · ' + esc(R.name) + '</h2>' +
      '<p class="lead"><b>' + info.lead + '</b></p><p>' + info.more + '</p>' +
      '<details id="how"' + (state.howOpen ? ' open' : '') + '><summary>Com es calcula?</summary>' + howHTML(R) + '</details>';
    $('#how').addEventListener('toggle', e => { state.howOpen = e.target.open; });

    // Resum
    const stats = [
      ['Bits originals', R.nBits],
      ['Bits de farciment', R.nPad ? R.nPad + ' (zeros afegits)' : '0'],
      ['Bits per símbol, k', k],
      ['Símbols transmesos, N', R.nSym],
      ['Durada d’un símbol, T<sub>s</sub>', fmt(p.Ts, 2) + ' ms'],
      ['Taxa de símbols, R<sub>s</sub> = 1/T<sub>s</sub>', fmt(R.Rs, 1) + ' baud'],
      ['Taxa de bits, R<sub>b</sub> = k·R<sub>s</sub>', fmt(R.Rb, 1) + ' bit/s'],
      ['Durada total, N·T<sub>s</sub>', fmt(R.Ttotal, 2) + ' ms'],
    ];
    $('#stats').innerHTML = stats.map(([a, b]) => '<div><dt>' + a + '</dt><dd>' + b + '</dd></div>').join('');

    // Chips de símbols
    $('#chips').innerHTML = R.symbols.map(s =>
      '<button type="button" class="chip" data-n="' + s.n + '" aria-pressed="false" title="Símbol ' + (s.n + 1) + ': ' + s.bits + (s.hasPad ? ' (inclou farciment)' : '') + '">' +
      bitsHTML(s.bits, s.padMask) + '</button>').join('');

    // Constel·lació
    const isF = R.mod === 'FSK';
    $('#const-title').textContent = isF ? 'D. Diagrama de tons FSK' : R.mod === 'ASK' ? 'D. Estats d’amplitud sobre l’eix I' : 'D. Constel·lació I/Q';
    $('#const-note').innerHTML = isF
      ? 'En aquest laboratori, els símbols FSK s’identifiquen per la freqüència: cada barra és un to possible amb els bits associats.'
      : R.mod === 'ASK' ? 'Cada punt és un nivell d’amplitud (Q = 0). Escala igual als dos eixos.'
        : R.mod === 'PSK' ? 'Tots els punts són sobre la circumferència de radi 1: només canvia la fase. Escala igual als dos eixos.'
          : 'Graella I/Q amb escala igual als dos eixos. Les circumferències discontínues uneixen símbols amb la mateixa amplitud.';
    if (L.hasMapping(R.mod)) {
      const differs = L.mappingDiffers(R.mod, R.M);
      const bad = differs ? neighbours(R).filter(([a, b]) => hamming(a, b) > 1).length : 0;
      $('#chk-links-wrap').hidden = !differs;
      $('#mapping-hint').innerHTML = !differs
        ? 'Amb ' + esc(R.name) + ' les dues disposicions coincideixen: ' + (R.M === 2 ? 'només hi ha dos símbols.' : 'cada eix només té dos nivells i cada bit controla un eix.')
        : isGray(R)
          ? '<b>Gray:</b> tots els punts veïns difereixen en un sol bit. Si el soroll fa confondre un símbol amb un veí, només es perd 1 bit.'
          : '<b>Natural:</b> els punts segueixen l’ordre binari. Hi ha ' + bad + ' parell' + (bad === 1 ? '' : 's') + ' de veïns que difereixen en 2 o més bits (en vermell): confondre’ls costa més d’un bit.';
    }

    // Taules
    const cols = columns(R);
    $('#map-M').textContent = R.M;
    $('#map-kind').textContent = !L.hasMapping(R.mod) ? 'Correspondència fixa (ordre natural dels tons)'
      : !L.mappingDiffers(R.mod, R.M) ? 'Correspondència fixa (natural i Gray coincideixen)'
        : 'Correspondència fixa amb disposició ' + (isGray(R) ? 'Gray' : 'binària natural');
    $('#map-table').innerHTML = '<thead><tr><th scope="col">Bits</th><th scope="col">m</th>' + cols.map(c => '<th scope="col">' + c.h + '</th>').join('') + '<th scope="col">Aparicions a les dades</th></tr></thead><tbody>' +
      R.alphabet.map(a => {
        const n = R.occurrences[a.m].length;
        return '<tr tabindex="0" data-m="' + a.m + '" class="' + (n ? '' : 'unused') + '"><td class="mono">' + a.bits + '</td><td>' + a.m + '</td>' +
          cols.map(c => '<td>' + c.f(a) + '</td>').join('') + '<td>' + (n ? n + (n > 1 ? ' vegades' : ' vegada') : 'cap') + '</td></tr>';
      }).join('') + '</tbody>';
    $('#tx-table').innerHTML = '<thead><tr><th scope="col">Símbol</th><th scope="col">Interval (ms)</th><th scope="col">Bits</th><th scope="col">m</th>' + cols.map(c => '<th scope="col">' + c.h + '</th>').join('') + '</tr></thead><tbody>' +
      R.symbols.map(s => '<tr tabindex="0" data-n="' + s.n + '"><td>S' + (s.n + 1) + '</td><td>' + fmt(s.t0, 2) + ' – ' + fmt(s.t1, 2) + '</td><td class="mono">' + bitsHTML(s.bits, s.padMask) + (s.hasPad ? ' <span class="small">(farciment)</span>' : '') + '</td><td>' + s.m + '</td>' +
        cols.map(c => '<td>' + c.f(s.state) + '</td>').join('') + '</tr>').join('') + '</tbody>';
  }

  function renderDetail() {
    const box = $('#detail');
    box.setAttribute('aria-live', state.playing ? 'off' : 'polite');
    if (state.selM == null) { box.innerHTML = '<h2>Símbol seleccionat</h2><p class="hint">Fes clic en un símbol.</p>'; return; }
    const a = R.alphabet[state.selM], p = R.params;
    const sym = state.sel != null ? R.symbols[state.sel] : null;
    const occ = R.occurrences[a.m];
    let h = '<h2><span>' + (sym ? 'Símbol seleccionat: S' + (sym.n + 1) : 'Símbol possible: ' + a.bits) + '</span><span class="small">' + (sym ? 'posició ' + (sym.n + 1) + ' de ' + R.nSym : 'no apareix a les dades') + '</span></h2>';
    h += '<div class="bigbits" aria-label="Bits ' + a.bits.split('').join(' ') + '">' + bitsHTML(a.bits, sym && sym.padMask) + '</div>';
    if (sym && sym.hasPad) h += '<p class="warn">Inclou ' + sym.padMask.filter(Boolean).length + ' bit(s) de farciment (en taronja) afegit(s) per completar el grup de ' + R.k + '.</p>';
    h += '<dl class="props">';
    h += '<dt>Valor del grup, m</dt><dd>' + a.m + ' (binari ' + a.bits + ', MSB primer)</dd>';
    if (sym) h += '<dt>Interval</dt><dd>' + fmt(sym.t0, 3) + ' – ' + fmt(sym.t1, 3) + ' ms</dd>';
    if (isGray(R) && R.mod !== 'QAM') h += '<dt>Posició a la constel·lació, i</dt><dd>' + a.pos + ' (codi Gray de ' + a.pos + ' = ' + a.bits + ')</dd>';
    if (L.hasMapping(R.mod) && L.mappingDiffers(R.mod, R.M)) {
      const nb = neighbours(R).filter(([x, y]) => x === a.m || y === a.m).map(([x, y]) => R.alphabet[x === a.m ? y : x]);
      h += '<dt>Veïns a la constel·lació</dt><dd>' + nb.map(b => b.bits + ' (' + hamming(a.m, b.m) + ' bit' + (hamming(a.m, b.m) > 1 ? 's' : '') + ')').join(', ') + '</dd>';
    }
    if (R.mod === 'ASK') {
      h += '<dt>Amplitud, A</dt><dd>' + askAmpStr(a.pos, R.M) + (R.M === 4 && a.pos > 0 && a.pos < 3 ? ' ≈ ' + fmt(a.A, 3) : '') + '</dd>';
      h += '<dt>Freqüència</dt><dd>' + fmt(p.fc) + ' kHz (constant)</dd>';
      h += '<dt>Fase</dt><dd>' + (a.A > 0 ? '0° (constant)' : 'no observable: no hi ha portadora') + '</dd>';
    } else if (R.mod === 'FSK') {
      h += '<dt>Freqüència, f<sub>m</sub></dt><dd>' + fmt(a.f, 3) + ' kHz</dd>';
      h += '<dt>Càlcul</dt><dd>' + fmt(p.fc) + ' + (' + fmt(a.m - (R.M - 1) / 2, 2) + ') · ' + fmt(p.df, 3) + ' = ' + fmt(a.f, 3) + ' kHz</dd>';
      h += '<dt>Cicles en el símbol</dt><dd>' + fmt(a.f * p.Ts, 3) + '</dd>';
      h += '<dt>Amplitud</dt><dd>1 (constant)</dd>';
      if (sym) h += '<dt>Fase en començar (CPFSK)</dt><dd>' + fmt(((sym.phaseStart * 180 / Math.PI) % 360 + 360) % 360, 1) + '° (acumulada, sense salts)</dd>';
    } else if (R.mod === 'PSK') {
      h += '<dt>Fase, φ</dt><dd>' + fmt(a.phaseDeg, 1) + '° = 360° · ' + a.pos + '/' + R.M + '</dd>';
      h += '<dt>Amplitud</dt><dd>1 (constant)</dd>';
      h += '<dt>I = cos φ · Q = sin φ</dt><dd>' + fmt(a.I, 3) + ' · ' + fmt(a.Q, 3) + '</dd>';
    } else {
      h += '<dt>I</dt><dd>' + qamStr(a.levelI, R.M) + ' ≈ ' + fmt(a.I, 3) + ' (bits ' + (R.M === 4 ? a.bits[0] : a.bits.slice(0, 2)) + ')</dd>';
      h += '<dt>Q</dt><dd>' + qamStr(a.levelQ, R.M) + ' ≈ ' + fmt(a.Q, 3) + ' (bits ' + (R.M === 4 ? a.bits[1] : a.bits.slice(2)) + ')</dd>';
      h += '<dt>Amplitud √(I²+Q²)</dt><dd>' + fmt(a.A, 3) + '</dd>';
      h += '<dt>Fase atan2(Q, I)</dt><dd>' + fmt(a.phaseDeg, 1) + '°</dd>';
      if (R.M === 16) {
        const same = R.alphabet.filter(b => b.m !== a.m && Math.abs(b.A - a.A) < 1e-9).map(b => b.bits);
        h += '<dt>Mateixa amplitud</dt><dd>' + same.join(', ') + '</dd>';
      }
    }
    h += '</dl>';
    if (occ.length) {
      const idx = sym ? occ.indexOf(sym.n) : -1;
      h += '<div class="occ-nav"><span>Aquest símbol apareix <b>' + occ.length + '</b> ' + (occ.length > 1 ? 'vegades' : 'vegada') + (idx >= 0 ? ' · ocurrència ' + (idx + 1) + ' de ' + occ.length : '') + '.</span>';
      if (occ.length > 1 || idx < 0) h += '<button type="button" data-occ="-1">◀ Anterior</button><button type="button" data-occ="1">Següent ▶</button>';
      h += '</div><p class="small">Posicions: ' + occ.map(n => 'S' + (n + 1)).join(', ') + '</p>';
    } else {
      h += '<p class="hint">Aquest símbol és possible amb ' + esc(R.name) + ' però no apareix a les dades actuals.</p>';
    }
    box.innerHTML = h;
  }

  function renderSelection(scrollTables) {
    $$('#chips .chip').forEach(b => {
      const n = +b.dataset.n;
      b.setAttribute('aria-pressed', n === state.sel ? 'true' : 'false');
      b.classList.toggle('occ', n !== state.sel && R.symbols[n].m === state.selM);
    });
    $$('#map-table tbody tr').forEach(tr => tr.classList.toggle('is-sel', +tr.dataset.m === state.selM));
    $$('#tx-table tbody tr').forEach(tr => {
      const n = +tr.dataset.n;
      tr.classList.toggle('is-sel', n === state.sel);
      tr.classList.toggle('is-occ', n !== state.sel && R.symbols[n].m === state.selM);
    });
    if (scrollTables && state.sel != null) {
      const tr = $('#tx-table tbody tr[data-n="' + state.sel + '"]');
      const wrap = tr && tr.closest('.table-wrap');
      if (wrap) {
        const top = tr.offsetTop - wrap.clientHeight / 2;
        wrap.scrollTop = Math.max(0, top);
      }
    }
    renderDetail();
    drawTimeCharts();
    drawConstellation();
  }

  function renderAll() {
    renderControls();
    renderTexts();
    renderSelection(false);
    updatePlayButtons();
  }

  // ---------------------------------------------------------------- selecció
  function selectSymbol(n, opts) {
    if (!R || n == null) return;
    n = clamp(n, 0, R.nSym - 1);
    state.sel = n;
    state.selM = R.symbols[n].m;
    if (!(opts && opts.keepCursor)) state.cursor = null;
    ensureVisible(n);
    renderSelection(true);
  }
  function selectValue(m) {
    const occ = R.occurrences[m];
    stopPlay();
    if (occ.length) {
      if (state.selM === m && state.sel != null) {
        const i = occ.indexOf(state.sel);
        selectSymbol(occ[(i + 1) % occ.length]);
      } else selectSymbol(occ[0]);
    } else {
      state.sel = null; state.selM = m; state.cursor = null;
      renderSelection(false);
    }
  }
  function stepOcc(dir) {
    const occ = R.occurrences[state.selM];
    if (!occ.length) return;
    const i = state.sel != null ? occ.indexOf(state.sel) : -1;
    const j = i < 0 ? (dir > 0 ? 0 : occ.length - 1) : (i + dir + occ.length) % occ.length;
    stopPlay();
    selectSymbol(occ[j]);
  }

  // ---------------------------------------------------------------- reproducció
  let lastFrame = null;
  function play() {
    if (!R) return;
    if (state.cursor == null || state.cursor >= R.Ttotal - 1e-9) {
      state.cursor = state.cursor != null && state.cursor >= R.Ttotal - 1e-9 ? 0
        : state.sel != null && state.sel < R.nSym - 1 ? R.symbols[state.sel].t0 : 0;
    }
    state.playing = true;
    lastFrame = null;
    updatePlayButtons();
    requestAnimationFrame(tick);
  }
  function stopPlay() {
    state.playing = false;
    updatePlayButtons();
  }
  function tick(now) {
    if (!state.playing || !R) return;
    if (lastFrame == null) lastFrame = now;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    state.cursor += dt * state.speed * R.Ts;
    if (state.cursor >= R.Ttotal) { state.cursor = R.Ttotal; state.playing = false; updatePlayButtons(); }
    const v = state.view;
    if (state.cursor > v.t0 + v.span * 0.85 || state.cursor < v.t0) {
      v.t0 = state.cursor - v.span * 0.15;
      clampView(v, R.Ttotal, R.Ts);
    }
    const n = L.symbolAtTime(R, state.cursor);
    if (n !== state.sel && n != null) {
      state.sel = n; state.selM = R.symbols[n].m;
      renderSelection(true);
    } else drawTimeCharts();
    if (state.playing) requestAnimationFrame(tick);
    else renderDetail();
  }
  function updatePlayButtons() {
    $('#btn-play').disabled = state.playing;
    $('#btn-pause').disabled = !state.playing;
    $('#btn-play').textContent = state.cursor != null && !state.playing && state.cursor < R.Ttotal - 1e-9 && state.cursor > 0 ? '▶ Continua' : '▶ Reprodueix';
  }

  // ---------------------------------------------------------------- exportació
  function paramsLine(r) {
    return r.name + ' (M = ' + r.M + ', k = ' + r.k + ') · Ts = ' + fmt(r.params.Ts, 2) + ' ms · fc = ' + fmt(r.params.fc, 2) + ' kHz' +
      (r.mod === 'FSK' ? ' · Δf = ' + fmt(r.params.df, 3) + ' kHz' : '') +
      (L.mappingDiffers(r.mod, r.M) ? ' · disposició ' + (r.mapping === 'gray' ? 'Gray' : 'binària natural') : '');
  }
  function exportPNG() {
    const W = 1400, S = 1.5, pad = 28;
    const lines = [], blocks = [];
    let H = pad;
    const title = 'Laboratori de modulacions digitals';
    lines.push(paramsLine(R));
    lines.push('Bits originals (' + R.nBits + '): ' + R.bits + (R.nPad ? '  +  farciment: ' + '0'.repeat(R.nPad) : ''));
    lines.push('N = ' + R.nSym + ' símbols · Rs = ' + fmt(R.Rs, 1) + ' baud · Rb = ' + fmt(R.Rb, 1) + ' bit/s · durada total ' + fmt(R.Ttotal, 2) + ' ms');
    lines.push('Finestra temporal mostrada: ' + fmt(state.view.t0, 2) + '–' + fmt(state.view.t0 + state.view.span, 2) + ' ms' + (state.sel != null ? ' · símbol seleccionat: S' + (state.sel + 1) + ' (' + R.symbols[state.sel].bits + ')' : ''));
    H += 34 + lines.length * 20 + 10;
    const o = { sel: state.sel, selM: state.selM, overlay: state.overlay };
    blocks.push({ label: 'A. Bits i agrupació en símbols', h: 130, draw: (c, w, h) => drawTime(c, w, h, 'bits', R, state.view, o) });
    blocks.push({ label: 'B. Portadora de referència (fc = ' + fmt(R.params.fc) + ' kHz)', h: 100, draw: (c, w, h) => drawTime(c, w, h, 'carrier', R, state.view, o) });
    blocks.push({ label: 'C. Senyal modulat transmès s(t)', h: 240, draw: (c, w, h) => drawTime(c, w, h, 'signal', R, state.view, o) });
    if (R.mod === 'FSK') blocks.push({ label: 'C2. Freqüència al llarg del temps', h: 130, draw: (c, w, h) => drawTime(c, w, h, 'freq', R, state.view, o) });
    blocks.forEach(b => { H += 24 + b.h + 10; });
    const bottomH = Math.max(470, 60 + R.M * 22);
    H += bottomH + pad;

    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    const ctx = cv.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    let y = pad;
    ctx.fillStyle = C.text; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(title, pad, y + 20); y += 34;
    ctx.font = '14px system-ui, sans-serif';
    lines.forEach(l => { ctx.fillText(l.length > 190 ? l.slice(0, 187) + '…' : l, pad, y + 14); y += 20; });
    y += 10;
    blocks.forEach(b => {
      ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = C.text; ctx.textAlign = 'left';
      ctx.fillText(b.label, pad, y + 16); y += 24;
      ctx.save(); ctx.translate(pad, y);
      b.draw(ctx, W - 2 * pad, b.h);
      ctx.restore();
      y += b.h + 10;
    });
    {
      ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = C.text;
      ctx.fillText(R.mod === 'FSK' ? 'D. Diagrama de tons' : 'D. Constel·lació / estats', pad, y + 16);
      ctx.fillText('E. Taula de correspondències', pad + 480, y + 16);
      ctx.save(); ctx.translate(pad, y + 24); drawConst(ctx, 430, R, state.selM); ctx.restore();
      const cols = columns(R);
      const heads = ['Bits', 'm'].concat(cols.map(c => c.h), ['Aparicions']);
      const colW = [70, 40].concat(cols.map(() => 165), [90]);
      let ty = y + 50;
      const drawRow = (cells, bold, hl) => {
        let x = pad + 480;
        if (hl) { ctx.fillStyle = C.sel; ctx.fillRect(x - 4, ty - 15, colW.reduce((a, b) => a + b, 0), 21); }
        ctx.fillStyle = C.text; ctx.font = (bold ? 'bold ' : '') + '13px system-ui, sans-serif';
        cells.forEach((c, i) => { ctx.fillText(String(c), x, ty); x += colW[i]; });
        ty += 22;
      };
      drawRow(heads, true);
      R.alphabet.forEach(a => drawRow([a.bits, a.m].concat(cols.map(c => c.f(a)), [R.occurrences[a.m].length]), false, a.m === state.selM));
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = C.muted;
      ctx.fillText('Model idealitzat amb canvis de símbol abruptes. Freqüències de simulació baixes per facilitar la visualització.', pad + 480, ty + 10);
    }
    const name = 'modulacio_' + fileSafe(R.name) + '.png';
    cv.toBlob(b => download(name, b), 'image/png');
  }

  function pad(s, n) { s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); }
  function textTable(head, rows) {
    const w = head.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i]).length)) + 1);
    return [head, ...rows].map(r => r.map((c, i) => pad(c, w[i])).join('| ').trimEnd()).join('\n');
  }
  function exportTXT() {
    const r = R, cols = columns(r);
    const out = [];
    out.push('LABORATORI DE MODULACIONS DIGITALS — Resum de dades');
    out.push('Generat: ' + new Date().toLocaleString('ca-ES'));
    out.push('');
    out.push('== Paràmetres ==');
    out.push('Modulació: ' + r.name);
    out.push('M = ' + r.M + ' símbols diferents; k = log2(M) = ' + r.k + ' bits per símbol');
    out.push('Durada del símbol Ts = ' + fmt(r.params.Ts, 3) + ' ms');
    out.push('Freqüència de la portadora fc = ' + fmt(r.params.fc, 3) + ' kHz (' + fmt(r.cyclesPerSymbol, 3) + ' cicles per símbol)');
    if (r.mod === 'FSK') out.push('Separació entre tons Δf = ' + fmt(r.params.df, 3) + ' kHz (FSK de fase contínua)' + (r.dfClamped ? ' [limitat per evitar freqüències ≤ 0]' : ''));
    if (L.hasMapping(r.mod)) out.push('Disposició dels bits a la constel·lació: ' + (r.mapping === 'gray' ? 'Gray' : 'binària natural') + (L.mappingDiffers(r.mod, r.M) ? '' : ' (amb aquesta modulació natural i Gray coincideixen)'));
    out.push('Mostres per símbol: ' + r.sps + ' (' + fmt(r.samplesPerCycle, 1) + ' mostres per cicle de la freqüència màxima)');
    out.push('');
    out.push('== Dades ==');
    out.push('Bits originals (' + r.nBits + '): ' + r.bits);
    out.push('Bits de farciment: ' + r.nPad + (r.nPad ? ' (zeros afegits al final, entre [ ] als grups)' : ''));
    out.push('Grups de k bits: ' + r.symbols.map(s => bitsTXT(s.bits, s.padMask)).join(' '));
    out.push('');
    out.push('== Resultats ==');
    out.push('Símbols transmesos N = ' + r.nSym);
    out.push('Taxa de símbols Rs = 1/Ts = ' + fmt(r.Rs, 2) + ' baud');
    out.push('Taxa de bits Rb = k·Rs = ' + fmt(r.Rb, 2) + ' bit/s');
    out.push('Durada total del senyal = N·Ts = ' + fmt(r.Ttotal, 3) + ' ms');
    out.push('');
    out.push('== Correspondència de símbols (MSB primer) ==');
    out.push(textTable(['Bits', 'm'].concat(cols.map(c => c.h), ['Aparicions']),
      r.alphabet.map(a => [a.bits, a.m].concat(cols.map(c => c.f(a)), [r.occurrences[a.m].length]))));
    out.push('');
    out.push('== Seqüència transmesa ==');
    out.push(textTable(['Símbol', 'Interval (ms)', 'Bits', 'm'].concat(cols.map(c => c.h)),
      r.symbols.map(s => ['S' + (s.n + 1), fmt(s.t0, 3) + ' – ' + fmt(s.t1, 3), bitsTXT(s.bits, s.padMask), s.m].concat(cols.map(c => c.f(s.state))))));
    out.push('');
    out.push('Notes: model idealitzat amb símbols de durada constant i canvis abruptes (sense filtratge ni conformació de polsos).');
    out.push('Freqüències de simulació baixes triades per facilitar la visualització; una transmissió real usaria una portadora de la banda de ràdio.');
    download('modulacio_' + fileSafe(r.name) + '_resum.txt', new Blob(['﻿' + out.join('\n')], { type: 'text/plain;charset=utf-8' }));
  }
  function exportCSV() {
    const r = R, cols = columns(r);
    const num = v => typeof v === 'number' ? String(+v.toFixed(6)).replace('.', ',') : v;
    const rows = [['simbol', 't_inici_ms', 't_final_ms', 'bits', 'bits_farciment', 'm'].concat(cols.map(c => c.h))];
    r.symbols.forEach(s => rows.push(['S' + (s.n + 1), num(s.t0), num(s.t1), "'" + s.bits, s.padMask.filter(Boolean).length, s.m].concat(cols.map(c => num(c.csv(s.state))))));
    const csv = rows.map(row => row.map(c => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
    download('modulacio_' + fileSafe(r.name) + '_simbols.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  }

  // ---------------------------------------------------------------- entrada de bits
  function formatBits(b) { return b.replace(/(.{8})(?=.)/g, '$1 '); }
  function onBitsInput() {
    const txt = $('#bits-input').value;
    const res = L.parseBits(txt);
    $('#bits-count').textContent = res.bits.length + ' / ' + L.MAX_BITS + ' bits';
    const err = $('#bits-error');
    if (!res.ok) {
      err.hidden = false; err.textContent = res.error;
      $('#bits-input').setAttribute('aria-invalid', 'true');
      $('#stale-banner').hidden = false;
      return;
    }
    err.hidden = true; err.textContent = '';
    $('#bits-input').removeAttribute('aria-invalid');
    $('#stale-banner').hidden = true;
    state.bits = res.bits;
    recompute();
  }
  function setBits(b) {
    $('#bits-input').value = formatBits(b);
    onBitsInput();
  }

  // ---------------------------------------------------------------- esdeveniments
  function timeCanvasClick(e) {
    const cv = e.currentTarget;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pw = rect.width - FRAME.l - FRAME.r;
    if (x < FRAME.l || x > FRAME.l + pw) return;
    const t = state.view.t0 + (x - FRAME.l) / pw * state.view.span;
    const n = L.symbolAtTime(R, t);
    if (n == null) return;
    stopPlay();
    selectSymbol(n);
  }
  function timeCanvasKey(e) {
    const map = { ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in map) { e.preventDefault(); stopPlay(); selectSymbol((state.sel == null ? 0 : state.sel) + map[e.key]); }
    else if (e.key === 'Home') { e.preventDefault(); stopPlay(); selectSymbol(0); }
    else if (e.key === 'End') { e.preventDefault(); stopPlay(); selectSymbol(R.nSym - 1); }
  }

  function bind() {
    $('#bits-input').value = DEFAULTS.text;
    $('#bits-input').addEventListener('input', onBitsInput);
    $('#btn-random').addEventListener('click', () => {
      const n = L.parseBits($('#bits-input').value).ok ? state.bits.length : 24;
      let b = ''; for (let i = 0; i < n; i++) b += Math.random() < 0.5 ? '0' : '1';
      setBits(b);
    });
    $('#btn-alt').addEventListener('click', () => {
      const n = L.parseBits($('#bits-input').value).ok ? state.bits.length : 24;
      let b = ''; for (let i = 0; i < n; i++) b += i % 2 ? '0' : '1';
      setBits(b);
    });
    $('#btn-reset').addEventListener('click', () => {
      stopPlay();
      Object.assign(state, { mod: DEFAULTS.mod, M: DEFAULTS.M, Ts: DEFAULTS.Ts, fc: DEFAULTS.fc, df: DEFAULTS.df, overlay: DEFAULTS.overlay, speed: DEFAULTS.speed, mapping: DEFAULTS.mapping, showLinks: DEFAULTS.showLinks, lastM: Object.assign({}, DEFAULT_M), sel: 0, selM: null, cursor: null, viewKey: '' });
      $('#bits-input').value = DEFAULTS.text;
      onBitsInput();
    });
    const setMod = mod => {
      if (mod === state.mod) return;
      state.lastM[state.mod] = state.M;
      state.mod = mod;
      state.M = state.lastM[state.mod];
      recompute();
    };
    // pestanyes de modulació (fletxes, Inici i Fi per moure’s entre pestanyes)
    MODS.forEach((m, i) => {
      const t = $('#tab-' + m);
      t.addEventListener('click', () => setMod(m));
      t.addEventListener('keydown', e => {
        const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: MODS.length - 1 }[e.key];
        if (j == null) return;
        e.preventDefault();
        const o = MODS[(j + MODS.length) % MODS.length];
        $('#tab-' + o).focus();
        setMod(o);
      });
    });
    $('#sel-M').addEventListener('change', e => { state.M = +e.target.value; recompute(); });
    $('#rng-Ts').addEventListener('input', e => { state.Ts = +e.target.value; recompute(); });
    $('#rng-fc').addEventListener('input', e => { state.fc = +e.target.value; recompute(); });
    $('#rng-df').addEventListener('input', e => { state.df = +e.target.value; recompute(); });
    $$('input[name="mapping"]').forEach(r => r.addEventListener('change', e => { if (e.target.checked) { state.mapping = e.target.value; recompute(); } }));
    $('#chk-links').addEventListener('change', e => { state.showLinks = e.target.checked; drawConstellation(); });
    $('#chk-overlay').addEventListener('change', e => { state.overlay = e.target.checked; $('#overlay-legend').hidden = !state.overlay; drawTimeCharts(); });
    $('#sel-speed').addEventListener('change', e => { state.speed = +e.target.value; });

    $('#btn-play').addEventListener('click', play);
    $('#btn-pause').addEventListener('click', () => { stopPlay(); renderDetail(); });
    $('#btn-prev').addEventListener('click', () => { stopPlay(); selectSymbol(state.sel == null ? 0 : state.sel - 1); });
    $('#btn-next').addEventListener('click', () => { stopPlay(); selectSymbol(state.sel == null ? 0 : state.sel + 1); });

    ['cv-bits', 'cv-carrier', 'cv-signal', 'cv-freq'].forEach(id => {
      const cv = document.getElementById(id);
      cv.addEventListener('click', timeCanvasClick);
      cv.addEventListener('keydown', timeCanvasKey);
    });
    const cc = $('#cv-const');
    cc.addEventListener('click', e => {
      const rect = cc.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let best = null, bd = 22;
      constHits.forEach(h => {
        let d = Math.hypot(h.x - x, h.y - y);
        if (h.stem && Math.abs(h.x - x) < 12 && y >= h.y - 10 && y <= h.stem.base + 60) d = Math.min(d, Math.abs(h.x - x));
        if (d < bd) { bd = d; best = h; }
      });
      if (best) selectValue(best.m);
    });
    cc.addEventListener('keydown', e => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (dir) { e.preventDefault(); selectValue(((state.selM == null ? 0 : state.selM) + dir + R.M) % R.M); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (state.selM != null) selectValue(state.selM); }
    });
    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (b) { stopPlay(); selectSymbol(+b.dataset.n); }
    });
    const rowAct = (sel, fn) => {
      const t = $(sel);
      t.addEventListener('click', e => { const tr = e.target.closest('tbody tr'); if (tr) fn(tr); });
      t.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const tr = e.target.closest('tbody tr'); if (!tr) return;
        e.preventDefault(); fn(tr);
        const again = $(sel + ' tbody tr[data-' + (tr.dataset.m != null ? 'm="' + tr.dataset.m : 'n="' + tr.dataset.n) + '"]');
        if (again) again.focus();
      });
    };
    rowAct('#map-table', tr => selectValue(+tr.dataset.m));
    rowAct('#tx-table', tr => { stopPlay(); selectSymbol(+tr.dataset.n); });
    $('#detail').addEventListener('click', e => { const b = e.target.closest('[data-occ]'); if (b) stepOcc(+b.dataset.occ); });

    // navegació temporal
    $$('[data-nav]').forEach(el => {
      const name = el.dataset.nav;
      el.addEventListener('click', e => { const b = e.target.closest('[data-zoom]'); if (b) zoomNav(name, b.dataset.zoom); });
      const sl = $('[data-scroll]', el);
      if (sl) sl.addEventListener('input', () => {
        const nav = NAVS[name], v = nav.view();
        v.t0 = (+sl.value / 1000) * (nav.total() - v.span);
        clampView(v, nav.total(), nav.Ts());
        nav.redraw();
      });
    });

    $('#btn-png').addEventListener('click', exportPNG);
    $('#btn-txt').addEventListener('click', exportTXT);
    $('#btn-csv').addEventListener('click', exportCSV);

    let rz = null;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(() => { drawTimeCharts(); drawConstellation(); });
    });
    ro.observe($('main'));
  }

  bind();
  onBitsInput();
  window.__lab = { state, get R() { return R; } }; // per a depuració
})();
