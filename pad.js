'use strict';
/* ===== Pad: Move & Transform (like Alight Motion) ===== */
const Pad = {
  el: null, mode: 'move', link: true, hooks: null,
  mount(el, hooks) {
    this.el = el; this.hooks = hooks;
    el.innerHTML =
      '<div class="pl">' +
      '<button class="pb" data-a="back">' + ic('back', 20) + '</button>' +
      '<button class="pb" data-a="key">' + ic('key', 20) + '</button>' +
      '<button class="pb" data-a="curve">' + ic('curve', 20) + '</button>' +
      '<button class="pb" data-a="more">' + ic('dots', 20) + '</button></div>' +
      '<div class="pm"><div class="nums"></div><div class="surf"><div class="dial"><i></i></div><div class="hint"></div></div></div>' +
      '<div class="pr">' +
      '<button class="pb" data-m="move">' + ic('move', 20) + '<small>XY</small></button>' +
      '<button class="pb" data-m="depth">' + ic('depth', 20) + '<small>Z</small></button>' +
      '<button class="pb" data-m="rot">' + ic('rotate', 20) + '<small>' + '↻' + '</small></button>' +
      '<button class="pb" data-m="scale">' + ic('scale', 20) + '<small>W·H</small></button></div>';
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => hooks.act(b.dataset.a));
    el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { this.mode = b.dataset.m; this.draw(); });
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
    else n.innerHTML = this.box('x', 'X') + this.box('y', 'Y') + this.box('z', 'Z');
    n.querySelectorAll('input').forEach(i => {
      i.onchange = () => this.typed(i.dataset.k, parseFloat(i.value));
      i.onfocus = () => i.select();
    });
    const lk = n.querySelector('[data-lk]'); if (lk) lk.onclick = () => { this.link = !this.link; this.draw(); };
    this.el.querySelector('.hint').innerHTML = ic({ move: 'move', depth: 'depth', rot: 'rotate', scale: 'scale' }[this.mode], 46);
    this.refresh();
  },
  box(k, label) { return '<label class="nb ' + (this.mode === 'depth' && k === 'z' ? 'act' : '') + '"><span>' + label + '</span><input data-k="' + k + '" inputmode="decimal" type="text"></label>'; },
  refresh() {
    if (!this.el) return;
    const o = selObj(); if (!o) return;
    const p = poseOf(o, E.t), vals = { x: p.x, y: p.y, z: p.z, rot: p.rot, w: p.sx * 100, h: p.sy * 100 };
    this.el.querySelectorAll('.nums input').forEach(i => {
      if (document.activeElement === i) return;
      i.value = String(Math.round(vals[i.dataset.k] * 10) / 10);
    });
    this.el.querySelector('[data-a=key]').classList.toggle('on', !!keyAt(o, E.t));
    this.el.classList.toggle('locked', !!o.lock);
    const dial = this.el.querySelector('.dial'); dial.style.transform = 'rotate(' + p.rot + 'deg)';
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
      const o = selObj(); if (!o) return;
      if (o.lock) { this.hooks.toast(tr('unlocked')); return; }
      const r = surf.getBoundingClientRect();
      g = { o, x0: e.clientX, y0: e.clientY, p0: poseOf(o, E.t), K: E.P.w / r.width, began: false, r,
        a0: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)), lastA: 0, tot: 0, ox: 0, oy: 0 };
      g.lastA = g.a0;
      surf.setPointerCapture(e.pointerId); e.preventDefault();
    });
    surf.addEventListener('pointermove', e => {
      if (!g) return;
      if (!g.began) { this.hooks.begin(); g.began = true; }
      const o = g.o, dx = e.clientX - g.x0, dy = e.clientY - g.y0, p0 = g.p0, m = self.mode;
      let ch = {};
      if (m === 'move') {
        const [lx, ly] = self.localDelta(o, dx * g.K, dy * g.K);
        ch = { x: p0.x + lx, y: p0.y + ly };
      } else if (m === 'depth') {
        ch = { z: p0.z - dy * 3 };
      } else if (m === 'rot') {
        const a = Math.atan2(e.clientY - (g.r.top + g.r.height / 2), e.clientX - (g.r.left + g.r.width / 2));
        let da = a - g.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        g.tot += da; g.lastA = a; ch = { rot: p0.rot + g.tot / D2R };
      } else if (m === 'scale') {
        if (self.link) { const f = Math.max(0.02, 1 + (dx - dy) * 0.004); ch = { sx: p0.sx * f, sy: p0.sy * f }; }
        else ch = { sx: Math.max(0.02, p0.sx * (1 + dx * 0.004)), sy: Math.max(0.02, p0.sy * (1 - dy * 0.004)) };
      }
      setPose(o, ch, E.t);
      surf.style.backgroundPosition = (dx % 24) + 'px ' + (dy % 24) + 'px';
      self.hooks.changed(); self.refresh();
    });
    const end = () => { g = null; };
    surf.addEventListener('pointerup', end); surf.addEventListener('pointercancel', end);
  }
};

