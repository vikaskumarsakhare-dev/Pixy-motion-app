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
const IMGS = new Map(), VIDS = new Map(), TXC = new Map(), AUDS = new Map();

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
  let am = 0;
  E.P.objects.forEach(o => { if (!o.full) { if (o.type === 'audio') { am = Math.max(am, o.t1); return; } any = true; m = Math.max(m, o.t1); } });
  if (!any && am) { any = true; m = am; }
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
  const au = AUDS.get(id); if (au) { au.pause(); au.removeAttribute('src'); au.load(); AUDS.delete(id); }
  TXC.delete(id); TXC.delete(id + '_ov');
  P.objects.forEach(q => { if (q.mask && q.mask.id === id) q.mask = null; });
  if (E.sel === id) E.sel = null;
}
function dupObj(o) {
  const n = JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
  n.id = uid(); n.x += 30; n.y += 30; n.kf.forEach(k => { k.p.x += 30; k.p.y += 30; });
  const i = E.P.objects.indexOf(o); E.P.objects.splice(i + 1, 0, n); return n;
}
function autoDur() {
  let m = 0, am = 0; E.P.objects.forEach(o => { if (!o.full) { if (o.type === 'audio') am = Math.max(am, o.t1); else if (o.t1 > m) m = o.t1; } });
  if (!m && !E.P.objects.some(o => !o.full && o.type !== 'audio')) m = am;
  if (m > E.P.dur) E.P.dur = Math.round(m * 100) / 100;
}
/* ---------- cutting ---------- */
function cutFront(o, t) {
  if (t <= o.t0 + 0.04 || t >= endOf(o) - 0.04) return false;
  if (o.type === 'video' || o.type === 'audio') o.vo = (o.vo || 0) + (t - o.t0) * (o.speed || 1);
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
  if (o.type === 'video' || o.type === 'audio') n.vo = (o.vo || 0) + (t - o.t0) * (o.speed || 1);
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
  syncAudios(t, playing);
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
function audOf(o) {
  let a = AUDS.get(o.id);
  if (!a) { a = new Audio(); a.preload = 'auto'; a.src = mediaURL(o.file); try { a.load(); } catch (e) {} AUDS.set(o.id, a); }
  return a;
}
// volume of an audio layer at time t (layer volume x fade in / fade out)
function audGain(o, t) {
  const len = endOf(o) - o.t0, fi = Math.min(o.fin || 0, len / 2), fo = Math.min(o.fout || 0, len / 2);
  let g = o.vol == null ? 1 : o.vol;
  if (fi > 0 && t - o.t0 < fi) g *= Math.max(0, (t - o.t0) / fi);
  if (fo > 0 && endOf(o) - t < fo) g *= Math.max(0, (endOf(o) - t) / fo);
  return clamp(g, 0, 1);
}
function syncAudios(t, playing) {
  E.P.objects.forEach(o => {
    if (o.type !== 'audio') return;
    const vis = visibleAt(o, t) && t < E.P.dur + 1e-6, near = vis || (o.vis !== false && o.t0 > t && o.t0 - t < 3);
    if (!near) { const old = AUDS.get(o.id); if (old) { old.pause(); old.removeAttribute('src'); old.load(); AUDS.delete(o.id); } return; }
    const a = audOf(o);
    if (!vis || !playing || o.mute) { if (!a.paused) a.pause(); if (!playing || o.mute || !vis) return; }
    a.volume = audGain(o, t);
    const want = vidTime(o, t);
    if (playing) {
      if (Math.abs(a.currentTime - want) > 0.3) { try { a.currentTime = want; } catch (er) {} }
      if (a.paused) a.play().catch(() => {});
    }
  });
}
function pauseVideos() { VIDS.forEach(v => { if (!v.paused) v.pause(); }); AUDS.forEach(a => { if (!a.paused) a.pause(); }); }

/* ---------- textures ---------- */
const SHAPES = ['rect', 'round', 'circle', 'tri', 'diamond', 'pent', 'hex', 'oct', 'star', 'star4', 'star6', 'badge', 'heart', 'arrow', 'chevron', 'cross', 'ring', 'semi', 'pie', 'moon', 'cloud', 'drop', 'bubble', 'bolt', 'para', 'trap', 'frame', 'line'];
function drawShapePath(c, kind, x, y, w, h, pts, smooth) {
  const cx = x + w / 2, cy = y + h / 2;
  const P = (list) => { list.forEach((p, i) => { const px = x + p[0] * w, py = y + p[1] * h; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); };
  const poly = (n, rot, ir) => {
    const m = ir ? n * 2 : n;
    for (let i = 0; i < m; i++) { const a = (rot + i * 360 / m) * Math.PI / 180, r = ir ? (i % 2 ? ir : 1) : 1, px = cx + Math.cos(a) * w / 2 * r, py = cy + Math.sin(a) * h / 2 * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  };
  const circ = (ux, uy, rx, ry) => { c.moveTo(x + (ux + rx) * w, y + uy * h); c.ellipse(x + ux * w, y + uy * h, rx * w, ry * h, 0, 0, 7); c.closePath(); };
  c.beginPath();
  if (kind === 'circle') c.ellipse(cx, cy, w / 2, h / 2, 0, 0, 7);
  else if (kind === 'round') { const r = Math.min(w, h) * 0.22; c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  else if (kind === 'tri') { c.moveTo(cx, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); }
  else if (kind === 'diamond') poly(4, -90);
  else if (kind === 'pent') poly(5, -90);
  else if (kind === 'hex') poly(6, 0);
  else if (kind === 'oct') poly(8, -22.5);
  else if (kind === 'star') {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.2 : 0.5; const px = cx + Math.cos(a) * w * r * 1, py = cy + Math.sin(a) * h * r * 1; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
  } else if (kind === 'star4') poly(4, -90, 0.4)
  else if (kind === 'star6') poly(6, -90, 0.55)
  else if (kind === 'badge') poly(12, -90, 0.84)
  else if (kind === 'heart') {
    c.moveTo(cx, y + h * 0.9); c.bezierCurveTo(x - w * 0.1, y + h * 0.5, x + w * 0.1, y - h * 0.05, cx, y + h * 0.3);
    c.bezierCurveTo(x + w * 0.9, y - h * 0.05, x + w * 1.1, y + h * 0.5, cx, y + h * 0.9); c.closePath();
  } else if (kind === 'arrow') {
    c.moveTo(x, y + h * 0.35); c.lineTo(x + w * 0.6, y + h * 0.35); c.lineTo(x + w * 0.6, y); c.lineTo(x + w, cy); c.lineTo(x + w * 0.6, y + h); c.lineTo(x + w * 0.6, y + h * 0.65); c.lineTo(x, y + h * 0.65); c.closePath();
  } else if (kind === 'chevron') P([[0, 0], [0.6, 0], [1, 0.5], [0.6, 1], [0, 1], [0.4, 0.5]])
  else if (kind === 'cross') P([[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]])
  else if (kind === 'ring') { c.ellipse(cx, cy, w / 2, h / 2, 0, 0, 7); c.moveTo(cx + w * 0.3, cy); c.ellipse(cx, cy, w * 0.3, h * 0.3, 0, 0, 7, true); }
  else if (kind === 'semi') { c.ellipse(cx, y + h * 0.75, w / 2, h * 0.75, 0, Math.PI, Math.PI * 2); c.closePath(); }
  else if (kind === 'pie') { c.moveTo(cx, cy); c.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 1.5); c.closePath(); }
  else if (kind === 'moon') { c.moveTo(cx, y); c.ellipse(cx, cy, w / 2, h / 2, 0, -Math.PI / 2, Math.PI / 2, true); c.bezierCurveTo(cx - w * 0.27, y + h * 0.75, cx - w * 0.27, y + h * 0.25, cx, y); c.closePath(); }
  else if (kind === 'cloud') { circ(0.3, 0.62, 0.2, 0.26); circ(0.5, 0.42, 0.25, 0.32); circ(0.72, 0.6, 0.2, 0.26); c.moveTo(x + 0.3 * w, y + 0.55 * h); c.lineTo(x + 0.72 * w, y + 0.55 * h); c.lineTo(x + 0.72 * w, y + 0.86 * h); c.lineTo(x + 0.3 * w, y + 0.86 * h); c.closePath(); }
  else if (kind === 'drop') { c.moveTo(cx, y); c.bezierCurveTo(cx + w * 0.55, y + h * 0.45, cx + w * 0.5, y + h, cx, y + h); c.bezierCurveTo(cx - w * 0.5, y + h, cx - w * 0.55, y + h * 0.45, cx, y); c.closePath(); }
  else if (kind === 'bubble') { const r = Math.min(w, h) * 0.18; c.roundRect ? c.roundRect(x, y, w, h * 0.78, r) : c.rect(x, y, w, h * 0.78); c.moveTo(x + w * 0.2, y + h * 0.7); c.lineTo(x + w * 0.42, y + h * 0.74); c.lineTo(x + w * 0.15, y + h); c.closePath(); }
  else if (kind === 'bolt') P([[0.58, 0], [0.12, 0.56], [0.44, 0.56], [0.34, 1], [0.88, 0.4], [0.55, 0.4], [0.75, 0]])
  else if (kind === 'para') P([[0.25, 0], [1, 0], [0.75, 1], [0, 1]])
  else if (kind === 'trap') P([[0.2, 0], [0.8, 0], [1, 1], [0, 1]])
  else if (kind === 'frame') { P([[0, 0], [1, 0], [1, 1], [0, 1]]); c.moveTo(x + 0.2 * w, y + 0.2 * h); c.lineTo(x + 0.2 * w, y + 0.8 * h); c.lineTo(x + 0.8 * w, y + 0.8 * h); c.lineTo(x + 0.8 * w, y + 0.2 * h); c.closePath(); }
  else if (kind === 'custom' && pts && pts.length > 2) {
    if (!smooth && pts.some(p => p[2])) { // per-point: p[2]=1 → rounded point, else sharp corner
      const n = pts.length, M = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], X = p => x + p[0] * w, Y = p => y + p[1] * h;
      const st = pts[0][2] ? M(pts[n - 1], pts[0]) : pts[0]; c.moveTo(X(st), Y(st));
      for (let i = 0; i < n; i++) { const p = pts[i]; if (p[2]) { const a = M(pts[(i + n - 1) % n], p), b = M(p, pts[(i + 1) % n]); c.lineTo(X(a), Y(a)); c.quadraticCurveTo(X(p), Y(p), X(b), Y(b)); } else c.lineTo(X(p), Y(p)); }
      c.closePath();
    } else if (smooth) {
      const n = pts.length, M = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], X = p => x + p[0] * w, Y = p => y + p[1] * h;
      let s = M(pts[n - 1], pts[0]); c.moveTo(X(s), Y(s));
      for (let i = 0; i < n; i++) { const m = M(pts[i], pts[(i + 1) % n]); c.quadraticCurveTo(X(pts[i]), Y(pts[i]), X(m), Y(m)); }
      c.closePath();
    } else P(pts);
  } else c.rect(x, y, w, h);
}
function shapeTex(o) {
  const key = ['s', o.shape, o.w, o.h, o.fill, o.bw, o.bc, o.pts ? JSON.stringify(o.pts) : '', o.smooth].join('|');
  let c = TXC.get(o.id);
  if (c && c.key === key) return c.cv;
  const cv = document.createElement('canvas'); cv.width = Math.round(o.w * RES); cv.height = Math.round(o.h * RES);
  const g = cv.getContext('2d'); g.scale(RES, RES);
  const bw = o.bw || 0;
  if (o.shape === 'line') { g.strokeStyle = o.fill; g.lineWidth = Math.max(6, bw); g.lineCap = 'round'; g.beginPath(); g.moveTo(8, o.h / 2); g.lineTo(o.w - 8, o.h / 2); g.stroke(); }
  else {
    drawShapePath(g, o.shape, bw / 2, bw / 2, o.w - bw, o.h - bw, o.pts, o.smooth);
    g.fillStyle = o.fill; g.fill();
    if (bw > 0) { g.lineWidth = bw; g.strokeStyle = o.bc || '#fff'; g.lineJoin = 'round'; g.stroke(); }
  }
  TXC.set(o.id, { key, cv }); return cv;
}
function textTex(o) {
  const tv = textFxView(o, CURT), otext = tv.text, ols = tv.ls;
  const key = ['t', otext, tv.vis, tv.cur, tv.hl, tv.hlc, tv.roll ? tv.roll.join(',') : '', o.font, o.fs, o.fill, o.fill2, o.bw, o.bc, o.bold, o.italic, o.under, o.caps, o.align, ols, o.lhm, o.bg, o.bgp, o.bgr].join('|');
  let c = TXC.get(o.id);
  if (c && c.key === key) return c.cv;
  const fam = FONTS[o.font] || FONTS.sans, fnt = (o.italic ? 'italic ' : '') + (o.bold ? 'bold ' : '') + o.fs + 'px ' + fam, ls = ols;
  const m = document.createElement('canvas').getContext('2d'); m.font = fnt; if ('letterSpacing' in m) m.letterSpacing = ls + 'px';
  const txt = o.caps ? String(otext || ' ').toUpperCase() : String(otext || ' ');
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
  let rem = tv.vis == null ? Infinity : tv.vis, placed = false, hremain = tv.hl || 0, ci = 0;
  lines.forEach((l, i) => {
    const y = pad + lh * (i + 0.5);
    let show = l, tx = x, ta = null, softCh = null;
    if (tv.vis != null) {
      const arr = Array.from(l), k = Math.max(0, Math.min(arr.length, Math.floor(rem))); show = arr.slice(0, k).join(''); const fr = rem - Math.floor(rem); softCh = fr > 0 && k < arr.length && rem >= 0 ? { ch: arr[k], a: fr, pre: show } : null;
      if (tv.cur && !placed && rem <= arr.length) { show += '|'; placed = true; }
      rem -= arr.length + 1; tx = al === 'l' ? x : al === 'r' ? x - lw[i] : x - lw[i] / 2; ta = 'left';
    }
    if (tv.roll) { // odometer: each digit sits on a vertical wheel
      const arr = Array.from(l), x0 = al === 'l' ? x : al === 'r' ? x - lw[i] : x - lw[i] / 2, stp = o.fs * 1.1; g.textAlign = 'left'; g.fillStyle = fill;
      const put = (c2, px, dy) => { if (o.bw > 0) { g.lineWidth = o.bw * 2; g.strokeStyle = o.bc || '#000'; g.strokeText(c2, px, y + dy); } g.fillText(c2, px, y + dy); };
      arr.forEach((ch, k) => {
        const px = x0 + m.measureText(arr.slice(0, k).join('')).width, r = tv.roll[ci + k];
        if (r == null) { put(ch, px, 0); return; }
        const fl = Math.floor(r), fr = r - fl, cw = m.measureText(ch).width + 4;
        g.save(); g.beginPath(); g.rect(px - 3, y - stp / 2, cw + 6, stp); g.clip();
        put(String(((fl % 10) + 10) % 10), px, -fr * stp); put(String((((fl + 1) % 10) + 10) % 10), px, (1 - fr) * stp); g.restore();
      });
      ci += arr.length + 1;
    } else {
    if (ta) g.textAlign = ta;
    if (o.bw > 0) { g.lineWidth = o.bw * 2; g.strokeStyle = o.bc || '#000'; g.strokeText(show, tx, y); }
    g.fillStyle = fill; g.fillText(show, tx, y);
    }
    if (softCh) { const px = m.measureText(softCh.pre).width; g.save(); g.globalAlpha = softCh.a; g.fillText(softCh.ch, tx + px, y); g.restore(); }
    if (tv.hl > 0) { const ha = Array.from(l), hk = Math.min(ha.length, hremain); hremain -= ha.length + 1; if (hk > 0) { const hx = al === 'l' ? x : al === 'r' ? x - lw[i] : x - lw[i] / 2; g.save(); g.textAlign = 'left'; g.fillStyle = tv.hlc; g.fillText(ha.slice(0, hk).join(''), hx, y); g.restore(); } }
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
function isMaskLayer(o) { return E.P.objects.some(q => q.mask && q.mask.id === o.id); }
// draw layer o only where mask layer m is (or, inverted, only where it is not)
function drawMasked(g, o, m, t, cam, B) {
  const W = g.canvas.width, H = g.canvas.height, A = scratch('mk1', g.canvas), M = scratch('mk2', g.canvas);
  const rs = c => { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none'; c.shadowColor = 'transparent'; c.clearRect(0, 0, W, H); };
  rs(A); rs(M);
  drawObj(A, o, t, cam, B); drawObj(M, m, t, cam, B);
  const f = (o.mask.f || 0) * B.a;
  A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = o.mask.inv ? 'destination-out' : 'destination-in';
  if (f > 0.3) A.filter = 'blur(' + f + 'px)';
  A.drawImage(M.canvas, 0, 0); A.filter = 'none'; A.globalCompositeOperation = 'source-over';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.drawImage(A.canvas, 0, 0); g.restore();
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
    if (o.lb && o.lb.w > 0) { g.shadowColor = 'transparent'; g.lineWidth = o.lb.w; g.strokeStyle = o.lb.c || '#fff'; g.lineJoin = 'round'; g.beginPath(); if (o.lb.r > 0 && g.roundRect) g.roundRect(-o.w / 2, -o.h / 2, o.w, o.h, o.lb.r); else g.rect(-o.w / 2, -o.h / 2, o.w, o.h); g.stroke(); }
    if (o.txo && o.type !== 'text') { const f = ovTex(o), tc = TXC.get(f.id); if (tc) g.drawImage(tc.cv, -f.w / 2 + (o.txo.dx || 0), -f.h / 2 + (o.txo.dy || 0), f.w, f.h); }
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

/* ---------- layer effects (Effect Browser) ---------- */
let CURT = 0;
const FXFOLD = ['Text', 'Documentary', 'Color & Light', 'Drawing & Edge', 'Blur', 'Distortion/Warp', 'Procedural', '3D', 'Move/Transform', 'Repeat'];
const nN = (k, l, min, max, s, d, u) => ({ k, l, min, max, s, d, u });
const nC = (k, l, d) => ({ k, l, c: d });
const nT = (k, l, d) => ({ k, l, b: d });
const nM = (k, l, opts, d) => ({ k, l, opts, d });
function fxClear(A) { A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = 'source-over'; A.globalAlpha = 1; A.filter = 'none'; A.shadowColor = 'transparent'; A.clearRect(0, 0, A.canvas.width, A.canvas.height); }
function fxCopy(A, name) { const T = scratch(name, A.canvas); fxClear(T); T.drawImage(A.canvas, 0, 0); return T; }
function fxFilter(A, css) { const T = fxCopy(A, 'fxt'); fxClear(A); A.filter = css; A.drawImage(T.canvas, 0, 0); A.filter = 'none'; }
function fxPix(A, fn) { const W = A.canvas.width, H = A.canvas.height, im = A.getImageData(0, 0, W, H); fn(im.data, W, H); A.putImageData(im, 0, 0); }
function fxTint(A, col, a) { A.save(); A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = 'source-atop'; A.globalAlpha = a; A.fillStyle = col; A.fillRect(0, 0, A.canvas.width, A.canvas.height); A.restore(); }
function fxOver(A, draw, a) { const U = scratch('fxu', A.canvas); fxClear(U); draw(U); A.save(); A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = 'source-atop'; A.globalAlpha = a == null ? 1 : a; A.drawImage(U.canvas, 0, 0); A.restore(); }
function fxCtr(A, o) { const q = o && o._q; if (q && q.length >= 4) { const B = fxB; return [(((q[0].x + q[1].x + q[2].x + q[3].x) / 4) * B.a + B.x), (((q[0].y + q[1].y + q[2].y + q[3].y) / 4) * B.a + B.y)]; } return [A.canvas.width / 2, A.canvas.height / 2]; }
let fxB = { a: 1, x: 0, y: 0 };
function fxRand(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function fxMap(A, cx, cy, fn) {
  const W = A.canvas.width, H = A.canvas.height, src = A.getImageData(0, 0, W, H), out = A.createImageData(W, H), sd = src.data, od = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = fn(x - cx, y - cy); if (!m) continue;
    const sx = Math.round(cx + m[0]), sy = Math.round(cy + m[1]); if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const i = (y * W + x) * 4, j = (sy * W + sx) * 4; od[i] = sd[j]; od[i + 1] = sd[j + 1]; od[i + 2] = sd[j + 2]; od[i + 3] = sd[j + 3];
  }
  A.putImageData(out, 0, 0);
}
function fxAvg(A, n, place) { // average of n transformed copies (blur-like streaks)
  const T = fxCopy(A, 'fxt'); fxClear(A);
  for (let i = 0; i < n; i++) { A.save(); A.globalAlpha = 1 / (i + 1); place(A, i / Math.max(1, n - 1) - 0.5); A.drawImage(T.canvas, 0, 0); A.restore(); }
}
function fxTinted(A, col) { const U = scratch('fxu', A.canvas); fxClear(U); U.drawImage(A.canvas, 0, 0); U.globalCompositeOperation = 'source-atop'; U.fillStyle = col; U.fillRect(0, 0, A.canvas.width, A.canvas.height); U.globalCompositeOperation = 'source-over'; return U; }

// ---- documentary effects helpers
const fxEase = x => 1 - Math.pow(1 - x, 3);
const fxBack = (x, ov) => { const c1 = 1.70158 * (ov / 30), c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const fxBounce = x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
const TIM = () => [nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Duration (s)', 0.05, 20, 0.05, 0.8), nT('out', 'Animate out at end', 0)];
function fxP(v, e) { // eased in/out progress
  const o = e.o, t0 = (o && o.t0) || 0, loc = e.t - t0, dur = Math.max(0.05, v('dur')), pin = clamp((loc - v('delay')) / dur, 0, 1); let p = fxEase(pin), po = 0;
  if (v('out') && o && o.t1 != null) { po = clamp((loc - (endOf(o) - t0 - dur)) / dur, 0, 1); if (po > 0) p = Math.min(p, 1 - fxEase(po)); }
  return { p, pin, po };
}
function fxBox(A, e) {
  let bx = 0, by = 0, bw = e.W, bh = e.H; const q = e.o && e.o._q, B = fxB;
  if (q && q.length >= 4) { const xs = q.map(a => a.x * B.a + B.x), ys = q.map(a => a.y * B.a + B.y); bx = Math.min(...xs); by = Math.min(...ys); bw = Math.max(...xs) - bx; bh = Math.max(...ys) - by; }
  return { bx, by, bw, bh, cx: bx + bw / 2, cy: by + bh / 2 };
}
function fxWordsVis(full, n) { let w = 0, inW = false, shown = 0; for (let k = 0; k < full.length; k++) { const sp = /\s/.test(full[k]); if (!sp && !inW) { if (w >= n) break; w++; inW = true; } else if (sp) inW = false; shown = k + 1; } return w < n ? full.length : shown; }
const SOON = null;
const FXL = [
  // Text
  ['Text', 'count', 'Count Up/Down', [nN('from', 'Start', -100000, 100000, 1, 0), nN('to', 'End', -100000, 100000, 1, 1000), nM('mode', 'Mode', ['Add', 'Multiply'], 0), nN('dec', 'Decimals', 0, 6, 1, 0), nT('comma', 'Comma', 0)], 'text'],
  ['Text', 'tprog', 'Text Progress', [nN('start', 'Start', 0, 100, 1, 0, '%'), nN('end', 'End', 0, 100, 1, 100, '%'), nT('cur', 'Cursor', 1)], 'text'],
  ['Text', 'timecode', 'Timecode', [nM('mode', 'Mode', ['Up', 'Down'], 0), nN('speed', 'Speed', 0.1, 10, 0.1, 1), nN('start', 'Start (s)', 0, 3600, 1, 0), nT('fr', 'Frames', 1)], 'text'],
  ['Text', 'typing', 'Typing', [nN('sp', 'Speed', 1, 200, 1, 14), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nM('unit', 'Type by', ['Letters', 'Words'], 0), nT('cur', 'Cursor', 1), nT('keep', 'Keep position', 1)], 'text'],
  ['Text', 'dscroll', 'Last Digits Scroll', [nM('n', 'Digits that scroll', ['1', '2', '3', '4'], 1), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Duration (s)', 0.1, 30, 0.1, 1.6), nN('spins', 'Full spins', 0, 50, 1, 3), nM('dir', 'Direction', ['Count up', 'Count down'], 0)], 'text'],
  ['Text', 'odometer', 'Meter Digits (Odometer)', [nM('n', 'Rolling digits', ['All', '1', '2', '3', '4', '5', '6'], 0), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Duration (s)', 0.1, 30, 0.1, 1.6), nN('stag', 'Gap between digits (s)', 0, 5, 0.05, 0.15), nN('spins', 'Extra full spins', 0, 50, 1, 1), nM('dir', 'Direction', ['Roll up', 'Roll down'], 0), nM('order', 'Starts from', ['Right digit', 'Left digit'], 0)], 'text'],
  ['Text', 'randnum', 'Random Digits Reveal', [nM('mode', 'Order', ['Left to right', 'Random', 'Together'], 0), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Duration (s)', 0.1, 30, 0.1, 1.5), nN('sp', 'Change speed', 1, 120, 1, 24)], 'text'],
  ['Text', 'tspace', 'Text Spacing', [nN('sp', 'Spacing', -20, 120, 1, 20)], 'text'],
  ['Text', 'wordbyword', 'Word by Word', [nN('sp', 'Words per second', 0.2, 20, 0.1, 2.5), nN('delay', 'Delay (s)', 0, 120, 0.1, 0)], 'text'],
  ['Text', 'letterreveal', 'Letter Reveal', [nN('sp', 'Letters per second', 1, 200, 1, 12), nN('delay', 'Delay (s)', 0, 120, 0.1, 0)], 'text'],
  ['Text', 'datetitle', 'Date + Place Title', [nM('n', 'Digits that scroll', ['1', '2', '3', '4'], 1), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Scroll time (s)', 0.1, 30, 0.1, 1.4), nN('spins', 'Full spins', 0, 50, 1, 3), nN('pause', 'Pause (s)', 0, 20, 0.1, 0.3), nN('sp', 'Place speed', 1, 200, 1, 14)], 'text'],
  ['Text', 'subtitle', 'Subtitle Highlight', [nC('col', 'Highlight colour', '#facc15'), nN('sp', 'Words per second', 0.2, 20, 0.1, 2.5), nN('delay', 'Delay (s)', 0, 120, 0.1, 0)], 'text'],
  ['Documentary', 'lowerthird', 'Lower Third', [nC('col', 'Bar colour', '#e11d48'), nC('acc', 'Accent colour', '#ffffff'), nN('pad', 'Padding', 0, 100, 1, 16), nN('accw', 'Accent width', 0, 60, 1, 8), nM('dir', 'From', ['Left', 'Right'], 0)].concat(TIM()), (A, v, e) => {
    const { p, pin, po } = fxP(v, e), b = fxBox(A, e), pad = v('pad') * e.s, aw = v('accw') * e.s, right = Math.round(v('dir')) === 1, k = po > 0 ? 1 - fxEase(po) : 1;
    const bp = fxEase(clamp(pin / 0.6, 0, 1)) * k, tp = fxEase(clamp((pin - 0.35) / 0.65, 0, 1)) * k, T = fxCopy(A, 'fxt'); fxClear(A);
    const rx = b.bx - pad, rw = b.bw + pad * 2, ry = b.by - pad * 0.5, rh = b.bh + pad;
    A.save(); A.fillStyle = v('col'); const w = rw * bp; if (right) A.fillRect(rx + rw - w, ry, w, rh); else A.fillRect(rx, ry, w, rh); A.fillStyle = v('acc'); if (aw > 0 && bp > 0) { if (right) A.fillRect(rx + rw - aw, ry, aw, rh); else A.fillRect(rx, ry, aw, rh); } A.restore();
    A.save(); A.beginPath(); A.rect(rx, ry, rw, rh); A.clip(); A.globalAlpha = tp; A.drawImage(T.canvas, (right ? 1 : -1) * (1 - tp) * 40 * e.s, 0); A.restore();
  }],
  ['Documentary', 'fade', 'Fade In/Out', TIM(), (A, v, e) => { const { p } = fxP(v, e); if (p >= 1) return; const T = fxCopy(A, 'fxt'); fxClear(A); A.globalAlpha = p; A.drawImage(T.canvas, 0, 0); A.globalAlpha = 1; }],
  ['Documentary', 'pop', 'Pop', [nN('from', 'Start scale', 0, 200, 1, 0, '%'), nN('over', 'Bounce', 0, 100, 1, 30, '%')].concat(TIM()), (A, v, e) => {
    const { pin, po } = fxP(v, e), b = fxBox(A, e), f = v('from') / 100; let sc = f + (1 - f) * fxBack(pin, v('over')); if (po > 0) sc *= 1 - fxEase(po);
    if (pin >= 1 && po === 0) return; const T = fxCopy(A, 'fxt'); fxClear(A); A.save(); A.globalAlpha = clamp(sc * 2, 0, 1); A.translate(b.cx, b.cy); A.scale(Math.max(0, sc), Math.max(0, sc)); A.translate(-b.cx, -b.cy); A.drawImage(T.canvas, 0, 0); A.restore();
  }],
  ['Documentary', 'highlight', 'Highlight', [nC('col', 'Colour', '#facc15'), nN('h', 'Height', 10, 200, 1, 70, '%'), nN('a', 'Opacity', 0, 100, 1, 85, '%'), nN('pad', 'Padding', 0, 100, 1, 10), nT('behind', 'Behind text', 1)].concat(TIM()), (A, v, e) => {
    const { p } = fxP(v, e), b = fxBox(A, e), pad = v('pad') * e.s, h = b.bh * v('h') / 100; A.save(); if (v('behind')) A.globalCompositeOperation = 'destination-over'; A.globalAlpha = v('a') / 100; A.fillStyle = v('col'); A.fillRect(b.bx - pad, b.cy - h / 2, (b.bw + pad * 2) * p, h); A.restore();
  }],
  ['Documentary', 'underline', 'Underline Draw', [nC('col', 'Colour', '#facc15'), nN('w', 'Thickness', 1, 60, 1, 6), nN('off', 'Offset', -50, 100, 1, 4)].concat(TIM()), (A, v, e) => {
    const { p } = fxP(v, e), b = fxBox(A, e); A.save(); A.strokeStyle = v('col'); A.lineWidth = v('w') * e.s; A.lineCap = 'round'; const y = b.by + b.bh + v('off') * e.s; A.beginPath(); A.moveTo(b.bx, y); A.lineTo(b.bx + b.bw * p, y); A.stroke(); A.restore();
  }],
  ['Documentary', 'quote', 'Quote Card', [nC('col', 'Colour', '#facc15'), nN('size', 'Mark size', 10, 400, 1, 100, '%'), nN('bar', 'Side bar', 0, 40, 1, 8)].concat(TIM()), (A, v, e) => {
    const { p } = fxP(v, e), b = fxBox(A, e), fs = Math.max(20 * e.s, b.bh * 1.1 * v('size') / 100); A.save(); A.globalAlpha = p; A.fillStyle = v('col'); A.font = 'bold ' + fs + 'px Georgia, serif'; A.textBaseline = 'middle'; A.textAlign = 'right'; A.fillText('“', b.bx + fs * 0.1, b.by + fs * 0.1); A.textAlign = 'left'; A.fillText('”', b.bx + b.bw - fs * 0.1, b.by + b.bh); if (v('bar') > 0) A.fillRect(b.bx - fs * 0.55 - v('bar') * e.s, b.by, v('bar') * e.s, b.bh); A.restore();
  }],
  ['Documentary', 'redact', 'Redact (black bars)', [nC('col', 'Colour', '#000000'), nN('n', 'Bars (0 = per line)', 0, 20, 1, 0), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Wipe time (s)', 0.05, 20, 0.05, 0.5), nN('hold', 'Hold (s)', 0, 120, 0.1, 1.5), nT('open', 'Then reveal', 1)], (A, v, e) => {
    const o = e.o, loc = e.t - ((o && o.t0) || 0), du = Math.max(0.05, v('dur')), pin = fxEase(clamp((loc - v('delay')) / du, 0, 1)), po = v('open') ? fxEase(clamp((loc - v('delay') - du - v('hold')) / du, 0, 1)) : 0, b = fxBox(A, e);
    const n = Math.max(1, Math.round(v('n')) || String((o && o.text) || '').split('\n').length), pad = b.bh * 0.08, bh = (b.bh - pad * 2) / n, x0 = b.bx + pad, w = (b.bw - pad * 2);
    A.save(); A.fillStyle = v('col'); for (let i = 0; i < n; i++) { const a = x0 + w * po, ww = w * (pin - po); if (ww > 0) A.fillRect(a, b.by + pad + i * bh + bh * 0.06, ww, bh * 0.88); } A.restore();
  }],
  ['Documentary', 'glitch', 'Glitch', [nN('a', 'Amount', 0, 100, 1, 55, '%'), nN('sp', 'Rate (per s)', 1, 30, 1, 10), nN('d', 'Shift', 1, 200, 1, 30)], (A, v, e) => {
    const k = Math.floor(e.t * v('sp')), r = fxRand(k * 7919 + 13); if (r() > v('a') / 100) return;
    const T = fxCopy(A, 'fxt'), b = fxBox(A, e); fxClear(A); const n = 5 + Math.floor(r() * 5); let y = b.by;
    for (let i = 0; i < n; i++) { const h = (b.bh / n) * (0.5 + r()), dx = (r() - 0.5) * 2 * v('d') * e.s; A.drawImage(T.canvas, 0, y, e.W, h, dx, y, e.W, h); y += h; }
    A.drawImage(T.canvas, 0, 0, e.W, b.by, 0, 0, e.W, b.by); A.drawImage(T.canvas, 0, y, e.W, e.H - y, 0, y, e.W, e.H - y);
    FXD.rgbsplit.fn(A, kk => kk === 'd' ? v('d') * 0.25 : r() * 360, e);
  }],
  ['Documentary', 'flicker', 'Flicker', [nN('a', 'Amount', 0, 100, 1, 60, '%'), nN('sp', 'Rate (per s)', 1, 60, 1, 18)], (A, v, e) => { const r = fxRand(Math.floor(e.t * v('sp')) * 31 + 5), x = r(); if (x > 0.6) return; const T = fxCopy(A, 'fxt'); fxClear(A); A.globalAlpha = 1 - (0.3 + x) * v('a') / 100 * 1.4; A.drawImage(T.canvas, 0, 0); A.globalAlpha = 1; }],
  ['Documentary', 'credits', 'Scroll Credits', [nN('sp', 'Scroll speed', 1, 300, 1, 12, '%/s'), nN('delay', 'Delay (s)', 0, 120, 0.1, 0)], (A, v, e) => {
    const o = e.o, loc = Math.max(0, e.t - ((o && o.t0) || 0) - v('delay')), b = fxBox(A, e), T = fxCopy(A, 'fxt'); fxClear(A);
    A.drawImage(T.canvas, 0, (e.H - b.by) - loc * v('sp') / 100 * e.H);
  }],
  ['Documentary', 'pin', 'Map Pin Label', [nC('col', 'Pin colour', '#ef4444'), nN('size', 'Pin size', 10, 400, 1, 100, '%')].concat(TIM()), (A, v, e) => {
    const { pin } = fxP(v, e), b = fxBox(A, e), r = Math.max(8 * e.s, b.bh * 0.32 * v('size') / 100), gap = 6 * e.s, tipY = b.by - gap - (1 - fxBounce(pin)) * b.bh * 3;
    A.save(); A.globalAlpha = clamp(pin * 3, 0, 1); A.fillStyle = v('col'); A.beginPath(); A.arc(b.cx, tipY - r * 2, r, Math.PI * 0.82, Math.PI * 2.18); A.lineTo(b.cx, tipY); A.closePath(); A.fill(); A.fillStyle = '#fff'; A.beginPath(); A.arc(b.cx, tipY - r * 2, r * 0.38, 0, 7); A.fill(); A.restore();
  }],
  // Color & Light
  ['Color & Light', 'bright', 'Brightness/Contrast', [nN('b', 'Brightness', -100, 100, 1, 20), nN('c', 'Contrast', -100, 100, 1, 0)], (A, v) => fxFilter(A, 'brightness(' + (1 + v('b') / 100) + ') contrast(' + (1 + v('c') / 100) + ')')],
  ['Color & Light', 'exposure', 'Exposure/Gamma', [nN('e', 'Exposure', -2, 2, 0.05, 0.5)], (A, v) => fxFilter(A, 'brightness(' + Math.pow(2, v('e')) + ')')],
  ['Color & Light', 'hue', 'Hue Shift', [nN('h', 'Hue', -180, 180, 1, 90, '°')], (A, v) => fxFilter(A, 'hue-rotate(' + v('h') + 'deg)')],
  ['Color & Light', 'invert', 'Invert', [nN('a', 'Amount', 0, 100, 1, 100, '%')], (A, v) => fxFilter(A, 'invert(' + v('a') + '%)')],
  ['Color & Light', 'satur', 'Saturation/Vibrance', [nN('s', 'Saturation', 0, 300, 1, 160, '%')], (A, v) => fxFilter(A, 'saturate(' + v('s') + '%)')],
  ['Color & Light', 'colorize', 'Colorize', [nC('col', 'Colour', '#ff4fa3'), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v) => { fxFilter(A, 'grayscale(1)'); fxTint(A, v('col'), v('a') / 100); }],
  ['Color & Light', 'solid', 'Solid Color', [nC('col', 'Colour', '#8b5cf6'), nN('a', 'Amount', 0, 100, 1, 100, '%')], (A, v) => fxTint(A, v('col'), v('a') / 100)],
  ['Color & Light', 'temp', 'Color Temperature', [nN('k', 'Warm/Cool', -100, 100, 1, 40)], (A, v) => fxTint(A, v('k') >= 0 ? '#ff8a00' : '#2a8bff', Math.abs(v('k')) / 250)],
  ['Color & Light', 'gradov', 'Gradient Overlay', [nC('c1', 'Colour 1', '#ff4fa3'), nC('c2', 'Colour 2', '#4f8bff'), nN('ang', 'Angle', 0, 360, 1, 90, '°'), nN('a', 'Amount', 0, 100, 1, 70, '%')], (A, v) => { const W = A.canvas.width, H = A.canvas.height, r = v('ang') * D2R, d = Math.hypot(W, H) / 2, dx = Math.cos(r) * d, dy = Math.sin(r) * d; fxOver(A, U => { const gr = U.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy); gr.addColorStop(0, v('c1')); gr.addColorStop(1, v('c2')); U.fillStyle = gr; U.fillRect(0, 0, W, H); }, v('a') / 100); }],
  ['Color & Light', 'threshold', 'Threshold', [nN('l', 'Level', 0, 255, 1, 128)], (A, v) => fxPix(A, (d) => { const L = v('l'); for (let i = 0; i < d.length; i += 4) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2], c = y >= L ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = c; } })],
  ['Color & Light', 'poster', 'Posterize', [nN('n', 'Levels', 2, 12, 1, 4)], (A, v) => fxPix(A, (d) => { const n = Math.max(2, Math.round(v('n'))) - 1; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] / 255 * n) / n * 255; })],
  ['Color & Light', 'rgbsplit', 'RGB Split', [nN('d', 'Distance', 0, 60, 1, 10), nN('ang', 'Angle', 0, 360, 1, 0, '°')], (A, v, e) => {
    const T = fxCopy(A, 'fxt'), U = scratch('fxu', A.canvas), r = v('ang') * D2R, dx = Math.cos(r) * v('d') * e.s, dy = Math.sin(r) * v('d') * e.s; fxClear(A);
    [['#ff0000', -1], ['#00ff00', 0], ['#0000ff', 1]].forEach(([col, k]) => { fxClear(U); U.drawImage(T.canvas, 0, 0); U.globalCompositeOperation = 'multiply'; U.fillStyle = col; U.fillRect(0, 0, e.W, e.H); U.globalCompositeOperation = 'destination-in'; U.drawImage(T.canvas, 0, 0); A.globalCompositeOperation = 'lighter'; A.drawImage(U.canvas, dx * k, dy * k); });
    A.globalCompositeOperation = 'source-over';
  }],
  ['Color & Light', 'lshadow', 'Long Shadow', [nC('col', 'Colour', '#3b1d8f'), nN('len', 'Length', 0, 300, 1, 80), nN('ang', 'Angle', 0, 360, 1, 45, '°')], (A, v, e) => {
    const T = fxCopy(A, 'fxt'), U = fxTinted(A, v('col')), r = v('ang') * D2R, L = v('len') * e.s; fxClear(A);
    for (let d = L; d > 0; d -= Math.max(1, e.s * 1.5)) A.drawImage(U.canvas, Math.cos(r) * d, Math.sin(r) * d);
    A.drawImage(T.canvas, 0, 0);
  }],
  ['Color & Light', 'sglow', 'Soft Glow', [nN('r', 'Radius', 0, 80, 1, 24), nN('a', 'Amount', 0, 100, 1, 60, '%')], (A, v, e) => { const T = fxCopy(A, 'fxt'); A.save(); A.globalCompositeOperation = 'screen'; A.globalAlpha = v('a') / 100; A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(T.canvas, 0, 0); A.restore(); }],
  ['Color & Light', 'lglow', 'Light Glow', [nN('r', 'Radius', 0, 80, 1, 30), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v, e) => { const T = fxCopy(A, 'fxt'); A.save(); A.globalCompositeOperation = 'lighter'; A.globalAlpha = v('a') / 100; A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(T.canvas, 0, 0); A.restore(); }],
  ['Color & Light', 'shine', 'Shine', [nC('col', 'Colour', '#ffffff'), nN('ang', 'Direction', 0, 360, 1, 90, '°'), nN('w', 'Width', 1, 400, 1, 22, '%'), nN('sp', 'Speed', 0.05, 20, 0.05, 1), nN('a', 'Intensity', 0, 500, 1, 90, '%'), nN('gap', 'Pause', 0, 500, 1, 25, '%'), nN('n', 'Shines (0 = loop)', 0, 50, 1, 0)], (A, v, e) => {
    const q = e.o && e.o._q, B = fxB; let hw = e.W / 2, hh = e.H / 2, cx = e.W / 2, cy = e.H / 2;
    if (q && q.length >= 4) { const xs = q.map(p => p.x * B.a + B.x), ys = q.map(p => p.y * B.a + B.y); cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2; hw = (Math.max(...xs) - Math.min(...xs)) / 2; hh = (Math.max(...ys) - Math.min(...ys)) / 2; }
    const r = v('ang') * D2R, L = Math.abs(Math.cos(r)) * hw + Math.abs(Math.sin(r)) * hh, bw = Math.max(3, v('w') / 100 * L * 2), sweep = 1 / Math.max(0.01, v('sp')), cyc = sweep * (1 + v('gap') / 100), loc = Math.max(0, e.t - ((e.o && e.o.t0) || 0)), idx = Math.floor(loc / cyc), n = Math.round(v('n'));
    if (n > 0 && idx >= n) return; const u = (loc % cyc) / sweep; if (u > 1) return;
    const pos = -L - bw + u * (2 * L + 2 * bw), tot = v('a') / 100, reps = Math.max(1, Math.ceil(tot));
    for (let i = 0; i < reps; i++) fxOver(A, U => { U.translate(cx, cy); U.rotate(r); const gr = U.createLinearGradient(pos, 0, pos + bw, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, v('col')); gr.addColorStop(1, 'rgba(255,255,255,0)'); U.fillStyle = gr; U.fillRect(-4000, -4000, 8000, 8000); }, Math.min(1, tot - i));
  }],
  ['Color & Light', 'bumpmap', 'Bump Map', SOON], ['Color & Light', 'colbal', 'Color Balance', SOON], ['Color & Light', 'coltune', 'Color Tune', SOON], ['Color & Light', 'darkglow', 'Dark Glow', SOON], ['Color & Light', 'fourgrad', 'Four-color Gradient', SOON], ['Color & Light', 'gradmap', 'Gradient Map', SOON], ['Color & Light', 'hilite', 'Highlights and Shadows', SOON], ['Color & Light', 'hotcol', 'Hot Color', SOON], ['Color & Light', 'palmap', 'Palette Map', SOON], ['Color & Light', 'rshadow', 'Radial Shadow', SOON], ['Color & Light', 'rays', 'Rays', SOON], ['Color & Light', 'repcol', 'Replace Color', SOON], ['Color & Light', 'spectral', 'Spectral Map', SOON], ['Color & Light', 'spot', 'Spot Color', SOON],
  // Drawing & Edge
  ['Drawing & Edge', 'glow', 'Glow', [nC('col', 'Colour', '#a78bfa'), nN('r', 'Size', 0, 80, 1, 24), nN('a', 'Strength', 0, 100, 1, 100, '%')], (A, v, e) => { const U = fxTinted(A, v('col')); A.save(); A.globalCompositeOperation = 'destination-over'; A.globalAlpha = v('a') / 100; A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(U.canvas, 0, 0); A.drawImage(U.canvas, 0, 0); A.restore(); }],
  ['Drawing & Edge', 'stroke', 'Stroke Color', [nC('col', 'Colour', '#ffffff'), nN('w', 'Width', 0, 40, 1, 6)], (A, v, e) => { const U = fxTinted(A, v('col')), w = v('w') * e.s; A.save(); A.globalCompositeOperation = 'destination-over'; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; A.drawImage(U.canvas, Math.cos(a) * w, Math.sin(a) * w); } A.restore(); }],
  ['Drawing & Edge', 'edges', 'Find Edges', [nN('a', 'Strength', 0, 400, 1, 200, '%')], (A, v) => fxPix(A, (d, W, H) => { const s = d.slice(), k = v('a') / 100, L = (x, y) => { x = Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); const i = (y * W + x) * 4; return (s[i] + s[i + 1] + s[i + 2]) / 3 * (s[i + 3] / 255); }; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gx = L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1), gy = L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1), m = Math.min(255, Math.hypot(gx, gy) * k * 0.25), i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = m; d[i + 3] = 255; } })],
  ['Drawing & Edge', 'halftone', 'Halftone Dots', [nN('s', 'Size', 4, 60, 1, 14), nC('col', 'Colour', '#111111')], (A, v, e) => {
    const T = fxCopy(A, 'fxt'), W = e.W, H = e.H, st = Math.max(3, v('s') * e.s), im = T.getImageData(0, 0, W, H).data; fxClear(A); A.fillStyle = v('col');
    for (let y = st / 2; y < H; y += st) for (let x = st / 2; x < W; x += st) { const i = (Math.floor(y) * W + Math.floor(x)) * 4, al = im[i + 3] / 255; if (al < 0.05) continue; const lu = 1 - (0.3 * im[i] + 0.59 * im[i + 1] + 0.11 * im[i + 2]) / 255, r = st * 0.62 * Math.sqrt(Math.max(0.08, lu)) * al; A.beginPath(); A.arc(x, y, r, 0, 7); A.fill(); }
  }],
  ['Drawing & Edge', 'cmyk', 'CMYK Halftone Dots', SOON], ['Drawing & Edge', 'contgrad', 'Contour Gradient', SOON], ['Drawing & Edge', 'contlines', 'Contour Lines', SOON], ['Drawing & Edge', 'drawprog', 'Drawing Progress', SOON], ['Drawing & Edge', 'edgeglow', 'Edge Glow', SOON], ['Drawing & Edge', 'electric', 'Electric Edges', SOON], ['Drawing & Edge', 'glowscan', 'Glow Scan', SOON], ['Drawing & Edge', 'halflines', 'Halftone Lines', SOON], ['Drawing & Edge', 'innerglow', 'Inner Glow', SOON], ['Drawing & Edge', 'rough', 'Roughen Edges', SOON], ['Drawing & Edge', 'bevel', 'Smooth Bevel', SOON], ['Drawing & Edge', 'smooth', 'Smooth Edges', SOON], ['Drawing & Edge', 'taper', 'Stroke Taper', SOON],
  // Blur
  ['Blur', 'gblur', 'Gaussian Blur', [nN('r', 'Amount', 0, 80, 1, 12)], (A, v, e) => fxFilter(A, 'blur(' + v('r') * e.s + 'px)')],
  ['Blur', 'boxblur', 'Box Blur', [nN('r', 'Amount', 0, 80, 1, 10)], (A, v, e) => fxFilter(A, 'blur(' + v('r') * e.s * 0.8 + 'px)')],
  ['Blur', 'lensblur', 'Lens Blur', [nN('r', 'Amount', 0, 80, 1, 14)], (A, v, e) => fxFilter(A, 'blur(' + v('r') * e.s + 'px)')],
  ['Blur', 'dirblur', 'Directional Blur', [nN('len', 'Length', 0, 200, 1, 40), nN('ang', 'Angle', 0, 360, 1, 0, '°')], (A, v, e) => { const r = v('ang') * D2R, L = v('len') * e.s; fxAvg(A, 14, (c, u) => c.translate(Math.cos(r) * L * u, Math.sin(r) * L * u)); }],
  ['Blur', 'motblur', 'Motion Blur', [nN('len', 'Length', 0, 200, 1, 40), nN('ang', 'Angle', 0, 360, 1, 0, '°')], (A, v, e) => { const r = v('ang') * D2R, L = v('len') * e.s; fxAvg(A, 14, (c, u) => c.translate(Math.cos(r) * L * u, Math.sin(r) * L * u)); }],
  ['Blur', 'zoomblur', 'Zoom Blur', [nN('a', 'Amount', 0, 60, 1, 14, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), k = v('a') / 100; fxAvg(A, 14, (c, u) => { const s = 1 + k * u; c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy); }); }],
  ['Blur', 'spinblur', 'Spin Blur', [nN('a', 'Angle', 0, 90, 1, 14, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), k = v('a') * D2R; fxAvg(A, 14, (c, u) => { c.translate(cx, cy); c.rotate(k * u); c.translate(-cx, -cy); }); }],
  ['Blur', 'mosaic', 'Mosaic', [nN('s', 'Block size', 2, 100, 1, 16)], (A, v, e) => fxMosaic(A, v('s') * e.s)],
  ['Blur', 'sharpen', 'Sharpen', [nN('a', 'Amount', 0, 300, 1, 100, '%')], (A, v) => fxPix(A, (d, W, H) => { const s = d.slice(), k = v('a') / 100; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 3; c++) { const n = s[i + c - 4] + s[i + c + 4] + s[i + c - W * 4] + s[i + c + W * 4]; d[i + c] = Math.min(255, Math.max(0, s[i + c] + k * (s[i + c] * 4 - n) * 0.5)); } } })],
  ['Blur', 'chromzoom', 'Chromatic Zoom Blur', SOON], ['Blur', 'innerblur', 'Inner Blur', SOON], ['Blur', 'linstreak', 'Linear Streaks', SOON], ['Blur', 'maskblur', 'Mask Blur', SOON], ['Blur', 'spinstreak', 'Spin Streaks', SOON], ['Blur', 'streakstripes', 'Streak Stripes', SOON], ['Blur', 'unsharp', 'Unsharp Mask', SOON], ['Blur', 'warpblur', 'Warp Blur', SOON], ['Blur', 'zoomstreak', 'Zoom Streaks', SOON],
  // Distortion / Warp
  ['Distortion/Warp', 'mirror', 'Mirror', [nN('ang', 'Angle', 0, 180, 1, 0, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), T = fxCopy(A, 'fxt'), a = v('ang') * D2R, big = e.W + e.H; A.save(); A.translate(cx, cy); A.rotate(a); A.beginPath(); A.rect(0, -big, big, 2 * big); A.clip(); A.clearRect(-big, -big, 3 * big, 3 * big); A.scale(-1, 1); A.rotate(-a); A.translate(-cx, -cy); A.drawImage(T.canvas, 0, 0); A.restore(); }],
  ['Distortion/Warp', 'pixelate', 'Pixelate', [nN('s', 'Pixel size', 2, 100, 1, 12)], (A, v, e) => fxMosaic(A, v('s') * e.s)],
  ['Distortion/Warp', 'wave', 'Wave Warp', [nN('amp', 'Amplitude', 0, 120, 1, 20), nN('fr', 'Frequency', 1, 40, 1, 8), nN('sp', 'Speed', -10, 10, 0.1, 2)], (A, v, e) => { const T = fxCopy(A, 'fxt'), H = e.H, step = Math.max(2, Math.round(e.s * 2)); fxClear(A); for (let y = 0; y < H; y += step) A.drawImage(T.canvas, 0, y, e.W, step, Math.sin(y / H * v('fr') * 6.283 + e.t * v('sp')) * v('amp') * e.s, y, e.W, step); }],
  ['Distortion/Warp', 'swirl', 'Swirl', [nN('a', 'Angle', -720, 720, 1, 120, '°'), nN('r', 'Radius', 10, 100, 1, 50, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), R = Math.min(e.W, e.H) * v('r') / 100, an = v('a') * D2R; fxMap(A, cx, cy, (dx, dy) => { const r = Math.hypot(dx, dy); if (r >= R) return null; const t = (1 - r / R), th = Math.atan2(dy, dx) + an * t * t; return [Math.cos(th) * r, Math.sin(th) * r]; }); }],
  ['Distortion/Warp', 'pinch', 'Pinch/Bulge', [nN('a', 'Amount', -100, 100, 1, 60), nN('r', 'Radius', 10, 100, 1, 50, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), R = Math.min(e.W, e.H) * v('r') / 100, k = v('a') / 100; fxMap(A, cx, cy, (dx, dy) => { const r = Math.hypot(dx, dy); if (r >= R || r < 1) return null; const n = r / R, f = Math.pow(n, 1 + k * 0.8); return [dx / r * f * R, dy / r * f * R]; }); }],
  ['Distortion/Warp', 'ripple', 'Circular Ripple', [nN('amp', 'Amplitude', 0, 60, 1, 10), nN('fr', 'Frequency', 1, 40, 1, 12), nN('sp', 'Speed', -10, 10, 0.1, 3)], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), amp = v('amp') * e.s, fr = v('fr') / Math.min(e.W, e.H) * 6.283 * 2; fxMap(A, cx, cy, (dx, dy) => { const r = Math.hypot(dx, dy) || 1, o = Math.sin(r * fr - e.t * v('sp')) * amp; return [dx + dx / r * o, dy + dy / r * o]; }); }],
  ['Distortion/Warp', 'kaleido', 'Kaleidoscope', [nN('ang', 'Angle', 0, 180, 1, 0, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), a = v('ang') * D2R, big = e.W + e.H; [0, Math.PI / 2].forEach(b => { const T = fxCopy(A, 'fxt'); A.save(); A.translate(cx, cy); A.rotate(a + b); A.beginPath(); A.rect(0, -big, big, 2 * big); A.clip(); A.clearRect(-big, -big, 3 * big, 3 * big); A.scale(-1, 1); A.rotate(-a - b); A.translate(-cx, -cy); A.drawImage(T.canvas, 0, 0); A.restore(); }); }],
  ['Distortion/Warp', 'tiles', 'Tiles', [nN('n', 'Count', 1, 10, 1, 3)], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) A.drawImage(T.canvas, i * w, j * h, w, h); }],
  ['Distortion/Warp', 'sphere360', '360 Reorient Sphere', SOON], ['Distortion/Warp', 'view360', '360 Viewer', SOON], ['Distortion/Warp', 'bend', 'Bend', SOON], ['Distortion/Warp', 'curl', 'Curl', SOON], ['Distortion/Warp', 'dispmap', 'Displacement Map', SOON], ['Distortion/Warp', 'fractwarp', 'Fractal Warp', SOON], ['Distortion/Warp', 'glass', 'Glass', SOON], ['Distortion/Warp', 'hexrot', 'Hexagon Tile Rotate', SOON], ['Distortion/Warp', 'hexshift', 'Hexagon Tile Shift', SOON], ['Distortion/Warp', 'hextile', 'Hexagon Tiling', SOON], ['Distortion/Warp', 'innerpinch', 'Inner Pinch/Bulge', SOON], ['Distortion/Warp', 'ominoglass', 'Ominio Glass', SOON], ['Distortion/Warp', 'polar', 'Polar Coordinates', SOON], ['Distortion/Warp', 'polardisp', 'Polar Displacement Map', SOON], ['Distortion/Warp', 'squeeze', 'Squeeze', SOON], ['Distortion/Warp', 'stretchseg', 'Stretch Segment', SOON], ['Distortion/Warp', 'tilerot', 'Tile Rotate', SOON], ['Distortion/Warp', 'tileshift', 'Tile Shift', SOON], ['Distortion/Warp', 'turbdisp', 'Turbulent Displace', SOON],
  // Procedural
  ['Procedural', 'stripes', 'Stripes', [nC('col', 'Colour', '#4f8bff'), nN('w', 'Width', 2, 200, 1, 30), nN('ang', 'Angle', 0, 180, 1, 45, '°'), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v, e) => fxOver(A, U => { const w = v('w') * e.s, big = e.W + e.H; U.fillStyle = v('col'); U.translate(e.W / 2, e.H / 2); U.rotate(v('ang') * D2R); for (let x = -big; x < big; x += w * 2) U.fillRect(x, -big, w, big * 2); }, v('a') / 100)],
  ['Procedural', 'grid', 'Grid', [nC('col', 'Colour', '#ffffff'), nN('s', 'Cell size', 10, 300, 1, 60), nN('w', 'Line width', 1, 20, 1, 3), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v, e) => fxOver(A, U => { const s = v('s') * e.s; U.strokeStyle = v('col'); U.lineWidth = v('w') * e.s; U.beginPath(); for (let x = 0; x < e.W; x += s) { U.moveTo(x, 0); U.lineTo(x, e.H); } for (let y = 0; y < e.H; y += s) { U.moveTo(0, y); U.lineTo(e.W, y); } U.stroke(); }, v('a') / 100)],
  ['Procedural', 'dots', 'Dots', [nC('col', 'Colour', '#ffd166'), nN('s', 'Spacing', 8, 200, 1, 40), nN('r', 'Dot size', 1, 100, 1, 30, '%'), nN('a', 'Amount', 0, 100, 1, 90, '%')], (A, v, e) => fxOver(A, U => { const s = v('s') * e.s, r = s * v('r') / 200; U.fillStyle = v('col'); for (let y = s / 2; y < e.H; y += s) for (let x = s / 2; x < e.W; x += s) { U.beginPath(); U.arc(x, y, r, 0, 7); U.fill(); } }, v('a') / 100)],
  ['Procedural', 'noise', 'Noise', [nN('a', 'Amount', 0, 100, 1, 40, '%'), nN('s', 'Grain size', 1, 12, 1, 2), nT('mono', 'Mono', 1)], (A, v, e) => { const rnd = fxRand(Math.floor(e.t * 24) + 7), g = Math.max(1, Math.round(v('s') * e.s)), k = v('a') * 2.55; fxPix(A, (d, W, H) => { for (let y = 0; y < H; y += g) for (let x = 0; x < W; x += g) { const n = (rnd() - 0.5) * k, m = v('mono'), r = m ? n : (rnd() - 0.5) * k, b = m ? n : (rnd() - 0.5) * k; for (let yy = y; yy < Math.min(H, y + g); yy++) for (let xx = x; xx < Math.min(W, x + g); xx++) { const i = (yy * W + xx) * 4; if (!d[i + 3]) continue; d[i] += r; d[i + 1] += n; d[i + 2] += b; } } }); }],
  ['Procedural', 'starfield', 'Simple Starfield', [nC('col', 'Colour', '#ffffff'), nN('n', 'Count', 10, 400, 1, 120), nN('sz', 'Size', 1, 10, 1, 3), nN('sp', 'Twinkle', 0, 10, 0.1, 2)], (A, v, e) => fxOver(A, U => { const rnd = fxRand(11); U.fillStyle = v('col'); for (let i = 0; i < v('n'); i++) { const x = rnd() * e.W, y = rnd() * e.H, ph = rnd() * 6.28, al = 0.5 + 0.5 * Math.sin(e.t * v('sp') + ph); U.globalAlpha = al; U.beginPath(); U.arc(x, y, v('sz') * e.s * (0.4 + rnd() * 0.6), 0, 7); U.fill(); } })],
  ['Procedural', 'rays', 'Radial Rays', [nC('col', 'Colour', '#ffffff'), nN('n', 'Rays', 2, 60, 1, 16), nN('sp', 'Spin', -90, 90, 1, 10), nN('a', 'Amount', 0, 100, 1, 60, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o); fxOver(A, U => { const n = Math.round(v('n')), big = e.W + e.H, off = e.t * v('sp') * D2R; U.fillStyle = v('col'); for (let i = 0; i < n; i++) { const a0 = off + i / n * 6.283, a1 = a0 + 3.1416 / n; U.beginPath(); U.moveTo(cx, cy); U.lineTo(cx + Math.cos(a0) * big, cy + Math.sin(a0) * big); U.lineTo(cx + Math.cos(a1) * big, cy + Math.sin(a1) * big); U.closePath(); U.fill(); } }, v('a') / 100); }],
  ['Procedural', 'contstripes', 'Contour Stripes', SOON], ['Procedural', 'energy', 'Energy Beam', SOON], ['Procedural', 'fractridge', 'Fractal Ridges', SOON], ['Procedural', 'grunge', 'Grunge', SOON], ['Procedural', 'hexarray', 'Hexagon Array', SOON], ['Procedural', 'iridesc', 'Iridescence', SOON], ['Procedural', 'lensflare', 'Lens Flare', SOON], ['Procedural', 'lightning', 'Lightning', SOON], ['Procedural', 'ominodiff', 'Ominio Diffusion+', SOON], ['Procedural', 'ribbon', 'Ribbon', SOON], ['Procedural', 'star', 'Star', SOON], ['Procedural', 'starfield2', 'Starfield', SOON], ['Procedural', 'turb', 'Turbulence', SOON], ['Procedural', 'voronoi', 'Voronoi Cells', SOON],
  // 3D
  ['3D', 'cylinder', 'Cylinder', SOON], ['3D', 'sphere', 'Sphere', SOON], ['3D', 'cube', 'Cube', SOON], ['3D', 'chroma', 'Chroma Key', SOON],
  // Move / Transform
  ['Move/Transform', 'shake', 'Shake', [nN('amp', 'Amount', 0, 100, 1, 12), nN('sp', 'Speed', 1, 40, 1, 14)], (A, v, e) => { const T = fxCopy(A, 'fxt'), k = Math.floor(e.t * v('sp')), r = fxRand(k * 97 + 3); fxClear(A); A.drawImage(T.canvas, (r() - 0.5) * 2 * v('amp') * e.s, (r() - 0.5) * 2 * v('amp') * e.s); }],
  ['Move/Transform', 'offset', 'Offset', [nN('x', 'X', -400, 400, 1, 40), nN('y', 'Y', -400, 400, 1, 0)], (A, v, e) => { const T = fxCopy(A, 'fxt'); fxClear(A); A.drawImage(T.canvas, v('x') * e.s, v('y') * e.s); }],
  ['Move/Transform', 'wiggle', 'Wiggle', [nN('amp', 'Amount', 0, 100, 1, 20), nN('sp', 'Speed', 0, 10, 0.1, 2)], (A, v, e) => { const T = fxCopy(A, 'fxt'); fxClear(A); A.drawImage(T.canvas, Math.sin(e.t * v('sp') * 2.1) * v('amp') * e.s, Math.cos(e.t * v('sp') * 1.7) * v('amp') * e.s); }],
  ['Move/Transform', 'slide', 'Slide Reveal', [nM('dir', 'Direction', ['From top', 'From bottom', 'From left', 'From right', 'All four'], 0), nN('delay', 'Delay (s)', 0, 120, 0.1, 0), nN('dur', 'Duration (s)', 0.05, 20, 0.05, 0.7), nN('dist', 'Distance', 0, 500, 1, 100, '%'), nT('clip', 'Clip in place', 1), nT('fade', 'Fade', 1), nT('out', 'Slide out at end', 0)], (A, v, e) => {
    const o = e.o, t0 = (o && o.t0) || 0, loc = e.t - t0, dur = Math.max(0.05, v('dur')), ease = x => 1 - Math.pow(1 - x, 3);
    let p = ease(clamp((loc - v('delay')) / dur, 0, 1));
    if (v('out') && o) { const po = clamp((loc - (endOf(o) - t0 - dur)) / dur, 0, 1); if (po > 0) p = Math.min(p, 1 - ease(po)); }
    if (p >= 1) return;
    let bx = 0, by = 0, bw = e.W, bh = e.H; const q = o && o._q, B = fxB;
    if (q && q.length >= 4) { const xs = q.map(a => a.x * B.a + B.x), ys = q.map(a => a.y * B.a + B.y); bx = Math.min(...xs); by = Math.min(...ys); bw = Math.max(...xs) - bx; bh = Math.max(...ys) - by; }
    const T = fxCopy(A, 'fxt'), dir = Math.round(v('dir')), dist = v('dist') / 100, clip = v('clip') || dir === 4, al = v('fade') ? p : 1; fxClear(A);
    const put = (cx, cy, cw, ch, dx, dy) => { A.save(); if (clip) { A.beginPath(); A.rect(cx, cy, cw, ch); A.clip(); } A.globalAlpha = al; A.drawImage(T.canvas, dx * (1 - p) * dist * cw, dy * (1 - p) * dist * ch); A.restore(); };
    if (dir === 4) { const hw = bw / 2, hh = bh / 2; put(bx, by, hw, hh, 0, -1); put(bx + hw, by, hw, hh, 1, 0); put(bx + hw, by + hh, hw, hh, 0, 1); put(bx, by + hh, hw, hh, -1, 0); }
    else put(bx, by, bw, bh, dir === 2 ? -1 : dir === 3 ? 1 : 0, dir === 0 ? -1 : dir === 1 ? 1 : 0);
  }],
  ['Move/Transform', 'crop', 'Crop', SOON],
  // Repeat
  ['Repeat', 'echo', 'Echo', [nN('n', 'Copies', 1, 20, 1, 6), nN('d', 'Distance', 0, 200, 1, 30), nN('ang', 'Angle', 0, 360, 1, 0, '°'), nN('fade', 'Fade', 0, 100, 1, 60, '%')], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), r = v('ang') * D2R; fxClear(A); for (let i = n; i >= 1; i--) { A.globalAlpha = Math.max(0, 1 - v('fade') / 100 * i / n); A.drawImage(T.canvas, Math.cos(r) * v('d') * e.s * i, Math.sin(r) * v('d') * e.s * i); } A.globalAlpha = 1; A.drawImage(T.canvas, 0, 0); }],
  ['Repeat', 'mtile', 'Motion Tile', [nN('n', 'Count', 1, 8, 1, 3), nN('sp', 'Scroll', -5, 5, 0.1, 0.5)], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n, o = ((e.t * v('sp')) % 1 + 1) % 1 * w; fxClear(A); for (let j = 0; j < n; j++) for (let i = -1; i < n; i++) A.drawImage(T.canvas, i * w + o, j * h, w, h); }],
];
const FXD = {}; FXL.forEach(r => { FXD[r[1]] = { f: r[0], k: r[1], n: r[2], P: Array.isArray(r[3]) ? r[3] : null, fn: typeof r[4] === 'function' ? r[4] : null, text: r[4] === 'text', soon: !Array.isArray(r[3]) }; });

