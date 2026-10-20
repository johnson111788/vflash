/* Start warming every video when the page opens. Completed files are reused
 * through local blob URLs, including cases that have not been selected yet. */
(() => {
  'use strict';
  const records = new Map(), queue = [];
  let active = 0, held = false;
  const key = url => new URL(url, document.baseURI).href;
  function pump() {
    while (!held && active < 2 && queue.length) {
      const item = queue.shift(); active++; item.state = 'loading';
      const controller = new AbortController(); item.controller = controller;
      const timer = setTimeout(() => controller.abort(), 20000);
      // Keep background full-file fetches separate from the media element's
      // byte-range cache; a slow tunnel must not lock the foreground request.
      fetch(item.url, { cache: 'no-store', priority: 'low', signal: controller.signal })
        .then(async response => {
          if (response.status !== 200) throw new Error(`Video preload ${response.status}`);
          const blob = await response.blob();
          const length = Number(response.headers.get('Content-Length'));
          if (!blob.size || (length && blob.size !== length)) throw new Error('Incomplete video preload');
          return blob;
        })
        .then(blob => {
          item.bytes = blob.size; item.local = URL.createObjectURL(blob); item.state = 'ready'; item.resolve(item.local);
        })
        .catch(() => {
          if (item.interrupted) { item.interrupted = false; item.state = 'queued'; queue.push(item); }
          else { item.state = 'error'; item.resolve(null); }
        })
        .finally(() => { clearTimeout(timer); item.controller = null; active--; pump(); });
    }
  }
  function load(url, priority = false) {
    const full = key(url);
    let item = records.get(full);
    if (!item) {
      item = { url: full, state: 'queued', local: null, bytes: 0 };
      item.promise = new Promise(resolve => { item.resolve = resolve; });
      records.set(full, item); queue.push(item);
    }
    if (priority && item.state === 'queued') { queue.splice(queue.indexOf(item), 1); queue.unshift(item); }
    pump(); return item.promise;
  }
  window.VFlashVideoCache = {
    load,
    hold() {
      held = true;
      records.forEach(item => {
        if (item.state === 'loading') { item.interrupted = true; item.controller?.abort(); }
      });
    },
    resume() { held = false; pump(); },
    source: url => records.get(key(url))?.local || url,
    status: () => [...records.values()].map(({ url, state, bytes }) => ({ url, state, bytes })),
  };
  const data = window.VFLASH_DATA;
  const firstCases = [...document.querySelectorAll('.media-gallery')].map(e => data.media[e.dataset.initial || data.groups[e.dataset.gallery][0]].video);
  const standalone = [...document.querySelectorAll('video[data-src]')].map(e => e.dataset.src);
  const teaser = document.querySelector('#teaser source')?.getAttribute('src');
  const all = [teaser, ...standalone, ...firstCases, ...Object.values(data.media).map(m => m.video)].filter(Boolean);
  [...new Set(all)].forEach(url => load(url));
})();
