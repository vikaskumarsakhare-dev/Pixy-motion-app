'use strict';
/* ===== Pinch helper: two fingers = resize + turn (+ move) ===== */
function Pinch(opt) { this.pts = new Map(); this.on = false; this.opt = opt; this.s = null; }
Pinch.prototype.down = function (e) {
  this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (this.pts.size === 2) {
    const o = this.opt.obj();
    if (!o || o.lock || o.type === 'camera') { this.on = false; return true; }
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
  const f = d / s.d, ch = { sx: Math.max(0.02, s.p.sx * f), sy: Math.max(0.02, s.p.sy * f), rot: s.p.rot + da / D2R };
  if (this.opt.move) {
    const [lx, ly] = Pad.localDelta(s.o, ((a.x + b.x) / 2 - s.cx) / E.zoom, ((a.y + b.y) / 2 - s.cy) / E.zoom);
    ch.x = s.p.x + lx; ch.y = s.p.y + ly;
  }
  setPose(s.o, ch, E.t); this.opt.apply(); return true;
};
Pinch.prototype.up = function (e) {
  const had = this.on; this.pts.delete(e.pointerId);
  if (this.pts.size < 2) this.on = false;
  return had;
};

/* ===== Left strip shared by Pad / Camera / Effect panels ===== */
function stripHTML() {
  return '<div class="pl">' +
    '<button class="pb" data-a="back">' + ic('back', 20) + '</button>' +
    '<button class="pb" data-a="key">' + ic('key', 20) + '</button>' +
    '<button class="pb" data-a="curve">' + ic('curve', 20) + '</button>' +
    '<button class="pb" data-a="more">' + ic('dots', 20) + '</button></div>';
}
function bindStrip(root, hooks) { root.querySelectorAll('[data-a]').forEach(b => b.onclick = () => hooks.act(b.dataset.a)); }
function refreshStrip() {
  const o = selObj(); if (!o) return;
  document.querySelectorAll('#panel [data-a=key]').forEach(b => b.classList.toggle('on', !!keyAt(o, E.t)));
}
const SNAPS = [0, 45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315, 360];

/* ===== Pad: Move & Transform (like Alight Motion) ===== */
const Pad = {
  el: null, mode: 'move', link: true, hooks: null, pinch: null, lockA: null,
  mount(el, hooks) {
    this.el = el; this.hooks = hooks;
    let ticks = '';
    for (let a = 0; a < 360; a += 15) { const big = a % 90 === 0, r1 = big ? 50 : 54, r2 = 60, rad = a * D2R; ticks += '<line x1="' + (66 + Math.sin(rad) * r1) + '" y1="' + (66 - Math.cos(rad) * r1) + '" x2="' + (66 + Math.sin(rad) * r2) + '" y2="' + (66 - Math.cos(rad) * r2) + '" class="' + (big ? 'tb' : '') + '"/>'; }
    el.innerHTML = stripHTML() +
      '<div class="pm"><div class="nums"></div><div class="surf"><div class="dialw"><div class="arc"></div><svg class="ticks" viewBox="0 0 132 132" width="132" height="132">' + ticks + '</svg><div class="dial"><i></i></div><div class="deg">0°</div></div><div class="hint"></div></div></div>' +
      '<div class="pr">' +
      '<button class="pb" data-m="move">' + ic('move', 20) + '<small>XY</small></button>' +
      '<button class="pb" data-m="depth">' + ic('depth', 20) + '<small>Z</small></button>' +
      '<button class="pb" data-m="rot">' + ic('rotate', 22) + '</button>' +
      '<button class="pb" data-m="scale">' + ic('scale', 20) + '<small>W·H</small></button></div>';
    bindStrip(el, hooks);
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.mode = b.dataset.m; this.draw(); });
    this.pinch = new Pinch({ obj: selObj, move: false, apply: () => { hooks.changed(); this.refresh(); } });
    this.bindSurf(el.querySelector('.surf'));
    this.draw();
  },
  draw() {
    const el = this.el; if (!el) return;
    el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === this.mode));
    el.querySelector('.surf').dataset.mode = this.mode;
    const n = el.querySelector('.nums');
    if (this.mode === 'rot') n.innerHTML = this.box('rot', 'R°');
    else if (this.mode === 'scale') n.innerHTML = this.box('w', tr('w') + '%') + this.box('h', tr('h') + '%') + '<button class="lk' + (this.link ? ' on' : '') + '" data-lk>' + ic('link', 18) + '</button>';
    else if (this.mode === 'depth') n.innerHTML = this.box('z', 'Z') + this.box('s', '⤢%');
    else n.innerHTML = this.box('x', 'X') + this.box('y', 'Y');
    n.querySelectorAll('input').forEach(i => {
      i.onchange = () => this.typed(i.dataset.k, parseFloat(i.value));
      i.onfocus = () => i.select();
    });
    const lk = n.querySelector('[data-lk]'); if (lk) lk.onclick = () => { this.link = !this.link; this.draw(); };
    el.querySelector('.hint').innerHTML = this.mode === 'rot' ? '' : ic({ move: 'move', depth: 'depth', scale: 'scale' }[this.mode], 46);
    this.refresh();
  },
  box(k, label) { return '<label class="nb"><span>' + label + '</span><input data-k="' + k + '" inputmode="decimal" type="text"></label>'; },
  refresh() {
    if (!this.el) return;
    const o = selObj(); if (!o) return;
    const p = poseOf(o, E.t), vals = { x: p.x, y: p.y, z: p.z, rot: p.rot, w: p.sx * 100, h: p.sy * 100, s: p.sx * 100 };
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
    dw.querySelector('.arc').style.background = 'conic-gradient(from 0deg, rgba(236,72,153,.55) 0deg, rgba(139,92,246,.55) ' + m + 'deg, transparent ' + m + 'deg)';
    const d = dw.querySelector('.deg'); d.textContent = Math.round(rot) + '°';
    d.classList.toggle('lock', this.lockA !== null);
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
    } else if (k === 's') {
      const nv = Math.max(0.02, v / 100), f = nv / (p.sx || 1); ch = { sx: nv, sy: p.sy * f };
    } else ch = { [k]: v };
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
      }
      setPose(o, ch, E.t);
      surf.style.backgroundPosition = (dx % 24) + 'px ' + (dy % 24) + 'px';
      self.hooks.changed(); self.refresh();
    });
    const end = e => { self.pinch.up(e); if (self.pinch.pts.size === 0) { g = null; self.lockA = null; self.refresh(); } };
    surf.addEventListener('pointerup', end); surf.addEventListener('pointercancel', end);
  }
};

