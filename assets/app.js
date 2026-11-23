(() => {
  'use strict';

  // Day 1 of the daily question cycle (local date; month is 0-based).
  const START = [2026, 10, 23];

  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };

  /* ---------------- Crypto ---------------- */

  function fromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  async function getKey() {
    const h = decodeURIComponent(location.hash.slice(1)).trim();
    if (!h || !window.crypto || !crypto.subtle) return null;
    let raw;
    try { raw = fromB64url(h); } catch { return null; }
    if (raw.length !== 16) return null;
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  }

  async function fetchDecrypt(key, url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, key, buf.subarray(12));
  }

  /* ---------------- Daily question ---------------- */

  const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m, d) / 864e5);

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, seed) {
    const a = arr.slice(), r = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function today() {
    const d = new Date();
    const n = dayNumber(d.getFullYear(), d.getMonth(), d.getDate());
    return { date: d, n, index: n - dayNumber(...START), iso: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` };
  }

  // One question per day, in the order of the bank (Day 1 = START). After the
  // last one the list starts again from the top.
  function questionFor(questions, index) {
    const N = questions.length;
    const item = questions[((index % N) + N) % N];
    // A "reveal" question shows only the wrong answers at first; picking one
    // reveals the real answer.
    const reveal = !Array.isArray(item) && item.reveal;
    const [text, correct, ...wrong] = Array.isArray(item) ? item : item.q;
    return {
      text, correct, reveal,
      options: reveal ? wrong : shuffled([correct, ...wrong], 7919 * (index + 11)),
    };
  }

  /* ---------------- Waves (the strand pattern from the card back) ---------------- */

  function waveSVG(kind) {
    const card = kind === 'card';
    const n = card ? 34 : 26;
    const color = card ? '#141a40' : '#e2b663';
    let paths = '';
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const yL = 70 + t * 120;
      const yR = 8 + t * 150;
      const yP = 150 + (t - 0.5) * 8;
      const op = card ? (0.07 + 0.2 * Math.sin(Math.PI * t)) : (0.05 + 0.16 * Math.sin(Math.PI * t));
      paths += `<path d="M-10 ${yL.toFixed(1)} C 260 ${(yL + 10).toFixed(1)}, 420 ${yP.toFixed(1)}, 590 ${yP.toFixed(1)} S 860 ${yR.toFixed(1)}, 1010 ${yR.toFixed(1)}" stroke="${color}" stroke-opacity="${op.toFixed(3)}" stroke-width="1"/>`;
    }
    return `<svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
  }
  function paintWaves(root = document) {
    root.querySelectorAll('[data-waves]').forEach((el) => { el.innerHTML = waveSVG(el.dataset.waves); });
  }

  /* ---------------- Particles ---------------- */

  function burst(x, y, { count = 36, spread = 160, square = false, colors = ['#cf9a35', '#e2b663', '#f3d79a', '#fdf6ea'] } = {}) {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'particle';
      const size = square ? 3 + Math.random() * 5 : 4 + Math.random() * 5;
      p.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${square ? size : size * 0.45}px;background:${colors[i % colors.length]}`;
      document.body.appendChild(p);
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.35 + Math.random() * 0.65);
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - (square ? 0 : 50);
      const rot = (Math.random() - 0.5) * 720;
      p.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + (square ? 0 : 70)}px)) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => p.remove());
    }
  }

  /* ---------------- Intro ---------------- */

  // Tap anywhere during the intro: the first tap speeds it up, a second tap skips it.
  let skipping = false;
  let speed = 1;
  let skipResolve, fastResolve;
  const skipped = new Promise((r) => { skipResolve = r; });
  const fast = new Promise((r) => { fastResolve = r; });
  const wait = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms / speed)), fast, skipped]);
  const play = (el, frames, opts) => {
    const a = el.animate(frames, { fill: 'forwards', ...opts });
    a.playbackRate = speed;
    if (skipping) a.finish();
    return Promise.race([a.finished, skipped]);
  };
  function onIntroTap() {
    if (speed === 1) {
      speed = 4;
      document.getAnimations().forEach((a) => { a.playbackRate = speed; });
      fastResolve();
    } else if (!skipping) {
      skipping = true;
      document.getAnimations().forEach((a) => a.finish());
      skipResolve();
    }
  }

  async function runIntro() {
    const intro = $('#intro');
    const wrap = $('#cardWrap');
    const card = $('#card3d');
    const shadow = $('#cardShadow');
    intro.hidden = false;
    intro.addEventListener('pointerdown', onIntroTap);

    // 1. The card lifts off the table and flies up to the viewer.
    shadow.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 150, fill: 'forwards', easing: 'ease-out' }).playbackRate = speed;
    await play(wrap, [
      { opacity: 0, transform: 'translate3d(0, 55vh, -200px) rotateX(64deg) rotateZ(-22deg) scale(.7)' },
      { opacity: 1, offset: 0.35, transform: 'translate3d(0, 14vh, -60px) rotateX(38deg) rotateZ(-9deg) scale(.88)' },
      { opacity: 1, transform: 'translate3d(0,0,0) rotateX(0) rotateZ(0) scale(1)' },
    ], { duration: 1300, easing: 'cubic-bezier(.2,.75,.25,1)' });
    $('#glare').animate([{ opacity: 0, transform: 'translateX(-60%)' }, { opacity: 1, offset: .3 }, { opacity: 0, transform: 'translateX(60%)' }], { duration: 800, easing: 'ease-in-out' }).playbackRate = speed;
    await wait(350);

    // 2. Physical to digital: the card flips and sheds gold "pixels".
    const flip = play(card, [
      { transform: 'rotateY(0deg) translateZ(0)' },
      { transform: 'rotateY(90deg) translateZ(60px) scale(1.06)', offset: 0.5 },
      { transform: 'rotateY(180deg) translateZ(0)' },
    ], { duration: 950, easing: 'cubic-bezier(.45,.05,.25,1)' });
    setTimeout(() => {
      if (skipping) return;
      const r = wrap.getBoundingClientRect();
      for (let k = 0; k < 4; k++) burst(r.left + r.width * (0.2 + 0.2 * k), r.top + r.height / 2, { count: 12, spread: 220, square: true });
    }, 380 / speed);
    await flip;
    await wait(450);

    // 3. The card back becomes the question card.
    await morphIntoApp(wrap, intro);
  }

  async function morphIntoApp(wrap, intro) {
    const app = $('#app');
    const qcard = $('#qcard');
    const inner = qcard.querySelector('.qcard-inner');
    const from = wrap.getBoundingClientRect();

    app.hidden = false;
    qcard.classList.add('hold');
    inner.classList.add('fade');
    window.scrollTo(0, 0);
    const to = qcard.getBoundingClientRect();

    const morph = document.createElement('div');
    morph.className = 'morph';
    morph.innerHTML = $('#backFace').innerHTML;
    paintWaves(morph);
    Object.assign(morph.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    document.body.appendChild(morph);
    intro.style.transition = 'opacity .35s';
    intro.style.opacity = '0';
    document.body.classList.remove('booting');

    const title = morph.querySelector('.back-title');
    const bars = morph.querySelectorAll('.bar');
    const rest = morph.querySelector('.frame');
    if (!skipping) {
      [title, ...bars].forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
      rest.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 400, fill: 'forwards' });
    }
    app.classList.add('ready');
    showTabbar(!skipping);
    await play(morph, [
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '14px' },
      { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: '16px' },
    ], { duration: 900, easing: 'cubic-bezier(.65,0,.25,1)' });

    qcard.classList.remove('hold');
    morph.remove();
    intro.remove();
    requestAnimationFrame(() => inner.classList.remove('fade'));
  }

  function showAppInstantly() {
    document.querySelectorAll('#intro, .morph').forEach((el) => el.remove());
    $('#app').hidden = false;
    document.body.classList.remove('booting');
    requestAnimationFrame(() => $('#app').classList.add('ready'));
    showTabbar(false);
  }

  /* ---------------- Quiz ---------------- */

  const WRONG = [
    'Not quite. Try again.',
    'Close… but no.',
    'Nice guess. Wrong, though.',
    'Hmm, not that one.',
    'Plot twist: no.',
    'Keep going, you\'ve got this.',
  ];
  const RIGHT = ['Correct.', 'Spot on.', 'Exactly right.', 'Well done.', 'Nailed it.'];

  function renderQuiz(content, day, onSolved) {
    const q = questionFor(content.questions, day.index);
    $('#question').textContent = q.text;
    const box = $('#options');
    const fb = $('#feedback');
    const solved = store.get('tmw.solved') === day.iso;
    let tries = 0;
    let revealed = false;

    function win(b) {
      box.querySelectorAll('.opt').forEach((o) => { o.disabled = true; if (o !== b && !o.classList.contains('wrong')) o.classList.add('dim'); });
      b.classList.add('right');
      fb.textContent = q.reveal ? 'Correct. Obviously.' : RIGHT[Math.floor(Math.random() * RIGHT.length)];
      fb.className = 'feedback good';
      const r = b.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, { count: 46, spread: 190 });
      store.set('tmw.solved', day.iso);
      onSolved(true);
    }

    function addButton(opt, i, extraClass) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `opt${extraClass ? ` ${extraClass}` : ''}`;
      b.innerHTML = `<span class="letter">${'ABCD'[i]}</span><span class="txt"></span>`;
      b.querySelector('.txt').textContent = opt;
      if (solved) {
        b.disabled = true;
        b.classList.add(opt === q.correct ? (q.reveal ? 'right-green' : 'right') : 'dim');
      }
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (opt === q.correct) return win(b);
        if (q.reveal) {
          // One go only: the pick flashes red, then the real answer appears
          // already marked correct, and the songs unlock.
          if (revealed) return;
          revealed = true;
          box.querySelectorAll('.opt').forEach((o) => { o.disabled = true; if (o !== b) o.classList.add('dim'); });
          b.classList.add('flash-wrong');
          if (navigator.vibrate) navigator.vibrate(30);
          setTimeout(() => {
            b.classList.remove('flash-wrong');
            b.classList.add('dim');
            const nb = addButton(q.correct, q.options.length, 'reveal-in right-green');
            nb.disabled = true;
            fb.textContent = 'Trick question. It\'s both.';
            fb.className = 'feedback good';
            const r = nb.getBoundingClientRect();
            burst(r.left + r.width / 2, r.top + r.height / 2, { count: 46, spread: 190 });
            store.set('tmw.solved', day.iso);
            onSolved(true);
          }, 900);
          return;
        }
        b.disabled = true;
        b.classList.add('wrong', 'shake');
        fb.textContent = WRONG[tries++ % WRONG.length];
        fb.className = 'feedback';
        if (navigator.vibrate) navigator.vibrate(40);
      });
      box.appendChild(b);
      return b;
    }

    q.options.forEach((opt, i) => addButton(opt, i));
    if (q.reveal && solved) addButton(q.correct, q.options.length);

    if (solved) {
      fb.textContent = 'Solved. Enjoy today\'s tracks.';
      fb.className = 'feedback good';
    }
    return solved;
  }

  function updateStreak(day) {
    let s = { last: null, count: 0 };
    try { s = JSON.parse(store.get('tmw.streak')) || s; } catch { /* ignore */ }
    if (s.last === day.n) return s.count;
    s.count = s.last === day.n - 1 ? s.count + 1 : 1;
    s.last = day.n;
    store.set('tmw.streak', JSON.stringify(s));
    return s.count;
  }
  function showStreak(day) {
    let s = null;
    try { s = JSON.parse(store.get('tmw.streak')); } catch { /* ignore */ }
    const count = s && (s.last === day.n || s.last === day.n - 1) ? s.count : 0;
    $('#streak').textContent = `${count} ${count === 1 ? 'day' : 'days'}`;
  }

  /* ---------------- Tracks & player ---------------- */

  const ICON_LOCK = '<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="4.5" y="10" width="15" height="11" rx="2"/></svg>';
  const fmt = (s) => {
    s = Math.max(0, Math.floor(isFinite(s) ? s : 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

  function renderTracks(content, key) {
    const tracks = content.tracks;
    const list = $('#tracklist');
    const player = $('#player');
    const ui = {
      num: $('#npNum'), title: $('#npTitle'), artist: $('#npArtist'),
      seek: $('#seek'), fill: $('#seekFill'), knob: $('#seekKnob'), tip: $('#seekTip'),
      cur: $('#tCur'), left: $('#tLeft'),
      play: $('#bPlay'), prev: $('#bPrev'), next: $('#bNext'), back: $('#bBack'), fwd: $('#bFwd'),
    };
    const audio = new Audio();
    audio.preload = 'auto';
    const urls = new Map();
    const loading = new Map();
    let cur = -1;
    let dragging = false;
    let raf = 0;

    const rows = tracks.map((t, i) => {
      const li = document.createElement('li');
      li.className = 'track locked';
      li.innerHTML = `
        <button class="row" type="button" disabled>
          <span class="r-num"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="eq"><i></i><i></i><i></i><i></i></span>${ICON_LOCK}</span>
          <span class="r-meta"><span class="r-title"></span><span class="r-artist"></span></span>
          <span class="r-dur"></span>
        </button>`;
      li.querySelector('.r-title').textContent = t.title;
      li.querySelector('.r-artist').textContent = t.note || '';
      li.querySelector('.r-dur').innerHTML = t.src ? (t.duration ? fmt(t.duration) : '') : '<span class="tag">Soon</span>';
      list.appendChild(li);
      return { li, btn: li.querySelector('.row') };
    });

    const playable = (i) => i >= 0 && i < tracks.length && !!tracks[i].src;
    const step = (from, dir) => { for (let i = from + dir; i >= 0 && i < tracks.length; i += dir) if (playable(i)) return i; return -1; };
    const duration = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (tracks[cur] && tracks[cur].duration) || 0);

    function load(i) {
      if (urls.has(i)) return Promise.resolve(urls.get(i));
      if (!loading.has(i)) {
        loading.set(i, fetchDecrypt(key, tracks[i].src).then((buf) => {
          const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
          urls.set(i, url);
          return url;
        }).finally(() => loading.delete(i)));
      }
      return loading.get(i);
    }

    /* --- painting --- */
    function paintProgress(t = audio.currentTime) {
      const d = duration();
      const r = d ? clamp(t / d) : 0;
      ui.fill.style.width = `${r * 100}%`;
      ui.knob.style.left = `${r * 100}%`;
      ui.cur.textContent = fmt(t);
      ui.left.textContent = `-${fmt(d - t)}`;
      ui.tip.textContent = fmt(t);
      ui.seek.setAttribute('aria-valuenow', String(Math.round(r * 100)));
      ui.seek.setAttribute('aria-valuetext', `${fmt(t)} of ${fmt(d)}`);
    }
    function paintState() {
      const playing = !audio.paused && !audio.ended;
      player.classList.toggle('is-playing', playing);
      document.body.classList.toggle('music-on', playing);
      ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      rows.forEach((r, i) => {
        r.btn.classList.toggle('active', i === cur);
        r.btn.classList.toggle('playing', i === cur && playing);
      });
      ui.prev.disabled = cur < 0;
      ui.next.disabled = step(cur, 1) < 0;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
    function paintMeta() {
      const t = tracks[cur];
      ui.num.textContent = String(cur + 1).padStart(2, '0');
      ui.title.textContent = t.title;
      ui.artist.textContent = t.note || '';
      if ('mediaSession' in navigator && window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.note || '', album: 'Today\'s songs' });
      }
    }
    function syncPosition() {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
      const d = duration();
      if (!d) return;
      try { navigator.mediaSession.setPositionState({ duration: d, position: clamp(audio.currentTime, 0, d), playbackRate: audio.playbackRate || 1 }); } catch { /* ignore */ }
    }
    function loop() {
      if (!dragging) paintProgress();
      raf = !audio.paused ? requestAnimationFrame(loop) : 0;
    }

    /* --- actions --- */
    function start(autoplay) {
      audio.src = urls.get(cur);
      paintProgress(0);
      if (autoplay) audio.play().catch(() => paintState());
    }
    function select(i, autoplay) {
      if (!playable(i)) return;
      if (i === cur && audio.src) {
        audio.currentTime = 0;
        if (autoplay) audio.play().catch(() => {});
        return;
      }
      audio.pause();
      cur = i;
      paintMeta();
      paintState();
      paintProgress(0);
      if (urls.has(i)) {
        start(autoplay); // synchronous, so mobile browsers keep the tap as permission to play
      } else {
        player.classList.add('busy');
        load(i).then(() => {
          player.classList.remove('busy');
          if (cur === i) start(autoplay);
        }).catch(() => {
          player.classList.remove('busy');
          ui.artist.textContent = 'Could not load this song. Try again.';
        });
      }
      const n = step(i, 1);
      if (n >= 0) load(n).catch(() => {});
    }
    function toggle() {
      if (cur < 0) return select(step(-1, 1), true);
      if (!audio.src) return;
      if (audio.paused) audio.play().catch(() => {}); else audio.pause();
    }
    function seekTo(t) {
      if (!audio.src) return;
      audio.currentTime = clamp(t, 0, duration());
      paintProgress();
      syncPosition();
    }
    function skip(sec, btn, cls) {
      seekTo(audio.currentTime + sec);
      btn.classList.remove(cls);
      void btn.offsetWidth;
      btn.classList.add(cls);
    }
    function prev() {
      if (audio.currentTime > 3 || step(cur, -1) < 0) return seekTo(0);
      select(step(cur, -1), !audio.paused);
    }
    function next() {
      const n = step(cur, 1);
      if (n >= 0) select(n, true);
    }

    /* --- events --- */
    ui.play.addEventListener('click', toggle);
    ui.prev.addEventListener('click', prev);
    ui.next.addEventListener('click', next);
    ui.back.addEventListener('click', () => skip(-10, ui.back, 'nudge-back'));
    ui.fwd.addEventListener('click', () => skip(10, ui.fwd, 'nudge-fwd'));
    rows.forEach((r, i) => r.btn.addEventListener('click', () => {
      if (i === cur) toggle(); else select(i, true);
    }));

    audio.addEventListener('play', () => { paintState(); if (!raf) loop(); syncPosition(); });
    audio.addEventListener('pause', paintState);
    audio.addEventListener('loadedmetadata', () => { paintProgress(); syncPosition(); });
    audio.addEventListener('ended', () => {
      const n = step(cur, 1);
      if (n >= 0) select(n, true);
      else { audio.currentTime = 0; paintProgress(0); paintState(); }
    });

    // Drag or tap anywhere on the bar to move through the song.
    const ratioAt = (e) => {
      const b = ui.seek.getBoundingClientRect();
      return clamp((e.clientX - b.left) / b.width);
    };
    ui.seek.addEventListener('pointerdown', (e) => {
      if (!audio.src) return;
      dragging = true;
      ui.seek.setPointerCapture(e.pointerId);
      ui.seek.classList.add('dragging');
      paintProgress(ratioAt(e) * duration());
    });
    ui.seek.addEventListener('pointermove', (e) => {
      if (dragging) paintProgress(ratioAt(e) * duration());
    });
    const endDrag = (e, commit) => {
      if (!dragging) return;
      dragging = false;
      ui.seek.classList.remove('dragging');
      if (commit) seekTo(ratioAt(e) * duration()); else paintProgress();
    };
    ui.seek.addEventListener('pointerup', (e) => endDrag(e, true));
    ui.seek.addEventListener('pointercancel', (e) => endDrag(e, false));
    ui.seek.addEventListener('keydown', (e) => {
      const map = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -10, PageUp: 10 };
      if (e.key in map) seekTo(audio.currentTime + map[e.key]);
      else if (e.key === 'Home') seekTo(0);
      else if (e.key === 'End') seekTo(duration() - 1);
      else if (e.key === ' ' || e.key === 'Enter') toggle();
      else return;
      e.preventDefault();
    });

    // Lock screen, headphones and car controls.
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const on = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported */ } };
      on('play', () => audio.play());
      on('pause', () => audio.pause());
      on('previoustrack', prev);
      on('nexttrack', next);
      on('seekbackward', (d) => seekTo(audio.currentTime - ((d && d.seekOffset) || 10)));
      on('seekforward', (d) => seekTo(audio.currentTime + ((d && d.seekOffset) || 10)));
      on('seekto', (d) => seekTo(d.seekTime));
    }

    return function unlock(animate) {
      $('#lockPill').classList.add('open');
      $('#lockText').textContent = 'Unlocked';
      $('#lockPill svg').innerHTML = '<path d="M7 10V7a5 5 0 0 1 9.6-2"/><rect x="4.5" y="10" width="15" height="11" rx="2"/>';
      const ready = tracks.some((t) => t.src);
      $('#trackHint').textContent = ready ? 'Enjoy. Come back tomorrow for a new question.' : 'Unlocked. The songs will appear here soon.';
      rows.forEach((r, i) => {
        r.li.classList.remove('locked');
        r.btn.disabled = !playable(i);
        if (animate) {
          r.li.style.animationDelay = `${0.3 + i * 0.1}s`;
          r.li.classList.add('unlock-pop');
        }
      });
      if (!ready) return;
      paintWaves(player);
      player.hidden = false;
      if (animate) player.classList.add('enter');
      select(step(-1, 1), false);
      tracks.forEach((t, i) => { if (t.src) load(i).catch(() => {}); });
    };
  }

  /* ---------------- Colleague cards ---------------- */

  function renderCards(messages, cardUrl, title = '') {
    messages = messages.map((m) => (typeof m === 'string' ? { from: '', message: m } : m));
    const deck = $('#deck');
    const n = messages.length;
    const pad = (v) => String(v).padStart(2, '0');
    const SLOTS = [
      'translate3d(0,0,0)',
      'translate3d(0,18px,0) scale(.94) rotate(-2.4deg)',
      'translate3d(0,34px,0) scale(.88) rotate(2.2deg)',
    ];
    const slot = (k) => SLOTS[Math.min(k, SLOTS.length - 1)];

    $('#cardsCount').textContent = `${n} cards`;
    $('#cardsBadge').textContent = n;
    $('#cOf').textContent = `/ ${pad(n)}`;
    const dots = $('#cDots');
    dots.innerHTML = '<i></i>'.repeat(n);

    const cards = messages.map((msg, i) => {
      const el = document.createElement('div');
      el.className = 'cc';
      el.innerHTML = `
        <div class="cc-face cc-front"><img alt="" draggable="false"></div>
        <div class="cc-face cc-back">
          <i class="cc-frame"></i>
          <i class="bar"></i>
          <h3 class="cc-title"></h3>
          <p class="cc-msg"></p>
          <i class="bar"></i>
          <div class="waves" data-waves="card"></div>
        </div>`;
      el.querySelector('img').src = cardUrl;
      el.querySelector('.cc-title').textContent = title;
      el.querySelector('.cc-msg').textContent = msg.message;
      if (msg.from) {
        const name = document.createElement('div');
        name.className = 'cc-name';
        name.innerHTML = '<em>from</em><b></b><i></i>';
        name.querySelector('b').textContent = msg.from;
        el.querySelector('.cc-front').appendChild(name);
        const sig = document.createElement('p');
        sig.className = 'cc-sig';
        sig.textContent = `— ${msg.from}`;
        el.querySelector('.cc-msg').after(sig);
        el.setAttribute('aria-label', `Card from ${msg.from}`);
      }
      deck.appendChild(el);
      return { el, i, flipped: false };
    });
    paintWaves(deck);

    let order = cards.slice();
    let busy = false;
    let drag = null;

    function setHeight() {
      deck.style.height = `${order[0].el.offsetHeight + 40}px`;
    }
    function layout() {
      order.forEach((c, k) => {
        c.el.style.zIndex = String(n - k);
        c.el.style.transform = slot(k);
        c.el.style.opacity = k < SLOTS.length ? '1' : '0';
        c.el.classList.toggle('top', k === 0);
        c.el.setAttribute('aria-hidden', k === 0 ? 'false' : 'true');
      });
      setHeight();
      $('#cIdx').textContent = pad(order[0].i + 1);
      const from = messages[order[0].i].from;
      $('#cFrom').textContent = from ? `from ${from}` : '';
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === order[0].i));
    }
    function fold(c) {
      if (!c.flipped) return;
      c.flipped = false;
      c.el.classList.remove('flipped');
    }

    // Flip in two halves; the card changes shape while it is edge-on, so the
    // back can unfold into a taller card that fits the whole message.
    async function flip() {
      if (busy) return;
      busy = true;
      const c = order[0];
      c.el.classList.add('no-trans');
      await c.el.animate([
        { transform: 'perspective(1400px) rotateY(0deg)' },
        { transform: 'perspective(1400px) rotateY(90deg) scale(1.04)' },
      ], { duration: 190, easing: 'cubic-bezier(.55,0,.8,.2)' }).finished;
      c.flipped = !c.flipped;
      c.el.classList.toggle('flipped', c.flipped);
      setHeight();
      await c.el.animate([
        { transform: 'perspective(1400px) rotateY(-90deg) scale(1.04)' },
        { transform: 'perspective(1400px) rotateY(4deg)', offset: 0.75 },
        { transform: 'perspective(1400px) rotateY(0deg)' },
      ], { duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished;
      c.el.classList.remove('no-trans');
      busy = false;
      const r = c.el.getBoundingClientRect();
      if (c.flipped && r.bottom > innerHeight - 90) {
        scrollBy({ top: Math.min(r.top - 20, r.bottom - innerHeight + 110), behavior: 'smooth' });
      }
    }

    // Send the top card off screen, then tuck it in at the back of the stack.
    function next(dir = -1) {
      if (busy || n < 2) return;
      busy = true;
      const c = order[0];
      const from = getComputedStyle(c.el).transform;
      c.el.classList.add('no-trans');
      order.push(order.shift());
      const anim = c.el.animate([
        { transform: from === 'none' ? slot(0) : from, opacity: 1 },
        { transform: `translate3d(${dir * innerWidth * 1.15}px, 60px, 0) rotate(${dir * 26}deg)`, opacity: 1 },
      ], { duration: 360, easing: 'cubic-bezier(.3,.5,.4,1)', fill: 'forwards' });
      layout();
      c.el.style.zIndex = String(n + 1);
      anim.finished.then(() => {
        fold(c);
        c.el.style.opacity = '0';
        c.el.style.zIndex = '0';
        anim.cancel();
        requestAnimationFrame(() => {
          c.el.classList.remove('no-trans');
          layout();
          busy = false;
        });
      });
    }
    function prev() {
      if (busy || n < 2) return;
      busy = true;
      fold(order[0]);
      const c = order.pop();
      order.unshift(c);
      c.el.classList.add('no-trans');
      layout();
      c.el.style.zIndex = String(n + 1);
      c.el.animate([
        { transform: `translate3d(${-innerWidth * 1.15}px, 60px, 0) rotate(-26deg)` },
        { transform: slot(0) },
      ], { duration: 480, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => {
        c.el.classList.remove('no-trans');
        layout();
        busy = false;
      });
    }

    /* --- touch & mouse --- */
    deck.addEventListener('pointerdown', (e) => {
      const c = order[0];
      if (busy || !c.el.contains(e.target) || e.button > 0) return;
      drag = { c, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, t: performance.now(), axis: null };
    });
    deck.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'x') {
          try { drag.c.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          drag.c.el.classList.add('dragging');
        }
      }
      if (drag.axis !== 'x') return;
      drag.dx = dx;
      drag.c.el.style.transform = `translate3d(${dx}px, ${Math.abs(dx) * 0.05}px, 0) rotate(${dx / 16}deg)`;
      const p = Math.min(1, Math.abs(dx) / 160);
      const second = order[1];
      if (second) {
        second.el.classList.add('no-trans');
        second.el.style.transform = `translate3d(0, ${18 - 18 * p}px, 0) scale(${0.94 + 0.06 * p}) rotate(${-2.4 + 2.4 * p}deg)`;
      }
    });
    const release = (e, cancelled) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      d.c.el.classList.remove('dragging');
      if (order[1]) order[1].el.classList.remove('no-trans');
      if (!d.axis) { if (!cancelled) flip(); return; }
      if (d.axis !== 'x') return;
      const v = d.dx / Math.max(1, performance.now() - d.t);
      if (!cancelled && (Math.abs(d.dx) > 90 || Math.abs(v) > 0.55)) next(Math.sign(d.dx) || -1);
      else layout();
    };
    deck.addEventListener('pointerup', (e) => release(e, false));
    deck.addEventListener('pointercancel', (e) => release(e, true));

    $('#cNext').addEventListener('click', () => next(-1));
    $('#cPrev').addEventListener('click', prev);
    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') next(-1);
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Enter' || e.key === ' ') flip();
      else return;
      e.preventDefault();
    });

    let shown = false;
    return function onShow() {
      if (shown) { setHeight(); return; }
      shown = true;
      // First visit: deal the cards into a stack, then nudge the top one.
      order.forEach((c, k) => {
        c.el.classList.add('no-trans');
        c.el.style.zIndex = String(n - k);
        c.el.style.opacity = '0';
        c.el.style.transform = 'translate3d(0,120px,0) scale(.85) rotate(-6deg)';
      });
      setHeight();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        order.slice().reverse().forEach((c, j) => {
          setTimeout(() => {
            c.el.classList.remove('no-trans');
            const k = order.indexOf(c);
            c.el.style.transform = slot(k);
            c.el.style.opacity = k < SLOTS.length ? '1' : '0';
          }, 90 * j);
        });
        setTimeout(() => {
          layout();
          if (reduceMotion) return;
          order[0].el.animate([
            { transform: slot(0) }, { transform: 'translate3d(-14px,0,0) rotate(-2deg)' },
            { transform: 'translate3d(10px,0,0) rotate(1.4deg)' }, { transform: slot(0) },
          ], { duration: 900, easing: 'ease-in-out' });
        }, 90 * n + 500);
      }));
    };
  }

  /* ---------------- Views ---------------- */

  function setupViews(onShowCards) {
    const tabs = [...document.querySelectorAll('.tab')];
    const views = { today: $('#viewToday'), cards: $('#viewCards') };
    let currentView = 'today';
    tabs.forEach((t) => t.addEventListener('click', () => {
      const name = t.dataset.view;
      if (name === currentView) return;
      currentView = name;
      tabs.forEach((x) => {
        const on = x === t;
        x.classList.toggle('active', on);
        if (on) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current');
      });
      Object.entries(views).forEach(([k, v]) => {
        v.hidden = k !== name;
        v.classList.remove('enter');
      });
      void views[name].offsetWidth;
      views[name].classList.add('enter');
      window.scrollTo({ top: 0 });
      if (name === 'cards') onShowCards();
    }));
  }
  function showTabbar(animate) {
    const bar = $('#tabbar');
    bar.hidden = false;
    if (animate) bar.classList.add('enter');
  }

  /* ---------------- Footer clock ---------------- */

  function startCountdown(day) {
    const el = $('#countdown');
    const tick = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const s = Math.max(0, Math.round((next - now) / 1000));
      if (today().n !== day.n) { location.reload(); return; }
      el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- Boot ---------------- */

  function showGate() {
    document.documentElement.classList.add('nokey');
    document.body.className = 'is-error';
    document.querySelectorAll('#intro, #app, .bg, link[rel=stylesheet][href*="fonts.googleapis"]').forEach((el) => el.remove());
    document.title = '404 Not Found';
    $('#gate').hidden = false;
  }

  async function boot() {
    ['tmw.debug', 'tmw.dbgOffset'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    paintWaves();
    const key = await getKey().catch(() => null);
    if (!key) return showGate();

    let content, cardUrl;
    const wishImg = fetchDecrypt(key, 'data/wish.bin').catch(() => null);
    try {
      const [c, img] = await Promise.all([fetchDecrypt(key, 'data/content.bin'), fetchDecrypt(key, 'data/card.bin')]);
      content = JSON.parse(new TextDecoder().decode(c));
      cardUrl = URL.createObjectURL(new Blob([img], { type: 'image/png' }));
    } catch {
      return showGate();
    }
    const wish = await wishImg;
    const wishUrl = wish ? URL.createObjectURL(new Blob([wish], { type: 'image/png' })) : cardUrl;

    document.title = 'Question of the day';
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230a1428'/%3E%3Crect x='18' y='20' width='28' height='3' fill='%23cf9a35'/%3E%3Crect x='18' y='41' width='28' height='3' fill='%23cf9a35'/%3E%3C/svg%3E";
    document.head.appendChild(icon);
    const day = today();
    $('#dateText').textContent = day.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#dayText').textContent = day.index >= 0 ? `Day ${day.index + 1}` : '';

    const unlock = renderTracks(content, key);
    const solved = renderQuiz(content, day, (fresh) => {
      if (fresh) updateStreak(day);
      showStreak(day);
      unlock(fresh);
    });
    showStreak(day);
    if (solved) unlock(false);
    startCountdown(day);
    const cards = content.cards || [];
    if (cards.length) setupViews(renderCards(cards, wishUrl, content.cardsTitle));

    const img = $('#cardImg');
    img.src = cardUrl;
    await Promise.all([
      img.decode().catch(() => {}),
      Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 1500))]),
    ]);

    if (reduceMotion || new URLSearchParams(location.search).has('nointro')) return showAppInstantly();
    try { await runIntro(); } catch { showAppInstantly(); }
  }

  boot();
})();
