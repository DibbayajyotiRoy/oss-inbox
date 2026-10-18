const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const f2 = (v) => (v / 100).toFixed(2);

// Copy buttons.
$$('[data-cp]').forEach((b) => b.addEventListener('click', async () => {
  const l = b.lastElementChild;
  try { await navigator.clipboard.writeText(b.closest('.code').querySelector('pre').textContent); l.textContent = 'Copied'; } catch { l.textContent = 'Select and copy'; }
  setTimeout(() => (l.textContent = 'Copy'), 1600);
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
const shut = () => { nav.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); mb.textContent = 'Menu'; };
mb.addEventListener('click', () => { const on = nav.classList.toggle('open'); mb.setAttribute('aria-expanded', on); mb.textContent = on ? 'Close' : 'Menu'; });
nav.addEventListener('click', (e) => e.target.closest('a') && shut());
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { shut(); mb.focus(); } });
document.addEventListener('pointerdown', (e) => nav.classList.contains('open') && !e.target.closest('.hd') && shut());

// Nav: the section in view is marked, and one amber needle settles onto the marked or hovered link.
const links = $$('.hd nav li:not(.mcta) a[href^="#"]'), nn = $('.nn');
let fresh = true;
const place = (a) => {
  if (!a) return nn.style.setProperty('--o', 0);
  const pad = parseFloat(getComputedStyle(a).paddingLeft);
  if (fresh) nn.style.transition = 'none'; // the first placement appears in place instead of swinging in from the left
  nn.style.setProperty('--x', a.offsetLeft + pad + 'px');
  nn.style.setProperty('--w', a.offsetWidth - 2 * pad);
  nn.style.setProperty('--o', 1);
  if (fresh) { nn.offsetWidth; nn.style.transition = ''; fresh = false; }
};
const home = () => place($('.hd nav [aria-current]'));
nav.addEventListener('pointerover', (e) => { const a = e.target.closest('li:not(.mcta) a'); a && place(a); });
nav.addEventListener('focusin', (e) => { const a = e.target.closest('li:not(.mcta) a'); a && place(a); });
nav.addEventListener('pointerleave', home);
nav.addEventListener('focusout', home);
addEventListener('resize', home);
const spy = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  links.forEach((a) => (a.hash === '#' + e.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  home();
}), { rootMargin: '-40% 0px -55% 0px' });
$$('main > section[id]').forEach((s) => spy.observe(s));

// ---- The instrument: 240 seeded sample decisions from a calibrated model (P(right) = confidence). ----
// One driver, the needle position x (50..100), feeds the dots, the counts, the pill and the zone,
// so every part of the instrument always agrees. It follows a damped spring ("settle like a needle").
const N = 240;
const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(13);
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.SQRT1_2; };
const items = Array.from({ length: N }, () => {
  const c = Math.min(0.995, Math.max(0.5, rnd() < 0.5 ? 0.985 - Math.abs(gauss()) * 0.05 : 0.5 + 0.5 * rnd() ** 0.9));
  return { p: Math.floor(c * 100), ok: rnd() < c };
});
const tab = Array.from({ length: 51 }, (_, i) => { // [acted, wrong] for every threshold 50..100
  const v = 50 + i; let A = 0, W = 0;
  items.forEach((it) => it.p >= v && (A++, it.ok || W++));
  return [A, W];
});
const peak = Math.max(...items.reduce((h, it) => (h[it.p - 50]++, h), Array(50).fill(0)));

