'use strict';
/* ===== App: screens, editor wiring, tools ===== */
const $ = id => document.getElementById(id);
const S = { tab: 'pad', saveT: 0, drag: null, kfc: -1, thumbs: {} };
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
function listSheet(title, items) { // items: [{icon,label,fn,cls}]
  const s = sheet((title ? '<h3>' + esc(title) + '</h3>' : '') + '<div class="list">' + items.map((it, i) => '<button data-i="' + i + '" class="' + (it.cls || '') + '">' + (it.icon ? ic(it.icon, 20) : '') + '<span>' + esc(it.label) + '</span></button>').join('') + '</div>');
  s.querySelectorAll('button').forEach(b => b.onclick = () => { closeSheet(); items[b.dataset.i].fn(); });
}

/* ---------- static texts ---------- */
function paintStatic() {
  document.documentElement.lang = LANG === 'hi' ? 'hi' : 'en';
  $('hset').innerHTML = ic('gear', 24); $('fab').innerHTML = ic('plus', 30);
  $('bBack').innerHTML = ic('back', 24); $('bGroup').innerHTML = ic('group', 22); $('exp').innerHTML = ic('export', 22);
  $('bUndo').innerHTML = ic('undo', 21); $('bRedo').innerHTML = ic('redo', 21);
  $('bFirst').innerHTML = ic('first', 20); $('bLast').innerHTML = ic('last', 20);
  $('kPrev').innerHTML = ic('prev', 18); $('kNext').innerHTML = ic('next', 18);
  $('excancel').textContent = tr('cancel'); $('exmsg').textContent = tr('exporting');
  $('menu').innerHTML = [['shape', 'shape'], ['media', 'media'], ['audio', 'audio'], ['element', 'element'], ['template', 'template'], ['text', 'text'], ['draw', 'draw'], ['vector', 'vector']]
    .map(([i, k]) => '<button data-k="' + k + '" class="' + (['audio', 'template', 'draw', 'vector'].includes(k) ? 'soon' : '') + '">' + ic(i, 23) + '<span>' + tr(k) + '</span></button>').join('');
  $('menu').querySelectorAll('button').forEach(b => b.onclick = () => menuTap(b.dataset.k));
  setPlayIcon(); setCamIcon();
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
    { icon: 'copy', label: tr('dup'), fn: async () => { const p = await DB.get(id); p.id = uid(); p.name += ' 2'; p.updated = Date.now(); p.objects.forEach(o => { o.id = o.id; }); await DB.put(p); renderHome(); } },
    { icon: 'trash', label: tr('del'), cls: 'red', fn: async () => { if (await confirmBox(tr('delq'))) { await DB.del(id); renderHome(); } } }
  ]);
}
function newProjectSheet() {
  const R = [['r169', 1920, 1080], ['r916', 1080, 1920], ['r11', 1080, 1080], ['r45', 1080, 1350]];
  const s = sheet('<h3>' + tr('newp') + '</h3><div class="list">' + R.map((r, i) => '<button data-i="' + i + '">' + ic('media', 20) + '<span>' + tr(r[0]) + '</span></button>').join('') + '</div>');
  s.querySelectorAll('button').forEach(b => b.onclick = async () => {
    const r = R[b.dataset.i], n = (await DB.all()).length + 1;
    const P = { id: uid(), name: tr('projname') + ' ' + n, w: r[1], h: r[2], bg: '#0b0b12', dur: 10, objects: [], thumb: '', updated: Date.now() };
    await DB.put(P); closeSheet(); openProject(P.id);
  });
}
function settingsSheet() {
  const s = sheet('<h3>' + tr('settings') + '</h3><div class="sl"><span>' + tr('lang') + '</span></div><div class="chips"><button class="chip ' + (LANG === 'en' ? 'on' : '') + '" data-l="en">English</button><button class="chip ' + (LANG === 'hi' ? 'on' : '') + '" data-l="hi">हिन्दी</button></div><p style="margin-top:14px;color:var(--mut);font-size:12px">' + tr('ver') + ' ' + (window.PIXY_VERSION || 'dev') + '</p>');
  s.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { setLang(b.dataset.l); closeSheet(); paintStatic(); renderHome(); });
}

