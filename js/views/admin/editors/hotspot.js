// Builder editor for `hotspot` ("Label the diagram"). The picture is q.image: a link (https, Google Drive / Dropbox share
// links are converted), a path on this site, or a picture uploaded / pasted / dropped here (compressed into the test).
// The teacher adds labels, selects one and clicks the picture to place it; pins can be dragged, or nudged with the
// arrow keys (1%, Shift = 5%). The answer circle shows the accepted distance (the same oval the grader uses).
// Exact positions are available as percentages under "Exact positions". JSON keeps x / y / radius as 0-1 fractions.
import { h, icon } from '../../../ui.js';
import { safeImageUrl } from '../../../lib/sections.js';
import { compressImageFile, isDataImage } from '../../../lib/image-upload.js';
import { switchEl, iconButton } from '../common.js';
import { DEFAULT_RADIUS } from '../../../lib/qtypes/hotspot.js';

const clamp = (n) => Math.min(1, Math.max(0, n));
const r3 = (n) => Math.round(n * 1000) / 1000;
const placed = (l) => Number.isFinite(Number(l.x)) && Number.isFinite(Number(l.y)) && l.x !== null && l.y !== null && l.x !== '' && l.y !== '';
const pct = (n) => (Number.isFinite(Number(n)) ? String(Math.round(Number(n) * 1000) / 10) : '');
const SIZES = [['Small', 0.04], ['Medium', 0.06], ['Large', 0.1]];

