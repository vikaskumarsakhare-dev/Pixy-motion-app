'use strict';
/* ===== Export: fast path = phone's hardware H.264 encoder (WebCodecs); fallback = JPEG frames -> native encoder ===== */
function u8b64(u8) {
  let s = ''; const C = 0x8000;
  for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C));
  return btoa(s);
}
// length-prefixed (AVC) -> Annex B, prepend SPS/PPS taken from avcC description
function avcToAnnexB(buf, desc, key) {
  const out = []; const SC = [0, 0, 0, 1];
  let lenSize = 4;
  if (desc) {
    const d = new Uint8Array(desc.buffer ? desc.buffer.slice(desc.byteOffset, desc.byteOffset + desc.byteLength) : desc);
    lenSize = (d[4] & 3) + 1;
    if (key) {
      let p = 5, n = d[p++] & 31;
      for (let i = 0; i < n; i++) { const l = (d[p] << 8) | d[p + 1]; p += 2; out.push(...SC, ...d.subarray(p, p + l)); p += l; }
      n = d[p++];
      for (let i = 0; i < n; i++) { const l = (d[p] << 8) | d[p + 1]; p += 2; out.push(...SC, ...d.subarray(p, p + l)); p += l; }
    }
  }
  let p = 0;
  while (p + lenSize <= buf.length) {
    let l = 0; for (let i = 0; i < lenSize; i++) l = (l * 256) + buf[p + i];
    p += lenSize; out.push(...SC); for (let i = 0; i < l; i++) out.push(buf[p + i]); p += l;
  }
  return new Uint8Array(out);
}

