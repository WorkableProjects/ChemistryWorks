// `structure` editor: skeleton atoms and bonds, the correct bond orders and lone pairs, and optional student-drawn charges.
import { h, mount, icon } from '../../../ui.js';
import { normalizeSymbol } from '../../../lib/lewis.js';
import { structureDiagram } from '../../structure-view.js';
import { acceptedStructures, valenceTotal, electronsDrawn, bondEnds, MAX_CHARGE } from '../../../lib/structure.js';
import { field, switchEl, iconButton } from '../common.js';
import { uniqueId } from './shared.js';

function structureEditor(q, redraw, changed) {
  q.atoms = Array.isArray(q.atoms) ? q.atoms : [];
  q.bonds = Array.isArray(q.bonds) ? q.bonds.map((b) => bondEnds(b) || ['', '']) : [];
  if (!acceptedStructures(q).length) q.correctAnswer = { bonds: q.bonds.map(() => 1), lonePairs: {} };
  const forms = () => acceptedStructures(q);
  const key = () => forms()[0];
  for (const f of forms()) { f.bonds = Array.isArray(f.bonds) ? f.bonds : []; f.lonePairs = f.lonePairs && typeof f.lonePairs === 'object' ? f.lonePairs : {}; }

  const preview = h('div', { class: 'adm-structure-preview', dataset: { testid: 'structure-preview' } });
  const check = h('p', { class: 'field__hint', dataset: { testid: 'structure-electrons' } });
  const drawPreview = () => {
    const total = valenceTotal(q);
    const drawn = electronsDrawn(q, key());
    check.textContent = total === null ? `Correct structure uses ${drawn} electrons (electron total not checked for non-main-group atoms).`
      : drawn === total ? `✓ Correct structure uses all ${total} valence electrons.` : `Correct structure uses ${drawn} electrons, but the atoms have ${total} valence electrons. Adjust bonds or lone pairs.`;
    check.classList.toggle('field-error', total !== null && drawn !== total);
    try {
      mount(preview, forms().map((f, i) => h('div', { class: 'stack' }, h('span', { class: 'faint' }, forms().length > 1 ? `Correct form ${i + 1}` : 'Correct structure'), structureDiagram(q, f))));
    } catch {
      mount(preview, h('span', { class: 'faint' }, 'Preview appears once atoms and bonds are filled in'));
    }
  };
  const update = () => { drawPreview(); changed(); };

  const atomRows = q.atoms.map((a, i) => {
    const id = h('input', { class: 'input', value: a.id, 'aria-label': `Atom ${i + 1} id`, spellcheck: 'false', dataset: { testid: `atom-id-${i}` }, on: { change: () => {
      const old = a.id; const next = id.value.trim();
      if (!next || next === old) { id.value = old; return; }
      a.id = next;
      q.bonds = q.bonds.map((b) => b.map((x) => (x === old ? next : x)));
      for (const f of forms()) {
        if (old in f.lonePairs) { f.lonePairs[next] = f.lonePairs[old]; delete f.lonePairs[old]; }
        if (f.formalCharges && old in f.formalCharges) { f.formalCharges[next] = f.formalCharges[old]; delete f.formalCharges[old]; }
      }
      redraw(); changed();
    } } });
    const sym = h('input', { class: 'input', value: a.symbol || '', maxlength: '3', 'aria-label': `Atom ${i + 1} element`, spellcheck: 'false', dataset: { testid: `atom-symbol-${i}` },
      on: { input: () => { a.symbol = normalizeSymbol(sym.value) || sym.value.trim(); update(); } } });
    const num = (k, label) => {
      const inp = h('input', { class: 'input', type: 'number', step: '0.5', value: a[k] ?? '', placeholder: 'auto', 'aria-label': `Atom ${i + 1} ${label}`, dataset: { testid: `atom-${k}-${i}` },
        on: { input: () => { if (inp.value.trim() === '') delete a[k]; else a[k] = Number(inp.value); update(); } } });
      return inp;
    };
    const lp = h('select', { class: 'select', 'aria-label': `Atom ${i + 1} lone pairs (correct)`, dataset: { testid: `atom-lp-${i}` },
      on: { change: () => { key().lonePairs[a.id] = Number(lp.value); update(); } } }, [0, 1, 2, 3, 4].map((n) => h('option', { value: String(n) }, String(n))));
    lp.value = String(key().lonePairs[a.id] ?? 0);
    const rm = iconButton('x', 'Remove atom', () => {
      q.atoms.splice(i, 1);
      const keepIdx = q.bonds.map((b, j) => (b.includes(a.id) ? -1 : j)).filter((j) => j >= 0);
      q.bonds = keepIdx.map((j) => q.bonds[j]);
      for (const f of forms()) { f.bonds = keepIdx.map((j) => f.bonds[j] ?? 1); delete f.lonePairs[a.id]; if (f.formalCharges) delete f.formalCharges[a.id]; }
      redraw(); changed();
    }, { testid: `atom-remove-${i}` });
    return h('div', { class: 'adm-atom' }, id, sym, num('x', 'column (x)'), num('y', 'row (y)'), lp, rm);
  });

  const atomOptions = () => q.atoms.map((a) => h('option', { value: a.id }, `${a.symbol || '?'} (${a.id})`));
  const bondRows = q.bonds.map((b, i) => {
    const mk = (end) => {
      const sel = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} atom ${end + 1}`, dataset: { testid: `bond-${end ? 'b' : 'a'}-${i}` },
        on: { change: () => { b[end] = sel.value; update(); } } }, h('option', { value: '' }, 'Atom…'), atomOptions());
      sel.value = b[end] || '';
      return sel;
    };
    const order = h('select', { class: 'select', 'aria-label': `Bond ${i + 1} correct order`, dataset: { testid: `bond-order-${i}` },
      on: { change: () => { key().bonds[i] = Number(order.value); update(); } } },
    h('option', { value: '1' }, 'Single'), h('option', { value: '2' }, 'Double'), h('option', { value: '3' }, 'Triple'));
    order.value = String(key().bonds[i] ?? 1);
    const rm = iconButton('x', 'Remove bond', () => {
      q.bonds.splice(i, 1);
      for (const f of forms()) f.bonds.splice(i, 1);
      redraw(); changed();
    }, { testid: `bond-remove-${i}` });
    return h('div', { class: 'adm-bondrow' }, mk(0), mk(1), order, rm);
  });

  const charge = h('input', { class: 'input', type: 'number', step: '1', value: q.charge ?? 0, dataset: { testid: 'structure-charge' },
    on: { input: () => { q.charge = charge.value.trim() === '' ? 0 : Number(charge.value); update(); } } });
  drawPreview();

  // Student-drawn brackets & charges (V2-06): the key lives in forms()[0]; zero values are omitted.
  const chargeInput = (value, label, testid, onValue) => {
    const inp = h('input', { class: 'input', type: 'number', min: String(-MAX_CHARGE), max: String(MAX_CHARGE), step: '1', value: String(value || 0), 'aria-label': label, dataset: { testid },
      on: { input: () => {
        const n = Math.max(-MAX_CHARGE, Math.min(MAX_CHARGE, Math.trunc(Number(inp.value)) || 0));
        onValue(n);
        update();
      } } });
    return inp;
  };
  const chargeEditor = () => {
    if (!q.studentCharges) return null;
    const k = key();
    const bracket = h('input', { type: 'checkbox', checked: k.bracket === true, dataset: { testid: 'structure-key-bracket' },
      on: { change: () => { if (bracket.checked) k.bracket = true; else delete k.bracket; update(); } } });
    const keyCharge = chargeInput(k.charge, 'Key overall charge', 'structure-key-charge', (n) => { if (n) k.charge = n; else delete k.charge; });
    const fcRows = q.atoms.map((a, i) => field(`${a.symbol || '?'} (${a.id})`, chargeInput(k.formalCharges?.[a.id], `Atom ${i + 1} formal charge (correct)`, `atom-fc-${i}`, (n) => {
      if (n) { k.formalCharges = k.formalCharges && typeof k.formalCharges === 'object' ? k.formalCharges : {}; k.formalCharges[a.id] = n; }
      else if (k.formalCharges) { delete k.formalCharges[a.id]; if (!Object.keys(k.formalCharges).length) delete k.formalCharges; }
    })));
    return h('div', { class: 'stack adm-chargekey', dataset: { testid: 'structure-charge-key' } },
      h('div', { class: 'field__label' }, 'Correct brackets and charges (the key)'),
      h('label', { class: 'adm-check' }, bracket, h('span', {}, 'Structure is drawn in brackets')),
      h('div', { class: 'adm-grid adm-grid--4' }, field(`Overall charge on the bracket (−${MAX_CHARGE} to ${MAX_CHARGE})`, keyCharge, 'Leave 0 for none')),
      h('div', { class: 'field__label' }, `Formal charge on each atom (−${MAX_CHARGE} to ${MAX_CHARGE}, 0 = none)`),
      h('div', { class: 'adm-fcgrid' }, fcRows));
  };
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {},
      'Give the skeleton (atoms and which atoms are bonded) and the correct bond order and lone pairs. Students set bond orders and lone pairs themselves. ',
      'x/y place atoms on a grid (column, row); leave them empty for an automatic layout. Resonance forms can be added in JSON mode (correctAnswer as a list).')),
    forms().length > 1 ? h('p', { class: 'notice notice--warning' }, icon('alert'), h('span', {}, `This question accepts ${forms().length} resonance forms. The fields below edit form 1; edit the others in JSON mode.`)) : null,
    h('div', { class: 'field__label' }, 'Atoms'),
    h('div', { class: 'adm-atom adm-colhead', 'aria-hidden': 'true' }, h('span', {}, 'Id'), h('span', {}, 'Element'), h('span', {}, 'x'), h('span', {}, 'y'), h('span', {}, 'Lone pairs'), h('span', {})),
    h('div', { class: 'adm-opts' }, atomRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-atom' }, on: { click: () => {
      const id = uniqueId('a', q.atoms);
      const maxX = q.atoms.reduce((m, a) => (Number.isFinite(Number(a.x)) && a.x !== '' ? Math.max(m, Number(a.x)) : m), -1);
      const atom = { id, symbol: 'H' };
      if (q.atoms.length && q.atoms.every((a) => a.x !== undefined && a.y !== undefined)) { atom.x = maxX + 1; atom.y = 0; }
      q.atoms.push(atom);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add atom'),
    h('div', { class: 'field__label' }, 'Bonds (skeleton) and the correct bond order'),
    h('div', { class: 'adm-opts' }, bondRows),
    h('button', { class: 'btn btn--ghost btn--sm adm-self-start', type: 'button', dataset: { testid: 'add-bond' }, on: { click: () => {
      q.bonds.push([q.atoms[0]?.id || '', q.atoms[1]?.id || '']);
      for (const f of forms()) f.bonds.push(1);
      redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add bond'),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Overall charge', charge, 'e.g. -1 for NO₃⁻, +1 for NH₄⁺')),
    h('div', { class: 'adm-switches' },
      switchEl({ label: 'Partial credit', hint: 'Credit for each correct bond and lone-pair count', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
      switchEl({ label: 'Show electron total to students', hint: 'Counter shows “14 of 16 valence electrons drawn”', checked: !!q.showElectronCount, testid: 'structure-show-count', onChange: (v) => { q.showElectronCount = v; changed(); } })),
    switchEl({ label: 'Student draws brackets & charges (teacher graded)', hint: 'Students add brackets, an overall charge and formal charges themselves. The question then moves to the Grading tab.', checked: !!q.studentCharges, testid: 'structure-student-charges',
      onChange: (v) => { q.studentCharges = v; redraw(); changed(); } }),
    chargeEditor(),
    check,
    preview);
}

export default { type: 'structure', edit: ({ q, redraw, changed }) => structureEditor(q, redraw, changed) };