export function hotspotEditor(q, redraw, changed) {
  q.labels = Array.isArray(q.labels) ? q.labels : [];
  // The selected label survives redraws. Kept as a non-enumerable property so it never reaches the saved JSON.
  if (!Object.prototype.hasOwnProperty.call(q, '_hotSel')) Object.defineProperty(q, '_hotSel', { value: q.labels.length ? 0 : -1, writable: true, enumerable: false });
  let sel = Math.min(q._hotSel, q.labels.length - 1);
  const setSel = (i) => { sel = i; q._hotSel = i; };
  const url = q.image && safeImageUrl(q.image.url);
  const radius = () => (Number(q.radius) > 0 ? Number(q.radius) : DEFAULT_RADIUS);

  const status = h('p', { class: 'field__hint adm-hot__status', 'aria-live': 'polite' });
  const say = (t) => { status.textContent = t; };
  const name = (i) => (q.labels[i]?.text || '').trim() || `Label ${i + 1}`;

  // ---------- stage: pins sit in .q-hot__frame, exactly the rendered image's box (same as the student widget) ----------
  const img = url ? h('img', { class: 'q-hot__img', src: url, alt: (q.image && q.image.alt) || '', draggable: 'false', referrerpolicy: 'no-referrer' }) : null;
  const layer = h('div', { class: 'q-hot__pins adm-hot__layer' });
  const pinEls = [];
  const ringEls = [];
  const paint = (i) => {
    const l = q.labels[i];
    const pin = pinEls[i];
    const ring = ringEls[i];
    if (!pin) return;
    const ok = placed(l);
    pin.hidden = !ok; ring.hidden = !ok;
    if (!ok) return;
    const r = radius();
    pin.style.left = ring.style.left = `${Number(l.x) * 100}%`;
    pin.style.top = ring.style.top = `${Number(l.y) * 100}%`;
    // Hit area: distance in fractions of width and height, so the circle is 2r of each dimension (an oval on non-square images).
    ring.style.width = `${r * 200}%`;
    ring.style.height = `${r * 200}%`;
  };
  const paintAll = () => q.labels.forEach((_, i) => paint(i));

  const pointFrom = (e) => {
    const rect = (img || stage).getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: r3(clamp((e.clientX - rect.left) / rect.width)), y: r3(clamp((e.clientY - rect.top) / rect.height)) };
  };
  const nextUnplaced = (from) => {
    for (let k = 1; k <= q.labels.length; k++) { const j = (from + k) % q.labels.length; if (!placed(q.labels[j])) return j; }
    return from;
  };
  const placeAt = (i, p, { advance = false } = {}) => {
    const l = q.labels[i];
    if (!l || !p) return;
    l.x = p.x; l.y = p.y;
    changed();
    say(`${name(i)} placed at ${Math.round(p.x * 100)}% across, ${Math.round(p.y * 100)}% down.`);
    if (advance) { setSel(nextUnplaced(i)); redraw(); } else { paint(i); syncRows(); }
  };

  q.labels.forEach((l, i) => {
    const ring = h('span', { class: ['adm-hot__ring', i === sel ? 'is-selected' : ''], 'aria-hidden': 'true', hidden: true });
    let drag = null;
    const pin = h('button', {
      type: 'button', class: ['q-hot__pin adm-hot__pin', i === sel ? 'is-selected' : ''], hidden: true,
      'aria-label': `${name(i)}: pin ${i + 1}. Arrow keys move it.`, 'aria-pressed': String(i === sel), dataset: { testid: `hot-pin-${i}` },
      on: {
        click: (e) => { e.stopPropagation(); if (drag && drag.moved) return; if (sel !== i) { setSel(i); redraw(); } },
        pointerdown: (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          drag = { id: e.pointerId, moved: false };
          pin.setPointerCapture(e.pointerId);
          pin.classList.add('is-dragging');
        },
        pointermove: (e) => {
          if (!drag || drag.id !== e.pointerId) return;
          const p = pointFrom(e);
          if (!p) return;
          drag.moved = true;
          l.x = p.x; l.y = p.y;
          paint(i);
        },
        pointerup: (e) => {
          if (!drag || drag.id !== e.pointerId) return;
          pin.classList.remove('is-dragging');
          const moved = drag.moved;
          setTimeout(() => { drag = null; }, 0);
          if (moved) { changed(); syncRows(); say(`${name(i)} moved to ${Math.round(l.x * 100)}% across, ${Math.round(l.y * 100)}% down.`); if (sel !== i) { setSel(i); redraw(); } }
        },
        pointercancel: () => { drag = null; pin.classList.remove('is-dragging'); },
        keydown: (e) => {
          const s = e.shiftKey ? 0.05 : 0.01;
          const mv = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
          if (!mv) return;
          e.preventDefault();
          l.x = r3(clamp(Number(l.x) + mv[0])); l.y = r3(clamp(Number(l.y) + mv[1]));
          paint(i); changed(); syncRows();
          say(`${name(i)} at ${Math.round(l.x * 100)}% across, ${Math.round(l.y * 100)}% down.`);
        },
      },
    }, String(i + 1));
    pinEls.push(pin); ringEls.push(ring);
    layer.append(ring, pin);
  });

  const stage = h('div', {
    class: ['q-hot__stage q-hot__stage--edit', url ? '' : 'is-empty'], dataset: { testid: 'hotspot-preview' },
    on: { click: (e) => {
      if (!url || e.target.closest('.adm-hot__pin')) return;
      if (sel < 0 || !q.labels[sel]) { say('Add a label first, then click the picture to place it.'); return; }
      placeAt(sel, pointFrom(e), { advance: true });
    } },
  }, img ? h('div', { class: 'q-hot__frame' }, img, layer) : h('div', { class: 'adm-hot__empty' }, icon('flask', { size: 28 }),
    h('p', {}, h('strong', {}, 'Add the diagram first.')),
    h('p', { class: 'muted' }, 'Upload, paste or drop any picture here, or paste a link above. Then click the picture to place each label.'),
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', on: { click: (e) => { e.stopPropagation(); fileIn.click(); } } }, icon('upload', { size: 16 }), 'Upload picture')));
  if (img) {
    img.addEventListener('load', paintAll);
    img.addEventListener('error', () => {
      stage.classList.add('is-broken');
      say(/drive\.google\.com/.test(url) ? 'This Google Drive picture didn’t load. In Drive, set sharing to “Anyone with the link”, or upload the picture instead.'
        : 'This picture didn’t load. Check the link, or upload the picture instead.');
    });
  }
  // Drop a picture file onto the stage to use it.
  stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file')) { e.preventDefault(); stage.classList.add('is-drop'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'));
  stage.addEventListener('drop', (e) => {
    stage.classList.remove('is-drop');
    const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); upload(f); }
  });

  // ---------- picture: link, upload, paste or drop ----------
  const setImage = (u) => {
    if (u) q.image = { ...(q.image || {}), url: u, alt: q.image?.alt || '' };
    else delete q.image;
    changed();
  };
  async function upload(file) {
    say('Preparing the picture…');
    try {
      const res = await compressImageFile(file);
      setImage(res.url);
      if (!q.image.alt) q.image.alt = (file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
      changed();
      redraw();
    } catch (err) { say(err.message || 'Could not use that picture.'); }
  }
  const uploaded = isDataImage(q.image?.url);
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, dataset: { testid: 'hot-image-file' },
    on: { change: () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) upload(f); } } });
  const urlIn = h('input', { class: 'input', type: 'text', autocomplete: 'off', spellcheck: 'false', value: uploaded ? '' : (q.image?.url || ''),
    placeholder: uploaded ? 'Using an uploaded picture. Paste a link to replace it.' : 'https://…, a Google Drive or Dropbox share link, or images/diagram.png',
    'aria-label': 'Picture link', dataset: { testid: 'hot-image-url' },
    on: {
      input: () => { if (urlIn.value.trim() || !uploaded) setImage(urlIn.value.trim()); },
      change: () => redraw(),
      paste: (e) => {
        const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
        if (f) { e.preventDefault(); upload(f); } else setTimeout(() => redraw(), 0);
      },
    } });
  const altIn = h('input', { class: 'input', type: 'text', value: q.image?.alt || '', placeholder: 'e.g. Lab bench with a beaker, a flask and a burner',
    'aria-label': 'Picture description', dataset: { testid: 'hot-image-alt' },
    on: { input: () => { if (q.image) { q.image.alt = altIn.value; changed(); } } } });
  const picture = h('div', { class: 'adm-hot__picture' },
    h('div', { class: 'adm-hot__pictop' },
      h('label', { class: 'field adm-hot__url' }, h('span', { class: 'field__label' }, 'Picture'), urlIn),
      h('div', { class: 'row row--wrap adm-hot__picbtns' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'hot-image-upload' }, on: { click: () => fileIn.click() } }, icon('upload', { size: 16 }), url ? 'Replace picture' : 'Upload picture'),
        url ? h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'hot-image-remove' }, on: { click: () => { setImage(''); redraw(); } } }, icon('trash', { size: 16 }), 'Remove') : null,
        fileIn)),
    h('span', { class: 'field__hint' }, uploaded
      ? `Uploaded picture, stored in the test (${Math.round(q.image.url.length / 1000)} KB). You can also paste or drop a new one.`
      : 'Paste a link, upload a file, paste a screenshot (Ctrl/Cmd+V here) or drop a picture on the box below. Uploads are shrunk to fit in the test.'),
    url ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Picture description'), altIn, h('span', { class: 'field__hint' }, 'Read to students who use a screen reader.')) : null);

  // ---------- label list ----------
  const exact = h('details', { class: 'adm-hot__exact' });
  const statusEls = [];
  const xyEls = [];
  function syncRows() {
    q.labels.forEach((l, i) => {
      const ok = placed(l);
      const st = statusEls[i];
      if (st) { st.className = ['pill', ok ? 'pill--success' : 'pill--warning'].join(' '); st.replaceChildren(icon(ok ? 'check' : 'alert', { size: 14 }), ok ? 'Placed' : 'Not placed'); }
      const xy = xyEls[i];
      if (xy && document.activeElement !== xy.x && document.activeElement !== xy.y) { xy.x.value = pct(l.x); xy.y.value = pct(l.y); }
    });
  }

  const rows = q.labels.map((l, i) => {
    const text = h('input', { class: 'input', value: l.text || '', placeholder: 'e.g. Beaker', 'aria-label': `Label ${i + 1} text`, dataset: { testid: `hot-text-${i}` },
      on: {
        input: () => { l.text = text.value; pinEls[i]?.setAttribute('aria-label', `${name(i)}: pin ${i + 1}. Arrow keys move it.`); changed(); },
        focus: () => { if (sel !== i) { setSel(i); for (const [k, row] of rowEls.entries()) row.classList.toggle('is-selected', k === i); pinEls.forEach((p, k) => { p.classList.toggle('is-selected', k === i); p.setAttribute('aria-pressed', String(k === i)); }); ringEls.forEach((r, k) => r.classList.toggle('is-selected', k === i)); } },
      } });
    const st = h('span', { class: 'pill', dataset: { testid: `hot-status-${i}` } });
    statusEls.push(st);
    return h('div', { class: ['adm-hot__row', i === sel ? 'is-selected' : ''] },
      h('button', { type: 'button', class: 'adm-hot__num', 'aria-pressed': String(i === sel), 'aria-label': `Select label ${i + 1} to place it`, dataset: { testid: `hot-select-${i}` },
        on: { click: () => { setSel(i); redraw(); } } }, String(i + 1)),
      text, st,
      iconButton('x', `Remove label ${i + 1}`, () => { q.labels.splice(i, 1); setSel(Math.min(sel, q.labels.length - 1)); redraw(); changed(); }, { testid: `hot-remove-${i}` }));
  });
  const rowEls = rows;

  // Exact positions (percent, no spinners) for keyboard users or fine-tuning.
  const exactRows = q.labels.map((l, i) => {
    const mk = (key, tid) => {
      const el = h('input', { class: 'input adm-hot__xy', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: pct(l[key]), 'aria-label': `${name(i)} ${key === 'x' ? 'across' : 'down'} (percent)`, dataset: { testid: tid },
        on: { input: () => {
          const t = el.value.trim().replace('%', '');
          const n = Number(t);
          l[key] = t === '' || !Number.isFinite(n) ? NaN : r3(clamp(n / 100));
          paint(i); changed();
          const st = statusEls[i]; if (st) { const ok = placed(l); st.className = ['pill', ok ? 'pill--success' : 'pill--warning'].join(' '); st.replaceChildren(icon(ok ? 'check' : 'alert', { size: 14 }), ok ? 'Placed' : 'Not placed'); }
        } } });
      return el;
    };
    const x = mk('x', `hot-x-${i}`);
    const y = mk('y', `hot-y-${i}`);
    xyEls.push({ x, y });
    return h('div', { class: 'adm-hot__xyrow' },
      h('span', { class: 'adm-hot__xyname' }, `${i + 1}. ${name(i)}`),
      h('label', { class: 'adm-inline' }, h('span', { class: 'faint' }, 'Across'), x, h('span', { class: 'faint' }, '%')),
      h('label', { class: 'adm-inline' }, h('span', { class: 'faint' }, 'Down'), y, h('span', { class: 'faint' }, '%')));
  });
  exact.append(h('summary', {}, 'Exact positions (percent of the picture)'), h('div', { class: 'stack adm-hot__xylist' }, exactRows));

  // ---------- answer circle size ----------
  const r = radius();
  const sizeBtns = SIZES.map(([label, v]) => h('button', { type: 'button', class: 'btn btn--subtle btn--sm', 'aria-pressed': String(Math.abs(r - v) < 1e-9), on: { click: () => setRadius(v) } }, label));
  const slider = h('input', { type: 'range', class: 'adm-hot__slider', min: '2', max: '20', step: '1', value: String(Math.round(r * 100)), 'aria-label': 'Answer circle size (percent of picture width)',
    on: { input: () => setRadius(Number(slider.value) / 100) } });
  const radiusIn = h('input', { class: 'input adm-hot__xy', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: pct(r), 'aria-label': 'Answer circle size, percent of picture width', dataset: { testid: 'hot-radius' },
    on: { input: () => { const n = Number(radiusIn.value.trim().replace('%', '')); if (Number.isFinite(n) && n > 0) setRadius(clamp(n / 100), { fromInput: true }); else { q.radius = NaN; changed(); } } } });
  function setRadius(v, { fromInput = false } = {}) {
    q.radius = r3(v);
    slider.value = String(Math.round(v * 100));
    if (!fromInput) radiusIn.value = pct(v);
    sizeBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(Math.abs(q.radius - SIZES[k][1]) < 1e-9)));
    paintAll(); changed();
  }

  // Overlap warning: two answer circles that intersect are hard for students to tell apart.
  const overlaps = [];
  for (let a = 0; a < q.labels.length; a++) for (let b = a + 1; b < q.labels.length; b++) {
    const A = q.labels[a]; const B = q.labels[b];
    if (placed(A) && placed(B) && Math.hypot(A.x - B.x, A.y - B.y) < 2 * r) overlaps.push(`${a + 1} and ${b + 1}`);
  }

  paintAll();
  syncRows();
  const unplaced = q.labels.filter((l) => !placed(l)).length;
  say(!url ? '' : !q.labels.length ? 'Add a label, then click the picture to place it.'
    : sel >= 0 ? `Label ${sel + 1} selected${unplaced ? `. ${unplaced} not placed yet` : ''}. Click the picture to place it, or drag a pin.` : '');

  const root = h('div', { class: 'stack adm-hot', on: { paste: (e) => {
    if (e.target === urlIn) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); upload(f); }
  } } },
    picture,
    h('div', { class: 'field__label' }, 'Labels'),
    h('p', { class: 'field__hint' }, 'Select a label, then click the picture where it belongs. Drag a pin to move it, or focus it and use the arrow keys (Shift for bigger steps). The circle shows how close a student must be.'),
    stage,
    status,
    overlaps.length ? h('p', { class: 'notice notice--warning', dataset: { testid: 'hot-overlap' } }, icon('alert'), h('span', {}, `The answer circles of labels ${overlaps.join(', ')} overlap. Move them apart or make the circle smaller.`)) : null,
    h('div', { class: 'adm-hot__rows' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-hot-label' }, on: { click: () => {
        const used = new Set(q.labels.map((l) => l.id));
        let n = q.labels.length + 1;
        while (used.has(`l${n}`)) n++;
        q.labels.push({ id: `l${n}`, text: '', x: NaN, y: NaN });
        setSel(q.labels.length - 1); redraw(); changed();
        requestAnimationFrame(() => document.querySelector(`[data-testid="hot-text-${q.labels.length - 1}"]`)?.focus());
      } } }, icon('plus', { size: 16 }), 'Add label')),
    q.labels.length ? exact : null,
    h('div', { class: 'adm-hot__size' },
      h('span', { class: 'field__label' }, 'Answer circle'),
      h('div', { class: 'row row--wrap adm-hot__sizectl' }, sizeBtns, slider, h('label', { class: 'adm-inline' }, radiusIn, h('span', { class: 'faint' }, '% of width'))),
      h('span', { class: 'field__hint' }, 'How close a student’s pin must be to count as correct.')),
    switchEl({ label: 'Partial credit', hint: 'Points for each label placed inside its circle', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
  return root;
}
