'use strict';
/* ===== Pixy engine: objects, keyframes, 3D pose, rendering ===== */
const D2R = Math.PI / 180, FOC = 1000, EPS = 0.02, RES = 2;
const KEYS = ['x', 'y', 'z', 'sx', 'sy', 'rot', 'rx', 'ry', 'op', 'bl', 'gl', 'sh', 'skx', 'fov', 'dist', 'fd', 'dof', 'fbs', 'fgn', 'fgf', 'cbl', 'cgl', 'vig', 'tia'];
const DEFK = { x: 0, y: 0, z: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0, op: 1, bl: 0, gl: 0, sh: 0, skx: 0, fov: 60, dist: 1000, fd: 1000, dof: 400, fbs: 20, fgn: 1500, fgf: 4000, cbl: 0, cgl: 0, vig: 0, tia: 0 };
const CAMVZ = 0.72;
const nz = (v, k) => (v === undefined || v === null || isNaN(v) ? DEFK[k] : v);
const DEF_EASE = [0.42, 0, 0.58, 1];
const EASES = {
  lin: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], easein: [0.42, 0, 1, 1],
  easeout: [0, 0, 0.58, 1], easeio: [0.42, 0, 0.58, 1], back: [0.34, 1.56, 0.64, 1], snap: [0.8, 0, 0.2, 1]
};
const FONTS = { sans: 'Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif', medium: '"sans-serif-medium", Roboto, "Noto Sans Devanagari", sans-serif', light: '"sans-serif-light", Roboto, "Noto Sans Devanagari", sans-serif', black: '"sans-serif-black", Roboto, "Noto Sans Devanagari", sans-serif', cond: '"sans-serif-condensed", "Roboto Condensed", "Noto Sans Devanagari", sans-serif', serif: '"Noto Serif", "Noto Serif Devanagari", serif', mono: '"Droid Sans Mono", monospace', hand: '"Dancing Script", cursive', casual: 'casual, "Comic Neue", cursive', cursive: 'cursive, "Dancing Script"' };

/* advanced (non-bezier) speed curves */
const ADV = {
  bounce: x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; },
  elastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  steps: x => Math.min(1, Math.floor(x * 5) / 4)
};
function easeOf(k) { return k && k.a && ADV[k.a] ? ADV[k.a] : bezFn((k && k.e) || DEF_EASE); }
function easeCopy(left) { return left ? { e: left.e ? left.e.slice() : DEF_EASE.slice(), a: left.a || null } : { e: DEF_EASE.slice(), a: null }; }
const _bz = {};
function bezFn(e) {
  const key = e.join(',');
  if (_bz[key]) return _bz[key];
  const [x1, y1, x2, y2] = e;
  let f;
  if (x1 === y1 && x2 === y2) f = t => t;
  else {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    f = x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = X(t) - x; if (Math.abs(d) < 1e-6) return Y(t);
        const dd = dX(t); if (Math.abs(dd) < 1e-6) break; t -= d / dd;
      }
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
      return Y(t);
    };
  }
  return (_bz[key] = f);
}

/* ---------- pose ---------- */
function poseOf(o, t) {
  const kf = o.kf;
  if (!kf || !kf.length) { const p = {}; for (const k of KEYS) p[k] = nz(o[k], k); return p; }
  const full = q => { const p = {}; for (const k of KEYS) p[k] = nz(q.p[k], k); return p; };
  if (t <= kf[0].t) return full(kf[0]);
  const L = kf[kf.length - 1];
  if (t >= L.t) return full(L);
  let i = 0; while (i < kf.length - 2 && t >= kf[i + 1].t) i++;
  const a = kf[i], b = kf[i + 1];
  const v = easeOf(a)((t - a.t) / (b.t - a.t));
  const p = {}; for (const k of KEYS) { const u0 = nz(a.p[k], k); p[k] = u0 + (nz(b.p[k], k) - u0) * v; }
  return p;
}
function keyAt(o, t) { return (o.kf || []).find(k => Math.abs(k.t - t) < EPS) || null; }

/* ---------- editor state ---------- */
const E = {
  P: null, sel: null, t: 0, cam: true, playing: false,
  undo: [], redo: [], onchange: null, cv: null, ctx: null, pend: false
};
const IMGS = new Map(), VIDS = new Map(), TXC = new Map();

function find(id) { return E.P ? E.P.objects.find(o => o.id === id) : null; }
function selObj() { return find(E.sel); }
function wpose(o, t, d) {
  const p = poseOf(o, t); d = d || 0;
  if (o.par && d < 8) {
    const q = find(o.par);
    if (q) {
      const w = wpose(q, t, d + 1), c = Math.cos(w.rot * D2R), s = Math.sin(w.rot * D2R);
      const lx = p.x * w.sx, ly = p.y * w.sy;
      return Object.assign({}, p, { x: w.x + lx * c - ly * s, y: w.y + lx * s + ly * c, z: w.z + p.z, sx: w.sx * p.sx, sy: w.sy * p.sy, rot: w.rot + p.rot, rx: w.rx + p.rx, ry: w.ry + p.ry, op: w.op * p.op });
    }
  }
  return p;
}
function endOf(o) { return o.full ? Math.max(E.P.dur, o.t0 + 0.001) : o.t1; }
function visibleAt(o, t) { return o.vis !== false && t >= o.t0 - 1e-6 && (o.full ? t <= Math.max(E.P.dur, 0.001) + 1e-6 : (t < o.t1 - 1e-6 || (o.t1 >= E.P.dur - 1e-6 && t <= o.t1 + 1e-6))); }

