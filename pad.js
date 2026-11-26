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
  const fe = S.panel === 'fxv' && typeof fxFocusEff === 'function' ? fxFocusEff(o) : null;
  document.querySelectorAll('#panel [data-a=key]').forEach(b => b.classList.toggle('on', fe ? fxNumKeys(fe).some(k => fxKeyAt(fe, k) >= 0) : !!keyAt(o, E.t)));
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
  el: null, mode: 'view', act: 'fov', hooks: null,
  mount(el, hooks) {
    this.el = el; this.hooks = hooks;
    el.innerHTML = stripHTML() + '<div class="pm co"></div><div class="pr">' + Object.keys(CO).map(m => '<button class="pb" data-m="' + m + '">' + ic(CO[m].icon, 21) + '</button>').join('') + '</div>';
    bindStrip(el, hooks);
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.mode = b.dataset.m; this.act = CO[this.mode].keys[0]; this.draw(); });
    this.draw();
  },
  draw() {
    const el = this.el; if (!el) return; const o = selObj(); if (!o) return;
    const m = this.mode, def = CO[m];
    el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    let h = '<div class="cohd"><span>' + tr(def.t) + '</span>' + (def.flag ? '<button class="tg' + (o[def.flag] ? ' on' : '') + '" data-tg><i></i></button>' : '') + (m === 'view' ? '<div class="viz"></div>' : '') + '</div><div class="cobody"><div class="rows">';
    if (m === 'fog') h += '<div class="rr"><span class="rl">' + tr('colorl') + '</span><span class="rk"></span><button class="cdot" data-col style="background:' + (o.fogC || CAMD.fogC) + '"></button></div>';
    h += def.keys.map(k => '<div class="rr' + (k === this.act ? ' act' : '') + '" data-k="' + k + '"><span class="rl">' + tr(CK[k].l) + '</span><div class="rk"><i class="ctr"></i></div><input class="rv" data-k="' + k + '" inputmode="decimal" readonly></div>').join('');
    h += '</div></div>';
    const pm = el.querySelector('.pm'); pm.innerHTML = h;
    const tg = pm.querySelector('[data-tg]'); if (tg) tg.onclick = () => { if (o.lock) return this.hooks.toast(tr('unlocked')); this.hooks.begin(); o[def.flag] = !o[def.flag]; this.hooks.changed(); this.draw(); };
    const cd = pm.querySelector('[data-col]'); if (cd) cd.onclick = () => pickColor(o.fogC || CAMD.fogC, c => { this.hooks.begin(); o.fogC = c; this.hooks.changed(); this.draw(); });
    pm.querySelectorAll('.rr[data-k]').forEach(r => this.bindRow(r));
    this.refresh();
  },
  bindRow(r) {
    const self = this, k = r.dataset.k, rk = r.querySelector('.rk'), inp = r.querySelector('.rv'); let g = null;
    const mark = () => self.el.querySelectorAll('.rr[data-k]').forEach(x => x.classList.toggle('act', x === r));
    rk.addEventListener('pointerdown', e => {
      e.preventDefault(); rk.setPointerCapture(e.pointerId); self.act = k; mark();
      const o = selObj(); if (!o) return;
      if (o.lock) { self.hooks.toast(tr('unlocked')); return; }
      g = { o, x0: e.clientX, p0: poseOf(o, E.t)[k], began: false };
    });
    rk.addEventListener('pointermove', e => {
      if (!g) return;
      if (!g.began) { if (Math.abs(e.clientX - g.x0) < 3) return; self.hooks.begin(); g.began = true; }
      const c = CK[k], v = clamp(g.p0 + (e.clientX - g.x0) * c.r, c.min, c.max);
      setPose(g.o, { [k]: Math.round(v * 100) / 100 }, E.t); self.hooks.changed(); self.refresh();
    });
    const end = () => { g = null; }; rk.addEventListener('pointerup', end); rk.addEventListener('pointercancel', end);
    inp.addEventListener('click', () => { self.act = k; mark(); inp.readOnly = false; inp.focus(); inp.select(); });
    inp.addEventListener('blur', () => { inp.readOnly = true; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', () => self.typed(k, parseFloat(inp.value)));
  },
  refresh() {
    if (!this.el) return; const o = selObj(); if (!o) return;
    const p = poseOf(o, E.t);
    this.el.querySelectorAll('.rr[data-k]').forEach(r => {
      const k = r.dataset.k, i = r.querySelector('.rv'), rk = r.querySelector('.rk');
      if (document.activeElement !== i) i.value = String(Math.round(p[k] * 10) / 10) + (CK[k].u || '');
      rk.style.backgroundPositionX = (p[k] / CK[k].r) + 'px';
    });
    refreshStrip(); this.el.classList.toggle('locked', !!o.lock);
    const v = this.el.querySelector('.viz'); if (v) {
      const a = clamp(p.fov, 10, 150) / 2 * D2R, dy = 17 * Math.sin(a), L = 26 + (p.dist - 300) / 5700 * 50;
      v.innerHTML = '<svg viewBox="0 0 100 40"><rect x="4" y="15" width="11" height="10" rx="2" class="vf"/><path d="M15 20L' + (15 + L) + ' ' + (20 - dy) + 'M15 20L' + (15 + L) + ' ' + (20 + dy) + 'M' + (15 + L) + ' ' + (20 - dy) + 'V' + (20 + dy) + '" class="vl"/></svg>';
    }
  },
  typed(k, v) {
    const o = selObj(); if (!o || isNaN(v)) { this.refresh(); return; }
    if (o.lock) { this.hooks.toast(tr('unlocked')); this.refresh(); return; }
    this.hooks.begin(); setPose(o, { [k]: clamp(v, CK[k].min, CK[k].max) }, E.t); this.hooks.changed(); this.refresh();
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

/* ===================== full-screen editors: Mask, Text, Custom shape ===================== */
function layerThumb(q, S0) {
  S0 = S0 || 44; const c = document.createElement('canvas'); c.width = c.height = S0 * 2; const g = c.getContext('2d');
  g.fillStyle = '#1b1d36'; g.fillRect(0, 0, c.width, c.height);
  try {
    const tex = getTex(q); const src = tex && tex.src;
    if (src) {
      const sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
      if (sw && sh) { const k = Math.min((c.width - 8) / sw, (c.height - 8) / sh); g.drawImage(src, (c.width - sw * k) / 2, (c.height - sh * k) / 2, sw * k, sh * k); }
    }
  } catch (e) {}
  return c.toDataURL('image/png');
}
function edShell(title, onReset, onClose) {
  const root = document.createElement('div'); root.className = 'edov';
  root.innerHTML = '<div class="edhd"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + title + '</b><button class="ib" data-x="reset" title="' + tr('reset') + '">' + ic('refresh', 20) + '</button></div>' +
    '<div class="edpv"><canvas></canvas></div><div class="edbody"></div>';
  document.body.appendChild(root);
  const close = () => { root.remove(); S.inEd = null; S.edDraw = null; onClose && onClose(); };
  root.querySelector('[data-x=back]').onclick = close;
  root.querySelector('[data-x=reset]').onclick = onReset;
  const pv = root.querySelector('canvas'), P = E.P, asp = P.w / P.h;
  const cw = Math.round(Math.min(window.innerWidth - 24, window.innerHeight * 0.34 * asp)), ch = Math.round(cw / asp), dp = Math.min(2, window.devicePixelRatio || 1);
  pv.style.width = cw + 'px'; pv.style.height = ch + 'px'; pv.width = Math.round(cw * dp); pv.height = Math.round(ch * dp);
  return { root, pv, body: root.querySelector('.edbody'), close };
}
const MaskEd = {
  open(o) {
    if (!o || o.lock) return toast(tr('unlocked'));
    const P = E.P, tp = () => clamp(E.t, o.t0, Math.max(o.t0 + 0.01, endOf(o) - 0.01));
    const mk = () => (o.mask && find(o.mask.id)) || null;
    let drag = null;
    const sh = edShell(tr('mask'), () => {
      const m = mk(); if (!o.mask) return; pushUndo();
      if (m) { const w = wpose(o, tp()); setPose(m, { x: w.x, y: w.y, sx: 1, sy: 1, rot: 0 }, tp()); }
      o.mask.f = 0; o.mask.inv = false; changedHook(); build(); draw();
    }, () => { TL.build(); renderBottom(); render(); });
    const { pv, body } = sh, g = pv.getContext('2d');
    const B = () => ({ a: pv.width / P.w, x: pv.width / 2, y: pv.height / 2 });
    const toS = p => { const b = B(); return { x: p.x * b.a + b.x, y: p.y * b.a + b.y }; };
    const draw = () => {
      const ids = [o.id]; const m = mk(); if (m) ids.push(m.id);
      renderTo(g, pv.width, pv.height, tp(), { only: ids, cam: CAMD });
      if (m && m._q && m._q.length >= 4) {
        const q = m._q.map(toS), s = pv.width / pv.clientWidth, hp = handlePts(m);
        g.save(); g.strokeStyle = '#ffffff'; g.lineWidth = 2 * s; g.setLineDash([6 * s, 5 * s]); g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke(); g.setLineDash([]);
        if (hp) { const r = toS(hp.rot), t = toS(hp.top); g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(r.x, r.y); g.stroke(); g.fillStyle = '#ec4899'; g.beginPath(); g.arc(r.x, r.y, 9 * s, 0, 7); g.fill(); }
        g.fillStyle = '#fff'; g.strokeStyle = '#a78bfa'; g.lineWidth = 2 * s; q.forEach(p => { g.beginPath(); g.arc(p.x, p.y, 8 * s, 0, 7); g.fill(); g.stroke(); });
        g.restore();
      }
    };
    S.edDraw = draw;
    // ---- preview interaction: move / scale / rotate the mask shape ----
    const pos = ev => { const r = pv.getBoundingClientRect(), s = pv.width / r.width; return { x: (ev.clientX - r.left) * s, y: (ev.clientY - r.top) * s, s }; };
    const inside = (q, p) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if (((q[i].y > p.y) !== (q[j].y > p.y)) && (p.x < (q[j].x - q[i].x) * (p.y - q[i].y) / (q[j].y - q[i].y) + q[i].x)) c = !c; return c; };
    pv.style.touchAction = 'none';
    pv.addEventListener('pointerdown', ev => {
      const m = mk(); if (!m || !m._q || m.lock) return; const p = pos(ev), q = m._q.map(toS), hp = handlePts(m); if (!hp) return;
      const c = toS(hp.c), rk = toS(hp.rot), w0 = wpose(m, tp()), R = 30 * p.s;
      let mode = null;
      if (Math.hypot(p.x - rk.x, p.y - rk.y) < R) mode = 'rot';
      else if (q.some(v => Math.hypot(p.x - v.x, p.y - v.y) < R)) mode = 'scale';
      else if (inside(q, p)) mode = 'move';
      if (!mode) return;
      drag = { mode, p0: p, c, w0, d0: Math.hypot(p.x - c.x, p.y - c.y) || 1, a0: Math.atan2(p.y - c.y, p.x - c.x), m, pushed: false };
      pv.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    pv.addEventListener('pointermove', ev => {
      if (!drag) return; const p = pos(ev), d = drag, a = pv.width / P.w;
      if (!d.pushed) { pushUndo(); d.pushed = true; }
      if (d.mode === 'move') setPose(d.m, { x: d.w0.x + (p.x - d.p0.x) / a, y: d.w0.y + (p.y - d.p0.y) / a }, tp());
      else if (d.mode === 'scale') { const k = clamp(Math.hypot(p.x - d.c.x, p.y - d.c.y) / d.d0, 0.1, 10); setPose(d.m, { sx: d.w0.sx * k, sy: d.w0.sy * k }, tp()); }
      else setPose(d.m, { rot: d.w0.rot + (Math.atan2(p.y - d.c.y, p.x - d.c.x) - d.a0) * 180 / Math.PI }, tp());
      draw();
    });
    const up = () => { if (drag) { drag = null; changedHook(true); } };
    pv.addEventListener('pointerup', up); pv.addEventListener('pointercancel', up);
    // ---- shape choice ----
    const setShape = kind => {
      pushUndo(); const m = mk();
      if (kind === null) { if (m && m.auto) removeObj(m.id); o.mask = null; }
      else if (m && m.auto) { m.shape = kind; delete m.pts; }
      else {
        const w = wpose(o, tp()), sz = Math.round(Math.min(o.w, o.h) * 0.6);
        const n = newObj('shape', { name: tr('mask') + ' ' + o.name, shape: kind, fill: '#ffffff', bw: 0, bc: '#ffffff', w: sz, h: sz, auto: true, x: w.x, y: w.y, t0: o.t0, t1: o.full ? 1 : o.t1, full: !!o.full });
        P.objects.splice(P.objects.indexOf(o) + 1, 0, n);
        o.mask = { id: n.id, inv: false, f: 0 };
      }
      changed('struct'); render(); build(); draw();
    };
    const useLayer = id => {
      pushUndo(); const m = mk(); if (m && m.auto) removeObj(m.id);
      o.mask = { id, inv: false, f: 0 }; changed('struct'); render(); build(); draw();
    };
    const thumbs = (list, onPick, cur) => '<div class="thl">' + (list.length ? list.map(q => '<button class="th ' + (q.id === cur ? 'on' : '') + '" data-i="' + q.id + '"><img src="' + layerThumb(q) + '"><span>' + esc(q.name || q.type) + '</span></button>').join('') : '<em class="mut">' + tr('nolayers') + '</em>') + '</div>';
    const build = () => {
      const m = mk(), sc = body.scrollTop;
      const kinds = SHAPES.filter(k => k !== 'line');
      body.innerHTML = '<div class="pgh">' + tr('maskshape') + '</div><div class="presets pshape"><button data-k="none" class="' + (!o.mask ? 'on' : '') + '"><canvas width="44" height="44" data-c="none"></canvas><span>' + tr('nomask') + '</span></button>' +
        kinds.map(k => '<button data-k="' + k + '" class="' + (m && m.auto && m.shape === k ? 'on' : '') + '"><canvas width="44" height="44" data-c="' + k + '"></canvas><span>' + tr(k) + '</span></button>').join('') +
        '<button data-k="custom"><canvas width="44" height="44" data-c="custom"></canvas><span>' + tr('customs') + '</span></button></div>' +
        (o.mask ? '<div class="chips" style="margin-top:10px"><button class="chip ' + (!o.mask.inv ? 'on' : '') + '" data-a="in">' + tr('maskin') + '</button><button class="chip ' + (o.mask.inv ? 'on' : '') + '" data-a="out">' + tr('maskout') + '</button><button class="chip" data-a="rm">' + tr('maskrm') + '</button></div><div class="sbox"></div>' + (m && m.auto ? '<div class="sbw"></div><div class="sbh"></div>' : '') : '') +
        (isMaskLayer(o) ? '<div class="pgh">' + tr('ismask') + '</div>' + thumbs(P.objects.filter(q => q.mask && q.mask.id === o.id), null, null).replace('class="thl"', 'class="thl" data-r="1"') : '') +
        '<div class="pgh">' + tr('orlayer') + '</div>' + thumbs(P.objects.filter(q => q.id !== o.id && !q.auto && !(q.mask && q.mask.id === o.id) && ['shape', 'text', 'image', 'video', 'draw'].includes(q.type)), null, m && !m.auto ? m.id : null) +
        (['shape', 'text', 'image', 'video', 'draw'].includes(o.type) ? '<div class="pgh">' + tr('maskfor') + '</div>' + thumbs(P.objects.filter(q => q.id !== o.id && !q.auto && !isMaskLayer(q) && !(m && m.id === q.id) && ['shape', 'text', 'image', 'video', 'draw'].includes(q.type)), null, null).replace('class="thl"', 'class="thl" data-r="1"') : '');
      body.querySelectorAll('canvas').forEach(c => { const x = c.getContext('2d'), k = c.dataset.c; x.fillStyle = '#a78bfa'; x.strokeStyle = '#a78bfa'; x.lineWidth = 3;
        if (k === 'none') { x.beginPath(); x.moveTo(10, 10); x.lineTo(34, 34); x.moveTo(34, 10); x.lineTo(10, 34); x.stroke(); }
        else if (k === 'custom') { x.beginPath(); x.moveTo(8, 34); x.lineTo(16, 10); x.lineTo(28, 22); x.lineTo(36, 8); x.stroke(); }
        else { drawShapePath(x, k, 5, 5, 34, 34); x.fill(); } });
      body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        const k = b.dataset.k;
        if (k === 'none') setShape(null);
        else if (k === 'custom') {
          const m0 = mk(), w0 = m0 && m0.auto && m0.shape === 'custom' && m0.pts ? wpose(m0, tp()) : null;
          const init = w0 && Math.abs(w0.sx - 1) < 0.01 && Math.abs(w0.sy - 1) < 0.01 && Math.abs(w0.rot) < 0.5 ? m0.pts.map(q => [((w0.x - m0.w / 2 + q[0] * m0.w) / P.w) + 0.5, ((w0.y - m0.h / 2 + q[1] * m0.h) / P.h) + 0.5, q[2] || 0]) : null;
          ShapeEd.open(null, (pts, smooth, asp, bb) => {
            let m2 = mk(); if (!(m2 && m2.auto)) { setShape('square'); m2 = mk(); }
            if (m2) { pushUndo(); m2.shape = 'custom'; m2.pts = pts; m2.smooth = false; m2.w = Math.max(20, Math.round(bb.bw * P.w)); m2.h = Math.max(20, Math.round(bb.bh * P.h));
              setPose(m2, { x: (bb.x0 + bb.bw / 2 - 0.5) * P.w, y: (bb.y0 + bb.bh / 2 - 0.5) * P.h, sx: 1, sy: 1, rot: 0 }, tp()); }
            changed('struct'); render(); build(); draw();
          }, o, init);
        }
        else setShape(k);
      });
      body.querySelectorAll('.thl:not([data-r]) [data-i]').forEach(b => b.onclick = () => useLayer(b.dataset.i));
      body.querySelectorAll('.thl[data-r] [data-i]').forEach(b => b.onclick = () => { const q = find(b.dataset.i); if (!q) return; pushUndo(); q.mask = (q.mask && q.mask.id === o.id) ? null : { id: o.id, inv: false, f: 0 }; changed('struct'); render(); build(); toast(q.mask ? tr('mask') + ' ✓' : tr('maskrm')); });
      const bin = body.querySelector('[data-a=in]'), bout = body.querySelector('[data-a=out]'), brm = body.querySelector('[data-a=rm]');
      if (bin) bin.onclick = () => { pushUndo(); o.mask.inv = false; changedHook(); build(); draw(); };
      if (bout) bout.onclick = () => { pushUndo(); o.mask.inv = true; changedHook(); build(); draw(); };
      if (brm) brm.onclick = () => { setShape(null); toast(tr('maskrm') + ' ✓'); };
      const sw = body.querySelector('.sbw'), shh = body.querySelector('.sbh');
      if (sw && m) { slider(sw, tr('mwidth'), 20, Math.round(P.w * 2), 1, () => m.w, v => { m.w = Math.round(v); }); slider(shh, tr('mheight'), 20, Math.round(P.h * 2), 1, () => m.h, v => { m.h = Math.round(v); }); }
      const sb = body.querySelector('.sbox'); if (sb) slider(sb, tr('feather'), 0, 60, 1, () => o.mask.f || 0, v => { o.mask.f = v; });
      body.scrollTop = sc;
    };
    build(); draw();
  }
};
const TextEd = {
  open(o) {
    if (!o || !['text', 'image', 'video', 'shape', 'draw'].includes(o.type)) return;
    const P = E.P, tp = () => clamp(E.t, o.t0, Math.max(o.t0 + 0.01, endOf(o) - 0.01));
    const DEF = { font: 'sans', fs: 130, fill: '#ffffff', fill2: null, bw: 0, bc: '#000000', bold: true, italic: false, under: false, caps: false, align: 'c', ls: 0, lhm: 1, bg: null, bgp: 20, bgr: 0 };
    const sh = edShell(tr('textt'), () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); Object.assign(o, DEF); changedHook(); build(); draw(); }, () => { S.inEd = null; S.edDraw = null; renderBottom(); render(); });
    const g = sh.pv.getContext('2d'), body = sh.body;
    const draw = () => { renderTo(g, sh.pv.width, sh.pv.height, tp(), { only: [o.id], cam: CAMD }); if (Pad.el && Pad.el.isConnected) Pad.refresh(); };
    S.edDraw = draw;
    const build = () => { const sc = body.scrollTop; body.innerHTML = ''; S.inEd = build; textTop(body, o, sh); if (o.type === 'text') { textAnim(body, o, o); textPanel(body, o); } else layerTextPanel(body, o); body.scrollTop = sc; };
    build(); draw();
  }
};
// Text tab for image / video / shape layers: colour, border, extra text
function layerTextPanel(p, o) {
  const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
  if (o.type === 'shape') {
    lab(tr('fill')); colorRow(p, '', o.fill, c => { o.fill = c || '#ffffff'; });
    lab(tr('outline')); slider(p, tr('border'), 0, 40, 1, () => o.bw || 0, v => { o.bw = v; });
    if ((o.bw || 0) > 0) colorRow(p, '', o.bc || '#ffffff', c => { o.bc = c || '#ffffff'; });
  }
  const txtSec = () => {
  lab(tr('textt'));
  const b = document.createElement('div'); b.className = 'chips';
  b.innerHTML = o.txo ? '<button class="chip">' + ic('trash', 15) + ' ' + tr('rmtxt') + '</button>' : '<button class="chip on">' + ic('plus', 15) + ' ' + tr('addtxt') + '</button>';
  b.firstChild.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); if (o.txo) { o.txo = null; } else o.txo = { text: 'Text', font: 'sans', fs: 90, fill: '#ffffff', fill2: null, bw: 0, bc: '#000000', bold: true, italic: false, under: false, caps: false, align: 'c', ls: 0, lhm: 1, bg: null, bgp: 20, bgr: 0, dx: 0, dy: 0 }; changedHook(); rb(); };
  p.appendChild(b);
  if (o.txo) { textPanel(p, o.txo); textAnim(p, o.txo, o); slider(p, 'X', -1500, 1500, 1, () => o.txo.dx || 0, v => { o.txo.dx = v; }); slider(p, 'Y', -1500, 1500, 1, () => o.txo.dy || 0, v => { o.txo.dy = v; });
    efxList(p, o); }
  };
  if (o.type === 'draw') { txtSec(); lab(tr('lborder')); } 
  if (o.type !== 'draw') lab(tr('lborder'));
  const lb = () => o.lb || (o.lb = { w: 0, c: '#ffffff', r: 0 });
  slider(p, tr('border'), 0, 60, 1, () => lb().w, v => { lb().w = v; });
  slider(p, tr('corner2'), 0, 300, 1, () => lb().r || 0, v => { lb().r = v; });
  colorRow(p, '', lb().c, c => { lb().c = c || '#ffffff'; });
  if (o.type !== 'draw') txtSec();
}
const ShapeEd = {
  // open(o, done, target): if `target` (a layer) is given, its picture is shown behind the points so you can trace over it
  open(o, done, target, init) {
    let pts = o && o.pts ? o.pts.map(p => [p[0], p[1], o.smooth ? 1 : (p[2] || 0)]) : (init || []).map(p => p.slice()), drag = -1, moved = false;
    const root = document.createElement('div'); root.className = 'edov';
    root.innerHTML = '<div class="edhd"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + tr('shapeed') + '</b><button class="ib" data-x="reset" title="' + tr('clearp') + '">' + ic('refresh', 20) + '</button></div>' +
      '<div class="edpv"><canvas class="shpad"></canvas></div><div class="edbody"><p class="mut" style="text-align:center">' + tr(target ? 'drawhint2' : 'drawhint') + '</p>' +
      '<div class="chips" style="justify-content:center"><button class="chip" data-a="undo">' + tr('undop') + '</button><button class="chip" data-a="sm"></button><button class="chip" data-a="sh">' + tr('sharpall') + '</button></div>' +
      '<div class="row2" style="margin-top:14px"><button class="btn" data-a="ok">' + tr('ok') + '</button></div></div>';
    document.body.appendChild(root);
    const cv = root.querySelector('canvas'), dp = Math.min(2, window.devicePixelRatio || 1);
    const asp = target ? E.P.w / E.P.h : 1, S0 = Math.min(window.innerWidth - 24, window.innerHeight * 0.5);
    const cw = target ? Math.round(Math.min(window.innerWidth - 24, window.innerHeight * 0.5 * asp)) : Math.round(S0), ch = target ? Math.round(cw / asp) : Math.round(S0);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.width = Math.round(cw * dp); cv.height = Math.round(ch * dp);
    const g = cv.getContext('2d'), NW = cv.width, NH = cv.height, pad = target ? 0 : 0.06 * NW, wW = NW - pad * 2, wH = NH - pad * 2;
    const X = p => pad + p[0] * wW, Y = p => pad + p[1] * wH;
    const tp = () => clamp(E.t, target ? target.t0 : 0, target ? Math.max(target.t0 + 0.01, endOf(target) - 0.01) : 1);
    const draw = () => {
      g.clearRect(0, 0, NW, NH);
      if (target) { renderTo(g, NW, NH, tp(), { only: [target.id], cam: CAMD }); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, NW, NH); }
      else { g.fillStyle = '#12142a'; g.fillRect(0, 0, NW, NH); g.strokeStyle = '#2b2f58'; g.lineWidth = 1; for (let i = 0; i <= 8; i++) { const v = pad + wW * i / 8; g.beginPath(); g.moveTo(v, pad); g.lineTo(v, pad + wH); g.moveTo(pad, v); g.lineTo(pad + wW, v); g.stroke(); } }
      if (pts.length > 2) { drawShapePath(g, 'custom', pad, pad, wW, wH, pts, false); g.fillStyle = 'rgba(167,139,250,.38)'; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 2.5 * dp; g.stroke(); g.strokeStyle = '#a78bfa'; g.lineWidth = 1.2 * dp; g.stroke(); }
      else if (pts.length === 2) { g.strokeStyle = '#a78bfa'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(pts[0]), Y(pts[0])); g.lineTo(X(pts[1]), Y(pts[1])); g.stroke(); }
      pts.forEach((p, i) => { const x = X(p), y = Y(p), r = 10 * dp; g.beginPath(); if (p[2]) g.arc(x, y, r, 0, 7); else g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); g.fillStyle = i === 0 ? '#ec4899' : '#fff'; g.fill(); g.strokeStyle = p[2] ? '#22d3ee' : '#a78bfa'; g.lineWidth = 2.5 * dp; g.stroke(); });
      const allr = pts.length && pts.every(p => p[2]);
      root.querySelector('[data-a=sm]').textContent = tr('smooth') + (allr ? ' ✓' : '');
      root.querySelector('[data-a=sm]').classList.toggle('on', allr);
    };
    const pp = ev => { const r = cv.getBoundingClientRect(), s = NW / r.width, x = (ev.clientX - r.left) * s, y = (ev.clientY - r.top) * s; return { x, y, u: [clamp((x - pad) / wW, 0, 1), clamp((y - pad) / wH, 0, 1)] }; };
    cv.style.touchAction = 'none'; let tapI = -1, p0 = null;
    cv.addEventListener('pointerdown', ev => {
      const p = pp(ev); p0 = p; moved = false; drag = pts.findIndex(q => Math.hypot(X(q) - p.x, Y(q) - p.y) < 26 * dp); tapI = drag;
      if (drag < 0) { const last = pts[pts.length - 1]; pts.push([p.u[0], p.u[1], last ? last[2] : 0]); drag = pts.length - 1; }
      cv.setPointerCapture(ev.pointerId); draw();
    });
    cv.addEventListener('pointermove', ev => { if (drag < 0) return; const p = pp(ev); if (Math.hypot(p.x - p0.x, p.y - p0.y) > 6 * dp) moved = true; if (moved || tapI < 0) { const c = pts[drag][2]; pts[drag] = [p.u[0], p.u[1], c]; draw(); } });
    const up = () => { if (drag >= 0 && tapI >= 0 && !moved) { pts[tapI][2] = pts[tapI][2] ? 0 : 1; } drag = -1; tapI = -1; draw(); }; // tap an existing point → toggle round / sharp
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { drag = -1; });
    root.querySelector('[data-a=undo]').onclick = () => { pts.pop(); draw(); };
    root.querySelector('[data-a=sm]').onclick = () => { const allr = pts.length && pts.every(p => p[2]); pts.forEach(p => p[2] = allr ? 0 : 1); draw(); };
    root.querySelector('[data-a=sh]').onclick = () => { pts.forEach(p => p[2] = 0); draw(); };
    root.querySelector('[data-x=reset]').onclick = () => { pts = []; draw(); };
    root.querySelector('[data-x=back]').onclick = () => root.remove();
    root.querySelector('[data-a=ok]').onclick = () => {
      if (pts.length < 3) return toast(tr('drawhint'));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), bw = Math.max(0.02, x1 - x0), bh = Math.max(0.02, y1 - y0);
      const norm = pts.map(p => [(p[0] - x0) / bw, (p[1] - y0) / bh, p[2] ? 1 : 0]);
      root.remove(); done(norm, false, target ? (bw * E.P.w) / (bh * E.P.h) : bw / bh, { x0, y0, bw, bh });
    };
    draw();
  }
};

