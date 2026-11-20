/* Pixy Motion - screens, sheets, wiring */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var S = { cur: null, ed: null, saveT: null, backAt: 0, sheetOn: false, ver: (window.PIXY_VERSION || 'dev') };
  var PALETTE = ['#ffffff', '#000000', '#ff5ca0', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be',
    '#0a84ff', '#5e5ce6', '#bf5af2', '#8e8e93', '#c7a26b', '#7a4b2a', '#1b1b26', '#f5efe0'];
  var SIZES = [{ w: 1080, h: 1920, k: 'vertical' }, { w: 1920, h: 1080, k: 'horizontal' }, { w: 1080, h: 1080, k: 'square' }];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(m) {
    var t = $('toast'); t.textContent = m; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add('hidden'); }, 1800);
  }

  /* ---------- sheet ---------- */
  function openSheet(title, node) {
    var sh = $('sheet'); sh.innerHTML = '';
    if (title) { var h = document.createElement('h4'); h.textContent = title; sh.appendChild(h); }
    sh.appendChild(node);
    $('sheetbg').classList.remove('hidden'); sh.classList.remove('hidden');
    S.sheetOn = true;
  }
  function closeSheet() {
    $('sheetbg').classList.add('hidden'); $('sheet').classList.add('hidden'); $('sheet').innerHTML = '';
    S.sheetOn = false;
  }
  $('sheetbg').addEventListener('click', closeSheet);

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(label, cls, fn) { var b = el('button', 'btn ' + (cls || ''), label); b.addEventListener('click', fn); return b; }

  window.PixyUI = { openSheet: openSheet, closeSheet: closeSheet, toast: toast, getEd: function () { return S.ed; } };

  /* ---------- storage ---------- */
  function saveNow(withThumb) {
    var p = S.cur; if (!p) return Promise.resolve();
    p.updated = Date.now();
    if (withThumb && S.ed) { try { p.thumb = S.ed.thumb(); } catch (e) {} }
    return DB.put('projects', p).catch(function () { toast('Save failed'); });
  }
  function scheduleSave() { clearTimeout(S.saveT); S.saveT = setTimeout(function () { saveNow(false); }, 500); }
  function flush() { clearTimeout(S.saveT); return saveNow(true); }
  document.addEventListener('visibilitychange', function () { if (document.hidden && S.cur) flush(); });
  window.addEventListener('pagehide', function () { if (S.cur) flush(); });

  /* ---------- home ---------- */
  function fmtDate(t) {
    var d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function renderHome() {
    DB.all('projects').then(function (list) {
      list.sort(function (a, b) { return b.updated - a.updated; });
      var box = $('plist'); box.innerHTML = '';
      if (!list.length) {
        box.appendChild(el('div', 'empty', '<img src="icon.png" alt=""><h3>' + esc(T('emptyTitle')) + '</h3><div>' + esc(T('emptyBody')) + '</div>'));
        return;
      }
      box.appendChild(el('div', 'hh', esc(T('projects'))));
      list.forEach(function (p) {
        var c = el('div', 'card');
        c.innerHTML = '<div class="th">' + (p.thumb ? '<img src="' + p.thumb + '" alt="">' : '') + '</div><div class="meta"><b>' + esc(p.name) + '</b><span>' + p.w + '×' + p.h + ' · ' + fmtDate(p.updated) + '</span></div>';
        var d = el('button', 'dots', ICON('dots')); d.setAttribute('aria-label', 'More');
        d.addEventListener('click', function (e) { e.stopPropagation(); projMenu(p); });
        c.appendChild(d);
        c.addEventListener('click', function () { openProject(p.id); });
        box.appendChild(c);
      });
    });
  }
  function projMenu(p) {
    var w = el('div');
    w.appendChild(el('div', 'btns')).append(
      btn(ICON('edit') + T('rename'), '', function () { askText(T('projectName'), p.name, false, function (v) { p.name = v || p.name; DB.put('projects', p).then(function () { closeSheet(); renderHome(); }); }); }),
      btn(ICON('copy') + T('duplicate'), '', function () { dupProject(p); }),
      btn(ICON('trash') + T('delProject'), 'red', function () { confirmDel(p); })
    );
    openSheet(p.name, w);
  }
  function confirmDel(p) {
    var w = el('div', null, '<div style="margin-bottom:6px">' + esc(T('confirmDelete')) + '</div>');
    var b = el('div', 'btns');
    b.appendChild(btn(T('cancel'), '', closeSheet));
    b.appendChild(btn(T('del'), 'red', function () {
      var ids = {}; (p.objects || []).forEach(function (o) { if (o.type === 'image') ids[o.img] = 1; });
      DB.del('projects', p.id).then(function () { return DB.all('projects'); }).then(function (rest) {
        var used = {}; rest.forEach(function (q) { q.objects.forEach(function (o) { if (o.type === 'image') used[o.img] = 1; }); });
        return Promise.all(Object.keys(ids).filter(function (k) { return !used[k]; }).map(function (k) { return DB.del('images', k); }));
      }).then(function () { closeSheet(); renderHome(); });
    }));
    w.appendChild(b); openSheet(T('delProject'), w);
  }
  function dupProject(p) {
    var c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' 2'; c.updated = Date.now();
    DB.put('projects', c).then(function () { closeSheet(); renderHome(); });
  }

  function newSheet() {
    var w = el('div', 'sizes');
    SIZES.forEach(function (s) {
      var big = 54, ww = s.w >= s.h ? big : Math.round(big * s.w / s.h), hh = s.h >= s.w ? big : Math.round(big * s.h / s.w);
      var b = el('button', 'sz', '<u style="width:' + ww + 'px;height:' + hh + 'px"></u><span>' + esc(T(s.k)) + '</span>');
      b.addEventListener('click', function () { createProject(s.w, s.h); });
      w.appendChild(b);
    });
    openSheet(T('chooseSize'), w);
  }
  function createProject(w, h) {
    DB.all('projects').then(function (list) {
      var p = { id: uid(), name: T('projectWord') + ' ' + (list.length + 1), w: w, h: h, bg: '#1b1b26', dur: 5, objects: [], updated: Date.now(), thumb: '' };
      return DB.put('projects', p).then(function () { closeSheet(); openProject(p.id); });
    });
  }

  /* ---------- editor ---------- */
  function showScreen(name) {
    $('home').classList.toggle('hidden', name !== 'home');
    $('editor').classList.toggle('hidden', name !== 'editor');
  }
  function fit() {
    var st = $('stage'), p = S.cur; if (!p) return;
    var cw = st.clientWidth, ch = st.clientHeight, m = 16;
    var k = Math.min((cw - m * 2) / p.w, (ch - m * 2) / p.h);
    var w = Math.floor(p.w * k), h = Math.floor(p.h * k);
    ['cv', 'ov'].forEach(function (id) {
      var c = $(id); c.style.width = w + 'px'; c.style.height = h + 'px';
      c.style.left = Math.floor((cw - w) / 2) + 'px'; c.style.top = Math.floor((ch - h) / 2) + 'px';
    });
    if (S.ed) S.ed.renderOv();
  }
  window.addEventListener('resize', function () { setTimeout(fit, 60); });

  function openProject(id) {
    DB.get('projects', id).then(function (p) {
      if (!p) return;
      S.cur = p; showScreen('editor');
      $('pname').textContent = p.name;
      S.ed.load(p); TL.pps = 0; TL.userZoom = false; fit(); refreshUI(); TL.render(); TL.setTime(0);
      var ids = {}; p.objects.forEach(function (o) { if (o.type === 'image') ids[o.img] = 1; });
      Object.keys(ids).forEach(function (iid) {
        DB.get('images', iid).then(function (rec) {
          if (!rec) return;
          var url = URL.createObjectURL(rec.blob), im = new Image();
          im.onload = function () { if (S.ed.p === p) { S.ed.imgs[iid] = im; S.ed.render(); } };
          im.src = url;
        });
      });
    });
  }
  function leaveEditor() {
    TL.pause(); closeSheet();
    flush().then(function () { S.cur = null; S.ed.p = null; showScreen('home'); renderHome(); });
  }

  function refreshUI() {
    $('btnUndo').classList.toggle('dis', !S.ed.canUndo());
    $('btnRedo').classList.toggle('dis', !S.ed.canRedo());
    buildCtx();
  }
  function buildCtx() {
    var bar = $('ctxbar'), o = S.ed.selObj();
    bar.innerHTML = '';
    if (!o) { bar.appendChild(el('div', 'note', esc(T('tapHint')))); bar.firstChild.style.cssText = 'margin:0;padding:17px 10px'; return; }
    function cb(icon, label, fn, cls) {
      var b = el('button', 'cb ' + (cls || ''), ICON(icon, 22) + '<span>' + esc(label) + '</span>');
      b.addEventListener('click', fn); bar.appendChild(b);
    }
    if (o.type === 'text') cb('edit', T('edit'), function () { editText(o); });
    if (!S.ed.isAnim(o)) {
      cb('route', T('move'), function () { S.ed.animate(); toast(T('moveHint')); });
    } else {
      cb('route', T('speed'), speedSheet);
      var here = S.ed.hasStopHere(o);
      cb(here ? 'minus' : 'plus', here ? T('removeStop') : T('addStop'), function () {
        if (S.ed.toggleStop() === 'min') toast(T('minStops'));
      });
      cb('x', T('stopMove'), function () { S.ed.stopAnim(); }, 'red');
    }
    cb('sliders', T('style'), function () { styleSheet(); });
    cb('copy', T('duplicate'), function () { S.ed.dup(); });
    cb('flip', T('flip'), function () { S.ed.flipSel(); });
    cb('up', T('forward'), function () { S.ed.move(o.id, 1); });
    cb('down', T('backward'), function () { S.ed.move(o.id, -1); });
    cb('trash', T('del'), function () { S.ed.del(); }, 'red');
  }

  /* text edit */
  function askText(title, val, multi, cb) {
    var w = el('div');
    var inp = multi ? el('textarea') : el('input'); if (!multi) inp.type = 'text';
    inp.value = val || ''; inp.placeholder = T('typeHere');
    w.appendChild(inp);
    var b = el('div', 'btns');
    b.appendChild(btn(T('cancel'), '', closeSheet));
    b.appendChild(btn(ICON('check') + T('ok'), 'pri', function () { var v = inp.value; closeSheet(); cb(v); }));
    w.appendChild(b); openSheet(title, w);
    setTimeout(function () { inp.focus(); }, 80);
  }
  function editText(o) {
    askText(T('edit'), o.text, true, function (v) { if (v.trim() && S.ed.byId(o.id)) { S.ed.select(o.id); S.ed.setProp('text', v); } });
  }

  /* colours */
  function swatches(cur, onPick) {
    var w = el('div', 'sw');
    PALETTE.forEach(function (c) {
      var i = el('i', c.toLowerCase() === String(cur).toLowerCase() ? 'on' : ''); i.style.background = c;
      i.addEventListener('click', function () { onPick(c, false); Array.prototype.forEach.call(w.querySelectorAll('i'), function (x) { x.classList.remove('on'); }); i.classList.add('on'); });
      w.appendChild(i);
    });
    var cp = el('input'); cp.type = 'color'; cp.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff'; cp.title = T('custom');
    cp.addEventListener('input', function () { onPick(cp.value, true); });
    cp.addEventListener('change', function () { onPick(cp.value, false); });
    w.appendChild(cp);
    return w;
  }
  function slider(label, min, max, step, val, onLive, onDone) {
    var r = el('div', 'row'); r.appendChild(el('label', null, esc(label)));
    var s = el('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val;
    s.addEventListener('input', function () { onLive(parseFloat(s.value)); });
    s.addEventListener('change', function () { onDone(parseFloat(s.value)); });
    r.appendChild(s); return r;
  }
  function styleSheet() {
    var o = S.ed.selObj(); if (!o) return;
    var w = el('div');
    if (o.type === 'text') {
      w.appendChild(slider(T('size'), 20, 400, 1, o.fs, function (v) { S.ed.setProp('fs', v, true); }, function () { S.ed.commit(); }));
      w.appendChild(swatches(o.color, function (c, live) { S.ed.setProp('color', c, live); }));
      var r = el('div', 'btns');
      var bb = btn(ICON('text') + T('bold'), o.bold ? 'on' : '', function () { o.bold = !o.bold; S.ed.setProp('bold', o.bold); bb.classList.toggle('on', o.bold); });
      r.appendChild(bb);
      w.appendChild(r);
      var fr = el('div', 'btns');
      ['sans', 'serif', 'mono', 'hand'].forEach(function (f) {
        var b = btn(T(f), o.font === f ? 'on' : '', function () { S.ed.setProp('font', f); Array.prototype.forEach.call(fr.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
        fr.appendChild(b);
      });
      w.appendChild(fr);
    } else if (o.type === 'shape') {
      w.appendChild(swatches(o.color, function (c, live) { S.ed.setProp('color', c, live); }));
    }
    w.appendChild(slider(T('opacity'), 0, 1, 0.01, S.ed.pose(o).op, function (v) { S.ed.setOpacity(v, true); }, function () { S.ed.commit(); }));
    openSheet(T('style'), w);
  }

  function speedSheet() {
    var o = S.ed.selObj(); if (!o) return;
    var w = el('div'), cur = o.ease || 'smooth';
    w.appendChild(el('div', 'note', esc(T('speedHint'))));
    var box = el('div', 'btns');
    Editor.EASES.forEach(function (e) {
      var b = btn(T('e_' + e), cur === e ? 'on' : '', function () {
        S.ed.setEase(e);
        Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); }); b.classList.add('on');
      });
      box.appendChild(b);
    });
    w.appendChild(box); openSheet(T('speed'), w);
  }

  function shapeSheet() {
    var w = el('div', 'shp');
    [['circle', 'M12 3a9 9 0 100 18 9 9 0 000-18z'], ['rect', 'M4 6h16v12H4z'], ['round', 'M7 6h10a3 3 0 013 3v6a3 3 0 01-3 3H7a3 3 0 01-3-3V9a3 3 0 013-3z'],
     ['tri', 'M12 4l9 16H3z'], ['line', 'M4 12h16']].forEach(function (s) {
      var b = el('button', null, '<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" stroke="currentColor" stroke-width="' + (s[0] === 'line' ? 3 : 1) + '" stroke-linecap="round"><path d="' + s[1] + '"/></svg><span>' + esc(T(s[0])) + '</span>');
      b.addEventListener('click', function () { closeSheet(); S.ed.addShape(s[0]); });
      w.appendChild(b);
    });
    openSheet(T('shape'), w);
  }
  function bgSheet() {
    var w = el('div');
    w.appendChild(swatches(S.cur.bg, function (c, live) { S.ed.setBg(c, live); }));
    var done = el('div', 'btns'); done.appendChild(btn(ICON('check') + T('ok'), 'pri', function () { S.ed.commit(); closeSheet(); })); w.appendChild(done);
    openSheet(T('background'), w);
  }
  function layersSheet() {
    var w = el('div'), list = S.ed.p.objects;
    function draw() {
      w.innerHTML = '';
      if (!S.ed.p.objects.length) { w.appendChild(el('div', 'note', esc(T('noLayers')))); return; }
      S.ed.p.objects.slice().reverse().forEach(function (o) {
        var name = o.type === 'text' ? T('textLayer') + ': ' + String(o.text).replace(/\n/g, ' ') : (o.type === 'image' ? T('imageLayer') : T('shapeLayer') + ': ' + T(o.kind));
        var r = el('div', 'lrow' + (o.id === S.ed.sel ? ' sel' : ''));
        var nm = el('div', 'nm', esc(name)); nm.addEventListener('click', function () { S.ed.select(o.id); closeSheet(); });
        r.appendChild(nm);
        var ev = el('button', 'ib', ICON(o.vis === false ? 'eyeoff' : 'eye', 20)); ev.addEventListener('click', function () { S.ed.setObjProp(o.id, 'vis', o.vis === false); draw(); });
        var up = el('button', 'ib', ICON('up', 20)); up.addEventListener('click', function () { S.ed.move(o.id, 1); draw(); });
        var dn = el('button', 'ib', ICON('down', 20)); dn.addEventListener('click', function () { S.ed.move(o.id, -1); draw(); });
        var dl = el('button', 'ib', ICON('trash', 20)); dl.style.color = '#ff6b6b'; dl.addEventListener('click', function () { S.ed.select(o.id); S.ed.del(); draw(); });
        r.appendChild(ev); r.appendChild(up); r.appendChild(dn); r.appendChild(dl);
        w.appendChild(r);
      });
    }
    draw(); openSheet(T('layers'), w);
  }

  /* photos */
  function processImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var mx = Math.max(im.naturalWidth, im.naturalHeight), s = Math.min(1, 2000 / mx);
        var w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        var keepAlpha = /png|webp|gif/i.test(file.type);
        c.toBlob(function (b) {
          URL.revokeObjectURL(url);
          if (!b) return rej(new Error('blob'));
          var id = uid();
          DB.put('images', { id: id, blob: b, w: w, h: h }).then(function () { res({ id: id, w: w, h: h, canvas: c }); }, rej);
        }, keepAlpha ? 'image/png' : 'image/jpeg', 0.92);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      im.src = url;
    });
  }
  $('file').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []); this.value = '';
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return processImage(f); }).then(function (r) {
        S.ed.imgs[r.id] = r.canvas; S.ed.addImage(r.id, r.w, r.h);
      }).catch(function () { toast(T('photoFail')); });
    });
  });

  /* settings */
  function settingsSheet() {
    var w = el('div');
    var r = el('div', 'btns');
    [['en', 'English'], ['hi', 'हिंदी']].forEach(function (l) {
      r.appendChild(btn(l[1], getLang() === l[0] ? 'on' : '', function () { setLang(l[0]); closeSheet(); renderHome(); wireStatic(); }));
    });
    var lab = el('div', 'note', esc(T('language'))); lab.style.marginTop = '0'; lab.style.marginBottom = '6px';
    w.appendChild(lab); w.appendChild(r);
    w.appendChild(el('div', 'note', esc(T('storeNote'))));
    w.appendChild(el('div', 'note', esc(T('version')) + ': ' + esc(S.ver)));
    openSheet(T('settings'), w);
  }

  /* ---------- wiring ---------- */
  function wireStatic() {
    function lab(id, icon, key) { $(id).innerHTML = ICON(icon, 24) + '<span>' + esc(T(key)) + '</span>'; }
    lab('tPhoto', 'image', 'photo'); lab('tText', 'text', 'text'); lab('tShape', 'shape', 'shape');
    lab('tBg', 'palette', 'background'); lab('tLayers', 'layers', 'layers');
    $('btnSet').innerHTML = ICON('gear', 24); $('plusI').innerHTML = ICON('plus', 24);
    $('btnBack').innerHTML = ICON('back', 24); $('btnExport').innerHTML = ICON('download', 24); $('btnUndo').innerHTML = ICON('undo', 24); $('btnRedo').innerHTML = ICON('redo', 24);
    applyI18n();
    if (S.cur) buildCtx();
  }

  function init() {
    S.ed = new Editor($('cv'), $('ov'), {
      onChange: function () { scheduleSave(); refreshUI(); TL.render(); },
      onSelect: function () { buildCtx(); TL.highlight(); },
      onTime: function (t) { TL.setTime(t); },
      onPointer: function () { TL.pause(); }
    });
    TL.init(S.ed, { onResize: function () { fit(); }, onSeekEnd: function () { buildCtx(); } });
    wireStatic();
    $('btnSet').addEventListener('click', settingsSheet);
    $('btnNew').addEventListener('click', newSheet);
    $('btnBack').addEventListener('click', leaveEditor);
    $('btnExport').addEventListener('click', function () { PixyExport.open(); });
    $('btnUndo').addEventListener('click', function () { S.ed.undo(); });
    $('btnRedo').addEventListener('click', function () { S.ed.redo(); });
    $('pname').addEventListener('click', function () {
      askText(T('projectName'), S.cur.name, false, function (v) { if (v.trim()) { S.cur.name = v.trim(); $('pname').textContent = S.cur.name; scheduleSave(); } });
    });
    $('tPhoto').addEventListener('click', function () { $('file').click(); });
    $('tText').addEventListener('click', function () { S.ed.addText(T('yourText'), 'sans'); });
    $('tShape').addEventListener('click', shapeSheet);
    $('tBg').addEventListener('click', bgSheet);
    $('tLayers').addEventListener('click', layersSheet);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    renderHome();
  }

  /* Android back button: returns true if handled here */
  window.onAndroidBack = function () {
    if (window.PixyExport && PixyExport.running) { PixyExport.cancelNow(); return true; }
    if (S.sheetOn) { closeSheet(); return true; }
    if (S.cur) { leaveEditor(); return true; }
    var now = Date.now();
    if (now - S.backAt < 2000) return false;
    S.backAt = now; toast(T('exitHint')); return true;
  };

  init();
})();