const inst = $('#threshold'), plot = $('#plot'), rail = $('#rail'), thr = $('#thr'), svg = $('#dots'), pre = $$('.pre button');
const dots = items.map(() => svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle')));

function layout() { // one column per 0.01 of confidence, so the needle always sits on a column edge
  const w = svg.clientWidth, H = svg.clientHeight, cw = w / 50, stack = Array(50).fill(0);
  let per = 1;
  while (per < 4 && Math.ceil(peak / per) * (cw / per) > H) per++; // widen the columns' dot lanes until the tallest fits
  const pitch = cw / per, r = Math.min(pitch / 2 - 1, 5.5);
  items.forEach((it, i) => {
    const k = it.p - 50, n = stack[k]++, c = dots[i];
    c.setAttribute('r', r);
    c.setAttribute('cx', k * cw + (cw * ((n % per) + 0.5)) / per);
    c.setAttribute('cy', H - r - 2 - Math.floor(n / per) * pitch);
    c.style.setProperty('--d', k * 9 + n * 5);
  });
}

let shown = -1;
function paint(v) { // what the visitor sees at threshold v: dot states, rolling counts, pill
  v = Math.max(50, Math.min(100, v));
  if (v === shown) return;
  shown = v;
  items.forEach((it, i) => {
    const on = it.p >= v, cls = on ? (it.ok ? 'a' : 'w') : 'q', c = dots[i], was = c.getAttribute('class');
    if (was === cls) return;
    if (was && !still) c.animate({ transform: ['scale(1)', 'scale(1.7)', 'scale(1)'] }, { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    c.setAttribute('class', cls);
  });
  const [A, W] = tab[v - 50], Q = N - A;
  [['nA', A], ['nQ', Q], ['nW', W]].forEach(([id, n]) => $('#' + id).style.setProperty('--n', n));
  $('#sA').textContent = `${Math.round((A / N) * 100)}% of ${N}`;
  $('#sQ').textContent = `${Math.round((Q / N) * 100)}% of ${N}`;
  $('#sW').textContent = A ? `${((W / A) * 100).toFixed(1)}% of acted` : 'nothing acted on';
  $('#pill').textContent = f2(v);
  plot.dataset.e = (v < 57 ? 'l ' : '') + (v > 93 ? 'r' : '');
}

function speak(v) { // what is said and remembered once the choice is made (not on every frame of the needle's travel)
  const [A, W] = tab[v - 50], Q = N - A, t = f2(v);
  const tail = Q ? `The other ${Q} wait in your queue.` : 'Nothing waits in your queue.';
  $('#rd').textContent = A ? `At ${t} it acts on ${A} of ${N} decisions and is ${W ? `wrong on ${W} of those` : 'wrong on none of those'}. ${tail}` : `At ${t} nothing clears the bar, so all ${N} decisions wait in your queue.`;
  thr.setAttribute('aria-valuenow', v);
  thr.setAttribute('aria-valuetext', `${t}: acts on ${A} of ${N}, ${W} would be wrong, ${Q} queued`);
  pre.forEach((b) => b.setAttribute('aria-pressed', +b.dataset.v === v));
  document.documentElement.style.setProperty('--thr', (v - 50) / 50); // the closing ruler remembers it
  $$('.ruler .thr').forEach((e) => (e.firstChild.textContent = t));
}

let x = 90, target = 90, cur = 90, vel = 0, live = 0, grab = false, seen = true, raf = 0, last = 0;
function render(b) {
  rail.style.setProperty('--f', (x - 50) / 50);
  rail.style.setProperty('--b', b / 50);
  paint(Math.round(x));
}
function frame(now, dt) {
  const k = grab ? 900 : 174, c = grab ? 54 : 17.4; // stiff while dragging, a gentle spring otherwise
  for (let i = 0; i < 2; i++) { vel += (-k * (x - target) - c * vel) * dt / 2; x += (vel * dt) / 2; }
  const rest = Math.abs(x - target) < 0.005 && Math.abs(vel) < 0.02;
  if (rest) { x = target; vel = 0; }
  live += ((grab || !rest ? 0 : 1) - live) * Math.min(1, dt * 1.5); // idle: once it settles, the needle breathes within +-0.003
  render(Math.sin(now * 1.1) * 0.3 * live);
  return !rest || (seen && !document.hidden);
}
const loop = (ms) => { raf = 0; const dt = Math.min(0.05, (ms - last) / 1000); last = ms; if (frame(ms / 1000, dt)) raf = requestAnimationFrame(loop); };
const wake = () => { if (!raf && !still) { last = performance.now(); raf = requestAnimationFrame(loop); } };
const go = (v) => { // a choice made by keys, presets, taps or the pointer
  target = cur = Math.max(50, Math.min(100, v));
  v = target;
  speak(v);
  if (still) { x = v; render(0); } else wake();
};

pre.forEach((b) => b.addEventListener('click', () => go(+b.dataset.v)));
thr.addEventListener('keydown', (e) => { // the needle is an ARIA slider: arrows step, page keys jump, Home and End go to the ends
  const k = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
  if (k) go(cur + k); else if (e.key === 'Home') go(50); else if (e.key === 'End') go(100); else return;
  e.preventDefault();
});
// The pill is the focusable slider (keys, screen readers); the plot itself takes the pointer.
const at = (e) => { const r = plot.getBoundingClientRect(); return Math.round(50 + Math.max(0, Math.min(1, (e.clientX - r.left - 14) / (r.width - 28))) * 50); };
const pick = (e) => { const v = at(e); if (v !== cur) go(v); };
const drop = () => { grab = false; inst.classList.remove('grab'); };
plot.addEventListener('pointerdown', (e) => {
  if (e.button) return;
  grab = true; inst.classList.add('grab'); plot.setPointerCapture(e.pointerId); thr.focus({ preventScroll: true });
  pick(e); wake();
});
plot.addEventListener('pointermove', (e) => grab && pick(e));
['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => plot.addEventListener(n, drop));
new IntersectionObserver((es) => { seen = es[0].isIntersecting; seen && wake(); }).observe(inst);
document.addEventListener('visibilitychange', wake);
new ResizeObserver(layout).observe(svg);

// First frame: the dots fall in with the needle parked at 1.00 (nothing acts), then it settles on 0.90.
if (still) { x = 90; render(0); speak(90); plot.classList.add('in'); }
else {
  x = 100; render(0);
  requestAnimationFrame(() => {
    plot.classList.add('in');
    setTimeout(() => go(90), 750);
  });
}

// ---- How it works: the four steps drive the specimen's state (on wide screens it is a sticky stage). ----
const spec = $('#spec'), steps = $$('.stp li');
if (!still) {
  const upd = () => { // the active step is the last one whose top has reached the 40% line, so jumps and fast scrolls never leave a stale state
    let n = 0;
    steps.forEach((s, i) => s.getBoundingClientRect().top <= innerHeight * 0.4 && (n = i));
    spec.dataset.s = n + 1;
    steps.forEach((s, i) => s.classList.toggle('on', i === n));
  };
  upd();
  const io = new IntersectionObserver(upd, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
  [spec, ...steps].forEach((e) => io.observe(e));
}

// ---- Closing ruler: the needle settles on the chosen threshold when it scrolls into view. ----
const ruler = $('.ruler');
if (still) ruler.classList.add('in');
else new IntersectionObserver((es, io) => es[0].isIntersecting && (io.disconnect(), ruler.classList.add('in')), { threshold: 0.6 }).observe(ruler);

// ---- Register: each feature's default-mode needle settles into place when the list scrolls into view. ----
const reg = $('.reg');
if (still) reg.classList.add('in');
else new IntersectionObserver((es, io) => es[0].isIntersecting && (io.disconnect(), reg.classList.add('in')), { threshold: 0.35 }).observe(reg);

// ---- Register: a dial is a real control. Selecting it cycles the feature's mode and the needle settles on it. ----
const MODES = ['off', 'shadow', 'auto'];
const SAY = ['The feature does not run.', 'It records each decision and queues the item with suggested answers. Nothing is written to GitHub.', 'It acts on decisions at or above the threshold, on questions measured against your history, and queues the rest.'];
$$('.reg .dial').forEach((d) => d.addEventListener('click', () => {
  const m = (+d.style.getPropertyValue('--m') + 1) % 3, name = d.closest('div').querySelector('.mono').textContent;
  d.style.setProperty('--m', m);
  const md = d.nextElementSibling;
  md.textContent = MODES[m]; md.dataset.n = MODES[(m + 1) % 3];
  d.setAttribute('aria-label', `${name} mode, currently ${MODES[m]}. Select to try another.`);
  $('#regs').textContent = `${name} is set to ${MODES[m]}. ${SAY[m]}`;
}));

// ---- A compact CTA joins the header once the hero has scrolled away. ----
new IntersectionObserver((es) => document.documentElement.classList.toggle('past', !es[0].isIntersecting)).observe($('#top'));
