'use strict';
/* ===== small shared helpers ===== */
let _pzT = 0;
function pzTag(txt) {
  const t = document.getElementById('pztag'); if (!t) return;
  if (txt === null) { t.classList.add('hidden'); return; }
  t.textContent = txt; t.classList.remove('hidden'); clearTimeout(_pzT);
}
// long-press drag to reorder a list of rows. rows = elements top->bottom
function reorderDrag(rows, idx, y0) {
  const rects = rows.map(r => r.getBoundingClientRect()), h = rects[idx].height;
  return {
    to: idx,
    move(y) {
      const dy = y - y0; rows[idx].style.transform = 'translateY(' + dy + 'px)'; rows[idx].style.zIndex = 8;
      const c = rects[idx].top + h / 2 + dy; let to = idx;
      for (let j = 0; j < rows.length; j++) {
        const cj = rects[j].top + rects[j].height / 2;
        if (j < idx && c < cj) to = Math.min(to, j); else if (j > idx && c > cj) to = Math.max(to, j);
      }
      this.to = to;
      rows.forEach((r, j) => {
        if (j === idx) return;
        let sh = 0; if (to > idx && j > idx && j <= to) sh = -h; else if (to < idx && j >= to && j < idx) sh = h;
        r.style.transition = 'transform .12s'; r.style.transform = sh ? 'translateY(' + sh + 'px)' : '';
      });
    },
    end() { rows.forEach(r => { r.style.transform = ''; r.style.transition = ''; r.style.zIndex = ''; }); return this.to; }
  };
}

/* ===== Pinch helper: two fingers = resize + turn (+ move); on a camera = zoom ===== */
function Pinch(opt) { this.pts = new Map(); this.on = false; this.opt = opt; this.s = null; }
Pinch.prototype.down = function (e) {
  this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (this.pts.size === 2) {
    const o = this.opt.obj();
    if (!o || o.lock || (o.type === 'camera' && !E.cam)) { this.on = false; return true; }
    const [a, b] = [...this.pts.values()];
    this.s = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, p: poseOf(o, E.t), o, began: false };
    this.on = true; return true;
  }
  return this.on || this.pts.size > 2;
};
Pinch.prototype.move = function (e) {
  if (!this.pts.has(e.pointerId)) return false;
  this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!this.on || this.pts.size < 2) return false;
  const [a, b] = [...this.pts.values()], s = this.s;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, ang = Math.atan2(b.y - a.y, b.x - a.x);
  let da = ang - s.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
  if (!s.began) { pushUndo(); s.began = true; }
  const f = d / s.d;
  if (s.o.type === 'camera') {
    const z = clamp(s.p.sx * f, 0.1, 10); setPose(s.o, { sx: z }, E.t); pzTag(Math.round(z * 100) + '%');
    this.opt.apply(); return true;
  }
  const ch = { sx: Math.max(0.02, s.p.sx * f), sy: Math.max(0.02, s.p.sy * f), rot: s.p.rot + da / D2R };
  if (this.opt.move) {
    const [lx, ly] = Pad.localDelta(s.o, ((a.x + b.x) / 2 - s.cx) / zoomEff(), ((a.y + b.y) / 2 - s.cy) / zoomEff());
    ch.x = s.p.x + lx; ch.y = s.p.y + ly;
  }
  setPose(s.o, ch, E.t); this.opt.apply(); return true;
};
Pinch.prototype.up = function (e) {
  const had = this.on; this.pts.delete(e.pointerId);
  if (this.pts.size < 2) { this.on = false; pzTag(null); }
  return had;
};

/* ===== Left strip shared by Pad / Camera / Effect panels ===== */
function stripHTML() {
  return '<div class="pl">' +
    '<button class="pb" data-a="back">' + ic('back', 20) + '</button>' +
    '<button class="pb" data-a="key">' + ic('keyplus', 22) + '</button>' +
    '<button class="pb" data-a="curve">' + ic('curve', 20) + '</button>' +
    '<button class="pb" data-a="more">' + ic('dots', 20) + '</button></div>';
}
function bindStrip(root, hooks) { root.querySelectorAll('[data-a]').forEach(b => b.onclick = () => hooks.act(b.dataset.a)); }
function refreshStrip() {
  const o = selObj(); if (!o) return;
  document.querySelectorAll('#panel [data-a=key]').forEach(b => b.classList.toggle('on', !!keyAt(o, E.t)));
}
const SNAPS = [0, 45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315, 360];

