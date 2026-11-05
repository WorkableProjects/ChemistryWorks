// UI for `nuclear` (V4-03): stacked A / Z / symbol notation with inputs in place of the missing particles.
// Isotope answer = { A, Z, symbol }; equation answer = { R1: { A, Z, symbol }, … } (keys L<i> / R<i>).
import { h } from '../../ui.js';
import { field, switchEl } from '../admin/common.js';
import { blankKeys, isConserved, PARTICLE_NAMES, PARTICLES } from '../../lib/qtypes/nuclear.js';
import { registerTypeUI } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const triple = (b) => ({ A: String(b?.A ?? ''), Z: String(b?.Z ?? ''), symbol: String(b?.symbol ?? '') });
const label = (p) => `${p.A} ${p.Z} ${p.symbol}`;

/** A fixed (given) particle in stacked notation: A over Z, then the symbol. */
function fixedNotation(p, extra = '') {
  return h('span', { class: `q-nuc ${extra}`.trim(), role: 'img', 'aria-label': `mass number ${p.A}, atomic number ${p.Z}, symbol ${p.symbol}` },
    h('span', { class: 'q-nuc__nums', 'aria-hidden': 'true' }, h('span', { class: 'q-nuc__a' }, String(p.A)), h('span', { class: 'q-nuc__z' }, String(p.Z))),
    h('span', { class: 'q-nuc__sym', 'aria-hidden': 'true' }, p.symbol));
}

/** The three inputs of a blank particle. `get`/`set` read and write one field of the student's answer. */
function blankNotation(prefix, who, get, set) {
  const mk = (name, aria, mode, cls, extraAttrs = {}) => h('input', {
    class: `input q-input q-nuc__in ${cls}`, type: 'text', inputmode: mode, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    'aria-label': `${who} ${aria}`, value: get(name), dataset: { testid: `${prefix}-${name}` }, ...extraAttrs,
    on: { input: (e) => set(name, e.target.value) },
  });
  const A = mk('A', 'mass number', 'numeric', 'q-nuc__in-a');
  const Z = mk('Z', 'atomic number', 'numeric', 'q-nuc__in-z');
  const symbol = mk('symbol', 'symbol', 'text', 'q-nuc__in-sym');
  return { el: h('span', { class: 'q-nuc q-nuc--blank', role: 'group', 'aria-label': who }, h('span', { class: 'q-nuc__nums' }, A, Z), symbol), inputs: { A, Z, symbol } };
}

function widget(q, api) {
  const isEq = q.mode === 'equation';
  let state = isEq ? {} : triple();
  const read = (a) => {
    if (!isObj(a)) return isEq ? {} : triple();
    if (!isEq) return triple(a);
    return Object.fromEntries(Object.entries(a).filter(([, v]) => isObj(v)).map(([k, v]) => [k, triple(v)]));
  };
  state = read(api.get(q.id));
  const status = h('p', { class: 'q-hint q-nuc__status', 'aria-live': 'polite', dataset: { testid: 'nuclear-balance' } });
  const commit = () => { api.set(q.id, JSON.parse(JSON.stringify(state)), { debounce: true }); showStatus(); };
  const all = []; // { inputs, key }

  function showStatus() {
    if (!isEq) { status.textContent = ''; return; }
    const ok = isConserved(q, state);
    status.classList.toggle('is-ok', ok === true);
    status.textContent = ok === null ? 'Mass numbers (top) and atomic numbers (bottom) must add up to the same totals on both sides.'
      : ok ? 'Mass number and charge: balanced.' : 'Mass number and charge: not balanced yet.';
  }

  let body;
  if (!isEq) {
    const b = blankNotation('nuclear', 'Isotope', (n) => state[n], (n, v) => { state[n] = v; commit(); });
    all.push({ ...b });
    body = h('div', { class: 'q-nuc__row' }, b.el);
  } else {
    const side = (name, prefix) => (q[name] || []).flatMap((p, i) => {
      const parts = [];
      if (i) parts.push(h('span', { class: 'q-nuc__plus', 'aria-hidden': 'true' }, '+'));
      if (p.missing) {
        const key = `${prefix}${i}`;
        const who = `Missing particle ${key}`;
        const b = blankNotation(`nuclear-${key}`, who, (n) => (state[key] ? state[key][n] : ''), (n, v) => { state[key] = { ...triple(state[key]), [n]: v }; commit(); });
        all.push({ ...b, key });
        parts.push(b.el);
      } else parts.push(fixedNotation(p));
      return parts;
    });
    body = h('div', { class: 'q-nuc__row', role: 'group', 'aria-label': 'Nuclear equation' },
      side('left', 'L'), h('span', { class: 'q-nuc__arrow', 'aria-hidden': 'true' }, '→'), side('right', 'R'));
  }
  showStatus();
  return {
    el: h('div', { class: 'q-nuclear' },
      h('p', { class: 'q-hint' }, isEq
        ? 'Fill in the missing particle(s): mass number on top, atomic number below, then the symbol. Particles: alpha = He, beta = e, positron = e, neutron = n, proton = p.'
        : 'Write the mass number on top, the atomic number below, and the element symbol.'),
      body, status),
    refresh(answer) {
      state = read(answer);
      for (const { inputs, key } of all) {
        const v = isEq ? triple(state[key]) : triple(state);
        for (const n of ['A', 'Z', 'symbol']) if (document.activeElement !== inputs[n]) inputs[n].value = v[n];
      }
      showStatus();
    },
    focus: () => all[0] && all[0].inputs.A.focus(),
  };
}

