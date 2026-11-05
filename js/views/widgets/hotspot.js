// Student widget for `hotspot` (V3-05): pick a label, then click / tap the image to place it.
// Keyboard: choose a label, then arrow keys move a crosshair over the image (step 0.02, Shift = 0.1) and Enter places it.
// Pins and the crosshair live in .q-hot__frame, a box exactly the size of the rendered image, so x / y fractions
// mean the same spot here and in the teacher's editor whatever the image size or the card width.
// Contract (see runner.js): returns { el, refresh(answer), focus() }. Answer = { labelId: { x, y } } (fractions 0-1).
import { h, openModal, prefersReducedMotion } from '../../ui.js';
import { safeImageUrl } from '../../lib/sections.js';

const STEP = 0.02;
const clamp = (n) => Math.min(1, Math.max(0, n));
const round3 = (n) => Math.round(n * 1000) / 1000;

export function hotspotWidget(q, api) {
  const labels = Array.isArray(q.labels) ? q.labels : [];
  const url = q.image && safeImageUrl(q.image.url);
  let selected = null;
  let cursor = { x: 0.5, y: 0.5 };
  let zoom = null; // { body, img, pins, chips, status } while the zoomed view is open
  let seeded = false;
  const lastPos = new Map();
  const chips = new Map();
  const pins = new Map();
  const get = () => (api.get(q.id) && typeof api.get(q.id) === 'object' && !Array.isArray(api.get(q.id)) ? api.get(q.id) : {});
  const status = h('p', { class: 'q-hint q-hot__status', 'aria-live': 'polite', dataset: { testid: 'hotspot-status' } }, 'Select a label to begin.');
  const cross = h('div', { class: 'q-hot__cross', 'aria-hidden': 'true', hidden: true });
  const removeBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', hidden: true, dataset: { testid: 'hotspot-remove' }, on: { click: () => remove() } }, 'Remove this placement');

  const place = (x, y) => {
    if (!selected) { status.textContent = 'Select a label first, then choose a spot on the image.'; return; }
    const next = { ...get(), [selected]: { x: round3(clamp(x)), y: round3(clamp(y)) } };
    api.set(q.id, next);
    const name = labels.find((l) => l.id === selected)?.text;
    status.textContent = `${name} placed. Select the label again to move it.`;
    select(null);
  };
  const remove = () => {
    if (!selected) return;
    const next = { ...get() };
    delete next[selected];
    api.set(q.id, Object.keys(next).length ? next : undefined);
    status.textContent = 'Placement removed.';
    select(selected);
  };
  function select(id) {
    selected = id;
    for (const [lid, b] of chips) { b.setAttribute('aria-pressed', String(lid === id)); b.classList.toggle('is-active', lid === id); }
    const placed = id ? get()[id] : null;
    if (id) {
      cursor = placed ? { x: placed.x, y: placed.y } : { x: 0.5, y: 0.5 };
      const name = labels.find((l) => l.id === id)?.text;
      status.textContent = `${name} selected. Click the image, or use the arrow keys and Enter.`;
    }
    cross.hidden = !id;
    removeBtn.hidden = !(id && placed);
    root.classList.toggle('has-selection', !!id);
    paintCursor();
    paintZoom();
  }
  function paintCursor() {
    cross.style.left = `${cursor.x * 100}%`;
    cross.style.top = `${cursor.y * 100}%`;
  }

  const isSmall = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  const pinPos = (pin, p) => { pin.style.left = `${Number(p.x) * 100}%`; pin.style.top = `${Number(p.y) * 100}%`; };
  const validPoint = (p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));

  /* Zoomed view (small screens): the same frame, bigger, with its own label chips; placing works here too. */
  function paintZoom() {
    if (!zoom) return;
    const a = get();
    labels.forEach((l) => {
      const p = a[l.id];
      const pin = zoom.pins.get(l.id);
      pin.hidden = !validPoint(p);
      if (validPoint(p)) pinPos(pin, p);
      const c = zoom.chips.get(l.id);
      c.setAttribute('aria-pressed', String(l.id === selected));
      c.classList.toggle('is-active', l.id === selected);
      c.classList.toggle('is-placed', validPoint(p));
    });
    zoom.status.textContent = status.textContent;
  }
  function openZoom() {
    if (zoom || !url) return;
    const zimg = h('img', { class: 'q-hot__img', src: url, alt: (q.image && q.image.alt) || '', draggable: 'false', referrerpolicy: 'no-referrer' });
    const zpins = new Map();
    const zchips = new Map();
    const zstatus = h('p', { class: 'q-hint q-hot__status', 'aria-live': 'polite', dataset: { testid: 'hotspot-zoom-status' } });
    labels.forEach((l, i) => {
      zpins.set(l.id, h('span', { class: 'q-hot__pin q-hot__pin--static', hidden: true }, String(i + 1)));
      zchips.set(l.id, h('button', { type: 'button', class: 'q-hot__chip', 'aria-pressed': 'false', dataset: { testid: `hotspot-zoom-label-${l.id}` },
        on: { click: () => select(selected === l.id ? null : l.id) } },
      h('span', { class: 'q-hot__num', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, l.text)));
    });
    const zstage = h('div', { class: 'q-hot__stage q-hot__stage--zoom', dataset: { testid: 'hotspot-zoom-stage' }, on: { click: (e) => {
      const r = zimg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (!selected) { status.textContent = 'Select a label first, then tap a spot on the image.'; paintZoom(); return; }
      place((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    } } }, h('div', { class: 'q-hot__frame' }, zimg, [...zpins.values()]));
    const body = h('div', { class: 'q-hot__zoom-body' },
      h('div', { class: 'q-hot__chips', role: 'group', 'aria-label': 'Labels' }, [...zchips.values()]), zstage, zstatus);
    zoom = { body, pins: zpins, chips: zchips, status: zstatus };
    paintZoom();
    openModal({ title: 'Zoomed picture', body, wide: true, testid: 'hotspot-zoom', onClose: () => { zoom = null; },
      actions: [{ label: 'Done', variant: 'primary', testid: 'hotspot-zoom-done' }] });
  }
  const zoomBtn = url ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm q-hot__zoom-btn', dataset: { testid: 'hotspot-zoom-open' }, on: { click: () => openZoom() } }, 'Zoom in') : null;

  const img = h('img', { class: 'q-hot__img', src: url || '', alt: (q.image && q.image.alt) || '', draggable: 'false', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  const stage = h('div', {
    class: 'q-hot__stage', tabindex: '0', role: 'group', dataset: { testid: 'hotspot-stage' },
    'aria-label': 'Image. Choose a label, then use the arrow keys to move the crosshair and press Enter to place it.',
    on: {
      click: (e) => {
        if (e.target.closest('.q-hot__pin')) return;
        const r = img.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (!selected) {
          if (isSmall()) { openZoom(); return; }
          status.textContent = 'Select a label first, then choose a spot on the image.'; return;
        }
        place((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      },
      keydown: (e) => {
        if (!selected) return;
        const s = e.shiftKey ? 0.1 : STEP;
        const move = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        if (move) { e.preventDefault(); cursor = { x: clamp(cursor.x + move[0]), y: clamp(cursor.y + move[1]) }; paintCursor(); status.textContent = `Crosshair at ${Math.round(cursor.x * 100)}% across, ${Math.round(cursor.y * 100)}% down.`; }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(cursor.x, cursor.y); }
        else if (e.key === 'Escape') { select(null); status.textContent = 'Selection cancelled.'; }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); }
      },
    },
  }, url ? h('div', { class: 'q-hot__frame' }, img, cross, labels.map((l, i) => {
    const pin = h('button', {
      type: 'button', class: 'q-hot__pin', hidden: true, 'aria-label': `${l.text} (placed). Select to move.`, dataset: { testid: `hotspot-pin-${l.id}` },
      on: { click: (e) => { e.stopPropagation(); select(l.id); chips.get(l.id)?.focus(); } },
    }, String(i + 1));
    pins.set(l.id, pin);
    return pin;
  })) : h('p', { class: 'muted' }, 'No image set for this question.'));

  labels.forEach((l, i) => {
    chips.set(l.id, h('button', {
      type: 'button', class: 'q-hot__chip', 'aria-pressed': 'false', dataset: { testid: `hotspot-label-${l.id}` },
      on: { click: () => { select(selected === l.id ? null : l.id); if (selected) stage.focus({ preventScroll: true }); } },
    }, h('span', { class: 'q-hot__num', 'aria-hidden': 'true' }, String(i + 1)), h('span', {}, l.text), h('span', { class: 'q-hot__done sr-only' }, '')));
  });

  const root = h('div', { class: 'q-hotspot' },
      h('p', { class: 'q-hint' }, 'Select a label, then click or tap where it belongs on the image.'),
      h('div', { class: 'q-hot__chips', role: 'group', 'aria-label': 'Labels' }, [...chips.values()]),
      stage, zoomBtn, removeBtn, status);

  return {
    el: root,
    refresh(answer) {
      const a = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
      labels.forEach((l) => {
        const p = a[l.id];
        const pin = pins.get(l.id);
        const ok = p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
        pin.hidden = !ok;
        if (ok) {
          pinPos(pin, p);
          const k = `${p.x},${p.y}`;
          if (seeded && lastPos.get(l.id) !== k && !prefersReducedMotion()) {
            pin.classList.remove('is-snap');
            void pin.offsetWidth; // restart the animation when a pin is moved
            pin.classList.add('is-snap');
            pin.addEventListener('animationend', () => pin.classList.remove('is-snap'), { once: true });
          }
          lastPos.set(l.id, k);
        } else lastPos.delete(l.id);
        const chip = chips.get(l.id);
        chip.classList.toggle('is-placed', !!ok);
        chip.querySelector('.q-hot__done').textContent = ok ? ' (placed)' : '';
      });
      seeded = true;
      if (selected) removeBtn.hidden = !a[selected];
      paintZoom();
    },
    focus: () => chips.values().next().value?.focus(),
  };
}
