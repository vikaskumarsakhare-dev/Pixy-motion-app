'use strict';
/* ===== Export: render every frame -> native H.264 encoder ===== */
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
    return Promise.all(jobs);
  },
  size(q) { // q = short side in px
    const P = E.P, asp = P.w / P.h; let w, h;
    if (asp >= 1) { h = q; w = Math.round(q * asp); } else { w = q; h = Math.round(q / asp); }
    return [w - (w % 2), h - (h % 2)];
  },
  async run(q, name, prog) {
    const N = window.PixyNative, P = E.P, fps = 30, [W, H] = this.size(q);
    this.cancel = false;
    if (!N || !N.exportStart(W, H, fps, name)) throw new Error('start');
    N.keepAwake(true);
    pauseVideos(); E.playing = false;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), total = Math.max(1, Math.round(P.dur * fps));
    try {
      for (let i = 0; i < total; i++) {
        if (this.cancel) { N.exportCancel(); N.keepAwake(false); return null; }
        const t = i / fps;
        await this.seekVideos(t);
        renderTo(g, W, H, t, {});
        const d = cv.toDataURL('image/jpeg', 0.92);
        if (!N.exportFrame(d.slice(d.indexOf(',') + 1))) throw new Error('frame');
        if (i % 3 === 0) { prog(i / total); await new Promise(r => setTimeout(r, 0)); }
      }
      const out = N.exportFinish(); N.keepAwake(false);
      if (!out) throw new Error('finish');
      return out;
    } catch (e) { try { N.exportCancel(); } catch (x) {} N.keepAwake(false); throw e; }
  }
};
