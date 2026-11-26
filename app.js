'use strict';
/* ===== App: screens, editor wiring, tools ===== */
const $ = id => document.getElementById(id);
const S = { panel: null, saveT: 0, drag: null, kfc: -1, upd: [], clip: null, H0: 0, pinch: null };
const COLORS = ['#ffffff', '#111111', '#8b5cf6', '#ec4899', '#22d3ee', '#facc15', '#34d399', '#f97316', '#ef4444', '#3b82f6'];

/* ---------- small UI helpers ---------- */
let toastT = 0;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1900); }
function sheet(html) {
  const ov = $('ov'); ov.innerHTML = '<div class="sheet">' + html + '</div>'; ov.classList.remove('hidden');
  ov.onclick = e => { if (e.target === ov) closeSheet(); };
  return ov.firstChild;
}
function closeSheet() { const ov = $('ov'); ov.classList.add('hidden'); ov.innerHTML = ''; }
function ask(title, val, extra) {
  return new Promise(res => {
    const s = sheet('<h3>' + esc(title) + '</h3><input class="tx" id="askin" value="' + esc(val || '') + '">' + (extra || '') + '<div class="row2"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + tr('ok') + '</button></div>');
    const i = s.querySelector('#askin'); setTimeout(() => { i.focus(); i.select(); }, 60);
    s.querySelector('#a0').onclick = () => { closeSheet(); res(null); };
    s.querySelector('#a1').onclick = () => { const v = i.value; closeSheet(); res(v); };
  });
}
function confirmBox(msg) {
  return new Promise(res => {
    const s = sheet('<h3>' + esc(msg) + '</h3><div class="row2"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + tr('ok') + '</button></div>');
    s.querySelector('#a0').onclick = () => { closeSheet(); res(false); };
    s.querySelector('#a1').onclick = () => { closeSheet(); res(true); };
  });
}
function listSheet(title, items) {
  const s = sheet((title ? '<h3>' + esc(title) + '</h3>' : '') + '<div class="list">' + items.map((it, i) => '<button data-i="' + i + '" class="' + (it.cls || '') + '">' + (it.icon ? ic(it.icon, 20) : '') + '<span>' + esc(it.label) + '</span></button>').join('') + '</div>');
  s.querySelectorAll('button').forEach(b => b.onclick = () => { closeSheet(); items[b.dataset.i].fn(); });
}

/* ---------- layout lock: preview never moves ---------- */
function lockLayout() {
  const H = Math.max(window.innerHeight, S.H0 || 0); S.H0 = H;
  $('editor').style.height = H + 'px';
  $('lower').style.height = clamp(Math.round(H * 0.43), 290, 360) + 'px';
}

/* ---------- static texts ---------- */
function paintStatic() {
  document.documentElement.lang = LANG === 'hi' ? 'hi' : 'en';
  $('hset').innerHTML = ic('gear', 24); $('fab').innerHTML = ic('plus', 30);
  $('bBack').innerHTML = ic('back', 24); $('bGroup').innerHTML = ic('group', 22); $('exp').innerHTML = ic('export', 22); $('bSet').innerHTML = ic('gear', 22);
  $('bBack2').innerHTML = ic('back', 24); $('bGroup2').innerHTML = ic('group', 22); $('bTrash').innerHTML = ic('trash', 22); $('bMore').innerHTML = ic('dots', 22);
  $('bUndo').innerHTML = ic('undo', 21); $('bRedo').innerHTML = ic('redo', 21);
  $('bFirst').innerHTML = ic('first', 20); $('bLast').innerHTML = ic('last', 20);
  $('bEdit').innerHTML = ic('edit', 22); $('bLayers').innerHTML = ic('layers', 22);
  $('kPrev').innerHTML = ic('prev', 18); $('kNext').innerHTML = ic('next', 18);
  $('excancel').textContent = tr('cancel'); $('exmsg').textContent = tr('exporting');
  $('menu').innerHTML = [['shape', 'shape'], ['media', 'media'], ['text', 'text'], ['element', 'element'], ['audio', 'audio'], ['template', 'template'], ['draw', 'draw'], ['vector', 'vector']]
    .map(([i, k]) => '<button data-k="' + k + '" class="' + (['template', 'vector'].includes(k) ? 'soon' : '') + '">' + ic(i, 24) + '<span>' + tr(k) + '</span></button>').join('');
  $('menu').querySelectorAll('button').forEach(b => b.onclick = () => menuTap(b.dataset.k));
  setPlayIcon();
}

/* ---------- home ---------- */
async function renderHome() {
  const list = (await DB.all()).sort((a, b) => b.updated - a.updated), el = $('plist');
  el.innerHTML = list.length ? list.map(p => '<div class="pc" data-id="' + p.id + '"><div class="th" style="' + (p.thumb ? 'background-image:url(' + p.thumb + ')' : '') + '">' + (p.thumb ? '' : ic('media', 30)) + '</div><div class="nm">' + esc(p.name) + '<small>' + p.w + '×' + p.h + ' · ' + Math.round(p.dur) + 's</small></div><button class="ib mb" data-m="' + p.id + '">' + ic('dots', 18) + '</button></div>').join('') : '<div id="empty">' + tr('empty') + '</div>';
  el.querySelectorAll('.pc').forEach(c => c.onclick = e => { if (e.target.closest('.mb')) return; openProject(c.dataset.id); });
  el.querySelectorAll('.mb').forEach(b => b.onclick = () => projMenu(b.dataset.m));
}
function projMenu(id) {
  listSheet('', [
    { icon: 'text', label: tr('rename'), fn: async () => { const p = await DB.get(id), v = await ask(tr('rename'), p.name); if (v && v.trim()) { p.name = v.trim(); await DB.put(p); renderHome(); } } },
    { icon: 'copy', label: tr('dup'), fn: async () => { const p = await DB.get(id); p.id = uid(); p.name += ' 2'; p.updated = Date.now(); await DB.put(p); renderHome(); } },
    { icon: 'trash', label: tr('del'), cls: 'red', fn: async () => { if (await confirmBox(tr('delq'))) { await DB.del(id); renderHome(); } } }
  ]);
}
const RATIOS = [['16:9', 16, 9], ['9:16', 9, 16], ['4:5', 4, 5], ['1:1', 1, 1], ['4:3', 4, 3]];
const BGS = [['#0b0b12', 'dark'], ['#000000', 'black'], ['#ffffff', 'white']];
// Screen setup sheet: used for a new project and (gear button) for the open project
function screenSheet(P, done) {
  const isNew = !P;
  const cur = P || { w: 1920, h: 1080, bg: '#0b0b12', fps: 30 };
  let rs = Math.min(cur.w, cur.h), fps = cur.fps || 30, bg = cur.bg, rt = RATIOS.findIndex(r => Math.abs(r[1] / r[2] - cur.w / cur.h) < 0.01), cw = cur.w, ch = cur.h;
  if (rt < 0) rt = 5;
  const draw = () => {
    const chip = (on, k, v, t) => '<button class="chip ' + (on ? 'on' : '') + '" data-' + k + '="' + v + '">' + t + '</button>';
    const s = sheet('<h3>' + tr(isNew ? 'newp' : 'scrsz') + '</h3>' +
      '<div class="chips">' + RATIOS.map((r, i) => chip(rt === i, 'r', i, r[0])).join('') + chip(rt === 5, 'r', 5, tr('custom')) + '</div>' +
      (rt === 5 ? '<div class="sl" style="margin-top:10px"><span>' + tr('wd') + '</span><input class="tx" id="cw" type="number" value="' + cw + '"><span style="margin-left:6px">' + tr('ht') + '</span><input class="tx" id="ch" type="number" value="' + ch + '"></div>' : '') +
      '<p class="pgh">' + tr('resol') + '</p><div class="chips">' + [720, 1080, 1440, 2160].map(v => chip(rs === v && rt !== 5, 'z', v, v + 'p')).join('') + '</div>' +
      '<p class="pgh">' + tr('frate') + '</p><div class="chips">' + [24, 30, 60].map(v => chip(fps === v, 'f', v, v + ' fps')).join('') + '</div>' +
      '<p class="pgh">' + tr('bgc') + '</p><div class="chips">' + BGS.map(b => chip(bg === b[0], 'b', b[0], tr(b[1]))).join('') + '</div>' +
      '<div class="row2" style="margin-top:16px"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + tr(isNew ? 'create' : 'apply') + '</button></div>');
    s.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { rt = +b.dataset.r; draw(); });
    s.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { rs = +b.dataset.z; draw(); });
    s.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { fps = +b.dataset.f; draw(); });
    s.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { bg = b.dataset.b; draw(); });
    const w = s.querySelector('#cw'), h = s.querySelector('#ch');
    if (w) { w.oninput = () => { cw = +w.value; }; h.oninput = () => { ch = +h.value; }; }
    s.querySelector('#a0').onclick = closeSheet;
    s.querySelector('#a1').onclick = () => {
      let W, H;
      if (rt === 5) { W = clamp(Math.round(cw) || 1920, 64, 4096); H = clamp(Math.round(ch) || 1080, 64, 4096); }
      else { const r = RATIOS[rt]; if (r[1] >= r[2]) { H = rs; W = Math.round(rs * r[1] / r[2]); } else { W = rs; H = Math.round(rs * r[2] / r[1]); } }
      closeSheet(); done({ w: W - (W % 2), h: H - (H % 2), bg, fps });
    };
  };
  draw();
}
function newProjectSheet() {
  screenSheet(null, async v => {
    const n = (await DB.all()).length + 1;
    const P = { id: uid(), name: tr('projname') + ' ' + n, w: v.w, h: v.h, bg: v.bg, fps: v.fps, dur: 0, objects: [], marks: [], thumb: '', updated: Date.now() };
    await DB.put(P); openProject(P.id);
  });
}
function projectScreenSheet() {
  if (!E.P) return;
  screenSheet(E.P, v => { pushUndo(); Object.assign(E.P, v); E.P.updated = Date.now(); scheduleSave(); fitCanvas($('stage')); render(); });
}
function settingsSheet() {
  const s = sheet('<h3>' + tr('settings') + '</h3><div class="sl"><span>' + tr('lang') + '</span></div><div class="chips"><button class="chip ' + (LANG === 'en' ? 'on' : '') + '" data-l="en">English</button><button class="chip ' + (LANG === 'hi' ? 'on' : '') + '" data-l="hi">हिन्दी</button></div><p style="margin-top:14px;color:var(--mut);font-size:12px">' + tr('ver') + ' ' + (window.PIXY_VERSION || 'dev') + '</p>');
  s.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { setLang(b.dataset.l); closeSheet(); paintStatic(); renderHome(); });
}

