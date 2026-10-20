/* Directional particles for the mechanism illustration. Driven by the same
 * clock as the primitive reveal; these are not measured latency traces. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = { context: '#649bc0', tool: '#a17cc0', primitive: '#76b900' };
  const TIMING = Object.freeze({ tool: 1200, textReveal: 1900, draft: 2200, network: 2800, commit: 3800, end: 4800 });
  const make = (tag, attrs, parent) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    parent.append(node); return node;
  };
  function roundedPath(points, radius = 9) {
    const clean = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > .1);
    let d = `M${clean[0].join(',')}`;
    for (let i = 1; i < clean.length - 1; i++) {
      const a = clean[i - 1], b = clean[i], c = clean[i + 1];
      const before = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const after = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r = Math.min(radius, before / 2, after / 2);
      const p = b.map((v, k) => v + (a[k] - v) * r / before);
      const q = b.map((v, k) => v + (c[k] - v) * r / after);
      d += ` L${p.join(',')} Q${b.join(',')} ${q.join(',')}`;
    }
    return d + ` L${clean.at(-1).join(',')}`;
  }
  class PipelineFlow {
    constructor(root) {
      this.root = root; this.time = 0; this.routes = []; this.dirty = true;
      this.svg = make('svg', { class: 'pipeline-flow', 'aria-hidden': 'true', focusable: 'false' }, root);
      this.observer = new ResizeObserver(() => this.invalidate());
      ['.context-column', '.scene-preview', '.target-node', '.schema-line', '.token-grid', '.drafter-node'].forEach(s => this.observer.observe(root.querySelector(s)));
      this.observer.observe(root);
    }
    invalidate() {
      this.dirty = true;
      if (this.layoutFrame) return;
      this.layoutFrame = requestAnimationFrame(() => { this.layoutFrame = 0; this.render(this.time); });
    }
    rect(selector) {
      const a = this.root.querySelector(selector).getBoundingClientRect(), b = this.root.getBoundingClientRect();
      return { left: a.left - b.left, right: a.right - b.left, top: a.top - b.top, bottom: a.bottom - b.top,
        x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, width: a.width, height: a.height };
    }
    route(name, points, color, start, end, options = {}) {
      if (this.root.dataset.pipelineKind === 'text') {
        if (name === 'tool') return;
        if (name === 'context') [start, end] = [1250, 1500];
        if (name === 'network') [start, end] = [1500, 1700];
        if (name === 'parallel') [start, end] = [1700, TIMING.textReveal];
      }
      const group = make('g', { class: `flow-route flow-${name}`, opacity: 0 }, this.svg);
      const path = make('path', { d: roundedPath(points, options.radius ?? 9), fill: 'none', stroke: color,
        'stroke-width': 1.2, 'stroke-opacity': options.rail === false ? 0 : .24 }, group);
      const particles = [
        make('circle', { r: 1.8, fill: color, opacity: .22 }, group),
        make('circle', { r: 2.4, fill: color, opacity: .45 }, group),
        make('circle', { r: 6.2, fill: color, opacity: .12 }, group),
        make('circle', { r: 3.2, fill: color, stroke: 'white', 'stroke-width': .8 }, group),
      ];
      this.routes.push({ name, group, path, length: path.getTotalLength(), particles, start, end });
    }
    layout() {
      this.dirty = false; this.svg.replaceChildren(); this.routes = [];
      const w = this.root.clientWidth, h = this.root.clientHeight;
      this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const image = this.rect('.scene-preview'), instruction = this.rect('.instruction-card');
      const target = this.rect('.target-node'), schema = this.rect('.schema-line');
      const grid = this.rect('.token-grid'), draft = this.rect('.drafter-node');
      const stacked = getComputedStyle(this.root).display === 'flex';
      if (stacked) {
        const gap = (image.right + target.left) / 2;
        this.route('image', [[image.right,image.y],[gap,image.y],[gap,target.y],[target.left,target.y]], COLORS.context, 120, 1050);
        this.route('instruction', [[instruction.x,instruction.bottom],[target.x,target.top]], COLORS.context, 360, 1050);
        this.route('tool', [[target.x,target.bottom],[target.x,schema.top-10],[schema.x,schema.top-10],[schema.x,schema.top]], COLORS.tool, 1250, 2100);
        this.route('context', [[target.left,target.y],[7,target.y],[7,draft.y],[draft.left,draft.y]], COLORS.context, 2200, 2750);
      } else {
        this.route('image', [[image.left,image.y],[8,image.y],[8,target.top+25],[target.left,target.top+25]], COLORS.context, 120, 1050);
        this.route('instruction', [[instruction.left,instruction.y],[17,instruction.y],[17,target.top+45],[target.left,target.top+45]], COLORS.context, 360, 1050);
        const gap = schema.left - target.right, lane = f => target.right + gap * f;
        this.route('tool', [[target.right,target.top+25],[lane(.28),target.top+25],[lane(.28),schema.y],[schema.left,schema.y]], COLORS.tool, 1250, 2100);
        this.route('context', [[target.right,target.y],[lane(.62),target.y],[lane(.62),draft.y],[draft.left,draft.y]], COLORS.context, 2200, 2750);
      }
      if (this.root.dataset.pipelineKind === 'text') {
        if (stacked) {
          this.route('verify', [[grid.left,grid.y],[6,grid.y],[6,target.y],[target.left,target.y]], COLORS.tool, 2300, 3200);
          this.route('accept', [[target.right,target.y],[w-6,target.y],[w-6,grid.y],[grid.right,grid.y]], COLORS.primitive, 3300, TIMING.commit);
        } else {
          const x = (target.right + grid.left) / 2;
          this.route('verify', [[grid.left,grid.y],[x-5,grid.y],[x-5,target.y],[target.right,target.y]], COLORS.tool, 2300, 3200);
          this.route('accept', [[target.right,target.bottom-12],[x+5,target.bottom-12],[x+5,grid.bottom-8],[grid.left,grid.bottom-8]], COLORS.primitive, 3300, TIMING.commit);
        }
      }
      // A small set of simultaneous signals traverses the existing network.
      for (let row = 0; row < 3; row++) {
        const points = Array.from({ length: 9 }, (_, layer) => [draft.left + layer * draft.width / 8,
          draft.top + (1 + ((row + layer) % 3)) * draft.height / 4]);
        this.route('network', points, COLORS.primitive, TIMING.network, 3350, { rail: false, radius: 0 });
      }
      // Representative output paths arrive together; reveal every token at
      // the shared commit boundary, regardless of the total block length.
      const tokens = [...this.root.querySelectorAll('.token-grid .token')].slice(1);
      const count = Math.min(18, tokens.length), parent = this.root.getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        const token = tokens[Math.round(i * (tokens.length - 1) / Math.max(1, count - 1))].getBoundingClientRect();
        const x = token.left - parent.left + token.width / 2, y = token.top - parent.top + token.height / 2;
        this.route('parallel', [[x,draft.top],[x,y]], COLORS.primitive, 3350, TIMING.commit, { rail: false });
      }
    }
    render(time) {
      this.time = time;
      if (this.dirty) this.layout();
      const text = this.root.dataset.pipelineKind === 'text';
      this.svg.dataset.stage = text ? (time < TIMING.tool ? 'prefill' : time < TIMING.draft ? 'text-draft' : time < TIMING.commit ? 'verification' : 'complete') : (time < TIMING.tool ? 'prefill' : time < TIMING.draft ? 'tool' : time < TIMING.network ? 'context' : time < TIMING.commit ? 'parallel' : 'complete');
      this.root.classList.toggle('flow-verification', text && time >= TIMING.draft && time < TIMING.commit);
      this.root.classList.toggle('flow-routing', time >= TIMING.tool && time < TIMING.commit);
      for (const r of this.routes) {
        const active = time >= r.start && time < r.end;
        r.group.setAttribute('opacity', active ? 1 : 0);
        if (!active) continue;
        const t = (time - r.start) / (r.end - r.start), progress = t * t * (3 - 2 * t);
        r.particles.forEach((dot, i) => {
          const lag = [0.09,0.045,0,0][i];
          const point = r.path.getPointAtLength(Math.max(0, progress - lag) * r.length);
          dot.setAttribute('cx', point.x); dot.setAttribute('cy', point.y);
        });
      }
    }
  }
  PipelineFlow.TIMING = TIMING;
  window.VFlashFlow = PipelineFlow;
})();
