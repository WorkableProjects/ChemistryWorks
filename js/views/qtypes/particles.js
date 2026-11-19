// `particles` question type — student particle box, builder editor, review (draws the box).
// Pick a species in the palette, then click inside a zone to place a particle there, click a particle to remove it. Keyboard:
// Tab to a zone, Enter / Space adds the selected species, Backspace / Delete removes the last one of that species; every
// species also has Add / Remove buttons with a live count under each zone.
// Answer = [{ s: speciesId, z: zoneId, x, y }].
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { SHAPES, TONES, speciesOf, zonesOf, maxPerZone, targetOf, gridPositions, keyParticles } from '../../lib/qtypes/particles.js';

const clamp = (x) => Math.min(0.93, Math.max(0.07, x));
const valid = (p) => p && typeof p === 'object' && typeof p.s === 'string' && typeof p.z === 'string';

/** One particle drawing (also used in the palette): shape + tone from the species. */
export function particleGlyph(sp, extra = '') {
  return h('span', { class: ['q-part__p', `q-part__p--${sp.shape || 'circle'}`, `q-part__p--t${sp.tone || 1}`, extra].filter(Boolean).join(' '), 'aria-hidden': 'true' });
}

/** A read-only box: `particles` placed at fractions of the zone. Used by review (results, grading, export). */
export function boxView(q, particles, { size = 'md' } = {}) {
  const sp = new Map(speciesOf(q).map((s) => [s.id, s]));
  const zones = zonesOf(q);
  return h('span', { class: ['q-part-review', size === 'sm' && 'q-part-review--sm'], dataset: { testid: 'particles-review' } },
    zones.map((z) => h('span', { class: 'q-part-review__zone' },
      zones.length > 1 || z.label ? h('span', { class: 'q-part-review__label' }, z.label || z.id) : null,
      h('span', { class: 'q-part-review__box' }, particles.filter((p) => valid(p) && p.z === z.id && sp.has(p.s)).map((p) => {
        const g = particleGlyph(sp.get(p.s), 'q-part__p--placed');
        g.style.left = `${(clamp(Number(p.x)) * 100).toFixed(1)}%`;
        g.style.top = `${(clamp(Number(p.y)) * 100).toFixed(1)}%`;
        return g;
      })))),
    h('span', { class: 'q-part-review__legend' }, speciesOf(q).map((s) => h('span', { class: 'q-part-review__key' }, particleGlyph(s), ` ${s.label || s.id}`))));
}