/* ---------- editor open/close ---------- */
async function openProject(id) {
  const P = await DB.get(id); if (!P) { try { localStorage.removeItem('pixyOpen'); } catch (e) {} return; }
  P.marks = P.marks || [];
  P.objects.forEach(o => {
    o.kf = o.kf || []; o.fx = o.fx || {};
    if (o.fx.blur && !o.bl) o.bl = o.fx.blur; if (o.fx.glow && !o.gl) o.gl = o.fx.glow; if (o.fx.shadow && !o.sh) o.sh = o.fx.shadow;
    delete o.fx.blur; delete o.fx.glow; delete o.fx.shadow;
  });
  E.P = P; fitDur(); E.vzc = undefined; E.sel = null; E.multi = null; E.t = clamp(P.lastT || 0, 0, P.dur); E.undo = []; E.redo = []; E.playing = false; E.cam = true; S.panel = null;
  E.cv = $('cv'); E.ctx = E.cv.getContext('2d');
  try { localStorage.setItem('pixyOpen', id); } catch (e) {}
  $('home').classList.add('hidden'); $('editor').classList.remove('hidden');
  $('pname').textContent = P.name; S.kfc = -1; lockLayout();
  requestAnimationFrame(() => { fitCanvas($('stage')); TL.build(); refreshAll(); });
}
async function closeEditor() {
  stopPlay(); pauseVideos(); clearTimeout(S.saveT);
  try { E.P.thumb = makeThumb(); } catch (e) {}
  E.P.lastT = 0;
  await DB.put(E.P);
  try { localStorage.removeItem('pixyOpen'); } catch (e) {}
  E.P = null; E.sel = null; E.multi = null; $('editor').classList.add('hidden'); $('home').classList.remove('hidden'); renderHome();
}
function makeThumb() {
  const P = E.P, W = 320, H = Math.round(320 * P.h / P.w), c = document.createElement('canvas'); c.width = W; c.height = H;
  renderTo(c.getContext('2d'), W, H, 0, {}); return c.toDataURL('image/jpeg', 0.7);
}
function scheduleSave() { clearTimeout(S.saveT); S.saveT = setTimeout(() => { if (E.P) { E.P.lastT = E.t; DB.put(E.P); } }, 700); }

/* ---------- time / selection ---------- */
function updLabel() {
  $('tm').textContent = fmtTime(E.t);
  const has = !!selObj(); $('kPrev').classList.toggle('hid', !has); $('kNext').classList.toggle('hid', !has);
}
function refreshPanel() {
  if (!E.sel) return;
  if (S.panel === 'pad') Pad.refresh(); else if (S.panel === 'camopt') CamOpt.refresh(); else if (S.panel) { S.upd.forEach(f => f()); refreshStrip(); }
}
function setTime(t, from) {
  E.t = clamp(t, 0, Math.max(0, E.P.dur)); updLabel();
  if (from !== 'scroll') TL.setTime(E.t); else TL.markKeys();
  syncVideos(E.t, E.playing); if (!E.playing) render();
  refreshPanel();
}
function refreshAll() {
  $('bUndo').classList.toggle('dis', !E.undo.length); $('bRedo').classList.toggle('dis', !E.redo.length);
  updLabel(); renderBottom(); render(); TL.setTime(E.t);
}
function select(id) {
  E.multi = null; E.pick = false;
  if (!id || id !== E.sel) S.panel = null; // a newly chosen layer always starts at its options screen
  E.sel = id;
  S.kfc = selObj() ? selObj().kf.length : -1;
  TL.setSel(); updLabel(); renderBottom(); render();
}
function onChange(kind) {
  if (!E.P) return;
  scheduleSave();
  $('bUndo').classList.toggle('dis', !E.undo.length); $('bRedo').classList.toggle('dis', !E.redo.length);
  const o = selObj();
  if (kind === 'struct') { TL.build(); renderBottom(); updLabel(); }
  else if (o && o.kf.length !== S.kfc) { S.kfc = o.kf.length; TL.build(); TL.setSel(); }
}
E.onchange = onChange;

/* ---------- playback ---------- */
let lastTs = 0;
function setPlayIcon() { $('play').innerHTML = ic(E.playing ? 'pause' : 'play', 22); }
function play() {
  if (E.P.dur <= 0) return;
  if (E.t >= E.P.dur - 0.02) setTime(0);
  E.playing = true; lastTs = 0; syncVideos(E.t, true); setPlayIcon(); requestAnimationFrame(loop);
}
function stopPlay() { E.playing = false; pauseVideos(); setPlayIcon(); if (E.P) render(); }
function loop(ts) {
  if (!E.playing) return;
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
  let t = E.t + dt, end = false;
  if (t >= E.P.dur) { t = E.P.dur; end = true; }
  E.t = t; syncVideos(t, true); drawNow(); updLabel(); TL.setTime(t);
  if (S.panel === 'pad' && E.sel) Pad.refresh(); else if (S.panel === 'camopt' && E.sel) CamOpt.refresh();
  if (end) { stopPlay(); return; }
  requestAnimationFrame(loop);
}

/* ---------- bottom area ---------- */
const TABS = [['pad', 'pad', 'move'], ['cam', 'cam3d', 'camera'], ['mask', 'mask', 'mask'], ['fx', 'effect', 'depth']];
const TABS_AUD = [['aud', 'audio', 'audio']];
const TABS_TXT = [['pad', 'pad', 'move'], ['txt', 'text', 'text'], ['cam', 'cam3d', 'camera'], ['mask', 'mask', 'mask'], ['fx', 'effect', 'depth']];
const TABS_CAM = [['pad', 'pad', 'move'], ['camopt', 'camopt', 'camera'], ['camfx', 'effects', 'depth']];
const PTITLE = { mask: 'mask', aud: 'audio', txt: 'text', pad: 'pad', cam: 'cam3d', fx: 'effect', camopt: 'camopt', camfx: 'effects', fxv: 'effvals' };
function updLayersIcon() {
  const b = $('bLayers'), o = selObj(), cs = !!(o && o.type === 'camera');
  b.classList.toggle('camon', cs && E.cam);
  b.innerHTML = cs ? ic(E.cam ? 'camera' : 'cameraoff', 22) : ic('layers', 22);
}
function updLinkIcon() {
  const o = selObj(); const linked = !!(o && (o.par || E.P.objects.some(q => q.par === o.id)));
  $('bGroup2').innerHTML = ic(linked ? 'groupc' : 'group', 22); $('bGroup2').classList.toggle('linked', linked);
}
function renderBottom() {
  const o = selObj(), multi = (E.multi && E.multi.length) || E.pick, view = multi ? 'multi' : o ? (S.panel ? 'panel' : 'layer') : 'idle';
  $('menu').classList.toggle('hidden', view !== 'idle');
  $('multi').classList.toggle('hidden', view !== 'multi');
  $('lsel').classList.toggle('hidden', view !== 'layer' && view !== 'panel');
  $('bottom').classList.toggle('grow', view === 'layer' || view === 'panel');
  $('tlwrap').classList.toggle('small', view === 'layer' || view === 'panel');
  $('topA').classList.toggle('hidden', !!o); $('topB').classList.toggle('hidden', !o);
  $('topB').classList.toggle('pmode', view === 'panel');
  if (o) $('lname').textContent = view === 'panel' ? tr(PTITLE[S.panel] || 'pad') : (o.name || o.type);
  updLayersIcon(); updLinkIcon(); TL.markKeys();
  S.upd = [];
  if (view === 'multi') { multiBar(); return; }
  if (view === 'idle') return;
  $('lt').classList.toggle('hidden', view === 'panel'); $('tabs').classList.toggle('hidden', view === 'panel');
  $('panel').classList.toggle('hidden', view !== 'panel');
  if (view === 'layer') {
    $('lt').innerHTML =
      '<button data-a="speed">' + ic('speed', 19) + '<span>' + tr('speed') + '</span></button>' +
      '<button data-a="cutf">' + ic('cutf', 19) + '<span>' + tr('cutf') + '</span></button>' +
      '<button data-a="cutm">' + ic('cutm', 19) + '<span>' + tr('cutm') + '</span></button>' +
      '<button data-a="cutl">' + ic('cutl', 19) + '<span>' + tr('cutl') + '</span></button>' +
      (canExtendStart([o]) ? '<button data-a="exs">' + ic('extend', 19, 'flipx') + '<span>' + tr('extends') + '</span></button>' : '') +
      (canExtend([o]) ? '<button data-a="ext">' + ic('extend', 19) + '<span>' + tr('extend') + '</span></button>' : '') +
      (o.type === 'video' || o.type === 'audio' ? '<button data-a="vol" class="' + (o.mute ? 'on' : '') + '">' + ic(o.mute ? 'mute' : 'vol', 19) + '<span>' + tr('volume') + '</span></button>' : '<button data-a="arr">' + ic('next', 19, 'rotd') + '<span>' + tr('effvals') + '</span></button>');
    $('lt').querySelectorAll('button').forEach(b => b.onclick = () => layerAct(b.dataset.a));
    const isTxt = ['text', 'image', 'video', 'shape', 'draw'].includes(o.type), tl = o.type === 'camera' ? TABS_CAM : o.type === 'audio' ? TABS_AUD : isTxt ? [['pad', 'pad', 'move'], ['cam', 'cam3d', 'camera'], ['fx', 'effect', 'depth'], ['mask', 'mask', 'mask'], ['txt', 'text', 'text']] : TABS;
    $('tabs').classList.toggle('two', isTxt);
    $('tabs').innerHTML = tl.map(([k, l, i], n) => '<button data-t="' + k + '"' + (isTxt && n > 2 ? ' class="sm"' : '') + '>' + ic(i, isTxt && n > 2 ? 22 : 28) + tr(l) + '</button>').join('');
    $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = b.dataset.t, o2 = selObj();
      if (k === 'mask') return MaskEd.open(o2);
      if (k === 'txt') return TextEd.open(o2);
      S.panel = k; renderBottom();
    });
    requestAnimationFrame(() => TL.focusSel());
  } else {
    const p = $('panel'); p.innerHTML = '';
    if (S.panel === 'pad') { const d = document.createElement('div'); d.className = 'pad'; p.appendChild(d); Pad.mount(d, padHooks); }
    else if (S.panel === 'aud') { const d = document.createElement('div'); d.className = 'fxp'; d.innerHTML = '<div class="pp"></div>'; p.appendChild(d); audioPanel(d.querySelector('.pp'), o); }
    else if (S.panel === 'fxv') { const d = document.createElement('div'); d.className = 'fxp'; d.innerHTML = stripHTML() + '<div class="pp"></div>'; p.appendChild(d); bindStrip(d, fxvHooks); efxList(d.querySelector('.pp'), o, true); }
    else if (S.panel === 'camopt') { const d = document.createElement('div'); d.className = 'pad'; p.appendChild(d); CamOpt.mount(d, padHooks); }
    else { const d = document.createElement('div'); d.className = 'fxp'; d.innerHTML = stripHTML() + '<div class="pp"></div>'; p.appendChild(d); bindStrip(d, padHooks); const pp = d.querySelector('.pp'); if (S.panel === 'cam') camPanel(pp, o); else if (S.panel === 'camfx') camFxPanel(pp, o); else if (S.panel === 'txt') textPanel(pp, o); else if (S.panel === 'mask') maskPanel(pp, o); else fxPanel(pp, o); refreshStrip(); }
    requestAnimationFrame(() => TL.focusSel());
  }
}
const padHooks = {
  begin() { pushUndo(); },
  changed() { changedHook(); },
  toast,
  act(a) {
    const o = selObj(); if (!o) return;
    if (a === 'back') { S.panel = null; renderBottom(); }
    else if (a === 'key') { if (o.lock) return toast(tr('unlocked')); pushUndo(); toggleKey(o, E.t); changedHook(true); refreshPanel(); }
    else if (a === 'curve') openCurve(o);
    else if (a === 'more') moreMenu(o);
  }
};
function rb() { if (S.inEd) S.inEd(); else renderBottom(); }
function changedHook(forceTL) {
  E.P.updated = Date.now(); scheduleSave(); render(); if (S.edDraw) S.edDraw();
  const o = selObj(); if (o && (forceTL || o.kf.length !== S.kfc)) { S.kfc = o.kf.length; TL.build(); TL.setSel(); TL.focusSel(); }
  $('bUndo').classList.remove('dis');
}
function openCurve(o) {
  const ks = o.kf; let k = keyAt(o, E.t);
  if (!k) { const idx = ks.filter(q => q.t <= E.t + EPS); k = idx[idx.length - 1]; }
  if (!k) return toast(tr('keyfirst'));
  if (ks.indexOf(k) === ks.length - 1 && ks.length > 1) k = ks[ks.length - 2];
  document.body.appendChild(Curve.open(o, k, () => changedHook()));
}
function moreMenu(o) {
  listSheet('', [
    { icon: 'rotate', label: tr('reset'), fn: () => { pushUndo(); setPose(o, Object.assign({ x: 0, y: 0, z: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0, skx: 0 }, o.type === 'camera' ? { fov: 60, dist: 1000 } : {}), E.t); changedHook(); refreshPanel(); if (S.panel === 'camopt') CamOpt.draw(); } },
    { icon: 'scale', label: tr('flipx'), fn: () => { pushUndo(); o.flipX = !o.flipX; changedHook(); } },
    { icon: 'scale', label: tr('flipy'), fn: () => { pushUndo(); o.flipY = !o.flipY; changedHook(); } },
    { icon: 'next', label: tr('up'), fn: () => moveLayer(o, 1) },
    { icon: 'prev', label: tr('down'), fn: () => moveLayer(o, -1) },
    { icon: 'copy', label: L2('Copy features…', 'फ़ीचर कॉपी करो…'), fn: () => featCopy(o) },
    ...(S.featClip ? [{ icon: 'plus', label: L2('Paste features', 'फ़ीचर पेस्ट करो') + ' (' + S.featClip.names + ')', fn: () => featPaste(o) }] : []),
    { icon: 'copy', label: tr('copy'), fn: () => { pushUndo(); const n = dupObj(o); changed('struct'); select(n.id); } },
    { icon: 'plus', label: L2('Copy keyframes & curve', 'कीफ्रेम और वक्र कॉपी'), fn: () => { S.kfClip = { kf: JSON.parse(JSON.stringify(o.kf)), t0: o.t0, from: o.id }; toast(L2('Copied', 'कॉपी हो गया')); } },
    ...(S.kfClip ? [{ icon: 'plus', label: L2('Paste keyframes & curve', 'कीफ्रेम पेस्ट करो'), fn: () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); const dt = o.t0 - S.kfClip.t0; o.kf = JSON.parse(JSON.stringify(S.kfClip.kf)).map(k => { k.t = Math.max(0, k.t + dt); return k; }); changedHook(true); refreshPanel(); } }] : [])
  ]);
}
function moveLayer(o, d) {
  const L = E.P.objects, i = L.indexOf(o), j = clamp(i + d, 0, L.length - 1); if (i === j) return;
  pushUndo(); L.splice(i, 1); L.splice(j, 0, o); changed('struct');
}
function canExtendStart(list) { return list.some(o => !o.full && !o.lock && o.t0 > 0.005); }
function extendToStart(list) {
  const c = list.filter(o => !o.full && !o.lock && o.t0 > 0.005);
  if (!c.length) return toast(tr('extoff'));
  pushUndo(); c.forEach(o => { o.t0 = 0; }); changed('struct'); TL.build();
}
function canExtend(list) { const d = E.P.dur; return list.some(o => !o.full && !o.lock && o.t1 < d - 0.005); }
function extendToEnd(list) {
  const d = E.P.dur, c = list.filter(o => !o.full && !o.lock && o.t1 < d - 0.005);
  if (!c.length) return toast(tr('extoff'));
  pushUndo(); c.forEach(o => { o.t1 = d; }); changed('struct'); TL.build();
}
function layerAct(a) {
  const o = selObj(); if (!o) return;
  if (a === 'del') { pushUndo(); removeObj(o.id); E.sel = null; S.panel = null; changed('struct'); select(null); }
  else if (a === 'ext') extendToEnd([o]);
  else if (a === 'exs') extendToStart([o]);
  else if (a === 'arr') {
    S.fxFocus = null; S.panel = 'fxv'; renderBottom();
  }
  else if (a === 'vol') { pushUndo(); o.mute = !o.mute; syncVideos(E.t, E.playing); changed(); renderBottom(); }
  else if (a === 'cutf' || a === 'cutl' || a === 'cutm') {
    if (o.lock) return toast(tr('unlocked'));
    pushUndo();
    const ok = a === 'cutf' ? cutFront(o, E.t) : a === 'cutl' ? cutLast(o, E.t) : !!splitObj(o, E.t);
    if (!ok) { E.undo.pop(); return toast(tr('cutfail')); }
    changed('struct');
  } else if (a === 'speed') {
    if (o.type !== 'video') return toast(tr('vidonly'));
    const s = sheet('<h3>' + tr('speed') + '</h3><div class="sl"><input type="range" id="spd" min="0.25" max="4" step="0.05" value="' + (o.speed || 1) + '"><em id="spv"></em></div><div class="chips" style="margin-top:12px">' + [0.5, 1, 1.5, 2, 3].map(v => '<button class="chip" data-v="' + v + '">' + v + '×</button>').join('') + '</div>');
    const r = s.querySelector('#spd'), em = s.querySelector('#spv'), set = v => { pushUndo(); o.speed = v; r.value = v; em.textContent = v + '×'; syncVideos(E.t, false); changed(); };
    em.textContent = (o.speed || 1) + '×'; r.onchange = () => set(parseFloat(r.value));
    s.querySelectorAll('[data-v]').forEach(b => b.onclick = () => set(parseFloat(b.dataset.v)));
  }
}