function newObj(type, extra) {
  return Object.assign({
    id: uid(), type, name: '', x: 0, y: 0, z: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0, op: 1,
    t0: 0, t1: 5, w: 400, h: 400, bl: 0, gl: 0, sh: 0, par: null, vis: true, lock: false, mute: false, speed: 1, vo: 0, kf: [], fx: {}
  }, extra || {});
}

/* ---------- undo ---------- */
function snapJSON() { return JSON.stringify({ o: E.P.objects, dur: E.P.dur, bg: E.P.bg }, (k, v) => (k[0] === '_' ? undefined : v)); }
function pushUndo() {
  const s = snapJSON();
  if (E.undo.length && E.undo[E.undo.length - 1] === s) return;
  E.undo.push(s); if (E.undo.length > 60) E.undo.shift(); E.redo = [];
  if (E.onchange) E.onchange('undo');
}
function restore(s) {
  const d = JSON.parse(s); E.P.objects = d.o; E.P.dur = d.dur; E.P.bg = d.bg;
  if (E.sel && !find(E.sel)) E.sel = null;
}
function doUndo() { if (!E.undo.length) return; E.redo.push(snapJSON()); restore(E.undo.pop()); changed('struct'); }
function doRedo() { if (!E.redo.length) return; E.undo.push(snapJSON()); restore(E.redo.pop()); changed('struct'); }
function changed(kind) {
  E.P.updated = Date.now();
  if (kind === 'struct') { fitDur(); if (E.t > E.P.dur) E.t = Math.max(0, E.P.dur); }
  if (E.onchange) E.onchange(kind || 'pose'); render();
}
// project length = end of the last real layer (image / video / text / shape). Camera and null follow it.
function fitDur() {
  let m = 0, any = false;
  E.P.objects.forEach(o => { if (!o.full) { any = true; m = Math.max(m, o.t1); } });
  if (any) E.P.dur = Math.round(m * 100) / 100;
}

/* ---------- editing ---------- */
function setPose(o, ch, t) {
  if (o.kf && o.kf.length) {
    let k = keyAt(o, t);
    if (!k) {
      const left = [...o.kf].reverse().find(q => q.t < t);
      k = Object.assign({ t, p: poseOf(o, t) }, easeCopy(left));
      o.kf.push(k); o.kf.sort((a, b) => a.t - b.t);
    }
    Object.assign(k.p, ch);
  } else Object.assign(o, ch);
}
function toggleKey(o, t) {
  const k = keyAt(o, t);
  if (k) {
    if (o.kf.length === 1) Object.assign(o, k.p);
    o.kf.splice(o.kf.indexOf(k), 1);
  } else {
    const left = [...(o.kf || [])].reverse().find(q => q.t < t);
    o.kf.push(Object.assign({ t, p: poseOf(o, t) }, easeCopy(left)));
    o.kf.sort((a, b) => a.t - b.t);
  }
}
function setParent(o, pid) {
  if (pid === o.par) return;
  if (pid) { // no loops
    let q = find(pid), n = 0; while (q && n++ < 12) { if (q.id === o.id) return; q = q.par ? find(q.par) : null; }
  }
  if (!(o.kf && o.kf.length)) {
    const w = wpose(o, E.t);
    if (pid) {
      const pw = wpose(find(pid), E.t), c = Math.cos(-pw.rot * D2R), s = Math.sin(-pw.rot * D2R);
      const dx = w.x - pw.x, dy = w.y - pw.y;
      Object.assign(o, { x: (dx * c - dy * s) / (pw.sx || 1), y: (dx * s + dy * c) / (pw.sy || 1), z: w.z - pw.z, rot: w.rot - pw.rot, sx: w.sx / (pw.sx || 1), sy: w.sy / (pw.sy || 1), rx: w.rx - pw.rx, ry: w.ry - pw.ry });
    } else Object.assign(o, w, { op: o.op });
  }
  o.par = pid || null;
}
function removeObj(id) {
  const P = E.P;
  P.objects.forEach(o => { if (o.par === id) { const q = find(id); setParent(o, q && q.par ? q.par : null); } });
  P.objects = P.objects.filter(o => o.id !== id);
  const v = VIDS.get(id); if (v) { v.pause(); v.removeAttribute('src'); v.remove(); VIDS.delete(id); }
  TXC.delete(id);
  if (E.sel === id) E.sel = null;
}
function dupObj(o) {
  const n = JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
  n.id = uid(); n.x += 30; n.y += 30; n.kf.forEach(k => { k.p.x += 30; k.p.y += 30; });
  const i = E.P.objects.indexOf(o); E.P.objects.splice(i + 1, 0, n); return n;
}
function autoDur() {
  let m = 0; E.P.objects.forEach(o => { if (!o.full && o.t1 > m) m = o.t1; });
  if (m > E.P.dur) E.P.dur = Math.round(m * 100) / 100;
}
/* ---------- cutting ---------- */
function cutFront(o, t) {
  if (t <= o.t0 + 0.04 || t >= endOf(o) - 0.04) return false;
  if (o.type === 'video') o.vo = (o.vo || 0) + (t - o.t0) * (o.speed || 1);
  o.t0 = t; return true;
}
function cutLast(o, t) {
  if (t <= o.t0 + 0.04 || t >= endOf(o) - 0.04) return false;
  o.full = false; o.t1 = t; return true;
}
function splitObj(o, t) {
  if (t <= o.t0 + 0.04 || t >= endOf(o) - 0.04) return null;
  const n = JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
  n.id = uid(); n.full = false; const end = endOf(o);
  if (o.type === 'video') n.vo = (o.vo || 0) + (t - o.t0) * (o.speed || 1);
  n.t0 = t; n.t1 = end; o.full = false; o.t1 = t;
  E.P.objects.splice(E.P.objects.indexOf(o) + 1, 0, n); return n;
}