/* ===== Effect rows + Effect Browser ===== */
function fxNew(k) { const d = FXD[k], e = { id: 'e' + Math.random().toString(36).slice(2, 8), k, on: true, open: true, p: {} }; (d.P || []).forEach(q => { e.p[q.k] = q.c != null ? q.c : q.b != null ? q.b : q.str != null ? q.str : q.d; }); return e; }
function fxSet(e, k, v) { const kf = e.kf && e.kf[k]; if (kf && kf.length) { const i = kf.findIndex(x => Math.abs(x.t - E.t) < 0.04); if (i >= 0) kf[i].v = v; else { kf.push({ t: E.t, v }); kf.sort((a, b) => a.t - b.t); } } else { e.p = e.p || {}; e.p[k] = v; } }
function fxKeyAt(e, k) { const kf = e.kf && e.kf[k]; return kf ? kf.findIndex(x => Math.abs(x.t - E.t) < 0.04) : -1; }
function fxToggleKey(e, k) {
  e.kf = e.kf || {}; const kf = e.kf[k] || (e.kf[k] = []), i = fxKeyAt(e, k);
  if (i >= 0) { kf.splice(i, 1); if (!kf.length) { delete e.kf[k]; } } else { kf.push({ t: E.t, v: efvN(e, k, E.t) }); kf.sort((a, b) => a.t - b.t); }
}
function fxParamRows(b, e, o) {
  const d = FXD[e.k];
  if (d.reg) regRows(b, e, o);
  (d.P || []).forEach(sp => {
    const row = document.createElement('div');
    const hasK = e.kf && e.kf[sp.k] && e.kf[sp.k].length, onK = fxKeyAt(e, sp.k) >= 0;
    const lab = '<button class="rl kfl' + (hasK ? ' hk' : '') + (onK ? ' ok' : '') + '" data-x="kf">' + (hasK ? '◆ ' : '') + esc(sp.l) + '</button>';
    row.className = 'rr'; row.addEventListener('pointerdown', () => { S.fxFocus = e.id; });
    if (sp.c != null) {
      const cur = efvN(e, sp.k, E.t);
      row.innerHTML = lab + '<div class="rk nor"></div><button class="cdot" style="background:' + cur + '"></button>';
      row.querySelector('.cdot').onclick = () => pickColor(cur, c => { pushUndo(); fxSet(e, sp.k, c); changedHook(); rb(); });
    } else if (sp.str != null) {
      row.innerHTML = '<span class="rl">' + esc(sp.l) + '</span><input class="tx" style="flex:1;min-width:0;padding:6px 8px">';
      const inp = row.querySelector('input'); inp.value = (e.p && e.p[sp.k] != null) ? e.p[sp.k] : sp.str; inp.oninput = () => { e.p = e.p || {}; e.p[sp.k] = inp.value; changedHook(); };
    } else if (sp.b != null) {
      const cur = efvN(e, sp.k, E.t);
      row.innerHTML = lab + '<div class="rk nor"></div><button class="chip ' + (cur ? 'on' : '') + '">' + (cur ? 'ON' : 'OFF') + '</button>';
      row.querySelector('.chip').onclick = () => { pushUndo(); fxSet(e, sp.k, cur ? 0 : 1); changedHook(); rb(); };
    } else if (sp.opts) {
      const cur = Math.round(efvN(e, sp.k, E.t));
      row.innerHTML = lab + '<div class="rk nor"></div>' + sp.opts.map((n, i) => '<button class="chip ' + (i === cur ? 'on' : '') + '" data-i="' + i + '">' + n + '</button>').join('');
      row.querySelectorAll('[data-i]').forEach(c => c.onclick = () => { pushUndo(); fxSet(e, sp.k, +c.dataset.i); changedHook(); rb(); });
    } else {
      row.innerHTML = lab + '<div class="rk"><i class="ctr"></i></div><input class="rv" inputmode="decimal" readonly>';
      const rk = row.querySelector('.rk'), inp = row.querySelector('.rv'), per = (sp.max - sp.min) / 300;
      const show = () => { const v = efvN(e, sp.k, E.t); if (document.activeElement !== inp) inp.value = (Math.round(v * 100) / 100) + (sp.u || ''); rk.style.backgroundPositionX = (v / per) + 'px'; };
      show(); let g = null;
      rk.addEventListener('pointerdown', ev => { ev.preventDefault(); rk.setPointerCapture(ev.pointerId); if (o.lock) return toast(tr('unlocked')); g = { x0: ev.clientX, v0: efvN(e, sp.k, E.t), began: false }; });
      rk.addEventListener('pointermove', ev => { if (!g) return; if (!g.began) { if (Math.abs(ev.clientX - g.x0) < 3) return; pushUndo(); g.began = true; } const v = clamp(g.v0 + (ev.clientX - g.x0) * per, sp.min, sp.max), st = sp.s || 1; fxSet(e, sp.k, Math.round(v / st) * st); show(); changedHook(); });
      const end = () => { g = null; }; rk.addEventListener('pointerup', end); rk.addEventListener('pointercancel', end);
      inp.addEventListener('click', () => { inp.readOnly = false; inp.focus(); inp.select(); });
      inp.addEventListener('blur', () => { inp.readOnly = true; });
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (isNaN(v)) return show(); pushUndo(); fxSet(e, sp.k, clamp(v, sp.min, sp.max)); changedHook(); show(); });
    }
    row.querySelector('[data-x=kf]').onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); fxToggleKey(e, sp.k); changedHook(); rb(); };
    b.appendChild(row);
  });
}
// list mode (Effects tab): effect rows only. vals mode (arrow): only the values of the added effects.
function efxList(p, o, vals) {
  o.efx = o.efx || [];
  if (vals) {
    const box = document.createElement('div'); box.className = 'efl'; p.appendChild(box);
    const list = o.efx.filter(e => FXD[e.k] && (FXD[e.k].P || []).length);
    if (o.tj) tjRows(box, o);
    if (!list.length && !o.tj) { const m = document.createElement('p'); m.className = 'pgh'; m.textContent = tr('nofxs'); box.appendChild(m); }
    list.sort((a, b) => (b.id === S.fxFocus) - (a.id === S.fxFocus));
    list.forEach(e => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = FXD[e.k].n + (e.on === false ? ' (off)' : ''); box.appendChild(h); const b = document.createElement('div'); b.className = 'efb'; box.appendChild(b); fxParamRows(b, e, o); if (/^tr_/.test(e.k)) { const c = document.createElement('div'); c.className = 'chips'; c.innerHTML = '<button class="chip on">' + ic('curve', 16) + ' ' + L2('Speed curve', 'रफ़्तार का वक्र') + '</button>'; c.firstChild.onclick = () => { if (o.lock) return toast(tr('unlocked')); e.ce = e.ce || {}; document.body.appendChild(Curve.open(o, e.ce, () => changedHook())); }; b.appendChild(c); } });
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'efl'; p.appendChild(wrap);
  o.efx.forEach((e, idx) => {
    const d = FXD[e.k]; if (!d) return;
    const r = document.createElement('div'); r.className = 'efr' + (e.on === false ? ' off' : '');
    r.innerHTML = '<div class="efh"><button class="ib" data-x="eye">' + ic(e.on === false ? 'eyeoff' : 'eye', 18) + '</button><b>' + esc(d.n) + '</b><button class="ib" data-x="more">' + ic('dots', 20) + '</button><button class="ib" data-x="del">' + ic('trash', 18) + '</button><span class="efdrag" data-x="drag">≡</span></div>';
    wrap.appendChild(r);
    const hd = r.querySelector('.efh');
    hd.querySelector('[data-x=eye]').onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); e.on = e.on === false; changedHook(); rb(); };
    hd.querySelector('b').onclick = () => { S.fxFocus = e.id; S.panel = 'fxv'; renderBottom(); };
    hd.querySelector('[data-x=del]').onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.efx.splice(idx, 1); changedHook(true); rb(); };
    hd.querySelector('[data-x=more]').onclick = () => listSheet(d.n, [
      { icon: 'copy', label: tr('dup'), fn: () => { pushUndo(); const c = jcopy(e); c.id = 'e' + Math.random().toString(36).slice(2, 8); o.efx.splice(idx + 1, 0, c); changedHook(); rb(); } },
      { icon: 'refresh', label: tr('reset'), fn: () => { pushUndo(); const n = fxNew(e.k); e.p = n.p; delete e.kf; changedHook(); rb(); } },
      { icon: 'trash', label: tr('delete'), fn: () => { pushUndo(); o.efx.splice(idx, 1); changedHook(true); rb(); } }]);
    const dg = hd.querySelector('[data-x=drag]');
    dg.addEventListener('pointerdown', ev => {
      if (o.lock) return toast(tr('unlocked')); ev.preventDefault(); dg.setPointerCapture(ev.pointerId); r.classList.add('drg');
      const rows = [...wrap.children];
      const mv = m => { const y = m.clientY; let to = rows.findIndex(q => { const b = q.getBoundingClientRect(); return y < b.top + b.height / 2; }); if (to < 0) to = rows.length - 1; rows.forEach(q => q.classList.remove('tgt')); rows[to].classList.add('tgt'); r._to = to; };
      const up = () => { dg.removeEventListener('pointermove', mv); dg.removeEventListener('pointerup', up); dg.removeEventListener('pointercancel', up); r.classList.remove('drg'); const to = r._to; r._to = null; if (to != null && to !== idx) { pushUndo(); const [x] = o.efx.splice(idx, 1); o.efx.splice(to, 0, x); changedHook(); } rb(); };
      dg.addEventListener('pointermove', mv); dg.addEventListener('pointerup', up); dg.addEventListener('pointercancel', up);
    });
  });
  const add = document.createElement('button'); add.className = 'efadd'; add.innerHTML = ic('plus', 18) + '<span>' + tr('addfx') + '</span>';
  add.onclick = () => { if (o.lock) return toast(tr('unlocked')); FxBrowser.open(o); };
  p.appendChild(add);
}
// animated preview used by the Effect Browser tiles (each effect shows on a fitting demo: photo / white shape / dark flower / text)
const DEMO_W = new Set('holedim areahi nodepop glowp float gblur boxblur lensblur dirblur motblur zoomblur spinblur innerblur linstreak maskblur spinstreak streakstripes zoomstreak chromzoom contlines'.split(' '));
const DEMO_D = new Set('glow sglow lglow darkglow edgeglow electric innerglow edges rays energy lensflare lightning starfield starfield2 star glowscan bevel ribbon'.split(' '));
const DEMO_C = new Set('lowerthird fade pop highlight underline quote redact glitch flicker credits pin'.split(' '));
const DEMO_T = new Set('stroke taper lshadow shine drawprog rough smooth'.split(' '));
function fxDemoKind(d) { return d.text ? 'text' : DEMO_C.has(d.k) ? 'doc' : DEMO_T.has(d.k) ? 'txt2' : DEMO_W.has(d.k) ? 'white' : DEMO_D.has(d.k) ? 'dark' : 'photo'; }
function fxDemo(A, d, t) {
  const W = A.canvas.width, H = A.canvas.height, kind = fxDemoKind(d); fxClear(A); A.textAlign = 'center'; A.textBaseline = 'middle';
  if (kind === 'text') {
    const e = fxNew(d.k), fake = { type: 'text', text: d.k === 'timecode' ? '00:00' : d.k === 'count' ? '0' : (d.k === 'dscroll' || d.k === 'randnum' || d.k === 'odometer') ? '2024' : d.k === 'datetitle' ? '2024 Agra' : d.k === 'subtitle' ? 'Pixy Motion app' : 'Pixy Motion', t0: 0, t1: 3, speed: 1, efx: [e], ls: 0 }, tv = textFxView(fake, t);
    A.fillStyle = '#fff'; A.font = 'bold ' + (['tprog', 'tspace', 'typing', 'wordbyword', 'letterreveal', 'subtitle'].includes(d.k) ? W * 0.13 : d.k === 'datetitle' ? W * 0.15 : W * 0.26) + 'px sans-serif'; if ('letterSpacing' in A) A.letterSpacing = tv.ls * 0.25 + 'px'; if (tv.vis != null || tv.hl > 0) { const arr = Array.from(tv.text), fw = A.measureText(tv.text).width, x0 = W / 2 - fw / 2, k = Math.floor(tv.vis == null ? arr.length : tv.vis); A.textAlign = 'left'; A.fillText(arr.slice(0, k).join(''), x0, H / 2); if (tv.vis != null && k < arr.length) { A.save(); A.globalAlpha = tv.vis - k; A.fillText(arr[k], x0 + A.measureText(arr.slice(0, k).join('')).width, H / 2); A.restore(); } if (tv.hl > 0) { A.fillStyle = tv.hlc; A.fillText(arr.slice(0, tv.hl).join(''), x0, H / 2); } A.textAlign = 'center'; return; }
    if (tv.roll) { const arr = Array.from(tv.text), fs = W * 0.26, stp = fs * 1.1; A.textAlign = 'left'; const ws = arr.map(c => A.measureText(c).width), tw = ws.reduce((p, q) => p + q, 0); let px = W / 2 - tw / 2;
      arr.forEach((ch, k) => { const r = tv.roll[k]; if (r == null) A.fillText(ch, px, H / 2); else { const fl = Math.floor(r), fr = r - fl; A.save(); A.beginPath(); A.rect(px - 2, H / 2 - stp / 2, ws[k] + 4, stp); A.clip(); A.fillText(String(((fl % 10) + 10) % 10), px, H / 2 - fr * stp); A.fillText(String((((fl + 1) % 10) + 10) % 10), px, H / 2 + (1 - fr) * stp); A.restore(); } px += ws[k]; }); return; }
    A.fillText(tv.text, W / 2, H / 2); return;
  }
  if (kind === 'doc') { A.fillStyle = '#fff'; A.font = 'bold ' + W * 0.15 + 'px sans-serif'; A.fillText('Agra 2024', W / 2, H / 2); return; }
  if (kind === 'txt2') { A.fillStyle = '#ff9f43'; A.font = 'italic bold ' + W * 0.34 + 'px serif'; A.fillText('Love', W / 2, H / 2); return; }
  if (kind === 'white') { A.fillStyle = '#3b82f6'; A.beginPath(); A.arc(W / 2, H / 2, W * 0.26, 0, 7); A.fill(); return; }
  if (kind === 'dark') { A.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { A.save(); A.translate(W / 2, H / 2); A.rotate(i * 0.785); A.beginPath(); A.ellipse(0, -W * 0.2, W * 0.09, W * 0.17, 0, 0, 7); A.fill(); A.restore(); } A.fillStyle = '#f5c518'; A.beginPath(); A.arc(W / 2, H / 2, W * 0.1, 0, 7); A.fill(); return; }
  const x0 = 6, y0 = 6, w = W - 12, h = H - 12, g = A.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#5b8dff'); g.addColorStop(0.6, '#ffb36b'); g.addColorStop(1, '#3a2a6a');
  A.fillStyle = g; A.beginPath(); if (A.roundRect) A.roundRect(x0, y0, w, h, 8); else A.rect(x0, y0, w, h); A.fill(); A.save(); A.clip();
  A.fillStyle = '#ffe9a8'; A.beginPath(); A.arc(W * 0.7, H * 0.3, W * 0.1, 0, 7); A.fill();
  A.fillStyle = '#2d1b5e'; A.beginPath(); A.moveTo(0, H); A.lineTo(W * 0.35, H * 0.45); A.lineTo(W * 0.65, H); A.fill(); A.fillStyle = '#44307f'; A.beginPath(); A.moveTo(W * 0.4, H); A.lineTo(W * 0.75, H * 0.5); A.lineTo(W, H); A.fill();
  [['#ff5d8f', 0.22, 0.72], ['#ffd166', 0.45, 0.82], ['#ff7b54', 0.68, 0.74], ['#ff5d8f', 0.85, 0.85]].forEach(([c, x, y]) => { A.fillStyle = '#2f9e44'; A.fillRect(W * x - 1, H * y, 2, H * 0.2); A.fillStyle = c; A.beginPath(); A.arc(W * x, H * y, W * 0.07, 0, 7); A.fill(); A.fillStyle = '#fff3b0'; A.beginPath(); A.arc(W * x, H * y, W * 0.025, 0, 7); A.fill(); });
  A.restore(); A.fillStyle = '#fff'; A.font = 'bold ' + W * 0.16 + 'px sans-serif'; A.fillText('Aa', W * 0.28, H * 0.24);
}
const FOLDER_DEMO = { 'Transitions': 'tr_cloud', 'Product Highlight': 'spot', 'Map & Diagram': 'dashline', 'Documentary': 'lowerthird', 'Text': 'count', 'Color & Light': 'hue', 'Drawing & Edge': 'edgeglow', 'Blur': 'zoomblur', 'Distortion/Warp': 'swirl', 'Procedural': 'stripes', '3D': 'cylinder', 'Move/Transform': 'shake', 'Repeat': 'echo' };
const FxBrowser = {
  open(o) {
    const root = document.createElement('div'); root.className = 'edov fxb';
    root.innerHTML = '<div class="edhd"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + tr('fxbrowser') + '</b><button class="ib" data-x="srch">' + ic('edit', 20) + '</button></div><input class="fxq hidden" placeholder="' + tr('search') + '"><div class="fxbody"></div>';
    document.body.appendChild(root);
    const body = root.querySelector('.fxbody'), q = root.querySelector('.fxq'), hd = root.querySelector('b'); let folder = null;
    const folders = FXFOLD.filter(f => f !== 'Text' || o.type === 'text' || o.txo);
    const tile = (d, k) => '<button class="fxt" data-k="' + k + '"><i><canvas width="110" height="110"></canvas></i><span>' + esc(d.n) + '</span></button>';
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => { x.target._vis = x.isIntersecting; }), { root: body }) : null;
    let raf = 0, last = 0;
    const loop = ts => {
      if (!root.isConnected) return; raf = requestAnimationFrame(loop); if (ts - last < 70) return; last = ts; const t = (ts / 1000) % 3;
      root.querySelectorAll('.fxt canvas, .fxf canvas').forEach(cv => { if (io && !cv._vis) return; const fol = cv.classList.contains('fc'), d = FXD[fol ? FOLDER_DEMO[cv.dataset.f] : cv.parentNode.parentNode.dataset.k], A = cv.getContext('2d'), W = cv.width, H = cv.height, sc = W / 400; try { fxDemo(A, d, t); if (d.fn) { fxB = { a: sc, x: W / 2, y: H / 2 }; const e = fxNew(d.k); d.fn(A, k => efvN(e, k, t), { W, H, s: sc, t, o: fxDemoKind(d) === 'doc' ? { _q: [{ x: -0.42 * W / sc, y: -0.13 * W / sc }, { x: 0.42 * W / sc, y: -0.13 * W / sc }, { x: 0.42 * W / sc, y: 0.13 * W / sc }, { x: -0.42 * W / sc, y: 0.13 * W / sc }], t0: 0, t1: 3, text: 'Agra 2024' } : null, e }); } } catch (er) { } });
    };
    const pick = k => { const d = FXD[k]; if (d.soon) return toast(tr('efsoon')); pushUndo(); o.efx = o.efx || []; o.efx.forEach(x => x.open = false); o.efx.push(fxNew(k)); changedHook(true); close(); rb(); toast(d.n + ' ✓'); };
    const close = () => { cancelAnimationFrame(raf); root.remove(); };
    const show = () => {
      const s = q.value.trim().toLowerCase();
      if (!folder && !s) { hd.textContent = tr('fxbrowser'); body.className = 'fxbody fol'; const feat = ['shine', 'chroma', 'dirblur', 'cylinder'].concat(o.type === 'text' ? ['count', 'timecode', 'tprog'] : []); body.innerHTML = '<div class="fxfeat">' + feat.map(k => tile(FXD[k], k)).join('') + '</div>' + folders.map(f => '<button class="fxf" data-f="' + f + '"><canvas class="fc" data-f="' + f + '" width="176" height="88"></canvas><b>' + f + '</b><span>' + FXL.filter(r => r[0] === f).length + '</span></button>').join(''); body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { folder = b.dataset.f; show(); }); body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => pick(b.dataset.k)); body.querySelectorAll('.fxt canvas, .fxf canvas').forEach(c => io && io.observe(c)); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); return; }
      hd.textContent = s ? tr('search') : folder; body.className = 'fxbody grd';
      const list = FXL.filter(r => (s ? r[2].toLowerCase().includes(s) : r[0] === folder) && (r[0] !== 'Text' || o.type === 'text' || o.txo)).sort((a, b) => (FXD[a[1]].soon ? 1 : 0) - (FXD[b[1]].soon ? 1 : 0));
      body.innerHTML = list.map(r => tile(FXD[r[1]], r[1])).join('');
      body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => pick(b.dataset.k)); body.querySelectorAll('.fxt canvas, .fxf canvas').forEach(c => io && io.observe(c));
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    };
    root.querySelector('[data-x=back]').onclick = () => { if (q.value) { q.value = ''; q.classList.add('hidden'); show(); } else if (folder) { folder = null; show(); } else close(); };
    root.querySelector('[data-x=srch]').onclick = () => { q.classList.toggle('hidden'); if (!q.classList.contains('hidden')) q.focus(); };
    q.oninput = show; show();
  }
};

