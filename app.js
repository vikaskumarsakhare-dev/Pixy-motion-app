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
  $('bBack').innerHTML = ic('back', 24); $('bGroup').innerHTML = ic('group', 22); $('exp').innerHTML = ic('export', 22);
  $('bBack2').innerHTML = ic('back', 24); $('bGroup2').innerHTML = ic('group', 22); $('bTrash').innerHTML = ic('trash', 22); $('bMore').innerHTML = ic('dots', 22);
  $('bUndo').innerHTML = ic('undo', 21); $('bRedo').innerHTML = ic('redo', 21);
  $('bFirst').innerHTML = ic('first', 20); $('bLast').innerHTML = ic('last', 20);
  $('bEdit').innerHTML = ic('edit', 22); $('bLayers').innerHTML = ic('layers', 22);
  $('kPrev').innerHTML = ic('prev', 18); $('kNext').innerHTML = ic('next', 18);
  $('excancel').textContent = tr('cancel'); $('exmsg').textContent = tr('exporting');
  $('menu').innerHTML = [['shape', 'shape'], ['media', 'media'], ['text', 'text'], ['element', 'element'], ['audio', 'audio'], ['template', 'template'], ['draw', 'draw'], ['vector', 'vector']]
    .map(([i, k]) => '<button data-k="' + k + '" class="' + (['audio', 'template', 'draw', 'vector'].includes(k) ? 'soon' : '') + '">' + ic(i, 24) + '<span>' + tr(k) + '</span></button>').join('');
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
function newProjectSheet() {
  const R = [['r169', 1920, 1080], ['r916', 1080, 1920], ['r11', 1080, 1080], ['r45', 1080, 1350]];
  const s = sheet('<h3>' + tr('newp') + '</h3><div class="list">' + R.map((r, i) => '<button data-i="' + i + '">' + ic('media', 20) + '<span>' + tr(r[0]) + '</span></button>').join('') + '</div>');
  s.querySelectorAll('button').forEach(b => b.onclick = async () => {
    const r = R[b.dataset.i], n = (await DB.all()).length + 1;
    const P = { id: uid(), name: tr('projname') + ' ' + n, w: r[1], h: r[2], bg: '#0b0b12', dur: 0, objects: [], marks: [], thumb: '', updated: Date.now() };
    await DB.put(P); closeSheet(); openProject(P.id);
  });
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
  E.P = P; E.sel = null; E.multi = null; E.t = clamp(P.lastT || 0, 0, P.dur); E.undo = []; E.redo = []; E.playing = false; E.cam = true; S.panel = null;
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
  if (S.panel === 'pad') Pad.refresh(); else if (S.panel) { S.upd.forEach(f => f()); refreshStrip(); }
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
  E.multi = null; E.sel = id;
  if (!id) S.panel = null;
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
  if (S.panel === 'pad' && E.sel) Pad.refresh();
  if (end) { stopPlay(); return; }
  requestAnimationFrame(loop);
}