/* ---------- Camera + Effect panels (with keyframe strip) ---------- */
function slider(parent, label, min, max, step, get, set, unit) {
  const d = document.createElement('div'); d.className = 'sl';
  d.innerHTML = '<span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '"><em></em>';
  const r = d.querySelector('input'), em = d.querySelector('em');
  const show = () => { r.value = get(); em.textContent = Math.round(get() * 100) / 100 + (unit || ''); };
  show(); S.upd.push(() => { if (!r._busy) show(); });
  let began = false;
  r.addEventListener('pointerdown', () => { began = false; r._busy = true; });
  r.addEventListener('pointerup', () => { r._busy = false; });
  r.addEventListener('input', () => { const o = selObj(); if (!o) return; if (o.lock) { toast(tr('unlocked')); r.value = get(); return; } if (!began) { pushUndo(); began = true; } set(parseFloat(r.value)); em.textContent = Math.round(parseFloat(r.value) * 100) / 100 + (unit || ''); changedHook(); refreshStrip(); });
  parent.appendChild(d);
}
function camPanel(p, o) {
  slider(p, tr('tiltx'), -80, 80, 1, () => poseOf(o, E.t).rx, v => setPose(o, { rx: v }, E.t), '°');
  slider(p, tr('tilty'), -80, 80, 1, () => poseOf(o, E.t).ry, v => setPose(o, { ry: v }, E.t), '°');
  slider(p, 'Z', -800, 800, 5, () => poseOf(o, E.t).z, v => setPose(o, { z: v }, E.t));
  const b = document.createElement('div'); b.className = 'chips';
  b.innerHTML = '<button class="chip">' + ic('link', 16) + ' ' + tr('attach') + ': ' + esc(o.par ? ((find(o.par) || {}).name || '?') : tr('none')) + '</button>';
  b.firstChild.onclick = () => linkSheet(o); p.appendChild(b);
}
const FOGCOLS = ['#9aa4c8', '#cbd5e1', '#ffffff', '#111111', '#8b5cf6', '#ec4899', '#22d3ee', '#facc15', '#f97316', '#34d399'];
function pickColor(cur, fn) {
  const s = sheet('<h3>' + tr('colorl') + '</h3><div class="sw">' + FOGCOLS.map(c => '<i data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '"></i>').join('') + '</div>');
  s.querySelectorAll('i').forEach(i => i.onclick = () => { closeSheet(); fn(i.dataset.c); });
}
const CFX = { cbl: { l: 'blur', min: 0, max: 60, step: 1, def: 14 }, cgl: { l: 'glow', min: 0, max: 1, step: 0.01, def: 0.5 }, vig: { l: 'vig', min: 0, max: 1, step: 0.01, def: 0.6 }, tia: { l: 'tint', min: 0, max: 1, step: 0.01, def: 0.4 } };
function camFxPanel(p, o) {
  o.effs = o.effs || [];
  o.effs.forEach(k => {
    const c = CFX[k]; if (!c) return;
    slider(p, tr(c.l), c.min, c.max, c.step, () => poseOf(o, E.t)[k], v => setPose(o, { [k]: v }, E.t));
    const row = p.lastChild, x = document.createElement('button'); x.className = 'ib xfx'; x.innerHTML = ic('close', 16); x.title = tr('removefx');
    x.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.effs = o.effs.filter(q => q !== k); o.kf.forEach(q => { q.p[k] = 0; }); o[k] = 0; changedHook(true); renderBottom(); };
    row.appendChild(x);
    if (k === 'tia') swatches(p, o.tintC || '#ff7a00', col => { o.tintC = col; });
  });
  const free = Object.keys(CFX).filter(k => !o.effs.includes(k));
  if (free.length) {
    const b = document.createElement('div'); b.className = 'chips';
    b.innerHTML = '<button class="chip on">' + ic('plus', 16) + ' ' + tr('addfx') + '</button>';
    b.firstChild.onclick = () => listSheet(tr('addfx'), free.map(k => ({ icon: k === 'vig' ? 'vignette' : 'depth', label: tr(CFX[k].l), fn: () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.effs.push(k); setPose(o, { [k]: CFX[k].def }, E.t); changedHook(true); renderBottom(); } })));
    p.appendChild(b);
  }
}
function swatches(parent, cur, fn) {
  const d = document.createElement('div'); d.className = 'sw';
  d.innerHTML = COLORS.map(c => '<i data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '"></i>').join('');
  d.querySelectorAll('i').forEach(i => i.onclick = () => { const o = selObj(); if (!o || o.lock) return; pushUndo(); fn(i.dataset.c); d.querySelectorAll('i').forEach(x => x.classList.toggle('on', x === i)); changedHook(); });
  parent.appendChild(d);
}
const FONTL = { sans: 'Sans', medium: 'Medium', light: 'Light', black: 'Black', cond: 'Condensed', serif: 'Serif', mono: 'Mono', hand: 'Script', casual: 'Casual', cursive: 'Cursive' };
function colorRow(p, label, cur, fn, none) {
  const d = document.createElement('div'); d.className = 'crow';
  d.innerHTML = '<span>' + label + '</span><div class="sw">' + (none ? '<button class="chip ' + (!cur ? 'on' : '') + '" data-n="1">' + tr('none') + '</button>' : '') + COLORS.map(c => '<i data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '"></i>').join('') + '<label class="cpk"><input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#ffffff') + '"></label></div>';
  const set = v => { const o = selObj(); if (!o || o.lock) return; pushUndo(); fn(v); changedHook(); rb(); };
  d.querySelectorAll('i').forEach(i => i.onclick = () => set(i.dataset.c));
  const n = d.querySelector('[data-n]'); if (n) n.onclick = () => set(null);
  d.querySelector('input').onchange = ev => set(ev.target.value);
  p.appendChild(d);
}
function maskPanel(p, o) {
  const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
  const cand = E.P.objects.filter(q => q.id !== o.id && ['shape', 'text', 'image', 'video', 'draw'].includes(q.type));
  const chips = (list, cur, fn) => {
    const f = document.createElement('div'); f.className = 'chips';
    f.innerHTML = list.length ? list.map(q => '<button class="chip ' + (q.id === cur ? 'on' : '') + '" data-i="' + q.id + '">' + ic(q.type === 'shape' ? 'shape' : q.type === 'text' ? 'text' : 'media', 15) + (q.name || q.type) + '</button>').join('') : '<span class="mut">' + tr('nolayers') + '</span>';
    f.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { if (o.lock) return toast(tr('unlocked')); fn(b.dataset.i); });
    p.appendChild(f);
  };
  lab(tr('maskof'));
  chips(cand, o.mask && o.mask.id, id => {
    pushUndo();
    if (o.mask && o.mask.id === id) o.mask = null; else o.mask = { id, inv: false, f: 0 };
    changed('struct'); rb(); render();
  });
  if (o.mask) {
    const b = document.createElement('div'); b.className = 'chips';
    b.innerHTML = '<button class="chip ' + (o.mask.inv ? 'on' : '') + '" data-a="inv">' + tr('invert') + '</button><button class="chip" data-a="rm">' + tr('maskrm') + '</button>';
    b.querySelector('[data-a=inv]').onclick = () => { pushUndo(); o.mask.inv = !o.mask.inv; changedHook(); rb(); };
    b.querySelector('[data-a=rm]').onclick = () => { pushUndo(); o.mask = null; changed('struct'); rb(); render(); };
    p.appendChild(b);
    slider(p, tr('feather'), 0, 60, 1, () => o.mask.f || 0, v => { o.mask.f = v; });
  }
  const tg = E.P.objects.filter(q => q.id !== o.id && ['shape', 'text', 'image', 'video', 'draw'].includes(q.type));
  lab(tr('maskuse'));
  chips(tg, null, id => {
    const q = find(id); if (!q) return; pushUndo();
    if (q.mask && q.mask.id === o.id) q.mask = null; else q.mask = { id: o.id, inv: false, f: 0 };
    changed('struct'); rb(); render();
  });
}
function audioPanel(p, o) {
  const b = document.createElement('div'); b.className = 'chips'; b.innerHTML = '<button class="chip" data-a="back">' + ic('prev', 16) + tr('done') + '</button><button class="chip ' + (o.mute ? 'on' : '') + '" data-a="mute">' + ic(o.mute ? 'mute' : 'vol', 16) + tr('volume') + '</button>';
  b.querySelector('[data-a=back]').onclick = () => { S.panel = null; rb(); };
  b.querySelector('[data-a=mute]').onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.mute = !o.mute; syncVideos(E.t, E.playing); changed(); rb(); };
  p.appendChild(b);
  const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
  slider(p, tr('volume'), 0, 1, 0.01, () => o.vol == null ? 1 : o.vol, v => { o.vol = v; }, '');
  slider(p, tr('fadein'), 0, 10, 0.1, () => o.fin || 0, v => { o.fin = v; }, 's');
  slider(p, tr('fadeout'), 0, 10, 0.1, () => o.fout || 0, v => { o.fout = v; }, 's');
}
function textPanel(p, o) {
  const t = document.createElement('textarea'); t.className = 'tx'; t.rows = 2; t.value = o.text; t.setAttribute('autocomplete', 'off'); t.setAttribute('autocorrect', 'off'); t.setAttribute('autocapitalize', 'off'); t.setAttribute('spellcheck', 'false'); p.appendChild(t);
  let began = false; t.onfocus = () => { began = false; };
  t.oninput = () => { if (!began) { pushUndo(); began = true; } const old = o.text; o.text = t.value || ' '; rsAdjust(o, old, o.text); changedHook(); if (pkOn) drawPk(); };
  // select some words inside the box → style only those (colour, bold, italic, underline, highlight, size, glow)
  const pkw = document.createElement('div'); pkw.className = 'pkw'; p.appendChild(pkw); let pkOn = false, pkLet = false;
  const rtb = document.createElement('div'); rtb.className = 'rtb'; p.appendChild(rtb); let sa = 0, sb = 0;
  const cpi = (str, i) => Array.from(str.slice(0, i)).length;
  const eff = (k, a, b) => { let all = true; for (let i = a; i < b; i++) { const st = rsStyle(o, i, null), v = st && st[k] != null ? st[k] : (k === 'ul' ? o.under : o[k]); if (!v) { all = false; break; } } return all; };
  const ed = fn => { if (o.lock) return toast(tr('unlocked')); pushUndo(); rsEdit(o, sa, sb, fn); changedHook(); drawTb(); drawPk(); };
  const drawTb = () => {
    if (sb <= sa) { rtb.innerHTML = '<p class="mut" style="margin:4px 0;font-size:11px">' + tr('selhint') + '</p>'; return; }
    const st0 = rsStyle(o, sa, null) || {};
    rtb.innerHTML = '<p class="mut" style="margin:4px 0;font-size:11px">' + tr('selchars') + ': ' + (sb - sa) + '</p><div class="chips">' +
      '<button class="chip" data-r="col"><i class="cdot" style="background:' + (st0.fill || o.fill) + ';display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle"></i> ' + tr('fill') + '</button>' +
      '<button class="chip' + (eff('bold', sa, sb) ? ' on' : '') + '" data-r="bold"><b>B</b></button><button class="chip' + (eff('italic', sa, sb) ? ' on' : '') + '" data-r="italic"><i>I</i></button><button class="chip' + (eff('ul', sa, sb) ? ' on' : '') + '" data-r="ul"><u>U</u></button>' +
      '<button class="chip" data-r="bg"><i class="cdot" style="background:' + (st0.bg || '#facc15') + ';display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:middle"></i> ' + tr('hlbg') + '</button>' +
      '<button class="chip" data-r="sm">A−</button><button class="chip" data-r="bg2">A+</button><button class="chip' + (st0.glow ? ' on' : '') + '" data-r="glow">' + tr('glow') + '</button><button class="chip" data-r="clr">' + tr('clearst') + '</button></div>';
    const q = k => rtb.querySelector('[data-r=' + k + ']');
    q('col').onclick = () => pickColor(st0.fill || o.fill, c => ed(st => Object.assign(st, { fill: c })));
    q('bg').onclick = () => pickColor(st0.bg || '#facc15', c => ed(st => Object.assign(st, { bg: c })));
    ['bold', 'italic', 'ul'].forEach(k => q(k).onclick = () => { const on = eff(k, sa, sb); ed(st => { st[k] = on ? 0 : 1; return st; }); });
    q('sm').onclick = () => ed(st => { st.sc = clamp(Math.round((st.sc || 100) * 0.85), 30, 400); if (st.sc === 100) delete st.sc; return st; });
    q('bg2').onclick = () => ed(st => { st.sc = clamp(Math.round((st.sc || 100) * 1.2), 30, 400); return st; });
    q('glow').onclick = () => ed(st => { if (st.glow) delete st.glow; else st.glow = Math.max(10, o.fs * 0.3); return st; });
    q('clr').onclick = () => ed(() => ({}));
    rtb.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => e.preventDefault()));
  };
  const rd = () => { if (document.activeElement !== t) return; const a = cpi(t.value, t.selectionStart), b = cpi(t.value, t.selectionEnd); if (a !== sa || b !== sb) { sa = a; sb = b; drawTb(); } };
  ['select', 'keyup', 'touchend', 'mouseup'].forEach(ev => t.addEventListener(ev, () => setTimeout(rd, 30)));
  const selH = () => { if (!t.isConnected) return document.removeEventListener('selectionchange', selH); rd(); }; document.addEventListener('selectionchange', selH);
  // "Select words": the text shown as big tappable words (or letters); tap one, or drag across several, then style them
  const drawPk = () => {
    const chars = Array.from(String(o.text)), toks = []; let i = 0;
    while (i < chars.length) { if (chars[i] === '\n') { toks.push({ br: 1 }); i++; continue; } if (/\s/.test(chars[i])) { i++; continue; } if (pkLet) { toks.push({ a: i, b: i + 1 }); i++; continue; } let j = i; while (j < chars.length && !/\s/.test(chars[j])) j++; toks.push({ a: i, b: j }); i = j; }
    pkw.innerHTML = '<div class="chips"><button class="chip' + (pkOn ? ' on' : '') + '" data-p="on">' + L2('Select words', 'शब्द चुनो') + '</button>' + (pkOn ? '<button class="chip' + (pkLet ? ' on' : '') + '" data-p="let">' + L2('Letters', 'अक्षर') + '</button><button class="chip" data-p="all">' + L2('All', 'सब') + '</button>' : '') + '</div>' +
      (pkOn ? '<div class="pkbox">' + toks.map((k, n) => k.br ? '<br>' : '<span class="pkt' + (k.a >= sa && k.b <= sb && sb > sa ? ' sel' : '') + '" data-n="' + n + '" style="' + (() => { const st = rsStyle(o, k.a, null) || {}; return 'color:' + (st.fill || o.fill || '#fff') + (st.bold ? ';font-weight:900' : '') + (st.italic ? ';font-style:italic' : '') + (st.ul ? ';text-decoration:underline' : ''); })() + '">' + esc(chars.slice(k.a, k.b).join('')) + '</span>').join('') + '</div>' : '');
    pkw.querySelector('[data-p=on]').onclick = () => { pkOn = !pkOn; if (pkOn) { try { t.blur(); } catch (er) {} } drawPk(); };
    const L = pkw.querySelector('[data-p=let]'); if (L) L.onclick = () => { pkLet = !pkLet; sa = sb = 0; drawTb(); drawPk(); };
    const A = pkw.querySelector('[data-p=all]'); if (A) A.onclick = () => { sa = 0; sb = Array.from(String(o.text)).length; drawTb(); drawPk(); };
    const box = pkw.querySelector('.pkbox'); if (!box) return;
    let st = null; const tokAt = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); return el && el.classList && el.classList.contains('pkt') ? toks[+el.dataset.n] : null; };
    box.style.touchAction = 'none';
    box.addEventListener('pointerdown', ev => { const k = tokAt(ev); if (!k) return; st = k; sa = k.a; sb = k.b; box.setPointerCapture(ev.pointerId); drawTb(); box.querySelectorAll('.pkt').forEach(s => s.classList.toggle('sel', toks[+s.dataset.n].a >= sa && toks[+s.dataset.n].b <= sb)); });
    box.addEventListener('pointermove', ev => { if (!st) return; const k = tokAt(ev); if (!k) return; sa = Math.min(st.a, k.a); sb = Math.max(st.b, k.b); box.querySelectorAll('.pkt').forEach(s => s.classList.toggle('sel', toks[+s.dataset.n].a >= sa && toks[+s.dataset.n].b <= sb)); });
    const end = () => { if (st) { st = null; drawTb(); } }; box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  };
  drawPk(); drawTb();
  const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
  const chips = (html, on) => { const f = document.createElement('div'); f.className = 'chips'; f.innerHTML = html; p.appendChild(f); return f; };
  const tg = (k, label) => '<button class="chip ' + (o[k] ? 'on' : '') + '" data-g="' + k + '">' + label + '</button>';
  lab(tr('fontl'));
  const f = chips(Object.keys(FONTL).map(k => '<button class="chip ' + (o.font === k ? 'on' : '') + '" data-f="' + k + '" style="font-family:' + (FONTS[k] || '').replace(/"/g, "'") + '">' + FONTL[k] + '</button>').join(''));
  f.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.font = b.dataset.f; changedHook(); rb(); });
  const s = chips(tg('bold', '<b>B</b>') + tg('italic', '<i>I</i>') + tg('under', '<u>U</u>') + tg('caps', 'AA') +
    ['l', 'c', 'r'].map(k => '<button class="chip ' + ((o.align || 'c') === k ? 'on' : '') + '" data-al="' + k + '">' + { l: '⇤', c: '↔', r: '⇥' }[k] + '</button>').join(''));
  s.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o[b.dataset.g] = !o[b.dataset.g]; changedHook(); rb(); });
  s.querySelectorAll('[data-al]').forEach(b => b.onclick = () => { if (o.lock) return toast(tr('unlocked')); pushUndo(); o.align = b.dataset.al; changedHook(); rb(); });
  slider(p, tr('size'), 20, 400, 2, () => o.fs, v => { o.fs = v; });
  slider(p, tr('lspace'), -5, 60, 1, () => o.ls || 0, v => { o.ls = v; });
  slider(p, tr('lheight'), 0.6, 2.5, 0.05, () => o.lhm || 1, v => { o.lhm = v; });
  lab(tr('fill')); colorRow(p, '', o.fill, c => { o.fill = c || '#ffffff'; });
  lab(tr('gradient')); colorRow(p, '', o.fill2, c => { o.fill2 = c; }, true);
  lab(tr('outline')); slider(p, tr('border'), 0, 40, 1, () => o.bw || 0, v => { o.bw = v; });
  if ((o.bw || 0) > 0) colorRow(p, '', o.bc || '#000000', c => { o.bc = c || '#000000'; });
  lab(tr('boxbg')); colorRow(p, '', o.bg, c => { o.bg = c; }, true);
  if (o.bg) { slider(p, tr('padding'), 0, 120, 1, () => o.bgp == null ? 20 : o.bgp, v => { o.bgp = v; }); slider(p, tr('corner'), 0, 120, 1, () => o.bgr || 0, v => { o.bgr = v; }); }
  if (o.type === 'text') efxList(p, o);
}
function fxPanel(p, o) {
  if (o.type === 'draw') {
    const lab = s => { const h = document.createElement('p'); h.className = 'pgh'; h.textContent = s; p.appendChild(h); };
    swatches(p, o.col, c => { o.col = c; o.gc = c; (o.strokes || []).forEach(q => { delete q.c; }); });
    slider(p, tr('lwidth'), 1, 80, 1, () => o.lw || 10, v => { const r = v / (o.lw || 10); (o.strokes || []).forEach(q => { if (q.w) q.w *= r; }); o.lw = v; });
    slider(p, tr('glow'), 0, 80, 1, () => o.glow || 0, v => { o.glow = v; });
    slider(p, tr('dashl'), 0, 80, 1, () => o.dash || 0, v => { o.dash = v; });
    lab(tr('fill')); colorRow(p, '', o.fillc, c => { o.fillc = c; }, true);
    if (o.fillc) slider(p, tr('opacity'), 0, 1, 0.05, () => o.fo == null ? 0.4 : o.fo, v => { o.fo = v; });
    lab(tr('drawon')); const dc = document.createElement('div'); dc.className = 'chips'; dc.innerHTML = '<button class="chip ' + (o.dr && o.dr.on ? 'on' : '') + '">' + (o.dr && o.dr.on ? 'ON' : 'OFF') + '</button>'; p.appendChild(dc);
    dc.firstChild.onclick = () => { pushUndo(); o.dr = Object.assign({ delay: 0, dur: 1.2 }, o.dr, { on: !(o.dr && o.dr.on) }); changedHook(); rb(); };
    if (o.dr && o.dr.on) { slider(p, tr('dstart'), 0, 20, 0.1, () => o.dr.delay || 0, v => { o.dr.delay = v; }); slider(p, tr('ddur'), 0.1, 20, 0.1, () => o.dr.dur || 1.2, v => { o.dr.dur = v; }); }
    slider(p, tr('opacity'), 0, 1, 0.01, () => poseOf(o, E.t).op, v => setPose(o, { op: v }, E.t));
    slider(p, tr('blur'), 0, 60, 1, () => poseOf(o, E.t).bl, v => setPose(o, { bl: v }, E.t));
    slider(p, tr('shadow'), 0, 60, 1, () => poseOf(o, E.t).sh, v => setPose(o, { sh: v }, E.t));
    efxList(p, o); return;
  }
  if (o.type === 'shape') {
    if (o.shape === 'custom') { const eb = document.createElement('div'); eb.className = 'chips'; eb.innerHTML = '<button class="chip">' + tr('shapeed') + '</button>'; eb.firstChild.onclick = () => ShapeEd.open(o, (pts, smooth, asp) => { pushUndo(); o.pts = pts; o.smooth = smooth; const s0 = Math.max(o.w, o.h); if (asp >= 1) { o.w = s0; o.h = Math.max(20, Math.round(s0 / asp)); } else { o.h = s0; o.w = Math.max(20, Math.round(s0 * asp)); } changedHook(); renderBottom(); }); p.appendChild(eb); }
    swatches(p, o.fill, c => { o.fill = c; });
    slider(p, tr('border'), 0, 40, 1, () => o.bw || 0, v => { o.bw = v; });
    if ((o.bw || 0) > 0) swatches(p, o.bc || '#ffffff', c => { o.bc = c; });
  }
  slider(p, tr('opacity'), 0, 1, 0.01, () => poseOf(o, E.t).op, v => setPose(o, { op: v }, E.t));
  slider(p, tr('blur'), 0, 60, 1, () => poseOf(o, E.t).bl, v => setPose(o, { bl: v }, E.t));
  slider(p, tr('glow'), 0, 80, 1, () => poseOf(o, E.t).gl, v => setPose(o, { gl: v }, E.t));
  slider(p, tr('shadow'), 0, 60, 1, () => poseOf(o, E.t).sh, v => setPose(o, { sh: v }, E.t));
  efxList(p, o);
}