// "+" between two clips: pick a transition (animated previews), time and softness
const TransSheet = {
  open(o) {
    const pv = trPrevOf(o) || (o.tj && find(o.tj.prev)); if (!pv) return;
    const root = document.createElement('div'); root.className = 'edov';
    root.innerHTML = '<div class="edhd"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + tr('transition') + '</b><span></span></div><div class="edbody" style="overflow:auto"><p class="mut" style="text-align:center">' + tr('trhint') + '</p><div class="sbd"></div><div class="sbs"></div><div class="trs"></div><div class="row2"><button class="btn" data-a="rm">' + tr('trrem') + '</button></div></div>';
    document.body.appendChild(root);
    const grid = root.querySelector('.trs'), cur = () => o.tj && o.tj.id;
    const draw = () => { grid.innerHTML = TRL.map(r => '<button data-id="' + r[0] + '" class="' + (cur() === r[0] ? 'on' : '') + '"><canvas width="112" height="80"></canvas>' + esc(r[1]) + '</button>').join(''); grid.querySelectorAll('button').forEach(b => b.onclick = () => set(b.dataset.id)); };
    const set = id => { pushUndo(); const old = o.tj || {}; o.tj = { id, d: old.d || 0.8, soft: old.soft == null ? 15 : old.soft, prev: pv.id }; changed('struct'); render(); draw(); };
    root.querySelector('[data-a=rm]').onclick = () => { if (o.tj) { pushUndo(); delete o.tj; changed('struct'); render(); } root.remove(); cancelAnimationFrame(raf); };
    const sl = (host, label, min, max, step, key, def) => slider(host, label, min, max, step, () => (o.tj && o.tj[key] != null ? o.tj[key] : def), v => { if (!o.tj) o.tj = { id: 'fade', d: 0.8, soft: 15, prev: pv.id }; o.tj[key] = v; changedHook(); });
    sl(root.querySelector('.sbd'), tr('trdur'), 0.1, 2, 0.05, 'd', 0.8); sl(root.querySelector('.sbs'), tr('trsoft'), 0, 100, 1, 'soft', 15);
    const SA = document.createElement('canvas'), SB = document.createElement('canvas'); let raf = 0, last = 0;
    const scene = (g, W, H, a) => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a ? '#3b82f6' : '#f97316'); gr.addColorStop(1, a ? '#6d28d9' : '#ec4899'); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold ' + H * 0.7 + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a ? 'A' : 'B', W / 2, H / 2 + 3); };
    const loop = ts => {
      if (!root.isConnected) return; raf = requestAnimationFrame(loop); if (ts - last < 60) return; last = ts;
      grid.querySelectorAll('canvas').forEach(cv => {
        const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
        const W = cv.width, H = cv.height, g = cv.getContext('2d'); SB.width = W; SB.height = H; const sb = SB.getContext('2d'); sb.clearRect(0, 0, W, H); scene(sb, W, H, false);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); scene(g, W, H, true);
        const t = (ts / 1000) % 2.6, u = trEase(clamp(t / 1.5, 0, 1)); try { fxB = { a: W / 400, x: W / 2, y: H / 2 }; trApply(sb, cv.parentNode.dataset.id, u, o.tj && o.tj.soft != null ? o.tj.soft : 15, { W, H, s: W / 400, t, o: null }); } catch (er) { }
        sb.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(SB, 0, 0);
      });
    };
    root.querySelector('[data-x=back]').onclick = () => { cancelAnimationFrame(raf); root.remove(); };
    draw(); raf = requestAnimationFrame(loop);
  }
};