const Exp = {
  cancel: false,
  seekVideos(t) {
    const jobs = [];
    E.P.objects.forEach(o => {
      if (o.type !== 'video' || !visibleAt(o, t)) return;
      const v = vidOf(o), want = Math.min(vidTime(o, t), (v.duration || 1e9) - 0.01);
      if (v.readyState < 1) return;
      if (Math.abs(v.currentTime - want) < 0.001 && v.readyState >= 2) return;
      jobs.push(new Promise(res => {
        const done = () => { v.removeEventListener('seeked', done); res(); };
        v.addEventListener('seeked', done); v.currentTime = want; setTimeout(done, 1500);
      }));
    });
    return jobs.length ? Promise.all(jobs) : Promise.resolve();
  },
  prepVideos() {
    const jobs = [];
    E.P.objects.forEach(o => {
      if (o.type !== 'video') return;
      const v = vidOf(o); if (v.readyState >= 2) return;
      jobs.push(new Promise(res => { const d = () => { v.removeEventListener('loadeddata', d); res(); }; v.addEventListener('loadeddata', d); setTimeout(d, 4000); }));
    });
    return Promise.all(jobs);
  },
  // Mix every sound (audio layers + the sound of videos) into one stereo track and hand it to the native AAC encoder.
  async prepAudio(prog) {
    const N = window.PixyNative, P = E.P;
    if (!N || !N.audioStart) return false;
    try { N.audioClear(); } catch (e) {}
    const src = P.objects.filter(o => (o.type === 'audio' || (o.type === 'video' && !o.mute)) && o.vis !== false && !o.mute && o.t0 < P.dur);
    if (!src.length) return false;
    const SR = 44100, total = Math.ceil(P.dur * SR), Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx(2, total, SR); let used = 0;
    for (let i = 0; i < src.length; i++) {
      const o = src[i]; if (this.cancel) return false;
      try {
        const buf = await (await fetch(mediaURL(o.file))).arrayBuffer();
        const ab = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); });
        const s = ctx.createBufferSource(); s.buffer = ab; const sp = clamp(o.speed || 1, 0.25, 4); s.playbackRate.value = sp;
        const g = ctx.createGain(), t0 = o.t0, t1 = Math.min(endOf(o), P.dur), len = t1 - t0, vol = o.type === 'audio' && o.vol != null ? o.vol : 1;
        const fi = Math.min(o.fin || 0, len / 2), fo = Math.min(o.fout || 0, len / 2);
        g.gain.setValueAtTime(fi > 0 ? 0 : vol, t0); if (fi > 0) g.gain.linearRampToValueAtTime(vol, t0 + fi);
        if (fo > 0) { g.gain.setValueAtTime(vol, t1 - fo); g.gain.linearRampToValueAtTime(0, t1); }
        s.connect(g); g.connect(ctx.destination); s.start(t0, Math.min(o.vo || 0, Math.max(0, ab.duration - 0.01))); s.stop(t1); used++;
      } catch (e) { /* this file has no sound or cannot be read: skip it */ }
      prog && prog((i + 1) / src.length * 0.5);
    }
    if (!used) return false;
    const out = await ctx.startRendering(), L = out.getChannelData(0), R = out.numberOfChannels > 1 ? out.getChannelData(1) : L;
    if (!N.audioStart(SR, 2)) return false;
    const CH = 16384, pcm = new Int16Array(CH * 2);
    for (let p = 0; p < total; p += CH) {
      if (this.cancel) { N.audioClear(); return false; }
      const n = Math.min(CH, total - p);
      for (let k = 0; k < n; k++) { pcm[2 * k] = Math.max(-1, Math.min(1, L[p + k])) * 32767; pcm[2 * k + 1] = Math.max(-1, Math.min(1, R[p + k])) * 32767; }
      if (!N.audioChunk(u8b64(new Uint8Array(pcm.buffer, 0, n * 4)))) { N.audioClear(); return false; }
      if ((p / CH) % 8 === 0) { prog && prog(0.5 + 0.5 * p / total); await new Promise(r => setTimeout(r, 0)); }
    }
    const ok = N.audioFinish(); if (!ok) N.audioClear();
    return !!ok;
  },
  size(q) {
    const P = E.P, asp = P.w / P.h; let w, h;
    if (asp >= 1) { h = q; w = Math.round(q * asp); } else { w = q; h = Math.round(q / asp); }
    return [w - (w % 2), h - (h % 2)];
  },
  // Fast path. Returns the saved path, null if cancelled, or throws 'nofast' when this phone cannot do it.
  async runFast(q, name, prog) {
    const N = window.PixyNative, P = E.P, fps = P.fps || 30, [W, H] = this.size(q);
    if (!window.VideoEncoder || !window.VideoFrame || !N.exportStartRaw) throw new Error('nofast');
    await this.prepVideos();
    const cfg = { codec: 'avc1.42002a', width: W, height: H, bitrate: Math.round(Math.min(W * H * fps * 0.12, 16e6)), framerate: fps, hardwareAcceleration: 'prefer-hardware', avc: { format: 'annexb' } };
    let sup; try { sup = await VideoEncoder.isConfigSupported(cfg); } catch (e) { throw new Error('nofast'); }
    if (!sup || !sup.supported) throw new Error('nofast');
    if (!N.exportStartRaw(W, H, fps, name)) throw new Error('nofast');
    let err = null, sent = 0;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          const buf = new Uint8Array(chunk.byteLength); chunk.copyTo(buf);
          const desc = meta && meta.decoderConfig && meta.decoderConfig.description;
          const key = chunk.type === 'key', data = desc ? avcToAnnexB(buf, desc, key) : buf;
          if (!N.exportChunk(u8b64(data), key, Math.round(chunk.timestamp))) err = new Error('chunk'); else sent++;
        } catch (e) { err = e; }
      },
      error: e => { err = e; }
    });
    try {
      enc.configure(cfg);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), total = Math.max(1, Math.round(P.dur * fps));
      N.keepAwake(true); pauseVideos(); E.playing = false;
      for (let i = 0; i < total; i++) {
        if (this.cancel) { try { enc.close(); } catch (e) {} N.exportCancel(); N.keepAwake(false); return null; }
        if (err) throw err;
        const t = i / fps;
        await this.seekVideos(t);
        renderTo(g, W, H, t, {});
        const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps) });
        enc.encode(vf, { keyFrame: i % 30 === 0 }); vf.close();
        while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 2));
        if (i % 4 === 0) { prog(i / total); await new Promise(r => setTimeout(r, 0)); }
      }
      await enc.flush(); enc.close();
      if (err || sent === 0) throw err || new Error('empty');
      const out = N.exportFinishRaw(); N.keepAwake(false);
      if (!out) throw new Error('finish');
      return out;
    } catch (e) {
      try { enc.close(); } catch (x) {}
      try { N.exportCancel(); } catch (x) {}
      N.keepAwake(false);
      throw new Error('nofast');
    }
  },
  // Safe path: every frame as JPEG -> native encoder
  async runSlow(q, name, prog) {
    const N = window.PixyNative, P = E.P, fps = P.fps || 30, [W, H] = this.size(q);
    await this.prepVideos();
    if (!N || !N.exportStart(W, H, fps, name)) throw new Error('start');
    N.keepAwake(true); pauseVideos(); E.playing = false;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), total = Math.max(1, Math.round(P.dur * fps));
    try {
      for (let i = 0; i < total; i++) {
        if (this.cancel) { N.exportCancel(); N.keepAwake(false); return null; }
        const t = i / fps;
        await this.seekVideos(t);
        renderTo(g, W, H, t, {});
        const d = cv.toDataURL('image/jpeg', 0.88);
        if (!N.exportFrame(d.slice(d.indexOf(',') + 1))) throw new Error('frame');
        if (i % 4 === 0) { prog(i / total); await new Promise(r => setTimeout(r, 0)); }
      }
      const out = N.exportFinish(); N.keepAwake(false);
      if (!out) throw new Error('finish');
      return out;
    } catch (e) { try { N.exportCancel(); } catch (x) {} N.keepAwake(false); throw e; }
  },
  async run(q, name, prog) {
    this.cancel = false;
    const em = document.getElementById('exmsg'), eb = document.getElementById('exbar');
    try { if (em) em.textContent = tr('audmix') + '…'; await this.prepAudio(p => { if (eb) eb.style.width = Math.round(p * 100) + '%'; }); } catch (e) { try { window.PixyNative.audioClear(); } catch (x) {} }
    if (this.cancel) { try { window.PixyNative.audioClear(); } catch (x) {} return null; }
    try { return await this.runFast(q, name, prog); }
    catch (e) { if (this.cancel) return null; if (e.message !== 'nofast') throw e; }
    return this.runSlow(q, name, prog);
  }
};