/* ---------- editor open/close ---------- */
async function openProject(id) {
  const P = await DB.get(id); if (!P) return;
  P.objects.forEach(o => { o.kf = o.kf || []; o.fx = o.fx || {}; });
  E.P = P; E.sel = null; E.t = 0; E.undo = []; E.redo = []; E.playing = false; E.cam = true;
  E.cv = $('cv'); E.ctx = E.cv.getContext('2d');
  $('home').classList.add('hidden'); $('editor').classList.remove('hidden');
  $('pname').textContent = P.name; S.kfc = -1;
  requestAnimationFrame(() => { fitCanvas($('stage')); TL.build(); refreshAll(); });
  setCamIcon();
}
async function closeEditor() {
  stopPlay(); pauseVideos(); clearTimeout(S.saveT);
  try { E.P.thumb = makeThumb(); } catch (e) {}
  await DB.put(E.P);
  E.P = null; E.sel = null; $('editor').classList.add('hidden'); $('home').classList.remove('hidden'); renderHome();
}
function makeThumb() {
  const P = E.P, W = 320, H = Math.round(320 * P.h / P.w), c = document.createElement('canvas'); c.width = W; c.height = H;
  renderTo(c.getContext('2d'), W, H, 0, {}); return c.toDataURL('image/jpeg', 0.7);
}
function scheduleSave() { clearTimeout(S.saveT); S.saveT = setTimeout(() => { if (E.P) DB.put(E.P); }, 700); }

/* ---------- time / selection ---------- */
function updLabel() {
  $('tm').textContent = fmtTime(E.t);
  const has = !!selObj(); $('kPrev').classList.toggle('hid', !has); $('kNext').classList.toggle('hid', !has);
}
function setTime(t, from) {
  E.t = clamp(t, 0, E.P.dur); updLabel();
  if (from !== 'scroll') TL.setTime(E.t);
  syncVideos(E.t, E.playing); if (!E.playing) render();
  if (E.sel && S.tab === 'pad') Pad.refresh();
}
function refreshAll() {
  $('bUndo').classList.toggle('dis', !E.undo.length); $('bRedo').classList.toggle('dis', !E.redo.length);
  updLabel(); renderBottom(); render();
}
function select(id) {
  E.sel = id; TL.setSel(id); $('tlwrap').classList.toggle('small', !!id);
  S.kfc = selObj() ? selObj().kf.length : -1;
  updLabel(); renderBottom(); render();
  if (id) { const r = $('tl').querySelector('.lay.sel'); if (r) r.scrollIntoView({ block: 'nearest' }); }
}
function onChange(kind) {
  if (!E.P) return;
  scheduleSave();
  $('bUndo').classList.toggle('dis', !E.undo.length); $('bRedo').classList.toggle('dis', !E.redo.length);
  const o = selObj();
  if (kind === 'struct') { TL.build(); renderBottom(); updLabel(); }
  else if (o && o.kf.length !== S.kfc) { S.kfc = o.kf.length; TL.build(); TL.setSel(E.sel); }
}
E.onchange = onChange;

/* ---------- playback ---------- */
let lastTs = 0;
function setPlayIcon() { $('play').innerHTML = ic(E.playing ? 'pause' : 'play', 22); }
function play() {
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
  if (E.sel && S.tab === 'pad') Pad.refresh();
  if (end) { stopPlay(); return; }
  requestAnimationFrame(loop);
}