/* ---------- group / link ---------- */
function linkSheet(o) {
  const others = E.P.objects.filter(q => q.id !== o.id);
  const items = [{ icon: 'plus', label: tr('newgroup'), fn: () => {
    pushUndo(); const w = wpose(o, E.t);
    const g = newObj('null', { name: tr('groupn') + ' ' + (E.P.objects.filter(q => q.type === 'null').length + 1), t0: 0, t1: 1, full: true, x: w.x, y: w.y, w: 80, h: 80 });
    if (E.P.dur <= 0) E.P.dur = 5;
    E.P.objects.splice(E.P.objects.indexOf(o), 0, g); setParent(o, g.id); changed('struct'); select(o.id);
  } }, { icon: 'close', label: tr('none'), cls: o.par ? '' : 'on', fn: () => { pushUndo(); setParent(o, null); changed('struct'); select(o.id); } }];
  others.forEach(q => items.push({ icon: 'link', label: q.name || q.type, cls: o.par === q.id ? 'on' : '', fn: () => { pushUndo(); setParent(o, q.id); changed('struct'); select(o.id); } }));
  listSheet(tr('attach'), items);
}

/* ---------- multi-select, copy / paste, duplicate ---------- */
function multiBar() {
  const m = $('multi'), n = (E.multi || []).length, lst = (E.multi || []).map(find).filter(Boolean);
  if (!n) { m.innerHTML = '<div class="cnt">' + tr('pickhint') + '</div><button class="chip on" data-a="done">' + tr('done') + '</button>'; m.querySelectorAll('button').forEach(b => b.onclick = () => multiAct(b.dataset.a)); return; }
  m.innerHTML = '<div class="cnt">' + n + ' ' + tr('nsel') + '</div>' +
    '<button class="chip" data-a="dup">' + ic('copy', 16) + tr('dup') + '</button><button class="chip" data-a="copy">' + ic('paste', 16) + tr('copyl') + '</button>' +
    (canExtendStart(lst) ? '<button class="chip" data-a="exs">' + ic('extend', 16, 'flipx') + tr('extends') + '</button>' : '') + (canExtend(lst) ? '<button class="chip" data-a="ext">' + ic('extend', 16) + tr('extend') + '</button>' : '') + '<button class="chip" data-a="grp">' + ic('group', 16) + tr('groupm') + '</button><button class="chip" data-a="del">' + ic('trash', 16) + tr('delete') + '</button><button class="chip on" data-a="done">' + tr('done') + '</button>';
  m.querySelectorAll('button').forEach(b => b.onclick = () => multiAct(b.dataset.a));
}
function ids() { return E.multi && E.multi.length ? E.multi.slice() : E.sel ? [E.sel] : []; }
function multiAct(a) {
  const list = ids().map(find).filter(Boolean);
  if (a === 'done') { E.multi = null; E.pick = false; TL.setSel(); renderBottom(); return; }
  if (a === 'copy') return copyLayers();
  if (a === 'ext') return extendToEnd(list);
  if (a === 'exs') return extendToStart(list);
  pushUndo();
  if (a === 'dup') { const ns = list.map(o => dupObj(o)); E.multi = ns.map(n => n.id); }
  else if (a === 'del') { list.forEach(o => removeObj(o.id)); E.multi = null; }
  else if (a === 'grp') {
    let ax = 0, ay = 0; list.forEach(o => { const w = wpose(o, E.t); ax += w.x; ay += w.y; });
    const g = newObj('null', { name: tr('groupn') + ' ' + (E.P.objects.filter(q => q.type === 'null').length + 1), t0: 0, t1: 1, full: true, x: ax / list.length, y: ay / list.length, w: 80, h: 80 });
    if (E.P.dur <= 0) E.P.dur = 5;
    E.P.objects.push(g); list.forEach(o => setParent(o, g.id));
  }
  changed('struct'); TL.setSel();
}
function copyLayers() {
  const list = ids().map(find).filter(Boolean); if (!list.length) return toast(tr('nothing'));
  S.clip = list.map(o => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v))));
  toast(tr('copied'));
}
function pasteLayers() {
  if (!S.clip || !S.clip.length) return toast(tr('nothing'));
  pushUndo();
  const map = {}, base = Math.min(...S.clip.map(o => o.t0)), shift = E.t - base, made = [];
  S.clip.forEach(o => { const n = JSON.parse(JSON.stringify(o)); map[o.id] = uid(); n.id = map[o.id]; n.t0 += shift; if (!n.full) n.t1 += shift; n.kf.forEach(k => { k.t += shift; }); made.push(n); });
  made.forEach(n => { if (n.par && map[n.par]) n.par = map[n.par]; else if (n.par && !find(n.par)) n.par = null; E.P.objects.push(n); });
  autoDur(); E.sel = null;
  changed('struct');
  if (made.length === 1) select(made[0].id); else { E.multi = made.map(n => n.id); TL.setSel(); renderBottom(); }
  toast(tr('pasted'));
}
function editMenu() {
  listSheet(tr('editm'), [
    { icon: 'copy', label: tr('dup'), fn: () => { if (!ids().length) return toast(tr('layer')); if (E.multi) return multiAct('dup'); pushUndo(); const n = dupObj(selObj()); changed('struct'); select(n.id); } },
    { icon: 'selall', label: tr('pick'), fn: () => { E.pick = true; E.multi = E.sel ? [E.sel] : []; E.sel = null; S.panel = null; TL.setSel(); renderBottom(); updLabel(); } },
    { icon: 'selall', label: tr('selall'), fn: () => { if (!E.P.objects.length) return; E.sel = null; S.panel = null; E.multi = E.P.objects.map(o => o.id); TL.setSel(); renderBottom(); updLabel(); } },
    { icon: 'paste', label: tr('copyl'), fn: copyLayers },
    { icon: 'paste', label: tr('paste'), fn: pasteLayers }
  ]);
}

