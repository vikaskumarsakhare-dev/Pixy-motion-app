/* Pixy Motion - export to MP4 (frames are drawn here, encoded by the app) */
(function () {
  var X = { running: false, cancel: false };
  var FPS = 30;
  var quality = 1080;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function even(n) { n = Math.round(n); return n % 2 ? n + 1 : n; }
  function sizeFor(p, q) { var s = q / Math.min(p.w, p.h); return { w: even(p.w * s), h: even(p.h * s) }; }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  X.open = function () {
    var U = window.PixyUI, ed = U.getEd();
    if (!ed || !ed.p || X.running) return;
    if (!window.PixyNative) { U.toast(T('onlyApp')); return; }
    TL.pause(); ed.select(null);
    var p = ed.p, w = el('div');
    var info = el('div', 'note', ''); info.style.cssText = 'margin:0 0 6px;font-size:14px;color:var(--tx)';
    function showInfo() { var s = sizeFor(p, quality); info.textContent = s.w + '×' + s.h + ' · ' + p.dur + ' ' + T('secShort') + ' · ' + FPS + ' fps · MP4'; }
    showInfo(); w.appendChild(info);
    var q = el('div', 'btns');
    [[720, 'q720'], [1080, 'q1080']].forEach(function (o) {
      var b = el('button', 'btn' + (quality === o[0] ? ' on' : ''), esc(T(o[1])));
      b.addEventListener('click', function () {
        quality = o[0]; showInfo();
        Array.prototype.forEach.call(q.children, function (x) { x.classList.remove('on'); }); b.classList.add('on');
      });
      q.appendChild(b);
    });
    w.appendChild(q);
    w.appendChild(el('div', 'note', esc(T('keepOpen'))));
    var go = el('div', 'btns');
    var c = el('button', 'btn', esc(T('cancel'))); c.addEventListener('click', U.closeSheet);
    var s = el('button', 'btn pri', ICON('download', 20) + esc(T('startExport'))); s.addEventListener('click', function () { U.closeSheet(); run(); });
    go.appendChild(c); go.appendChild(s); w.appendChild(go);
    U.openSheet(T('exportTitle'), w);
  };

  function overlay() {
    var o = el('div', 'expov');
    o.innerHTML = '<div class="expbox"><h4>' + esc(T('exporting')) + '</h4><div class="expbar"><i id="expfill"></i></div>' +
      '<div class="expnum" id="expnum">0%</div><div class="note">' + esc(T('keepOpen')) + '</div></div>';
    var b = el('button', 'btn red', esc(T('cancel'))); b.style.marginTop = '14px'; b.style.width = '100%';
    b.addEventListener('click', function () { X.cancel = true; });
    o.firstChild.appendChild(b);
    document.body.appendChild(o);
    return o;
  }

  function result(ok, text) {
    var U = window.PixyUI, w = el('div');
    w.appendChild(el('div', null, '<div style="font-size:15px;line-height:1.6;white-space:pre-line">' + esc(text) + '</div>'));
    var b = el('div', 'btns'); var k = el('button', 'btn pri', esc(T('ok'))); k.addEventListener('click', U.closeSheet); b.appendChild(k); w.appendChild(b);
    U.openSheet(ok ? T('exportDone') : T('exportFail'), w);
  }

  async function run() {
    var U = window.PixyUI, ed = U.getEd(), p = ed.p, N = window.PixyNative;
    var sz = sizeFor(p, quality), W = sz.w, H = sz.h, n = Math.max(1, Math.round(p.dur * FPS));
    var title = p.name || 'PixyMotion';
    var hasVideo = p.objects.some(function (o) { return o.type === 'video'; });
    X.running = true; X.cancel = false;
    ed.select(null);
    try { N.keepAwake(true); } catch (e) {}
    var ov = overlay();
    var fill = document.getElementById('expfill'), num = document.getElementById('expnum');
    var done = false;
    try {
      var r = N.exportStart(W, H, FPS, title);
      if (r !== 'ok') throw new Error(r);
      var off = document.createElement('canvas'); off.width = W; off.height = H;
      var c = off.getContext('2d');
      for (var i = 0; i < n; i++) {
        if (X.cancel) { N.exportCancel(); break; }
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.scale(W / p.w, H / p.h);
        if (hasVideo) await ed.seekVideosTo(Math.min(p.dur, i / FPS));
        ed.renderTo(c, Math.min(p.dur, i / FPS));
        var url = off.toDataURL('image/jpeg', 0.93);
        var rr = N.exportFrame(url.substring(url.indexOf(',') + 1));
        if (rr !== 'ok') throw new Error(rr);
        var pct = Math.round((i + 1) * 100 / n);
        fill.style.width = pct + '%'; num.textContent = pct + '%  ·  ' + (i + 1) + ' / ' + n;
        await tick();
      }
      if (!X.cancel) {
        num.textContent = T('saving');
        await tick();
        var f = N.exportFinish();
        if (f.indexOf('ok:') !== 0) throw new Error(f);
        done = true;
        ov.remove();
        result(true, T('savedTo') + '\n' + f.substring(3));
      } else { ov.remove(); U.toast(T('exportCancelled')); }
    } catch (e) {
      try { N.exportCancel(); } catch (x) {}
      ov.remove();
      result(false, String(e && e.message ? e.message : e));
    }
    try { N.keepAwake(false); } catch (e) {}
    X.running = false;
    ed.render();
  }

  X.cancelNow = function () { X.cancel = true; };
  window.PixyExport = X;
})();