function widget(q, api) {
  const species = speciesOf(q);
  const zones = zonesOf(q);
  const cap = maxPerZone(q);
  let selected = species[0] ? species[0].id : '';
  const get = () => (Array.isArray(api.get(q.id)) ? api.get(q.id).filter(valid) : []);
  const save = (list) => api.set(q.id, list.length ? list : undefined, { debounce: false });
  const countIn = (list, z) => list.filter((p) => p.z === z).length;
  const status = h('p', { class: 'q-hint q-part__status', 'aria-live': 'polite', dataset: { testid: 'particles-status' } });
  const say = (m) => { status.textContent = m; };
  const nameOf = (id) => { const s = species.find((x) => x.id === id); return s ? (s.label || s.id) : id; };

  function add(z, s, at) {
    if (!s) return;
    const list = get();
    if (countIn(list, z) >= cap) { say(`The ${zones.find((x) => x.id === z)?.label || z} box is full (${cap} particles).`); return; }
    const k = countIn(list, z);
    const pos = at || gridPositions(k + 1, k)[k];
    list.push({ s, z, x: Number(clamp(pos.x).toFixed(3)), y: Number(clamp(pos.y).toFixed(3)) });
    save(list);
    say(`Added ${nameOf(s)}. ${list.filter((p) => p.z === z && p.s === s).length} in this box.`);
  }
  function removeLast(z, s) {
    const list = get();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].z === z && (!s || list[i].s === s)) { const [gone] = list.splice(i, 1); save(list); say(`Removed ${nameOf(gone.s)}.`); return; }
    }
  }
  function removeAt(index) { const list = get(); const [gone] = list.splice(index, 1); save(list); if (gone) say(`Removed ${nameOf(gone.s)}.`); }

  const palBtns = species.map((s, idx) => h('button', { type: 'button', class: 'q-part__pal', role: 'radio', 'aria-checked': String(s.id === selected), tabindex: idx === 0 ? '0' : '-1',
    dataset: { testid: `particles-species-${s.id}`, speciesId: s.id },
    on: {
      click: () => pick(s.id),
      keydown: (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const j = (idx + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + species.length) % species.length;
        palBtns[j].focus(); pick(species[j].id);
      },
    } }, particleGlyph(s), h('span', { class: 'q-part__pal-label' }, s.label || s.id)));
  function pick(id) {
    selected = id;
    palBtns.forEach((b, i) => { const on = species[i].id === id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('is-selected', on); });
  }
  pick(selected);

  const zoneEls = zones.map((z) => {
    const surface = h('div', { class: 'q-part__surface', tabindex: '0', role: 'group', dataset: { testid: `particles-zone-${z.id}` },
      on: {
        click: (e) => {
          if (e.target !== surface) return;
          const r = surface.getBoundingClientRect();
          add(z.id, selected, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
        },
        keydown: (e) => {
          if (e.target !== surface) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(z.id, selected); }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeLast(z.id, selected); }
        },
      } });
    const counters = h('div', { class: 'q-part__counts' });
    return { z, surface, counters, el: h('div', { class: 'q-part__zone' }, h('h4', { class: 'q-part__zone-title' }, z.label || z.id), surface, counters,
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: `particles-clear-${z.id}` }, on: { click: () => { save(get().filter((p) => p.z !== z.id)); say('Box cleared.'); } } }, 'Clear box')) };
  });

  function draw(list) {
    const bySpecies = new Map(species.map((s) => [s.id, s]));
    for (const ze of zoneEls) {
      const mine = list.map((p, index) => ({ p, index })).filter(({ p }) => p.z === ze.z.id && bySpecies.has(p.s));
      ze.surface.setAttribute('aria-label', `${ze.z.label || ze.z.id}: ${mine.length} particle${mine.length === 1 ? '' : 's'}. Enter adds the selected species, Backspace removes one.`);
      ze.surface.replaceChildren(...mine.map(({ p, index }) => {
        const g = h('button', { type: 'button', class: `q-part__p q-part__p--${bySpecies.get(p.s).shape} q-part__p--t${bySpecies.get(p.s).tone} q-part__p--placed`, tabindex: '-1', 'aria-label': `Remove ${nameOf(p.s)}`, dataset: { testid: `particles-particle-${ze.z.id}-${p.s}` },
          on: { click: (e) => { e.stopPropagation(); removeAt(index); } } });
        g.style.left = `${(clamp(Number(p.x)) * 100).toFixed(1)}%`;
        g.style.top = `${(clamp(Number(p.y)) * 100).toFixed(1)}%`;
        return g;
      }));
      ze.counters.replaceChildren(...species.map((s) => {
        const n = mine.filter(({ p }) => p.s === s.id).length;
        return h('span', { class: 'q-part__count', role: 'group', 'aria-label': `${s.label || s.id} in ${ze.z.label || ze.z.id}` },
          particleGlyph(s),
          h('button', { type: 'button', class: 'btn btn--ghost q-part__step', 'aria-label': `Remove one ${s.label || s.id} from ${ze.z.label || ze.z.id}`, dataset: { testid: `particles-remove-${ze.z.id}-${s.id}` }, on: { click: () => removeLast(ze.z.id, s.id) } }, '−'),
          h('output', { class: 'q-part__n', dataset: { testid: `particles-count-${ze.z.id}-${s.id}` } }, String(n)),
          h('button', { type: 'button', class: 'btn btn--ghost q-part__step', 'aria-label': `Add one ${s.label || s.id} to ${ze.z.label || ze.z.id}`, dataset: { testid: `particles-add-${ze.z.id}-${s.id}` }, on: { click: () => add(ze.z.id, s.id) } }, '+'));
      }));
    }
  }
  draw([]);
  return {
    el: h('div', { class: 'q-part' },
      h('p', { class: 'q-hint' }, 'Choose a particle type, then click inside the box to place one (or press Enter in the box, or use the + buttons). Click a particle to remove it.'),
      h('div', { class: 'q-part__palette', role: 'radiogroup', 'aria-label': 'Particle types' }, palBtns),
      h('div', { class: 'q-part__zones' }, zoneEls.map((z) => z.el)), status),
    refresh(answer) { draw(Array.isArray(answer) ? answer.filter(valid) : []); },
    focus: () => palBtns[0]?.focus(),
  };
}

