'use strict';
/* ---------- language ---------- */
const STR = {
  en: {
    app: 'Pixy Motion', newp: 'New project', projects: 'My projects',
    empty: 'No projects yet.\nTap + to start.', settings: 'Settings', lang: 'Language', ver: 'Version',
    r169: 'YouTube 16:9', r916: 'Reels 9:16', r11: 'Square 1:1', r45: 'Post 4:5',
    rename: 'Rename', dup: 'Duplicate', del: 'Delete', cancel: 'Cancel', ok: 'OK', delq: 'Delete this?',
    shape: 'Shape', media: 'Media', audio: 'Audio', element: 'Element', template: 'Template',
    text: 'Text', draw: 'Draw', vector: 'Vector', camera: 'Camera', nul: 'Null', soon: 'Coming soon',
    pad: 'Pad', cam3d: 'Camera', effect: 'Effect', speed: 'Speed', delete: 'Delete', volume: 'Volume',
    group: 'Group', exportT: 'Export video', quality: 'Quality', start: 'Start', exporting: 'Exporting…',
    saved: 'Saved in Movies/PixyMotion', exfail: 'Export failed', cancelled: 'Cancelled',
    projname: 'Project', duration: 'Length (sec)', tiltx: 'Tilt X', tilty: 'Tilt Y',
    attach: 'Attach to', none: 'None', newgroup: 'New group', opacity: 'Opacity', blur: 'Blur',
    glow: 'Glow', shadow: 'Shadow', border: 'Border', fill: 'Colour', size: 'Size', txt: 'Text',
    reset: 'Reset', flipx: 'Flip left-right', flipy: 'Flip up-down', up: 'Move up', down: 'Move down',
    copy: 'Duplicate', curve: 'Speed curve', applyall: 'Apply to all', keyfirst: 'Press ◆ to add a keyframe first',
    vidonly: 'Only for video', mediafail: 'Could not add file', hello: 'Type your text',
    lin: 'Linear', ease: 'Ease', easein: 'Ease in', easeout: 'Ease out', easeio: 'Smooth', back: 'Overshoot', snap: 'Snap',
    rect: 'Box', round: 'Rounded', circle: 'Circle', tri: 'Triangle', star: 'Star', heart: 'Heart', arrow: 'Arrow', line: 'Line',
    sans: 'Sans', serif: 'Serif', mono: 'Mono', hand: 'Hand', bold: 'Bold', pick: 'Choose file',
    layer: 'Layer', camlayer: 'Camera', nulllayer: 'Null', moved: 'Moved', backup: 'Back',
    tools: 'Add', undo: 'Undo', redo: 'Redo', nokey: 'No keyframe here', link: 'Link',
    w: 'W', h: 'H', unlocked: 'Layer is locked'
  },
  hi: {
    app: 'Pixy Motion', newp: 'नया प्रोजेक्ट', projects: 'मेरे प्रोजेक्ट',
    empty: 'अभी कोई प्रोजेक्ट नहीं है।\nशुरू करने के लिए + दबाओ।', settings: 'सेटिंग', lang: 'भाषा', ver: 'वर्शन',
    r169: 'यूट्यूब 16:9', r916: 'रील 9:16', r11: 'चौकोर 1:1', r45: 'पोस्ट 4:5',
    rename: 'नाम बदलो', dup: 'कॉपी बनाओ', del: 'हटाओ', cancel: 'रद्द', ok: 'ठीक है', delq: 'इसे हटाना है?',
    shape: 'आकार', media: 'मीडिया', audio: 'ऑडियो', element: 'एलिमेंट', template: 'टेम्पलेट',
    text: 'टेक्स्ट', draw: 'ड्रॉ', vector: 'वेक्टर', camera: 'कैमरा', nul: 'नल', soon: 'जल्द आएगा',
    pad: 'पैड', cam3d: 'कैमरा', effect: 'इफ़ेक्ट', speed: 'रफ़्तार', delete: 'हटाओ', volume: 'आवाज़',
    group: 'ग्रुप', exportT: 'वीडियो एक्सपोर्ट', quality: 'क्वालिटी', start: 'शुरू', exporting: 'एक्सपोर्ट हो रहा है…',
    saved: 'Movies/PixyMotion में सेव हो गया', exfail: 'एक्सपोर्ट नहीं हो पाया', cancelled: 'रद्द किया',
    projname: 'प्रोजेक्ट', duration: 'लंबाई (सेकंड)', tiltx: 'झुकाव X', tilty: 'झुकाव Y',
    attach: 'जोड़ो', none: 'कोई नहीं', newgroup: 'नया ग्रुप', opacity: 'पारदर्शिता', blur: 'धुंधला',
    glow: 'चमक', shadow: 'छाया', border: 'किनारा', fill: 'रंग', size: 'साइज़', txt: 'टेक्स्ट',
    reset: 'रीसेट', flipx: 'दाएँ-बाएँ पलटो', flipy: 'ऊपर-नीचे पलटो', up: 'ऊपर लाओ', down: 'नीचे करो',
    copy: 'कॉपी बनाओ', curve: 'रफ़्तार का वक्र', applyall: 'सब पर लगाओ', keyfirst: 'पहले ◆ दबाकर कीफ्रेम लगाओ',
    vidonly: 'सिर्फ़ वीडियो के लिए', mediafail: 'फ़ाइल नहीं जुड़ी', hello: 'यहाँ लिखो',
    lin: 'सीधा', ease: 'आसान', easein: 'धीरे शुरू', easeout: 'धीरे अंत', easeio: 'मुलायम', back: 'उछाल', snap: 'झटका',
    rect: 'डिब्बा', round: 'गोल कोना', circle: 'गोला', tri: 'तिकोन', star: 'तारा', heart: 'दिल', arrow: 'तीर', line: 'लकीर',
    sans: 'सादा', serif: 'सेरिफ़', mono: 'मोनो', hand: 'हाथ', bold: 'मोटा', pick: 'फ़ाइल चुनो',
    layer: 'लेयर', camlayer: 'कैमरा', nulllayer: 'नल', moved: 'खिसका', backup: 'पीछे',
    tools: 'जोड़ो', undo: 'पीछे', redo: 'आगे', nokey: 'यहाँ कीफ्रेम नहीं है', link: 'जोड़',
    w: 'चौ', h: 'ऊँ', unlocked: 'लेयर लॉक है'
  }
};
Object.assign(STR.en, {
  layers: 'Layers', cams: 'Camera', cameraOn: 'Camera view', selall: 'Select all layers', copyl: 'Copy layer', paste: 'Paste layer',
  cutf: 'Cut from start', cutm: 'Cut in middle', cutl: 'Cut at end', cutfail: 'Move the line inside the layer', done: 'Done',
  nsel: 'layers selected', prep: 'Preparing video…', badfile: 'This file could not be opened', preview: 'Preview',
  marker: 'Marker added', markerx: 'Marker removed', editm: 'Edit', pasted: 'Pasted', copied: 'Copied', nothing: 'Nothing copied',
  groupm: 'Group', moreT: 'More', playp: 'Play'
});
Object.assign(STR.hi, {
  layers: 'परतें', cams: 'कैमरा', cameraOn: 'कैमरा व्यू', selall: 'सारी परतें चुनो', copyl: 'परत कॉपी करो', paste: 'परत चिपकाओ',
  cutf: 'शुरू से काटो', cutm: 'बीच से काटो', cutl: 'आख़िर से काटो', cutfail: 'लाइन को परत के अंदर लाओ', done: 'हो गया',
  nsel: 'परतें चुनी हैं', prep: 'वीडियो तैयार हो रहा है…', badfile: 'यह फ़ाइल नहीं खुल पाई', preview: 'प्रीव्यू',
  marker: 'निशान लगा', markerx: 'निशान हटा', editm: 'बदलाव', pasted: 'चिपका दिया', copied: 'कॉपी हो गया', nothing: 'कुछ कॉपी नहीं है',
  groupm: 'ग्रुप', moreT: 'और', playp: 'चलाओ'
});
Object.assign(STR.en, {
  camopt: 'Camera Options', camview: 'Camera View', focusb: 'Focus Blur', fog: 'Fog', effects: 'Effects', addfx: 'Add effect',
  vig: 'Vignette', tint: 'Colour tint', skew: 'Skew', simple: 'Simple', advanced: 'Advanced', bounce: 'Bounce', elastic: 'Elastic', steps: 'Steps',
  camon: 'Camera on', camoffm: 'Camera off', camsel: 'Camera selected', resetc: 'Reset curve', nofxs: 'No effects yet', removefx: 'Remove',
  fovl: 'Angle', distl: 'Distance', fdl: 'Focus', dofl: 'Depth', strl: 'Blur', nearl: 'Near', farl: 'Far', colorl: 'Colour', curveT: 'Speed curve'
});
Object.assign(STR.hi, {
  camopt: 'कैमरा विकल्प', camview: 'कैमरा व्यू', focusb: 'फ़ोकस ब्लर', fog: 'धुंध', effects: 'इफ़ेक्ट', addfx: 'इफ़ेक्ट जोड़ो',
  vig: 'किनारे काले', tint: 'रंग की झलक', skew: 'तिरछा', simple: 'सादे', advanced: 'खास', bounce: 'उछाल', elastic: 'लचीला', steps: 'सीढ़ी',
  camon: 'कैमरा चालू', camoffm: 'कैमरा बंद', camsel: 'कैमरा चुना है', resetc: 'वक्र वापस करो', nofxs: 'अभी कोई इफ़ेक्ट नहीं', removefx: 'हटाओ',
  fovl: 'कोण', distl: 'दूरी', fdl: 'फ़ोकस', dofl: 'गहराई', strl: 'धुंधला', nearl: 'पास', farl: 'दूर', colorl: 'रंग', curveT: 'रफ़्तार का वक्र'
});
let LANG = 'en';
try { LANG = localStorage.getItem('pixyLang') || 'en'; } catch (e) {}
function tr(k) { return (STR[LANG] && STR[LANG][k]) || STR.en[k] || k; }
function setLang(l) { LANG = l; try { localStorage.setItem('pixyLang', l); } catch (e) {} }