/* ---------- media ---------- */
function mediaURL(f) { return location.origin + '/media/' + encodeURIComponent(f); }
function imgOf(o) {
  let i = IMGS.get(o.file);
  if (!i) { i = new Image(); i.onload = () => { if (o.w === 400 && o.h === 400 && o._fit) o._fit(); render(); }; i.src = mediaURL(o.file); IMGS.set(o.file, i); }
  return i.complete && i.naturalWidth ? i : null;
}
function vidBox() {
  let b = document.getElementById('vidbox');
  if (!b) { b = document.createElement('div'); b.id = 'vidbox'; b.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:.02;pointer-events:none;z-index:-1'; document.body.appendChild(b); }
  return b;
}
function vidOf(o) {
  let v = VIDS.get(o.id);
  if (!v) {
    v = document.createElement('video'); v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.onseeked = v.onloadeddata = v.oncanplay = () => render();
    v.onloadedmetadata = () => { try { v.currentTime = clamp(vidTime(o, E.t), 0.001, Math.max(0.001, (v.duration || 1) - 0.05)); } catch (e) {} };
    vidBox().appendChild(v); v.src = mediaURL(o.file); try { v.load(); } catch (e) {}
    VIDS.set(o.id, v);
    // some phones only decode the first frame after a play: kick once, then pause again
    setTimeout(() => {
      if (VIDS.get(o.id) !== v || v.readyState >= 2) return;
      const p = v.play(); if (p && p.then) p.then(() => { if (!E.playing) v.pause(); render(); }).catch(() => {});
    }, 700);
  }
  return v;
}
const POSTERS = new Map();
function posterOf(o) {
  const u = typeof THUMBS !== 'undefined' ? THUMBS.get(o.file) : '';
  if (u) {
    let i = POSTERS.get(o.file);
    if (!i) { i = new Image(); i.onload = () => render(); i.src = u; POSTERS.set(o.file, i); }
    if (i.complete && i.naturalWidth) return i;
  }
  let c = POSTERS.get('~ph');
  if (!c) {
    c = document.createElement('canvas'); c.width = 128; c.height = 72; const g = c.getContext('2d');
    g.fillStyle = '#1b2040'; g.fillRect(0, 0, 128, 72); g.fillStyle = '#ffffff66'; g.beginPath(); g.moveTo(54, 24); g.lineTo(54, 48); g.lineTo(78, 36); g.closePath(); g.fill();
    POSTERS.set('~ph', c);
  }
  return c;
}
function vidTime(o, t) { return Math.max(0, (t - o.t0) * (o.speed || 1) + (o.vo || 0)); }
function syncVideos(t, playing) {
  E.P.objects.forEach(o => {
    if (o.type !== 'video') return;
    const vis = visibleAt(o, t), near = vis || (o.vis !== false && o.t0 > t && o.t0 - t < 2);
    if (!near) { const old = VIDS.get(o.id); if (old) { old.pause(); old.removeAttribute('src'); old.load(); old.remove(); VIDS.delete(o.id); } return; }
    const v = vidOf(o);
    v.muted = !!o.mute; v.playbackRate = clamp(o.speed || 1, 0.25, 4);
    if (!vis) { if (!v.paused) v.pause(); return; }
    const want = vidTime(o, t);
    if (playing) {
      if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
      if (v.paused) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (v.readyState > 0 && (Math.abs(v.currentTime - want) > 0.03 || v.readyState < 2) && performance.now() - (v._sk || 0) > 250) { v._sk = performance.now(); v.currentTime = want; }
    }
  });
}
function pauseVideos() { VIDS.forEach(v => { if (!v.paused) v.pause(); }); }

/* ---------- textures ---------- */
function drawShapePath(c, kind, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2;
  c.beginPath();
  if (kind === 'circle') c.ellipse(cx, cy, w / 2, h / 2, 0, 0, 7);
  else if (kind === 'round') { const r = Math.min(w, h) * 0.22; c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  else if (kind === 'tri') { c.moveTo(cx, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); }
  else if (kind === 'star') {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.5; const px = cx + Math.cos(a) * w * r * 1, py = cy + Math.sin(a) * h * r * 1; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  } else if (kind === 'heart') {
    c.moveTo(cx, y + h * 0.9); c.bezierCurveTo(x - w * 0.1, y + h * 0.5, x + w * 0.1, y - h * 0.05, cx, y + h * 0.3);
    c.bezierCurveTo(x + w * 0.9, y - h * 0.05, x + w * 1.1, y + h * 0.5, cx, y + h * 0.9); c.closePath();
  } else if (kind === 'arrow') {
    c.moveTo(x, y + h * 0.35); c.lineTo(x + w * 0.6, y + h * 0.35); c.lineTo(x + w * 0.6, y); c.lineTo(x + w, cy); c.lineTo(x + w * 0.6, y + h); c.lineTo(x + w * 0.6, y + h * 0.65); c.lineTo(x, y + h * 0.65); c.closePath();
  } else c.rect(x, y, w, h);
}
function shapeTex(o) {
  const key = ['s', o.shape, o.w, o.h, o.fill, o.bw, o.bc].join('|');
  let c = TXC.get(o.id);
  if (c && c.key === key) return c.cv;
  const cv = document.createElement('canvas'); cv.width = Math.round(o.w * RES); cv.height = Math.round(o.h * RES);
  const g = cv.getContext('2d'); g.scale(RES, RES);
  const bw = o.bw || 0;
  if (o.shape === 'line') { g.strokeStyle = o.fill; g.lineWidth = Math.max(6, bw); g.lineCap = 'round'; g.beginPath(); g.moveTo(8, o.h / 2); g.lineTo(o.w - 8, o.h / 2); g.stroke(); }
  else {
    drawShapePath(g, o.shape, bw / 2, bw / 2, o.w - bw, o.h - bw);
    g.fillStyle = o.fill; g.fill();
    if (bw > 0) { g.lineWidth = bw; g.strokeStyle = o.bc || '#fff'; g.lineJoin = 'round'; g.stroke(); }
  }
  TXC.set(o.id, { key, cv }); return cv;
}
function textTex(o) {
  const key = ['t', o.text, o.font, o.fs, o.fill, o.fill2, o.bw, o.bc, o.bold, o.italic, o.under, o.caps, o.align, o.ls, o.lhm, o.bg, o.bgp, o.bgr].join('|');
  let c = TXC.get(o.id);
  if (c && c.key === key) return c.cv;
  const fam = FONTS[o.font] || FONTS.sans, fnt = (o.italic ? 'italic ' : '') + (o.bold ? 'bold ' : '') + o.fs + 'px ' + fam, ls = o.ls || 0;
  const m = document.createElement('canvas').getContext('2d'); m.font = fnt; if ('letterSpacing' in m) m.letterSpacing = ls + 'px';
  const txt = o.caps ? String(o.text || ' ').toUpperCase() : String(o.text || ' ');
  const lines = txt.split('\n'), pad = Math.round(o.fs * 0.25 + (o.bw || 0) + (o.bg ? (o.bgp == null ? 20 : o.bgp) : 0));
  let w = 0; const lw = lines.map(l => { const x = m.measureText(l).width; w = Math.max(w, x); return x; });
  const lh = o.fs * 1.25 * (o.lhm || 1), W = Math.ceil(w + pad * 2), H = Math.ceil(lh * lines.length + pad * 2);
  const cv = document.createElement('canvas'); cv.width = W * RES; cv.height = H * RES;
  const g = cv.getContext('2d'); g.scale(RES, RES); g.font = fnt; g.textBaseline = 'middle'; if ('letterSpacing' in g) g.letterSpacing = ls + 'px';
  g.lineJoin = 'round';
  if (o.bg) { const r = Math.min(o.bgr || 0, W / 2, H / 2); g.fillStyle = o.bg; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, W, H, r); else g.rect(0, 0, W, H); g.fill(); }
  const al = o.align || 'c'; g.textAlign = al === 'l' ? 'left' : al === 'r' ? 'right' : 'center';
  const x = al === 'l' ? pad : al === 'r' ? W - pad : W / 2;
  let fill = o.fill; if (o.fill2) { const gr = g.createLinearGradient(0, pad, 0, H - pad); gr.addColorStop(0, o.fill); gr.addColorStop(1, o.fill2); fill = gr; }
  lines.forEach((l, i) => {
    const y = pad + lh * (i + 0.5);
    if (o.bw > 0) { g.lineWidth = o.bw * 2; g.strokeStyle = o.bc || '#000'; g.strokeText(l, x, y); }
    g.fillStyle = fill; g.fillText(l, x, y);
    if (o.under) { const x0 = al === 'l' ? x : al === 'r' ? x - lw[i] : x - lw[i] / 2; g.fillRect(x0, y + o.fs * 0.5, lw[i], Math.max(2, o.fs / 14)); }
  });
  o.w = W; o.h = H;
  TXC.set(o.id, { key, cv }); return cv;
}
function getTex(o) {
  if (o.type === 'image') { const i = imgOf(o); return i && { src: i, w: o.w, h: o.h }; }
  if (o.type === 'video') { const v = vidOf(o); return { src: v.readyState >= 2 ? v : posterOf(o), w: o.w, h: o.h }; }
  if (o.type === 'shape') return { src: shapeTex(o), w: o.w, h: o.h };
  if (o.type === 'text') { const c = textTex(o); return { src: c, w: o.w, h: o.h }; }
  return null;
}

/* ---------- projection ---------- */
const CAMD = { x: 0, y: 0, z: 0, rot: 0, sx: 1, fov: 60, dist: FOC, zf: 1, fbOn: false, fogOn: false, fd: 1000, dof: 400, fbs: 20, fgn: 1500, fgf: 4000, fogC: '#9aa4c8', cbl: 0, cgl: 0, vig: 0, tia: 0, tintC: '#ff7a00' };
function camPose(t) {
  if (!E.cam) return Object.assign({}, CAMD);
  let c = null;
  E.P.objects.forEach(o => { if (o.type === 'camera' && visibleAt(o, t)) c = o; });
  if (!c) return Object.assign({}, CAMD);
  const w = wpose(c, t);
  return {
    x: w.x, y: w.y, z: w.z, rot: w.rot, sx: w.sx, fov: w.fov, dist: Math.max(200, w.dist),
    zf: Math.tan(30 * D2R) / Math.tan(clamp(w.fov, 8, 160) / 2 * D2R),
    fbOn: !!c.fbOn, fogOn: !!c.fogOn, fd: w.fd, dof: w.dof, fbs: w.fbs, fgn: w.fgn, fgf: Math.max(w.fgf, w.fgn + 1), fogC: c.fogC || CAMD.fogC,
    cbl: w.cbl, cgl: w.cgl, vig: w.vig, tia: w.tia, tintC: c.tintC || CAMD.tintC
  };
}
// returns screen {x,y,k,d} relative to canvas centre, or null if behind camera
function proj(cam, X, Y, Z) {
  let dx = X - cam.x, dy = Y - cam.y; const dz = Z - cam.z;
  const c = Math.cos(-cam.rot * D2R), s = Math.sin(-cam.rot * D2R), D = cam.dist || FOC;
  const px = dx * c - dy * s, py = dx * s + dy * c, d = D - dz;
  if (d < D * 0.08) return null;
  const k = D / d * cam.sx * (cam.zf || 1);
  return { x: px * k, y: py * k, k, d };
}
function localPt(w, lx, ly, flipX, flipY) {
  lx *= w.sx * (flipX ? -1 : 1); ly *= w.sy * (flipY ? -1 : 1);
  lx += Math.tan((w.skx || 0) * D2R) * ly;
  let y = ly, z = 0, x = lx;
  const cx = Math.cos(w.rx * D2R), sx = Math.sin(w.rx * D2R);
  let y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  const cy = Math.cos(w.ry * D2R), sy = Math.sin(w.ry * D2R);
  let x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  const c = Math.cos(w.rot * D2R), s = Math.sin(w.rot * D2R);
  return { x: w.x + x2 * c - y1 * s, y: w.y + x2 * s + y1 * c, z: w.z + z2 };
}
function objQuad(o, w, cam) {
  const hw = o.w / 2, hh = o.h / 2, out = [];
  for (const [a, b] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
    const v = localPt(w, a, b, o.flipX, o.flipY), p = proj(cam, v.x, v.y, v.z);
    if (!p) return null; out.push(p);
  }
  return out;
}

function tri(g, img, s0, s1, s2, d0, d1, d2) {
  const [x0, y0] = s0, [x1, y1] = s1, [x2, y2] = s2;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (!det) return;
  const a = ((d1.x - d0.x) * (y2 - y0) - (d2.x - d0.x) * (y1 - y0)) / det;
  const b = ((d1.y - d0.y) * (y2 - y0) - (d2.y - d0.y) * (y1 - y0)) / det;
  const c = ((d2.x - d0.x) * (x1 - x0) - (d1.x - d0.x) * (x2 - x0)) / det;
  const d = ((d2.y - d0.y) * (x1 - x0) - (d1.y - d0.y) * (x2 - x0)) / det;
  const e = d0.x - a * x0 - c * y0, f = d0.y - b * x0 - d * y0;
  g.save();
  // expand clip a hair to hide seams
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3, ex = 0.6;
  g.beginPath();
  for (const [i, p] of [d0, d1, d2].entries()) {
    const dx = p.x - cx, dy = p.y - cy, L = Math.hypot(dx, dy) || 1, X = p.x + dx / L * ex, Y = p.y + dy / L * ex;
    i ? g.lineTo(X, Y) : g.moveTo(X, Y);
  }
  g.closePath(); g.clip(); g.transform(a, b, c, d, e, f); g.drawImage(img, 0, 0); g.restore();
}

const _sc = {};
function scratch(name, cv) {
  let s = _sc[name]; if (!s) { s = _sc[name] = document.createElement('canvas'); s.ctx = s.getContext('2d'); }
  if (s.width !== cv.width || s.height !== cv.height) { s.width = cv.width; s.height = cv.height; }
  return s.ctx;
}
function drawObj(g, o, t, cam, B) {
  const tex = getTex(o); if (!tex) return;
  const w = wpose(o, t); if (w.op <= 0.001) return;
  const centre = proj(cam, w.x, w.y, w.z); if (!centre) { o._q = null; return; }
  const fogA = cam.fogOn ? clamp((centre.d - cam.fgn) / Math.max(1, cam.fgf - cam.fgn), 0, 1) : 0;
  const fbl = cam.fbOn ? cam.fbs * clamp((Math.abs(centre.d - cam.fd) - cam.dof / 2) / 600, 0, 1.5) : 0;
  if (fogA > 0.01) {
    const G = scratch('fog', g.canvas), W = g.canvas.width, H = g.canvas.height;
    G.setTransform(1, 0, 0, 1, 0, 0); G.globalCompositeOperation = 'source-over'; G.globalAlpha = 1; G.filter = 'none'; G.clearRect(0, 0, W, H);
    drawObjRaw(G, o, t, cam, B, tex, w, centre, fbl);
    G.setTransform(1, 0, 0, 1, 0, 0); G.globalCompositeOperation = 'source-atop'; G.globalAlpha = fogA; G.fillStyle = cam.fogC; G.fillRect(0, 0, W, H);
    G.globalCompositeOperation = 'source-over'; G.globalAlpha = 1;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.drawImage(G.canvas, 0, 0); g.restore();
  } else drawObjRaw(g, o, t, cam, B, tex, w, centre, fbl);
}
function drawObjRaw(g, o, t, cam, B, tex, w, centre, fbl) {
  const tilt = Math.abs(w.rx) > 0.01 || Math.abs(w.ry) > 0.01;
  g.save();
  g.setTransform(B.a, 0, 0, B.a, B.x, B.y);
  g.globalAlpha = clamp(w.op, 0, 1);
  const fx = o.fx || {}, k = centre.k, blur = w.bl * k * B.a + fbl * B.a;
  if (blur > 0.3) g.filter = 'blur(' + blur + 'px)';
  if (w.gl > 0.05) { g.shadowColor = fx.glowC || '#a78bfa'; g.shadowBlur = w.gl * k * B.a; }
  else if (w.sh > 0.05) { g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = w.sh * k * B.a * 0.8; g.shadowOffsetX = w.sh * 0.5 * k * B.a; g.shadowOffsetY = w.sh * 0.5 * k * B.a; }
  const q = objQuad(o, w, cam); o._q = q;
  if (!tilt) {
    g.translate(centre.x, centre.y); g.rotate((w.rot - cam.rot) * D2R);
    if (Math.abs(w.skx) > 0.01) g.transform(1, 0, Math.tan(w.skx * D2R), 1, 0, 0);
    g.scale(k * w.sx * (o.flipX ? -1 : 1), k * w.sy * (o.flipY ? -1 : 1));
    g.drawImage(tex.src, -o.w / 2, -o.h / 2, o.w, o.h);
  } else {
    const N = 8, sw = tex.src.videoWidth || tex.src.naturalWidth || tex.src.width, sh = tex.src.videoHeight || tex.src.naturalHeight || tex.src.height;
    const grid = [];
    for (let j = 0; j <= N; j++) { grid.push([]); for (let i = 0; i <= N; i++) {
      const v = localPt(w, (i / N - 0.5) * o.w, (j / N - 0.5) * o.h, o.flipX, o.flipY), p = proj(cam, v.x, v.y, v.z);
      grid[j].push(p ? { x: p.x, y: p.y } : null);
    } }
    g.shadowColor = 'transparent';
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      if (!a || !b || !c || !d) continue;
      const u0 = i / N * sw, u1 = (i + 1) / N * sw, v0 = j / N * sh, v1 = (j + 1) / N * sh;
      tri(g, tex.src, [u0, v0], [u1, v0], [u0, v1], a, b, c);
      tri(g, tex.src, [u1, v0], [u1, v1], [u0, v1], b, d, c);
    }
  }
  g.restore();
}

