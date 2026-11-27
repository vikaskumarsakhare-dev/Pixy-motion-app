'use strict';
/* ===== Timeline: fixed centre line, content scrolls under it ===== */
const LW = 60; // width of fixed left column (eye + lock)
const THUMBS = new Map();
function barThumb(o) {
  if (o.type === 'image') return mediaURL(o.file);
  if (o.type === 'video') return THUMBS.get(o.file) || '';
  if (o.type === 'audio') return waveURL(o);
  return '';
}
/* audio waveform for a bar: peaks of the whole file are read once, then the visible part is drawn */
const PEAKS = new Map();
function loadPeaks(file, done) {
  if (PEAKS.has(file)) return; PEAKS.set(file, null);
  fetch(mediaURL(file)).then(r => r.arrayBuffer()).then(buf => {
    if (buf.byteLength > 40e6) throw 0;
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new Ctx(1, 1, 22050);
    return new Promise((res, rej) => c.decodeAudioData(buf, res, rej));
  }).then(ab => {
    const d = ab.getChannelData(0), per = 20, n = Math.max(1, Math.ceil(ab.duration * per)), step = Math.max(1, Math.floor(d.length / n)), pk = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(d.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(d[j])); pk[i] = m; }
    PEAKS.set(file, { pk, per, dur: ab.duration }); done && done(file);
  }).catch(() => {});
}
function waveURL(o) {
  const p = PEAKS.get(o.file); if (!p) { loadPeaks(o.file, f => TL.build()); return ''; }
  const len = Math.max(0.1, endOf(o) - o.t0), w = Math.min(1200, Math.max(40, Math.round(len * 40))), h = 40, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.85)';
  for (let x = 0; x < w; x++) { const tt = (o.vo || 0) + (x / w) * len * (o.speed || 1), i = Math.min(p.pk.length - 1, Math.floor(tt * p.per)), a = Math.max(0.04, p.pk[i] || 0) * h * 0.9; g.fillRect(x, (h - a) / 2, 1, a); }
  return c.toDataURL('image/png');
}
function makeVideoThumb(file, done) {
  if (THUMBS.has(file)) return;
  THUMBS.set(file, '');
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
  const fin = () => {
    try {
      const c = document.createElement('canvas'), h = 64, w = Math.max(16, Math.round(64 * (v.videoWidth || 16) / (v.videoHeight || 9)));
      c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
      THUMBS.set(file, c.toDataURL('image/jpeg', 0.6)); done && done(file);
    } catch (e) {}
    v.removeAttribute('src'); v.load();
  };
  v.onloadeddata = () => { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); };
  v.onseeked = fin; v.onerror = () => { v.removeAttribute('src'); };
  v.src = mediaURL(file);
}