/* ---------- bottom area ---------- */
const TABS = [['pad', 'pad', 'move'], ['cam', 'cam3d', 'camera'], ['fx', 'effect', 'depth']];
function renderBottom() {
  const o = selObj(), multi = E.multi && E.multi.length, view = multi ? 'multi' : o ? (S.panel ? 'panel' : 'layer') : 'idle';
  $('menu').classList.toggle('hidden', view !== 'idle');
  $('multi').classList.toggle('hidden', view !== 'multi');
  $('lsel').classList.toggle('hidden', view !== 'layer' && view !== 'panel');
  $('bottom').classList.toggle('grow', view === 'layer' || view === 'panel');
  $('tlwrap').classList.toggle('small', view === 'layer' || view === 'panel');
  $('topA').classList.toggle('hidden', !!o); $('topB').classList.toggle('hidden', !o);
  if (o) $('lname').textContent = o.name || o.type;
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
      '<button data-a="vol" class="' + (o.mute ? 'on' : '') + '">' + ic(o.mute ? 'mute' : 'vol', 19) + '<span>' + tr('volume') + '</span></button>';
    $('lt').querySelectorAll('button').forEach(b => b.onclick = () => layerAct(b.dataset.a));
    $('tabs').innerHTML = TABS.map(([k, l, i]) => '<button data-t="' + k + '">' + ic(i, 28) + tr(l) + '</button>').join('');
    $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.panel = b.dataset.t; renderBottom(); });
    requestAnimationFrame(() => TL.focusSel());
  } else {
    const p = $('panel'); p.innerHTML = '';
    if (S.panel === 'pad') { const d = document.createElement('div'); d.className = 'pad'; p.appendChild(d); Pad.mount(d, padHooks); }
    else { const d = document.createElement('div'); d.className = 'fxp'; d.innerHTML = stripHTML() + '<div class="pp"></div>'; p.appendChild(d); bindStrip(d, padHooks); if (S.panel === 'cam') camPanel(d.querySelector('.pp'), o); else fxPanel(d.querySelector('.pp'), o); refreshStrip(); }
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
function changedHook(forceTL) {
  E.P.updated = Date.now(); scheduleSave(); render();
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
    { icon: 'rotate', label: tr('reset'), fn: () => { pushUndo(); setPose(o, { x: 0, y: 0, z: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0 }, E.t); changedHook(); refreshPanel(); } },
    { icon: 'scale', label: tr('flipx'), fn: () => { pushUndo(); o.flipX = !o.flipX; changedHook(); } },
    { icon: 'scale', label: tr('flipy'), fn: () => { pushUndo(); o.flipY = !o.flipY; changedHook(); } },
    { icon: 'next', label: tr('up'), fn: () => moveLayer(o, 1) },
    { icon: 'prev', label: tr('down'), fn: () => moveLayer(o, -1) },
    { icon: 'copy', label: tr('copy'), fn: () => { pushUndo(); const n = dupObj(o); changed('struct'); select(n.id); } }
  ]);
}
function moveLayer(o, d) {
  const L = E.P.objects, i = L.indexOf(o), j = clamp(i + d, 0, L.length - 1); if (i === j) return;
  pushUndo(); L.splice(i, 1); L.splice(j, 0, o); changed('struct');
}
function layerAct(a) {
  const o = selObj(); if (!o) return;
  if (a === 'del') { pushUndo(); removeObj(o.id); E.sel = null; S.panel = null; changed('struct'); select(null); }
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
function swatches(parent, cur, fn) {
  const d = document.createElement('div'); d.className = 'sw';
  d.innerHTML = COLORS.map(c => '<i data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '"></i>').join('');
  d.querySelectorAll('i').forEach(i => i.onclick = () => { const o = selObj(); if (!o || o.lock) return; pushUndo(); fn(i.dataset.c); d.querySelectorAll('i').forEach(x => x.classList.toggle('on', x === i)); changedHook(); });
  parent.appendChild(d);
}
function fxPanel(p, o) {
  if (o.type === 'text') {
    const t = document.createElement('textarea'); t.className = 'tx'; t.rows = 2; t.value = o.text; p.appendChild(t);
    let began = false; t.onfocus = () => { began = false; };
    t.oninput = () => { if (!began) { pushUndo(); began = true; } o.text = t.value || ' '; changedHook(); };
    const f = document.createElement('div'); f.className = 'chips';
    f.innerHTML = ['sans', 'serif', 'mono', 'hand'].map(k => '<button class="chip ' + (o.font === k ? 'on' : '') + '" data-f="' + k + '">' + tr(k) + '</button>').join('') + '<button class="chip ' + (o.bold ? 'on' : '') + '" data-b="1"><b>B</b> ' + tr('bold') + '</button>';
    f.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { pushUndo(); o.font = b.dataset.f; changedHook(); renderBottom(); });
    f.querySelector('[data-b]').onclick = () => { pushUndo(); o.bold = !o.bold; changedHook(); renderBottom(); };
    p.appendChild(f);
    slider(p, tr('size'), 20, 400, 2, () => o.fs, v => { o.fs = v; });
  }
  if (o.type === 'text' || o.type === 'shape') {
    swatches(p, o.fill, c => { o.fill = c; });
    slider(p, tr('border'), 0, 40, 1, () => o.bw || 0, v => { o.bw = v; });
    if ((o.bw || 0) > 0) swatches(p, o.bc || '#ffffff', c => { o.bc = c; });
  }
  slider(p, tr('opacity'), 0, 1, 0.01, () => poseOf(o, E.t).op, v => setPose(o, { op: v }, E.t));
  slider(p, tr('blur'), 0, 60, 1, () => poseOf(o, E.t).bl, v => setPose(o, { bl: v }, E.t));
  slider(p, tr('glow'), 0, 80, 1, () => poseOf(o, E.t).gl, v => setPose(o, { gl: v }, E.t));
  slider(p, tr('shadow'), 0, 60, 1, () => poseOf(o, E.t).sh, v => setPose(o, { sh: v }, E.t));
}

/* ---------- group / link ---------- */
function linkSheet(o) {
  const others = E.P.objects.filter(q => q.id !== o.id);
  const items = [{ icon: 'plus', label: tr('newgroup'), fn: () => {
    pushUndo(); const w = wpose(o, E.t);
    const g = newObj('null', { name: tr('nulllayer') + ' ' + (E.P.objects.filter(q => q.type === 'null').length + 1), t0: 0, t1: 1, full: true, x: w.x, y: w.y, w: 80, h: 80 });
    if (E.P.dur <= 0) E.P.dur = 5;
    E.P.objects.splice(E.P.objects.indexOf(o), 0, g); setParent(o, g.id); changed('struct'); select(o.id);
  } }, { icon: 'close', label: tr('none'), cls: o.par ? '' : 'on', fn: () => { pushUndo(); setParent(o, null); changed('struct'); select(o.id); } }];
  others.forEach(q => items.push({ icon: 'link', label: q.name || q.type, cls: o.par === q.id ? 'on' : '', fn: () => { pushUndo(); setParent(o, q.id); changed('struct'); select(o.id); } }));
  listSheet(tr('attach'), items);
}

/* ---------- multi-select, copy / paste, duplicate ---------- */
function multiBar() {
  const m = $('multi'), n = E.multi.length;
  m.innerHTML = '<div class="cnt">' + n + ' ' + tr('nsel') + '</div>' +
    '<button class="chip" data-a="dup">' + ic('copy', 16) + tr('dup') + '</button><button class="chip" data-a="copy">' + ic('paste', 16) + tr('copyl') + '</button>' +
    '<button class="chip" data-a="grp">' + ic('group', 16) + tr('groupm') + '</button><button class="chip" data-a="del">' + ic('trash', 16) + tr('delete') + '</button><button class="chip on" data-a="done">' + tr('done') + '</button>';
  m.querySelectorAll('button').forEach(b => b.onclick = () => multiAct(b.dataset.a));
}
function ids() { return E.multi && E.multi.length ? E.multi.slice() : E.sel ? [E.sel] : []; }
function multiAct(a) {
  const list = ids().map(find).filter(Boolean);
  if (a === 'done') { E.multi = null; TL.setSel(); renderBottom(); return; }
  if (a === 'copy') return copyLayers();
  pushUndo();
  if (a === 'dup') { const ns = list.map(o => dupObj(o)); E.multi = ns.map(n => n.id); }
  else if (a === 'del') { list.forEach(o => removeObj(o.id)); E.multi = null; }
  else if (a === 'grp') {
    let ax = 0, ay = 0; list.forEach(o => { const w = wpose(o, E.t); ax += w.x; ay += w.y; });
    const g = newObj('null', { name: tr('nulllayer') + ' ' + (E.P.objects.filter(q => q.type === 'null').length + 1), t0: 0, t1: 1, full: true, x: ax / list.length, y: ay / list.length, w: 80, h: 80 });
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
    { icon: 'selall', label: tr('selall'), fn: () => { if (!E.P.objects.length) return; E.sel = null; S.panel = null; E.multi = E.P.objects.map(o => o.id); TL.setSel(); renderBottom(); updLabel(); } },
    { icon: 'paste', label: tr('copyl'), fn: copyLayers },
    { icon: 'paste', label: tr('paste'), fn: pasteLayers }
  ]);
}