// Drawing tool: draw over the current frame with a pen / line / arrow / circle / box → becomes a 'draw' layer (colour, width, glow, dashes, draw-on animation are editable afterwards)
const DrawEd = {
  open() {
    const P = E.P; let tool = 'pen', brush = 'pen', op = 1, gcol = null, gman = false, col = '#facc15', lw = Math.max(4, Math.round(P.w / 90)), glow = 0; const strokes = []; let cur = null;
    const root = document.createElement('div'); root.className = 'edov';
    root.innerHTML = '<div class="edhd"><button class="ib" data-x="back">' + ic('back', 22) + '</button><b>' + tr('draw') + '</b><span></span></div><div class="edpv"><canvas class="shpad"></canvas></div><div class="edbody"><p class="mut" style="text-align:center;margin:2px 0">' + tr('drawhint3') + '</p>' +
      '<div class="chips" style="justify-content:center">' + [['pen', 'dpen'], ['line', 'dline'], ['arrow', 'darrow'], ['ell', 'dcirc'], ['rect', 'dbox'], ['erase', 'derase']].map(([k, l]) => '<button class="chip" data-tool="' + k + '">' + tr(l) + '</button>').join('') + '</div>' +
      '<div class="chips" style="justify-content:center"><button class="chip" data-a="col"><i class="cdot" style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;background:' + col + '"></i> ' + tr('fill') + '</button><button class="chip" data-a="glow">' + tr('glow') + '</button><button class="chip" data-a="undo">' + tr('undop') + '</button><button class="chip" data-a="clr">' + tr('dclear') + '</button></div>' +
      '<div class="chips" style="justify-content:center">' + [['pen', 'Pen', 'पेन'], ['pencil', 'Pencil', 'पेंसिल'], ['marker', 'Marker', 'मार्कर'], ['hl', 'Highlighter', 'हाइलाइटर'], ['chalk', 'Chalk', 'चॉक'], ['neon', 'Neon', 'नियॉन'], ['cal', 'Calligraphy', 'कैलिग्राफी']].map(([k, e, h]) => '<button class="chip" data-brush="' + k + '">' + L2(e, h) + '</button>').join('') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:2px 6px"><span class="mut" style="font-size:12px;min-width:70px">' + tr('glow') + '</span><input type="range" min="0" max="80" step="1" value="0" data-a="gl" style="flex:1"><button class="chip" data-a="gcol" style="padding:4px 8px"><i class="cdot gcd" style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle;background:' + col + '"></i></button></div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:2px 6px"><span class="mut" style="font-size:12px;min-width:70px">' + L2('Opacity', 'ओपेसिटी') + '</span><input type="range" min="10" max="100" step="5" value="100" data-a="op" style="flex:1"></div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:2px 6px"><span class="mut" style="font-size:12px;min-width:70px">' + tr('lwidth') + '</span><input type="range" min="2" max="60" step="1" value="' + lw + '" data-a="lw" style="flex:1"></div>' +
      '<div class="row2" style="margin-top:8px"><button class="btn" data-a="ok">' + tr('ok') + '</button></div></div>';
    document.body.appendChild(root);
    const cv = root.querySelector('canvas'), dp = Math.min(2, window.devicePixelRatio || 1), asp = P.w / P.h, cw = Math.round(Math.min(innerWidth - 24, innerHeight * 0.46 * asp)), ch = Math.round(cw / asp);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.width = Math.round(cw * dp); cv.height = Math.round(ch * dp); cv.style.touchAction = 'none';
    const g0 = cv.getContext('2d'), NW = cv.width, NH = cv.height, S = NW / P.w, lay = document.createElement('canvas'); lay.width = NW; lay.height = NH; const g = lay.getContext('2d');
    const bgc = document.createElement('canvas'); bgc.width = NW; bgc.height = NH; try { renderTo(bgc.getContext('2d'), NW, NH, E.t, { cam: CAMD }); } catch (er) { }
    const all = () => cur ? strokes.concat([cur]) : strokes;
    const draw = () => {
      g0.clearRect(0, 0, NW, NH); g0.drawImage(bgc, 0, 0); g0.fillStyle = 'rgba(0,0,0,.18)'; g0.fillRect(0, 0, NW, NH); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, NW, NH);
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = lw * S; g.strokeStyle = col; if (glow) { g.shadowColor = gcol || col; g.shadowBlur = glow * S; }
      all().forEach((s, si) => { const pl = drawPath(s); if (pl.length < 2) return; if (s.b === 'erase') { g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = s.w * S; g.shadowBlur = 0; g.beginPath(); pl.forEach((p, k) => k ? g.lineTo(p[0] * NW, p[1] * NH) : g.moveTo(p[0] * NW, p[1] * NH)); g.stroke(); g.restore(); return; } if (s.b && s.b !== 'pen') { brushStroke(g, pl.map(p => [p[0] * NW, p[1] * NH]), s.b, s.c, s.w * S, s.op, si); return; } g.save(); g.strokeStyle = s.c; g.lineWidth = s.w * S; g.globalAlpha = s.op; g.beginPath(); pl.forEach((p, k) => k ? g.lineTo(p[0] * NW, p[1] * NH) : g.moveTo(p[0] * NW, p[1] * NH)); g.stroke(); g.restore();
        if (s.k === 'arrow') { const a = pl[pl.length - 2], b = pl[pl.length - 1], an = Math.atan2((b[1] - a[1]) * NH, (b[0] - a[0]) * NW), L = lw * S * 3.4; g.save(); g.translate(b[0] * NW, b[1] * NH); g.rotate(an); g.fillStyle = col; g.beginPath(); g.moveTo(L * 0.4, 0); g.lineTo(-L * 0.8, -L * 0.62); g.lineTo(-L * 0.8, L * 0.62); g.closePath(); g.fill(); g.restore(); } });
      g.restore(); g0.drawImage(lay, 0, 0);
      root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool && !(tool === 'pen' && brush !== 'pen'))); root.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('on', tool === 'pen' && b.dataset.brush === brush)); root.querySelector('[data-a=glow]').classList.toggle('on', !!glow);
    };
    const pp = ev => { const r = cv.getBoundingClientRect(); return [clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)]; };
    cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); const p = pp(ev); cur = { k: tool === 'erase' ? 'pen' : tool, pts: [p, p.slice()], b: tool === 'erase' ? 'erase' : tool === 'pen' ? brush : 'pen', c: col, w: tool === 'erase' ? lw * 1.6 : lw, op }; draw(); });
    cv.addEventListener('pointermove', ev => { if (!cur) return; const p = pp(ev); if (cur.k === 'pen') { const l = cur.pts[cur.pts.length - 1]; if (Math.hypot((p[0] - l[0]) * NW, (p[1] - l[1]) * NH) > 3 * dp) cur.pts.push(p); } else cur.pts[1] = p; draw(); });
    const up = () => { if (!cur) return; if (cur.k === 'pen' && cur.pts.length > 3) { const q = cur.pts, n = [q[0]]; for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } n.push(q[q.length - 1]); cur.pts = n; } strokes.push(cur); cur = null; draw(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { cur = null; draw(); });
    root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { tool = b.dataset.tool; draw(); });
    root.querySelectorAll('[data-brush]').forEach(b => b.onclick = () => { brush = b.dataset.brush; tool = 'pen'; draw(); });
    root.querySelector('[data-a=op]').oninput = e => { op = +e.target.value / 100; };
    root.querySelector('[data-a=col]').onclick = () => pickColor(col, c => { col = c || col; root.querySelector('.cdot').style.background = col; draw(); });
    root.querySelector('[data-a=glow]').onclick = () => { glow = glow ? 0 : Math.round(lw * 1.8); gman = false; const gs = root.querySelector('[data-a=gl]'); if (gs) gs.value = glow; draw(); };
    root.querySelector('[data-a=gl]').oninput = e => { glow = +e.target.value; gman = true; draw(); };
    root.querySelector('[data-a=gcol]').onclick = () => pickColor(gcol || col, c => { gcol = c; root.querySelector('.gcd').style.background = c; draw(); });
    root.querySelector('[data-a=undo]').onclick = () => { strokes.pop(); draw(); };
    root.querySelector('[data-a=clr]').onclick = () => { strokes.length = 0; draw(); };
    root.querySelector('[data-a=lw]').oninput = e => { lw = +e.target.value; if (glow && !gman) glow = Math.round(lw * 1.8); draw(); };
    root.querySelector('[data-x=back]').onclick = () => root.remove();
    root.querySelector('[data-a=ok]').onclick = () => {
      if (!strokes.some(s => s.b !== 'erase')) return root.remove();
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0; strokes.forEach(s => drawPath(s).forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
      const pad = lw * 3.6 + glow * 1.6 + 24, wx0 = (x0 - 0.5) * P.w - pad, wx1 = (x1 - 0.5) * P.w + pad, wy0 = (y0 - 0.5) * P.h - pad, wy1 = (y1 - 0.5) * P.h + pad, w = Math.max(60, wx1 - wx0), h = Math.max(60, wy1 - wy0);
      const norm = strokes.map(s => ({ k: s.k, b: s.b, c: s.c, w: s.w, op: s.op, pts: s.pts.map(p => [((p[0] - 0.5) * P.w - wx0) / w, ((p[1] - 0.5) * P.h - wy0) / h]) }));
      const o = newObj('draw', { name: nextName(tr('draw')), strokes: norm, col, gc: gcol || col, lw, glow, dash: 0, fillc: null, fo: 0.4, sv: 1, dr: { on: false, delay: 0, dur: 1.2 }, w: Math.round(w), h: Math.round(h), x: Math.round((wx0 + wx1) / 2), y: Math.round((wy0 + wy1) / 2) });
      layerTimes(o); root.remove(); addObj(o);
    };
    draw();
  }
};

