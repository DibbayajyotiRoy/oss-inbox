const $ = (s, r = document) => r.querySelector(s);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Copy buttons.
document.querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.closest('.code').querySelector('pre').textContent); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
  setTimeout(() => (b.textContent = 'Copy'), 1600);
}));

// In-page links scroll smoothly (a click-time switch, so scripted and keyboard jumps stay instant).
document.addEventListener('click', (e) => {
  if (still || !e.target.closest('a[href^="#"]')) return;
  const s = document.documentElement.style;
  s.scrollBehavior = 'smooth';
  setTimeout(() => (s.scrollBehavior = ''), 1200);
});

// Phone menu.
const nav = $('.hd nav'), mb = $('.mbtn');
const shut = () => { nav.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); };
mb.addEventListener('click', () => mb.setAttribute('aria-expanded', nav.classList.toggle('open')));
nav.addEventListener('click', (e) => e.target.closest('a') && shut());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { shut(); mb.focus(); } });

// Current section in the nav (sections without a link clear it).
const links = [...document.querySelectorAll('.hd nav a[href^="#"]')];
const spy = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && links.forEach((a) => {
  if (a.hash === '#' + e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
})), { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('main > section[id]').forEach((s) => spy.observe(s));

// Threshold demo: 240 seeded sample decisions from a calibrated model (P(right) = confidence).
const N = 240;
const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(13);
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.SQRT1_2; };
const items = Array.from({ length: N }, () => {
  const c = Math.min(0.995, Math.max(0.5, rnd() < 0.5 ? 0.985 - Math.abs(gauss()) * 0.05 : 0.5 + 0.5 * rnd() ** 0.9));
  return { p: Math.floor(c * 100), ok: rnd() < c };
});