// number boxes with a small letter under each number. 1st tap = choose, 2nd tap = type
function ncell(k, label) { return '<div class="nc" data-k="' + k + '"><input data-k="' + k + '" inputmode="decimal" type="text" readonly><small>' + label + '</small></div>'; }
function bindCells(root, modeOf, getMode, setMode, typed) {
  root.querySelectorAll('.nc').forEach(c => {
    const i = c.querySelector('input'), k = c.dataset.k;
    c.addEventListener('click', e => {
      if (e.target === i && !i.readOnly) return;
      if (getMode() !== modeOf(k)) { setMode(modeOf(k), k); return; }
      i.readOnly = false; i.focus(); i.select();
    });
    i.addEventListener('blur', () => { i.readOnly = true; });
    i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
    i.addEventListener('change', () => typed(k, parseFloat(i.value)));
  });
}

/* ===== Pad: Move & Transform (like Alight Motion) ===== */
const PMODE = { x: 'move', y: 'move', z: 'depth', rot: 'rot', w: 'scale', h: 'scale', skx: 'skew' };
const Pad = {
  el: null, mode: 'move', link: true, hooks: null, pinch: null, lockA: null,
  mount(el, hooks) {
    this.el = el; this.hooks = hooks;
    el.innerHTML = stripHTML() +
      '<div class="pm"><div class="nums"></div><div class="surf"><div class="dialw"><div class="arc"></div><div class="dial"><i></i></div><div class="deg">0°</div></div>' +
      '<i class="cr tl"></i><i class="cr tr"></i><i class="cr bl"></i><i class="cr br"></i></div></div>' +
      '<div class="pr">' +
      '<button class="pb" data-m="move">' + ic('move', 20) + '<small>XY</small></button>' +
      '<button class="pb" data-m="rot">' + ic('rotate', 22) + '</button>' +
      '<button class="pb" data-m="scale">' + ic('scale', 20) + '<small>W·H</small></button>' +
      '<button class="pb" data-m="skew">' + ic('skew', 20) + '</button></div>';
    bindStrip(el, hooks);
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.mode = b.dataset.m; this.draw(); });
    this.pinch = new Pinch({ obj: selObj, move: false, apply: () => { hooks.changed(); this.refresh(); } });
    this.bindSurf(el.querySelector('.surf'));
    this.draw();
  },
  draw() {
    const el = this.el; if (!el) return;
    const m = this.mode;
    el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    el.querySelector('.surf').dataset.mode = m;
    const n = el.querySelector('.nums'), grp = (mode, inner) => '<div class="ng' + (m === mode ? ' act' : '') + '" data-g="' + mode + '">' + inner + '</div>';
    const z = grp('depth', ncell('z', 'z'));
    if (m === 'rot') n.innerHTML = grp('rot', ncell('rot', 'r')) + z;
    else if (m === 'scale') n.innerHTML = grp('scale', ncell('w', 'w') + ncell('h', 'h')) + '<button class="lk' + (this.link ? ' on' : '') + '" data-lk>' + ic('link', 18) + '</button>';
    else if (m === 'skew') n.innerHTML = grp('skew', ncell('skx', 's')) + z;
    else n.innerHTML = grp('move', ncell('x', 'x') + ncell('y', 'y')) + z;
    bindCells(n, k => PMODE[k], () => this.mode, mm => { this.mode = mm; this.draw(); }, (k, v) => this.typed(k, v));
    const lk = n.querySelector('[data-lk]'); if (lk) lk.onclick = () => { this.link = !this.link; this.draw(); };
    this.refresh();
  },
  refresh() {
    if (!this.el) return;
    const o = selObj(); if (!o) return;
    const p = poseOf(o, E.t), vals = { x: p.x, y: p.y, z: p.z, rot: p.rot, w: p.sx * 100, h: p.sy * 100, skx: p.skx };
    this.el.querySelectorAll('.nums input').forEach(i => {
      if (document.activeElement === i) return;
      i.value = String(Math.round(vals[i.dataset.k] * 10) / 10);
    });
    refreshStrip();
    this.el.classList.toggle('locked', !!o.lock);
    this.paintDial(p.rot);
  },
  paintDial(rot) {
    const dw = this.el.querySelector('.dialw'); if (!dw) return;
    const m = ((rot % 360) + 360) % 360;
    dw.querySelector('.dial').style.transform = 'rotate(' + rot + 'deg)';
    dw.querySelector('.arc').style.background = 'conic-gradient(from 0deg, rgba(236,72,153,.6) 0deg, rgba(139,92,246,.6) ' + m + 'deg, transparent ' + m + 'deg)';
    dw.querySelector('.deg').textContent = Math.round(rot) + '°';
    dw.classList.toggle('snap', this.lockA !== null);
  },
  typed(k, v) {
    const o = selObj(); if (!o || isNaN(v)) { this.refresh(); return; }
    if (o.lock) { this.hooks.toast(tr('unlocked')); this.refresh(); return; }
    this.hooks.begin();
    const p = poseOf(o, E.t); let ch;
    if (k === 'w' || k === 'h') {
      const nv = Math.max(0.02, v / 100);
      if (this.link) { const f = nv / (k === 'w' ? p.sx : p.sy || 1); ch = { sx: p.sx * f, sy: p.sy * f }; }
      else ch = k === 'w' ? { sx: nv } : { sy: nv };
    } else if (k === 'skx') ch = { skx: clamp(v, -80, 80) };
    else ch = { [k]: v };
    setPose(o, ch, E.t); this.hooks.changed(); this.refresh();
  },
  localDelta(o, dx, dy) {
    if (!o.par) return [dx, dy];
    const q = find(o.par); if (!q) return [dx, dy];
    const w = wpose(q, E.t), c = Math.cos(-w.rot * D2R), s = Math.sin(-w.rot * D2R);
    return [(dx * c - dy * s) / (w.sx || 1), (dx * s + dy * c) / (w.sy || 1)];
  },
  bindSurf(surf) {
    const self = this; let g = null;
    surf.addEventListener('pointerdown', e => {
      surf.setPointerCapture(e.pointerId); e.preventDefault();
      if (self.pinch.down(e)) { g = null; return; }
      const o = selObj(); if (!o) return;
      if (o.lock) { this.hooks.toast(tr('unlocked')); return; }
      const r = surf.getBoundingClientRect(), wr = surf.querySelector('.dialw').getBoundingClientRect();
      const cx = wr.left + wr.width / 2, cy = wr.top + wr.height / 2;
      g = { o, x0: e.clientX, y0: e.clientY, p0: poseOf(o, E.t), K: E.P.w / r.width, began: false, cx, cy,
        lastA: Math.atan2(e.clientY - cy, e.clientX - cx), tot: 0 };
      self.lockA = null;
    });
    surf.addEventListener('pointermove', e => {
      if (self.pinch.move(e)) return;
      if (!g) return;
      if (!g.began) { this.hooks.begin(); g.began = true; }
      const o = g.o, dx = e.clientX - g.x0, dy = e.clientY - g.y0, p0 = g.p0, m = self.mode;
      let ch = {};
      if (m === 'move') {
        const [lx, ly] = self.localDelta(o, dx * g.K, dy * g.K);
        ch = { x: p0.x + lx, y: p0.y + ly };
      } else if (m === 'depth') {
        const f = Math.max(0.02, Math.exp(dx * 0.005));
        ch = { z: p0.z - dy * 3, sx: p0.sx * f, sy: p0.sy * f };
      } else if (m === 'rot') {
        const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
        let da = a - g.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        g.tot += da; g.lastA = a;
        let rot = p0.rot + g.tot / D2R;
        const md = ((rot % 360) + 360) % 360; let hit = null;
        for (const s of SNAPS) if (Math.abs(md - s) < 4) { hit = s; break; }
        if (hit !== null) { rot = rot - md + hit; if (self.lockA !== hit) { self.lockA = hit; try { navigator.vibrate && navigator.vibrate(12); } catch (er) {} } }
        else self.lockA = null;
        ch = { rot };
      } else if (m === 'scale') {
        if (self.link) { const f = Math.max(0.02, 1 + (dx - dy) * 0.004); ch = { sx: p0.sx * f, sy: p0.sy * f }; }
        else ch = { sx: Math.max(0.02, p0.sx * (1 + dx * 0.004)), sy: Math.max(0.02, p0.sy * (1 - dy * 0.004)) };
      } else if (m === 'skew') {
        ch = { skx: clamp(p0.skx + dx * 0.3, -80, 80) };
      }
      setPose(o, ch, E.t);
      self.hooks.changed(); self.refresh();
    });
    const end = e => { self.pinch.up(e); if (self.pinch.pts.size === 0) { g = null; self.lockA = null; self.refresh(); } };
    surf.addEventListener('pointerup', end); surf.addEventListener('pointercancel', end);
  }
};