/* ---------- layers + camera sheet ---------- */
function reorderLayers(fromRow, toRow) { // rows are shown top = front-most layer
  const L = E.P.objects, n = L.length, i0 = n - 1 - fromRow, i1 = n - 1 - toRow;
  if (i0 === i1 || i0 < 0 || i1 < 0) return;
  pushUndo(); const [m] = L.splice(i0, 1); L.splice(i1, 0, m); changed('struct');
}
function sheetReorder(body, onDrop) {
  const sh = body.closest('.sheet'); let ds = null, active = false;
  if (sh && !sh._rd) { sh._rd = 1; sh.addEventListener('touchmove', e => { if (active) e.preventDefault(); }, { passive: false }); }
  body.querySelectorAll('.ro .nm').forEach(h => {
    h.addEventListener('pointerdown', e => {
      const row = h.closest('.ro'); ds = { x0: e.clientX, y0: e.clientY, mode: 'pending', row, id: e.pointerId, timer: 0 };
      ds.timer = setTimeout(() => {
        if (!ds || ds.mode !== 'pending') return;
        ds.mode = 'drag'; active = true; try { h.setPointerCapture(ds.id); } catch (er) {}
        const rows = [...body.querySelectorAll('.ro')]; ds.from = rows.indexOf(row); ds.rd = reorderDrag(rows, ds.from, ds.y0);
        row.classList.add('lift2'); try { navigator.vibrate && navigator.vibrate(18); } catch (er) {}
      }, 380);
    });
    h.addEventListener('pointermove', e => {
      if (!ds) return;
      if (ds.mode === 'pending') { if (Math.hypot(e.clientX - ds.x0, e.clientY - ds.y0) > 9) { clearTimeout(ds.timer); ds = null; } return; }
      ds.rd.move(e.clientY);
    });
    const end = () => {
      if (!ds) return; clearTimeout(ds.timer); const d = ds; ds = null; active = false;
      if (d.mode === 'drag') { const to = d.rd.end(); d.row.classList.remove('lift2'); S.noClick = true; setTimeout(() => { S.noClick = false; }, 80); if (to !== d.from) onDrop(d.from, to); }
    };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  });
}
function closeCamStrip() { const d = $('cstrip'); if (d) d.remove(); }
function camStrip() {
  if ($('cstrip')) return closeCamStrip();
  const b = $('bLayers').getBoundingClientRect(), d = document.createElement('div'); d.id = 'cstrip';
  d.innerHTML = '<div class="csb" style="right:' + Math.max(6, Math.round(window.innerWidth - b.right)) + 'px;bottom:' + Math.round(window.innerHeight - b.top + 6) + 'px"><button class="ib" data-k="layers">' + ic('layers', 22) + '</button><button class="ib' + (E.cam ? ' on' : '') + '" data-k="cam">' + ic(E.cam ? 'camera' : 'cameraoff', 22) + '</button></div>';
  d.onclick = e => { if (e.target === d) closeCamStrip(); };
  d.querySelector('[data-k=layers]').onclick = () => { closeCamStrip(); layersSheet('layers'); };
  // the camera button is the ONLY thing that turns the camera on / off
  d.querySelector('[data-k=cam]').onclick = () => {
    closeCamStrip();
    if (!E.P.objects.some(q => q.type === 'camera')) { E.cam = true; toast(tr('camon')); addCamera(); return; }
    E.cam = !E.cam; toast(tr(E.cam ? 'camon' : 'camoffm')); updLayersIcon(); render();
  };
  document.body.appendChild(d);
}
function layersSheet(tab) {
  tab = tab || 'layers';
  const s = sheet('<div class="seg"><button data-t="layers" class="' + (tab === 'layers' ? 'on' : '') + '">' + tr('layers') + '</button><button data-t="cam" class="' + (tab === 'cam' ? 'on' : '') + '">' + tr('cams') + '</button></div><div id="lsbody"></div>');
  s.querySelectorAll('.seg button').forEach(b => b.onclick = () => layersSheet(b.dataset.t));
  const body = s.querySelector('#lsbody');
  if (tab === 'layers') {
    const L = E.P.objects;
    body.innerHTML = L.length ? L.slice().reverse().map(o => '<div class="ro" data-id="' + o.id + '"><span class="nm">' + esc(o.name || o.type) + '</span><button class="ib" data-a="up">' + ic('prev', 18, 'rup') + '</button><button class="ib" data-a="dn">' + ic('next', 18, 'rdn') + '</button><button class="ib" data-a="del">' + ic('trash', 18) + '</button></div>').join('') : '<p style="color:var(--mut);padding:10px">' + tr('empty').split('\n')[0] + '</p>';
    body.querySelectorAll('.ro').forEach(r => {
      const id = r.dataset.id;
      r.querySelector('.nm').onclick = () => { if (S.noClick) return; closeSheet(); select(id); };
      r.querySelector('[data-a=up]').onclick = () => { const o = find(id); moveLayer(o, 1); layersSheet('layers'); };
      r.querySelector('[data-a=dn]').onclick = () => { const o = find(id); moveLayer(o, -1); layersSheet('layers'); };
      r.querySelector('[data-a=del]').onclick = () => { pushUndo(); removeObj(id); changed('struct'); layersSheet('layers'); };
    });
    sheetReorder(body, (from, to) => { reorderLayers(from, to); layersSheet('layers'); });
    body.querySelectorAll('.rup').forEach(x => x.style.transform = 'rotate(90deg)'); body.querySelectorAll('.rdn').forEach(x => x.style.transform = 'rotate(90deg)');
  } else {
    const cam = E.P.objects.find(q => q.type === 'camera');
    body.innerHTML = '<div class="list"><button id="camsel">' + ic('camera', 20) + '<span>' + (cam ? tr('camlayer') : tr('camera') + ' +') + '</span></button></div>';
    body.querySelector('#camsel').onclick = () => { closeSheet(); if (cam) select(cam.id); else menuTap('camera'); };
  }
}

