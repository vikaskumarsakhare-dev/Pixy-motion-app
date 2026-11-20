/* Pixy Motion - canvas editor (objects, time, touch gestures, undo/redo) */
(function () {
  var FONTS = {
    sans: "'Noto Sans Devanagari','Noto Sans',system-ui,sans-serif",
    serif: "'Noto Serif Devanagari','Noto Serif',Georgia,serif",
    mono: "'Droid Sans Mono',monospace",
    hand: "'Dancing Script','Noto Sans Devanagari',cursive"
  };
  var DEF_COLORS = { circle: '#ff5ca0', rect: '#7c5cff', round: '#ffd60a', tri: '#00c7be', line: '#ffffff' };
  var EASE = {
    linear: function (u) { return u; },
    smooth: function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; },
    'in': function (u) { return u * u * u; },
    out: function (u) { return 1 - Math.pow(1 - u, 3); },
    back: function (u) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
  function ang(a, b) { return Math.atan2(a.y - b.y, a.x - b.x); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function r2(v) { return Math.round(v * 100) / 100; }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function Editor(cv, ov, hooks) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.ov = ov; this.octx = ov.getContext('2d');
    this.hooks = hooks || {};
    this.p = null; this.sel = null; this.imgs = {}; this.t = 0;
    this.hist = []; this.hi = -1;
    this.guides = { x: false, y: false };
    this.ptrs = {}; this.g = null;
    this._bind();
  }
  var P = Editor.prototype;
  Editor.EASES = ['smooth', 'in', 'out', 'back', 'linear'];

  /* ---------- project ---------- */
  P.load = function (p) {
    this.p = p; this.sel = null; this.imgs = {}; this.t = 0;
    if (!p.dur) p.dur = 5;
    this.cv.width = this.ov.width = p.w;
    this.cv.height = this.ov.height = p.h;
    for (var i = 0; i < p.objects.length; i++) {
      var o = p.objects[i];
      if (o.t0 == null) o.t0 = 0;
      if (o.type === 'text') this.measure(o);
    }
    this.hist = [this.snap()]; this.hi = 0;
    this.render();
  };
  P.snap = function () { return JSON.stringify({ bg: this.p.bg, dur: this.p.dur, objects: this.p.objects }); };
  P.restore = function (s) {
    var d = JSON.parse(s);
    this.p.bg = d.bg; this.p.dur = d.dur || 5; this.p.objects = d.objects;
    if (this.sel && !this.byId(this.sel)) this.sel = null;
    if (this.t > this.p.dur) this.t = this.p.dur;
    this.render();
    if (this.hooks.onSelect) this.hooks.onSelect();
    if (this.hooks.onChange) this.hooks.onChange();
  };
  P.commit = function () {
    var s = this.snap();
    if (s === this.hist[this.hi]) return;
    this.hist.length = this.hi + 1;
    this.hist.push(s);
    if (this.hist.length > 80) this.hist.shift();
    this.hi = this.hist.length - 1;
    if (this.hooks.onChange) this.hooks.onChange();
  };
  P.canUndo = function () { return this.hi > 0; };
  P.canRedo = function () { return this.hi < this.hist.length - 1; };
  P.undo = function () { if (this.canUndo()) { this.hi--; this.restore(this.hist[this.hi]); } };
  P.redo = function () { if (this.canRedo()) { this.hi++; this.restore(this.hist[this.hi]); } };

  /* ---------- time ---------- */
  P.setTime = function (t) {
    this.t = clamp(t, 0, this.p.dur);
    this.render();
    if (this.hooks.onTime) this.hooks.onTime(this.t);
  };
  P.setDur = function (d) {
    d = clamp(Math.round(d * 2) / 2, 1, 60);
    this.p.dur = d;
    var a = this.p.objects;
    for (var i = 0; i < a.length; i++) {
      if (a[i].t1 != null && a[i].t1 >= d) a[i].t1 = null;
      if ((a[i].t0 || 0) > d - 0.1) a[i].t0 = Math.max(0, r2(d - 0.5));
    }
    if (this.t > d) this.t = d;
    this.render(); this.commit();
    if (this.hooks.onTime) this.hooks.onTime(this.t);
  };
  P.visible = function (o, t) {
    if (o.vis === false) return false;
    if (t < (o.t0 || 0) - 1e-6) return false;
    return o.t1 == null || t <= o.t1 + 1e-6;
  };
  P.isAnim = function (o) { return !!(o.kf && o.kf.length); };
  P.pose = function (o, t) {
    if (t == null) t = this.t;
    if (!this.isAnim(o)) return { x: o.x, y: o.y, sc: 1, rot: o.rot || 0, op: o.op == null ? 1 : o.op };
    var k = o.kf, n = k.length;
    function cp(a) { return { x: a.x, y: a.y, sc: a.sc, rot: a.rot, op: a.op }; }
    if (t <= k[0].t) return cp(k[0]);
    if (t >= k[n - 1].t) return cp(k[n - 1]);
    for (var i = 0; i < n - 1; i++) {
      if (t <= k[i + 1].t) {
        var a = k[i], b = k[i + 1], u = (t - a.t) / ((b.t - a.t) || 1), e = (EASE[o.ease] || EASE.smooth)(u);
        return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, sc: a.sc + (b.sc - a.sc) * e, rot: a.rot + (b.rot - a.rot) * e, op: a.op + (b.op - a.op) * e };
      }
    }
    return cp(k[n - 1]);
  };
  P.kfAt = function (o, t, create) {
    var k = o.kf;
    for (var i = 0; i < k.length; i++) if (Math.abs(k[i].t - t) < 0.035) return k[i];
    if (!create) return null;
    var q = this.pose(o, t); q.t = r2(t);
    k.push(q); k.sort(function (a, b) { return a.t - b.t; });
    return q;
  };
  P.animate = function () {
    var o = this.selObj(); if (!o || this.isAnim(o)) return;
    var dur = this.p.dur, s = Math.min(this.t, Math.max(0, dur - 1));
    s = Math.max(s, o.t0 || 0); s = Math.min(s, Math.max(0, dur - 0.5));
    var e = Math.min(dur, s + 1);
    var base = { x: o.x, y: o.y, sc: 1, rot: o.rot || 0, op: o.op == null ? 1 : o.op };
    var a = clone(base); a.t = r2(s); var b = clone(base); b.t = r2(e);
    o.kf = [a, b];
    this.setTime(e); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.stopAnim = function () {
    var o = this.selObj(); if (!o || !this.isAnim(o)) return;
    var q = this.pose(o, this.t);
    o.x = q.x; o.y = q.y; o.rot = q.rot; o.op = q.op;
    o.w *= q.sc; o.h *= q.sc;
    if (o.type === 'text') { o.fs *= q.sc; this.measure(o); }
    o.kf = null;
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.hasStopHere = function (o) { return this.isAnim(o) && !!this.kfAt(o, this.t, false); };
  P.toggleStop = function () {
    var o = this.selObj(); if (!o || !this.isAnim(o)) return 'none';
    var k = this.kfAt(o, this.t, false);
    if (k) {
      if (o.kf.length <= 2) return 'min';
      o.kf.splice(o.kf.indexOf(k), 1);
    } else this.kfAt(o, this.t, true);
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
    return 'ok';
  };
  P.setEase = function (e) { var o = this.selObj(); if (!o) return; o.ease = e; this.render(); this.commit(); };
  P.setOpacity = function (v, live) {
    var o = this.selObj(); if (!o) return;
    if (this.isAnim(o)) this.kfAt(o, this.t, true).op = v; else o.op = v;
    this.render();
    if (!live) this.commit();
  };

  /* ---------- objects ---------- */
  P.byId = function (id) {
    var a = this.p.objects;
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  };
  P.selObj = function () { return this.sel ? this.byId(this.sel) : null; };
  P.select = function (id) {
    if (this.sel === id) return;
    this.sel = id; this.renderOv();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P._add = function (o) {
    o.id = window.uid(); o.rot = 0; o.op = 1; o.vis = true; o.flip = false;
    o.t0 = Math.min(Math.round(this.t * 10) / 10, Math.max(0, this.p.dur - 0.5)); o.t1 = null;
    this.p.objects.push(o);
    if (o.type === 'text') this.measure(o);
    this.sel = o.id;
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
    return o;
  };
  P.addImage = function (imgId, w, h) {
    var s = Math.min(this.p.w * 0.7 / w, this.p.h * 0.7 / h);
    return this._add({ type: 'image', img: imgId, x: this.p.w / 2, y: this.p.h / 2, w: w * s, h: h * s });
  };
  P.addText = function (str, font) {
    return this._add({ type: 'text', text: str, font: font || 'sans', fs: Math.round(this.p.w * 0.08), bold: true, color: '#ffffff', x: this.p.w / 2, y: this.p.h / 2, w: 100, h: 100 });
  };
  P.addShape = function (kind) {
    var w = this.p.w, o = { type: 'shape', kind: kind, color: DEF_COLORS[kind] || '#ffffff', x: w / 2, y: this.p.h / 2 };
    if (kind === 'circle') { o.w = w * 0.3; o.h = w * 0.3; }
    else if (kind === 'line') { o.w = w * 0.5; o.h = 14; }
    else if (kind === 'tri') { o.w = w * 0.3; o.h = w * 0.27; }
    else { o.w = w * 0.34; o.h = w * 0.24; }
    return this._add(o);
  };
  P.del = function () {
    var o = this.selObj(); if (!o) return;
    this.p.objects = this.p.objects.filter(function (x) { return x.id !== o.id; });
    this.sel = null; this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.dup = function () {
    var o = this.selObj(); if (!o) return;
    var c = clone(o); c.id = window.uid();
    var d = this.p.w * 0.04;
    if (this.isAnim(c)) c.kf.forEach(function (k) { k.x += d; k.y += d; }); else { c.x += d; c.y += d; }
    this.p.objects.push(c); this.sel = c.id;
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.flipSel = function () { var o = this.selObj(); if (!o) return; o.flip = !o.flip; this.render(); this.commit(); };
  P.move = function (id, dir) {
    var a = this.p.objects, i = -1, k;
    for (k = 0; k < a.length; k++) if (a[k].id === id) i = k;
    var j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return;
    var t = a[i]; a[i] = a[j]; a[j] = t;
    this.render(); this.commit();
  };
  P.setProp = function (k, v, live) {
    var o = this.selObj(); if (!o) return;
    o[k] = v;
    if (o.type === 'text' && (k === 'text' || k === 'fs' || k === 'bold' || k === 'font')) this.measure(o);
    this.render();
    if (!live) this.commit();
  };
  P.setObjProp = function (id, k, v) {
    var o = this.byId(id); if (!o) return;
    o[k] = v; this.render(); this.commit();
  };
  P.setBg = function (c, live) { this.p.bg = c; this.render(); if (!live) this.commit(); };

  /* ---------- drawing ---------- */
  P.setFont = function (ctx, o) { ctx.font = (o.bold ? '700 ' : '400 ') + o.fs + 'px ' + (FONTS[o.font] || FONTS.sans); };
  P.measure = function (o) {
    var c = this.ctx; this.setFont(c, o);
    var lines = String(o.text).split('\n'), w = 0;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, c.measureText(lines[i]).width);
    o.w = Math.max(30, w + 16); o.h = Math.max(o.fs * 1.25, lines.length * o.fs * 1.25) + 8;
  };
  P.drawObj = function (ctx, o, t) {
    var q = this.pose(o, t);
    ctx.save();
    ctx.translate(q.x, q.y); ctx.rotate(q.rot || 0);
    if (o.flip) ctx.scale(-1, 1);
    ctx.scale(q.sc, q.sc);
    ctx.globalAlpha = clamp(q.op, 0, 1);
    var w = o.w, h = o.h;
    if (o.type === 'image') {
      var im = this.imgs[o.img];
      if (im) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
      else { ctx.fillStyle = '#333'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    } else if (o.type === 'shape') {
      ctx.fillStyle = o.color;
      if (o.kind === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); }
      else if (o.kind === 'tri') { ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill(); }
      else if (o.kind === 'round') { rr(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.25); ctx.fill(); }
      else if (o.kind === 'line') { rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); }
      else { ctx.fillRect(-w / 2, -h / 2, w, h); }
    } else if (o.type === 'text') {
      this.setFont(ctx, o);
      ctx.fillStyle = o.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var lines = String(o.text).split('\n'), lh = o.fs * 1.25, y0 = -(lines.length - 1) * lh / 2;
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, y0 + i * lh);
    }
    ctx.restore();
  };
  /* draws the whole frame at time t on any 2d context (used by preview and, later, export) */
  P.renderTo = function (ctx, t) {
    var p = this.p;
    ctx.clearRect(0, 0, p.w, p.h);
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, p.w, p.h);
    for (var i = 0; i < p.objects.length; i++) if (this.visible(p.objects[i], t)) this.drawObj(ctx, p.objects[i], t);
  };
  P.render = function () {
    if (!this.p) return;
    this.renderTo(this.ctx, this.t);
    this.renderOv();
  };
  P.k = function () { var r = this.ov.getBoundingClientRect(); return (r.width / this.p.w) || 1; };
  P.renderOv = function () {
    var c = this.octx, p = this.p; if (!p) return;
    c.clearRect(0, 0, p.w, p.h);
    var k = this.k();
    if (this.guides.x || this.guides.y) {
      c.save(); c.strokeStyle = '#ff5ca0'; c.lineWidth = 2 / k; c.setLineDash([10 / k, 8 / k]);
      if (this.guides.x) { c.beginPath(); c.moveTo(p.w / 2, 0); c.lineTo(p.w / 2, p.h); c.stroke(); }
      if (this.guides.y) { c.beginPath(); c.moveTo(0, p.h / 2); c.lineTo(p.w, p.h / 2); c.stroke(); }
      c.restore();
    }
    var o = this.selObj(); if (!o) return;
    if (this.isAnim(o) && o.kf.length > 1) {
      c.save(); c.strokeStyle = '#ffd60a'; c.lineWidth = 3 / k; c.setLineDash([12 / k, 9 / k]);
      c.beginPath();
      for (var i = 0; i < o.kf.length; i++) { if (i) c.lineTo(o.kf[i].x, o.kf[i].y); else c.moveTo(o.kf[i].x, o.kf[i].y); }
      c.stroke(); c.setLineDash([]);
      for (var j = 0; j < o.kf.length; j++) {
        c.beginPath(); c.arc(o.kf[j].x, o.kf[j].y, 9 / k, 0, Math.PI * 2);
        c.fillStyle = Math.abs(o.kf[j].t - this.t) < 0.035 ? '#ffd60a' : '#1b1b26'; c.fill();
        c.strokeStyle = '#ffd60a'; c.lineWidth = 3 / k; c.stroke();
      }
      c.restore();
    }
    if (!this.visible(o, this.t)) return;
    var q = this.pose(o, this.t), w = o.w * q.sc, h = o.h * q.sc;
    c.save();
    c.translate(q.x, q.y); c.rotate(q.rot || 0);
    c.strokeStyle = '#7c5cff'; c.lineWidth = 3 / k;
    c.strokeRect(-w / 2, -h / 2, w, h);
    c.beginPath(); c.arc(w / 2, h / 2, 18 / k, 0, Math.PI * 2);
    c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 3 / k; c.stroke();
    c.beginPath(); c.arc(w / 2, h / 2, 6 / k, 0, Math.PI * 2); c.fillStyle = '#7c5cff'; c.fill();
    c.restore();
  };
  P.thumb = function () {
    var p = this.p, tw = 300, th = Math.round(300 * p.h / p.w);
    if (th > 400) { th = 400; tw = Math.round(400 * p.w / p.h); }
    var full = document.createElement('canvas'); full.width = p.w; full.height = p.h;
    this.renderTo(full.getContext('2d'), 0);
    var c = document.createElement('canvas'); c.width = tw; c.height = th;
    c.getContext('2d').drawImage(full, 0, 0, tw, th);
    return c.toDataURL('image/jpeg', 0.72);
  };

  /* ---------- touch ---------- */
  P._pt = function (e) {
    var r = this.ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.p.w / r.width, y: (e.clientY - r.top) * this.p.h / r.height };
  };
  P._local = function (q, pt) {
    var dx = pt.x - q.x, dy = pt.y - q.y, c = Math.cos(-(q.rot || 0)), s = Math.sin(-(q.rot || 0));
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };
  P._onHandle = function (o, pt) {
    var q = this.pose(o, this.t), l = this._local(q, pt), k = this.k();
    var dx = l.x - o.w * q.sc / 2, dy = l.y - o.h * q.sc / 2;
    return Math.sqrt(dx * dx + dy * dy) < 34 / k;
  };
  P.hit = function (pt) {
    var a = this.p.objects, k = this.k(), m = 44 / k;
    for (var i = a.length - 1; i >= 0; i--) {
      var o = a[i]; if (!this.visible(o, this.t)) continue;
      var q = this.pose(o, this.t), l = this._local(q, pt);
      if (Math.abs(l.x) <= Math.max(o.w * q.sc, m) / 2 && Math.abs(l.y) <= Math.max(o.h * q.sc, m) / 2) return o;
    }
    return null;
  };
  P._p0 = function (o) {
    var q = this.pose(o, this.t);
    return { x: q.x, y: q.y, rot: q.rot, sc: q.sc, w: o.w, h: o.h, fs: o.fs };
  };
  P._apply = function (o, p0, x, y, rot, f) {
    if (this.isAnim(o)) {
      var k = this.kfAt(o, this.t, true);
      k.x = x; k.y = y; k.rot = rot; k.sc = clamp(p0.sc * f, 0.02, 40);
    } else {
      o.x = x; o.y = y; o.rot = rot;
      if (f !== 1) {
        if (o.type === 'text') { o.fs = clamp(p0.fs * f, 8, 700); this.measure(o); }
        else { o.w = Math.max(6, p0.w * f); o.h = Math.max(4, p0.h * f); }
      }
    }
  };
  P._snapRot = function (r) {
    var q = Math.PI / 4, n = Math.round(r / q) * q;
    return Math.abs(r - n) < 0.045 ? n : r;
  };
  P._bind = function () {
    var self = this, el = this.ov;
    el.addEventListener('pointerdown', function (e) {
      if (!self.p) return;
      e.preventDefault();
      if (self.hooks.onPointer) self.hooks.onPointer();
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      var pt = self._pt(e); self.ptrs[e.pointerId] = pt;
      var ids = Object.keys(self.ptrs), o = self.selObj();
      if (ids.length === 1) {
        if (o && self.visible(o, self.t) && self._onHandle(o, pt)) {
          var q = self.pose(o, self.t);
          self.g = { mode: 'handle', p0: self._p0(o), c: { x: q.x, y: q.y }, d0: dist(pt, q) || 1, a0: ang(pt, q) };
        } else {
          var h = self.hit(pt);
          if (h) {
            self.select(h.id);
            var q2 = self.pose(h, self.t);
            self.g = { mode: 'drag', p0: self._p0(h), dx: q2.x - pt.x, dy: q2.y - pt.y };
          } else { self.select(null); self.g = null; }
        }
      } else if (ids.length === 2 && o && self.visible(o, self.t)) {
        var a = self.ptrs[ids[0]], b = self.ptrs[ids[1]];
        self.g = { mode: 'pinch', p0: self._p0(o), d0: dist(a, b) || 1, a0: ang(a, b), m0: mid(a, b) };
      }
    });
    el.addEventListener('pointermove', function (e) {
      if (!self.ptrs[e.pointerId]) return;
      e.preventDefault();
      var pt = self._pt(e); self.ptrs[e.pointerId] = pt;
      var g = self.g, o = self.selObj(); if (!g || !o) return;
      var ids = Object.keys(self.ptrs), p = self.p;
      if (g.mode === 'drag' && ids.length === 1) {
        var x = pt.x + g.dx, y = pt.y + g.dy, th = 10 / self.k();
        self.guides.x = Math.abs(x - p.w / 2) < th; if (self.guides.x) x = p.w / 2;
        self.guides.y = Math.abs(y - p.h / 2) < th; if (self.guides.y) y = p.h / 2;
        self._apply(o, g.p0, x, y, g.p0.rot, 1);
      } else if (g.mode === 'handle' && ids.length === 1) {
        var f = clamp(dist(pt, g.c) / g.d0, 0.05, 40);
        self._apply(o, g.p0, g.p0.x, g.p0.y, self._snapRot(g.p0.rot + (ang(pt, g.c) - g.a0)), f);
      } else if (g.mode === 'pinch' && ids.length === 2) {
        var a = self.ptrs[ids[0]], b = self.ptrs[ids[1]], m = mid(a, b);
        self._apply(o, g.p0, g.p0.x + (m.x - g.m0.x), g.p0.y + (m.y - g.m0.y),
          self._snapRot(g.p0.rot + (ang(a, b) - g.a0)), clamp(dist(a, b) / g.d0, 0.05, 40));
      }
      self.render();
    });
    function up(e) {
      if (!self.ptrs[e.pointerId]) return;
      delete self.ptrs[e.pointerId];
      var n = Object.keys(self.ptrs).length;
      if (n === 1 && self.g && self.g.mode === 'pinch') self.g = null;
      if (n === 0) {
        self.g = null; self.guides.x = self.guides.y = false;
        self.render(); self.commit();
      }
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  window.Editor = Editor;
})();