/* ===== effect panel helpers: join-transition rows, curve, copy / paste of keyframes + curve ===== */
const L2 = (a, b) => (typeof LANG !== 'undefined' && LANG === 'hi' ? b : a);
function tjRows(box, o) {
  const j = o.tj, h = document.createElement('p'); h.className = 'pgh'; h.textContent = L2('Transition', 'ट्रांज़िशन') + ' — ' + ((TRD[j.id] && TRD[j.id].n) || j.id); box.appendChild(h);
  const b = document.createElement('div'); b.className = 'efb'; box.appendChild(b);
  slider(b, L2('Duration (s)', 'समय (s)'), 0.1, 2, 0.05, () => j.d || 0.8, v => { j.d = v; });
  slider(b, L2('Edge softness', 'किनारा नरम'), 0, 100, 1, () => (j.soft == null ? 15 : j.soft), v => { j.soft = v; }, '%');
  const c = document.createElement('div'); c.className = 'chips';
  c.innerHTML = '<button class="chip on" data-x="c">' + ic('curve', 16) + ' ' + L2('Speed curve', 'रफ़्तार का वक्र') + '</button><button class="chip" data-x="t">' + L2('Change', 'बदलो') + '</button><button class="chip" data-x="r">' + L2('Remove', 'हटाओ') + '</button>';
  c.querySelector('[data-x=c]').onclick = () => { if (o.lock) return toast(tr('unlocked')); j.ce = j.ce || {}; document.body.appendChild(Curve.open(o, j.ce, () => changedHook())); };
  c.querySelector('[data-x=t]').onclick = () => TransSheet.open(o);
  c.querySelector('[data-x=r]').onclick = () => { pushUndo(); delete o.tj; changed('struct'); render(); rb(); };
  b.appendChild(c);
}
function fxFocusEff(o) { const l = (o.efx || []).filter(e => FXD[e.k] && (FXD[e.k].P || []).length); return l.find(e => e.id === S.fxFocus) || l[0] || null; }
function fxNumKeys(e) { return (FXD[e.k].P || []).filter(sp => sp.c == null && sp.str == null && sp.b == null && !sp.opts).map(sp => sp.k); }
const fxvHooks = {
  begin() { pushUndo(); }, changed() { changedHook(); }, toast,
  act(a) {
    const o = selObj(); if (!o) return;
    if (a === 'back') { S.panel = null; renderBottom(); return; }
    if (o.lock) return toast(tr('unlocked'));
    const e = fxFocusEff(o);
    if (a === 'key') {
      if (!e) return toast(L2('Add an effect first', 'पहले इफेक्ट जोड़ो'));
      const ks = fxNumKeys(e), any = ks.some(k => fxKeyAt(e, k) >= 0);
      pushUndo(); ks.forEach(k => { if (any === (fxKeyAt(e, k) >= 0)) fxToggleKey(e, k); }); changedHook(); rb();
    } else if (a === 'curve') {
      if (e && /^tr_/.test(e.k)) { e.ce = e.ce || {}; document.body.appendChild(Curve.open(o, e.ce, () => changedHook())); return; }
      if (e) {
        const keys = fxNumKeys(e).filter(k => e.kf && e.kf[k] && e.kf[k].length > 1);
        if (keys.length) {
          const segs = keys.map(k => { const kf = e.kf[k]; let i = 0; for (let j = 0; j < kf.length - 1; j++) if (kf[j].t <= E.t + EPS) i = j; return kf[i]; }), f = segs[0], px = {};
          Object.defineProperty(px, 'e', { get: () => f.e || EASES.lin, set: v => segs.forEach(x => { x.e = v; }) });
          Object.defineProperty(px, 'a', { get: () => f.a || null, set: v => segs.forEach(x => { x.a = v; }) });
          const all = []; keys.forEach(k => e.kf[k].forEach(x => all.push(x)));
          document.body.appendChild(Curve.open({ kf: all }, px, () => changedHook())); return;
        }
      }
      if (o.tj) { o.tj.ce = o.tj.ce || {}; document.body.appendChild(Curve.open(o, o.tj.ce, () => changedHook())); return; }
      toast(tr('keyfirst'));
    } else if (a === 'more') {
      listSheet('', [
        { icon: 'copy', label: L2('Copy keyframes & curve', 'कीफ्रेम और वक्र कॉपी'), fn: () => { if (!e) return toast(L2('Add an effect first', 'पहले इफेक्ट जोड़ो')); S.fxClip = { k: e.k, p: jcopy(e.p || {}), ce: e.ce ? jcopy(e.ce) : null, kf: jcopy(e.kf || {}), t0: o.t0 }; toast(L2('Copied', 'कॉपी हो गया')); } },
        { icon: 'plus', label: L2('Paste keyframes & curve', 'पेस्ट करो'), fn: () => fxPasteClip(o, e) },
        { icon: 'trash', label: L2('Clear keyframes', 'कीफ्रेम हटाओ'), fn: () => { if (!e) return; pushUndo(); delete e.kf; changedHook(); rb(); } },
        { icon: 'rotate', label: tr('reset'), fn: () => { if (!e) return; pushUndo(); const n = fxNew(e.k); e.p = n.p; delete e.kf; delete e.ce; changedHook(); rb(); } }]);
    }
  }
};
function fxPasteClip(o, e) {
  const c = S.fxClip; if (!c) return toast(L2('Nothing copied', 'कुछ कॉपी नहीं है'));
  if (!e) return toast(L2('Add an effect first', 'पहले इफेक्ट जोड़ो'));
  pushUndo(); const keys = new Set((FXD[e.k].P || []).map(q => q.k)), dt = o.t0 - c.t0;
  Object.keys(c.p || {}).forEach(k => { if (keys.has(k) && typeof c.p[k] === typeof (e.p || {})[k]) { e.p = e.p || {}; e.p[k] = c.p[k]; } });
  Object.keys(c.kf || {}).forEach(k => { if (keys.has(k)) { e.kf = e.kf || {}; e.kf[k] = c.kf[k].map(x => Object.assign({}, x, { t: Math.max(o.t0, x.t + dt) })); } });
  if (c.ce) e.ce = jcopy(c.ce);
  changedHook(); rb();
}