/* ---------- add things ---------- */
function layerTimes(o) { o.t0 = E.t; o.t1 = E.t + 5; autoDur(); }
function addObj(o) { pushUndo(); E.P.objects.push(o); autoDur(); if (E.P.dur <= 0) E.P.dur = 5; changed('struct'); select(o.id); }
function nextName(base) { const n = E.P.objects.filter(q => q.name && q.name.indexOf(base) === 0).length + 1; return base + ' ' + n; }
function addCamera() {
  const ex = E.P.objects.find(q => q.type === 'camera'); if (ex) { toast(tr('camera')); return select(ex.id); }
  addObj(newObj('camera', { name: tr('camlayer'), t0: 0, t1: 1, full: true, w: 100, h: 100 }));
}
function menuTap(k) {
  if (['template', 'vector'].includes(k)) return toast(tr(k) + ': ' + tr('soon'));
  if (k === 'draw') return DrawEd.open();
  if (k === 'camera') return addCamera();
  if (k === 'media') return pickMedia();
  if (k === 'audio') return pickAudio();
  if (k === 'text') { const o = newObj('text', { name: nextName(tr('text')), text: tr('hello'), fs: 130, fill: '#ffffff', font: 'sans', bold: true, bw: 0, bc: '#000000' }); layerTimes(o); textTex(o); const r = addObj(o); S.panel = 'txt'; renderBottom(); return r; }
  if (k === 'shape') {
    const s = sheet('<h3>' + tr('shape') + '</h3><div class="grid4 shgrid">' + SHAPES.map(x => '<button data-s="' + x + '"><canvas width="56" height="56" data-c="' + x + '"></canvas>' + tr(x) + '</button>').join('') + '<button data-s="custom"><canvas width="56" height="56" data-c="custom"></canvas>' + tr('customs') + '</button></div>');
    s.querySelectorAll('canvas').forEach(c => { const g = c.getContext('2d'); g.fillStyle = '#a78bfa'; g.strokeStyle = '#a78bfa'; g.lineWidth = 5; g.lineCap = 'round'; const k2 = c.dataset.c; if (k2 === 'line') { g.beginPath(); g.moveTo(6, 28); g.lineTo(50, 28); g.stroke(); } else if (k2 === 'custom') { g.beginPath(); g.moveTo(8, 46); g.lineTo(18, 12); g.lineTo(34, 30); g.lineTo(48, 8); g.stroke(); } else { drawShapePath(g, k2, 6, 6, 44, 44); g.fill(); } });
    const cols = ['#8b5cf6', '#ec4899', '#22d3ee', '#facc15', '#34d399'];
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      closeSheet(); const kind = b.dataset.s;
      if (kind === 'custom') return ShapeEd.open(null, (pts, smooth, asp) => {
        const o = newObj('shape', { name: nextName(tr('customs')), shape: 'custom', pts, smooth, fill: cols[E.P.objects.length % 5], bw: 0, bc: '#ffffff', w: asp >= 1 ? 400 : Math.round(400 * asp), h: asp >= 1 ? Math.round(400 / asp) : 400 });
        layerTimes(o); addObj(o);
      });
      const o = newObj('shape', { name: nextName(tr(kind)), shape: kind, fill: cols[E.P.objects.length % 5], bw: 0, bc: '#ffffff', w: kind === 'line' ? 600 : 400, h: kind === 'line' ? 24 : 400 });
      layerTimes(o); addObj(o);
    });
    return;
  }
  if (k === 'element') {
    return listSheet(tr('element'), [
      { icon: 'camera', label: tr('camera'), fn: addCamera },
      { icon: 'nul', label: tr('nul'), fn: () => addObj(newObj('null', { name: nextName(tr('nulllayer')), t0: 0, t1: 1, full: true, w: 80, h: 80 })) }
    ]);
  }
}