/* ---------- bottom area ---------- */
const TABS = [['pad', 'pad'], ['cam', 'cam3d'], ['fx', 'effect']];
function renderBottom() {
  const o = selObj();
  $('menu').classList.toggle('hidden', !!o); $('lsel').classList.toggle('hidden', !o);
  if (!o) { requestAnimationFrame(() => fitCanvas($('stage'))); return; }
  $('lt').innerHTML =
    '<button data-a="speed">' + ic('speed', 18) + tr('speed') + '</button>' +
    '<button data-a="del">' + ic('trash', 18) + tr('delete') + '</button>' +
    '<button data-a="vol" class="' + (o.mute ? 'on' : '') + '">' + ic(o.mute ? 'mute' : 'vol', 18) + tr('volume') + '</button>';
  $('lt').querySelectorAll('button').forEach(b => b.onclick = () => layerAct(b.dataset.a));
  $('tabs').innerHTML = TABS.map(([k, l]) => '<button data-t="' + k + '" class="' + (S.tab === k ? 'on' : '') + '">' + tr(l) + '</button>').join('');
  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderBottom(); });
  const p = $('panel'); p.innerHTML = '';
  if (S.tab === 'pad') { const d = document.createElement('div'); d.className = 'pad'; p.appendChild(d); Pad.mount(d, padHooks); }
  else if (S.tab === 'cam') camPanel(p, o); else fxPanel(p, o);
  requestAnimationFrame(() => fitCanvas($('stage')));
}
let gestureOpen = false;
const padHooks = {
  begin() { pushUndo(); },
  changed() { changedHook(); },
  toast,
  act(a) {
    const o = selObj(); if (!o) return;
    if (a === 'back') select(null);
    else if (a === 'key') { if (o.lock) return toast(tr('unlocked')); pushUndo(); toggleKey(o, E.t); changedHook(true); Pad.refresh(); }
    else if (a === 'curve') openCurve(o);
    else if (a === 'more') moreMenu(o);
  }
};
function changedHook(forceTL) {
  E.P.updated = Date.now(); scheduleSave(); render();
  const o = selObj(); if (o && (forceTL || o.kf.length !== S.kfc)) { S.kfc = o.kf.length; TL.build(); TL.setSel(E.sel); }
  $('bUndo').classList.remove('dis');
}
function openCurve(o) {
  const ks = o.kf; let k = keyAt(o, E.t);
  if (!k) { const idx = ks.filter(q => q.t <= E.t + EPS); k = idx[idx.length - 1]; }
  if (!k) return toast(tr('keyfirst'));
  if (ks.indexOf(k) === ks.length - 1 && ks.length > 1) k = ks[ks.length - 2];
  document.body.appendChild(Curve.open(o, k, () => { pushUndoLater(); changedHook(); }));
}
function pushUndoLater() { /* curve edits are small; snapshot after the fact is not possible, keep simple */ }
function moreMenu(o) {
  listSheet('', [
    { icon: 'rotate', label: tr('reset'), fn: () => { pushUndo(); setPose(o, { x: 0, y: 0, z: 0, sx: 1, sy: 1, rot: 0, rx: 0, ry: 0 }, E.t); changedHook(); Pad.refresh(); } },
    { icon: 'scale', label: tr('flipx'), fn: () => { pushUndo(); o.flipX = !o.flipX; changedHook(); } },
    { icon: 'scale', label: tr('flipy'), fn: () => { pushUndo(); o.flipY = !o.flipY; changedHook(); } },
    { icon: 'next', label: tr('up'), fn: () => moveLayer(o, 1) },
    { icon: 'prev', label: tr('down'), fn: () => moveLayer(o, -1) },
    { icon: 'copy', label: tr('copy'), fn: () => { pushUndo(); const n = dupObj(o); E.sel = n.id; changed('struct'); select(n.id); } }
  ]);
}
function moveLayer(o, d) {
  const L = E.P.objects, i = L.indexOf(o), j = clamp(i + d, 0, L.length - 1); if (i === j) return;
  pushUndo(); L.splice(i, 1); L.splice(j, 0, o); changed('struct');
}
function layerAct(a) {
  const o = selObj(); if (!o) return;
  if (a === 'del') { pushUndo(); removeObj(o.id); E.sel = null; changed('struct'); select(null); }
  else if (a === 'vol') { pushUndo(); o.mute = !o.mute; syncVideos(E.t, E.playing); changed(); renderBottom(); }
  else if (a === 'speed') {
    if (o.type !== 'video') return toast(tr('vidonly'));
    const s = sheet('<h3>' + tr('speed') + '</h3><div class="sl"><input type="range" id="spd" min="0.25" max="4" step="0.05" value="' + (o.speed || 1) + '"><em id="spv"></em></div><div class="chips" style="margin-top:12px">' + [0.5, 1, 1.5, 2, 3].map(v => '<button class="chip" data-v="' + v + '">' + v + '×</button>').join('') + '</div>');
    const r = s.querySelector('#spd'), em = s.querySelector('#spv'), set = v => { pushUndo(); o.speed = v; r.value = v; em.textContent = v + '×'; syncVideos(E.t, false); changed(); };
    em.textContent = (o.speed || 1) + '×'; r.onchange = () => set(parseFloat(r.value));
    s.querySelectorAll('[data-v]').forEach(b => b.onclick = () => set(parseFloat(b.dataset.v)));
  }
}

