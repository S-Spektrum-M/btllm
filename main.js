/* Token-Level Backtracking. Plain JavaScript, no dependencies. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const onView = (el, fn, threshold = 0.35) => {
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { fn(); io.disconnect(); }
    }, { threshold });
    io.observe(el);
  };

  // Keyboard arrow navigation for role="tablist" groups
  function bindTabKeys(container, onSelect) {
    const getBtns = () => $$('button', container);
    container.addEventListener('keydown', (e) => {
      const list = getBtns();
      const cur = list.indexOf(document.activeElement);
      if (cur < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (cur + 1) % list.length;
      else if (e.key === 'ArrowLeft') next = (cur - 1 + list.length) % list.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next >= 0) {
        e.preventDefault();
        list[next].focus();
        onSelect(list[next], next);
      }
    });
  }

  /* =========================================================
     Hero: standard AR, then full MCTS, then backtracking
     ========================================================= */
  (() => {
    const tree = $('#heroTree'), cap = $('#heroCap'), btns = $$('#heroTabs button');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const EASE = 'cubic-bezier(.45,0,.25,1)';
    let idx = 0, timers = [], anims = [];

    const later = (fn, t) => timers.push(setTimeout(fn, still ? 0 : t));
    // fill 'both' shows the first keyframe while waiting; use 'forwards' for any
    // second animation on the same property so it does not override the first.
    const anim = (el, kf, t, d, fill = 'both', easing = EASE) => {
      anims.push(el.animate(kf, { delay: still ? 0 : t, duration: still ? 1 : d, fill, easing }));
      return el;
    };
    const fadeIn = (el, t, d = 350) => anim(el, [{ opacity: 0 }, { opacity: 1 }], t, d);
    const fadeTo = (el, t, d, from, to) => anim(el, [{ opacity: from }, { opacity: to }], t, d, 'forwards');
    const draw = (el, t, d, easing = EASE) => {
      el.setAttribute('pathLength', 1);
      el.style.strokeDasharray = '1 2';
      return anim(el, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], t, d, 'both', easing);
    };
    const P = (d, cls, g) => svg('path', { d, class: cls }, g);
    const dot = (x, y, r, cls, g) => svg('circle', { cx: x, cy: y, r, class: cls }, g);
    const txt = (x, y, s, cls, g, anchor = 'middle') => {
      const t = svg('text', { x, y, class: cls, 'text-anchor': anchor }, g);
      t.textContent = s;
      return t;
    };
    const cross = (x, y, s, cls, g) => P(`M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s}`, cls, g);
    const curve = ([x1, y1], [x2, y2]) => { const m = (x1 + x2) / 2; return ` C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`; };

    // Shared opening: the sound prefix up to the token "196".
    function prefix(g) {
      draw(P('M40 176 L330 176', 's-ink', g), 0, 1000);
      [40, 112, 185, 258].forEach((x, i) => fadeIn(dot(x, 176, 3, 'f-ink', g), i * 220, 250));
    }

    /* 1. Standard autoregressive decoding: one pass, no way back. */
    function sceneAR(g) {
      prefix(g);
      const cont = P('M330 176 C 430 176, 470 112, 590 110 S 820 98, 950 96', 's-ink', g);
      draw(cont, 1000, 3600, 'linear');
      const at = (x) => 1000 + ((x - 330) / 620) * 3600;
      const nodes = [[330, 176], [445, 138], [590, 110], [710, 103], [830, 99]].map(([x, y]) => fadeIn(dot(x, y, 3, 'f-ink', g), at(x), 250));
      const n196 = fadeIn(txt(330, 212, '196', 't-num', g), 1000);
      fadeIn(txt(650, 80, '“Wait,”', 't-mute t-trigger', g), at(650));
      // Only at the end does it become visible that the whole branch was wrong.
      const T = 5000;
      anim(cont, [{ stroke: '#1e1c19' }, { stroke: '#a5321f' }], T, 700, 'forwards');
      nodes.forEach((n) => anim(n, [{ fill: '#1e1c19' }, { fill: '#a5321f' }], T, 700, 'forwards'));
      anim(n196, [{ fill: '#4b473f' }, { fill: '#a5321f' }], T, 700, 'forwards');
      fadeIn(cross(960, 96, 7, 's-red', g), T + 100);
      fadeIn(txt(960, 134, '34', 't-num t-red', g), T + 300);
    }

    /* 2. Full MCTS: expand, roll out to the end, repeat. */
    const N = {
      R: [40, 150], A: [190, 70], B: [190, 150], C: [190, 228],
      A1: [340, 38], A2: [340, 98], B1: [340, 132], B2: [340, 178], C1: [340, 214], C2: [340, 252],
      A2a: [490, 82], B1a: [490, 112], B1b: [490, 158], B1a1: [640, 104],
    };
    const ITER = [['R', 'A', 0], ['R', 'B', 0], ['R', 'C', 0], ['A', 'A1', 0], ['B', 'B1', 1], ['B', 'B2', 0], ['C', 'C1', 0],
      ['B1', 'B1a', 1], ['A', 'A2', 0], ['B1', 'B1b', 0], ['A2', 'A2a', 0], ['B1a', 'B1a1', 1], ['C', 'C2', 0]];
    const MISS = [30, 250, 60, 210, 140, 20, 240, 175, 45, 225, 120, 195, 70];
    function sceneMCTS(g) {
      const roll = svg('g', {}, g), body = svg('g', {}, g);
      fadeIn(dot(...N.R, 3, 'f-ink', body), 0, 300);
      const counter = txt(40, 24, '', 't-count', g, 'start');
      const step = 470;
      ITER.forEach(([p, c, ok], i) => {
        const t = 250 + i * step;
        draw(P(`M${N[p][0]} ${N[p][1]}` + curve(N[p], N[c]), 's-ink thin', body), t, 220);
        fadeIn(dot(...N[c], 2.6, 'f-ink', body), t + 200, 150);
        const end = [960, ok ? 96 : MISS[i]];
        const r = P(`M${N[c][0]} ${N[c][1]}` + curve(N[c], end), ok ? 's-blue thin' : 's-mute thin', roll);
        draw(r, t + 220, 320, 'linear');
        fadeTo(r, t + 900, 500, 1, 0.25);
        const m = ok ? dot(...end, 2.6, 'f-blue', roll) : cross(...end, 3.5, 's-red thin', roll);
        fadeIn(m, t + 520, 150);
        fadeTo(m, t + 900, 500, 1, 0.45);
        later(() => (counter.textContent = `${i + 1} rollout${i ? 's' : ''}`), t + 520);
      });
      const T = 250 + ITER.length * step + 450;
      fadeTo(body, T, 600, 1, 0.3);
      const best = ['R', 'B', 'B1', 'B1a', 'B1a1'];
      let d = `M${N.R[0]} ${N.R[1]}`;
      best.slice(1).forEach((k, i) => (d += curve(N[best[i]], N[k])));
      d += curve(N.B1a1, [960, 96]);
      draw(P(d, 's-blue', g), T + 200, 1400);
      fadeIn(dot(960, 96, 4.5, 'f-blue', g), T + 1550);
      fadeIn(txt(960, 134, '39', 't-num t-blue', g), T + 1600);
    }

    /* 3. Token-level backtracking: rewind to the weak node, resample once. */
    function sceneBT(g) {
      prefix(g);
      const bad = P('M330 176 C 420 176, 450 84, 560 84 S 720 62, 790 58', 's-red', g);
      draw(bad, 1000, 2500);
      fadeTo(bad, 5200, 1200, 1, 0.16);
      [[445, 118], [560, 84], [676, 67]].forEach(([x, y], i) => {
        const n = fadeIn(dot(x, y, 3, 'f-red', g), 1500 + i * 650, 300);
        fadeTo(n, 5200, 1200, 1, 0.2);
      });
      const n196 = fadeIn(txt(445, 148, '196', 't-num t-red', g), 1500, 300);
      fadeTo(n196, 5200, 1200, 1, 0.28);
      const x = svg('g', {}, g);
      cross(790, 58, 7, 's-red', x);
      txt(810, 64, '“Wait,”', 't-red t-trigger', x, 'start');
      fadeIn(x, 3500, 400);
      fadeTo(x, 5300, 1200, 1, 0.22);
      const arc = svg('g', {}, g);
      P('M780 44 C 650 -6, 400 20, 342 160', 's-mute dashed', arc);
      txt(540, 22, 'rewind to weak node', 't-mute t-arc', arc);
      fadeIn(arc, 4100, 600);
      fadeTo(arc, 6100, 800, 1, still ? 0.65 : 0);
      const good = P('M330 176 C 440 176, 500 206, 620 206 S 830 196, 960 192', 's-blue', g);
      draw(good, 6200, 2600);
      [[460, 194], [620, 206], [790, 199]].forEach(([x, y], i) => fadeIn(dot(x, y, 3, 'f-blue', g), 6600 + i * 700, 300));
      fadeIn(txt(460, 226, '216', 't-num t-blue', g), 6700, 350);
      fadeIn(dot(960, 192, 4.5, 'f-blue', g), 8700);
      fadeIn(txt(960, 230, '39', 't-num t-blue', g), 8750);
      const weak = svg('g', {}, g);
      dot(330, 176, 12, 'halo', weak);
      const ring = dot(330, 176, 6, 'ring', weak);
      txt(330, 212, 'weak node', 't-trigger', weak);
      fadeIn(weak, 900, 400);
      anim(ring, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)' }, { transform: 'scale(1)' }], 4800, 700, 'none');
    }

    const SCENES = [
      { f: sceneAR, dur: 7800, cap: '<b>Standard decoding</b> commits to every token. The slip at 196 stays in context, the model writes “Wait,” and carries on anyway, and the error propagates to 34.' },
      { f: sceneMCTS, dur: 10200, cap: '<b>Full tree search</b> expands branch after branch and rolls each one out to a finished answer. It finds 39, but only after 13 complete continuations.' },
      { f: sceneBT, dur: 10600, cap: '<b>Token-level backtracking</b> catches “Wait,”, rewinds only as far as the weak node where 196 was chosen, and resamples 216. It reaches 39 at 88% of baseline throughput.' },
    ];

    function stop() {
      timers.forEach(clearTimeout); timers = [];
      anims.forEach((a) => a.cancel()); anims = [];
    }
    function show(i) {
      stop();
      idx = i;
      const s = SCENES[i];
      tree.innerHTML = '';
      s.f(svg('g', {}, tree));
      btns.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
      cap.classList.add('fade');
      setTimeout(() => { cap.innerHTML = s.cap; cap.classList.remove('fade'); }, still ? 0 : 200);
      if (still) return;
      anim($('i', btns[i]), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 0, s.dur, 'both', 'linear');
      later(() => {
        anim(tree.firstChild, [{ opacity: 1 }, { opacity: 0 }], 0, 400, 'forwards', 'ease');
        later(() => show((idx + 1) % SCENES.length), 450);
      }, s.dur);
    }
    btns.forEach((b, i) => b.addEventListener('click', () => show(i)));
    bindTabKeys($('#heroTabs'), (_, i) => show(i));

    // Restart the current scene when the hero scrolls back into view.
    let seen = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { if (!seen) { seen = true; show(idx); } }
      else if (seen && !still) { seen = false; stop(); }
    }, { threshold: 0.2 }).observe(tree);
  })();

  /* =========================================================
     Figure 2: the decoding trace
     ========================================================= */
  const D = {
    demo: $('#demo'), stream: $('#stream'), caret: $('#caret'), dead: $('#dead'), deadWrap: $('#deadWrap'),
    play: $('#playBtn'), replay: $('#replayBtn'), speed: $('#speedBtn'),
    fill: $('#gateFill'), gateV: $('#gateV'), narr: $('#narration'),
  };
  const S = { box: $('#sampler'), rows: $$('#samp li'), pos: $('#sampPos'), note: $('#sampNote') };
  const TAU = 0.35;
  const speeds = [1, 2, 0.5];
  let speedIdx = 0, runId = 0, paused = true, started = false, finished = false, pos = 0, seq = 0;

  class Cancelled extends Error {}
  const wait = async (ms, id) => {
    let t = 0;
    while (t < ms) {
      if (id !== runId) throw new Cancelled();
      await new Promise((r) => setTimeout(r, 30));
      if (!paused) t += 30 * speeds[speedIdx];
    }
    if (id !== runId) throw new Cancelled();
  };

  async function say(html, id) {
    D.narr.classList.add('fade');
    await wait(160, id);
    D.narr.innerHTML = `<span class="narr-inner">${html}</span>`;
    D.narr.classList.remove('fade');
  }

  /* ---------- Next-token distributions ---------- */
  // Plausible runner-up candidates for the confident steps.
  const ALT = {
    Step: ['So', 'First', 'We'], '1:': ['1.', 'one:', '1 -'], '2:': ['2.', 'Now', '2 -'], '3:': ['3.', 'Then', '3 -'], '4:': ['4.', 'Finally', '4 -'],
    '12': ['There', 'The', 'Each'], '×': ['*', 'times', 'x'], '18': ['12', '8', '16'], '=': ['is', '→', 'gives'],
    'cookies.': ['cookies,', 'total.', 'in'], 'that’s': ['so', 'this', 'which'], the: ['all', 'our', 'a'], full: ['total', 'whole', 'entire'],
    'batch.': ['total.', 'amount.', 'count.'], sells: ['She', 'selling', 'sold'], '¾': ['3/4', '75%', 'three'], '→': ['=', ':', 'so'],
    '−': ['-', 'minus', '–'], 'Answer:': ['The', 'So', 'Final'],
  };
  const numAlts = (t) => { const m = /^(\d+)(\.?)$/.exec(t); return m && [+m[1] + 10, +m[1] - 1, +m[1] + 1].map((n) => n + m[2]); };
  function autoDist(t) {
    const top = 0.9 + ((seq++ * 37) % 9) / 100, r = 1 - top;
    const a = ALT[t] || numAlts(t) || ['.', ',', 'so'];
    return [[t, top], [a[0], r * 0.55], [a[1], r * 0.25], [a[2], r * 0.12]];
  }
  // Normalised entropy of the top four plus the remaining tail mass.
  const entropy = (d) => {
    const ps = d.map((c) => c[1]);
    ps.push(Math.max(0, 1 - ps.reduce((s, p) => s + p, 0)));
    return Math.min(1, -ps.filter((p) => p > 0).reduce((s, p) => s + p * Math.log(p), 0) / Math.log(5));
  };
  const fmtP = (p) => p.toFixed(2).replace(/^0/, '');

  function showDist(d, o = {}) {
    S.box.classList.remove('idle');
    S.pos.textContent = o.pos ? 'position ' + o.pos : '';
    S.note.innerHTML = o.note || '';
    S.rows.forEach((li, k) => {
      const c = d[k];
      li.className = k === o.pick ? 'pick' : k === o.pen ? 'pen' : '';
      li.style.visibility = c ? '' : 'hidden';
      if (!c) return;
      li.children[0].textContent = c[0];
      li.children[1].firstChild.style.width = c[1] * 100 + '%';
      li.children[2].textContent = fmtP(c[1]);
    });
  }
  function idle(note = '') {
    S.box.classList.add('idle');
    S.note.innerHTML = note;
  }

  function addTok(text, o) {
    const el = document.createElement('span');
    el.className = 'tok' + (o.cls ? ' ' + o.cls : '');
    const h = entropy(o.d);
    if (h > 0.7) el.classList.add('spike');
    el.style.setProperty('--h', h);
    el.innerHTML = '<span class="tx"></span><span class="bar"><i></i></span>';
    el.firstChild.textContent = text;
    Object.assign(el, { _t: text, _d: o.d, _pos: o.pos, _pick: o.pick, _pen: o.pen, _h: h });
    D.stream.insertBefore(el, D.caret);
    return el;
  }
  function note(tok, text, cls = '') {
    tok.querySelector('.note')?.remove();
    const s = document.createElement('span');
    s.className = 'note ' + cls;
    s.textContent = text;
    tok.appendChild(s);
  }

  // One decoding step: show the candidates, pick one, append it.
  async function emit(w, id, cls = '') {
    const o = typeof w === 'string' ? { t: w } : w;
    const d = o.d || autoDist(o.t), pick = o.pick ?? 0;
    pos++;
    showDist(d, { pos, note: o.note, pen: o.pen });
    if (o.pre) await o.pre();
    await wait(o.think ?? 110, id);
    S.rows[pick].classList.add('pick');
    await wait(o.hold ?? 70, id);
    return addTok(o.t, { cls: [cls, o.cls].filter(Boolean).join(' '), d, pos, pick, pen: o.pen });
  }
  async function stream(words, id, cls = '') {
    for (const w of words) { await emit(w, id, cls); await wait(25, id); }
  }

  async function gate(d, id) {
    D.fill.classList.remove('pass');
    D.fill.style.width = '0';
    D.gateV.innerHTML = '<i>d</i> = …';
    await wait(500, id);
    D.fill.style.width = Math.min(d, 1) * 100 + '%';
    await wait(1000, id);
    D.gateV.innerHTML = `<i>d</i> = ${d.toFixed(2)} ${d > TAU ? '&gt;' : '&lt;'} <i>τ</i>`;
    if (d > TAU) D.fill.classList.add('pass');
    return d > TAU;
  }

  function reset() {
    runId++;
    $$('.tok', D.stream).forEach((t) => t.remove());
    D.dead.innerHTML = '';
    D.deadWrap.hidden = true;
    D.fill.style.width = '0'; D.fill.classList.remove('pass');
    D.gateV.innerHTML = '<i>d</i> = &mdash;';
    S.rows.forEach((li) => { li.className = ''; li.style.visibility = 'hidden'; });
    S.pos.textContent = '';
    idle();
    pos = 0; seq = 0;
    finished = false;
  }

  const D196 = [['196', 0.47], ['216', 0.44], ['186', 0.05], ['206', 0.02]];
  const PEN = [['196', 0], ['216', 0.83], ['186', 0.11], ['206', 0.04]];

  async function run(id) {
    await say('Llama-3.1-70B generates one token at a time: it scores the candidates for the next position, and decoding commits to the most likely one.', id);
    await stream(['Step', '1:', '12', '×', '18', '='], id);

    const weak = await emit({
      t: '196', d: D196, think: 2600, note: 'top-two gap 0.03 &lt; <i>ε</i>',
      pre: () => say('The model is torn: <b>196</b> (0.47) vs. <b>216</b> (0.44). The gap between the top two candidates is below <i>ε</i>.', id),
    }, id, 'weak');
    note(weak, 'weak node', 'ink');
    await say('Decoding commits to 196 anyway. Because the choice was nearly a coin flip, this position is saved as a weak-node checkpoint.', id);
    await wait(2200, id);

    await stream(['cookies.'], id);
    const act = await emit({ t: 'Actually,', d: [['Actually,', 0.62], ['That', 0.2], ['So', 0.1], ['Step', 0.05]], think: 700 }, id, 'trigger');
    idle('8B draft model probing…');
    await say('Trigger token <b>“Actually,”</b> detected. Probing with the 8B draft model: “So that is 196 cookies in total.”', id);
    await wait(1300, id);

    const p1 = await gate(0.11, id);
    if (!p1) {
      act.classList.replace('trigger', 'gated');
      note(act, 'rephrasing');
      await say('Cosine distance <i>d</i> = 0.11 &lt; <i>τ</i> (0.35): surface rephrasing only. Gate aborts rollback.', id);
      await wait(1800, id);
    }

    await stream(['that’s', 'the', 'full', 'batch.', 'Step', '2:', 'sells', '¾', '→', '196', '×', '¾', '=',
      { t: '147.', d: [['147.', 0.62], ['144.', 0.21], ['148.', 0.09], ['150.', 0.05]], think: 400 },
      'Step', '3:', '196', '−', '147', '=',
      { t: '49', d: [['49', 0.45], ['59', 0.25], ['48', 0.14], ['39', 0.09]], think: 700 }], id);
    const w = await emit({ t: 'Wait,', d: [['Wait,', 0.32], ['Step', 0.24], ['cookies.', 0.19], ['So', 0.13]], think: 1100 }, id, 'trigger');
    await say(`Trigger token <b>“Wait,”</b> wins out of a flat distribution: an entropy spike (<i>H</i> = ${w._h.toFixed(2)}).`, id);
    await wait(1600, id);

    idle();
    await say('Scanning back to locate the weak-node checkpoint where the error originated…', id);
    const toks = $$('.tok', D.stream);
    const wi = toks.indexOf(weak), ti = toks.indexOf(w);
    for (let i = ti; i >= wi; i--) {
      toks[i].classList.add('scan');
      await wait(60, id);
      if (i !== wi) toks[i].classList.remove('scan');
    }
    idle('8B draft model probing…');
    await say(`Located checkpoint ${ti - wi} tokens back at <b>196</b>. Running 8B draft lookahead: “216 cookies. She sells ¾, so 162…”`, id);
    await wait(1400, id);

    const p2 = await gate(0.58, id);
    if (p2) await say('Cosine distance <i>d</i> = 0.58 &gt; <i>τ</i>: the draft trajectory diverges semantically. Rollback approved.', id);
    await wait(1600, id);

    weak.classList.remove('scan');
    const doomed = toks.slice(wi, ti + 1);
    for (let i = doomed.length - 1; i >= 0; i--) { doomed[i].classList.add('rewind'); await wait(30, id); }
    await wait(380, id);
    doomed.forEach((t) => {
      t.className = 'tok';
      t.querySelector('.note')?.remove();
      D.dead.appendChild(t);
    });
    note(D.dead.firstChild, '−30 logits', 'red');
    D.deadWrap.hidden = false;
    pos = weak._pos - 1;
    showDist(D196, { pos: weak._pos, note: 'checkpoint restored' });
    await say(`Rolled back ${doomed.length} tokens. At the checkpoint the model faces the same near-tie as before.`, id);
    await wait(2000, id);

    await emit({
      t: '216', d: PEN, pick: 1, pen: 0, think: 2600, note: '196 penalised by −30 logits',
      pre: () => say('Contrastive resampling: the rejected <b>196</b> takes a −30 logit penalty, and its probability mass shifts to <b>216</b>.', id),
    }, id, 'fresh');
    await say('Resuming generation along the corrected branch.', id);
    await stream(['cookies.', 'Step', '2:', 'sells', '¾', '→', '216', '×', '¾', '=', '162.', 'Step', '3:', '216', '−', '162', '=', '54.',
      'Step', '4:', '54', '−', '15', '=', '39.', 'Answer:'], id, 'fresh');
    await emit('39', id, 'final');
    idle('Hover or tap any token to see its candidates.');
    await say('Derivation complete: <b>39</b> (1 cosmetic trigger ignored, 1 rollback executed).', id);
    finished = true;
    setPlaying(false);
  }

  // When paused, hovering or clicking a token shows the distribution it was picked from.
  function inspect(e) {
    if (!paused || !started) return;
    const t = e.target.closest('.tok');
    if (!t || !t._d) return;
    $$('.tok.insp', D.demo).forEach((x) => x.classList.remove('insp'));
    t.classList.add('insp');
    showDist(t._d, { pos: t._pos, pick: t._pick, pen: t._pen, note: `entropy <i>H</i> = ${t._h.toFixed(2)}` });
  }
  [D.stream, D.dead].forEach((el) => { el.addEventListener('mouseover', inspect); el.addEventListener('click', inspect); });

  function setPlaying(on) {
    paused = !on;
    D.demo.classList.toggle('inspect', !on && started);
    if (on) $$('.tok.insp', D.demo).forEach((x) => x.classList.remove('insp'));
    else if (started && !finished) idle('Paused. Hover or tap any token to see its candidates.');
    D.play.textContent = on ? 'Pause' : finished ? 'Play again' : started ? 'Resume' : 'Play';
  }
  function start() {
    reset();
    started = true;
    const id = runId;
    setPlaying(true);
    run(id).catch((e) => { if (!(e instanceof Cancelled)) console.error(e); });
  }
  D.play.addEventListener('click', () => (!started || finished ? start() : setPlaying(paused)));
  D.replay.addEventListener('click', start);
  D.speed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    D.speed.textContent = speeds[speedIdx] + '×';
  });
  onView($('#demo'), () => { if (!started) start(); }, 0.4);

  /* =========================================================
     Figure 3: accuracy against throughput (Table 1)
     ========================================================= */
  const T1 = {
    names: ['Standard decoding', 'Self-consistency', 'Self-Refine', 'Tree of Thoughts', 'Backtracking'],
    tok: [42.7, 9.1, 21.3, 6.4, 37.8],
    GSM8K: [74.2, 78.6, 76.9, 79.1, 82.1],
    MATH: [41.6, 45.2, 43.8, 46.0, 48.4],
    HumanEval: [61.0, 63.4, 64.8, 62.1, 67.7],
    AIME: [13.3, 16.7, 16.7, 20.0, 23.3],
  };
  const sc = $('#scatter');
  const M = { l: 52, r: 24, t: 34, b: 56 };
  let W = 900, H = 380, dom = [0, 1], cur = 'GSM8K', pts = [], yG, guide, guideH, gainLink, hov = -1;
  const xS = (v) => M.l + (v / 45) * (W - M.l - M.r);
  const yS = (v) => H - M.b - ((v - dom[0]) / (dom[1] - dom[0])) * (H - M.t - M.b);

  function buildScatter() {
    W = Math.max(320, Math.round(sc.parentElement.clientWidth));
    H = W < 600 ? 330 : 380;
    sc.setAttribute('viewBox', `0 0 ${W} ${H}`);
    sc.innerHTML = '';
    yG = svg('g', { class: 'tick-y' }, sc);
    svg('line', { class: 'axis', x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b }, sc);
    [0, 10, 20, 30, 40].forEach((v) => {
      svg('line', { class: 'axis', x1: xS(v), x2: xS(v), y1: H - M.b, y2: H - M.b + 5 }, sc);
      svg('text', { class: 'tlab', x: xS(v), y: H - M.b + 22, 'text-anchor': 'middle' }, sc).textContent = v;
    });
    svg('text', { class: 'alab', x: W - M.r, y: H - 10, 'text-anchor': 'end' }, sc).textContent = 'Throughput (tokens / second)';
    svg('text', { class: 'alab', x: M.l - 40, y: M.t - 16 }, sc).textContent = 'Accuracy (%)';
    // Hover guides: dashed lines from the hovered point to both axes.
    const defs = svg('defs', {}, sc);
    const cp = svg('clipPath', { id: 'scClip' }, defs);
    svg('rect', { x: M.l, y: 0, width: W - M.l - M.r, height: H - M.b }, cp);
    gainLink = svg('line', { class: 'gain-link' }, sc);
    guide = svg('g', { class: 'pt-g guide' }, svg('g', { 'clip-path': 'url(#scClip)' }, sc));
    guideH = svg('line', { y1: 0, y2: 0, x2: 0 }, guide);
    svg('line', { x1: 0, x2: 0, y1: 0, y2: H }, guide);
    hov = -1;
    const offs = [[-12, 26, 'end'], [-8, 0, 'start'], [12, 5, 'start'], [-8, 0, 'start'], [-14, -8, 'end']];
    pts = T1.names.map((name, i) => {
      const g = svg('g', { class: 'pt-g' }, sc);
      g.style.transition = 'none';
      const us = i === 4;
      svg('circle', us ? { r: 5.5, fill: 'var(--blue)' }
        : i === 0 ? { r: 4.5, fill: 'var(--ink)' }
        : { r: 4.5, fill: 'var(--paper)', stroke: 'var(--ink-2)', 'stroke-width': 1.2 }, g);
      const [dx, dy, a] = offs[i];
      const lbl = svg('text', { class: 'lbl' + (us ? ' us' : ''), x: dx, y: dy, 'text-anchor': a }, g);
      lbl.textContent = name;
      const val = svg('text', { class: 'val', x: dx, y: dy + 15, 'text-anchor': a }, g);
      svg('circle', { r: 14, class: 'hit' }, g);
      g.addEventListener('pointerenter', () => showGuide(i));
      g.addEventListener('pointerleave', () => { if (hov === i) { hov = -1; guide.classList.remove('on'); } });
      return { g, lbl, val };
    });
    drawScatter(cur);
    requestAnimationFrame(() => requestAnimationFrame(() => pts.forEach((p) => (p.g.style.transition = ''))));
  }

  function showGuide(i) {
    hov = i;
    guide.style.transition = 'none';
    guide.style.transform = pts[i].g.style.transform;
    guideH.setAttribute('x1', M.l - xS(T1.tok[i]));
    guide.getBoundingClientRect();
    guide.style.transition = '';
    guide.classList.add('on');
  }

  const T1COL = { GSM8K: 1, MATH: 2, HumanEval: 3, AIME: 4 };
  function syncBenchmarkControls(key) {
    $$('#table1 tr').forEach((tr) => [...tr.children].forEach((c, j) => c.classList.toggle('active-col', j === T1COL[key])));
    $$('#table1 .th-tab').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.k === key)));
  }

  function drawScatter(key) {
    cur = key;
    syncBenchmarkControls(key);
    const v = T1[key];
    const span = Math.max(...v) - Math.min(...v);
    const step = span > 12 ? 4 : 2;
    dom = [Math.floor((Math.min(...v) - 2.5) / step) * step, Math.ceil((Math.max(...v) + 2) / step) * step];
    yG.innerHTML = '';
    for (let t = dom[0]; t <= dom[1]; t += step) {
      if (t > dom[0]) svg('line', { class: 'tick', x1: M.l, x2: W - M.r, y1: yS(t), y2: yS(t) }, yG);
      svg('text', { class: 'tlab', x: M.l - 12, y: yS(t) + 4, 'text-anchor': 'end' }, yG).textContent = t;
    }
    const scHigh = v[1] > v[3];
    [[1, scHigh], [3, !scHigh]].forEach(([i, up]) => {
      pts[i].lbl.setAttribute('y', up ? -28 : 26);
      pts[i].val.setAttribute('y', up ? -13 : 41);
    });
    pts.forEach((p, i) => {
      p.g.style.transform = `translate(${xS(T1.tok[i])}px, ${yS(v[i])}px)`;
      p.val.textContent = `${v[i].toFixed(1)}%  ·  ${T1.tok[i]} tok/s`;
    });
    if (gainLink) {
      gainLink.setAttribute('x1', xS(T1.tok[0]));
      gainLink.setAttribute('y1', yS(v[0]));
      gainLink.setAttribute('x2', xS(T1.tok[4]));
      gainLink.setAttribute('y2', yS(v[4]));
    }
    if (hov >= 0) guide.style.transform = pts[hov].g.style.transform;
  }
  buildScatter();
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => {
    if (Math.abs(sc.parentElement.clientWidth - W) > 4) buildScatter();
  }, 120); }).observe(sc.parentElement);

  function tabs(el, cb) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', el).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      cb(b.dataset.k);
    });
    bindTabKeys(el, (b) => {
      $$('button', el).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      cb(b.dataset.k);
    });
  }
  $('#table1 thead').addEventListener('click', (e) => {
    const b = e.target.closest('.th-tab'); if (!b) return;
    drawScatter(b.dataset.k);
  });

  /* =========================================================
     Figure 4: by model family (Tables 2 and 4)
     ========================================================= */
  const FAM = [
    { n: 'Llama-3.1', p: '70B with 8B draft', gsm: [74.2, 82.1], math: [41.6, 48.4], p1: [61.0, 67.7] },
    { n: 'Mistral-Large-2', p: '123B with 7B draft', gsm: [79.8, 85.3], math: [47.2, 53.1], p1: [64.6, 69.5] },
    { n: 'Qwen-2.5', p: '72B with 7B draft', gsm: [82.4, 87.6], math: [49.8, 55.4], p1: [71.3, 76.2] },
    { n: 'Gemma-2', p: '27B with 2B draft', gsm: [68.1, 74.9], math: [34.2, 40.7], p1: [51.8, 58.5] },
  ];
  const rows = FAM.map((f) => {
    const r = document.createElement('div');
    r.className = 'db-row';
    r.innerHTML = `<div class="db-name">${f.n}<small>${f.p}</small></div>
      <div class="db-track"><span class="db-line"></span><span class="db-dot base"><span></span></span><span class="db-dot bt"><span></span></span></div>
      <div class="db-delta"></div>`;
    $('#dumbbell').appendChild(r);
    return { f, line: $('.db-line', r), base: $('.db-dot.base', r), bt: $('.db-dot.bt', r), delta: $('.db-delta', r) };
  });
  const dbAxis = $('#dbAxis');
  function drawFam(k) {
    const all = FAM.flatMap((f) => f[k]);
    const lo = Math.floor((Math.min(...all) - 4) / 5) * 5, hi = Math.ceil((Math.max(...all) + 2) / 5) * 5;
    const pc = (v) => ((v - lo) / (hi - lo)) * 100;
    rows.forEach(({ f, line, base, bt, delta }) => {
      const [a, b] = f[k];
      base.style.left = pc(a) + '%';
      bt.style.left = pc(b) + '%';
      line.style.left = pc(a) + '%';
      line.style.width = pc(b) - pc(a) + '%';
      base.firstChild.textContent = a.toFixed(1);
      bt.firstChild.textContent = b.toFixed(1);
      delta.textContent = '+' + (b - a).toFixed(1);
    });
    if (dbAxis) {
      const step = (hi - lo) > 25 ? 10 : 5;
      let ticksHtml = '';
      for (let v = lo; v <= hi; v += step) {
        ticksHtml += `<span class="db-tick" style="left:${pc(v)}%">${v}%</span>`;
      }
      dbAxis.innerHTML = `<div class="db-axis-track">${ticksHtml}</div>`;
    }
  }
  drawFam('gsm');
  tabs($('#famSwitch'), drawFam);

  /* =========================================================
     Figure 5: the threshold (Table 6)
     ========================================================= */
  const TAUS = [
    { t: 0.15, acc: 79.6, tok: 31.2, bt: 5.7, prec: 0.52, note: 'Aggressive: triggers on surface rephrasings.' },
    { t: 0.25, acc: 81.3, tok: 35.4, bt: 3.4, prec: 0.68, note: 'High coverage, 32% false-positive rollbacks.' },
    { t: 0.35, acc: 82.1, tok: 37.8, bt: 2.4, prec: 0.79, note: 'Default threshold: peak accuracy/throughput trade-off.' },
    { t: 0.45, acc: 80.4, tok: 39.8, bt: 1.3, prec: 0.88, note: 'Conservative: high precision, misses subtle errors.' },
    { t: 0.55, acc: 77.1, tok: 41.3, bt: 0.6, prec: 0.93, note: 'Over-strict: rarely triggers rollbacks.' },
  ];
  const tc = $('#tauChart');
  const TW = 360, TH = 210, TM = { l: 38, r: 36, t: 26, b: 34 };
  const tx = (i) => TM.l + 10 + (i / 4) * (TW - TM.l - TM.r - 20);
  const yA = (v) => TH - TM.b - ((v - 76) / (84 - 76)) * (TH - TM.t - TM.b);
  const yP = (v) => TH - TM.b - ((v - 0.4) / (1 - 0.4)) * (TH - TM.t - TM.b);
  svg('text', { class: 'ax-lbl acc', x: TM.l - 6, y: 13, 'text-anchor': 'start' }, tc).textContent = 'Accuracy';
  svg('text', { class: 'ax-lbl prec', x: TW - TM.r + 6, y: 13, 'text-anchor': 'end' }, tc).textContent = 'Precision';
  [76, 80, 84].forEach((v) => {
    svg('line', { class: 'gl', x1: TM.l, x2: TW - TM.r, y1: yA(v), y2: yA(v) }, tc);
    svg('text', { x: TM.l - 8, y: yA(v) + 4, 'text-anchor': 'end' }, tc).textContent = v + '%';
  });
  [0.4, 0.7, 1.0].forEach((v) => {
    svg('text', { x: TW - TM.r + 8, y: yP(v) + 4 }, tc).textContent = v.toFixed(1);
  });
  svg('line', { class: 'axis', x1: TM.l, x2: TW - TM.r, y1: TH - TM.b, y2: TH - TM.b }, tc);
  TAUS.forEach((d, i) => (svg('text', { x: tx(i), y: TH - 12, 'text-anchor': 'middle' }, tc).textContent = d.t.toFixed(2)));
  const marker = svg('line', { class: 'marker', x1: 0, x2: 0, y1: TM.t - 6, y2: TH - TM.b }, tc);
  svg('path', { class: 'l-prec', d: 'M' + TAUS.map((d, i) => `${tx(i)} ${yP(d.prec)}`).join(' L') }, tc);
  svg('path', { class: 'l-acc', d: 'M' + TAUS.map((d, i) => `${tx(i)} ${yA(d.acc)}`).join(' L') }, tc);
  const dP = svg('circle', { class: 'd-prec', r: 3.5 }, tc);
  const dA = svg('circle', { class: 'd-acc', r: 4 }, tc);

  const range = $('#tauRange');
  function drawTau(i) {
    const d = TAUS[i];
    $('#tauOut').textContent = d.t.toFixed(2);
    $('#tauRead').innerHTML = `<b>${d.acc.toFixed(1)}%</b> accuracy &middot; <b>${d.tok.toFixed(1)}</b> tok/s &middot; <b>${d.bt.toFixed(1)}</b> rewinds/seq &middot; <b>${d.prec.toFixed(2)}</b> precision<span class="tau-note">${d.note}</span>`;
    marker.style.transform = `translateX(${tx(i)}px)`;
    dA.setAttribute('cx', tx(i)); dA.setAttribute('cy', yA(d.acc));
    dP.setAttribute('cx', tx(i)); dP.setAttribute('cy', yP(d.prec));
  }
  range.addEventListener('input', () => drawTau(+range.value));
  drawTau(2);

  /* =========================================================
     Figure 6: two hundred changed answers
     ========================================================= */
  const wf = $('#waffle');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 200; i++) {
    const s = document.createElement('i');
    const cls = i < 156 ? 'f' : i < 187 ? 'k' : 'h';
    s.className = cls;
    s.dataset.cat = cls;
    s.style.transitionDelay = i * 5 + 'ms';
    frag.appendChild(s);
  }
  wf.appendChild(frag);
  onView(wf, () => wf.classList.add('in'), 0.5);

  const wfCells = $$('i', wf);
  const highlightCat = (cat) => {
    wfCells.forEach((c) => {
      c.style.transitionDelay = '0ms';
      c.classList.toggle('hi', Boolean(cat && c.dataset.cat === cat));
    });
  };
  wf.addEventListener('mouseover', (e) => {
    const cell = e.target.closest('i');
    if (cell) highlightCat(cell.dataset.cat);
  });
  wf.addEventListener('mouseleave', () => highlightCat(null));
  $$('#waffleMeta span').forEach((sp, idx) => {
    const cat = ['f', 'k', 'h'][idx];
    sp.addEventListener('mouseenter', () => highlightCat(cat));
    sp.addEventListener('mouseleave', () => highlightCat(null));
  });

  /* ---------- Citation ---------- */
  // navigator.clipboard only exists in secure contexts (HTTPS / localhost);
  // fall back to execCommand when served over plain HTTP.
  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy failed');
  };

  let copyReset;
  $('#copyBib').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const lbl = $('#copyLabel');
    clearTimeout(copyReset);
    b.classList.remove('copied');
    let message;
    try {
      await copyText($('#bibtex').textContent);
      b.focus({ preventScroll: true });
      b.classList.add('copied');
      message = 'BibTeX copied';
      if (lbl) lbl.textContent = 'Copied';
    } catch {
      message = 'Unable to copy. Select the citation text to copy it.';
    }
    b.title = message;
    b.setAttribute('aria-label', message);
    $('#copyStatus').textContent = message;
    copyReset = setTimeout(() => {
      b.classList.remove('copied');
      b.title = 'Copy BibTeX';
      b.setAttribute('aria-label', 'Copy BibTeX');
      if (lbl) lbl.textContent = 'Copy BibTeX';
      $('#copyStatus').textContent = '';
    }, 2000);
  });
})();
