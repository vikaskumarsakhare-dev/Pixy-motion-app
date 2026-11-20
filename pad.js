/* Pixy Motion - control pad (small precise changes). Page 1: move, size, turn, fade. Page 2: depth, tilt, side turn. */
(function () {
  var Pad = { open: false, ed: null, step: 1, page: 0, cb: {} };
  var STEPS = [{ px: 1, deg: 1, pct: 1, z: 5, k: 'fine' }, { px: 5, deg: 5, pct: 5, z: 25, k: 'normal' }, { px: 20, deg: 15, pct: 10, z: 100, k: 'big' }];
  var els = {}, labs = {}, pages = [];
  var RAD = Math.PI / 180;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* a button that repeats while it is held down */
  function hold(b, fn) {
    var tm = 0, iv = 0, active = false;
    function stop() {
      clearTimeout(tm); clearInterval(iv);
      if (active) { active = false; Pad.ed.commit(); }
    }
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (!Pad.ed.selObj()) return;
      if (Pad.cb.onPointer) Pad.cb.onPointer();
      active = true; fn(); Pad.refresh();
      tm = setTimeout(function () { iv = setInterval(function () { fn(); Pad.refresh(); }, 70); }, 350);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { b.addEventListener(n, stop); });
  }

  function arrow(rot) {
    return el('button', 'pb', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + rot + 'deg)"><path d="M12 19V5M5 12l7-7 7 7"/></svg>');
  }

  Pad.init = function (ed, cb) {
    Pad.ed = ed; Pad.cb = cb || {};
    var root = document.getElementById('pad');
    root.innerHTML = ''; pages = [];
    var left = el('div', 'pdpad');
    function cell(node) { left.appendChild(node); return node; }
    var S = function () { return STEPS[Pad.step]; };

    cell(el('span'));
    hold(cell(arrow(0)), function () { ed.adjust(0, -S().px, 0, 1); });
    cell(el('span'));
    hold(cell(arrow(-90)), function () { ed.adjust(-S().px, 0, 0, 1); });
    var ce = cell(el('button', 'pb mid', '<span data-i="padCenter"></span>'));
    ce.addEventListener('click', function () { if (ed.selObj()) { ed.centerSel(); Pad.refresh(); } });
    hold(cell(arrow(90)), function () { ed.adjust(S().px, 0, 0, 1); });
    cell(el('span'));
    hold(cell(arrow(180)), function () { ed.adjust(0, S().px, 0, 1); });
    cell(el('span'));
    root.appendChild(left);

    var right = el('div', 'pdr');
    var top = el('div', 'pdxy'); els.xy = top; right.appendChild(top);

    function row(pg, key, minus, plus, valId) {
      var r = el('div', 'pdrow'); if (pg) r.classList.add('hidden');
      var lb = el('label', null, ''); labs[valId] = lb; lb.setAttribute('data-k', key);
      r.appendChild(lb);
      var m = el('button', 'pb sm', '−'); var v = el('div', 'pdv', ''); var p = el('button', 'pb sm', '+');
      hold(m, minus); hold(p, plus);
      r.appendChild(m); r.appendChild(v); r.appendChild(p);
      els[valId] = v; right.appendChild(r); pages.push({ pg: pg, node: r });
    }
    function sgn(n) { return function () { return n; }; }
    row(0, 'padSize', function () { ed.adjust(0, 0, 0, 1 - S().pct / 100); }, function () { ed.adjust(0, 0, 0, 1 + S().pct / 100); }, 'vs');
    row(0, 'padTurn', function () { ed.adjust(0, 0, -S().deg * RAD, 1); }, function () { ed.adjust(0, 0, S().deg * RAD, 1); }, 'vr');
    row(0, 'padFade', function () { ed.nudge('op', -S().pct / 100); }, function () { ed.nudge('op', S().pct / 100); }, 'vo');
    row(1, 'padDepth', function () { ed.nudge('z', -S().z); }, function () { ed.nudge('z', S().z); }, 'vz');
    row(1, 'padTilt', function () { ed.nudge('rx', -S().deg * RAD); }, function () { ed.nudge('rx', S().deg * RAD); }, 'vx');
    row(1, 'padSide', function () { ed.nudge('ry', -S().deg * RAD); }, function () { ed.nudge('ry', S().deg * RAD); }, 'vy');

    var st = el('div', 'pdstep');
    STEPS.forEach(function (s, i) {
      var b = el('button', 'chip' + (i === Pad.step ? ' on' : ''), '<span data-i="pad_' + s.k + '"></span>');
      b.addEventListener('click', function () { Pad.step = i; Array.prototype.forEach.call(st.querySelectorAll('.stp'), function (x, j) { x.classList.toggle('on', j === i); }); });
      b.classList.add('stp');
      st.appendChild(b);
    });
    var pg = el('button', 'chip pgb', '3D'); pg.addEventListener('click', function () {
      Pad.page = Pad.page ? 0 : 1; Pad.showPage();
    });
    st.appendChild(pg); els.pgb = pg;
    var cl = el('button', 'chip close', ICON('x', 16)); cl.addEventListener('click', function () { Pad.toggle(false); });
    st.appendChild(cl);
    right.appendChild(st);
    root.appendChild(right);
    if (window.applyI18n) applyI18n();
    Pad.showPage();
  };

  Pad.showPage = function () {
    pages.forEach(function (r) { r.node.classList.toggle('hidden', r.pg !== Pad.page); });
    if (els.pgb) { els.pgb.textContent = Pad.page ? '2D' : '3D'; els.pgb.classList.toggle('on', !!Pad.page); }
    Pad.refresh();
  };

  Pad.toggle = function (on) {
    Pad.open = on == null ? !Pad.open : on;
    document.getElementById('pad').classList.toggle('hidden', !Pad.open);
    Pad.refresh();
    if (Pad.cb.onResize) Pad.cb.onResize();
  };

  function deg(r) { var d = Math.round(r / RAD); return d + '°'; }

  Pad.refresh = function () {
    if (!Pad.open || !Pad.ed || !Pad.ed.p) return;
    var ed = Pad.ed, o = ed.selObj();
    var cam = o && o.type === 'camera';
    if (labs.vs) {
      labs.vs.textContent = T(cam ? 'padZoom' : 'padSize');
      labs.vr.textContent = T('padTurn'); labs.vo.textContent = T('padFade');
      labs.vz.textContent = T(cam ? 'padMoveIn' : 'padDepth'); labs.vx.textContent = T('padTilt'); labs.vy.textContent = T('padSide');
    }
    if (!o) { els.xy.textContent = '—'; ['vs', 'vr', 'vo', 'vz', 'vx', 'vy'].forEach(function (k) { els[k].textContent = '—'; }); return; }
    var q = ed.pose(o);
    var d = Math.round(q.rot / RAD) % 360; if (d < 0) d += 360;
    els.xy.textContent = 'X ' + Math.round(q.x) + '   Y ' + Math.round(q.y) + '   Z ' + Math.round(q.z);
    els.vs.textContent = (o.type === 'camera' || o.type === 'null') ? Math.round(q.sc * 100) + '%' : Math.round(o.w * q.sc);
    els.vr.textContent = d + '°';
    els.vo.textContent = cam ? '—' : Math.round(q.op * 100) + '%';
    els.vz.textContent = Math.round(q.z);
    els.vx.textContent = (cam || o.type === 'null') ? '—' : deg(q.rx);
    els.vy.textContent = (cam || o.type === 'null') ? '—' : deg(q.ry);
  };

  window.Pad = Pad;
})();