const plot = $('#plot'), thr = $('#thr'), svg = $('#dots'), pre = [...document.querySelectorAll('.pre button')];
const dots = items.map(() => svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle')));
const f2 = (v) => (v / 100).toFixed(2);

function layout() { // one column per 0.01 of confidence, so the tick always sits on a column edge
  const w = svg.clientWidth, h = svg.clientHeight, cw = w / 50, per = cw >= 17 ? 2 : 1, r = Math.min(cw / (2 * per) - 1.3, 4.5), stack = Array(50).fill(0);
  items.forEach((it, i) => {
    const k = it.p - 50, n = stack[k]++, c = dots[i];
    c.setAttribute('r', r);
    c.setAttribute('cx', k * cw + (cw * ((n % per) + 0.5)) / per);
    c.setAttribute('cy', h - r - 2 - Math.floor(n / per) * (cw / per));
    c.style.setProperty('--d', k * 14 + n * 6);
  });
}

function update(v) {
  let A = 0, W = 0;
  items.forEach((it, i) => {
    const on = it.p >= v;
    if (on) { A++; if (!it.ok) W++; }
    const cls = on ? (it.ok ? 'a' : 'w') : 'q', c = dots[i];
    if (!still && c.getAttribute('class') && c.getAttribute('class') !== cls) c.animate({ transform: ['scale(1)', 'scale(1.6)', 'scale(1)'] }, { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    c.setAttribute('class', cls);
  });
  const Q = N - A, t = f2(v);
  plot.style.setProperty('--f', (v - 50) / 50);
  plot.dataset.e = (v < 57 ? 'l ' : '') + (v > 93 ? 'r' : '');
  $('#pill').textContent = t;
  [['nA', A], ['nQ', Q], ['nW', W]].forEach(([id, n]) => $('#' + id).style.setProperty('--n', n));
  $('#sA').textContent = `${Math.round((A / N) * 100)}% of ${N}`;
  $('#sQ').textContent = `${Math.round((Q / N) * 100)}% of ${N}`;
  $('#sW').textContent = A ? `${((W / A) * 100).toFixed(1)}% of acted` : 'nothing acted on';
  const tail = Q ? `The other ${Q} wait in your queue.` : 'Nothing waits in your queue.';
  $('#rd').textContent = A ? `At ${t} it acts on ${A} of ${N} decisions and is ${W ? `wrong on ${W} of those` : 'wrong on none of those'}. ${tail}` : `At ${t} nothing clears the bar, so all ${N} decisions wait in your queue.`;
  thr.setAttribute('aria-valuetext', `${t}: acts on ${A} of ${N}, ${W} would be wrong, ${Q} queued`);
  pre.forEach((b) => b.setAttribute('aria-pressed', +b.dataset.v === v));
}

let touched = false;
const go = (v) => { thr.value = v; update(+v); };
// One driver: the chosen threshold also moves the page's rulers, so they remember it when you scroll back.
const ruled = (v) => {
  document.documentElement.style.setProperty('--thr', (v - 50) / 50);
  document.querySelectorAll('.ruler .thr').forEach((e) => (e.firstChild.textContent = f2(v)));
};
thr.addEventListener('input', () => { update(+thr.value); ruled(+thr.value); });
pre.forEach((b) => b.addEventListener('click', () => { go(b.dataset.v); ruled(+b.dataset.v); }));
['pointerdown', 'keydown', 'focusin'].forEach((e) => $('#inst').addEventListener(e, () => (touched = true)));

new ResizeObserver(layout).observe(svg);
// Start with nothing acting, then settle on 0.90 when the demo scrolls into view.
still ? update(+thr.value) : go(100);

new IntersectionObserver((es, io) => {
  if (!es[0].isIntersecting) return;
  io.disconnect();
  plot.classList.add('in');
  if (still) return;
  let t0;
  setTimeout(() => requestAnimationFrame(function step(now) {
    if (touched) return;
    t0 ??= now;
    const k = Math.min(1, (now - t0) / 1800), v = Math.round(100 - 10 * (1 - (1 - k) ** 4));
    if (v !== +thr.value) go(v);
    if (k < 1) requestAnimationFrame(step);
  }), 800);
}, { threshold: 0.35 }).observe($('#inst'));

// The closing ruler settles its needle on 0.90 when it scrolls into view.
new IntersectionObserver((es, io) => es[0].isIntersecting && (io.disconnect(), es[0].target.classList.add('in')), { threshold: 0.6 }).observe($('.ruler.late'));

// The hero card scores a second sample decision now and then, so it keeps working at rest.
const D = [
  { id: '#1234', t: 'Crash on startup when config has a trailing comma', rows: [['issue.type', 'bug', 0.94, 0.9], ['issue.has_repro', 'no', 0.74, 0.8], ['issue.has_version', 'no', 0.91, 0.8]] },
  { id: '#1241', t: 'Add retry with backoff to the webhook client', rows: [['pr.follows_rules', 'yes', 0.96, 0.9], ['pr.breaking', 'no', 0.83, 0.9], ['route.area', 'api', 0.88, 0.8]] },
];
const pz = $('.pz');
if (still) pz.remove();
else {
  let i = 0, held = false, seen = true;
  const card = $('.dec'), rows = [...card.querySelectorAll('.qs li')];
  const show = (d) => {
    card.querySelectorAll('.fill, .tk, .q, .s, .dec-t').forEach((e) => { e.style.animation = 'none'; e.offsetWidth; e.style.animation = ''; }); // replay the entrance
    $('#d-id').textContent = d.id;
    $('#d-t').textContent = d.t;
    rows.forEach((li, n) => {
      const [k, a, c, t] = d.rows[n], m = $('.meter', li), ok = c >= t;
      $('.k', li).textContent = k; $('.a', li).textContent = a; $('.v', li).textContent = c.toFixed(2);
      m.style.setProperty('--v', (c - 0.5) / 0.5); m.style.setProperty('--t', (t - 0.5) / 0.5);
      m.classList.toggle('lo', !ok);
      m.setAttribute('aria-label', `Confidence ${c.toFixed(2)} against a threshold of ${t.toFixed(2)}`);
      const s = $('.s', li); s.classList.toggle('ok', ok);
      s.textContent = `Threshold ${t.toFixed(2)}. ${ok ? 'Clears it.' : 'Waits for you.'}`;
    });
  };
  pz.addEventListener('click', () => { held = !held; pz.textContent = held ? 'Play' : 'Pause'; });
  new IntersectionObserver((es) => (seen = es[0].isIntersecting)).observe(card);
  const next = () => { if (!held && seen && !document.hidden && !card.matches(':hover, :focus-within')) show(D[(i = (i + 1) % D.length)]); };
  setTimeout(next, 4500);
  setInterval(next, 8000);
}