/* ===== Camera Options: Camera View / Focus Blur / Fog ===== */
const CO = {
  view: { keys: ['fov', 'dist'], icon: 'camera', t: 'camview' },
  focus: { keys: ['fd', 'dof', 'fbs'], icon: 'focus', t: 'focusb', flag: 'fbOn' },
  fog: { keys: ['fgn', 'fgf'], icon: 'fogi', t: 'fog', flag: 'fogOn' }
};
const CK = {
  fov: { l: 'fovl', min: 10, max: 150, r: 0.2, u: '°' }, dist: { l: 'distl', min: 300, max: 6000, r: 8 },
  fd: { l: 'fdl', min: 0, max: 6000, r: 10 }, dof: { l: 'dofl', min: 0, max: 3000, r: 8 }, fbs: { l: 'strl', min: 0, max: 80, r: 0.25 },
  fgn: { l: 'nearl', min: 0, max: 8000, r: 10 }, fgf: { l: 'farl', min: 1, max: 12000, r: 14 }
};
const CamOpt = {
  el: null, mode: 'view', act: 'fov', hooks: null, pinch: null,
  mount(el, hooks) {
    this.el = el; this.hooks = hooks;
    el.innerHTML = stripHTML() + '<div class="pm"><div class="nums"></div><div class="surf cs"><div class="viz"></div>' +
      '<i class="cr tl"></i><i class="cr tr"></i><i class="cr bl"></i><i class="cr br"></i></div></div>' +
      '<div class="pr">' + Object.keys(CO).map(m => '<button class="pb" data-m="' + m + '">' + ic(CO[m].icon, 21) + '</button>').join('') + '</div>';
    bindStrip(el, hooks);
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.mode = b.dataset.m; this.act = CO[this.mode].keys[0]; this.draw(); });
    this.pinch = new Pinch({ obj: selObj, move: false, apply: () => { hooks.changed(); this.refresh(); } });
    this.bindSurf(el.querySelector('.surf'));
    this.draw();
  },
  draw() {
    const el = this.el; if (!el) return; const o = selObj(); if (!o) return;
    const m = this.mode, def = CO[m];
    el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    const n = el.querySelector('.nums');
    let h = '';
    if (def.flag) h += '<button class="tg' + (o[def.flag] ? ' on' : '') + '" data-tg><i></i></button>';
    if (m === 'fog') h += '<button class="cdot" data-col style="background:' + (o.fogC || CAMD.fogC) + '"></button>';
    h += '<div class="ng act">' + def.keys.map(k => ncell(k, tr(CK[k].l))).join('') + '</div>';
    n.innerHTML = h;
    n.querySelectorAll('.nc').forEach(c => c.classList.toggle('sel', c.dataset.k === this.act));
    bindCells(n, k => 'co' + k, () => 'co' + this.act, (mm, k) => { this.act = k; this.draw(); }, (k, v) => this.typed(k, v));
    const tg = n.querySelector('[data-tg]'); if (tg) tg.onclick = () => { if (o.lock) return this.hooks.toast(tr('unlocked')); this.hooks.begin(); o[def.flag] = !o[def.flag]; this.hooks.changed(); this.draw(); };
    const cd = n.querySelector('[data-col]'); if (cd) cd.onclick = () => pickColor(o.fogC || CAMD.fogC, c => { this.hooks.begin(); o.fogC = c; this.hooks.changed(); this.draw(); });
    this.refresh();
  },
  refresh() {
    if (!this.el) return; const o = selObj(); if (!o) return;
    const p = poseOf(o, E.t);
    this.el.querySelectorAll('.nums input').forEach(i => { if (document.activeElement !== i) i.value = String(Math.round(p[i.dataset.k] * 10) / 10); });
    refreshStrip(); this.el.classList.toggle('locked', !!o.lock);
    this.viz(p, o);
  },
  viz(p, o) {
    const v = this.el.querySelector('.viz'); if (!v) return;
    const m = this.mode; let s = '';
    if (m === 'view') {
      const a = clamp(p.fov, 10, 150) / 2 * D2R, dy = 44 * Math.sin(a), L = 40 + (p.dist - 300) / 5700 * 130;
      s = '<rect x="10" y="44" width="16" height="12" rx="2" class="vf"/><path d="M26 50L' + (26 + L) + ' ' + (50 - dy) + 'M26 50L' + (26 + L) + ' ' + (50 + dy) + 'M' + (26 + L) + ' ' + (50 - dy) + 'V' + (50 + dy) + '" class="vl"/>';
    } else if (m === 'focus') {
      const x = 30 + clamp(p.fd, 0, 6000) / 6000 * 150, w = clamp(p.dof, 0, 3000) / 3000 * 80 + 2;
      s = '<rect x="6" y="44" width="16" height="12" rx="2" class="vf"/><rect x="' + (x - w / 2) + '" y="14" width="' + w + '" height="72" rx="3" class="vb' + (o.fbOn ? ' on' : '') + '"/><line x1="' + x + '" y1="10" x2="' + x + '" y2="90" class="vl"/>';
    } else {
      const a = 20 + clamp(p.fgn, 0, 8000) / 8000 * 150, b = 20 + clamp(p.fgf, 1, 12000) / 12000 * 150, c = o.fogC || CAMD.fogC;
      s = '<defs><linearGradient id="fgg"><stop offset="0" stop-color="' + c + '" stop-opacity="0"/><stop offset="1" stop-color="' + c + '" stop-opacity="' + (o.fogOn ? 1 : 0.4) + '"/></linearGradient></defs><rect x="6" y="44" width="10" height="12" rx="2" class="vf"/><rect x="' + a + '" y="16" width="' + Math.max(2, b - a) + '" height="68" fill="url(#fgg)"/><rect x="' + b + '" y="16" width="' + Math.max(0, 196 - b) + '" height="68" fill="' + c + '" opacity="' + (o.fogOn ? 1 : 0.4) + '"/>';
    }
    v.innerHTML = '<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">' + s + '</svg>';
  },
  typed(k, v) {
    const o = selObj(); if (!o || isNaN(v)) { this.refresh(); return; }
    if (o.lock) { this.hooks.toast(tr('unlocked')); this.refresh(); return; }
    this.hooks.begin(); setPose(o, { [k]: clamp(v, CK[k].min, CK[k].max) }, E.t); this.hooks.changed(); this.refresh();
  },
  bindSurf(surf) {
    const self = this; let g = null;
    surf.addEventListener('pointerdown', e => {
      surf.setPointerCapture(e.pointerId); e.preventDefault();
      if (self.pinch.down(e)) { g = null; return; }
      const o = selObj(); if (!o) return;
      if (o.lock) { self.hooks.toast(tr('unlocked')); return; }
      g = { o, x0: e.clientX, p0: poseOf(o, E.t)[self.act], k: self.act, began: false };
    });
    surf.addEventListener('pointermove', e => {
      if (self.pinch.move(e)) return;
      if (!g) return;
      if (!g.began) { self.hooks.begin(); g.began = true; }
      const c = CK[g.k], v = clamp(g.p0 + (e.clientX - g.x0) * c.r, c.min, c.max);
      setPose(g.o, { [g.k]: Math.round(v * 100) / 100 }, E.t); self.hooks.changed(); self.refresh();
    });
    const end = e => { self.pinch.up(e); if (self.pinch.pts.size === 0) g = null; };
    surf.addEventListener('pointerup', end); surf.addEventListener('pointercancel', end);
  }
};