/* ===== Speed-curve editor ===== */
const Curve = {
  open(o, k, done) {
    const names = ['lin', 'ease', 'easein', 'easeout', 'easeio', 'back', 'snap'];
    let e = (k.e || DEF_EASE).slice();
    const S = 200, pad = 22, W = S + pad * 2;
    const root = document.createElement('div'); root.className = 'curve';
    root.innerHTML = '<div class="cvbox"><svg viewBox="0 0 ' + W + ' ' + W + '" width="' + W + '" height="' + W + '"><rect x="' + pad + '" y="' + pad + '" width="' + S + '" height="' + S + '" class="cf"/>' +
      '<line id="h1" class="hl"/><line id="h2" class="hl"/><path id="cp" class="cp"/><circle id="c1" r="11" class="hc"/><circle id="c2" r="11" class="hc"/><circle id="pd" r="6" class="pdot"/></svg>' +
      '<div class="cnum">' + ['x1', 'y1', 'x2', 'y2'].map((n, i) => '<label><span>' + n + '</span><input data-i="' + i + '" inputmode="decimal"></label>').join('') + '</div>' +
      '<div class="ptrack"><i id="ball"></i></div><button class="btn ghost pv" id="pv">▶ ' + tr('preview') + '</button></div>' +
      '<div class="presets">' + names.map(n => '<button data-n="' + n + '">' + tr(n) + '</button>').join('') + '</div>' +
      '<div class="row2"><button class="btn ghost" data-x="all">' + tr('applyall') + '</button><button class="btn" data-x="ok">' + tr('ok') + '</button></div>';
    const X = v => pad + v * S, Y = v => pad + (1 - v) * S;
    const q = s => root.querySelector(s);
    const r2 = v => Math.round(v * 100) / 100;
    const upd = (skipInputs) => {
      q('#cp').setAttribute('d', 'M' + X(0) + ' ' + Y(0) + ' C' + X(e[0]) + ' ' + Y(e[1]) + ' ' + X(e[2]) + ' ' + Y(e[3]) + ' ' + X(1) + ' ' + Y(1));
      q('#c1').setAttribute('cx', X(e[0])); q('#c1').setAttribute('cy', Y(e[1]));
      q('#c2').setAttribute('cx', X(e[2])); q('#c2').setAttribute('cy', Y(e[3]));
      for (const [id, a, b, c, d] of [['#h1', X(0), Y(0), X(e[0]), Y(e[1])], ['#h2', X(1), Y(1), X(e[2]), Y(e[3])]]) { const l = q(id); l.setAttribute('x1', a); l.setAttribute('y1', b); l.setAttribute('x2', c); l.setAttribute('y2', d); }
      if (!skipInputs) root.querySelectorAll('.cnum input').forEach(i => { i.value = r2(e[+i.dataset.i]); });
      root.querySelectorAll('.presets button').forEach(b => { const p = EASES[b.dataset.n]; b.classList.toggle('on', p.every((v, i) => Math.abs(v - e[i]) < 0.005)); });
    };
    ['#c1', '#c2'].forEach((id, n) => {
      const c = q(id), svg = q('svg');
      c.addEventListener('pointerdown', ev => { c.setPointerCapture(ev.pointerId); c._d = true; ev.preventDefault(); });
      c.addEventListener('pointermove', ev => {
        if (!c._d) return;
        const r = svg.getBoundingClientRect(), s = W / r.width;
        e[n * 2] = clamp(((ev.clientX - r.left) * s - pad) / S, 0, 1); e[n * 2 + 1] = clamp(1 - ((ev.clientY - r.top) * s - pad) / S, -1, 2); upd();
      });
      c.addEventListener('pointerup', () => { c._d = false; });
    });
    root.querySelectorAll('.cnum input').forEach(i => {
      i.onfocus = () => i.select();
      i.onchange = () => { const v = parseFloat(i.value), n = +i.dataset.i; if (!isNaN(v)) { e[n] = (n % 2 === 0) ? clamp(v, 0, 1) : clamp(v, -1, 2); } upd(); };
    });
    root.querySelectorAll('.presets button').forEach(b => b.onclick = () => { e = EASES[b.dataset.n].slice(); upd(); });
    let raf = 0;
    q('#pv').onclick = () => {
      cancelAnimationFrame(raf);
      const f = bezFn(e), t0 = performance.now(), D = 1400, tr0 = q('.ptrack'), ball = q('#ball'), pd = q('#pd');
      const step = now => {
        const u = Math.min(1, (now - t0) / D), v = f(u);
        ball.style.left = 'calc(' + (v * 100) + '% - ' + (v * 22) + 'px)'; pd.setAttribute('cx', X(u)); pd.setAttribute('cy', Y(v));
        if (u < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    q('[data-x=ok]').onclick = () => { cancelAnimationFrame(raf); k.e = e.slice(); root.remove(); done(false); };
    q('[data-x=all]').onclick = () => { cancelAnimationFrame(raf); o.kf.forEach(x => { x.e = e.slice(); }); root.remove(); done(true); };
    upd();
    return root;
  }
};