const TL = {
  pps: 70, sc: null, hooks: {}, snapT: null,
  init(sc, hooks) {
    this.sc = sc; this.hooks = hooks;
    sc.addEventListener('scroll', () => this.onScroll(), { passive: true });
    sc.addEventListener('touchstart', () => { if (E.playing) hooks.pause(); }, { passive: true });
    let pd = 0;
    sc.addEventListener('touchmove', e => {
      if (e.touches.length !== 2) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pd) { this.pps = clamp(this.pps * d / pd, 20, 400); this.build(); this.setTime(E.t); }
      pd = d;
    }, { passive: true });
    sc.addEventListener('touchend', () => { pd = 0; }, { passive: true });
  },
  snapList() {
    const o = selObj(), l = (E.P.marks || []).slice();
    if (o) o.kf.forEach(k => l.push(k.t));
    return l;
  },
  onScroll() {
    const sc = this.sc, pps = this.pps, x = sc.scrollLeft;
    let t = x / pps;
    if (Math.abs(t - E.t) * pps < 0.75) return;
    if (this.snapT !== null) {
      if (Math.abs(x - this.snapT * pps) < 4) {
        t = this.snapT;
        if (Math.abs(t - E.t) * pps < 0.75) return;
      } else this.snapT = null;
    } else {
      let best = null, bd = 1e9;
      this.snapList().forEach(c => { const d = Math.abs(x - c * pps); if (d < bd) { bd = d; best = c; } });
      if (best !== null && bd < 2.5) {
        this.snapT = best; t = best;
        try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
      }
    }
    this.hooks.scrub(clamp(t, 0, Math.max(0, E.P.dur)));
  },
  cx() { return this.sc.clientWidth / 2; },
  build() {
    const sc = this.sc, P = E.P, cx = this.cx(), padL = cx - LW, W = padL + P.dur * this.pps + cx;
    let h = '<div class="tlin" style="width:' + (LW + W) + 'px">';
    h += '<div class="trow ruler"><div class="lc"></div><div class="trk" style="width:' + W + 'px">';
    const step = this.pps >= 120 ? 0.5 : this.pps >= 45 ? 1 : this.pps >= 28 ? 2 : 5;
    for (let s = 0; s <= P.dur + 1e-6; s += step) {
      const big = Math.abs(s - Math.round(s)) < 1e-6;
      h += '<i class="tk' + (big ? ' b' : '') + '" style="left:' + (padL + s * this.pps) + 'px">' + (big ? '<b>' + Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0') + '</b>' : '') + '</i>';
    }
    (P.marks || []).forEach(m => { h += '<i class="mk" style="left:' + (padL + m * this.pps) + 'px">' + ic('flag', 12) + '</i>'; });
    h += '<i class="endm" style="left:' + (padL + P.dur * this.pps) + 'px"></i></div></div>';
    const hiddenByGroup = o => { let q = o.par && find(o.par), n = 0; while (q && n++ < 12) { if (q.gcol) return true; q = q.par && find(q.par); } return false; };
    for (let i = P.objects.length - 1; i >= 0; i--) {
      const o = P.objects[i]; if (hiddenByGroup(o)) continue;
      h += '<div class="trow lay' + (o.id === E.sel || (E.multi || []).includes(o.id) ? ' sel' : '') + '" data-id="' + o.id + '">' +
        '<div class="lc"><button class="ib eyeb' + (o.vis === false ? ' off' : '') + '" data-a="eye">' + ic(o.vis === false ? 'eyeoff' : 'eye', 18) + '</button>' +
        '<button class="ib lockb' + (o.lock ? ' on' : '') + '" data-a="lock">' + ic(o.lock ? 'lock' : 'unlock', 18) + '</button></div>' +
        '<div class="trk" style="width:' + W + 'px">' + this.bar(o, padL) + this.plus(o, padL) + '</div></div>';
    }
    h += '</div>';
    const keep = sc.scrollTop;
    sc.innerHTML = h; sc.scrollTop = keep;
    sc.querySelectorAll('.lay').forEach(r => this.wire(r));
    sc.scrollLeft = E.t * this.pps;
    this.markKeys();
    P.objects.forEach(o => { if (o.type === 'video' && !THUMBS.has(o.file)) makeVideoThumb(o.file, f => this.setThumb(f)); });
  },
  setThumb(file) {
    const u = THUMBS.get(file);
    this.sc.querySelectorAll('.bar[data-file="' + CSS.escape(file) + '"]').forEach(b => this.styleThumb(b, u));
  },
  styleThumb(b, u) {
    if (!u) return;
    b.style.backgroundImage = 'url(' + u + ')'; b.classList.add('tb');
  },
  shapeIcon(o) {
    try {
      const key = [o.shape, o.fill, o.pts ? o.pts.length : 0, o.smooth, o.bw, o.bc].join('|');
      if (!o._ic || o._ic.key !== key) {
        const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d'), asp = (o.w || 1) / (o.h || 1), w = asp >= 1 ? 34 : 34 * asp, h = asp >= 1 ? 34 / asp : 34;
        g.fillStyle = o.fill || '#fff'; g.strokeStyle = o.bc || '#fff'; g.lineWidth = Math.min(3, (o.bw || 0) / 6);
        if (o.shape === 'line') { g.strokeStyle = o.fill; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(5, 20); g.lineTo(35, 20); g.stroke(); }
        else { drawShapePath(g, o.shape, (40 - w) / 2, (40 - h) / 2, w, h, o.pts, o.smooth); g.fill(); if ((o.bw || 0) > 0) g.stroke(); }
        o._ic = { key, url: c.toDataURL() };
      }
      return '<img class="shi" src="' + o._ic.url + '">';
    } catch (er) { return ic('shape', 15); }
  },
  barIcon(o) {
    return { image: 'media', video: 'media', text: 'text', shape: 'shape', draw: 'draw', null: 'group', camera: 'camera', audio: 'audio' }[o.type] || 'shape';
  },
  bar(o, padL) {
    const end = endOf(o), left = padL + o.t0 * this.pps, w = Math.max(14, (end - o.t0) * this.pps);
    const th = barThumb(o);
    let k = '';
    (o.kf || []).forEach((q, i) => { if (q.t >= o.t0 - EPS && q.t <= end + EPS) k += '<u class="kd" data-i="' + i + '" data-t="' + q.t + '" style="left:' + ((q.t - o.t0) * this.pps) + 'px"></u>'; });
    return '<div class="bar ty-' + o.type + (th ? ' tb' : '') + '" data-file="' + esc(o.file || '') + '" style="left:' + left + 'px;width:' + w + 'px' + (th ? ';background-image:url(' + th + ')' : '') + (o.type === 'audio' && th ? ';background-size:100% 100%' : '') + '">' +
      (th && o.type !== 'audio' ? '' : '<span class="thumb">' + (o.type === 'shape' ? this.shapeIcon(o) : ic(this.barIcon(o), 15)) + '</span>') +
      (o.type === 'null' && E.P.objects.some(q => q.par === o.id) ? '<span class="gtog">' + ic('next', 14, o.gcol ? '' : 'rotd') + '</span>' : '') +
      '<span class="bn">' + (isMaskLayer(o) ? '◐ ' : '') + esc(o.type === 'text' && o.text && (!o.name || /^(Text|टेक्स्ट)/i.test(o.name)) ? String(o.text).replace(/\s+/g, ' ').slice(0, 28) : (o.name || o.type)) + '</span>' + k + '<s class="hdl l"></s><s class="hdl r"></s></div>';
  },
  plus(o, padL) { // "+" between two clips = pick a transition; "+" after the last clip = add the next clip right beside it
    if (!['image', 'video', 'text', 'shape', 'draw'].includes(o.type) || isMaskLayer(o) || o.auto) return '';
    let h = ''; const pv = trPrevOf(o) || (o.tj && find(o.tj.prev));
    if (pv) h += '<button class="trp' + (o.tj ? ' on' : '') + '" data-a="trp" style="left:' + (padL + o.t0 * this.pps - 12) + 'px">' + (o.tj ? '⇄' : '+') + '</button>';
    const nxt = E.P.objects.some(q => q !== o && ['image', 'video', 'text', 'shape', 'draw'].includes(q.type) && Math.abs(q.t0 - endOf(o)) < 0.35);
    if (o.id === E.sel && !nxt && ['image', 'video'].includes(o.type)) h += '<button class="trp end" data-a="tre" style="left:' + (padL + endOf(o) * this.pps + 8) + 'px">+</button>';
    return h;
  },
  markKeys() {
    this.sc.querySelectorAll('.kd').forEach(d => d.classList.toggle('cur', !!S.panel && E.sel && Math.abs(parseFloat(d.dataset.t) - E.t) < EPS));
  },
  wire(row) {
    const id = row.dataset.id, o = find(id), bar = row.querySelector('.bar'), self = this, sc = this.sc;
    row.querySelector('[data-a=eye]').onclick = e => { e.stopPropagation(); if (self.noClick) return; this.hooks.act(id, 'eye'); };
    row.querySelector('[data-a=lock]').onclick = e => { e.stopPropagation(); if (self.noClick) return; this.hooks.act(id, 'lock'); };
    // long-press the eye/lock cell, then drag up/down to reorder layers
    const pb = row.querySelector('[data-a=trp]'), pe = row.querySelector('[data-a=tre]');
    [pb, pe].forEach(b => b && ['pointerdown', 'touchstart', 'mousedown'].forEach(n => b.addEventListener(n, e => e.stopPropagation(), { passive: true })));
    if (pb) pb.onclick = e => { e.stopPropagation(); TransSheet.open(find(id)); };
    if (pe) pe.onclick = e => { e.stopPropagation(); this.hooks.seek(endOf(o)); pickMedia(); };
    const gt = row.querySelector('.gtog'); if (gt) { gt.addEventListener('pointerdown', e => e.stopPropagation()); gt.onclick = e => { e.stopPropagation(); o.gcol = !o.gcol; changed('struct'); }; }
    const lc = row.querySelector('.lc'); let ds = null;
    lc.addEventListener('pointerdown', e => {
      ds = { x0: e.clientX, y0: e.clientY, stp: sc.scrollTop, mode: 'pending', timer: 0, rd: null, id: e.pointerId };
      ds.timer = setTimeout(() => {
        if (!ds || ds.mode !== 'pending') return;
        ds.mode = 'drag'; try { lc.setPointerCapture(ds.id); } catch (er) {}
        const rows = [...sc.querySelectorAll('.lay')]; ds.from = rows.indexOf(row); ds.rd = reorderDrag(rows, ds.from, ds.y0);
        row.classList.add('lift2'); try { navigator.vibrate && navigator.vibrate(18); } catch (er) {}
      }, 380);
    });
    lc.addEventListener('pointermove', e => {
      if (!ds) return;
      const dx = e.clientX - ds.x0, dy = e.clientY - ds.y0;
      if (ds.mode === 'pending') { if (Math.hypot(dx, dy) > 9) { clearTimeout(ds.timer); ds.mode = 'scroll'; } else return; }
      if (ds.mode === 'scroll') { sc.scrollTop = ds.stp - dy; return; }
      if (ds.mode === 'drag') ds.rd.move(e.clientY);
    });
    const dend = () => {
      if (!ds) return; clearTimeout(ds.timer); const d = ds; ds = null;
      if (d.mode !== 'pending') { self.noClick = true; setTimeout(() => { self.noClick = false; }, 60); }
      if (d.mode === 'drag') { const to = d.rd.end(); row.classList.remove('lift2'); if (to !== d.from) self.hooks.reorder(d.from, to); }
    };
    lc.addEventListener('pointerup', dend); lc.addEventListener('pointercancel', dend);
    row.querySelector('.trk').addEventListener('click', e => { if (e.target.classList.contains('trk')) this.hooks.select(null); });
    bar.querySelectorAll('.kd').forEach(d => {
      d.style.touchAction = 'none';
      let ks = null;
      d.addEventListener('pointerdown', e => {
        e.stopPropagation(); if (o.lock) return;
        const q = o.kf[+d.dataset.i]; if (!q) return;
        ks = { x0: e.clientX, y0: e.clientY, q, t: q.t, on: false, id: e.pointerId };
        ks.timer = setTimeout(() => { if (!ks) return; if (!(self.kfMoveOK && self.kfMoveOK())) { ks = null; return; } ks.on = true; try { d.setPointerCapture(ks.id); } catch (er) {} try { navigator.vibrate && navigator.vibrate(18); } catch (er) {} pushUndo(); d.classList.add('lift'); }, 380);
      });
      d.addEventListener('pointermove', e => {
        if (!ks) return;
        if (!ks.on) { if (Math.hypot(e.clientX - ks.x0, e.clientY - ks.y0) > 10) { clearTimeout(ks.timer); ks = null; } return; }
        e.preventDefault(); const end = endOf(o); let t = clamp(ks.t + (e.clientX - ks.x0) / self.pps, o.t0, end);
        if (Math.abs(t - E.t) * self.pps < 7) t = E.t; ks.q.t = t; d.style.left = ((t - o.t0) * self.pps) + 'px'; d.dataset.t = t; render();
      });
      const kend = () => { if (!ks) return; clearTimeout(ks.timer); const was = ks.on; ks = null; if (was) { d.classList.remove('lift'); o.kf.sort((a, b) => a.t - b.t); self.noClick = true; setTimeout(() => { self.noClick = false; }, 80); E.P.updated = Date.now(); changedHook(true); } };
      d.addEventListener('pointerup', kend); d.addEventListener('pointercancel', kend);
      d.addEventListener('click', e => { e.stopPropagation(); if (self.noClick) return; this.hooks.select(id); this.hooks.seek(parseFloat(d.dataset.t)); });
    });
    let st = null;
    const upd = () => {
      const padL = self.cx() - LW;
      const tp = row.querySelector('[data-a=trp]'); if (tp) tp.style.left = (padL + o.t0 * self.pps - 12) + 'px';
      bar.style.left = (padL + o.t0 * self.pps) + 'px'; bar.style.width = Math.max(14, (endOf(o) - o.t0) * self.pps) + 'px';
      bar.querySelectorAll('.kd').forEach(d => { const q = o.kf[+d.dataset.i]; if (!q) return; d.style.left = ((q.t - o.t0) * self.pps) + 'px'; d.dataset.t = q.t; });
      E.P.updated = Date.now(); render();
    };
    bar.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('kd')) return;
      const handle = e.target.classList.contains('hdl');
      st = { x0: e.clientX, y0: e.clientY, sl: sc.scrollLeft, stp: sc.scrollTop, t0: o.t0, t1: o.t1, kf: o.kf.map(k => k.t), vo: o.vo || 0, moved: false, mode: 'pending', timer: 0, side: handle ? (e.target.classList.contains('l') ? 'l' : 'r') : '' };
      st.mouse = e.pointerType === 'mouse'; if (st.mouse) bar.setPointerCapture(e.pointerId);
      const armTrim = handle && E.sel === id && !o.lock;
      st.timer = setTimeout(() => {
        if (!st || st.mode !== 'pending') return;
        if (o.lock) { self.hooks.toast(tr('unlocked')); st.mode = 'scroll'; return; }
        try { bar.setPointerCapture(e.pointerId); } catch (er) {}
        if (armTrim) { st.mode = 'trim'; e.target.classList.add('arm'); pushUndo(); st.moved = true; try { navigator.vibrate && navigator.vibrate(18); } catch (er) {} return; }
        if (handle) { st.mode = 'scroll'; return; }
        if (E.sel !== id) self.hooks.select(id);
        st.mode = 'drag'; bar.classList.add('lift'); pushUndo(); st.moved = true;
        try { navigator.vibrate && navigator.vibrate(18); } catch (er) {}
      }, armTrim ? 260 : 380);
      if (st.mouse) e.preventDefault();
    });
    // touch: the browser scrolls natively (smooth, with momentum); only a long-press drag / trim blocks it
    bar.addEventListener('touchmove', e => { if (st && (st.mode === 'drag' || st.mode === 'trim') && e.cancelable) e.preventDefault(); }, { passive: false });
    bar.addEventListener('pointermove', e => {
      if (!st) return;
      const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
      if (st.mode === 'pending') {
        if (Math.abs(dx) + Math.abs(dy) > 9) { clearTimeout(st.timer); st.mode = 'scroll'; }
        else return;
      }
      if (st.mode === 'scroll') { if (st.mouse) { sc.scrollLeft = st.sl - dx; sc.scrollTop = st.stp - dy; } return; }
      let dt = dx / self.pps; const minLen = 0.2, vid = o.type === 'video' || o.type === 'audio';
      if (st.mode === 'drag') {
        dt = Math.max(-st.t0, dt);
        o.t0 = st.t0 + dt; if (!o.full) o.t1 = st.t1 + dt; o.kf.forEach((k, i) => { k.t = st.kf[i] + dt; });
      } else if (st.mode === 'trim') {
        if (st.side === 'l') { dt = clamp(dt, -st.t0, endOf(o) - st.t0 - minLen); o.t0 = st.t0 + dt; if (vid) o.vo = Math.max(0, st.vo + dt * (o.speed || 1)); }
        else { o.full = false; o.t1 = Math.max(st.t0 + minLen, st.t1 + dt); }
      }
      upd();
    });
    const end = () => {
      if (!st) return; clearTimeout(st.timer);
      const s = st; st = null; bar.classList.remove('lift'); bar.querySelectorAll('.arm').forEach(x => x.classList.remove('arm'));
      if (s.mode === 'pending') { if (E.sel !== id) self.hooks.select(id); return; }
      if (s.mode === 'drag' || s.mode === 'trim') { autoDur(); self.hooks.changed(); }
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', () => { if (st && st.mode === 'pending') st.mode = 'scroll'; end(); });
  },
  setSel() {
    const m = E.multi || [];
    this.sc.querySelectorAll('.lay').forEach(r => r.classList.toggle('sel', r.dataset.id === E.sel || m.includes(r.dataset.id)));
    this.markKeys();
  },
  focusSel() {
    const r = this.sc.querySelector('.lay.sel');
    if (r) this.sc.scrollTop = Math.max(0, r.offsetTop - 22);
  },
  setTime(t) {
    this.snapT = null;
    const x = t * this.pps;
    if (Math.abs(this.sc.scrollLeft - x) > 0.5) this.sc.scrollLeft = x;
    this.markKeys();
  }
};
