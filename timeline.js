/* Pixy Motion - timeline bar, rows, playback */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LBL = 78;
  var TL = { ed: null, cb: {}, open: false, pps: 0, playing: false, raf: 0, last: 0, userZoom: false };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function snap(v) { return Math.round(v * 10) / 10; }
  function fmt(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  TL.init = function (ed, cb) {
    TL.ed = ed; TL.cb = cb || {};
    $('tlPlay').addEventListener('click', function () { TL.playing ? TL.pause() : TL.play(); });
    $('tlSeek').addEventListener('input', function () { TL.pause(); ed.setTime(parseFloat(this.value)); });
    $('tlSeek').addEventListener('change', function () { if (TL.cb.onSeekEnd) TL.cb.onSeekEnd(); });
    $('tlOpen').addEventListener('click', function () { TL.toggle(); });
    $('tlDur').addEventListener('click', TL.durSheet);
    $('tlZm').addEventListener('click', function () { TL.zoom(0.7); });
    $('tlZp').addEventListener('click', function () { TL.zoom(1.4); });
    TL.icons();
  };
  TL.icons = function () {
    $('tlPlay').innerHTML = ICON(TL.playing ? 'pause' : 'play', 24);
    $('tlOpen').innerHTML = ICON(TL.open ? 'down' : 'up', 22);
    $('tlZm').innerHTML = ICON('minus', 18); $('tlZp').innerHTML = ICON('plus', 18);
  };
  TL.toggle = function () {
    TL.open = !TL.open;
    $('tlrows').classList.toggle('hidden', !TL.open);
    TL.icons(); TL.render();
    if (TL.cb.onResize) TL.cb.onResize();
  };
  TL.zoom = function (f) {
    TL.userZoom = true; TL.pps = clamp(TL.pps * f, 8, 400); TL.render();
  };

  /* playback */
  TL.play = function () {
    var ed = TL.ed; if (!ed.p) return;
    if (ed.t >= ed.p.dur - 0.02) ed.setTime(0);
    TL.playing = true; TL.last = performance.now(); TL.icons();
    ed.select(null);
    TL.raf = requestAnimationFrame(function f(now) {
      if (!TL.playing) return;
      var dt = (now - TL.last) / 1000; TL.last = now;
      var t = ed.t + dt;
      if (t >= ed.p.dur) { ed.setTime(ed.p.dur); TL.pause(); return; }
      ed.setTime(t);
      TL.raf = requestAnimationFrame(f);
    });
  };
  TL.pause = function () {
    if (!TL.playing) return;
    TL.playing = false; cancelAnimationFrame(TL.raf); TL.icons();
    if (TL.cb.onSeekEnd) TL.cb.onSeekEnd();
  };

  /* time display */
  TL.setTime = function (t) {
    var ed = TL.ed;
    $('tlSeek').value = t; $('tlTime').textContent = fmt(t) + ' / ' + fmt(ed.p.dur);
    var ph = $('tlph');
    if (ph) {
      ph.style.left = (LBL + t * TL.pps) + 'px';
      var sc = $('tlscroll'), x = LBL + t * TL.pps;
      if (TL.open && (x < sc.scrollLeft + LBL || x > sc.scrollLeft + sc.clientWidth - 20)) sc.scrollLeft = Math.max(0, x - LBL - 20);
    }
  };

  /* build rows */
  TL.render = function () {
    var ed = TL.ed; if (!ed || !ed.p) return;
    var p = ed.p;
    $('tlSeek').max = p.dur; $('tlSeek').value = ed.t;
    $('tlTime').textContent = fmt(ed.t) + ' / ' + fmt(p.dur);
    $('tlDur').textContent = p.dur + ' ' + T('secShort');
    if (!TL.open) return;
    var sc = $('tlscroll');
    if (!TL.pps || !TL.userZoom) TL.pps = Math.max(24, (sc.clientWidth - LBL - 24) / p.dur);
    var pps = TL.pps, width = LBL + p.dur * pps + 40;
    var box = $('tlin'); var keepL = sc.scrollLeft, keepT = sc.scrollTop;
    box.innerHTML = ''; box.style.width = width + 'px';

    var ruler = el('div', 'tlruler'); ruler.style.width = width + 'px';
    var step = pps >= 60 ? 1 : (pps >= 24 ? 2 : 5);
    for (var s = 0; s <= p.dur; s += step) {
      var tk = el('div', 'tick', '<span>' + s + '</span>'); tk.style.left = (LBL + s * pps) + 'px'; ruler.appendChild(tk);
    }
    function seekFrom(e) {
      var r = box.getBoundingClientRect();
      TL.pause(); ed.setTime(snap((e.clientX - r.left - LBL) / pps));
    }
    ruler.addEventListener('pointerdown', function (e) {
      ruler.setPointerCapture(e.pointerId); seekFrom(e);
      function mv(ev) { seekFrom(ev); }
      function up() { ruler.removeEventListener('pointermove', mv); ruler.removeEventListener('pointerup', up); ruler.removeEventListener('pointercancel', up); if (TL.cb.onSeekEnd) TL.cb.onSeekEnd(); }
      ruler.addEventListener('pointermove', mv); ruler.addEventListener('pointerup', up); ruler.addEventListener('pointercancel', up);
    });
    box.appendChild(ruler);

    if (!p.objects.length) box.appendChild(el('div', 'tlempty', esc(T('noLayers'))));

    p.objects.slice().reverse().forEach(function (o) {
      var row = el('div', 'tlrow' + (o.id === ed.sel ? ' sel' : '')); row.style.width = width + 'px'; row.setAttribute('data-id', o.id);
      var name = window.layerName(o, ed);
      var ic = { text: 'text', image: 'image', video: 'video', 'null': 'group', camera: 'camera' }[o.type] || 'shape';
      var lab = el('div', 'tllab', ICON(ic, 14) + '<span>' + esc((o.par ? '↳ ' : '') + name) + '</span>');
      lab.addEventListener('click', function () { ed.select(o.id); });
      row.appendChild(lab);
      var fixed = o.type === 'null' || o.type === 'camera';
      var t0 = fixed ? 0 : (o.t0 || 0), t1 = fixed ? p.dur : (o.t1 == null ? p.dur : o.t1);
      var bar = el('div', 'tlbar2 ' + o.type + (fixed ? ' fixed' : ''));
      function place() { bar.style.left = (LBL + t0 * pps) + 'px'; bar.style.width = Math.max(14, (t1 - t0) * pps) + 'px'; }
      place();
      var hl = el('i', 'hdl l'), hr = el('i', 'hdl r');
      bar.appendChild(hl); bar.appendChild(hr);
      function drag(target, mode) {
        target.addEventListener('pointerdown', function (e) {
          e.stopPropagation(); e.preventDefault();
          try { target.setPointerCapture(e.pointerId); } catch (x) {}
          ed.select(o.id);
          var x0 = e.clientX, a0 = t0, b0 = t1, len = b0 - a0, vs0 = o.vs || 0, isV = o.type === 'video';
          function mv(ev) {
            var dt = (ev.clientX - x0) / pps, a = a0, b = b0;
            if (mode === 'move') { a = clamp(a0 + dt, 0, p.dur - len); b = a + len; }
            else if (mode === 'l') a = clamp(a0 + dt, isV ? Math.max(0, a0 - vs0) : 0, b0 - 0.1);
            else b = clamp(b0 + dt, a0 + 0.1, isV ? Math.min(p.dur, a0 + (o.vdur - vs0)) : p.dur);
            a = snap(a); b = snap(b);
            if (isV && mode === 'l') o.vs = clamp(vs0 + (a - a0), 0, Math.max(0, o.vdur - 0.1));
            t0 = a; t1 = b; o.t0 = a; o.t1 = b >= p.dur - 0.001 ? null : b;
            place(); ed.render();
          }
          function up() {
            target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up);
            ed.commit();
          }
          target.addEventListener('pointermove', mv); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
        });
      }
      if (fixed) { hl.style.display = hr.style.display = 'none'; bar.addEventListener('click', function () { ed.select(o.id); }); }
      else { drag(bar, 'move'); drag(hl, 'l'); drag(hr, 'r'); }
      row.appendChild(bar);
      if (ed.isAnim(o)) {
        o.kf.forEach(function (k) {
          var d = el('b', 'dia'); d.style.left = (LBL + k.t * pps - 7) + 'px';
          d.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          d.addEventListener('click', function (e) { e.stopPropagation(); TL.pause(); ed.select(o.id); ed.setTime(k.t); if (TL.cb.onSeekEnd) TL.cb.onSeekEnd(); });
          row.appendChild(d);
        });
      }
      box.appendChild(row);
    });
    var ph = el('div', 'tlph'); ph.id = 'tlph'; ph.style.left = (LBL + ed.t * pps) + 'px';
    box.appendChild(ph);
    sc.scrollLeft = keepL; sc.scrollTop = keepT;
  };

  TL.highlight = function () {
    var ed = TL.ed, rows = document.querySelectorAll('#tlin .tlrow');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('sel', rows[i].getAttribute('data-id') === ed.sel);
  };

  /* duration sheet */
  TL.durSheet = function () {
    var U = window.PixyUI, ed = TL.ed; if (!U || !ed.p) return;
    var w = el('div');
    var val = el('div', null, ''); val.style.cssText = 'font-size:26px;font-weight:600;margin:4px 0 8px';
    function show(v) { val.textContent = v + ' ' + T('secShort'); }
    show(ed.p.dur);
    w.appendChild(val);
    var r = el('div', 'row');
    var s = el('input'); s.type = 'range'; s.min = 1; s.max = 60; s.step = 0.5; s.value = ed.p.dur; s.style.flex = 1; s.style.accentColor = '#7c5cff';
    s.addEventListener('input', function () { show(parseFloat(s.value)); });
    s.addEventListener('change', function () { ed.setDur(parseFloat(s.value)); TL.pps = 0; TL.userZoom = false; TL.render(); });
    r.appendChild(s); w.appendChild(r);
    var chips = el('div', 'btns');
    [3, 5, 10, 15, 30, 60].forEach(function (v) {
      var b = el('button', 'btn' + (ed.p.dur === v ? ' on' : ''), v + ' ' + T('secShort'));
      b.addEventListener('click', function () { ed.setDur(v); TL.pps = 0; TL.userZoom = false; TL.render(); U.closeSheet(); });
      chips.appendChild(b);
    });
    w.appendChild(chips);
    U.openSheet(T('duration'), w);
  };

  window.TL = TL;
})();