/* ===== Speed-curve editor ===== */
const Curve = {
  open(o, k, done) {
    const simple = ['lin', 'ease', 'easein', 'easeout', 'easeio', 'back', 'snap'], adv = ['bounce', 'elastic', 'steps'];
    const orig = { e: (k.e || DEF_EASE).slice(), a: k.a || null };
    let e = orig.e.slice(), a = orig.a, pushed = false;
    const S = 220, pad = 24, LO = -0.25, HI = 1.25, W = S + pad * 2, Hh = Math.round((HI - LO) * S + pad * 2);
    const X = v => pad + v * S, Y = v => pad + (HI - v) * S;
    const fnOf = n => (ADV[n] ? ADV[n] : bezFn(EASES[n]));
    const mini = n => {
      const f = fnOf(n); let d = '';
      for (let i = 0; i <= 28; i++) { const u = i / 28, v = clamp(f(u), -0.25, 1.25); d += (i ? 'L' : 'M') + (4 + u * 40).toFixed(1) + ' ' + (4 + (1.25 - v) / 1.5 * 28).toFixed(1); }
      return '<svg viewBox="0 0 48 36" width="48" height="36"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    };
    const root = document.createElement('div'); root.className = 'curve';
    root.innerHTML = '<div class="cvwrap"><div class="cvhead"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + tr('curveT') + '</b><button class="ib" data-x="reset" title="' + tr('resetc') + '">' + ic('refresh', 20) + '</button></div>' +
      '<div class="cvbox"><svg viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '"><rect x="' + pad + '" y="' + Y(1) + '" width="' + S + '" height="' + S + '" class="cf"/>' +
      '<line id="h1" class="hl"/><line id="h2" class="hl"/><path id="cp" class="cp"/><circle id="c1" r="12" class="hc"/><circle id="c2" r="12" class="hc"/><circle id="pd" r="6" class="pdot"/></svg>' +
      '<div class="cnum">' + ['x1', 'y1', 'x2', 'y2'].map((n, i) => '<label><span>' + n + '</span><input data-i="' + i + '" inputmode="decimal"></label>').join('') + '</div>' +
      '<div class="ptrack"><i id="ball"></i></div><button class="btn ghost pv" id="pv">▶ ' + tr('preview') + '</button></div>' +
      '<div class="pgh">' + tr('simple') + '</div><div class="presets">' + simple.map(n => '<button data-n="' + n + '">' + mini(n) + '<span>' + tr(n) + '</span></button>').join('') + '</div>' +
      '<div class="pgh">' + tr('advanced') + '</div><div class="presets">' + adv.map(n => '<button data-n="' + n + '">' + mini(n) + '<span>' + tr(n) + '</span></button>').join('') + '</div>' +
      '<div class="row2"><button class="btn ghost" data-x="all">' + tr('applyall') + '</button></div></div>';
    const q = s => root.querySelector(s), r2 = v => Math.round(v * 100) / 100;
    const apply = () => {
      if (!pushed) { pushUndo(); pushed = true; }
      k.e = e.slice(); k.a = a || null; done(false);
    };
    const upd = () => {
      const isAdv = !!a;
      let d = '';
      if (isAdv) { const f = ADV[a]; for (let i = 0; i <= 60; i++) { const u = i / 60; d += (i ? 'L' : 'M') + X(u) + ' ' + Y(clamp(f(u), LO, HI)); } }
      else d = 'M' + X(0) + ' ' + Y(0) + ' C' + X(e[0]) + ' ' + Y(e[1]) + ' ' + X(e[2]) + ' ' + Y(e[3]) + ' ' + X(1) + ' ' + Y(1);
      q('#cp').setAttribute('d', d);
      for (const id of ['#c1', '#c2', '#h1', '#h2']) q(id).style.display = isAdv ? 'none' : '';
      q('#c1').setAttribute('cx', X(e[0])); q('#c1').setAttribute('cy', Y(e[1]));
      q('#c2').setAttribute('cx', X(e[2])); q('#c2').setAttribute('cy', Y(e[3]));
      for (const [id, x1, y1, x2, y2] of [['#h1', X(0), Y(0), X(e[0]), Y(e[1])], ['#h2', X(1), Y(1), X(e[2]), Y(e[3])]]) { const l = q(id); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); }
      root.querySelectorAll('.cnum input').forEach(i => { if (document.activeElement !== i) i.value = r2(e[+i.dataset.i]); i.disabled = isAdv; });
      root.querySelectorAll('.presets button').forEach(b => { const n = b.dataset.n; b.classList.toggle('on', ADV[n] ? a === n : (!a && EASES[n].every((v, i) => Math.abs(v - e[i]) < 0.005))); });
    };
    // one touch anywhere near a handle grabs it and follows the finger smoothly
    const svg = q('.cvbox svg'); let grab = null;
    const toVal = ev => { const r = svg.getBoundingClientRect(), s = W / r.width; return [((ev.clientX - r.left) * s - pad) / S, HI - ((ev.clientY - r.top) * s - pad) / S]; };
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', ev => {
      if (a) return;
      const r = svg.getBoundingClientRect(), s = r.width / W; let best = -1, bd = 1e9;
      [0, 1].forEach(n => { const hx = r.left + X(e[n * 2]) * s, hy = r.top + Y(e[n * 2 + 1]) * s, d = Math.hypot(ev.clientX - hx, ev.clientY - hy); if (d < bd) { bd = d; best = n; } });
      if (bd > 70) return;
      const [vx, vy] = toVal(ev); grab = { n: best, dx: e[best * 2] - vx, dy: e[best * 2 + 1] - vy };
      svg.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    svg.addEventListener('pointermove', ev => {
      if (!grab) return; const [vx, vy] = toVal(ev);
      e[grab.n * 2] = clamp(vx + grab.dx, 0, 1); e[grab.n * 2 + 1] = clamp(vy + grab.dy, LO, HI); apply(); upd();
    });
    const rel = () => { grab = null; }; svg.addEventListener('pointerup', rel); svg.addEventListener('pointercancel', rel);
    root.querySelectorAll('.cnum input').forEach(i => {
      i.onfocus = () => i.select();
      i.onchange = () => { const v = parseFloat(i.value), n = +i.dataset.i; if (!isNaN(v)) { e[n] = (n % 2 === 0) ? clamp(v, 0, 1) : clamp(v, LO - 0.75, HI + 0.75); a = null; apply(); } upd(); };
    });
    root.querySelectorAll('.presets button').forEach(b => b.onclick = () => { const n = b.dataset.n; if (ADV[n]) a = n; else { a = null; e = EASES[n].slice(); } apply(); upd(); });
    let raf = 0;
    q('#pv').onclick = () => {
      cancelAnimationFrame(raf);
      const f = a ? ADV[a] : bezFn(e), t0 = performance.now(), D = 1400, ball = q('#ball'), pd = q('#pd');
      const step = now => {
        const u = Math.min(1, (now - t0) / D), v = f(u);
        ball.style.left = 'calc(' + (clamp(v, 0, 1) * 100) + '% - ' + (clamp(v, 0, 1) * 22) + 'px)'; pd.setAttribute('cx', X(u)); pd.setAttribute('cy', Y(clamp(v, LO, HI)));
        if (u < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const close = () => { cancelAnimationFrame(raf); root.remove(); };
    q('[data-x=back]').onclick = close;
    q('[data-x=reset]').onclick = () => { e = orig.e.slice(); a = orig.a; apply(); upd(); };
    q('[data-x=all]').onclick = () => { o.kf.forEach(x => { x.e = e.slice(); x.a = a || null; }); apply(); done(true); close(); };
    root.addEventListener('pointerdown', ev => { root._tap = ev.target === root; });
    root.addEventListener('click', ev => { if (ev.target === root && root._tap) close(); });
    upd();
    return root;
  }
};