function review(q, answer, { key } = {}) {
  const isEq = q.mode === 'equation';
  const pick = (k, p) => {
    if (key) return p;
    const a = isEq ? (isObj(answer) ? answer[k] : null) : answer;
    return isObj(a) ? { A: a.A || '?', Z: a.Z || '?', symbol: a.symbol || '?' } : { A: '?', Z: '?', symbol: '?' };
  };
  if (!key && !isObj(answer)) return null;
  if (!isEq) return h('span', { class: 'q-nuc-review', dataset: { testid: 'nuclear-review' } }, fixedNotation(pick('', q.isotope), 'q-nuc--sm'));
  const side = (name, prefix) => (q[name] || []).flatMap((p, i) => [i ? h('span', { class: 'q-nuc__plus', 'aria-hidden': 'true' }, '+') : null, fixedNotation(p.missing ? pick(`${prefix}${i}`, p) : p, `q-nuc--sm${p.missing ? ' is-filled' : ''}`)]);
  return h('span', { class: 'q-nuc-review', dataset: { testid: 'nuclear-review' } }, side('left', 'L'), h('span', { class: 'q-nuc__arrow', 'aria-hidden': 'true' }, '→'), side('right', 'R'));
}

function editor(q, redraw, changed) {
  const mode = h('select', { class: 'select', dataset: { testid: 'nuclear-edit-mode' }, on: { change: () => {
    q.mode = mode.value;
    if (q.mode === 'equation') { q.left = q.left || [{ A: 238, Z: 92, symbol: 'U' }]; q.right = q.right || [{ A: 234, Z: 90, symbol: 'Th', missing: true }, { name: 'alpha' }]; delete q.isotope; }
    else { q.isotope = q.isotope || { A: 12, Z: 6, symbol: 'C' }; delete q.left; delete q.right; }
    redraw(); changed();
  } } }, h('option', { value: 'isotope', selected: q.mode !== 'equation' }, 'Isotope (A, Z, symbol)'), h('option', { value: 'equation', selected: q.mode === 'equation' }, 'Nuclear equation'));
  const num = (label, get, set, testid) => field(label, h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: get() ?? '', autocomplete: 'off', dataset: { testid },
    on: { input: (e) => { const s = e.target.value.trim(); set(s !== '' && /^-?\d+$/.test(s) ? Number(s) : s); changed(); } } }));
  const txt = (label, get, set, testid) => field(label, h('input', { class: 'input', value: get() ?? '', autocomplete: 'off', dataset: { testid }, on: { input: (e) => { set(e.target.value); changed(); } } }));
  let content;
  if (q.mode !== 'equation') {
    content = h('div', { class: 'adm-grid adm-grid--3' },
      num('Mass number A', () => q.isotope.A, (v) => { q.isotope.A = v; }, 'nuclear-edit-A'),
      num('Atomic number Z', () => q.isotope.Z, (v) => { q.isotope.Z = v; }, 'nuclear-edit-Z'),
      txt('Symbol', () => q.isotope.symbol, (v) => { q.isotope.symbol = v; }, 'nuclear-edit-symbol'));
  } else {
    const sideEditor = (name, prefix) => h('div', { class: 'stack' }, h('h4', { class: 'field__label' }, name === 'left' ? 'Left side (before →)' : 'Right side (after →)'),
      (q[name] || []).map((p, i) => {
        const named = h('select', { class: 'select', 'aria-label': `${prefix}${i} particle`, dataset: { testid: `nuclear-edit-${prefix}${i}-name` }, on: { change: () => {
          const keep = p.missing === true;
          const next = named.value ? { name: named.value } : { A: p.A === undefined ? '' : p.A, Z: p.Z === undefined ? '' : p.Z, symbol: p.symbol || '' };
          if (keep) next.missing = true;
          q[name][i] = next; redraw(); changed();
        } } }, h('option', { value: '', selected: !p.name }, 'Custom (A, Z, symbol)'), PARTICLE_NAMES.map((n) => h('option', { value: n, selected: p.name === n }, `${n} (${PARTICLES[n].A}, ${PARTICLES[n].Z})`)));
        return h('div', { class: 'adm-opt q-nuc-ed__particle', dataset: { testid: `nuclear-edit-${prefix}${i}` } },
          h('div', { class: 'adm-grid adm-grid--4' }, field('Particle', named),
            num('A', () => p.A, (v) => { p.A = v; }, `nuclear-edit-${prefix}${i}-A`),
            num('Z', () => p.Z, (v) => { p.Z = v; }, `nuclear-edit-${prefix}${i}-Z`),
            txt('Symbol', () => p.symbol, (v) => { p.symbol = v; }, `nuclear-edit-${prefix}${i}-symbol`)),
          switchEl({ label: 'Student fills this in', checked: p.missing === true, testid: `nuclear-edit-${prefix}${i}-missing`, onChange: (v) => { if (v) p.missing = true; else delete p.missing; changed(); } }),
          h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove particle ${prefix}${i}`, on: { click: () => { q[name].splice(i, 1); redraw(); changed(); } } }, 'Remove'));
      }),
      h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: `nuclear-edit-add-${name}` }, on: { click: () => { q[name].push({ A: '', Z: '', symbol: '' }); redraw(); changed(); } } }, 'Add particle'));
    content = h('div', { class: 'stack' }, sideEditor('left', 'L'), sideEditor('right', 'R'),
      h('p', { class: 'field__hint' }, `${blankKeys(q).length} missing particle(s). Mass numbers and atomic numbers must balance across the arrow.`));
  }
  return h('div', { class: 'stack' }, field('Kind of question', mode), content);
}

registerTypeUI({ type: 'nuclear', widget, editor, review });
export default null;