/* ---- draw a region (and its pin) with the finger, for Head Bob / Sway Part ---- */
function regRows(b, e, o) {
  const has = e.reg && e.reg.pts && e.reg.pts.length > 2, c = document.createElement('div'); c.className = 'chips';
  c.innerHTML = '<button class="chip on" data-x="d">✏ ' + L2('Draw part', 'हिस्सा बनाओ') + '</button><button class="chip" data-x="p">📍 ' + L2('Pin', 'पिन') + '</button>' + (has ? '<button class="chip" data-x="c">' + L2('Clear part', 'हिस्सा हटाओ') + '</button>' : '');
  c.querySelector('[data-x=d]').onclick = () => RegionEd.open(o, e, 'draw');
  c.querySelector('[data-x=p]').onclick = () => { if (!has) return toast(L2('Draw the part first', 'पहले हिस्सा बनाओ')); RegionEd.open(o, e, 'pin'); };
  const cl = c.querySelector('[data-x=c]'); if (cl) cl.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); delete e.reg; e._rm = null; changedHook(); rb(); };
  b.appendChild(c);
  const m = document.createElement('p'); m.className = 'pgh'; m.style.textTransform = 'none'; m.textContent = has ? L2('Part drawn ✓', 'हिस्सा बना ✓') + (e.reg.pin ? ' · ' + L2('pin set', 'पिन लगा') : ' · ' + L2('set a pin (optional)', 'पिन लगाओ (वैकल्पिक)')) : (e.k === 'sway' ? L2('Draw the part that should wave (skirt, hair, cape)', 'जो हिस्सा लहराना है वह बनाओ (स्कर्ट, बाल, केप)') : L2('No part drawn: the top of the picture moves', 'हिस्सा नहीं बना: चित्र का ऊपरी भाग हिलेगा')); b.appendChild(m);
}
const RegionEd = {
  open(o, e, mode0) {
    if (o.lock) return toast(tr('unlocked'));
    let mode = mode0 || 'draw', cur = null, anim = 0, ra = 0; const tp = () => clamp(E.t, o.t0, Math.max(o.t0 + 0.01, endOf(o) - 0.01));
    const sh = edShell(L2('Draw part', 'हिस्सा बनाओ'), () => { pushUndo(); delete e.reg; e._rm = null; changedHook(); draw(); build(); }, () => { cancelAnimationFrame(ra); e._ed = false; S.inEd = null; S.edDraw = null; renderBottom(); render(); });
    e._ed = true; const g = sh.pv.getContext('2d'), W = sh.pv.width, H = sh.pv.height, body = sh.body; let t0 = performance.now();
    const box = () => trBox({ o, W, H }), toN = ev => { const r = sh.pv.getBoundingClientRect(), b = box(); return [clamp(((ev.clientX - r.left) * W / r.width - b.bx) / b.bw, 0, 1), clamp(((ev.clientY - r.top) * H / r.height - b.by) / b.bh, 0, 1)]; };
    const draw = () => {
      renderTo(g, W, H, anim ? o.t0 + ((performance.now() - t0) / 1000) % 4 : tp(), { only: [o.id], cam: CAMD }); if (anim) return;
      const b = box(), R = e.reg, P = cur || (R && R.pts); const X = q => b.bx + q[0] * b.bw, Y = q => b.by + q[1] * b.bh;
      if (P && P.length > 1) { g.save(); g.beginPath(); P.forEach((q, k) => k ? g.lineTo(X(q), Y(q)) : g.moveTo(X(q), Y(q))); if (!cur) g.closePath(); g.fillStyle = 'rgba(236,72,153,.22)'; if (!cur) g.fill(); g.strokeStyle = '#ec4899'; g.lineWidth = 2.5; g.setLineDash([8, 5]); g.stroke(); g.restore(); }
      if (R && R.pin) { const x = X(R.pin), y = Y(R.pin); g.save(); g.fillStyle = '#fff'; g.strokeStyle = '#7c3aed'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.moveTo(x, y - 14); g.lineTo(x, y + 14); g.stroke(); g.restore(); }
    };
    S.edDraw = draw;
    const loop = () => { if (!anim) return; draw(); ra = requestAnimationFrame(loop); };
    const build = () => {
      const sc = body.scrollTop; body.innerHTML = ''; S.inEd = build;
      const c = document.createElement('div'); c.className = 'chips'; c.style.justifyContent = 'center';
      c.innerHTML = '<button class="chip' + (mode === 'draw' && !anim ? ' on' : '') + '" data-m="draw">✏ ' + L2('Draw part', 'हिस्सा बनाओ') + '</button><button class="chip' + (mode === 'pin' && !anim ? ' on' : '') + '" data-m="pin">📍 ' + L2('Pin', 'पिन') + '</button><button class="chip' + (anim ? ' on' : '') + '" data-m="play">▶ ' + L2('Preview motion', 'चलाकर देखो') + '</button>';
      c.querySelectorAll('[data-m]').forEach(bt => bt.onclick = () => { const m = bt.dataset.m; if (m === 'play') { anim = anim ? 0 : 1; e._ed = !anim; t0 = performance.now(); if (anim) loop(); else { cancelAnimationFrame(ra); draw(); } } else { mode = m; anim = 0; e._ed = true; cancelAnimationFrame(ra); } build(); draw(); });
      body.appendChild(c);
      const hp = document.createElement('p'); hp.className = 'mut'; hp.style.cssText = 'font-size:12px;margin:6px 4px'; hp.textContent = mode === 'draw' ? L2('Draw around the part with your finger (it closes by itself).', 'उंगली से उस हिस्से के चारों तरफ़ घेरा खींचो (अपने-आप बंद हो जाएगा)।') : L2('Tap the spot that should stay fixed (waist / neck / shoulder).', 'जहाँ से हिस्सा टिका रहे वहाँ टैप करो (कमर / गर्दन / कंधा)।'); body.appendChild(hp);
      fxParamRows(body, e, o); body.scrollTop = sc;
    };
    sh.pv.style.touchAction = 'none';
    sh.pv.addEventListener('pointerdown', ev => { if (anim) return; if (mode === 'draw') { cur = [toN(ev)]; sh.pv.setPointerCapture(ev.pointerId); draw(); } else if (e.reg) { pushUndo(); e.reg.pin = toN(ev); changedHook(); draw(); build(); } });
    sh.pv.addEventListener('pointermove', ev => { if (!cur) return; const q = toN(ev), l = cur[cur.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.012) { cur.push(q); draw(); } });
    const up = () => { if (!cur) return; const pts = cur; cur = null; if (pts.length >= 4) { pushUndo(); e.reg = { pts, pin: e.reg && e.reg.pin || null }; e._rm = null; mode = 'pin'; changedHook(); } draw(); build(); };
    sh.pv.addEventListener('pointerup', up); sh.pv.addEventListener('pointercancel', up);
    build(); draw();
  }
};