/* ---------- media ---------- */
function pickAudio() {
  if (window.PixyMedia && window.PixyMedia.pickAudio) { try { window.PixyMedia.pickAudio(); } catch (e) { toast(tr('mediafail')); } }
  else toast(tr('mediafail'));
}
function pickMedia() {
  if (window.PixyMedia) { try { window.PixyMedia.pick(); } catch (e) { toast(tr('mediafail')); } }
  else toast(tr('mediafail'));
}
window.onMediaPicked = function (json) {
  let list; try { list = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return toast(tr('mediafail')); }
  if (!E.P) return;
  (list || []).forEach(m => { if (m.bad) toast(tr('badfile')); else addMediaItem(m); });
};
window.onVideoConverted = function (json) {
  let r; try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
  $('exprog').classList.add('hidden');
  if (r.ok && E.P) addMediaItem({ file: r.file, mime: 'video/mp4', name: r.name, converted: true }); else toast(tr('badfile'));
};
function addMediaItem(m) {
  const P = E.P; if (!P) return;
  const fit = (nw, nh) => { const s = Math.min(P.w / nw, P.h / nh); return [Math.round(nw * s), Math.round(nh * s)]; };
  const url = mediaURL(m.file), isVid = (m.mime || '').indexOf('video') === 0;
  if ((m.mime || '').indexOf('audio') === 0) {
    const a = new Audio(); a.preload = 'metadata';
    a.onloadedmetadata = () => {
      const d = isFinite(a.duration) && a.duration > 0 ? a.duration : 10;
      const o = newObj('audio', { name: (m.name || 'Audio').replace(/\.[^.]+$/, '').slice(0, 24), file: m.file, w: 0, h: 0, t0: E.t, t1: E.t + d, dur: d, vol: 1, fin: 0, fout: 0 });
      autoDur(); addObj(o); S.panel = 'aud'; renderBottom();
    };
    a.onerror = () => toast(tr('badfile'));
    a.src = url; return;
  }
  if (isVid) {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => {
      const [w, h] = fit(v.videoWidth || 1280, v.videoHeight || 720), d = v.duration || 5;
      const o = newObj('video', { name: (m.name || 'Video').slice(0, 24), file: m.file, w, h, t0: E.t, t1: E.t + d, dur: d }); autoDur(); addObj(o);
      v.removeAttribute('src'); v.load();
    };
    v.onerror = () => {
      v.removeAttribute('src');
      if (!m.converted && window.PixyMedia && window.PixyMedia.convertVideo) {
        $('exmsg').textContent = tr('prep'); $('exbar').style.width = '30%'; $('excancel').classList.add('hidden'); $('exprog').classList.remove('hidden');
        try { window.PixyMedia.convertVideo(m.file, m.name || 'Video'); } catch (e) { $('exprog').classList.add('hidden'); toast(tr('badfile')); }
      } else toast(tr('badfile'));
    };
    v.src = url;
  } else {
    const i = new Image();
    i.onload = () => {
      const [w, h] = fit(i.naturalWidth || 800, i.naturalHeight || 800);
      const o = newObj('image', { name: (m.name || 'Image').slice(0, 24), file: m.file, w, h }); layerTimes(o); IMGS.set(m.file, i); addObj(o);
    };
    i.onerror = () => toast(tr('badfile')); i.src = url;
  }
}

/* ---------- export ---------- */
function exportSheet() {
  if (E.P.dur <= 0) return toast(tr('exfail'));
  let q = 720;
  const s = sheet('<h3>' + tr('exportT') + '</h3><div class="sl"><span>' + tr('quality') + '</span></div><div class="chips"><button class="chip on" data-q="720">720p</button><button class="chip" data-q="1080">1080p</button></div><div class="row2"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + tr('start') + '</button></div>');
  s.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { q = +b.dataset.q; s.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b)); });
  s.querySelector('#a0').onclick = closeSheet;
  s.querySelector('#a1').onclick = async () => {
    closeSheet(); stopPlay();
    if (!window.PixyNative) return toast(tr('exfail'));
    $('excancel').classList.remove('hidden'); $('exprog').classList.remove('hidden'); $('exbar').style.width = '0';
    try {
      const out = await Exp.run(q, E.P.name.replace(/[^\w\-]+/g, '_') || 'pixy', p => { $('exbar').style.width = Math.round(p * 100) + '%'; $('exmsg').textContent = tr('exporting') + ' ' + Math.round(p * 100) + '%'; });
      $('exprog').classList.add('hidden'); toast(out ? tr('saved') : tr('cancelled'));
    } catch (e) { $('exprog').classList.add('hidden'); toast(tr('exfail')); }
    setTime(E.t);
  };
}