/* ---------- icons (24x24 stroke) ---------- */
const ICON = {
  back: 'M15 5l-7 7 7 7',
  group: 'M4 4h7v7H4zM13 13h7v7h-7zM11 7.5h2.5a2 2 0 0 1 2 2V13',
  export: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5',
  undo: 'M9 7L4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2',
  redo: 'M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2',
  first: 'M6 5v14M18 5l-9 7 9 7z',
  last: 'M18 5v14M6 5l9 7-9 7z',
  play: 'M7 4.5l13 7.5-13 7.5z',
  pause: 'M8 5v14M16 5v14',
  cam: 'M3 8h12v8H3zM15 11l6-3v8l-6-3',
  camoff: 'M3 8h12v8H3zM15 11l6-3v8l-6-3M3 20L21 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeoff: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM4 20L20 4',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.5-1.8',
  key: 'M12 3l7 9-7 9-7-9z',
  keyplus: 'M12 3l7 9-7 9-7-9zM12 9v6M9 12h6',
  groupc: 'M4 4h7v7H4zM13 13h7v7h-7zM11 7.5h2.5a2 2 0 0 1 2 2V13M7.5 11v2.5a3 3 0 0 0 3 3H13',
  cameraoff: 'M3 7h4l2-2h6l2 2h4v12H3zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM3 21L21 3',
  skew: 'M8 5h13l-5 14H3z',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fogi: 'M5 9h14M3 13h18M6 17h12M8 5h8',
  refresh: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  vignette: 'M3 5h18v14H3zM7 9h10v6H7z',
  prev: 'M14 6l-6 6 6 6',
  next: 'M10 6l6 6-6 6',
  speed: 'M4 17a8 8 0 1 1 16 0M12 17l4-6',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  vol: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  shape: 'M4 20l6-14 6 14zM14 4h6v6h-6z',
  media: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01',
  audio: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  element: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  template: 'M4 4h16v7H4zM4 14h7v6H4zM14 14h6v6h-6z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  draw: 'M4 20c3-1 4-5 7-8s6-5 9-8M4 20l3-1',
  vector: 'M5 19L19 5M5 19a2 2 0 1 0 0 .01M19 5a2 2 0 1 0 0 .01M12 12m-1.5 0a1.5 1.5 0 1 0 3 0',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  curve: 'M3 20C9 20 9 4 21 4',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  depth: 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  scale: 'M4 14v6h6M20 10V4h-6M4 20L10 14M20 4l-6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  nul: 'M12 4v16M4 12h16M7 7h10v10H7z',
  camera: 'M3 7h4l2-2h6l2 2h4v12H3zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  cutf: 'M5 4v16M9 12h11M13 8l-4 4 4 4',
  cutm: 'M12 3v18M3 12h6M15 12h6M6 9l-3 3 3 3M18 9l3 3-3 3',
  cutl: 'M19 4v16M15 12H4M11 8l4 4-4 4',
  layers: 'M8 4h12v12H8zM4 8v12h12v-1',
  edit: 'M4 6h10M4 12h16M4 18h10M17 4l3 2-3 2M17 16l3 2-3 2',
  flag: 'M6 3v18M6 4h11l-2 4 2 4H6',
  selall: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  paste: 'M9 4h6v3H9zM6 5h3M15 5h3M6 5v16h12V5M9 12h6M9 16h6',
  home: 'M4 11l8-7 8 7v9H4z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'
};
function ic(name, size, cls) {
  size = size || 22;
  return '<svg class="ic ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ICON[name] || '') + '"/></svg>';
}

/* ---------- helpers ---------- */
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fmtTime(t, fps) {
  fps = fps || 30; t = Math.max(0, t);
  const f = Math.floor((t % 1) * fps + 1e-6), s = Math.floor(t) % 60, m = Math.floor(t / 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ':' + String(f).padStart(2, '0');
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- IndexedDB ---------- */
let _db = null;
function dbOpen() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open('pixymotion', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
function dbReq(mode, fn) {
  return dbOpen().then(db => new Promise((res, rej) => {
    const st = db.transaction('projects', mode).objectStore('projects');
    const rq = fn(st);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  }));
}
const DB = {
  all: () => dbReq('readonly', s => s.getAll()),
  get: id => dbReq('readonly', s => s.get(id)),
  put: p => dbReq('readwrite', s => s.put(JSON.parse(JSON.stringify(p, (k, v) => (k[0] === '_' ? undefined : v))))),
  del: id => dbReq('readwrite', s => s.delete(id))
};
