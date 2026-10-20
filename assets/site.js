(() => {
  'use strict';
  const D = window.VFLASH_DATA;
  const drivingExamples = window.VFLASH_DRIVING;
  const motionExample = window.VFLASH_MOTION;
  const textExample = window.VFLASH_TEXT;
  const videoCache = window.VFlashVideoCache;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function el(tag, attrs = {}, parent) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    }
    if (parent) parent.append(n);
    return n;
  }
  function svg(tag, attrs, parent) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    parent.append(n); return n;
  }
  const setPressed = (host, key, value) => $$('button', host).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === value)));
  const fmtTime = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

  // Shared navigation, with independent tab groups and keyboard navigation.
  const menu = $('.menu-toggle'), nav = $('#main-nav');
  function closeMenu() { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); });
  $$('a', nav).forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  $$('[role="tablist"]').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    function activate(tab) {
      tabs.forEach(t => {
        const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls')); panel.hidden = !on;
        if (!on) $$('video', panel).forEach(v => v.pause());
      });
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => activate(t));
      t.addEventListener('keydown', e => {
        let next;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { e.preventDefault(); activate(tabs[next]); tabs[next].focus(); }
      });
    });
  });
  let navPending = false;
  function updateNav() {
    navPending = false; let current = null;
    $$('a', nav).forEach(a => { const section = $(a.hash), r = section.getBoundingClientRect(); if (r.top <= innerHeight * .38 && r.bottom > 65) current = a; });
    $$('a', nav).forEach(a => { if (a === current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  addEventListener('scroll', () => { if (!navPending) { navPending = true; requestAnimationFrame(updateNav); } }, { passive: true });
  updateNav();

  // All players share seeking/fullscreen controls. Only visible, muted media
  // may autoplay; galleries advance in order and single videos loop.
  const players = new Map();
  function setVideoSource(v, url) {
    const source = videoCache.source(url);
    if (!source.startsWith('blob:')) videoCache.hold();
    if (v.getAttribute('src') !== source) { v.src = source; v.load(); }
  }
  function warmVideo(v, url, priority = false) {
    videoCache.load(url, priority).then(local => {
      if (local && v.dataset.src === url && !v.getAttribute('src')) {
        v.src = local; v.load();
      }
    });
  }
  function player(v, shell) {
    const bar = el('div', { class: 'video-controls' }, shell);
    const play = el('button', { type: 'button', text: '▶ Play', 'aria-label': 'Play video' }, bar);
    const time = el('span', { class: 'vtime', text: '0:00 / 0:00' }, bar);
    const seek = el('input', { type: 'range', min: 0, max: 1, value: 0, step: .01, 'aria-label': 'Video playback position' }, bar);
    const full = el('button', { type: 'button', class: 'fullscreen', text: '⤢', 'aria-label': 'View video fullscreen' }, bar);
    const state = { pausedByUser: reduced.matches, visible: false, v };
    const start = () => v.play().catch(error => {
      if (error.name !== 'AbortError') { videoCache.resume(); refresh(); }
    });
    v.addEventListener('canplay', () => videoCache.resume());
    v.addEventListener('error', () => {
      videoCache.resume();
      // A rejected cached blob must not leave the case permanently unplayable.
      if (v.getAttribute('src')?.startsWith('blob:') && v.dataset.src) {
        v.src = v.dataset.src; v.load();
        if (!state.pausedByUser && state.visible) start();
      }
    });
    function refresh() {
      const duration = Number.isFinite(v.duration) ? v.duration : 0;
      seek.max = duration || 1; seek.value = v.currentTime || 0;
      seek.setAttribute('aria-valuetext', `${(v.currentTime || 0).toFixed(1)} of ${duration.toFixed(1)} seconds`);
      time.textContent = `${fmtTime(v.currentTime || 0)} / ${fmtTime(duration)}`;
      play.textContent = v.ended ? '↻ Replay' : v.paused ? '▶ Play' : 'Ⅱ Pause';
      play.setAttribute('aria-label', v.ended ? 'Replay video' : v.paused ? 'Play video' : 'Pause video');
    }
    play.addEventListener('click', () => { if (v.paused || v.ended) { state.pausedByUser = false; if (v.ended) v.currentTime = 0; start(); } else { state.pausedByUser = true; v.pause(); } });
    seek.addEventListener('input', () => { if (v.readyState) v.currentTime = Number(seek.value); refresh(); });
    full.addEventListener('click', () => { if (v.requestFullscreen) v.requestFullscreen().catch(() => {}); else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
    ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'emptied'].forEach(type => v.addEventListener(type, refresh));
    v.addEventListener('play', () => players.forEach(p => { if (p.v !== v) p.v.pause(); }));
    v.controls = false; players.set(v, state); refresh();
    if (v.dataset.src) warmVideo(v, v.dataset.src);
    new IntersectionObserver(entries => {
      for (const e of entries) {
        state.visible = e.isIntersecting;
        if (e.isIntersecting) {
          if (v.dataset.src && !v.getAttribute('src')) setVideoSource(v, v.dataset.src);
          if (v.dataset.src) videoCache.load(v.dataset.src, true);
          if (!state.pausedByUser && !v.ended && !document.hidden) start();
        } else v.pause();
      }
    }, { threshold: .35 }).observe(v);
    return state;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) players.forEach(p => p.v.pause()); });
  const teaser = $('#teaser'); player(teaser, $('.hero-video'));
  $$('video[data-standalone]').forEach(v => player(v, v.closest('.video-shell')));
  const chapters = $$('[data-seek]');
  chapters.forEach(b => b.addEventListener('click', () => {
    const jump = () => { teaser.currentTime = Number(b.dataset.seek); players.get(teaser).pausedByUser = false; teaser.play().catch(() => {}); };
    if (teaser.readyState) jump(); else { teaser.addEventListener('loadedmetadata', jump, { once: true }); teaser.load(); }
  }));
  teaser.addEventListener('timeupdate', () => { let active = chapters[0]; chapters.forEach(b => { if (+b.dataset.seek <= teaser.currentTime + .01) active = b; }); chapters.forEach(b => b.setAttribute('aria-pressed', String(b === active))); });

  let suite = 'pro';
  function drawLibero() {
    const row = D.libero[suite], host = $('#libero-chart'); host.replaceChildren();
    ['Baseline', 'VFlash · w/o visual plan', 'VFlash'].forEach((name, i) => {
      const cell = el('div', { class: 'libero-stat' }, host);
      const number = el('strong', { text: row.values[i].toFixed(1) }, cell); el('span', { text: '%' }, number);
      el('p', { text: name }, cell); const track = el('div', { class: 'bar-track', 'aria-hidden': 'true' }, cell);
      el('div', { class: 'bar-fill', style: `width:${row.values[i]}%` }, track);
    });
    const findings = {
      pro: 'On LIBERO-PRO, VFlash improves success by 6.8 percentage points over the baseline using the same PIv3 action-head architecture. The baseline reaches 40.2%, conditioning on the generated sub-task reaches 45.3%, and conditioning on the full visual plan reaches 47.0%. Visual plans add 1.7 percentage points beyond sub-task conditioning on LIBERO-PRO.',
      plus: 'On LIBERO-Plus, VFlash improves success by 1.9 percentage points over the baseline using the same PIv3 action-head architecture. The baseline reaches 60.7%; conditioning on either the generated sub-task or the full visual plan reaches 62.6%.',
      standard: 'On LIBERO, VFlash improves success by 0.8 percentage points using the same PIv3 action-head architecture. The baseline and sub-task conditioning both reach 93.4%, compared with 94.2% for the full visual plan.',
    };
    const emphasis = {
      pro: ['VFlash improves success by 6.8 percentage points over the baseline', 'Visual plans add 1.7 percentage points beyond sub-task conditioning on LIBERO-PRO.'],
      plus: ['VFlash improves success by 1.9 percentage points over the baseline'],
      standard: ['VFlash improves success by 0.8 percentage points'],
    };
    const finding = $('#libero-finding'); finding.replaceChildren();
    let rest = findings[suite];
    for (const phrase of emphasis[suite]) {
      const start = rest.indexOf(phrase);
      if (start < 0) continue;
      finding.append(document.createTextNode(rest.slice(0, start)));
      el('strong', { text: phrase }, finding);
      rest = rest.slice(start + phrase.length);
    }
    finding.append(document.createTextNode(rest));
    setPressed($('#libero-controls'), 'suite', suite);
  }
  $$('#libero-controls button').forEach(b => b.addEventListener('click', () => { suite = b.dataset.suite; drawLibero(); }));
  drawLibero();
  $$('.media-gallery').forEach(host => {
    const group = host.dataset.gallery, ids = D.groups[group];
    const shell = el('div', { class: 'video-shell' }, host);
    const v = el('video', { controls: '', muted: '', playsinline: '', preload: 'auto' }, shell); v.muted = true;
    v.loop = ids.length === 1;
    const state = player(v, shell);
    const picks = el('div', { class: 'case-picker', role: 'group', 'aria-label': `${group} examples` }, host);
    const buttons = ids.map(id => {
      const m = D.media[id], b = el('button', { type: 'button', class: 'case-option', 'data-case-id': id, 'aria-pressed': 'false', 'aria-label': `Show ${m.name}` }, picks);
      el('img', { src: m.thumbnail || m.poster, alt: '', loading: 'lazy', width: 320, height: 180 }, b); el('span', { text: m.name }, b);
      b.addEventListener('click', () => choose(id, true)); return b;
    });
    function choose(id, clicked) {
      const m = D.media[id]; host.dataset.activeCase = id;
      v.pause(); v.poster = m.poster; v.setAttribute('aria-label', `${m.name}: recorded comparison`); v.dataset.src = m.video;
      if (clicked || v.getAttribute('src') || state.visible) setVideoSource(v, m.video);
      warmVideo(v, m.video, clicked);
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.caseId === id)));
      if (clicked) {
        state.pausedByUser = false; v.play().catch(() => {});
      }
      if (group === 'libero') { suite = m.suite; drawLibero(); }
    }
    v.addEventListener('ended', () => {
      if (ids.length < 2) return;
      const next = ids[(ids.indexOf(host.dataset.activeCase) + 1) % ids.length];
      choose(next, state.visible && !state.pausedByUser && !document.hidden);
    });
    choose(host.dataset.initial || ids[0], false);
    if (ids.length === 1) picks.hidden = true;
  });

  let qualitySpace = '3d', qualityVariant = 'joint', qualityMetric = 0;
  const qualityMetricLabels = {
    '3d': ['ADE · cm ↓', 'FDE · cm ↓', 'Within 5 cm · % ↑', 'Within 10 cm · % ↑'],
    '2d': ['DFD ↓', 'HD ↓', 'RMSE ↓'],
  };
  function qualityControls() {
    const host = $('#quality-metric-controls'); host.replaceChildren(); host.dataset.space = qualitySpace;
    qualityMetricLabels[qualitySpace].forEach((label, i) => el('button', { 'data-metric': i, 'aria-pressed': String(i === qualityMetric), text: label }, host));
    $('#quality-training-controls').hidden = qualitySpace === '2d';
  }
  function drawQuality() {
    const is2d = qualitySpace === '2d', metric = qualityMetric;
    const variant = is2d ? D.quality2d : D.quality.variants[qualityVariant];
    const datasets = is2d ? D.quality2d.datasets : D.quality.datasets;
    const scale = is2d ? 1 : 100, lowerIsBetter = is2d || metric < 2;
    setPressed($('#quality-space-controls'), 'space', qualitySpace);
    setPressed($('#quality-variant-controls'), 'variant', qualityVariant);
    setPressed($('#quality-metric-controls'), 'metric', String(metric));
    const host = $('#quality-chart'); host.replaceChildren();
    const values = [...variant.ar, ...variant.vflash].map(x => x[metric] * scale);
    const max = lowerIsBetter ? Math.max(...values) * 1.08 : 100;
    datasets.forEach((name, i) => {
      const a = variant.ar[i][metric] * scale, b = variant.vflash[i][metric] * scale;
      const row = el('div', { class: 'quality-row' }, host), heading = el('div', { class: 'quality-row-heading' }, row);
      el('strong', { text: name }, heading);
      const reduction = (1 - b / a) * 100;
      const delta = lowerIsBetter ? `${is2d ? reduction.toFixed(1) : Math.round(reduction)}% lower` : `+${(b - a).toFixed(1)} points`;
      el('span', { text: delta }, heading);
      [['AR', a], ['VFlash', b]].forEach(([label, value], j) => {
        const bar = el('div', { class: `bar-line${j ? ' ours' : ''}` }, row); el('span', { text: label }, bar);
        const track = el('div', { class: 'bar-track', 'aria-hidden': 'true' }, bar); el('div', { class: 'bar-fill', style: `width:${100 * value / max}%` }, track);
        const number = is2d ? (Math.round(value * 1000 + 1e-9) / 1000).toFixed(3) : value.toFixed(1);
        el('b', { text: number + (lowerIsBetter ? '' : '%') }, bar);
      });
    });
    if (!is2d) {
      const card = host.closest('.chart-card');
      card.style.minHeight = '';
      card.style.minHeight = `${Math.ceil(card.getBoundingClientRect().height)}px`;
    }
  }
  $$('#quality-space-controls button').forEach(b => b.addEventListener('click', () => {
    qualitySpace = b.dataset.space; qualityMetric = 0; qualityControls(); drawQuality();
  }));
  $$('#quality-variant-controls button').forEach(b => b.addEventListener('click', () => { qualityVariant = b.dataset.variant; drawQuality(); }));
  $('#quality-metric-controls').addEventListener('click', e => {
    const b = e.target.closest('button[data-metric]');
    if (b) { qualityMetric = +b.dataset.metric; drawQuality(); }
  });
  qualityControls(); drawQuality();

  function drawDriving(name) {
    setPressed($('#driving-controls'), 'driving', name);
    const waymo = name === 'waymo'; $('#driving-sft').textContent = waymo ? '7.79' : '87.1'; $('#driving-rl').textContent = waymo ? '7.86' : '90.7';
    $('#driving-metric').textContent = waymo ? 'RFS ↑ · Waymo test' : 'PDMS ↑ · NAVSIM test';
  }
  $$('#driving-controls button').forEach(b => b.addEventListener('click', () => drawDriving(b.dataset.driving)));
  drawDriving('navsim');

  let device = 'Thor', latencyTask = 'molmo';
  function drawLatency() {
    const task = D.latency[latencyTask], row = task[device], host = $('#latency-chart'); host.replaceChildren();
    const max = Math.max(...row.total), methods = ['AR', 'DFlash', 'VFlash'];
    const stageNames = ['Preprocess + vision', 'Prefill', 'Decoding', 'Action model'];
    methods.forEach((name, i) => {
      const line = el('div', { class: 'latency-row' }, host), heading = el('div', { class: 'latency-row-heading' }, line);
      el('span', { text: name }, heading); el('strong', { text: `${row.total[i].toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ms` }, heading);
      const stack = el('div', { class: 'stack-track', style: `width:${100 * row.total[i] / max}%`, role: 'img', 'aria-label': `${name}: ${row.total[i]} milliseconds` }, line);
      const vals = [row.fixed[0], row.fixed[1], row.decode[i], row.fixed[2]];
      vals.forEach((value, j) => el('span', { class: ['vision', 'prefill', 'decode', 'action'][j], style: `width:${100 * value / row.total[i]}%`, title: `${stageNames[j]}: ${value.toFixed(1)} ms` }, stack));
    });
    $('#latency-ratio').replaceChildren(document.createTextNode((row.total[0] / row.total[2]).toFixed(1))); el('span', { text: '×' }, $('#latency-ratio'));
    $('#dflash-ratio').textContent = `${(row.total[1] / row.total[2]).toFixed(1)}× vs. DFlash`;
    $('#decoding-delta').textContent = `Decoding: ${row.decode[0].toLocaleString('en-US')} → ${row.decode[2].toLocaleString('en-US')} ms.`;
    setPressed($('#device-controls'), 'device', device);
    setPressed($('#latency-task-controls'), 'task', latencyTask);
  }
  $$('#device-controls button').forEach(b => b.addEventListener('click', () => { device = b.dataset.device; drawLatency(); }));
  $$('#latency-task-controls button').forEach(b => b.addEventListener('click', () => { latencyTask = b.dataset.task; drawLatency(); }));
  drawLatency();
  $$('[data-latency-link]').forEach(link => link.addEventListener('click', () => {
    latencyTask = link.dataset.latencyLink === 'driving' ? $('#driving-controls [aria-pressed="true"]').dataset.driving : 'molmo';
    drawLatency();
  }));
  $('#copy-bibtex').addEventListener('click', async () => {
    const text = $('#bibtex-code').textContent;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      $('#copy-status').textContent = 'Copied.';
    } catch (_) {
      const selection = getSelection(), range = document.createRange();
      range.selectNodeContents($('#bibtex-code')); selection.removeAllRanges(); selection.addRange(range);
      $('#copy-status').textContent = 'BibTeX selected. Press Ctrl+C or ⌘C to copy.';
    }
  });

  // The method explorer is explicitly a conceptual sequence, not a stopwatch
  // or an online benchmark. One start token anchors B-1 predicted positions.
  const explorer = $('#decoder-explorer'), body = $('.pipeline-body'), grid = $('#token-grid'), scene = $('#pipeline-scene');
  // A full-width network behind the centered drafter label. Its SVG stretches
  // with the block-sized card, including the compact bounding-box layout.
  const network = $('.drafter-network');
  const edges = svg('g', { stroke: '#76b900', 'stroke-width': .7, opacity: .23 }, network);
  const nodes = svg('g', { fill: '#76b900', opacity: .42 }, network);
  for (let layer = 0; layer < 9; layer++) {
    for (let row = 0; row < 5; row++) {
      const x = layer * 100, y = row * 25;
      svg('circle', { cx: x, cy: y, r: 1.8 }, nodes);
      if (layer < 8) for (let next = 0; next < 5; next++) {
        svg('line', { x1: x, y1: y, x2: x + 100, y2: next * 25, 'vector-effect': 'non-scaling-stroke' }, edges);
      }
    }
  }
  const model = { primitive: 'robot', layout: 'joint', elapsed: 0, playing: false, sequence: true, stage: 0, last: 0, raf: 0, autoplayed: false, visible: false, resumeOnView: false };
  const flow = new window.VFlashFlow(body), timing = window.VFlashFlow.TIMING;
  let roles = [], tokenNodes = [], lastContentKey = '';
  const draftColumn = $('.draft-column');
  const configurations = {
    robot: { image: 'assets/figures/scene-robot.webp', instruction: 'Plan the gripper’s next motion.', options: [['joint', '10 points · 2D + 3D'], ['3d', '10 points · 3D']] },
    text: { image: 'assets/figures/scene-text.webp', instruction: 'Disinfect the countertop.', options: [['text', '16 positions · verified text']] },
    box: { image: 'assets/figures/scene-box.webp', instruction: 'Locate a car in the scene.', options: [['box', 'One box · 4 coordinates']] },
    motion: { image: 'assets/figures/scene-motion.webp', instruction: 'Predict future positions of query points.', options: [['motion', '8 points · one future frame']] },
    driving: { image: drivingExamples['8'].image, instruction: 'Plan the vehicle’s future trajectory.', options: [['8', '8 waypoints · NAVSIM'], ['20', '20 waypoints · Waymo'], ['64', '64 waypoints · Alpamayo']] },
  };
  function makeRoles() {
    const r = [], add = (label, cls = '', title = label, value = label) => r.push({ label, cls, title, value });
    const marker = x => add(x, 'boundary', x === '▶' ? 'Observed primitive-start token' : 'Primitive delimiter');
    if (model.primitive === 'text') { textExample.tokens.forEach((piece, i) => add(i ? '' : piece.trim(), 'text-token', i ? `Draft token ${i}: ${piece}` : `Accepted anchor: ${piece}`, piece.trim())); }
    else if (model.primitive === 'box') { marker('▶'); ['u₁', 'v₁', 'u₂', 'v₂'].forEach((x, i) => add(x, 'axis-2d', `Box coordinate ${x}`, [0, 634, 174, 999][i])); marker('■'); }
    else if (model.primitive === 'motion') {
      const stamp = motionExample.timestamp.split('.');
      marker('▶'); add('t', '', 'Timestamp integer field', stamp[0]); add('t', '', 'Timestamp fractional field', stamp[1]);
      for (let p = 1; p <= 8; p++) { add(String(p), '', `Query point ${p} index`); ['x', 'y', 'z'].forEach((axis, k) => { const number = motionExample.coordinatesMm[p - 1][k]; add('±', 'axis-3d', `Point ${p}: ${axis} sign`, number < 0 ? '−' : '+'); const digits = String(Math.abs(number)).padStart(5, '·'); for (let j = 1; j <= 5; j++) add('d', 'axis-3d', `Point ${p}: ${axis} digit ${j} (· denotes an unused masked position)`, digits[j - 1]); }); } //19P+3 positions, including anchor/timestamp.
    } else if (model.primitive === 'driving') {
      const example = drivingExamples[model.layout];
      marker('▶');
      example.imageTokens.forEach((value, i) => add(i % 2 ? 'v' : 'u', 'axis-2d', `Waypoint ${Math.floor(i / 2) + 1}: image coordinate`, value));
      marker('■'); marker('▶');
      example.metricTokens.forEach((value, i) => add(i % 2 ? 'y' : 'x', 'axis-3d', `Waypoint ${Math.floor(i / 2) + 1}: ego-frame coordinate token`, value));
      marker('■');
    } else {
      const n = 10;
      marker('▶');
      if (model.layout === 'joint') { for (let p = 1; p <= n; p++) ['u', 'v'].forEach((a, k) => add(a, 'axis-2d', `Waypoint ${p}: image coordinate ${a}`, k ? Math.round(240 + p / n * 450) : Math.round(350 + p / n * 15))); marker('■'); marker('▶'); }
      for (let p = 1; p <= n; p++) ['x', 'y', 'z'].forEach((a, k) => add(a, 'axis-3d', `Waypoint ${p}: metric coordinate ${a}`, [478, Math.round(480 + p / n * 42), Math.round(62 + p / n * 17)][k]));
      marker('■');
    }
    return r;
  }
  function cycleDuration() { return timing.end; }
  const stageStarts = [0, timing.tool, timing.draft];
  function currentStage() { return model.elapsed < timing.tool ? 0 : model.elapsed < timing.draft ? 1 : 2; }
  function updatePlayButton() { $('#pipeline-play').textContent = model.playing && model.sequence ? 'Ⅱ Pause sequence' : '▶ Play sequence'; }
  function stop() { model.playing = false; cancelAnimationFrame(model.raf); model.raf = 0; model.last = 0; body.classList.remove('is-playing'); updatePlayButton(); }
  function geometry(done) {
    scene.replaceChildren();
    const p = model.primitive;
    if (p === 'text') return;
    if (p === 'driving') {
      if (!done) return;
      // The saved image-space atom is already projected onto this exact image.
      // Preserve its points and gaps, without smoothing or joining omissions.
      let segment = [];
      const flush = () => {
        if (segment.length > 1) {
          const points = segment.map(x => x.join(',')).join(' ');
          svg('polyline', { points, fill: 'none', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, scene);
          svg('polyline', { points, fill: 'none', stroke: '#76b900', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, scene);
        }
        segment = [];
      };
      drivingExamples[model.layout].points.forEach(point => { if (point) segment.push(point); else flush(); });
      flush(); return;
    }
    const stroke = pts => {
      if (!pts.length) return;
      const points = pts.map(x => x.join(',')).join(' ');
      if (pts.length > 1) { svg('polyline', { points, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, scene); svg('polyline', { points, fill: 'none', stroke: '#76b900', 'stroke-width': 2.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, scene); }
    };
    if (p === 'box') {
      if (done >= roles.length - 1) { svg('rect', { x: 0, y: 114.12, width: 55.68, height: 65.7, fill: 'none', stroke: 'white', 'stroke-width': 4 }, scene); svg('rect', { x: 0, y: 114.12, width: 55.68, height: 65.7, fill: 'none', stroke: '#76b900', 'stroke-width': 2 }, scene); }
    } else if (p === 'motion') {
      // Show the input queries from the start. One completed future frame
      // contributes one segment for each point, preserving all eight IDs.
      if (done) motionExample.queryPoints.forEach(([x, y], i) => {
        const [px, py] = motionExample.predictedPoints[i];
        const link = svg('g', { class: 'motion-link', 'data-point': i + 1 }, scene);
        svg('line', { x1: x, y1: y, x2: px, y2: py, stroke: 'white', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }, link);
        svg('line', { x1: x, y1: y, x2: px, y2: py, stroke: '#76b900', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }, link);
      });
      motionExample.queryPoints.forEach(([x, y], i) => svg('circle', { class: 'query-point', 'data-point': i + 1, cx: x, cy: y, r: 5, fill: '#76b900', stroke: 'white', 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, scene));
    } else {
      const n = 10;
      const pts = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [110 + 5 * t - 2 * Math.sin(t * 4), 41 + t * 101]; });
      const count = done ? n : 0;
      stroke(pts.slice(0, count));
    }
  }
  function paint() {
    const phase = currentStage();
    body.dataset.playbackMode = model.sequence ? 'sequence' : 'stage';
    const done = model.elapsed >= timing.commit ? roles.length - 1 : 0;
    const complete = done === roles.length - 1;
    const text = model.primitive === 'text', proposed = text && model.elapsed >= timing.textReveal;
    const contentKey = `${model.primitive}/${model.layout}/${phase}/${done}/${proposed}`;
    // Geometry and text change at stage boundaries, while only particles move
    // frame by frame. Every predicted token commits on the same boundary.
    if (contentKey !== lastContentKey) {
      lastContentKey = contentKey;
      body.dataset.phase = phase; body.classList.toggle('is-complete', complete);
      $$('.phase-nav button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.phase === phase)));
      tokenNodes.forEach((n, i) => {
        n.classList.toggle('done', i > 0 && i <= done);
        n.classList.toggle('proposed', text && proposed && !complete && i > 0);
        n.classList.toggle('anchor', i === 0);
        n.textContent = (i > 0 && i <= done) || (text && proposed) ? roles[i].value : i === 0 || phase > 0 ? roles[i].label : text ? '' : '·';
      });
      if (text) {
        $('#text-plan-output').textContent = complete ? textExample.action : textExample.prefix + '…';
        $('#commit-copy').textContent = complete ? 'Matching prefix accepted + target next token' : proposed ? (phase === 1 ? 'Draft ready for target verification' : 'Target verifies the draft before acceptance') : 'Draft 15 candidates from one accepted anchor';
      }
      geometry(done);
    }
    body.classList.toggle('flow-prefill', phase === 0 && model.elapsed > 0);
    body.classList.toggle('flow-tool', phase === 1);
    body.classList.toggle('flow-draft', phase === 2 && !complete);
    body.classList.toggle('flow-commit', model.elapsed >= timing.commit && model.elapsed < timing.commit + 300);
    if (!model.playing) updatePlayButton();
    const descriptions = text ? [
      'Encode the observation and instruction once to build the target context.',
      'One drafter pass proposes 15 text tokens alongside one accepted anchor.',
      'The target verifies the draft in one pass, accepting the longest matching prefix plus its next token before the next block.',
    ] : [
      'Encode the observation and instruction once to build the target context.',
      model.primitive === 'box' ? 'The fixed box type determines six positions: an anchor, four coordinates and an end delimiter.' : 'Resolve the requested length and primitive type. Each coordinate and delimiter now has a fixed position.',
      'Using target features, VFlash predicts the complete primitive in one parallel pass and accepts it as a whole.',
    ];
    if ($('#phase-explanation').textContent !== descriptions[phase]) $('#phase-explanation').textContent = descriptions[phase];
    flow.render(model.elapsed);
  }
  function tick(now) {
    if (!model.playing) return;
    if (model.last) {
      // Give text drafting the same wall-clock duration as the spatial
      // parallel-decoding stage; particles and token reveal share this clock.
      const rate = model.primitive === 'text' && currentStage() === 1
        ? (timing.draft - timing.tool) / (timing.end - timing.draft) : 1;
      const step = Math.min(now - model.last, 100) * rate;
      if (model.sequence) model.elapsed = (model.elapsed + step) % cycleDuration();
      else {
        const start = stageStarts[model.stage], end = stageStarts[model.stage + 1] ?? cycleDuration();
        model.elapsed = start + (model.elapsed - start + step) % (end - start);
      }
    }
    model.last = now; paint();
    model.raf = requestAnimationFrame(tick);
  }
  function startClock() {
    model.resumeOnView = false;
    if (model.playing) return;
    model.playing = true; model.last = 0; body.classList.add('is-playing'); updatePlayButton(); model.raf = requestAnimationFrame(tick);
  }
  function selectStage(stage) {
    model.resumeOnView = false; stop(); model.sequence = false; model.stage = stage;
    model.elapsed = stageStarts[stage]; lastContentKey = ''; paint(); startClock();
  }
  function playPipeline() {
    if (model.playing && model.sequence) { selectStage(currentStage()); return; }
    stop(); model.sequence = true; model.stage = 0; model.elapsed = 0;
    lastContentKey = ''; paint(); startClock();
  }
  function configure(updateOptions = false) {
    const continuePlaying = model.playing;
    stop(); const c = configurations[model.primitive];
    if (updateOptions) {
      const controls = $('#layout-controls'); controls.replaceChildren();
      c.options.forEach(([value, label]) => el('button', { type: 'button', 'data-layout': value, 'aria-pressed': 'false', text: label }, controls));
      model.layout = c.options[0][0];
    }
    setPressed($('#layout-controls'), 'layout', model.layout);
    const text = model.primitive === 'text';
    body.dataset.pipelineKind = model.primitive;
    $$('.phase-label').forEach((label, i) => { label.textContent = text ? ['Text draft', 'Target verification'][i] : ['Tool call', 'VFlash'][i]; });
    $('#draft-subtitle').textContent = text ? 'Parallel text drafting · verified' : 'One parallel drafter pass';
    $('#commit-copy').textContent = 'A complete primitive, accepted together';
    $('.text-plan-preview').hidden = !text;
    $('.scene-preview').classList.toggle('is-text', text);
    const driving = model.primitive === 'driving', example = driving ? drivingExamples[model.layout] : null;
    const motion = model.primitive === 'motion', waymo = driving && model.layout === '20';
    $('.scene-preview').classList.toggle('is-driving', driving);
    $('.scene-preview').classList.toggle('is-waymo', waymo);
    const size = example ? example.imageSize : motion ? motionExample.imageSize : text ? textExample.imageSize : [320, 180];
    scene.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`);
    scene.setAttribute('preserveAspectRatio', waymo ? 'xMidYMax slice' : motion ? 'xMidYMid slice' : 'xMidYMid meet');
    $('#pipeline-image').hidden = false; $('#pipeline-image').src = example ? example.image : c.image;
    $('#pipeline-image').alt = driving ? `${example.dataset} front-camera observation` : model.primitive === 'box' ? 'Observed street scene' : model.primitive === 'motion' ? 'Observed moving vehicle' : 'Observed robot scene';
    $('#pipeline-instruction').textContent = c.instruction;
    $('#schema-kind').textContent = text ? 'TEXT DRAFT BLOCK' : 'REQUESTED LAYOUT';
    $('#schema-readout').textContent = c.options.find(x => x[0] === model.layout)[1];
    roles = makeRoles(); grid.replaceChildren(); grid.classList.toggle('is-dense', roles.length > 100); grid.classList.toggle('is-text', text);
    draftColumn.dataset.blockLength = roles.length;
    tokenNodes = roles.map(r => el('span', { class: 'token ' + r.cls, title: r.title, text: r.label, 'aria-hidden': 'true' }, grid));
    grid.setAttribute('aria-label', `${roles.length} positions with one observed start token and ${roles.length - 1} positions to predict.`);
    $('#position-count').textContent = `${roles.length} positions`;
    setPressed($('#primitive-controls'), 'primitive', model.primitive);
    model.stage = 0; model.elapsed = 0; lastContentKey = ''; flow.invalidate(); paint();
    if (continuePlaying) startClock();
  }
  $$('#primitive-controls button').forEach(b => b.addEventListener('click', () => { model.primitive = b.dataset.primitive; configure(true); }));
  $('#layout-controls').addEventListener('click', e => {
    const button = e.target.closest('button[data-layout]');
    if (button) { model.layout = button.dataset.layout; configure(); }
  });
  $('#pipeline-play').addEventListener('click', playPipeline);
  $('.phase-nav').addEventListener('click', e => { const b = e.target.closest('[data-phase]'); if (b) selectStage(+b.dataset.phase); });
  $('#pipeline-next').addEventListener('click', () => selectStage((currentStage() + 1) % 3));
  new IntersectionObserver(entries => {
    for (const e of entries) {
      model.visible = e.intersectionRatio >= .3;
      if (model.visible && !document.hidden) {
        if (!model.autoplayed && !reduced.matches) { model.autoplayed = true; startClock(); }
        else if (model.resumeOnView && !model.playing) startClock();
      }
      if (!model.visible && model.playing) { model.resumeOnView = true; stop(); }
    }
  }, { threshold: .3 }).observe(explorer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && model.playing) { model.resumeOnView = true; stop(); }
    else if (!document.hidden && model.visible && model.resumeOnView && !model.playing) startClock();
  });
  configure(true);

})();
