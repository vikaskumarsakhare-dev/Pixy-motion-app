'use strict';
/* ===== Timeline: fixed centre line, content scrolls under it ===== */
const LW = 60; // width of fixed left column (eye + lock)
const TL = {
  pps: 70, sc: null, inner: null, hooks: {},
  init(sc, hooks) {
    this.sc = sc; this.hooks = hooks;
    sc.addEventListener('scroll', () => {
      const t = sc.scrollLeft / this.pps;
      if (Math.abs(t - E.t) * this.pps < 0.75) return;
      hooks.scrub(clamp(t, 0, E.P.dur));
    }, { passive: true });
    sc.addEventListener('touchstart', e => { if (E.playing) hooks.pause(); }, { passive: true });
    let pd = 0;
    sc.addEventListener('touchmove', e => {
      if (e.touches.length !== 2) return;
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pd) { this.pps = clamp(this.pps * d / pd, 20, 400); this.build(); this.setTime(E.t); }
      pd = d;
    }, { passive: true });
    sc.addEventListener('touchend', () => { pd = 0; }, { passive: true });
  },
  cx() { return this.sc.clientWidth / 2; },
  x(t) { return (this.cx() - LW) + t * this.pps; }, // x inside a track
  build() {
    const sc = this.sc, P = E.P, cx = this.cx(), padL = cx - LW, W = padL + P.dur * this.pps + cx;
    let h = '<div class="tlin" style="width:' + (LW + W) + 'px">';
    // ruler
    h += '<div class="trow ruler"><div class="lc"></div><div class="trk" style="width:' + W + 'px">';
    const step = this.pps >= 120 ? 0.5 : this.pps >= 45 ? 1 : this.pps >= 28 ? 2 : 5;
    for (let s = 0; s <= P.dur + 1e-6; s += step) {
      const big = Math.abs(s - Math.round(s)) < 1e-6;
      h += '<i class="tk' + (big ? ' b' : '') + '" style="left:' + (padL + s * this.pps) + 'px">' + (big ? '<b>' + Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0') + '</b>' : '') + '</i>';
    }
    h += '<i class="endm" style="left:' + (padL + P.dur * this.pps) + 'px"></i></div></div>';
    // rows: top layer first
    for (let i = P.objects.length - 1; i >= 0; i--) {
      const o = P.objects[i];
      h += '<div class="trow lay' + (o.id === E.sel ? ' sel' : '') + '" data-id="' + o.id + '">' +
        '<div class="lc"><button class="ib eyeb' + (o.vis === false ? ' off' : '') + '" data-a="eye">' + ic(o.vis === false ? 'eyeoff' : 'eye', 18) + '</button>' +
        '<button class="ib lockb' + (o.lock ? ' on' : '') + '" data-a="lock">' + ic(o.lock ? 'lock' : 'unlock', 18) + '</button></div>' +
        '<div class="trk" style="width:' + W + 'px">' + this.bar(o, padL) + '</div></div>';
    }
    h += '</div>';
    const keep = sc.scrollTop;
    sc.innerHTML = h; sc.scrollTop = keep;
    sc.querySelectorAll('.lay').forEach(r => this.wire(r));
    sc.querySelector('.ruler').addEventListener('click', () => this.hooks.select(null));
    sc.scrollLeft = E.t * this.pps;
  },
  barIcon(o) {
    return { image: 'media', video: 'media', text: 'text', shape: 'shape', null: 'nul', camera: 'camera' }[o.type] || 'shape';
  },
  bar(o, padL) {
    const left = padL + o.t0 * this.pps, w = Math.max(14, (o.t1 - o.t0) * this.pps);
    const bg = o.type === 'image' ? ' style="background-image:url(' + mediaURL(o.file) + ')"' : '';
    let k = '';
    (o.kf || []).forEach(q => { k += '<u class="kd" data-t="' + q.t + '" style="left:' + ((q.t - o.t0) * this.pps) + 'px"></u>'; });
    return '<div class="bar ty-' + o.type + '" style="left:' + left + 'px;width:' + w + 'px">' +
      '<span class="thumb"' + bg + '>' + (bg ? '' : ic(this.barIcon(o), 15)) + '</span>' +
      '<span class="bn">' + esc(o.name || o.type) + '</span>' + k + '<s class="hd l"></s><s class="hd r"></s></div>';
  },
  wire(row) {
    const id = row.dataset.id, o = find(id), bar = row.querySelector('.bar'), self = this;
    row.querySelector('[data-a=eye]').onclick = e => { e.stopPropagation(); this.hooks.act(id, 'eye'); };
    row.querySelector('[data-a=lock]').onclick = e => { e.stopPropagation(); this.hooks.act(id, 'lock'); };
    row.querySelector('.trk').addEventListener('click', e => { if (e.target.classList.contains('trk')) this.hooks.select(null); });
    bar.querySelectorAll('.kd').forEach(d => d.addEventListener('click', e => { e.stopPropagation(); this.hooks.select(id); this.hooks.seek(parseFloat(d.dataset.t)); }));
    bar.addEventListener('click', e => { if (E.sel !== id) this.hooks.select(id); });
    let st = null;
    bar.addEventListener('pointerdown', e => {
      if (E.sel !== id || o.lock) return;
      const mode = e.target.classList.contains('hd') ? (e.target.classList.contains('l') ? 'l' : 'r') : 'm';
      st = { mode, x: e.clientX, t0: o.t0, t1: o.t1, kf: o.kf.map(k => k.t), vo: o.vo || 0, moved: false };
      bar.setPointerCapture(e.pointerId); e.preventDefault();
    });
    bar.addEventListener('pointermove', e => {
      if (!st) return;
      if (!st.moved) { pushUndo(); st.moved = true; }
      let dt = (e.clientX - st.x) / self.pps;
      const minLen = 0.2, vid = o.type === 'video';
      if (st.mode === 'm') {
        dt = Math.max(-st.t0, dt);
        o.t0 = st.t0 + dt; o.t1 = st.t1 + dt; o.kf.forEach((k, i) => { k.t = st.kf[i] + dt; });
      } else if (st.mode === 'l') {
        dt = clamp(dt, -st.t0, st.t1 - st.t0 - minLen);
        o.t0 = st.t0 + dt; if (vid) o.vo = Math.max(0, st.vo + dt * (o.speed || 1));
      } else {
        o.t1 = Math.max(st.t0 + minLen, st.t1 + dt);
      }
      const padL = self.cx() - LW;
      bar.style.left = (padL + o.t0 * self.pps) + 'px'; bar.style.width = Math.max(14, (o.t1 - o.t0) * self.pps) + 'px';
      bar.querySelectorAll('.kd').forEach((d, i) => { const q = o.kf[i]; d.style.left = ((q.t - o.t0) * self.pps) + 'px'; d.dataset.t = q.t; });
      E.P.updated = Date.now(); render();
    });
    const end = () => { if (!st) return; const m = st.moved; st = null; if (m) { autoDur(); this.hooks.changed(); } };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  },
  setSel(id) {
    this.sc.querySelectorAll('.lay').forEach(r => r.classList.toggle('sel', r.dataset.id === id));
  },
  setTime(t) {
    const x = t * this.pps;
    if (Math.abs(this.sc.scrollLeft - x) > 0.5) this.sc.scrollLeft = x;
  }
};
