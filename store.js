/* Pixy Motion - storage (IndexedDB), language, small helpers */
(function () {
  var DBN = 'pixymotion', DBV = 1, _db = null;

  function open() {
    return new Promise(function (res, rej) {
      if (_db) return res(_db);
      var r = indexedDB.open(DBN, DBV);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
      };
      r.onsuccess = function () { _db = r.result; res(_db); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function run(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode);
        var req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  window.DB = {
    get: function (s, id) { return run(s, 'readonly', function (o) { return o.get(id); }); },
    all: function (s) { return run(s, 'readonly', function (o) { return o.getAll(); }); },
    put: function (s, v) { return run(s, 'readwrite', function (o) { return o.put(v); }); },
    del: function (s, id) { return run(s, 'readwrite', function (o) { return o.delete(id); }); }
  };

  window.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  /* ---------- language ---------- */
  var STR = {
    en: {
      appName: 'Pixy Motion', projects: 'Your projects', newProject: 'New project',
      emptyTitle: 'Start your first project', emptyBody: 'Pick a size, add photos and text, and move them with your fingers.',
      chooseSize: 'Choose a size', vertical: 'Vertical (Shorts)', horizontal: 'Horizontal (YouTube)', square: 'Square',
      photo: 'Photo', text: 'Text', shape: 'Shape', background: 'Background', layers: 'Layers',
      edit: 'Edit', style: 'Style', duplicate: 'Duplicate', flip: 'Flip', forward: 'Forward', backward: 'Backward', del: 'Delete',
      rename: 'Rename', ok: 'OK', cancel: 'Cancel', settings: 'Settings', language: 'Language',
      size: 'Size', color: 'Color', bold: 'Bold', font: 'Font', opacity: 'Opacity', custom: 'Custom color',
      circle: 'Circle', rect: 'Box', round: 'Round box', tri: 'Triangle', line: 'Line',
      sans: 'Simple', serif: 'Classic', mono: 'Code', hand: 'Hand',
      yourText: 'Your text', typeHere: 'Type your text here', projectName: 'Project name',
      confirmDelete: 'Delete this project? This cannot be undone.', delProject: 'Delete project',
      noLayers: 'Nothing added yet.', exitHint: 'Press back again to exit', saved: 'Saved',
      projectWord: 'Project', storeNote: 'Projects are saved on this phone. Updating the app keeps them. Uninstalling the app deletes them.',
      version: 'Version', photoFail: 'Could not open this photo', hide: 'Hide', show: 'Show',
      imageLayer: 'Photo', textLayer: 'Text', shapeLayer: 'Shape', tapHint: 'Tap an item to edit it',
      move: 'Move', speed: 'Speed', addStop: 'Add stop', removeStop: 'Remove stop', stopMove: 'Stop moving',
      duration: 'Video length', secShort: 'sec', moveHint: 'Now drag it to where it should go',
      minStops: 'At least two stops are needed', e_smooth: 'Smooth', e_in: 'Slow start', e_out: 'Quick start', e_back: 'Bounce', e_linear: 'Even',
      speedHint: 'How the item moves between stops',
      exportTitle: 'Export video', q720: 'Standard 720p', q1080: 'HD 1080p', startExport: 'Start export',
      exporting: 'Making your video…', keepOpen: 'Keep the app open and the screen on until it finishes.',
      saving: 'Saving…', savedTo: 'Saved to your gallery:', exportDone: 'Video saved', exportFail: 'Export failed',
      onlyApp: 'Export works only in the installed app', exportCancelled: 'Export cancelled'
    },
    hi: {
      appName: 'Pixy Motion', projects: 'आपके प्रोजेक्ट', newProject: 'नया प्रोजेक्ट',
      emptyTitle: 'अपना पहला प्रोजेक्ट बनाओ', emptyBody: 'आकार चुनो, फ़ोटो और टेक्स्ट जोड़ो, और उँगली से हिलाओ।',
      chooseSize: 'आकार चुनो', vertical: 'खड़ा (शॉर्ट्स)', horizontal: 'लेटा (यूट्यूब)', square: 'चौकोर',
      photo: 'फ़ोटो', text: 'टेक्स्ट', shape: 'आकृति', background: 'पीछे का रंग', layers: 'परतें',
      edit: 'बदलो', style: 'रूप', duplicate: 'नक़ल', flip: 'उलटो', forward: 'आगे', backward: 'पीछे', del: 'हटाओ',
      rename: 'नाम बदलो', ok: 'ठीक है', cancel: 'रद्द', settings: 'सेटिंग', language: 'भाषा',
      size: 'आकार', color: 'रंग', bold: 'मोटा', font: 'फ़ॉन्ट', opacity: 'धुँधलापन', custom: 'अपना रंग',
      circle: 'गोला', rect: 'डिब्बा', round: 'गोल डिब्बा', tri: 'तिकोन', line: 'रेखा',
      sans: 'सादा', serif: 'पुराना', mono: 'कोड', hand: 'हाथ का',
      yourText: 'आपका टेक्स्ट', typeHere: 'यहाँ टेक्स्ट लिखो', projectName: 'प्रोजेक्ट का नाम',
      confirmDelete: 'यह प्रोजेक्ट हटाना है? यह वापस नहीं आएगा।', delProject: 'प्रोजेक्ट हटाओ',
      noLayers: 'अभी कुछ जोड़ा नहीं है।', exitHint: 'बाहर जाने के लिए फिर से पीछे दबाओ', saved: 'सेव हो गया',
      projectWord: 'प्रोजेक्ट', storeNote: 'प्रोजेक्ट इसी फ़ोन में सेव रहते हैं। ऐप अपडेट करने पर वे बने रहेंगे, पर ऐप हटाने पर मिट जाएँगे।',
      version: 'वर्ज़न', photoFail: 'यह फ़ोटो नहीं खुल पाई', hide: 'छिपाओ', show: 'दिखाओ',
      imageLayer: 'फ़ोटो', textLayer: 'टेक्स्ट', shapeLayer: 'आकृति', tapHint: 'बदलने के लिए किसी चीज़ पर टैप करो',
      move: 'चलाओ', speed: 'रफ़्तार', addStop: 'पड़ाव जोड़ो', removeStop: 'पड़ाव हटाओ', stopMove: 'रोको',
      duration: 'वीडियो की लंबाई', secShort: 'सेकंड', moveHint: 'अब चीज़ को वहाँ ले जाओ जहाँ पहुँचानी है',
      minStops: 'कम से कम दो पड़ाव चाहिए', e_smooth: 'सहज', e_in: 'धीरे शुरू', e_out: 'झटके से', e_back: 'उछलकर', e_linear: 'सीधी',
      speedHint: 'पड़ावों के बीच चीज़ कैसे चलेगी',
      exportTitle: 'वीडियो निकालो', q720: 'सामान्य 720p', q1080: 'एचडी 1080p', startExport: 'शुरू करो',
      exporting: 'आपका वीडियो बन रहा है…', keepOpen: 'जब तक पूरा न हो, ऐप खुला रखो और स्क्रीन चालू रहने दो।',
      saving: 'सेव हो रहा है…', savedTo: 'गैलरी में सेव हो गया:', exportDone: 'वीडियो सेव हो गया', exportFail: 'वीडियो नहीं बन पाया',
      onlyApp: 'एक्सपोर्ट सिर्फ़ इंस्टॉल किए हुए ऐप में चलता है', exportCancelled: 'एक्सपोर्ट रोक दिया'
    }
  };

  var lang = 'en';
  try { lang = localStorage.getItem('pixy_lang') || 'en'; } catch (e) {}
  if (!STR[lang]) lang = 'en';

  window.T = function (k) { return (STR[lang] && STR[lang][k]) || STR.en[k] || k; };
  window.getLang = function () { return lang; };
  window.setLang = function (l) {
    lang = l;
    try { localStorage.setItem('pixy_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    window.applyI18n();
  };
  window.applyI18n = function () {
    var els = document.querySelectorAll('[data-i]');
    for (var i = 0; i < els.length; i++) els[i].textContent = window.T(els[i].getAttribute('data-i'));
  };

  /* ---------- icons ---------- */
  var IC = {
    plus: 'M12 5v14M5 12h14', back: 'M15 18l-6-6 6-6', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
    text: 'M5 6V4h14v2M12 4v16M9 20h6',
    shape: 'M4 13h7v7H4zM17.5 4a4 4 0 110 8 4 4 0 010-8z',
    palette: 'M12 3a9 9 0 100 18c1.6 0 2-1.1 1.4-2.1s-.2-1.9 1.1-1.9H17a4 4 0 004-4c0-5-4-10-9-10zM7.5 12h.01M9 8h.01M13.5 7.5h.01',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    up: 'M12 19V5M5 12l7-7 7 7', down: 'M12 5v14M5 12l7 7 7-7',
    gear: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
    eyeoff: 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.5 0 2.8-.4 4-1',
    flip: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    check: 'M5 12l5 5 9-10', dots: 'M12 5h.01M12 12h.01M12 19h.01',
    sliders: 'M4 6h16M4 12h16M4 18h16', x: 'M6 6l12 12M18 6L6 18',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14', play: 'M7 4l13 8-13 8z', pause: 'M8 5v14M16 5v14', minus: 'M5 12h14', route: 'M5 19a2 2 0 100-.01M19 5a2 2 0 100-.01M7 18c8 0 2-12 10-12'
  };
  window.ICON = function (n, size) {
    size = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (IC[n] || '') + '"/></svg>';
  };
})();