/* --- remaining effects (second batch) --- */
function fxNoise(x, y, sd) { // smooth value noise 0..1
  const h = (i, j) => { let n = (i * 374761393 + j * 668265263 + sd * 982451653) | 0; n = (n ^ (n >> 13)) * 1274126177 | 0; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b;
}
function fxFbm(x, y, sd) { return fxNoise(x, y, sd) * 0.5 + fxNoise(x * 2, y * 2, sd + 1) * 0.3 + fxNoise(x * 4, y * 4, sd + 2) * 0.2; }
function fxRGB(c) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c || '#000'); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]; }
function fxRamp(cols, u) { u = Math.max(0, Math.min(1, u)) * (cols.length - 1); const i = Math.min(cols.length - 2, Math.floor(u)), f = u - i, a = cols[i], b = cols[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
function fxLumaMap(A, cols) { fxPix(A, d => { for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const y = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, c = fxRamp(cols, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } }); }
function fxBrightOnly(A) { fxPix(A, d => { for (let i = 0; i < d.length; i += 4) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; if (y < 140) d[i + 3] = 0; } }); }
function fxLightStreak(A, v, e, fnPlace) { const T = fxCopy(A, 'fxt'); fxBrightOnly(A); const B = fxCopy(A, 'fxt'); fxClear(A); fnPlace(A, B); A.globalCompositeOperation = 'destination-over'; A.drawImage(T.canvas, 0, 0); A.globalCompositeOperation = 'source-over'; }
function fxEdgeCanvas(A, col, k) { // returns scratch ctx 'fxu' holding coloured edges of A
  const W = A.canvas.width, H = A.canvas.height, src = A.getImageData(0, 0, W, H).data, U = scratch('fxu', A.canvas); fxClear(U);
  const im = U.createImageData(W, H), d = im.data, c = fxRGB(col), L = (x, y) => { x = Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); const i = (y * W + x) * 4; return (0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]) * (src[i + 3] / 255) * 0.5 + src[i + 3] * 0.5; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const gx = L(x + 1, y) - L(x - 1, y), gy = L(x, y + 1) - L(x, y - 1), m = Math.min(1, Math.hypot(gx, gy) * k / 255), i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = m * 255; }
  U.putImageData(im, 0, 0); return U;
}
const FX2 = {};
const FXS = (k, P, fn) => { FX2[k] = [P, fn]; };
const fxSim = (key, ov) => (A, v, e) => FXD[key].fn(A, (k) => (ov && ov[k] != null ? ov[k] : v(k)), e);
// ---- Color & Light
FXS('bumpmap', [nN('a', 'Strength', 0, 300, 1, 120, '%'), nN('ang', 'Light angle', 0, 360, 1, 135, '°')], (A, v) => fxPix(A, (d, W, H) => { const s = d.slice(), r = v('ang') * D2R, dx = Math.round(Math.cos(r)), dy = Math.round(Math.sin(r)), k = v('a') / 100; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = (y * W + x) * 4, j = ((y + dy) * W + x + dx) * 4, h = ((s[i] + s[i + 1] + s[i + 2]) - (s[j] + s[j + 1] + s[j + 2])) / 3 * k * 0.5; for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.max(0, s[i + c] + h)); } }));
FXS('colbal', [nN('r', 'Red', -100, 100, 1, 30), nN('g', 'Green', -100, 100, 1, 0), nN('b', 'Blue', -100, 100, 1, -30)], (A, v) => fxPix(A, d => { const r = v('r') * 1.5, g = v('g') * 1.5, b = v('b') * 1.5; for (let i = 0; i < d.length; i += 4) { d[i] += r; d[i + 1] += g; d[i + 2] += b; } }));
FXS('coltune', [nN('b', 'Brightness', -100, 100, 1, 10), nN('c', 'Contrast', -100, 100, 1, 15), nN('s', 'Saturation', 0, 300, 1, 120, '%'), nN('h', 'Hue', -180, 180, 1, 0, '°')], (A, v) => fxFilter(A, 'brightness(' + (1 + v('b') / 100) + ') contrast(' + (1 + v('c') / 100) + ') saturate(' + v('s') + '%) hue-rotate(' + v('h') + 'deg)'));
FXS('darkglow', [nN('r', 'Radius', 0, 80, 1, 24), nN('a', 'Amount', 0, 100, 1, 70, '%')], (A, v, e) => { const U = fxTinted(A, '#000'); A.save(); A.globalCompositeOperation = 'destination-over'; A.globalAlpha = v('a') / 100; A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(U.canvas, 0, 0); A.drawImage(U.canvas, 0, 0); A.restore(); });
FXS('fourgrad', [nC('c1', 'Top-left', '#ff4fa3'), nC('c2', 'Top-right', '#ffd166'), nC('c3', 'Bottom-left', '#4f8bff'), nC('c4', 'Bottom-right', '#34d399'), nN('a', 'Amount', 0, 100, 1, 70, '%')], (A, v, e) => { const W = e.W, H = e.H, c = ['c1', 'c2', 'c3', 'c4'].map(k => fxRGB(v(k))); fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y++) { const fy = y / H; for (let x = 0; x < W; x++) { const fx = x / W, i = (y * W + x) * 4; for (let k = 0; k < 3; k++) d[i + k] = (c[0][k] * (1 - fx) + c[1][k] * fx) * (1 - fy) + (c[2][k] * (1 - fx) + c[3][k] * fx) * fy; d[i + 3] = 255; } } U.putImageData(im, 0, 0); }, v('a') / 100); });
FXS('gradmap', [nC('c1', 'Shadows', '#1b1464'), nC('c2', 'Mid', '#ff4fa3'), nC('c3', 'Highlights', '#ffe9a8')], (A, v) => fxLumaMap(A, [fxRGB(v('c1')), fxRGB(v('c2')), fxRGB(v('c3'))]));
FXS('hilite', [nN('h', 'Highlights', -100, 100, 1, -30), nN('s', 'Shadows', -100, 100, 1, 40)], (A, v) => fxPix(A, d => { const h = v('h') * 0.8, s = v('s') * 0.8; for (let i = 0; i < d.length; i += 4) { const y = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, k = h * y * y + s * (1 - y) * (1 - y); d[i] += k; d[i + 1] += k; d[i + 2] += k; } }));
FXS('hotcol', [nN('a', 'Heat', 0, 100, 1, 100, '%')], (A, v) => { const T = fxCopy(A, 'fxt'); fxLumaMap(A, [[0, 0, 0], [200, 0, 0], [255, 200, 0], [255, 255, 255]]); if (v('a') < 100) { A.save(); A.globalCompositeOperation = 'destination-over'; A.drawImage(T.canvas, 0, 0); A.restore(); } });
FXS('palmap', [nC('c1', 'Colour 1', '#0b132b'), nC('c2', 'Colour 2', '#5bc0be'), nC('c3', 'Colour 3', '#f4d35e'), nC('c4', 'Colour 4', '#ee6c4d')], (A, v) => fxLumaMap(A, ['c1', 'c2', 'c3', 'c4'].map(k => fxRGB(v(k)))));
FXS('rshadow', [nC('col', 'Colour', '#3b1d8f'), nN('len', 'Length', 0, 80, 1, 25, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), T = fxCopy(A, 'fxt'), U = fxTinted(A, v('col')); fxClear(A); for (let i = 24; i >= 1; i--) { const sc = 1 + v('len') / 100 * i / 24; A.save(); A.translate(cx, cy); A.scale(sc, sc); A.translate(-cx, -cy); A.drawImage(U.canvas, 0, 0); A.restore(); } A.drawImage(T.canvas, 0, 0); });
FXS('rays', [nN('a', 'Amount', 0, 100, 1, 70, '%'), nN('len', 'Length', 0, 100, 1, 40, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), T = fxCopy(A, 'fxt'); A.save(); A.globalCompositeOperation = 'lighter'; for (let i = 1; i <= 14; i++) { A.globalAlpha = v('a') / 100 * (1 - i / 15) * 0.4; const sc = 1 + v('len') / 100 * i / 14; A.save(); A.translate(cx, cy); A.scale(sc, sc); A.translate(-cx, -cy); A.drawImage(T.canvas, 0, 0); A.restore(); } A.restore(); });
FXS('repcol', [nC('from', 'From', '#ff0000'), nC('to', 'To', '#00c2ff'), nN('tol', 'Tolerance', 1, 255, 1, 90)], (A, v) => fxPix(A, d => { const f = fxRGB(v('from')), t = fxRGB(v('to')), tol = v('tol'); for (let i = 0; i < d.length; i += 4) { const dist = Math.hypot(d[i] - f[0], d[i + 1] - f[1], d[i + 2] - f[2]); if (dist < tol) { const k = 1 - dist / tol; d[i] += (t[0] - d[i]) * k; d[i + 1] += (t[1] - d[i + 1]) * k; d[i + 2] += (t[2] - d[i + 2]) * k; } } }));
FXS('spectral', [nN('sh', 'Shift', 0, 360, 1, 0, '°')], (A, v) => fxPix(A, d => { const sh = v('sh'); for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const y = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255, h = ((y * 300 + sh) % 360) / 60, f = h - Math.floor(h), q = 255 * (1 - f), tt = 255 * f, m = Math.floor(h) % 6, c = [[255, tt, 0], [q, 255, 0], [0, 255, tt], [0, q, 255], [tt, 0, 255], [255, 0, q]][m]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } }));
FXS('spot', [nC('col', 'Keep colour', '#ff0000'), nN('tol', 'Range', 10, 300, 1, 110)], (A, v) => fxPix(A, d => { const f = fxRGB(v('col')), tol = v('tol'); for (let i = 0; i < d.length; i += 4) { const dist = Math.hypot(d[i] - f[0], d[i + 1] - f[1], d[i + 2] - f[2]); if (dist > tol) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = y; } } }));
// ---- Drawing & Edge
FXS('cmyk', [nN('s', 'Size', 4, 60, 1, 14), nN('a', 'Amount', 0, 100, 1, 100, '%')], (A, v, e) => { const T = fxCopy(A, 'fxt'), W = e.W, H = e.H, st = Math.max(3, v('s') * e.s), im = T.getImageData(0, 0, W, H).data; fxClear(A); A.globalCompositeOperation = 'multiply'; [['#00b7ff', 0.26], ['#ff2fa0', 0.52], ['#ffe600', 0.78]].forEach(([col, ph], n) => { A.fillStyle = col; for (let y = st / 2; y < H; y += st) for (let x = st / 2; x < W; x += st) { const xx = Math.min(W - 1, Math.floor(x + n * st * 0.18)), yy = Math.min(H - 1, Math.floor(y + n * st * 0.12)), i = (yy * W + xx) * 4, al = im[i + 3] / 255; if (al < 0.05) continue; const lu = 1 - (0.3 * im[i] + 0.59 * im[i + 1] + 0.11 * im[i + 2]) / 255, r = st * 0.5 * Math.sqrt(Math.max(0.1, lu)) * al * v('a') / 100; A.beginPath(); A.arc(x + n * st * 0.18, y + n * st * 0.12, r, 0, 7); A.fill(); } }); A.globalCompositeOperation = 'source-over'; });
FXS('contgrad', [nC('c1', 'Colour 1', '#ff4fa3'), nC('c2', 'Colour 2', '#4f8bff'), nN('r', 'Depth', 1, 120, 1, 30)], (A, v, e) => { const T = fxCopy(A, 'fxt'), W = e.W, H = e.H; fxClear(A); A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(T.canvas, 0, 0); A.filter = 'none'; fxPix(A, d => { const c1 = fxRGB(v('c1')), c2 = fxRGB(v('c2')); for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255, c = fxRamp([c1, c2], a); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } }); A.globalCompositeOperation = 'destination-in'; A.drawImage(T.canvas, 0, 0); A.globalCompositeOperation = 'source-over'; });
FXS('contlines', [nC('col', 'Colour', '#ffffff'), nN('n', 'Lines', 1, 10, 1, 4), nN('d', 'Spacing', 2, 60, 1, 14)], (A, v, e) => { const U = fxTinted(A, v('col')); A.save(); A.globalCompositeOperation = 'destination-over'; for (let n = 1; n <= v('n'); n++) { const w = n * v('d') * e.s; if (n % 2 === 0) continue; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; A.drawImage(U.canvas, Math.cos(a) * w, Math.sin(a) * w); } } A.restore(); });
FXS('drawprog', [nN('p', 'Progress', 0, 100, 1, 60, '%'), nN('ang', 'Angle', 0, 360, 1, 0, '°'), nN('soft', 'Soft edge', 0, 100, 1, 10, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), r = v('ang') * D2R, big = Math.hypot(e.W, e.H), p = v('p') / 100, soft = Math.max(1, v('soft') / 100 * big * 0.3); A.save(); A.globalCompositeOperation = 'destination-in'; A.translate(cx, cy); A.rotate(r); const gr = A.createLinearGradient(-big / 2 + p * big - soft, 0, -big / 2 + p * big, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); A.fillStyle = gr; A.fillRect(-big, -big, big * 2, big * 2); A.restore(); });
FXS('edgeglow', [nC('col', 'Colour', '#22d3ee'), nN('k', 'Strength', 1, 10, 0.5, 4), nN('r', 'Glow', 0, 40, 1, 10)], (A, v, e) => { const T = fxCopy(A, 'fxt'), U = fxEdgeCanvas(A, v('col'), v('k')), W = e.W, H = e.H; fxClear(A); A.drawImage(T.canvas, 0, 0); A.globalCompositeOperation = 'lighter'; A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(U.canvas, 0, 0); A.filter = 'none'; A.drawImage(U.canvas, 0, 0); A.globalCompositeOperation = 'source-over'; });
FXS('electric', [nC('col', 'Colour', '#7dd3fc'), nN('j', 'Jitter', 0, 30, 1, 6), nN('r', 'Glow', 0, 40, 1, 8)], (A, v, e) => { const U = fxEdgeCanvas(A, v('col'), 5), k = Math.floor(e.t * 20), rnd = fxRand(k + 5); fxClear(A); A.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { A.globalAlpha = 0.7; A.drawImage(U.canvas, (rnd() - 0.5) * v('j') * e.s, (rnd() - 0.5) * v('j') * e.s); } A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(U.canvas, 0, 0); A.filter = 'none'; A.globalAlpha = 1; A.globalCompositeOperation = 'source-over'; });
FXS('glowscan', [nC('col', 'Colour', '#ffffff'), nN('sp', 'Speed', -5, 5, 0.1, 1), nN('w', 'Width', 5, 100, 1, 25, '%'), nN('ang', 'Angle', 0, 360, 1, 20, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), big = Math.hypot(e.W, e.H), w = v('w') / 100 * big, pos = (((e.t * v('sp') * 0.3) % 1) + 1) % 1 * (big + w * 2) - big / 2 - w; fxOver(A, U => { U.translate(cx, cy); U.rotate(v('ang') * D2R); const gr = U.createLinearGradient(pos, 0, pos + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, v('col')); gr.addColorStop(1, 'rgba(255,255,255,0)'); U.fillStyle = gr; U.fillRect(-big, -big, big * 2, big * 2); }, 0.9); });
FXS('halflines', [nN('s', 'Spacing', 3, 40, 1, 10), nC('col', 'Colour', '#111111')], (A, v, e) => { const T = fxCopy(A, 'fxt'), W = e.W, H = e.H, st = Math.max(3, v('s') * e.s), im = T.getImageData(0, 0, W, H).data; fxClear(A); A.fillStyle = v('col'); for (let y = st / 2; y < H; y += st) for (let x = 0; x < W; x += Math.max(2, st / 2)) { const i = (Math.floor(y) * W + Math.floor(x)) * 4, al = im[i + 3] / 255; if (al < 0.05) continue; const lu = 1 - (0.3 * im[i] + 0.59 * im[i + 1] + 0.11 * im[i + 2]) / 255; A.fillRect(x, y - st * 0.4 * lu * al, Math.max(2, st / 2), st * 0.8 * lu * al + 0.5); } });
FXS('innerglow', [nC('col', 'Colour', '#ffffff'), nN('r', 'Size', 1, 80, 1, 20), nN('a', 'Strength', 0, 100, 1, 90, '%')], (A, v, e) => { const U = scratch('fxu', A.canvas), T = fxCopy(A, 'fxt'); fxClear(U); U.fillStyle = v('col'); U.fillRect(0, 0, e.W, e.H); U.globalCompositeOperation = 'destination-out'; U.filter = 'blur(' + v('r') * e.s + 'px)'; U.drawImage(T.canvas, 0, 0); U.filter = 'none'; A.save(); A.globalCompositeOperation = 'source-atop'; A.globalAlpha = v('a') / 100; A.drawImage(U.canvas, 0, 0); A.restore(); });
FXS('rough', [nN('a', 'Roughness', 0, 40, 1, 8), nN('s', 'Scale', 1, 30, 1, 8)], (A, v, e) => { const amp = v('a') * e.s, sc = v('s') / 100 / Math.max(1, e.s); fxMap(A, 0, 0, (dx, dy) => [dx + (fxNoise(dx * sc, dy * sc, 3) - 0.5) * amp * 2, dy + (fxNoise(dx * sc, dy * sc, 9) - 0.5) * amp * 2]); });
FXS('bevel', [nN('d', 'Depth', 1, 30, 1, 6), nN('a', 'Strength', 0, 100, 1, 70, '%')], (A, v, e) => { const d = v('d') * e.s, Hh = fxTinted(A, '#fff'), T = fxCopy(A, 'fxt'); Hh.globalCompositeOperation = 'destination-out'; Hh.drawImage(T.canvas, d, d); const H2 = fxCopy(Hh, 'fxv'); const S = fxTinted(A, '#000'); S.globalCompositeOperation = 'destination-out'; S.drawImage(T.canvas, -d, -d); A.save(); A.globalCompositeOperation = 'source-atop'; A.globalAlpha = v('a') / 100; A.drawImage(H2.canvas, 0, 0); A.drawImage(S.canvas, 0, 0); A.restore(); });
FXS('smooth', [nN('r', 'Smoothing', 1, 40, 1, 8)], (A, v, e) => { fxFilter(A, 'blur(' + v('r') * e.s + 'px)'); fxPix(A, d => { for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, Math.max(0, (d[i] - 100) * 255 / 55)); }); });
FXS('taper', [nC('col', 'Colour', '#ffffff'), nN('w', 'Width', 0, 60, 1, 12), nN('ang', 'Thick side', 0, 360, 1, 0, '°')], (A, v, e) => { const U = fxTinted(A, v('col')), w = v('w') * e.s, r0 = v('ang') * D2R; A.save(); A.globalCompositeOperation = 'destination-over'; for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, rr = w * (0.15 + 0.85 * (1 + Math.cos(a - r0)) / 2); A.drawImage(U.canvas, Math.cos(a) * rr, Math.sin(a) * rr); } A.restore(); });
// ---- Blur
FXS('chromzoom', [nN('a', 'Amount', 0, 60, 1, 16, '%')], (A, v, e) => { FXD.zoomblur.fn(A, k => v('a'), e); FXD.rgbsplit.fn(A, k => k === 'd' ? v('a') * 0.4 : 0, Object.assign({}, e)); });
FXS('innerblur', [nN('r', 'Amount', 0, 80, 1, 14)], (A, v, e) => { const T = fxCopy(A, 'fxt'); fxFilter(A, 'blur(' + v('r') * e.s + 'px)'); A.save(); A.globalCompositeOperation = 'destination-in'; A.drawImage(T.canvas, 0, 0); A.restore(); });
FXS('linstreak', [nN('len', 'Length', 0, 300, 1, 80), nN('ang', 'Angle', 0, 360, 1, 0, '°')], (A, v, e) => { const r = v('ang') * D2R, L = v('len') * e.s; fxLightStreak(A, v, e, (c, B) => { for (let i = 0; i < 16; i++) { const u = i / 15 - 0.5; c.save(); c.globalAlpha = 0.25; c.globalCompositeOperation = 'lighter'; c.drawImage(B.canvas, Math.cos(r) * L * u, Math.sin(r) * L * u); c.restore(); } }); });
FXS('maskblur', [nN('r', 'Edge blur', 0, 80, 1, 16)], (A, v, e) => { const T = fxCopy(A, 'fxt'); fxClear(A); A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(T.canvas, 0, 0); A.filter = 'none'; });
FXS('spinstreak', [nN('a', 'Angle', 0, 90, 1, 20, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), k = v('a') * D2R; fxLightStreak(A, v, e, (c, B) => { for (let i = 0; i < 16; i++) { c.save(); c.globalAlpha = 0.25; c.globalCompositeOperation = 'lighter'; c.translate(cx, cy); c.rotate(k * (i / 15 - 0.5)); c.translate(-cx, -cy); c.drawImage(B.canvas, 0, 0); c.restore(); } }); });
FXS('streakstripes', [nN('len', 'Length', 0, 400, 1, 140), nN('ang', 'Angle', 0, 360, 1, 0, '°'), nN('n', 'Stripes', 2, 60, 1, 20)], (A, v, e) => { const T = fxCopy(A, 'fxt'), r = v('ang') * D2R, L = v('len') * e.s, rnd = fxRand(21); fxClear(A); A.drawImage(T.canvas, 0, 0); for (let s = 0; s < v('n'); s++) { const y0 = rnd() * e.H, h = e.H / v('n') * 0.6; A.save(); A.beginPath(); A.rect(0, y0, e.W, h); A.clip(); for (let i = 0; i < 10; i++) { A.globalAlpha = 0.18; A.drawImage(T.canvas, Math.cos(r) * L * (i / 9 - 0.5), Math.sin(r) * L * (i / 9 - 0.5)); } A.restore(); } });
FXS('unsharp', [nN('a', 'Amount', 0, 300, 1, 120, '%'), nN('r', 'Radius', 1, 20, 1, 3)], (A, v, e) => { const T = fxCopy(A, 'fxt'), W = e.W, H = e.H, o = T.getImageData(0, 0, W, H); fxClear(A); A.filter = 'blur(' + v('r') * e.s + 'px)'; A.drawImage(T.canvas, 0, 0); A.filter = 'none'; const b = A.getImageData(0, 0, W, H).data, d = o.data, k = v('a') / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.max(0, d[i + c] + (d[i + c] - b[i + c]) * k)); A.putImageData(o, 0, 0); });
FXS('warpblur', [nN('r', 'Blur', 0, 60, 1, 8), nN('amp', 'Warp', 0, 80, 1, 16)], (A, v, e) => { const amp = v('amp') * e.s, sc = 0.02 / Math.max(1, e.s); fxMap(A, 0, 0, (dx, dy) => [dx + (fxFbm(dx * sc, dy * sc, 4) - 0.5) * amp * 2, dy + (fxFbm(dx * sc, dy * sc, 8) - 0.5) * amp * 2]); fxFilter(A, 'blur(' + v('r') * e.s + 'px)'); });
FXS('zoomstreak', [nN('a', 'Amount', 0, 100, 1, 40, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o); fxLightStreak(A, v, e, (c, B) => { for (let i = 0; i < 16; i++) { c.save(); c.globalAlpha = 0.25; c.globalCompositeOperation = 'lighter'; const sc = 1 + v('a') / 100 * (i / 15); c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy); c.drawImage(B.canvas, 0, 0); c.restore(); } }); });
// ---- Distortion / Warp
FXS('sphere360', [nN('yaw', 'Yaw', -180, 180, 1, 40, '°'), nN('sp', 'Spin', -90, 90, 1, 0, '°')], (A, v, e) => { const T = fxCopy(A, 'fxt'), sh = ((v('yaw') + v('sp') * e.t) / 360 % 1 + 1) % 1 * e.W; fxClear(A); A.drawImage(T.canvas, sh, 0); A.drawImage(T.canvas, sh - e.W, 0); });
FXS('view360', [nN('a', 'Fisheye', 0, 100, 1, 60), nN('r', 'Radius', 10, 100, 1, 70, '%')], (A, v, e) => FXD.pinch.fn(A, k => k === 'a' ? v('a') : v('r'), e));
FXS('bend', [nN('a', 'Bend', -200, 200, 1, 60), nN('ang', 'Angle', 0, 180, 1, 0, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), k = v('a') * e.s / 100, r = v('ang') * D2R, c = Math.cos(r), s = Math.sin(r), W = e.W; fxMap(A, cx, cy, (dx, dy) => { const u = dx * c + dy * s, w = -dx * s + dy * c, wn = w - k * (u * u) / W; return [u * c - wn * s, u * s + wn * c]; }); });
FXS('curl', [nN('a', 'Curl', 0, 100, 1, 50), nN('ang', 'Angle', 0, 360, 1, 45, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), r = v('ang') * D2R, big = Math.min(e.W, e.H) * 0.5; fxMap(A, cx, cy, (dx, dy) => { const u = dx * Math.cos(r) + dy * Math.sin(r), edge = big * (1 - v('a') / 100 * 1.2); if (u < edge) return null; const f = (u - edge), nu = edge - f * 0.6; return [dx + (nu - u) * Math.cos(r), dy + (nu - u) * Math.sin(r)]; }); });
FXS('dispmap', [nN('a', 'Amount', 0, 100, 1, 20), nN('s', 'Scale', 1, 60, 1, 10), nN('sp', 'Speed', 0, 10, 0.1, 1)], (A, v, e) => { const amp = v('a') * e.s, sc = v('s') / 1000 / Math.max(1, e.s), tt = e.t * v('sp') * 0.3; fxMap(A, 0, 0, (dx, dy) => [dx + (fxNoise(dx * sc + tt, dy * sc, 1) - 0.5) * amp, dy + (fxNoise(dx * sc, dy * sc + tt, 2) - 0.5) * amp]); });
FXS('fractwarp', [nN('a', 'Amount', 0, 100, 1, 30), nN('s', 'Scale', 1, 60, 1, 8), nN('sp', 'Evolution', 0, 10, 0.1, 1)], (A, v, e) => { const amp = v('a') * e.s, sc = v('s') / 1000 / Math.max(1, e.s), tt = e.t * v('sp') * 0.3; fxMap(A, 0, 0, (dx, dy) => [dx + (fxFbm(dx * sc + tt, dy * sc, 5) - 0.5) * amp * 2, dy + (fxFbm(dx * sc, dy * sc - tt, 6) - 0.5) * amp * 2]); });
FXS('turbdisp', [nN('a', 'Amount', 0, 100, 1, 25), nN('s', 'Size', 1, 60, 1, 14), nN('sp', 'Speed', 0, 10, 0.1, 2)], (A, v, e) => { const amp = v('a') * e.s, sc = v('s') / 1000 / Math.max(1, e.s), tt = e.t * v('sp') * 0.5; fxMap(A, 0, 0, (dx, dy) => [dx + (fxFbm(dx * sc + tt, dy * sc + tt, 7) - 0.5) * amp * 2, dy + (fxFbm(dx * sc - tt, dy * sc + tt, 8) - 0.5) * amp * 2]); });
FXS('glass', [nN('s', 'Cell size', 4, 100, 1, 20), nN('a', 'Refraction', 0, 60, 1, 14)], (A, v, e) => { const cs = Math.max(4, v('s') * e.s), amp = v('a') * e.s; fxMap(A, 0, 0, (dx, dy) => { const fx = (((dx % cs) + cs) % cs) / cs - 0.5, fy = (((dy % cs) + cs) % cs) / cs - 0.5; return [dx - fx * amp, dy - fy * amp]; }); });
FXS('ominoglass', [nN('s', 'Cell size', 4, 160, 1, 50), nN('a', 'Refraction', 0, 80, 1, 24)], (A, v, e) => { const cs = Math.max(4, v('s') * e.s), amp = v('a') * e.s; fxMap(A, 0, 0, (dx, dy) => { const fx = Math.sin(dx / cs * 3.1416), fy = Math.sin(dy / cs * 3.1416); return [dx + fx * amp, dy + fy * amp]; }); });
FXS('hextile', [nN('n', 'Count', 1, 10, 1, 4)], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) for (let i = -1; i <= n; i++) A.drawImage(T.canvas, i * w + (j % 2 ? w / 2 : 0), j * h, w, h); });
FXS('hexshift', [nN('n', 'Count', 1, 10, 1, 4), nN('sp', 'Shift', -5, 5, 0.1, 1)], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) { const o = ((e.t * v('sp') * (j % 2 ? 1 : -1) * 0.3) % 1 + 1) % 1 * w; for (let i = -2; i <= n; i++) A.drawImage(T.canvas, i * w + o, j * h, w, h); } });
FXS('hexrot', [nN('n', 'Count', 1, 8, 1, 4), nN('a', 'Rotate', -180, 180, 1, 30, '°')], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { A.save(); A.translate(i * w + w / 2 + (j % 2 ? w / 4 : 0), j * h + h / 2); A.rotate(v('a') * D2R * ((i + j) % 2 ? 1 : -1)); A.drawImage(T.canvas, -w / 2, -h / 2, w, h); A.restore(); } });
FXS('tilerot', [nN('n', 'Count', 1, 8, 1, 3), nN('sp', 'Spin', -90, 90, 1, 30, '°')], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { A.save(); A.translate(i * w + w / 2, j * h + h / 2); A.rotate(v('sp') * D2R * e.t * ((i + j) % 2 ? 1 : -1)); A.drawImage(T.canvas, -w / 2, -h / 2, w, h); A.restore(); } });
FXS('tileshift', [nN('n', 'Count', 1, 8, 1, 3), nN('x', 'Shift X', -100, 100, 1, 30, '%'), nN('y', 'Shift Y', -100, 100, 1, 0, '%')], (A, v, e) => { const T = fxCopy(A, 'fxt'), n = Math.round(v('n')), w = e.W / n, h = e.H / n; fxClear(A); for (let j = 0; j < n; j++) for (let i = -1; i <= n; i++) A.drawImage(T.canvas, i * w + (j % 2 ? w * v('x') / 100 : 0), j * h + (i % 2 ? h * v('y') / 100 : 0), w, h); });
FXS('innerpinch', [nN('a', 'Amount', -100, 100, 1, -50), nN('r', 'Radius', 10, 100, 1, 35, '%')], (A, v, e) => FXD.pinch.fn(A, k => k === 'a' ? v('a') : v('r'), e));
FXS('polar', [nN('a', 'Amount', 0, 100, 1, 100, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), W = e.W, H = e.H, R = Math.min(W, H) / 2; fxMap(A, cx, cy, (dx, dy) => { const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx); if (r > R) return null; return [(th / 6.283) * W * v('a') / 100 + (1 - v('a') / 100) * dx + W / 2 - cx, (r / R) * H - H / 2 + cy - cy + (cy - cy)]; }); });
FXS('polardisp', [nN('a', 'Wave', 0, 100, 1, 30), nN('n', 'Count', 1, 30, 1, 8)], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o); fxMap(A, cx, cy, (dx, dy) => { const r = Math.hypot(dx, dy) || 1, th = Math.atan2(dy, dx), k = 1 + Math.sin(th * v('n') + e.t * 2) * v('a') / 400; return [dx * k, dy * k]; }); });
FXS('squeeze', [nN('a', 'Amount', -100, 100, 1, 50)], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), H = e.H; fxMap(A, cx, cy, (dx, dy) => [dx * (1 + v('a') / 100 * Math.abs(dy) / (H / 2)), dy]); });
FXS('stretchseg', [nN('y', 'Position', -100, 100, 1, 0, '%'), nN('h', 'Band', 5, 100, 1, 25, '%'), nN('s', 'Stretch', 1, 6, 0.1, 2)], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), H = e.H, c = v('y') / 100 * H / 2, hb = v('h') / 100 * H / 2; fxMap(A, cx, cy, (dx, dy) => { const d = dy - c; if (Math.abs(d) < hb) return [dx, c + d / v('s')]; return [dx, dy + (d > 0 ? 1 : -1) * hb * (1 - 1 / v('s'))]; }); });
// ---- Procedural
FXS('contstripes', [nC('col', 'Colour', '#4f8bff'), nN('w', 'Width', 2, 100, 1, 14), nN('sp', 'Speed', -5, 5, 0.1, 1), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o); fxOver(A, U => { const w = v('w') * e.s, big = Math.hypot(e.W, e.H), off = ((e.t * v('sp') * w) % (w * 2) + w * 2) % (w * 2); U.fillStyle = v('col'); for (let r = big + off; r > 0; r -= w * 2) { U.beginPath(); U.arc(cx, cy, r, 0, 7); U.arc(cx, cy, Math.max(0, r - w), 0, 7, true); U.fill('evenodd'); } }, v('a') / 100); });
FXS('energy', [nC('col', 'Colour', '#22d3ee'), nN('w', 'Width', 1, 60, 1, 10), nN('ang', 'Angle', 0, 360, 1, 0, '°'), nN('a', 'Amount', 0, 100, 1, 100, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), big = Math.hypot(e.W, e.H); A.save(); A.globalCompositeOperation = 'lighter'; A.translate(cx, cy); A.rotate(v('ang') * D2R); A.globalAlpha = v('a') / 100; A.strokeStyle = v('col'); A.lineCap = 'round'; for (const [lw, bl] of [[v('w') * 3, 18], [v('w'), 6], [v('w') * 0.3, 0]]) { A.lineWidth = lw * e.s; A.filter = bl ? 'blur(' + bl * e.s + 'px)' : 'none'; A.beginPath(); A.moveTo(-big, 0); for (let x = -big; x <= big; x += 20) A.lineTo(x, Math.sin(x / 60 + e.t * 6) * 8 * e.s); A.stroke(); } A.restore(); });
FXS('fractridge', [nN('s', 'Scale', 1, 60, 1, 12), nC('col', 'Colour', '#e5e7eb'), nN('a', 'Amount', 0, 100, 1, 70, '%')], (A, v, e) => { const sc = v('s') / 1000 / Math.max(1, e.s), c = fxRGB(v('col')), W = e.W, H = e.H; fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const n = 1 - Math.abs(fxFbm(x * sc + e.t * 0.2, y * sc, 12) - 0.5) * 2, k = n * n; for (let yy = 0; yy < 2 && y + yy < H; yy++) for (let xx = 0; xx < 2 && x + xx < W; xx++) { const i = ((y + yy) * W + x + xx) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = k * 255; } } U.putImageData(im, 0, 0); }, v('a') / 100); });
FXS('grunge', [nN('a', 'Amount', 0, 100, 1, 60, '%'), nN('s', 'Scale', 1, 60, 1, 14)], (A, v, e) => { const sc = v('s') / 1000 / Math.max(1, e.s), W = e.W, H = e.H; fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const n = fxFbm(x * sc, y * sc, 31), g = n > 0.55 ? (n - 0.55) * 6 : 0, rr = fxNoise(x * 0.4, y * 0.4, 5) > 0.82 ? 1 : 0, k = Math.min(1, g + rr * 0.5); for (let yy = 0; yy < 2 && y + yy < H; yy++) for (let xx = 0; xx < 2 && x + xx < W; xx++) { const i = ((y + yy) * W + x + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 10; d[i + 3] = k * 255; } } U.putImageData(im, 0, 0); }, v('a') / 100); });
FXS('hexarray', [nC('col', 'Colour', '#ffffff'), nN('s', 'Size', 10, 200, 1, 50), nN('w', 'Line', 1, 12, 1, 2), nN('a', 'Amount', 0, 100, 1, 80, '%')], (A, v, e) => fxOver(A, U => { const r = v('s') * e.s, hh = r * Math.sqrt(3); U.strokeStyle = v('col'); U.lineWidth = v('w') * e.s; for (let row = -1; row * hh * 0.5 < e.H + hh; row++) for (let col = -1; col * r * 1.5 < e.W + r * 2; col++) { const x = col * r * 1.5, y = row * hh + (col % 2 ? hh / 2 : 0); U.beginPath(); for (let k = 0; k < 6; k++) { const a = k * 1.0472; k ? U.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : U.moveTo(x + r, y); } U.closePath(); U.stroke(); } }, v('a') / 100));
FXS('iridesc', [nN('a', 'Amount', 0, 100, 1, 50, '%'), nN('sp', 'Speed', -5, 5, 0.1, 1), nN('s', 'Scale', 1, 20, 1, 4)], (A, v, e) => fxOver(A, U => { const W = e.W, H = e.H, gr = U.createLinearGradient(0, 0, W, H); for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, 'hsl(' + ((i * 60 * v('s') / 4 + e.t * v('sp') * 60) % 360) + ',90%,65%)'); U.fillStyle = gr; U.fillRect(0, 0, W, H); }, v('a') / 100));
FXS('lensflare', [nN('x', 'X', -100, 100, 1, -30, '%'), nN('y', 'Y', -100, 100, 1, -30, '%'), nN('a', 'Brightness', 0, 100, 1, 90, '%')], (A, v, e) => { const W = e.W, H = e.H, x = W / 2 + v('x') / 100 * W / 2, y = H / 2 + v('y') / 100 * H / 2; A.save(); A.globalCompositeOperation = 'lighter'; A.globalAlpha = v('a') / 100; let gr = A.createRadialGradient(x, y, 0, x, y, Math.min(W, H) * 0.35); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,150,.5)'); gr.addColorStop(1, 'rgba(255,150,50,0)'); A.fillStyle = gr; A.fillRect(0, 0, W, H); [[0.4, '#ff6a6a', 0.08], [0.7, '#6aff9a', 0.05], [1.2, '#6aa8ff', 0.1], [1.6, '#ffe36a', 0.06]].forEach(([k, c, r]) => { const px = x + (W / 2 - x) * k, py = y + (H / 2 - y) * k; A.fillStyle = c; A.globalAlpha = 0.3 * v('a') / 100; A.beginPath(); A.arc(px, py, Math.min(W, H) * r, 0, 7); A.fill(); }); A.restore(); });
FXS('lightning', [nC('col', 'Colour', '#a5b4fc'), nN('w', 'Width', 1, 20, 1, 4), nN('j', 'Jaggedness', 1, 100, 1, 40), nN('sp', 'Flicker', 1, 30, 1, 12)], (A, v, e) => { const W = e.W, H = e.H, rnd = fxRand(Math.floor(e.t * v('sp')) * 31 + 7); A.save(); A.globalCompositeOperation = 'lighter'; A.strokeStyle = v('col'); A.lineJoin = 'round'; [[v('w') * 4, 14], [v('w'), 4], [v('w') * 0.4, 0]].forEach(([lw, bl], pass) => { const r2 = fxRand(Math.floor(e.t * v('sp')) * 31 + 7); A.lineWidth = lw * e.s; A.filter = bl ? 'blur(' + bl * e.s + 'px)' : 'none'; A.beginPath(); let x = W / 2 + (r2() - 0.5) * W * 0.4; A.moveTo(x, 0); for (let y = 0; y < H; y += H / 18) { x += (r2() - 0.5) * v('j') * e.s * 2; A.lineTo(x, y); } A.stroke(); }); A.restore(); });
FXS('ominodiff', [nN('s', 'Scale', 1, 40, 1, 6), nN('a', 'Amount', 0, 100, 1, 60, '%'), nN('sp', 'Speed', 0, 10, 0.1, 1)], (A, v, e) => { const sc = v('s') / 1000 / Math.max(1, e.s), W = e.W, H = e.H, tt = e.t * v('sp') * 0.2; fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const n = fxFbm(x * sc + tt, y * sc, 41), c = fxRamp([[80, 60, 200], [255, 90, 170], [90, 220, 255]], n * 1.6 - 0.2); for (let yy = 0; yy < 3 && y + yy < H; yy++) for (let xx = 0; xx < 3 && x + xx < W; xx++) { const i = ((y + yy) * W + x + xx) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } } U.putImageData(im, 0, 0); U.filter = 'blur(' + 6 * e.s + 'px)'; U.drawImage(U.canvas, 0, 0); }, v('a') / 100); });
FXS('ribbon', [nC('col', 'Colour', '#f472b6'), nN('w', 'Width', 2, 80, 1, 18), nN('amp', 'Wave', 0, 200, 1, 60), nN('sp', 'Speed', -10, 10, 0.1, 2)], (A, v, e) => { const W = e.W, H = e.H; A.save(); A.globalCompositeOperation = 'lighter'; A.lineCap = 'round'; for (let k = 0; k < 3; k++) { A.strokeStyle = v('col'); A.globalAlpha = 0.5 - k * 0.12; A.lineWidth = v('w') * e.s * (1 - k * 0.25); A.filter = 'blur(' + (2 + k * 3) * e.s + 'px)'; A.beginPath(); for (let x = 0; x <= W; x += 12) { const y = H / 2 + Math.sin(x / (W / 3) * 6.283 / 2 + e.t * v('sp') + k * 0.8) * v('amp') * e.s; x ? A.lineTo(x, y) : A.moveTo(x, y); } A.stroke(); } A.restore(); });
FXS('star', [nC('col', 'Colour', '#fde68a'), nN('r', 'Size', 5, 100, 1, 30, '%'), nN('n', 'Points', 3, 12, 1, 4), nN('rot', 'Spin', -180, 180, 1, 20, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), R = Math.min(e.W, e.H) * v('r') / 100, n = Math.round(v('n')); A.save(); A.globalCompositeOperation = 'lighter'; A.translate(cx, cy); A.rotate(v('rot') * D2R * e.t); A.fillStyle = v('col'); A.filter = 'blur(' + 2 * e.s + 'px)'; A.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? R * 0.12 : R, a = i / (n * 2) * 6.283 - 1.5708; i ? A.lineTo(Math.cos(a) * r, Math.sin(a) * r) : A.moveTo(Math.cos(a) * r, Math.sin(a) * r); } A.closePath(); A.fill(); A.restore(); });
FXS('starfield2', [nC('col', 'Colour', '#ffffff'), nN('n', 'Count', 10, 500, 1, 200), nN('sp', 'Fly speed', 0, 10, 0.1, 2)], (A, v, e) => { const W = e.W, H = e.H, rnd = fxRand(77); A.save(); A.globalCompositeOperation = 'lighter'; A.fillStyle = v('col'); for (let i = 0; i < v('n'); i++) { const ang = rnd() * 6.283, z = (rnd() + e.t * v('sp') * 0.15) % 1, r = z * z * Math.hypot(W, H) * 0.6; A.globalAlpha = z; A.beginPath(); A.arc(W / 2 + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r, 1 + z * 3 * e.s, 0, 7); A.fill(); } A.restore(); });
FXS('turb', [nN('s', 'Scale', 1, 60, 1, 10), nN('a', 'Amount', 0, 100, 1, 60, '%'), nN('sp', 'Speed', 0, 10, 0.1, 1)], (A, v, e) => { const sc = v('s') / 1000 / Math.max(1, e.s), W = e.W, H = e.H, tt = e.t * v('sp') * 0.3; fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const n = fxFbm(x * sc + tt, y * sc - tt, 51) * 255; for (let yy = 0; yy < 3 && y + yy < H; yy++) for (let xx = 0; xx < 3 && x + xx < W; xx++) { const i = ((y + yy) * W + x + xx) * 4; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; } } U.putImageData(im, 0, 0); }, v('a') / 100); });
FXS('voronoi', [nN('n', 'Cells', 3, 60, 1, 16), nN('a', 'Amount', 0, 100, 1, 70, '%'), nT('edge', 'Edges', 1)], (A, v, e) => { const W = e.W, H = e.H, rnd = fxRand(5), n = Math.round(v('n')), pts = [], cs = []; for (let i = 0; i < n; i++) { pts.push([rnd() * W, rnd() * H]); cs.push([100 + rnd() * 155, 100 + rnd() * 155, 100 + rnd() * 155]); } const st = 4; fxOver(A, U => { const im = U.createImageData(W, H), d = im.data; for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) { let b = 1e9, b2 = 1e9, bi = 0; for (let i = 0; i < n; i++) { const dd = Math.hypot(x - pts[i][0], y - pts[i][1]); if (dd < b) { b2 = b; b = dd; bi = i; } else if (dd < b2) b2 = dd; } const ed = v('edge') && b2 - b < 3 * e.s ? 0.2 : 1; for (let yy = 0; yy < st && y + yy < H; yy++) for (let xx = 0; xx < st && x + xx < W; xx++) { const i = ((y + yy) * W + x + xx) * 4; d[i] = cs[bi][0] * ed; d[i + 1] = cs[bi][1] * ed; d[i + 2] = cs[bi][2] * ed; d[i + 3] = 255; } } U.putImageData(im, 0, 0); }, v('a') / 100); });
// ---- 3D / Move / Chroma
FXS('cylinder', [nN('a', 'Curve', 0, 100, 1, 70, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), R = e.W * 0.3; fxMap(A, cx, cy, (dx, dy) => { const u = Math.max(-1, Math.min(1, dx / R)), sx = Math.asin(u) * R * (v('a') / 100) + dx * (1 - v('a') / 100); return Math.abs(dx) > R ? [dx, dy] : [sx, dy]; }); });
FXS('cylinder', [nN('a', 'Shape', 0, 100, 1, 100, '%'), nN('sz', 'Size', 10, 120, 1, 50, '%'), nN('rot', 'Rotate', -360, 360, 1, 0, '°'), nN('sp', 'Spin', -180, 180, 1, 40, '°')], (A, v, e) => {
  const [cx, cy] = fxCtr(A, e.o), q = e.o && e.o._q, B = fxB; let base = e.W / 4; if (q && q.length >= 4) { const xs = q.map(p => p.x * B.a + B.x); base = (Math.max(...xs) - Math.min(...xs)) / 2; }
  const R = Math.max(4, base * v('sz') / 50), ws = base * 2, rot = (v('rot') + v('sp') * e.t) * D2R, a = v('a') / 100;
  fxMap(A, cx, cy, (dx, dy) => { if (Math.abs(dx) >= R) return null; const th = Math.asin(dx / R); let sx = (th + rot) / 6.2832 * ws; sx = ((sx + ws / 2) % ws + ws) % ws - ws / 2; return [dx * (1 - a) + sx * a, dy]; });
});
FXS('sphere', [nN('a', 'Amount', 0, 100, 1, 80), nN('r', 'Radius', 10, 100, 1, 45, '%')], (A, v, e) => FXD.pinch.fn(A, k => k === 'a' ? v('a') : v('r'), e));
FXS('cube', [nN('a', 'Turn', -80, 80, 1, 30, '°')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), T = fxCopy(A, 'fxt'), W = e.W, H = e.H, k = Math.sin(v('a') * D2R) * 0.4; fxClear(A); for (let x = 0; x < W; x += 2) { const side = x < cx ? -1 : 1, sc = 1 + side * k * (1 - Math.abs(x - cx) / (W / 2)) * 0.5; A.drawImage(T.canvas, x, 0, 2, H, x, cy - (cy) * sc, 2, H * sc); } });
FXS('chroma', [nC('col', 'Key colour', '#00ff00'), nN('tol', 'Tolerance', 1, 255, 1, 90), nN('soft', 'Softness', 0, 100, 1, 30)], (A, v) => fxPix(A, d => { const f = fxRGB(v('col')), tol = v('tol'), sf = Math.max(1, v('soft')); for (let i = 0; i < d.length; i += 4) { const dist = Math.hypot(d[i] - f[0], d[i + 1] - f[1], d[i + 2] - f[2]); if (dist < tol) d[i + 3] = 0; else if (dist < tol + sf) d[i + 3] *= (dist - tol) / sf; } }));
FXS('crop', [nN('l', 'Left', 0, 100, 1, 10, '%'), nN('r', 'Right', 0, 100, 1, 10, '%'), nN('t', 'Top', 0, 100, 1, 10, '%'), nN('b', 'Bottom', 0, 100, 1, 10, '%')], (A, v, e) => { const [cx, cy] = fxCtr(A, e.o), q = e.o && e.o._q; let x0 = 0, y0 = 0, w = e.W, h = e.H; if (q && q.length >= 4) { const xs = q.map(p => p.x * fxB.a + fxB.x), ys = q.map(p => p.y * fxB.a + fxB.y); x0 = Math.min(...xs); y0 = Math.min(...ys); w = Math.max(...xs) - x0; h = Math.max(...ys) - y0; } A.save(); A.globalCompositeOperation = 'destination-out'; A.fillRect(0, 0, 0, 0); A.fillStyle = '#000'; A.fillRect(x0 - 5, y0 - 5, w * v('l') / 100 + 5, h + 10); A.fillRect(x0 + w * (1 - v('r') / 100), y0 - 5, w * v('r') / 100 + 5, h + 10); A.fillRect(x0 - 5, y0 - 5, w + 10, h * v('t') / 100 + 5); A.fillRect(x0 - 5, y0 + h * (1 - v('b') / 100), w + 10, h * v('b') / 100 + 5); A.restore(); });
Object.keys(FX2).forEach(k => { const d = FXD[k]; if (!d) return; d.P = FX2[k][0]; d.fn = FX2[k][1]; d.soon = false; });
// wider scroll ranges: anything that stopped at 50-100 can now go three times further
Object.values(FXD).forEach(d => (d.P || []).forEach(q => { if (q.max != null && q.k !== 'sp' && q.k !== 'n' && q.u !== '°' && q.min >= 0 && q.max >= 50 && q.max <= 100) q.max *= 3; }));