/* ---- Text tab: time slider + Pad (size / move / glow / keyframe / curve) + animated colour & border ---- */
function textTop(body, o, sh) {
  const a = o.t0, b = Math.max(o.t0 + 0.1, endOf(o)), d = document.createElement('div'); d.className = 'rng';
  d.innerHTML = '<span>' + L2('Time', 'समय') + '</span><input type="range" min="' + a + '" max="' + b + '" step="0.02" value="' + clamp(E.t, a, b) + '"><em style="min-width:44px;text-align:right">' + clamp(E.t, a, b).toFixed(2) + 's</em>';
  const r = d.querySelector('input'), em = d.querySelector('em'); r.oninput = () => { E.t = +r.value; em.textContent = (+r.value).toFixed(2) + 's'; render(); if (S.edDraw) S.edDraw(); try { TL.setSel(); } catch (er) {} };
  body.appendChild(d);
  const pd = document.createElement('div'); pd.className = 'pad'; body.appendChild(pd);
  Pad.mount(pd, Object.assign({}, padHooks, { act: a2 => a2 === 'back' ? sh.close() : padHooks.act(a2) }));
}
function textAnim(p, T, o) {
  const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
  const tkAt = k => ((T.tk && T.tk[k]) || []).findIndex(q => Math.abs(q.t - E.t) < 0.02), curV = k => { const v = T.tk && T.tk[k] ? kfVal(T.tk[k], E.t) : undefined; return v === undefined ? T[k] : v; };
  const setV = (k, v) => { if (o.lock) return; if (T.tk && T.tk[k] && T.tk[k].length) { const i = tkAt(k); if (i >= 0) T.tk[k][i].v = v; else { T.tk[k].push({ t: E.t, v }); T.tk[k].sort((x, y) => x.t - y.t); } } else T[k] = v; };
  const toggle = k => { if (o.lock) return toast(tr('unlocked')); pushUndo(); T.tk = T.tk || {}; const L = T.tk[k] = T.tk[k] || [], i = tkAt(k); if (i >= 0) { L.splice(i, 1); if (!L.length) delete T.tk[k]; if (!Object.keys(T.tk).length) delete T.tk; } else { L.push({ t: E.t, v: curV(k) }); L.sort((x, y) => x.t - y.t); } changedHook(); rb(); };
  const dia = (k, host) => { const b = document.createElement('button'); const has = T.tk && T.tk[k] && T.tk[k].length; b.className = 'chip' + (tkAt(k) >= 0 ? ' on' : ''); b.style.cssText = 'padding:2px 9px;margin-left:6px'; b.textContent = has ? '◆' : '◇'; b.onclick = () => toggle(k); host.appendChild(b); };
  lab(L2('Animate text (key ◇ at the time above)', 'टेक्स्ट एनिमेशन (ऊपर के समय पर ◇ दबाओ)'));
  // size & glow come from the Pad pose
  slider(p, L2('Size %', 'साइज़ %'), 10, 600, 1, () => Math.round(poseOf(o, E.t).sx * 100), v => { setPose(o, { sx: v / 100, sy: v / 100 }, E.t); });
  slider(p, tr('glow'), 0, 80, 1, () => poseOf(o, E.t).gl, v => setPose(o, { gl: v }, E.t));
  const sbw = slider(p, tr('border'), 0, 40, 1, () => curV('bw') || 0, v => setV('bw', v)); dia('bw', p.lastChild);
  const cr = (k, label, none) => { const w = document.createElement('div'); w.className = 'crow'; w.innerHTML = '<span>' + label + '</span>'; p.appendChild(w); const sw = document.createElement('div'); sw.className = 'sw'; sw.innerHTML = COLORS.map(c => '<i data-c="' + c + '" class="' + (c === curV(k) ? 'on' : '') + '" style="background:' + c + '"></i>').join(''); w.appendChild(sw); sw.querySelectorAll('i').forEach(i => i.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); setV(k, i.dataset.c); changedHook(); rb(); }); dia(k, w); };
  cr('fill', tr('fill')); cr('bc', L2('Border colour', 'बॉर्डर रंग'));
  const c = document.createElement('div'); c.className = 'chips';
  const any = T.tk && Object.keys(T.tk).length;
  c.innerHTML = '<button class="chip" data-x="c">' + ic('curve', 16) + ' ' + L2('Curve', 'वक्र') + '</button><button class="chip" data-x="cp">' + L2('Copy anim', 'एनिम कॉपी') + '</button><button class="chip" data-x="ps">' + L2('Paste anim', 'एनिम पेस्ट') + '</button>' + (any ? '<button class="chip" data-x="cl">' + L2('Clear anim', 'एनिम हटाओ') + '</button>' : '');
  c.querySelector('[data-x=c]').onclick = () => {
    const ks = Object.keys(T.tk || {}).filter(k => T.tk[k].length > 1); if (!ks.length) return toast(L2('Add 2 keys first', 'पहले 2 की लगाओ'));
    const segs = ks.map(k => { const L = T.tk[k]; let i = 0; for (let j = 0; j < L.length - 1; j++) if (L[j].t <= E.t + 0.02) i = j; return L[i]; }), f = segs[0], px = {};
    Object.defineProperty(px, 'e', { get: () => f.e || EASES.lin, set: v => segs.forEach(x => { x.e = v; }) }); Object.defineProperty(px, 'a', { get: () => f.a || null, set: v => segs.forEach(x => { x.a = v; }) });
    const all = []; ks.forEach(k => T.tk[k].forEach(x => all.push(x))); document.body.appendChild(Curve.open({ kf: all }, px, () => changedHook()));
  };
  c.querySelector('[data-x=cp]').onclick = () => { S.tkClip = { tk: jcopy(T.tk || {}), t0: o.t0 }; toast(L2('Copied', 'कॉपी हो गया')); };
  c.querySelector('[data-x=ps]').onclick = () => { if (!S.tkClip) return toast(L2('Nothing copied', 'कुछ कॉपी नहीं है')); if (o.lock) return toast(tr('unlocked')); pushUndo(); const dt = o.t0 - S.tkClip.t0; T.tk = jcopy(S.tkClip.tk); Object.keys(T.tk).forEach(k => T.tk[k].forEach(x => { x.t += dt; })); changedHook(); rb(); };
  const cl = c.querySelector('[data-x=cl]'); if (cl) cl.onclick = () => { pushUndo(); delete T.tk; changedHook(); rb(); };
  p.appendChild(c);
}