/* ===== Speed-curve editor ===== */
const Curve = {
  open(o, k, done) {
    const names = ['lin', 'ease', 'easein', 'easeout', 'easeio', 'back', 'snap'];
    let e = (k.e || DEF_EASE).slice();
    const S = 220, pad = 24, W = S + pad * 2;
    const root = document.createElement('div'); root.className = 'curve';
    root.innerHTML = '<div class="cvbox"><svg viewBox="0 0 ' + W + ' ' + W + '" width="' + W + '" height="' + W + '"><rect x="' + pad + '" y="' + pad + '" width="' + S + '" height="' + S + '" class="cf"/>' +
      '<line id="h1" class="hl"/><line id="h2" class="hl"/><path id="cp" class="cp"/><circle id="c1" r="11" class="hc"/><circle id="c2" r="11" class="hc"/></svg>' +
      '<div class="cvv"></div></div><div class="presets">' + names.map(n => '<button data-n="' + n + '">' + tr(n) + '</button>').join('') + '</div>' +
      '<div class="row2"><button class="btn ghost" data-x="all">' + tr('applyall') + '</button><button class="btn" data-x="ok">' + tr('ok') + '</button></div>';
    const X = v => pad + v * S, Y = v => pad + (1 - v) * S;
    const q = s => root.querySelector(s);
    const upd = () => {
      q('#cp').setAttribute('d', 'M' + X(0) + ' ' + Y(0) + ' C' + X(e[0]) + ' ' + Y(e[1]) + ' ' + X(e[2]) + ' ' + Y(e[3]) + ' ' + X(1) + ' ' + Y(1));
      q('#c1').setAttribute('cx', X(e[0])); q('#c1').setAttribute('cy', Y(e[1]));
      q('#c2').setAttribute('cx', X(e[2])); q('#c2').setAttribute('cy', Y(e[3]));
      for (const [id, a, b, c, d] of [['#h1', X(0), Y(0), X(e[0]), Y(e[1])], ['#h2', X(1), Y(1), X(e[2]), Y(e[3])]]) { const l = q(id); l.setAttribute('x1', a); l.setAttribute('y1', b); l.setAttribute('x2', c); l.setAttribute('y2', d); }
      q('.cvv').textContent = 'cubic-bezier(' + e.map(v => Math.round(v * 100) / 100).join(', ') + ')';
      root.querySelectorAll('.presets button').forEach(b => { const p = EASES[b.dataset.n]; b.classList.toggle('on', p.every((v, i) => Math.abs(v - e[i]) < 0.005)); });
    };
    ['#c1', '#c2'].forEach((id, n) => {
      const c = q(id), svg = q('svg');
      c.addEventListener('pointerdown', ev => { c.setPointerCapture(ev.pointerId); c._d = true; ev.preventDefault(); });
      c.addEventListener('pointermove', ev => {
        if (!c._d) return;
        const r = svg.getBoundingClientRect(), s = W / r.width;
        const vx = clamp(((ev.clientX - r.left) * s - pad) / S, 0, 1), vy = clamp(1 - ((ev.clientY - r.top) * s - pad) / S, -0.6, 1.6);
        e[n * 2] = vx; e[n * 2 + 1] = vy; upd();
      });
      c.addEventListener('pointerup', () => { c._d = false; });
    });
    root.querySelectorAll('.presets button').forEach(b => b.onclick = () => { e = EASES[b.dataset.n].slice(); upd(); });
    q('[data-x=ok]').onclick = () => { k.e = e.slice(); root.remove(); done(false); };
    q('[data-x=all]').onclick = () => { o.kf.forEach(x => { x.e = e.slice(); }); root.remove(); done(true); };
    upd();
    return root;
  }
};