/* ---------- Camera + Effect tabs ---------- */
function slider(parent, label, min, max, step, get, set, unit) {
  const d = document.createElement('div'); d.className = 'sl';
  d.innerHTML = '<span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '"><em></em>';
  const r = d.querySelector('input'), em = d.querySelector('em'); r.value = get(); em.textContent = Math.round(get() * 100) / 100 + (unit || '');
  let began = false;
  r.addEventListener('pointerdown', () => { began = false; });
  r.addEventListener('input', () => { const o = selObj(); if (!o) return; if (o.lock) { toast(tr('unlocked')); r.value = get(); return; } if (!began) { pushUndo(); began = true; } set(parseFloat(r.value)); em.textContent = Math.round(parseFloat(r.value) * 100) / 100 + (unit || ''); changedHook(); });
  parent.appendChild(d);
}
function camPanel(p, o) {
  const d = document.createElement('div'); d.className = 'pp'; p.appendChild(d);
  slider(d, tr('tiltx'), -80, 80, 1, () => poseOf(o, E.t).rx, v => setPose(o, { rx: v }, E.t), '°');
  slider(d, tr('tiltY') === 'tiltY' ? tr('tilty') : tr('tilty'), -80, 80, 1, () => poseOf(o, E.t).ry, v => setPose(o, { ry: v }, E.t), '°');
  slider(d, 'Z', -800, 800, 5, () => poseOf(o, E.t).z, v => setPose(o, { z: v }, E.t));
  const b = document.createElement('div'); b.className = 'chips';
  b.innerHTML = '<button class="chip">' + ic('link', 16) + ' ' + tr('attach') + ': ' + esc(o.par ? ((find(o.par) || {}).name || '?') : tr('none')) + '</button>';
  b.firstChild.onclick = () => linkSheet(o); d.appendChild(b);
}
function swatches(parent, cur, fn) {
  const d = document.createElement('div'); d.className = 'sw';
  d.innerHTML = COLORS.map(c => '<i data-c="' + c + '" class="' + (c === cur ? 'on' : '') + '" style="background:' + c + '"></i>').join('');
  d.querySelectorAll('i').forEach(i => i.onclick = () => { const o = selObj(); if (!o || o.lock) return; pushUndo(); fn(i.dataset.c); d.querySelectorAll('i').forEach(x => x.classList.toggle('on', x === i)); changedHook(); });
  parent.appendChild(d);
}
function fxPanel(p, o) {
  const d = document.createElement('div'); d.className = 'pp'; p.appendChild(d);
  if (o.type === 'text') {
    const t = document.createElement('textarea'); t.className = 'tx'; t.rows = 2; t.value = o.text; d.appendChild(t);
    let began = false; t.onfocus = () => { began = false; };
    t.oninput = () => { if (!began) { pushUndo(); began = true; } o.text = t.value || ' '; changedHook(); };
    const f = document.createElement('div'); f.className = 'chips';
    f.innerHTML = ['sans', 'serif', 'mono', 'hand'].map(k => '<button class="chip ' + (o.font === k ? 'on' : '') + '" data-f="' + k + '">' + tr(k) + '</button>').join('') + '<button class="chip ' + (o.bold ? 'on' : '') + '" data-b="1"><b>B</b> ' + tr('bold') + '</button>';
    f.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { pushUndo(); o.font = b.dataset.f; changedHook(); renderBottom(); });
    f.querySelector('[data-b]').onclick = () => { pushUndo(); o.bold = !o.bold; changedHook(); renderBottom(); };
    d.appendChild(f);
    slider(d, tr('size'), 20, 400, 2, () => o.fs, v => { o.fs = v; });
  }
  if (o.type === 'text' || o.type === 'shape') {
    swatches(d, o.fill, c => { o.fill = c; });
    slider(d, tr('border'), 0, 40, 1, () => o.bw || 0, v => { o.bw = v; });
    if ((o.bw || 0) > 0) swatches(d, o.bc || '#ffffff', c => { o.bc = c; });
  }
  slider(d, tr('opacity'), 0, 1, 0.01, () => poseOf(o, E.t).op, v => setPose(o, { op: v }, E.t));
  o.fx = o.fx || {};
  slider(d, tr('blur'), 0, 40, 1, () => o.fx.blur || 0, v => { o.fx.blur = v; });
  slider(d, tr('glow'), 0, 80, 1, () => o.fx.glow || 0, v => { o.fx.glow = v; });
  slider(d, tr('shadow'), 0, 60, 1, () => o.fx.shadow || 0, v => { o.fx.shadow = v; });
}