function fxMosaic(A, s) {
  s = Math.max(2, s); const W = A.canvas.width, H = A.canvas.height, T = fxCopy(A, 'fxt'), U = scratch('fxu', A.canvas), w = Math.max(1, Math.ceil(W / s)), h = Math.max(1, Math.ceil(H / s));
  fxClear(U); U.imageSmoothingEnabled = true; U.drawImage(T.canvas, 0, 0, W, H, 0, 0, w, h); fxClear(A); A.imageSmoothingEnabled = false; A.drawImage(U.canvas, 0, 0, w, h, 0, 0, w * s, h * s); A.imageSmoothingEnabled = true;
}
// parameter value at time t (keyframes in e.kf[k] = [{t,v}], else e.p[k], else default)
function efvN(e, k, t) {
  const kf = e.kf && e.kf[k];
  if (kf && kf.length) { if (t <= kf[0].t) return kf[0].v; const L = kf[kf.length - 1]; if (t >= L.t) return L.v; for (let i = 1; i < kf.length; i++) if (t <= kf[i].t) { const a = kf[i - 1], b = kf[i], u = (t - a.t) / Math.max(1e-6, b.t - a.t); return typeof a.v === 'number' ? a.v + (b.v - a.v) * u : a.v; } }
  if (e.p && e.p[k] != null) return e.p[k];
  const d = FXD[e.k], sp = d && d.P && d.P.find(q => q.k === k); return sp ? (sp.c != null ? sp.c : sp.b != null ? sp.b : sp.d) : 0;
}
function efxActive(o) { return (o.efx || []).filter(e => e.on !== false && FXD[e.k] && FXD[e.k].fn); }
function textFxView(o, t) {
  let text = String(o.text == null ? ' ' : o.text), ls = o.ls || 0, vis = null, cur = false, hl = 0, hlc = '#facc15', roll = null;
  (o.efx || []).forEach(e => {
    if (e.on === false) return;
    if (e.k === 'count') {
      const s = efvN(e, 'from', t), en = efvN(e, 'to', t), dec = Math.round(efvN(e, 'dec', t)), u = clamp((t - o.t0) / Math.max(0.05, endOf(o) - o.t0), 0, 1);
      const v = Math.round(efvN(e, 'mode', t)) === 1 && s > 0 && en > 0 ? s * Math.pow(en / s, u) : s + (en - s) * u;
      let str = v.toFixed(dec); if (efvN(e, 'comma', t)) str = str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      text = /-?\d[\d,.]*/.test(text) ? text.replace(/-?\d[\d,.]*/, str) : str;
    } else if (e.k === 'tprog') {
      const ch = Array.from(text), n = ch.length, a = Math.round(n * efvN(e, 'start', t) / 100), b = Math.round(n * efvN(e, 'end', t) / 100);
      text = ch.slice(Math.min(a, b), Math.max(a, b)).join('');
      if (efvN(e, 'cur', t) && Math.floor(t * 2) % 2 === 0) text += '|'; else if (efvN(e, 'cur', t)) text += ' ';
      if (!text) text = ' ';
    } else if (e.k === 'timecode') {
      const sp = efvN(e, 'speed', t), st = efvN(e, 'start', t), el = Math.max(0, t - o.t0) * sp;
      let tt = Math.round(efvN(e, 'mode', t)) === 1 ? Math.max(0, st + (endOf(o) - o.t0) * sp - el) : st + el; const p2 = n => String(Math.floor(n)).padStart(2, '0');
      const m = Math.floor(tt / 60), sc = Math.floor(tt % 60), fr = Math.floor((tt % 1) * 30);
      text = p2(m) + ':' + p2(sc) + (efvN(e, 'fr', t) ? ':' + p2(fr) : '');
    } else if (e.k === 'typing') {
      const el = Math.max(0, t - (o.t0 || 0) - efvN(e, 'delay', t)), n = Math.floor(el * efvN(e, 'sp', t)), full = Array.from(text);
      let shown = full.length;
      if (Math.round(efvN(e, 'unit', t)) === 1) { let w = 0, k = 0, inW = false; shown = 0; for (; k < full.length; k++) { const sp = /\s/.test(full[k]); if (!sp && !inW) { if (w >= n) break; w++; inW = true; } else if (sp) inW = false; shown = k + 1; } if (w < n) shown = full.length; }
      else shown = Math.min(n, full.length);
      const done = shown >= full.length; cur = !!efvN(e, 'cur', t) && (!done || Math.floor(t * 2) % 2 === 0);
      if (efvN(e, 'keep', t)) vis = shown; else { text = full.slice(0, shown).join('') + (cur ? '|' : ''); if (!text) text = ' '; cur = false; }
    } else if (e.k === 'dscroll') {
      const m = /\d+/.exec(text);
      if (m) {
        const dg = m[0], N = Math.min(dg.length, Math.round(efvN(e, 'n', t)) + 1), fin = parseInt(dg.slice(-N), 10), mod = Math.pow(10, N), spins = Math.round(efvN(e, 'spins', t));
        const u = clamp((t - (o.t0 || 0) - efvN(e, 'delay', t)) / Math.max(0.05, efvN(e, 'dur', t)), 0, 1), ea = 1 - Math.pow(1 - u, 3), up = Math.round(efvN(e, 'dir', t)) === 0;
        const cv = up ? Math.floor((spins * mod + fin) * ea) % mod : (fin + Math.floor(spins * mod * (1 - ea))) % mod;
        text = text.slice(0, m.index) + dg.slice(0, dg.length - N) + String(cv).padStart(N, '0') + text.slice(m.index + dg.length);
      }
    } else if (e.k === 'odometer') { // car-meter style: every digit is a wheel that spins to its number
      const arr = Array.from(text), idx = []; arr.forEach((c, i) => { if (/\d/.test(c)) idx.push(i); });
      const n = idx.length, lim = Math.round(efvN(e, 'n', t)), el = t - (o.t0 || 0) - efvN(e, 'delay', t), du = Math.max(0.1, efvN(e, 'dur', t)), stg = efvN(e, 'stag', t), spins = Math.round(efvN(e, 'spins', t)), up = Math.round(efvN(e, 'dir', t)) === 0, ltr = Math.round(efvN(e, 'order', t)) === 1;
      roll = roll || [];
      idx.forEach((pos, k) => {
        const j = n - 1 - k; if (lim > 0 && j >= lim) return; // only the last `lim` digits roll
        const d = +arr[pos], rank = ltr ? k : j, u = clamp((el - rank * stg) / du, 0, 1), ea = 1 - Math.pow(1 - u, 3), tot = spins * 10 + (up ? d : (10 - d) % 10);
        roll[pos] = Math.round((up ? tot * ea : d + tot * (1 - ea)) * 200) / 200;
      });
    } else if (e.k === 'randnum') {
      const arr = Array.from(text), idx = []; arr.forEach((c, i) => { if (/\d/.test(c)) idx.push(i); });
      const n = idx.length, el = t - (o.t0 || 0) - efvN(e, 'delay', t), du = Math.max(0.05, efvN(e, 'dur', t)), mode = Math.round(efvN(e, 'mode', t)), fl = Math.floor(t * efvN(e, 'sp', t));
      idx.forEach((pos, k) => { const st = mode === 0 ? du * (k + 1) / n : mode === 1 ? du * (0.25 + 0.75 * fxRand(k * 977 + 3)()) : du; if (el < st) arr[pos] = String(Math.floor(fxRand(fl * 131 + k * 17 + 5)() * 10)); });
      text = arr.join('');
    } else if (e.k === 'wordbyword') {
      const el = Math.max(0, t - (o.t0 || 0) - efvN(e, 'delay', t)); vis = fxWordsVis(Array.from(text), Math.floor(el * efvN(e, 'sp', t)));
    } else if (e.k === 'letterreveal') {
      const el = Math.max(0, t - (o.t0 || 0) - efvN(e, 'delay', t)); vis = Math.min(Array.from(text).length, el * efvN(e, 'sp', t));
    } else if (e.k === 'datetitle') {
      const m = /\d+/.exec(text);
      if (m) {
        const dg = m[0], N = Math.min(dg.length, Math.round(efvN(e, 'n', t)) + 1), fin = parseInt(dg.slice(-N), 10), mod = Math.pow(10, N), spins = Math.round(efvN(e, 'spins', t)), dl = efvN(e, 'delay', t), du = Math.max(0.05, efvN(e, 'dur', t)), loc = t - (o.t0 || 0);
        const u = clamp((loc - dl) / du, 0, 1), ea = 1 - Math.pow(1 - u, 3), cv = Math.floor((spins * mod + fin) * ea) % mod, endIdx = Array.from(text.slice(0, m.index + dg.length)).length;
        text = text.slice(0, m.index) + dg.slice(0, dg.length - N) + String(cv).padStart(N, '0') + text.slice(m.index + dg.length);
        const el = Math.max(0, loc - dl - du - efvN(e, 'pause', t)); vis = Math.min(Array.from(text).length, endIdx + el * efvN(e, 'sp', t));
      }
    } else if (e.k === 'subtitle') {
      const el = Math.max(0, t - (o.t0 || 0) - efvN(e, 'delay', t)); hl = fxWordsVis(Array.from(text), Math.floor(el * efvN(e, 'sp', t))); hlc = efvN(e, 'col', t);
    } else if (e.k === 'tspace') ls += efvN(e, 'sp', t);
  });
  return { text, ls, vis, cur, hl, hlc, roll };
}
function drawLayer(g, o, t, cam, B, m) {
  const act = efxActive(o), go = c => { if (m) drawMasked(c, o, m, t, cam, B); else drawObj(c, o, t, cam, B); };
  if (!act.length) { go(g); return; }
  const A = scratch('fxA', g.canvas); fxClear(A); go(A); fxB = B;
  act.forEach(e => { try { const d = FXD[e.k]; d.fn(A, k => efvN(e, k, t), { W: A.canvas.width, H: A.canvas.height, s: B.a, t, o, e }); } catch (er) { } });
  A.setTransform(1, 0, 0, 1, 0, 0); A.globalCompositeOperation = 'source-over'; A.globalAlpha = 1; A.filter = 'none';
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.drawImage(A.canvas, 0, 0); g.restore();
}
// extra text drawn on any layer + layer border
function ovTex(o) { const f = o._ov = o._ov || {}; Object.assign(f, o.txo, { id: o.id + '_ov', type: 'text', t0: o.t0 }); textTex(f); return f; }

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
  opts = opts || {}; CURT = t;
  const P = E.P, sc = W / P.w, vz = opts.vz || 1;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  g.fillStyle = P.bg || '#000'; g.fillRect(0, 0, W, H);
  const cam = opts.cam || camPose(t), B = { a: sc * vz, x: W / 2, y: H / 2, vz };
  P.objects.forEach(o => {
    if (opts.only && opts.only.indexOf(o.id) < 0) return;
    if (!(visibleAt(o, t) && o.type !== 'null' && o.type !== 'camera' && o.type !== 'audio')) { o._q = null; return; }
    if (isMaskLayer(o)) { try { o._q = objQuad(o, wpose(o, t), cam); } catch (er) { o._q = null; } return; } // a mask is not drawn itself
    const m = o.mask && P.objects.find(q => q.id === o.mask.id);
    drawLayer(g, o, t, cam, B, m && visibleAt(m, t) ? m : null);
  });
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (cam.cbl > 0.05 || cam.cgl > 0.01 || cam.vig > 0.01 || cam.tia > 0.01) postFx(g, W, H, cam, B);
  if (opts.overlay) overlay(g, t, cam, B, vz);
}
function zoomEff() { return (E.zoom || 1) * (E.vz || 1); }
// world positions of the on-screen handles of an object (corners + rotate knob)
const SIZABLE = { shape: 1, image: 1, video: 1 };
function handlePts(o) {
  const q = o._q; if (!q || q.length < 4) return null;
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const mx = (q[0].x + q[1].x) / 2, my = (q[0].y + q[1].y) / 2;
  let dx = mx - cx, dy = my - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const off = 36 / zoomEff();
  const edges = [[0, 1, 'h', 2, 3], [1, 2, 'w', 3, 0], [2, 3, 'h', 0, 1], [3, 0, 'w', 1, 2]].map(([a, b, k, c, d]) => ({ x: (q[a].x + q[b].x) / 2, y: (q[a].y + q[b].y) / 2, k, ox: (q[c].x + q[d].x) / 2, oy: (q[c].y + q[d].y) / 2 }));
  return { c: { x: cx, y: cy }, edges, corners: q.map(p => ({ x: p.x, y: p.y })), rot: { x: mx + dx * off, y: my + dy * off }, top: { x: mx, y: my } };
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
          if (SIZABLE[o.type]) h.edges.forEach(p => { const [x, y] = P2(p); g.beginPath(); g.arc(x, y, 5.5 * dpr, 0, 7); g.fill(); g.stroke(); });
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