/* ---------- main renderer ---------- */
function postFx(g, W, H, c, B) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  if (c.cbl > 0.05 || c.cgl > 0.01) {
    const s = scratch('post', g.canvas); s.setTransform(1, 0, 0, 1, 0, 0); s.globalAlpha = 1; s.globalCompositeOperation = 'source-over'; s.filter = 'none'; s.clearRect(0, 0, W, H); s.drawImage(g.canvas, 0, 0);
    if (c.cbl > 0.05) { g.fillStyle = E.P.bg || '#000'; g.fillRect(0, 0, W, H); g.filter = 'blur(' + (c.cbl * B.a) + 'px)'; g.drawImage(s.canvas, 0, 0); g.filter = 'none'; }
    if (c.cgl > 0.01) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(c.cgl, 0, 1); g.filter = 'blur(' + (22 * B.a) + 'px)'; g.drawImage(s.canvas, 0, 0); g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  }
  if (c.vig > 0.01) {
    const r = Math.hypot(W, H) / 2 * (B.vz || 1), gr = g.createRadialGradient(W / 2, H / 2, r * 0.3, W / 2, H / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + clamp(c.vig, 0, 1) + ')'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (c.tia > 0.01) { g.globalAlpha = clamp(c.tia, 0, 1) * 0.6; g.fillStyle = c.tintC; g.fillRect(0, 0, W, H); }
  g.restore();
}
function renderTo(g, W, H, t, opts) {
  opts = opts || {};
  const P = E.P, sc = W / P.w, vz = opts.vz || 1;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  g.fillStyle = P.bg || '#000'; g.fillRect(0, 0, W, H);
  const cam = camPose(t), B = { a: sc * vz, x: W / 2, y: H / 2, vz };
  P.objects.forEach(o => { if (visibleAt(o, t) && o.type !== 'null' && o.type !== 'camera') drawObj(g, o, t, cam, B); else o._q = null; });
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (cam.cbl > 0.05 || cam.cgl > 0.01 || cam.vig > 0.01 || cam.tia > 0.01) postFx(g, W, H, cam, B);
  if (opts.overlay) overlay(g, t, cam, B, vz);
}
function zoomEff() { return (E.zoom || 1) * (E.vz || 1); }
// world positions of the on-screen handles of an object (corners + rotate knob)
function handlePts(o) {
  const q = o._q; if (!q || q.length < 4) return null;
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const mx = (q[0].x + q[1].x) / 2, my = (q[0].y + q[1].y) / 2;
  let dx = mx - cx, dy = my - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const off = 36 / zoomEff();
  return { c: { x: cx, y: cy }, corners: q.map(p => ({ x: p.x, y: p.y })), rot: { x: mx + dx * off, y: my + dy * off }, top: { x: mx, y: my } };
}
function overlay(g, t, cam, B, vz) {
  const P = E.P, dpr = E.cv && E.cv.clientWidth ? E.cv.width / E.cv.clientWidth : 1;
  const P2 = (p) => [p.x * B.a + B.x, p.y * B.a + B.y];
  if (vz < 1) { // camera selected: show the real output frame, dim the rest
    const fw = P.w * B.a, fh = P.h * B.a;
    g.save(); g.fillStyle = 'rgba(4,5,12,.62)'; g.beginPath(); g.rect(0, 0, g.canvas.width, g.canvas.height); g.rect(B.x - fw / 2, B.y - fh / 2, fw, fh); g.fill('evenodd');
    g.strokeStyle = '#ffffff'; g.lineWidth = 2 * dpr; g.strokeRect(B.x - fw / 2, B.y - fh / 2, fw, fh); g.restore();
  }
  if (!E.cam) { // camera is off: show where the camera is looking (its focus frame), world is drawn untouched
    P.objects.forEach(c => {
      if (c.type !== 'camera' || !visibleAt(c, t)) return;
      const w = wpose(c, t), zf = Math.tan(30 * D2R) / Math.tan(clamp(w.fov, 8, 160) / 2 * D2R), D = Math.max(200, w.dist || FOC), dd = D + (w.z || 0), k = dd < D * 0.08 ? 1 : dd / (D * (w.sx || 1) * zf);
      const [cx, cy] = P2({ x: w.x, y: w.y }), hw = P.w / 2 * k * B.a, hh = P.h / 2 * k * B.a, sel = c.id === E.sel;
      g.save(); g.translate(cx, cy); g.rotate(w.rot * D2R); g.setLineDash([]);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 5 * dpr; g.strokeRect(-hw, -hh, hw * 2, hh * 2);
      g.strokeStyle = '#4a2a12'; g.lineWidth = (sel ? 3.5 : 2.5) * dpr; g.strokeRect(-hw, -hh, hw * 2, hh * 2);
      const pl = 12 * dpr; g.beginPath(); g.moveTo(-pl, 0); g.lineTo(pl, 0); g.moveTo(0, -pl); g.lineTo(0, pl); g.stroke(); g.restore();
    });
  }
  if (E.playing) return; // while playing: only the camera frame (above) is shown, no handles
  P.objects.forEach(o => {
    if (!visibleAt(o, t)) return;
    const isSel = o.id === E.sel;
    if (o.type === 'null') {
      const w = wpose(o, t), p = proj(CAMD, w.x, w.y, w.z); if (!p) return;
      const [cx, cy] = P2(p);
      g.save(); g.translate(cx, cy); g.rotate(w.rot * D2R);
      g.strokeStyle = '#fbbf24'; g.lineWidth = isSel ? 2.5 : 1.5; g.setLineDash([6, 4]);
      g.strokeRect(-22, -22, 44, 44); g.setLineDash([]); g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.moveTo(0, -14); g.lineTo(0, 14); g.stroke();
      g.restore();
      o._q = [{ x: p.x - 28 / B.a, y: p.y - 28 / B.a }, { x: p.x + 28 / B.a, y: p.y - 28 / B.a }, { x: p.x + 28 / B.a, y: p.y + 28 / B.a }, { x: p.x - 28 / B.a, y: p.y + 28 / B.a }];
    } else if (o.type === 'camera') { o._q = null;
    } else if (isSel && o._q) {
      g.save(); g.strokeStyle = '#a78bfa'; g.lineWidth = 2 * dpr; g.fillStyle = '#fff';
      g.beginPath(); o._q.forEach((p, i) => { const [x, y] = P2(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
      if (!o.lock && !E.noHandles) {
        const h = handlePts(o);
        if (h) {
          const [tx, ty] = P2(h.top), [rx, ry] = P2(h.rot);
          g.beginPath(); g.moveTo(tx, ty); g.lineTo(rx, ry); g.stroke();
          g.lineWidth = 2 * dpr;
          h.corners.forEach(p => { const [x, y] = P2(p); g.beginPath(); g.arc(x, y, 7 * dpr, 0, 7); g.fill(); g.stroke(); });
          g.beginPath(); g.arc(rx, ry, 8.5 * dpr, 0, 7); g.fillStyle = '#ec4899'; g.fill(); g.strokeStyle = '#fff'; g.stroke();
        }
      }
      g.restore();
    }
  });
  const gd = E.guides;
  if (gd) { // snap guide lines
    g.save(); g.strokeStyle = '#ffd84a'; g.lineWidth = 1.5 * dpr; g.setLineDash([]);
    const L = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const W = g.canvas.width, H = g.canvas.height, fx = P.w / 2 * B.a, fy = P.h / 2 * B.a;
    if (gd.vx) L(B.x, 0, B.x, H);
    if (gd.hy) L(0, B.y, W, B.y);
    if (gd.l) L(B.x - fx, 0, B.x - fx, H);
    if (gd.r) L(B.x + fx, 0, B.x + fx, H);
    if (gd.t) L(0, B.y - fy, W, B.y - fy);
    if (gd.b) L(0, B.y + fy, W, B.y + fy);
    g.restore();
  }
}
function hitTest(px, py, W, H) { // px,py in canvas-backing pixels
  const sc = W / E.P.w * (E.vz || 1), x = (px - W / 2) / sc, y = (py - H / 2) / sc;
  const L = E.P.objects;
  for (let i = L.length - 1; i >= 0; i--) {
    const o = L[i], q = o._q; if (!q || o.type === 'camera' || !visibleAt(o, E.t) || o.vis === false) continue;
    let ins = false;
    for (let a = 0, b = q.length - 1; a < q.length; b = a++) {
      if ((q[a].y > y) !== (q[b].y > y) && x < (q[b].x - q[a].x) * (y - q[a].y) / (q[b].y - q[a].y) + q[a].x) ins = !ins;
    }
    if (ins) return o;
  }
  return null;
}

/* ---------- canvas + preview ---------- */
function fitCanvas(stage) {
  const cv = E.cv, P = E.P, bw = stage.clientWidth - 16, bh = stage.clientHeight - 16;
  if (bw <= 0 || bh <= 0) return;
  const s = Math.min(bw / P.w, bh / P.h), cw = Math.floor(P.w * s), ch = Math.floor(P.h * s), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  E.zoom = s; render();
}
function drawNow() {
  if (!E.P || !E.cv) return;
  const so = selObj(), tv = 1;
  if (E.vzc === undefined || E.playing) E.vzc = tv;
  else if (Math.abs(E.vzc - tv) > 0.004) E.vzc += (tv - E.vzc) * 0.35; else E.vzc = tv; // smooth zoom-out / zoom-in
  E.vz = E.vzc;
  renderTo(E.ctx, E.cv.width, E.cv.height, E.t, { overlay: true, vz: E.vz });
  if (E.vzc !== tv) render();
}
function render() { if (E.pend) return; E.pend = true; requestAnimationFrame(() => { E.pend = false; drawNow(); }); }