/* ---------- group / link ---------- */
function linkSheet(o) {
  const others = E.P.objects.filter(q => q.id !== o.id);
  const items = [{ icon: 'plus', label: tr('newgroup'), fn: () => {
    pushUndo(); const w = wpose(o, E.t);
    const g = newObj('null', { name: tr('nulllayer') + ' ' + (E.P.objects.filter(q => q.type === 'null').length + 1), t0: 0, t1: E.P.dur, x: w.x, y: w.y, w: 80, h: 80 });
    E.P.objects.splice(E.P.objects.indexOf(o), 0, g); setParent(o, g.id); changed('struct'); select(o.id);
  } }, { icon: 'close', label: tr('none'), cls: o.par ? '' : 'on', fn: () => { pushUndo(); setParent(o, null); changed('struct'); select(o.id); } }];
  others.forEach(q => items.push({ icon: 'link', label: q.name || q.type, cls: o.par === q.id ? 'on' : '', fn: () => { pushUndo(); setParent(o, q.id); changed('struct'); select(o.id); } }));
  listSheet(tr('attach'), items);
}

/* ---------- add things ---------- */
function layerTimes(o) { o.t0 = E.t; o.t1 = E.t + 5; autoDur(); }
function addObj(o) { pushUndo(); E.P.objects.push(o); changed('struct'); select(o.id); }
function nextName(base) { const n = E.P.objects.filter(q => q.name && q.name.indexOf(base) === 0).length + 1; return base + ' ' + n; }
function menuTap(k) {
  if (['audio', 'template', 'draw', 'vector'].includes(k)) return toast(tr(k) + ': ' + tr('soon'));
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
      { icon: 'camera', label: tr('camera'), fn: () => {
        const ex = E.P.objects.find(q => q.type === 'camera'); if (ex) { toast(tr('camera')); return select(ex.id); }
        addObj(newObj('camera', { name: tr('camlayer'), t0: 0, t1: E.P.dur, w: 100, h: 100 })); } },
      { icon: 'nul', label: tr('nul'), fn: () => addObj(newObj('null', { name: nextName(tr('nulllayer')), t0: 0, t1: E.P.dur, w: 80, h: 80 })) }
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
  (list || []).forEach(m => addMediaItem(m));
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
    };
    v.onerror = () => toast(tr('mediafail')); v.src = url;
  } else {
    const i = new Image();
    i.onload = () => {
      const [w, h] = fit(i.naturalWidth || 800, i.naturalHeight || 800);
      const o = newObj('image', { name: (m.name || 'Image').slice(0, 24), file: m.file, w, h }); layerTimes(o); IMGS.set(m.file, i); addObj(o);
    };
    i.onerror = () => toast(tr('mediafail')); i.src = url;
  }
}

/* ---------- export ---------- */
function exportSheet() {
  let q = 720;
  const s = sheet('<h3>' + tr('exportT') + '</h3><div class="sl"><span>' + tr('quality') + '</span></div><div class="chips"><button class="chip on" data-q="720">720p</button><button class="chip" data-q="1080">1080p</button></div><div class="row2"><button class="btn ghost" id="a0">' + tr('cancel') + '</button><button class="btn" id="a1">' + tr('start') + '</button></div>');
  s.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { q = +b.dataset.q; s.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b)); });
  s.querySelector('#a0').onclick = closeSheet;
  s.querySelector('#a1').onclick = async () => {
    closeSheet(); stopPlay();
    if (!window.PixyNative) return toast(tr('exfail'));
    $('exprog').classList.remove('hidden'); $('exbar').style.width = '0';
    try {
      const out = await Exp.run(q, E.P.name.replace(/[^\w\-]+/g, '_') || 'pixy', p => { $('exbar').style.width = Math.round(p * 100) + '%'; $('exmsg').textContent = tr('exporting') + ' ' + Math.round(p * 100) + '%'; });
      $('exprog').classList.add('hidden'); toast(out ? tr('saved') : tr('cancelled'));
    } catch (e) { $('exprog').classList.add('hidden'); toast(tr('exfail')); }
    setTime(E.t);
  };
}