function editor(q, redraw, changed) {
  q.species = Array.isArray(q.species) ? q.species : [];
  q.zones = Array.isArray(q.zones) && q.zones.length ? q.zones : [{ id: 'box', label: 'Box' }];
  q.targets = q.targets && typeof q.targets === 'object' ? q.targets : {};
  const text = (label, get, set, testid, { type = 'text', hint = null, min } = {}) => field(label, h('input', { class: 'input', type, min, value: get() ?? '', autocomplete: 'off', dataset: { testid }, on: { input: (e) => { set(e.target.value); changed(); } } }), hint);
  const uid = (list, prefix) => { const used = new Set(list.map((x) => x.id)); let n = 1; while (used.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };
  const speciesRows = q.species.map((s, i) => {
    const shape = h('select', { class: 'select', 'aria-label': `Species ${i + 1} shape`, dataset: { testid: `particles-edit-species-${i}-shape` }, on: { change: (e) => { s.shape = e.target.value; changed(); } } }, SHAPES.map((x) => h('option', { value: x, selected: s.shape === x }, x)));
    const tone = h('select', { class: 'select', 'aria-label': `Species ${i + 1} colour`, dataset: { testid: `particles-edit-species-${i}-tone` }, on: { change: (e) => { s.tone = Number(e.target.value); changed(); } } }, TONES.map((x) => h('option', { value: x, selected: s.tone === x }, `Colour ${x}`)));
    return h('div', { class: 'adm-opt q-part-ed__row' },
      h('div', { class: 'adm-grid adm-grid--4' },
        text(`Species ${i + 1} id`, () => s.id, (v) => { const old = s.id; s.id = v.trim(); for (const row of Object.values(q.targets)) if (row && old in row) { row[s.id] = row[old]; delete row[old]; } }, `particles-edit-species-${i}-id`),
        text(`Species ${i + 1} label`, () => s.label, (v) => { s.label = v; }, `particles-edit-species-${i}-label`), field('Shape', shape), field('Colour', tone)),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove species ${i + 1}`, dataset: { testid: `particles-edit-species-remove-${i}` }, on: { click: () => { const [gone] = q.species.splice(i, 1); for (const row of Object.values(q.targets)) if (row) delete row[gone.id]; redraw(); changed(); } } }, 'Remove species'));
  });
  const zoneRows = q.zones.map((z, i) => h('div', { class: 'adm-opt q-part-ed__row' },
    h('div', { class: 'adm-grid adm-grid--2' },
      text(`Zone ${i + 1} id`, () => z.id, (v) => { const old = z.id; z.id = v.trim(); if (q.targets[old]) { q.targets[z.id] = q.targets[old]; delete q.targets[old]; } }, `particles-edit-zone-${i}-id`),
      text(`Zone ${i + 1} label`, () => z.label, (v) => { z.label = v; }, `particles-edit-zone-${i}-label`)),
    q.zones.length > 1 ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove zone ${i + 1}`, on: { click: () => { const [gone] = q.zones.splice(i, 1); delete q.targets[gone.id]; redraw(); changed(); } } }, 'Remove zone') : null));
  const grid = h('div', { class: 'q-part-ed__targets', role: 'group', 'aria-label': 'Correct particle counts' },
    q.zones.map((z) => h('div', { class: 'q-part-ed__tz' }, h('strong', {}, z.label || z.id),
      q.species.map((s) => field(`${s.label || s.id} in ${z.label || z.id}`, h('input', { class: 'input', type: 'number', min: '0', step: '1', value: targetOf(q, z.id, s.id), dataset: { testid: `particles-edit-target-${z.id}-${s.id}` },
        on: { input: (e) => { q.targets[z.id] = q.targets[z.id] || {}; const n = e.target.value.trim() === '' ? 0 : Number(e.target.value); q.targets[z.id][s.id] = n; changed(); } } }))))));
  return h('div', { class: 'stack' },
    h('h4', { class: 'field__label' }, 'Particle types (palette)'), speciesRows,
    h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'particles-edit-add-species' }, on: { click: () => { const i = q.species.length; q.species.push({ id: uid(q.species, 'p'), label: '', shape: SHAPES[i % SHAPES.length], tone: TONES[i % TONES.length] }); redraw(); changed(); } } }, 'Add particle type'),
    h('h4', { class: 'field__label' }, 'Boxes (zones)'), zoneRows,
    q.zones.length < 4 ? h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'particles-edit-add-zone' }, on: { click: () => { q.zones.push({ id: uid(q.zones, 'zone'), label: '' }); redraw(); changed(); } } }, 'Add zone (for example Liquid and Gas)') : null,
    h('h4', { class: 'field__label' }, 'Correct counts'), grid,
    text('Largest number of particles per box', () => q.maxPerZone ?? '', (v) => { q.maxPerZone = v.trim() === '' ? undefined : Number(v); }, 'particles-edit-max', { type: 'number', min: '1' }),
    switchEl({ label: 'Partial credit', hint: 'Points for each species and zone with the right count', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}

function review(q, answer, { key, size } = {}) {
  if (key) return boxView(q, keyParticles(q), { size });
  if (!Array.isArray(answer) || !answer.some(valid)) return null;
  return boxView(q, answer, { size });
}

registerTypeUI({ type: 'particles', widget, editor, review });
export default null;