/* ---------- controls wiring ---------- */
function wireEditor() {
  $('bBack').onclick = () => closeEditor();
  $('bBack2').onclick = () => { if (S.panel) { S.panel = null; renderBottom(); } else select(null); };
  $('pname').onclick = async () => {
    const v = await ask(tr('rename'), E.P.name);
    if (v === null) return;
    pushUndo(); if (v.trim()) { E.P.name = v.trim(); $('pname').textContent = E.P.name; }
    changed('struct'); TL.build();
  };
  $('lname').onclick = async () => { const o = selObj(); if (!o || S.panel) return; const v = await ask(tr('rename'), o.name || ''); if (v && v.trim()) { pushUndo(); o.name = v.trim(); changed('struct'); } };
  $('bGroup').onclick = () => toast(tr('layer'));
  $('bGroup2').onclick = () => { const o = selObj(); if (o) linkSheet(o); };
  $('bTrash').onclick = () => layerAct('del');
  $('bMore').onclick = () => { const o = selObj(); if (o) moreMenu(o); };
  $('exp').onclick = exportSheet; $('bSet').onclick = projectScreenSheet;
  $('bUndo').onclick = () => { doUndo(); refreshAll(); TL.build(); };
  $('bRedo').onclick = () => { doRedo(); refreshAll(); TL.build(); };
  $('bFirst').onclick = () => { stopPlay(); setTime(0); };
  $('bLast').onclick = () => { stopPlay(); setTime(E.P.dur); };
  $('play').onclick = () => (E.playing ? stopPlay() : play());
  $('bEdit').onclick = editMenu; $('bLayers').onclick = camStrip;
  $('bottom').addEventListener('click', e => {
    const t = e.target; if (!E.sel || E.multi) return;
    if (t === $('lsel') || t === $('lt') || t === $('tabs') || t === $('panel') || t === $('bottom')) select(null);
  });
  $('kPrev').onclick = () => jumpKey(-1); $('kNext').onclick = () => jumpKey(1);
  $('tm').onclick = () => {
    const m = E.P.marks, i = m.findIndex(x => Math.abs(x - E.t) < EPS);
    if (i >= 0) { m.splice(i, 1); toast(tr('markerx')); } else { m.push(E.t); toast(tr('marker')); }
    scheduleSave(); TL.build();
  };
  $('excancel').onclick = () => { Exp.cancel = true; };
  const stage = $('stage'), cv = $('cv');
  S.pinch = new Pinch({ obj: selObj, move: true, apply: () => { changedHook(); if (S.panel === 'pad') Pad.refresh(); else if (S.panel === 'camopt') CamOpt.refresh(); } });
  const handleHit = (o, e) => {
    const hp = handlePts(o); if (!hp) return null;
    const r = cv.getBoundingClientRect(), Z = zoomEff(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const P = p => [cx + p.x * Z, cy + p.y * Z];
    const [rx, ry] = P(hp.rot); if (Math.hypot(e.clientX - rx, e.clientY - ry) < 28) return { t: 'rot', c: P(hp.c) };
    for (const c of hp.corners) { const [x, y] = P(c); if (Math.hypot(e.clientX - x, e.clientY - y) < 26) return { t: 'scale', c: P(hp.c) }; }
    if (SIZABLE[o.type]) for (const g of hp.edges) { const [x, y] = P(g), [ox, oy] = P({ x: g.ox, y: g.oy }); if (Math.hypot(e.clientX - x, e.clientY - y) < 22) return { t: 'edge', c: P(hp.c), k: g.k, e: [x, y], o: [ox, oy] }; }
    return null;
  };
  const camIdentity = () => { const c = camPose(E.t); return c.x === 0 && c.y === 0 && c.z === 0 && c.rot === 0 && c.sx === 1 && c.zf === 1 && c.dist === 1000; };
  stage.addEventListener('pointerdown', e => {
    if (E.playing) return;
    stage.setPointerCapture(e.pointerId);
    if (S.pinch.pts.size >= 1) S.tapOut = null;
    if (S.pinch.down(e)) { S.drag = null; S.tapOut = null; return; }
    const r = cv.getBoundingClientRect(), k = cv.width / r.width, sel = selObj();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (sel && !sel.lock && sel.type !== 'camera' && sel.type !== 'null') {
      const h = handleHit(sel, e);
      if (h) {
        const p0 = poseOf(sel, E.t), d0 = Math.hypot(e.clientX - h.c[0], e.clientY - h.c[1]) || 1;
        S.drag = { kind: h.t, o: sel, c: h.c, d0, p0, ed: h, w0: sel.w, h0: sel.h, began: false, lastA: Math.atan2(e.clientY - h.c[1], e.clientX - h.c[0]), tot: 0, lock: null };
        e.preventDefault(); return;
      }
    }
    const o = (inside && !(sel && sel.type === 'camera' && E.cam)) ? hitTest((e.clientX - r.left) * k, (e.clientY - r.top) * k, cv.width, cv.height) : null;
    if (!inside && sel && S.panel && !E.pick) { S.tapOut = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), closePanel: true }; return; }
    if (!o) {
      if (sel && sel.type === 'camera') { // the camera never gets deselected from the preview
        if (E.cam && !sel.lock) { S.drag = { kind: 'cam', o: sel, x0: e.clientX, y0: e.clientY, p0: poseOf(sel, E.t), began: false }; e.preventDefault(); }
        return;
      }
      // black area outside the picture: deselect only on a clean, quick tap (not a drag, not a pinch)
      if (!inside && !E.pick && (E.sel || E.multi)) S.tapOut = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    if (E.sel !== o.id) select(o.id);
    if (o.lock) return toast(tr('unlocked'));
    const q = o._q, bb = q ? { l: Math.min(...q.map(p => p.x)), r: Math.max(...q.map(p => p.x)), t: Math.min(...q.map(p => p.y)), b: Math.max(...q.map(p => p.y)) } : null;
    S.drag = { kind: 'move', o, x0: e.clientX, y0: e.clientY, p0: poseOf(o, E.t), began: false, bb, snap: !o.par && camIdentity(), gk: '' };
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (S.tapOut && Math.hypot(e.clientX - S.tapOut.x, e.clientY - S.tapOut.y) > 8) S.tapOut = null;
    if (S.pinch.move(e)) return;
    const d = S.drag; if (!d) return;
    if (!d.began) { pushUndo(); d.began = true; }
    const Z = zoomEff();
    if (d.kind === 'scale') {
      const f = Math.hypot(e.clientX - d.c[0], e.clientY - d.c[1]) / d.d0;
      setPose(d.o, { sx: Math.max(0.02, d.p0.sx * f), sy: Math.max(0.02, d.p0.sy * f) }, E.t); pzTag(Math.round(d.p0.sx * f * 100) + '%');
    } else if (d.kind === 'edge') {
      const E0 = d.ed, ux = E0.e[0] - E0.o[0], uy = E0.e[1] - E0.o[1], len0 = Math.hypot(ux, uy) || 1, nx = ux / len0, ny = uy / len0;
      const L = Math.max(12, (e.clientX - E0.o[0]) * nx + (e.clientY - E0.o[1]) * ny), f = L / len0;
      if (E0.k === 'w') d.o.w = Math.max(10, Math.round(d.w0 * f)); else d.o.h = Math.max(10, Math.round(d.h0 * f));
      const sh = (L - len0) / 2 / Z, [lx, ly] = Pad.localDelta(d.o, nx * sh, ny * sh);
      setPose(d.o, { x: d.p0.x + lx, y: d.p0.y + ly }, E.t); pzTag(d.o.w + '×' + d.o.h);
    } else if (d.kind === 'rot') {
      const a = Math.atan2(e.clientY - d.c[1], e.clientX - d.c[0]);
      let da = a - d.lastA; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      d.tot += da; d.lastA = a;
      let rot = d.p0.rot + d.tot / D2R; const md = ((rot % 360) + 360) % 360; let hit = null;
      for (const sn of SNAPS) if (Math.abs(md - sn) < 3.5) { hit = sn; break; }
      if (hit !== null) { rot = rot - md + hit; if (d.lock !== hit) { d.lock = hit; try { navigator.vibrate && navigator.vibrate(12); } catch (er) {} } } else d.lock = null;
      setPose(d.o, { rot }, E.t); pzTag(Math.round(rot) + '°');
    } else if (d.kind === 'cam') {
      const z = (d.p0.sx || 1) * Z;
      setPose(d.o, { x: d.p0.x - (e.clientX - d.x0) / z, y: d.p0.y - (e.clientY - d.y0) / z }, E.t);
    } else {
      const [lx, ly] = Pad.localDelta(d.o, (e.clientX - d.x0) / Z, (e.clientY - d.y0) / Z);
      let nx = d.p0.x + lx, ny = d.p0.y + ly; const gd = {};
      if (d.snap) {
        const th = 7 / Z, hw = E.P.w / 2, hh = E.P.h / 2;
        if (Math.abs(nx) < th) { nx = 0; gd.vx = true; }
        if (Math.abs(ny) < th) { ny = 0; gd.hy = true; }
        const b = d.bb;
        if (b) {
          const L = b.l + (nx - d.p0.x), R = b.r + (nx - d.p0.x), T = b.t + (ny - d.p0.y), Bm = b.b + (ny - d.p0.y);
          if (!gd.vx) { if (Math.abs(L + hw) < th) { nx += -hw - L; gd.l = true; } else if (Math.abs(R - hw) < th) { nx += hw - R; gd.r = true; } }
          if (!gd.hy) { if (Math.abs(T + hh) < th) { ny += -hh - T; gd.t = true; } else if (Math.abs(Bm - hh) < th) { ny += hh - Bm; gd.b = true; } }
        }
      }
      const gk = Object.keys(gd).join(','); if (gk && gk !== d.gk) { try { navigator.vibrate && navigator.vibrate(10); } catch (er) {} } d.gk = gk;
      E.guides = gk ? gd : null;
      setPose(d.o, { x: nx, y: ny }, E.t);
    }
    changedHook(); if (S.panel === 'pad') Pad.refresh(); else if (S.panel === 'camopt') CamOpt.refresh();
  });
  const up = e => {
    const to = S.tapOut; S.tapOut = null;
    if (to && to.id === e.pointerId && e.type === 'pointerup' && performance.now() - to.t < 450 && S.pinch.pts.size <= 1 && (E.sel || E.multi)) { if (to.closePanel) { S.panel = null; renderBottom(); render(); } else select(null); }
    S.pinch.up(e); if (S.pinch.pts.size === 0) { S.drag = null; E.guides = null; pzTag(null); render(); } };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  TL.init($('tl'), {
    scrub(t) { if (E.playing) stopPlay(); setTime(t, 'scroll'); },
    pause() { stopPlay(); }, seek(t) { setTime(t); },
    select(id) { if (E.pick) { E.multi = E.multi || []; const i = E.multi.indexOf(id); if (i >= 0) E.multi.splice(i, 1); else E.multi.push(id); TL.setSel(); renderBottom(); } else select(id); }, toast, reorder: reorderLayers,
    act(id, a) { const o = find(id); pushUndo(); if (a === 'eye') o.vis = o.vis === false; else o.lock = !o.lock; changed('struct'); },
    changed() { changed('struct'); }
  });
  window.addEventListener('resize', () => { if (E.P) { lockLayout(); fitCanvas($('stage')); TL.build(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && E.P) { stopPlay(); E.P.lastT = E.t; DB.put(E.P); } });
  window.addEventListener('pagehide', () => { if (E.P) { E.P.lastT = E.t; DB.put(E.P); } });
}
function jumpKey(dir) {
  const o = selObj(); if (!o || !o.kf.length) return toast(tr('nokey'));
  const ks = o.kf.map(k => k.t), n = dir > 0 ? ks.find(t => t > E.t + EPS) : [...ks].reverse().find(t => t < E.t - EPS);
  if (n === undefined) return toast(tr('nokey')); stopPlay(); setTime(n);
}

/* ---------- Android back ---------- */
window.onAndroidBack = function () {
  if (!$('exprog').classList.contains('hidden')) return true;
  const cv = document.querySelector('.curve'); if (cv) { cv.remove(); return true; }
  if ($('cstrip')) { closeCamStrip(); return true; }
  if (!$('ov').classList.contains('hidden')) { closeSheet(); return true; }
  if (E.P) {
    if (E.multi) { E.multi = null; TL.setSel(); renderBottom(); }
    else if (S.panel) { S.panel = null; renderBottom(); }
    else if (E.sel) select(null);
    else closeEditor();
    return true;
  }
  return false;
};

/* ---------- start ---------- */
/* Ghost-click guard: a tap re-lays out the screen, so the delayed click can land on a different button
   (cut, tabs...). Any click whose target is unrelated to where the finger went down is cancelled. */
(function () {
  let dn = null, at = 0;
  document.addEventListener('pointerdown', e => { dn = e.target; at = Date.now(); }, true);
  document.addEventListener('click', e => {
    if (!dn || Date.now() - at > 1000 || e.detail === 0) return;
    const t = e.target;
    if (t === dn || (dn.contains && (dn.contains(t) || t.contains(dn)))) return;
    e.stopPropagation(); e.preventDefault();
  }, true);
})();
window.addEventListener('DOMContentLoaded', async () => {
  // Only a crash-recovery reload (?restore=1) goes back into the open project. A fresh start opens Home, like other apps.
  const restore = /[?&]restore=1/.test(location.search);
  let id = null; try { id = localStorage.getItem('pixyOpen'); if (!restore) localStorage.removeItem('pixyOpen'); } catch (e) {}
  if (restore && id) { $('home').classList.add('hidden'); }
  paintStatic(); wireEditor();
  $('fab').onclick = newProjectSheet; $('hset').onclick = settingsSheet;
  await renderHome();
  if (restore && id) openProject(id);
});

/* ---------- copy chosen features of a layer, paste onto any other layer ---------- */
const FEAT_KEYS = {
  text: ['font', 'fs', 'bold', 'italic', 'under', 'caps', 'align', 'ls', 'lhm', 'bg', 'bgp', 'bgr', 'rs', 'txo'],
  mask: ['mask', 'lb', 'bw', 'bc'],
  color: ['fill', 'fill2', 'col', 'gc', 'glow', 'fx']
};
function featCopy(o) {
  const hasFx = (o.efx || []).length;
  const rows = [['fxall', L2('All effects', 'सारे इफेक्ट'), hasFx], ['text', L2('Text style', 'टेक्स्ट स्टाइल'), 1], ['kf', L2('Keyframes / animation', 'कीफ्रेम / एनिमेशन'), o.kf.length], ['mask', L2('Mask & border', 'मास्क और बॉर्डर'), 1], ['color', L2('Colour & glow', 'रंग और ग्लो'), 1]];
  (o.efx || []).forEach((e, i) => { if (FXD[e.k]) rows.push(['fx' + i, L2('Effect: ', 'इफेक्ट: ') + FXD[e.k].n, 1]); });
  const s = sheet('<h3>' + L2('What to copy?', 'क्या कॉपी करना है?') + '</h3><div class="list fcl">' + rows.map(r => '<label class="fcr"><input type="checkbox" data-k="' + r[0] + '"' + (r[2] ? '' : ' disabled') + '><span>' + esc(r[1]) + '</span></label>').join('') + '</div><div class="row2"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + L2('Copy', 'कॉपी') + '</button></div>');
  s.querySelector('#a0').onclick = closeSheet;
  s.querySelector('#a1').onclick = () => {
    const on = [...s.querySelectorAll('input:checked')].map(i => i.dataset.k); if (!on.length) return toast(L2('Choose something', 'कुछ चुनो'));
    const c = { t0: o.t0, names: [], efx: [], f: {} }, cp = v => JSON.parse(JSON.stringify(v));
    on.forEach(k => {
      if (k === 'fxall') { c.efx = cp(o.efx || []); c.names.push(L2('effects', 'इफेक्ट')); }
      else if (/^fx\d+$/.test(k)) { const e = (o.efx || [])[+k.slice(2)]; if (e && !c.efx.some(q => q.id === e.id) && !on.includes('fxall')) { c.efx.push(cp(e)); c.names.push(FXD[e.k].n); } }
      else if (k === 'kf') { c.kf = cp(o.kf); c.names.push(L2('animation', 'एनिमेशन')); }
      else { FEAT_KEYS[k].forEach(f => { if (o[f] !== undefined) c.f[f] = cp(o[f]); }); c.names.push(k === 'text' ? L2('text style', 'टेक्स्ट स्टाइल') : k === 'mask' ? L2('mask', 'मास्क') : L2('colour', 'रंग')); }
    });
    c.names = c.names.join(', '); S.featClip = c; closeSheet(); toast(L2('Copied: ', 'कॉपी: ') + c.names);
  };
}
function featPaste(o) {
  const c = S.featClip; if (!c) return toast(L2('Nothing copied', 'कुछ कॉपी नहीं है')); if (o.lock) return toast(tr('unlocked'));
  pushUndo(); const cp = v => JSON.parse(JSON.stringify(v)), dt = o.t0 - c.t0;
  if (c.efx.length) { o.efx = o.efx || []; c.efx.forEach(e => { const n = cp(e); n.id = 'e' + Math.random().toString(36).slice(2, 8); if (n.kf) Object.keys(n.kf).forEach(k => n.kf[k].forEach(x => { x.t = Math.max(o.t0, x.t + dt); })); o.efx.push(n); }); }
  if (c.kf) { const bx = o.x, by = o.y; o.kf = cp(c.kf).map(k => { k.t = Math.max(0, k.t + dt); return k; }); }
  Object.keys(c.f).forEach(k => { if (k === 'mask' && o.type === 'null') return; o[k] = cp(c.f[k]); });
  if (o._tx) o._tx = null; try { TXC.delete(o.id); } catch (er) {}
  changedHook(true); renderBottom(); toast(L2('Pasted', 'पेस्ट हो गया'));
}