/* ---------- controls wiring ---------- */
function setCamIcon() { $('bCam').innerHTML = ic(E.cam ? 'cam' : 'camoff', 22); }
function wireEditor() {
  $('bBack').onclick = () => closeEditor();
  $('pname').onclick = async () => {
    const v = await ask(tr('rename'), E.P.name, '<div class="sl" style="margin-top:12px"><span>' + tr('duration') + '</span><input class="tx" id="durin" inputmode="numeric" value="' + Math.round(E.P.dur) + '"></div>');
    const d = parseFloat(($('durin') || {}).value);
    if (v === null) return;
    pushUndo(); if (v.trim()) { E.P.name = v.trim(); $('pname').textContent = E.P.name; }
    if (d > 0) { let m = 1; E.P.objects.forEach(o => { m = Math.max(m, o.t0 + 0.5); }); E.P.dur = Math.max(d, 1); }
    changed('struct'); TL.build();
  };
  $('bGroup').onclick = () => { const o = selObj(); if (!o) return toast(tr('layer')); linkSheet(o); };
  $('exp').onclick = exportSheet;
  $('bUndo').onclick = () => { doUndo(); refreshAll(); TL.build(); };
  $('bRedo').onclick = () => { doRedo(); refreshAll(); TL.build(); };
  $('bFirst').onclick = () => { stopPlay(); setTime(0); };
  $('bLast').onclick = () => { stopPlay(); setTime(E.P.dur); };
  $('play').onclick = () => (E.playing ? stopPlay() : play());
  $('bCam').onclick = () => { E.cam = !E.cam; setCamIcon(); render(); };
  $('kPrev').onclick = () => jumpKey(-1); $('kNext').onclick = () => jumpKey(1);
  $('excancel').onclick = () => { Exp.cancel = true; };
  const cv = $('cv');
  cv.addEventListener('pointerdown', e => {
    if (E.playing) return;
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const o = hitTest((e.clientX - r.left) * k, (e.clientY - r.top) * k, cv.width, cv.height);
    if (!o) { if (E.sel) select(null); return; }
    if (E.sel !== o.id) select(o.id);
    if (o.lock) return toast(tr('unlocked'));
    if (o.type === 'camera') return;
    S.drag = { o, x0: e.clientX, y0: e.clientY, p0: poseOf(o, E.t), began: false };
    cv.setPointerCapture(e.pointerId); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    const d = S.drag; if (!d) return;
    if (!d.began) { pushUndo(); d.began = true; }
    const [lx, ly] = Pad.localDelta(d.o, (e.clientX - d.x0) / E.zoom, (e.clientY - d.y0) / E.zoom);
    setPose(d.o, { x: d.p0.x + lx, y: d.p0.y + ly }, E.t); changedHook(); if (S.tab === 'pad') Pad.refresh();
  });
  const up = () => { S.drag = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  TL.init($('tl'), {
    scrub(t) { if (E.playing) stopPlay(); setTime(t, 'scroll'); },
    pause() { stopPlay(); }, seek(t) { setTime(t); },
    select, act(id, a) { const o = find(id); pushUndo(); if (a === 'eye') o.vis = o.vis === false; else o.lock = !o.lock; changed('struct'); },
    changed() { changed('struct'); }
  });
  window.addEventListener('resize', () => { if (E.P) { fitCanvas($('stage')); TL.build(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && E.P) { stopPlay(); DB.put(E.P); } });
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
  if (E.P) { if (E.sel) select(null); else closeEditor(); return true; }
  return false;
};

/* ---------- start ---------- */
window.addEventListener('DOMContentLoaded', () => {
  paintStatic(); wireEditor();
  $('fab').onclick = newProjectSheet; $('hset').onclick = settingsSheet;
  renderHome();
});