/* ---------- layers + camera sheet ---------- */
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
      r.querySelector('.nm').onclick = () => { closeSheet(); select(id); };
      r.querySelector('[data-a=up]').onclick = () => { const o = find(id); moveLayer(o, 1); layersSheet('layers'); };
      r.querySelector('[data-a=dn]').onclick = () => { const o = find(id); moveLayer(o, -1); layersSheet('layers'); };
      r.querySelector('[data-a=del]').onclick = () => { pushUndo(); removeObj(id); changed('struct'); layersSheet('layers'); };
    });
    body.querySelectorAll('.rup').forEach(x => x.style.transform = 'rotate(90deg)'); body.querySelectorAll('.rdn').forEach(x => x.style.transform = 'rotate(90deg)');
  } else {
    const cam = E.P.objects.find(q => q.type === 'camera');
    body.innerHTML = '<div class="sw2" id="camsw"><span>' + tr('cameraOn') + '</span><i class="' + (E.cam ? 'on' : '') + '"></i></div>' +
      '<div class="list"><button id="camsel">' + ic('camera', 20) + '<span>' + (cam ? tr('camlayer') : tr('camera') + ' +') + '</span></button></div>';
    body.querySelector('#camsw').onclick = () => { E.cam = !E.cam; render(); body.querySelector('#camsw i').classList.toggle('on', E.cam); };
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
  if (['audio', 'template', 'draw', 'vector'].includes(k)) return toast(tr(k) + ': ' + tr('soon'));
  if (k === 'camera') return addCamera();
  if (k === 'media') return pickMedia();
  if (k === 'text') { const o = newObj('text', { name: nextName(tr('text')), text: tr('hello'), fs: 130, fill: '#ffffff', font: 'sans', bold: true, bw: 0, bc: '#000000' }); layerTimes(o); textTex(o); return addObj(o); }
  if (k === 'shape') {
    const sh = ['rect', 'round', 'circle', 'tri', 'star', 'heart', 'arrow', 'line'];
    const s = sheet('<h3>' + tr('shape') + '</h3><div class="grid4">' + sh.map(x => '<button data-s="' + x + '"><canvas width="56" height="56" data-c="' + x + '"></canvas>' + tr(x) + '</button>').join('') + '</div>');
    s.querySelectorAll('canvas').forEach(c => { const g = c.getContext('2d'); g.fillStyle = '#a78bfa'; g.strokeStyle = '#a78bfa'; g.lineWidth = 5; g.lineCap = 'round'; if (c.dataset.c === 'line') { g.beginPath(); g.moveTo(6, 28); g.lineTo(50, 28); g.stroke(); } else { drawShapePath(g, c.dataset.c, 6, 6, 44, 44); g.fill(); } });
    s.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      closeSheet(); const kind = b.dataset.s, cols = ['#8b5cf6', '#ec4899', '#22d3ee', '#facc15', '#34d399'];
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
    const v = await ask(tr('rename'), E.P.name, '<div class="sl" style="margin-top:12px"><span>' + tr('duration') + '</span><input class="tx" id="durin" inputmode="decimal" value="' + (Math.round(E.P.dur * 10) / 10) + '"></div>');
    const d = parseFloat(($('durin') || {}).value);
    if (v === null) return;
    pushUndo(); if (v.trim()) { E.P.name = v.trim(); $('pname').textContent = E.P.name; }
    if (d >= 0) { let m = 0; E.P.objects.forEach(o => { if (!o.full) m = Math.max(m, o.t0 + 0.1); }); E.P.dur = Math.max(d, 0); if (E.t > E.P.dur) E.t = E.P.dur; }
    changed('struct'); TL.build();
  };
  $('lname').onclick = async () => { const o = selObj(); if (!o) return; const v = await ask(tr('rename'), o.name || ''); if (v && v.trim()) { pushUndo(); o.name = v.trim(); changed('struct'); } };
  $('bGroup').onclick = () => toast(tr('layer'));
  $('bGroup2').onclick = () => { const o = selObj(); if (o) linkSheet(o); };
  $('bTrash').onclick = () => layerAct('del');
  $('bMore').onclick = () => { const o = selObj(); if (o) moreMenu(o); };
  $('exp').onclick = exportSheet;
  $('bUndo').onclick = () => { doUndo(); refreshAll(); TL.build(); };
  $('bRedo').onclick = () => { doRedo(); refreshAll(); TL.build(); };
  $('bFirst').onclick = () => { stopPlay(); setTime(0); };
  $('bLast').onclick = () => { stopPlay(); setTime(E.P.dur); };
  $('play').onclick = () => (E.playing ? stopPlay() : play());
  $('bEdit').onclick = editMenu; $('bLayers').onclick = () => layersSheet('layers');
  $('kPrev').onclick = () => jumpKey(-1); $('kNext').onclick = () => jumpKey(1);
  $('tm').onclick = () => {
    const m = E.P.marks, i = m.findIndex(x => Math.abs(x - E.t) < EPS);
    if (i >= 0) { m.splice(i, 1); toast(tr('markerx')); } else { m.push(E.t); toast(tr('marker')); }
    scheduleSave(); TL.build();
  };
  $('excancel').onclick = () => { Exp.cancel = true; };
  const stage = $('stage'), cv = $('cv');
  S.pinch = new Pinch({ obj: selObj, move: true, apply: () => { changedHook(); if (S.panel === 'pad') Pad.refresh(); } });
  stage.addEventListener('pointerdown', e => {
    if (E.playing) return;
    stage.setPointerCapture(e.pointerId);
    if (S.pinch.down(e)) { S.drag = null; return; }
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const o = hitTest((e.clientX - r.left) * k, (e.clientY - r.top) * k, cv.width, cv.height);
    if (!o) { if (E.sel || E.multi) select(null); return; }
    if (E.sel !== o.id) select(o.id);
    if (o.lock) return toast(tr('unlocked'));
    if (o.type === 'camera') return;
    S.drag = { o, x0: e.clientX, y0: e.clientY, p0: poseOf(o, E.t), began: false };
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (S.pinch.move(e)) return;
    const d = S.drag; if (!d) return;
    if (!d.began) { pushUndo(); d.began = true; }
    const [lx, ly] = Pad.localDelta(d.o, (e.clientX - d.x0) / E.zoom, (e.clientY - d.y0) / E.zoom);
    setPose(d.o, { x: d.p0.x + lx, y: d.p0.y + ly }, E.t); changedHook(); if (S.panel === 'pad') Pad.refresh();
  });
  const up = e => { S.pinch.up(e); if (S.pinch.pts.size === 0) S.drag = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  TL.init($('tl'), {
    scrub(t) { if (E.playing) stopPlay(); setTime(t, 'scroll'); },
    pause() { stopPlay(); }, seek(t) { setTime(t); },
    select, toast,
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
window.addEventListener('DOMContentLoaded', async () => {
  paintStatic(); wireEditor();
  $('fab').onclick = newProjectSheet; $('hset').onclick = settingsSheet;
  await renderHome();
  let id = null; try { id = localStorage.getItem('pixyOpen'); } catch (e) {}
  if (id) openProject(id);
});
