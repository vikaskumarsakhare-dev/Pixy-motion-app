/* Pixy Motion - canvas editor (objects, time, depth/3D, groups, camera, touch gestures, undo/redo) */
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
  var F = 1000;                 /* camera "lens": depth 1000 makes things half size */
  var KEYS = ['x', 'y', 'z', 'sc', 'rot', 'rx', 'ry', 'op'];
  var DEFV = { x: 0, y: 0, z: 0, sc: 1, rot: 0, rx: 0, ry: 0, op: 1 };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { var x = a.x - b.x, y = a.y - b.y; return Math.sqrt(x * x + y * y); }
  function ang(a, b) { return Math.atan2(a.y - b.y, a.x - b.x); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function isSpecial(o) { return o.type === 'null' || o.type === 'camera'; }

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

  /* point (x,y) on a flat card, turned by rx (tilt) and ry (side turn), seen with perspective */
  function p3(x, y, rx, ry, Fd) {
    var cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    var x1 = x * cy, z1 = -x * sy;
    var y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    var k = Fd / Math.max(Fd * 0.2, Fd + z2);
    return { x: x1 * k, y: y2 * k };
  }
  function corners(w, h, rx, ry) {
    var Fd = Math.max(w, h) * 1.8, a = w / 2, b = h / 2;
    return [p3(-a, -b, rx, ry, Fd), p3(a, -b, rx, ry, Fd), p3(a, b, rx, ry, Fd), p3(-a, b, rx, ry, Fd)];
  }

  /* draw one triangle of a texture so it lands on a (moved) triangle */
  function tri(c, src, s, d) {
    var u1x = s[2] - s[0], u1y = s[3] - s[1], u2x = s[4] - s[0], u2y = s[5] - s[1];
    var v1x = d[2] - d[0], v1y = d[3] - d[1], v2x = d[4] - d[0], v2y = d[5] - d[1];
    var det = u1x * u2y - u2x * u1y; if (Math.abs(det) < 1e-9) return;
    var a = (v1x * u2y - v2x * u1y) / det, cc = (-v1x * u2x + v2x * u1x) / det;
    var b = (v1y * u2y - v2y * u1y) / det, dd = (-v1y * u2x + v2y * u1x) / det;
    var e = d[0] - a * s[0] - cc * s[1], f = d[1] - b * s[0] - dd * s[1];
    var gx = (d[0] + d[2] + d[4]) / 3, gy = (d[1] + d[3] + d[5]) / 3, g = 1.04;
    c.save();
    c.beginPath();
    c.moveTo(gx + (d[0] - gx) * g, gy + (d[1] - gy) * g);
    c.lineTo(gx + (d[2] - gx) * g, gy + (d[3] - gy) * g);
    c.lineTo(gx + (d[4] - gx) * g, gy + (d[5] - gy) * g);
    c.closePath(); c.clip();
    c.transform(a, b, cc, dd, e, f);
    var x0 = Math.max(0, Math.floor(Math.min(s[0], s[2], s[4])) - 1), y0 = Math.max(0, Math.floor(Math.min(s[1], s[3], s[5])) - 1);
    var x1 = Math.min(src.sw, Math.ceil(Math.max(s[0], s[2], s[4])) + 1), y1 = Math.min(src.sh, Math.ceil(Math.max(s[1], s[3], s[5])) + 1);
    if (x1 > x0 && y1 > y0) c.drawImage(src.el, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    c.restore();
  }

  function Editor(cv, ov, hooks) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.ov = ov; this.octx = ov.getContext('2d');
    this.hooks = hooks || {};
    this.p = null; this.sel = null; this.imgs = {}; this.vids = {}; this.t = 0;
    this.hist = []; this.hi = -1;
    this.guides = { x: false, y: false };
    this.ptrs = {}; this.g = null;
    this._tmpA = document.createElement('canvas'); this._tmpB = document.createElement('canvas');
    this._bind();
  }
  var P = Editor.prototype;
  Editor.EASES = ['smooth', 'in', 'out', 'back', 'linear'];
  Editor.isSpecial = isSpecial;

  window.layerName = function (o, ed) {
    if (o.type === 'text') return String(o.text).replace(/\n/g, ' ');
    if (o.type === 'image') return T('imageLayer');
    if (o.type === 'video') return T('videoLayer');
    if (o.type === 'camera') return T('cameraLayer');
    if (o.type === 'null') {
      var n = 0, a = ed && ed.p ? ed.p.objects : [];
      for (var i = 0; i < a.length; i++) if (a[i].type === 'null') { n++; if (a[i].id === o.id) break; }
      return T('groupLayer') + ' ' + n;
    }
    return T(o.kind);
  };

  /* ---------- project ---------- */
  P.load = function (p) {
    this.p = p; this.sel = null; this.imgs = {}; this.vids = {}; this.t = 0;
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
    this.syncVideos(this.t, !!(window.TL && window.TL.playing));
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
    if (isSpecial(o)) return true;
    if (t < (o.t0 || 0) - 1e-6) return false;
    return o.t1 == null || t <= o.t1 + 1e-6;
  };
  P.isAnim = function (o) { return !!(o.kf && o.kf.length); };

  /* the item's own numbers at time t (x,y,depth z,size,turn,tilt rx,side ry,fade) */
  P.pose = function (o, t) {
    if (t == null) t = this.t;
    var base = { x: o.x, y: o.y, z: o.z || 0, sc: isSpecial(o) ? (o.s || 1) : 1, rot: o.rot || 0, rx: o.rx || 0, ry: o.ry || 0, op: o.op == null ? 1 : o.op };
    if (!this.isAnim(o)) return base;
    var k = o.kf, n = k.length, i, key;
    function cp(a) { var r = {}; for (var j = 0; j < KEYS.length; j++) r[KEYS[j]] = a[KEYS[j]] == null ? DEFV[KEYS[j]] : a[KEYS[j]]; return r; }
    if (t <= k[0].t) return cp(k[0]);
    if (t >= k[n - 1].t) return cp(k[n - 1]);
    for (i = 0; i < n - 1; i++) {
      if (t <= k[i + 1].t) {
        var a = cp(k[i]), b = cp(k[i + 1]), u = (t - k[i].t) / ((k[i + 1].t - k[i].t) || 1), e = (EASE[o.ease] || EASE.smooth)(u), r = {};
        for (var j = 0; j < KEYS.length; j++) { key = KEYS[j]; r[key] = a[key] + (b[key] - a[key]) * e; }
        return r;
      }
    }
    return cp(k[n - 1]);
  };
  /* the item's numbers after its group (parent) is applied */
  P.wpose = function (o, t, depth) {
    var q = this.pose(o, t), par = o.par && (depth || 0) < 20 ? this.byId(o.par) : null;
    if (!par) return q;
    var W = this.wpose(par, t, (depth || 0) + 1), c = Math.cos(W.rot), s = Math.sin(W.rot);
    return {
      x: W.x + (q.x * c - q.y * s) * W.sc, y: W.y + (q.x * s + q.y * c) * W.sc, z: W.z + q.z,
      sc: W.sc * q.sc, rot: W.rot + q.rot, rx: q.rx, ry: q.ry, op: W.op * q.op
    };
  };
  P._linv = function (W, x, y) {
    var dx = x - W.x, dy = y - W.y, c = Math.cos(-W.rot), s = Math.sin(-W.rot);
    return { x: (dx * c - dy * s) / W.sc, y: (dx * s + dy * c) / W.sc };
  };
  P.camObj = function () {
    var a = this.p.objects;
    for (var i = 0; i < a.length; i++) if (a[i].type === 'camera' && a[i].vis !== false) return a[i];
    return null;
  };
  P.cam = function (t) {
    var c = this.camObj();
    if (!c) return { x: this.p.w / 2, y: this.p.h / 2, z: 0, sc: 1, rot: 0 };
    return this.pose(c, t);
  };
  /* where the item really appears on the screen (group + camera + depth applied) */
  P.screenPose = function (o, t) {
    var w = this.wpose(o, t), c = this.cam(t), d = F + w.z - c.z;
    if (d < 0.08 * F) return null;
    var pr = F / d * c.sc, dx = (w.x - c.x) * pr, dy = (w.y - c.y) * pr, cr = Math.cos(c.rot), sr = Math.sin(c.rot);
    return { x: this.p.w / 2 + dx * cr + dy * sr, y: this.p.h / 2 - dx * sr + dy * cr, sc: w.sc * pr, rot: w.rot - c.rot, rx: w.rx, ry: w.ry, op: w.op };
  };
  /* screen spot -> the item's own x,y (so dragging works with groups, depth and camera) */
  P._toLocal = function (o, sx, sy, t) {
    var w = this.wpose(o, t), c = this.cam(t), d = F + w.z - c.z;
    if (d < 0.08 * F) { var q = this.pose(o, t); return { x: q.x, y: q.y }; }
    var pr = F / d * c.sc, xx = sx - this.p.w / 2, yy = sy - this.p.h / 2, cr = Math.cos(c.rot), sr = Math.sin(c.rot);
    var wx = c.x + (xx * cr - yy * sr) / pr, wy = c.y + (xx * sr + yy * cr) / pr;
    var par = o.par ? this.byId(o.par) : null;
    return par ? this._linv(this.wpose(par, t), wx, wy) : { x: wx, y: wy };
  };

  P.kfAt = function (o, t, create) {
    var k = o.kf;
    for (var i = 0; i < k.length; i++) if (Math.abs(k[i].t - t) < 0.035) return k[i];
    if (!create) return null;
    var q = this.pose(o, t); q.t = r2(t);
    k.push(q); k.sort(function (a, b) { return a.t - b.t; });
    return q;
  };
  /* keyframes (same idea as other editors): diamond button adds/removes a keyframe at the playhead;
     once an item has keyframes, changing it at another time makes a new keyframe automatically */
  P.hasKeyHere = function (o) { return this.isAnim(o) && !!this.kfAt(o, this.t, false); };
  P.toggleKey = function () {
    var o = this.selObj(); if (!o) return;
    if (!this.isAnim(o)) {
      var q = this.pose(o, this.t); q.t = r2(this.t);
      o.kf = [q];
    } else {
      var k = this.kfAt(o, this.t, false);
      if (k) {
        if (o.kf.length === 1) { this.stopAnim(); return; }
        o.kf.splice(o.kf.indexOf(k), 1);
      } else this.kfAt(o, this.t, true);
    }
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.stopAnim = function () {
    var o = this.selObj(); if (!o || !this.isAnim(o)) return;
    var q = this.pose(o, this.t);
    o.x = q.x; o.y = q.y; o.rot = q.rot; o.op = q.op; o.z = q.z; o.rx = q.rx; o.ry = q.ry;
    if (isSpecial(o)) o.s = q.sc;
    else { o.w *= q.sc; o.h *= q.sc; if (o.type === 'text') { o.fs *= q.sc; this.measure(o); } }
    o.kf = null;
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
  };
  P.jumpKey = function (dir) {
    var o = this.selObj(); if (!o || !this.isAnim(o)) return false;
    var best = null, k = o.kf;
    for (var i = 0; i < k.length; i++) {
      if (dir > 0 && k[i].t > this.t + 0.02 && (best == null || k[i].t < best)) best = k[i].t;
      if (dir < 0 && k[i].t < this.t - 0.02 && (best == null || k[i].t > best)) best = k[i].t;
    }
    if (best == null) return false;
    this.setTime(best);
    return true;
  };
  /* set one number (x,y,z,sc,rot,rx,ry,op) of the selected item; keyframe-aware */
  P.setPoseProp = function (key, val, live) {
    var o = this.selObj(); if (!o) return;
    if (this.isAnim(o)) this.kfAt(o, this.t, true)[key] = val;
    else if (key === 'sc') { if (isSpecial(o)) o.s = val; }
    else o[key] = val;
    this.render();
    if (!live) this.commit();
  };
  P.nudge = function (key, delta) {
    var o = this.selObj(); if (!o) return;
    var q = this.pose(o, this.t), v = q[key] + delta;
    if (key === 'op') v = clamp(Math.round(v * 100) / 100, 0, 1);
    else if (key === 'z') v = clamp(Math.round(v), -3000, 3000);
    else if (key === 'rx' || key === 'ry') v = clamp(v, -Math.PI * 2, Math.PI * 2);
    this.setPoseProp(key, v, true);
  };
  /* used by the control pad: move/turn/size by a small amount (keyframe-aware).
     dx,dy are screen pixels for items, and "camera moves" for the camera */
  P.adjust = function (dx, dy, drot, f) {
    var o = this.selObj(); if (!o) return;
    var p0 = this._p0(o);
    if (o.type === 'camera') { this._apply(o, p0, p0.x + dx, p0.y + dy, p0.rot - drot, f); this.render(); return; }
    var x = p0.x, y = p0.y;
    if (dx || dy) {
      var sp = this.screenPose(o, this.t);
      if (sp) { var l = this._toLocal(o, sp.x + dx, sp.y + dy, this.t); x = l.x; y = l.y; }
    }
    this._apply(o, p0, x, y, p0.rot + drot, f);
    this.render();
  };
  P.centerSel = function () {
    var o = this.selObj(); if (!o) return;
    var p0 = this._p0(o), x, y;
    if (o.type === 'camera') { x = this.p.w / 2; y = this.p.h / 2; }
    else { var l = this._toLocal(o, this.p.w / 2, this.p.h / 2, this.t); x = l.x; y = l.y; }
    this._apply(o, p0, x, y, p0.rot, 1);
    this.render(); this.commit();
  };
  P.setEase = function (e) { var o = this.selObj(); if (!o) return; o.ease = e; this.render(); this.commit(); };
  P.setOpacity = function (v, live) { this.setPoseProp('op', v, live); };

  /* ---------- groups (parent / child) ---------- */
  P.kids = function (id) { return this.p.objects.filter(function (x) { return x.par === id; }); };
  P.isDesc = function (o, anc) {    /* is o inside anc? */
    var cur = o, n = 0;
    while (cur && cur.par && n++ < 30) { if (cur.par === anc.id) return true; cur = this.byId(cur.par); }
    return false;
  };
  P.canLinkTo = function (o) {
    var self = this;
    return this.p.objects.filter(function (x) { return x.id !== o.id && x.type !== 'camera' && !self.isDesc(x, o); });
  };
  /* link o under parId (null = unlink). The item stays exactly where it looks now. */
  P.setParent = function (o, parId) {
    if ((o.par || null) === (parId || null)) return;
    var self = this, anim = this.isAnim(o), times = anim ? o.kf.map(function (k) { return k.t; }) : [this.t];
    var W = times.map(function (t) { return self.wpose(o, t); });
    if (parId) o.par = parId; else delete o.par;
    var par = parId ? this.byId(parId) : null;
    times.forEach(function (t, i) {
      var w = W[i], loc;
      if (par) {
        var Pw = self.wpose(par, t), l = self._linv(Pw, w.x, w.y);
        loc = { x: l.x, y: l.y, z: w.z - Pw.z, rot: w.rot - Pw.rot, sc: w.sc / Pw.sc, op: Pw.op > 0.001 ? w.op / Pw.op : w.op };
      } else loc = { x: w.x, y: w.y, z: w.z, rot: w.rot, sc: w.sc, op: w.op };
      loc.op = clamp(loc.op, 0, 1);
      if (anim) { var k = o.kf[i]; k.x = loc.x; k.y = loc.y; k.z = loc.z; k.rot = loc.rot; k.sc = loc.sc; k.op = loc.op; }
      else {
        o.x = loc.x; o.y = loc.y; o.z = loc.z; o.rot = loc.rot; o.op = loc.op;
        if (Math.abs(loc.sc - 1) > 1e-6) {
          if (isSpecial(o)) o.s = (o.s || 1) * loc.sc;
          else { o.w *= loc.sc; o.h *= loc.sc; if (o.type === 'text') { o.fs *= loc.sc; this.measure(o); } }
        }
      }
    }, this);
    this.render(); this.commit();
    if (this.hooks.onSelect) this.hooks.onSelect();
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
  P.addImage = function (imgId, w, h, url) {
    var s = Math.min(this.p.w * 0.7 / w, this.p.h * 0.7 / h);
    var o = { type: 'image', img: imgId, x: this.p.w / 2, y: this.p.h / 2, w: w * s, h: h * s };
    if (url) o.url = url;
    return this._add(o);
  };
  P.addVideo = function (info) {
    var w = info.vw || 640, h = info.vh || 360, s = Math.min(this.p.w * 0.9 / w, this.p.h * 0.9 / h);
    var o = this._add({ type: 'video', img: info.id, url: info.url, vdur: info.dur || 1, vs: 0, x: this.p.w / 2, y: this.p.h / 2, w: w * s, h: h * s });
    var end = o.t0 + o.vdur;
    o.t1 = end >= this.p.dur - 0.001 ? null : r2(end);
    this.commit(); this.render();
    if (this.hooks.onSelect) this.hooks.onSelect();
    return o;
  };
  P.addNull = function () {
    return this._add({ type: 'null', x: this.p.w / 2, y: this.p.h / 2, w: 120, h: 120 });
  };
  /* one camera per project; if there is one already just select it */
  P.addCamera = function () {
    var c = null, a = this.p.objects;
    for (var i = 0; i < a.length; i++) if (a[i].type === 'camera') c = a[i];
    if (c) { this.select(c.id); return false; }
    this._add({ type: 'camera', x: this.p.w / 2, y: this.p.h / 2, w: 120, h: 120 });
    return true;
  };
  /* keep <video> elements in step with the playhead */
  P.syncVideos = function (t, playing) {
    if (!this.p) return;
    var a = this.p.objects;
    for (var i = 0; i < a.length; i++) {
      var o = a[i]; if (o.type !== 'video') continue;
      var v = this.vids[o.img]; if (!v) continue;
      if (!this.visible(o, t)) { if (!v.paused) v.pause(); continue; }
      var want = clamp((o.vs || 0) + (t - (o.t0 || 0)), 0, Math.max(0, (v.duration || o.vdur) - 0.05));
      if (playing) {
        if (Math.abs(v.currentTime - want) > 0.35) v.currentTime = want;
        if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - want) > 0.03) v.currentTime = want;
      }
    }
  };
  /* export helper: put every visible video on exactly the frame for time t */
  P.seekVideosTo = function (t) {
    var self = this, jobs = [], a = this.p.objects;
    a.forEach(function (o) {
      if (o.type !== 'video' || !self.visible(o, t)) return;
      var v = self.vids[o.img]; if (!v) return;
      var want = clamp((o.vs || 0) + (t - (o.t0 || 0)), 0, Math.max(0, (v.duration || o.vdur) - 0.05));
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) < 0.001) return;
      jobs.push(new Promise(function (res) {
        var done = false;
        function fin() { if (done) return; done = true; v.removeEventListener('seeked', fin); res(); }
        v.addEventListener('seeked', fin); setTimeout(fin, 2500);
        v.currentTime = want;
      }));
    });
    return Promise.all(jobs);
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
    var self = this;
    this.kids(o.id).forEach(function (k) { self.setParent(k, o.par || null); });   /* children keep their look */
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
  /* flat picture of the item, centred on 0,0 */
  P._paint = function (ctx, o, w, h) {
    if (o.type === 'image') {
      var im = this.imgs[o.img];
      if (im) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
      else { ctx.fillStyle = '#333'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    } else if (o.type === 'video') {
      var vd = this.vids[o.img];
      if (vd && vd.readyState >= 2) { try { ctx.drawImage(vd, -w / 2, -h / 2, w, h); } catch (e) {} }
      else { ctx.fillStyle = '#222'; ctx.fillRect(-w / 2, -h / 2, w, h); }
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
  };
  /* turned/tilted picture: the item is cut into small triangles that are drawn where they land in 3D */
  P._paint3 = function (ctx, o, w, h, rx, ry) {
    var m = ctx.getTransform(), k = Math.sqrt(m.a * m.a + m.b * m.b) || 1, src = null;
    if (o.type === 'image') {
      var im = this.imgs[o.img]; if (im) src = { el: im, sw: im.width || im.naturalWidth, sh: im.height || im.naturalHeight };
    } else if (o.type === 'video') {
      var vd = this.vids[o.img]; if (vd && vd.readyState >= 2 && vd.videoWidth) src = { el: vd, sw: vd.videoWidth, sh: vd.videoHeight };
    } else {
      var tw = clamp(Math.ceil(w * k), 8, 2048), th = clamp(Math.ceil(h * k), 8, 2048), tc = this._tmpA;
      tc.width = tw; tc.height = th;
      var c1 = tc.getContext('2d'); c1.setTransform(tw / w, 0, 0, th / h, tw / 2, th / 2);
      this._paint(c1, o, w, h);
      src = { el: tc, sw: tw, sh: th };
    }
    if (!src || !src.sw || !src.sh) { this._paint(ctx, o, w, h); return; }
    var N = 8, Fd = Math.max(w, h) * 1.8, pts = [], i, j, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++) {
      var q = p3((i / N - 0.5) * w, (j / N - 0.5) * h, rx, ry, Fd); pts.push(q);
      minx = Math.min(minx, q.x); maxx = Math.max(maxx, q.x); miny = Math.min(miny, q.y); maxy = Math.max(maxy, q.y);
    }
    var kk = k, pw = (maxx - minx) * kk + 4, ph = (maxy - miny) * kk + 4;
    if (pw > 2600 || ph > 2600) { kk *= 2600 / Math.max(pw, ph); pw = (maxx - minx) * kk + 4; ph = (maxy - miny) * kk + 4; }
    var tb = this._tmpB; tb.width = Math.max(2, Math.ceil(pw)); tb.height = Math.max(2, Math.ceil(ph));
    var c2 = tb.getContext('2d'); c2.imageSmoothingQuality = 'high';
    c2.setTransform(kk, 0, 0, kk, -minx * kk + 2, -miny * kk + 2);
    function P_(a, b) { return pts[b * (N + 1) + a]; }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var a = P_(i, j), b = P_(i + 1, j), c = P_(i + 1, j + 1), d = P_(i, j + 1);
      var u0 = i / N * src.sw, u1 = (i + 1) / N * src.sw, v0 = j / N * src.sh, v1 = (j + 1) / N * src.sh;
      tri(c2, src, [u0, v0, u1, v0, u1, v1], [a.x, a.y, b.x, b.y, c.x, c.y]);
      tri(c2, src, [u0, v0, u1, v1, u0, v1], [a.x, a.y, c.x, c.y, d.x, d.y]);
    }
    ctx.drawImage(tb, minx - 2 / kk, miny - 2 / kk, tb.width / kk, tb.height / kk);
  };
  P.drawObj = function (ctx, o, t) {
    if (isSpecial(o)) return;
    var sp = this.screenPose(o, t); if (!sp) return;
    ctx.save();
    ctx.translate(sp.x, sp.y); ctx.rotate(sp.rot || 0);
    if (o.flip) ctx.scale(-1, 1);
    ctx.scale(sp.sc, sp.sc);
    ctx.globalAlpha = clamp(sp.op, 0, 1);
    if (sp.rx || sp.ry) this._paint3(ctx, o, o.w, o.h, sp.rx, sp.ry); else this._paint(ctx, o, o.w, o.h);
    ctx.restore();
  };
  /* draws the whole frame at time t on any 2d context (used by preview and export) */
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
  /* where the selection handle sits, measured from the item's centre (before turning) */
  P._handleLocal = function (o, sp) {
    if (sp.rx || sp.ry) { var c = corners(o.w, o.h, sp.rx, sp.ry)[2]; return { x: c.x * sp.sc, y: c.y * sp.sc }; }
    return { x: o.w * sp.sc / 2, y: o.h * sp.sc / 2 };
  };
  P.renderOv = function () {
    var c = this.octx, p = this.p; if (!p) return;
    c.clearRect(0, 0, p.w, p.h);
    var k = this.k(), self = this, t = this.t;
    if (this.guides.x || this.guides.y) {
      c.save(); c.strokeStyle = '#ff5ca0'; c.lineWidth = 2 / k; c.setLineDash([10 / k, 8 / k]);
      if (this.guides.x) { c.beginPath(); c.moveTo(p.w / 2, 0); c.lineTo(p.w / 2, p.h); c.stroke(); }
      if (this.guides.y) { c.beginPath(); c.moveTo(0, p.h / 2); c.lineTo(p.w, p.h / 2); c.stroke(); }
      c.restore();
    }
    /* groups (nulls) are always visible in the editor, never in the exported video */
    p.objects.forEach(function (n) {
      if (n.type !== 'null' || n.vis === false) return;
      var sp = self.screenPose(n, t); if (!sp) return;
      var on = n.id === self.sel, r = 22 / k;
      c.save(); c.translate(sp.x, sp.y); c.rotate(sp.rot);
      c.strokeStyle = on ? '#7c5cff' : 'rgba(255,255,255,.7)'; c.lineWidth = (on ? 4 : 2.5) / k;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.moveTo(-r * 1.5, 0); c.lineTo(r * 1.5, 0); c.moveTo(0, -r * 1.5); c.lineTo(0, r * 1.5); c.stroke();
      c.restore();
    });
    var o = this.selObj(); if (!o) return;
    if (this.isAnim(o) && o.kf.length > 1 && o.type !== 'camera') {
      c.save(); c.strokeStyle = '#ffd60a'; c.lineWidth = 3 / k; c.setLineDash([12 / k, 9 / k]);
      var sps = o.kf.map(function (kf) { return self.screenPose(o, kf.t); });
      c.beginPath();
      var started = false;
      for (var i = 0; i < sps.length; i++) { if (!sps[i]) continue; if (started) c.lineTo(sps[i].x, sps[i].y); else { c.moveTo(sps[i].x, sps[i].y); started = true; } }
      c.stroke(); c.setLineDash([]);
      for (var j = 0; j < sps.length; j++) {
        if (!sps[j]) continue;
        c.beginPath(); c.arc(sps[j].x, sps[j].y, 9 / k, 0, Math.PI * 2);
        c.fillStyle = Math.abs(o.kf[j].t - t) < 0.035 ? '#ffd60a' : '#1b1b26'; c.fill();
        c.strokeStyle = '#ffd60a'; c.lineWidth = 3 / k; c.stroke();
      }
      c.restore();
    }
    if (o.type === 'camera') {
      c.save(); c.strokeStyle = '#ffd60a'; c.lineWidth = 3 / k; c.setLineDash([14 / k, 10 / k]);
      var m = 8 / k; c.strokeRect(m, m, p.w - 2 * m, p.h - 2 * m);
      c.setLineDash([]); c.beginPath(); c.moveTo(p.w / 2 - 18 / k, p.h / 2); c.lineTo(p.w / 2 + 18 / k, p.h / 2); c.moveTo(p.w / 2, p.h / 2 - 18 / k); c.lineTo(p.w / 2, p.h / 2 + 18 / k); c.stroke();
      c.fillStyle = '#ffd60a'; c.font = (15 / k) + 'px sans-serif'; c.fillText(window.T ? T('cameraLayer') : 'Camera', m + 8 / k, m + 22 / k);
      c.restore(); return;
    }
    if (o.type === 'null' || !this.visible(o, t)) return;
    var sp = this.screenPose(o, t); if (!sp) return;
    var w = o.w * sp.sc, h = o.h * sp.sc;
    c.save();
    c.translate(sp.x, sp.y); c.rotate(sp.rot || 0);
    c.strokeStyle = '#7c5cff'; c.lineWidth = 3 / k;
    if (sp.rx || sp.ry) {
      var cs = corners(o.w, o.h, sp.rx, sp.ry);
      c.beginPath(); cs.forEach(function (q, n) { if (n) c.lineTo(q.x * sp.sc, q.y * sp.sc); else c.moveTo(q.x * sp.sc, q.y * sp.sc); }); c.closePath(); c.stroke();
    } else c.strokeRect(-w / 2, -h / 2, w, h);
    var hl = this._handleLocal(o, sp);
    c.beginPath(); c.arc(hl.x, hl.y, 18 / k, 0, Math.PI * 2);
    c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 3 / k; c.stroke();
    c.beginPath(); c.arc(hl.x, hl.y, 6 / k, 0, Math.PI * 2); c.fillStyle = '#7c5cff'; c.fill();
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
  P._local = function (sp, pt) {
    var dx = pt.x - sp.x, dy = pt.y - sp.y, c = Math.cos(-(sp.rot || 0)), s = Math.sin(-(sp.rot || 0));
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  };
  P._onHandle = function (o, pt) {
    if (isSpecial(o)) return false;
    var sp = this.screenPose(o, this.t); if (!sp) return false;
    var hl = this._handleLocal(o, sp), l = this._local(sp, pt), k = this.k();
    var dx = l.x - hl.x, dy = l.y - hl.y;
    return Math.sqrt(dx * dx + dy * dy) < 34 / k;
  };
  P.hit = function (pt) {
    var a = this.p.objects, k = this.k(), m = 44 / k;
    for (var i = a.length - 1; i >= 0; i--) {
      var o = a[i]; if (o.type === 'camera' || !this.visible(o, this.t)) continue;
      var sp = this.screenPose(o, this.t); if (!sp) continue;
      if (o.type === 'null') { if (dist(pt, sp) < m) return o; continue; }
      var l = this._local(sp, pt);
      if (Math.abs(l.x) <= Math.max(o.w * sp.sc, m) / 2 && Math.abs(l.y) <= Math.max(o.h * sp.sc, m) / 2) return o;
    }
    return null;
  };
  P._p0 = function (o) {
    var q = this.pose(o, this.t);
    return { x: q.x, y: q.y, rot: q.rot, sc: q.sc, z: q.z, w: o.w, h: o.h, fs: o.fs };
  };
  P._apply = function (o, p0, x, y, rot, f) {
    if (this.isAnim(o)) {
      var k = this.kfAt(o, this.t, true);
      k.x = x; k.y = y; k.rot = rot; k.sc = clamp(p0.sc * f, 0.02, 40);
    } else {
      o.x = x; o.y = y; o.rot = rot;
      if (f !== 1) {
        if (isSpecial(o)) o.s = clamp(p0.sc * f, 0.02, 40);
        else if (o.type === 'text') { o.fs = clamp(p0.fs * f, 8, 700); this.measure(o); }
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
      if (o && o.type === 'camera') {
        if (ids.length === 1) self.g = { mode: 'cam1', p0: self._p0(o), pt0: pt, moved: false };
        else if (ids.length === 2) { var ca = self.ptrs[ids[0]], cb = self.ptrs[ids[1]]; self.g = { mode: 'campinch', p0: self._p0(o), d0: dist(ca, cb) || 1, a0: ang(ca, cb), moved: true }; }
        return;
      }
      if (ids.length === 1) {
        var sp = o && self.visible(o, self.t) ? self.screenPose(o, self.t) : null;
        if (o && sp && self._onHandle(o, pt)) {
          self.g = { mode: 'handle', p0: self._p0(o), c: { x: sp.x, y: sp.y }, d0: dist(pt, sp) || 1, a0: ang(pt, sp) };
        } else {
          var h = self.hit(pt);
          if (h) {
            self.select(h.id);
            var s2 = self.screenPose(h, self.t);
            self.g = { mode: 'drag', p0: self._p0(h), dx: s2.x - pt.x, dy: s2.y - pt.y };
          } else { self.select(null); self.g = null; }
        }
      } else if (ids.length === 2 && o && self.visible(o, self.t)) {
        var a = self.ptrs[ids[0]], b = self.ptrs[ids[1]], s3 = self.screenPose(o, self.t);
        if (s3) self.g = { mode: 'pinch', p0: self._p0(o), d0: dist(a, b) || 1, a0: ang(a, b), m0: mid(a, b), s0: { x: s3.x, y: s3.y } };
      }
    });
    el.addEventListener('pointermove', function (e) {
      if (!self.ptrs[e.pointerId]) return;
      e.preventDefault();
      var pt = self._pt(e); self.ptrs[e.pointerId] = pt;
      var g = self.g, o = self.selObj(); if (!g || !o) return;
      var ids = Object.keys(self.ptrs), p = self.p, loc;
      if (g.mode === 'drag' && ids.length === 1) {
        var x = pt.x + g.dx, y = pt.y + g.dy, th = 10 / self.k();
        if (!o.par && !self.camObj() && !(o.z)) {
          self.guides.x = Math.abs(x - p.w / 2) < th; if (self.guides.x) x = p.w / 2;
          self.guides.y = Math.abs(y - p.h / 2) < th; if (self.guides.y) y = p.h / 2;
        }
        loc = self._toLocal(o, x, y, self.t);
        self._apply(o, g.p0, loc.x, loc.y, g.p0.rot, 1);
      } else if (g.mode === 'handle' && ids.length === 1) {
        var f = clamp(dist(pt, g.c) / g.d0, 0.05, 40);
        self._apply(o, g.p0, g.p0.x, g.p0.y, self._snapRot(g.p0.rot + (ang(pt, g.c) - g.a0)), f);
      } else if (g.mode === 'pinch' && ids.length === 2) {
        var a = self.ptrs[ids[0]], b = self.ptrs[ids[1]], m = mid(a, b);
        loc = self._toLocal(o, g.s0.x + (m.x - g.m0.x), g.s0.y + (m.y - g.m0.y), self.t);
        self._apply(o, g.p0, loc.x, loc.y, self._snapRot(g.p0.rot + (ang(a, b) - g.a0)), clamp(dist(a, b) / g.d0, 0.05, 40));
      } else if (g.mode === 'cam1' && ids.length === 1) {
        var ddx = pt.x - g.pt0.x, ddy = pt.y - g.pt0.y;
        if (!g.moved && Math.sqrt(ddx * ddx + ddy * ddy) < 8 / self.k()) return;
        g.moved = true;
        var pr = F / Math.max(0.08 * F, F - g.p0.z) * g.p0.sc, cr = Math.cos(g.p0.rot), sr = Math.sin(g.p0.rot);
        self._apply(o, g.p0, g.p0.x - (ddx * cr - ddy * sr) / pr, g.p0.y - (ddx * sr + ddy * cr) / pr, g.p0.rot, 1);
      } else if (g.mode === 'campinch' && ids.length === 2) {
        var ca = self.ptrs[ids[0]], cb = self.ptrs[ids[1]];
        self._apply(o, g.p0, g.p0.x, g.p0.y, g.p0.rot - (ang(ca, cb) - g.a0), clamp(dist(ca, cb) / g.d0, 0.1, 10));
      }
      self.render();
    });
    function up(e) {
      if (!self.ptrs[e.pointerId]) return;
      var last = self.ptrs[e.pointerId];
      delete self.ptrs[e.pointerId];
      var n = Object.keys(self.ptrs).length;
      if (self.g && self.g.mode === 'cam1' && !self.g.moved && n === 0) {     /* a tap while the camera is selected */
        var h = self.hit(last); self.g = null; self.select(h ? h.id : null); return;
      }
      if (n === 1 && self.g && (self.g.mode === 'pinch' || self.g.mode === 'campinch')) self.g = null;
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
