// `particles` question type: a particle-diagram box. The student places particles of the species in the
// palette into one or more zones (for example "Gas" and "Liquid", or just "Box"); the counts per zone and species are graded.
// Pure definition, no DOM.
//   { type: 'particles', species: [{ id: 'h2', label: 'H₂', shape: 'circle'|'square'|'triangle'|'diamond', tone: 1..6 }],
//     zones: [{ id: 'gas', label: 'Gas' }]  (default one zone "box"),
//     targets: { gas: { h2: 4, o2: 2 } }  (missing = 0),  maxPerZone: 24, partialCredit: true }
//   Answer: [{ s: speciesId, z: zoneId, x: 0..1, y: 0..1 }, ...]   positions only matter for drawing; grading counts.
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const ID_RE = /^[A-Za-z0-9_-]+$/;
const DASH = '—';

export const SHAPES = ['circle', 'square', 'triangle', 'diamond'];
export const TONES = [1, 2, 3, 4, 5, 6];
export const DEFAULT_MAX = 24;
export const ABS_MAX = 60;

export const speciesOf = (q) => (Array.isArray(q && q.species) ? q.species.filter(isObj) : []);
export const zonesOf = (q) => {
  const z = Array.isArray(q && q.zones) ? q.zones.filter(isObj) : [];
  return z.length ? z : [{ id: 'box', label: 'Box' }];
};
export const maxPerZone = (q) => {
  const m = Number(q && q.maxPerZone);
  return Number.isInteger(m) && m >= 1 ? Math.min(ABS_MAX, m) : DEFAULT_MAX;
};

const validParticle = (p) => isObj(p) && typeof p.s === 'string' && typeof p.z === 'string';

/** { zoneId: { speciesId: count } } of an answer (only well-formed particles count). */
export function countParticles(answer) {
  const out = {};
  for (const p of Array.isArray(answer) ? answer.filter(validParticle) : []) {
    out[p.z] = out[p.z] || {};
    out[p.z][p.s] = (out[p.z][p.s] || 0) + 1;
  }
  return out;
}

/** Target count for one zone/species cell (0 when not listed). */
export const targetOf = (q, zone, species) => {
  const n = Number(q && isObj(q.targets) && isObj(q.targets[zone]) ? q.targets[zone][species] : 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Spread `n` particles over a zone as a neat jittered grid (deterministic, fractions 0.08-0.92). */
export function gridPositions(n, offset = 0) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const k = i + offset;
    const jx = (((k * 37) % 11) - 5) / 5 * (0.25 / cols);
    const jy = (((k * 53) % 13) - 6) / 6 * (0.25 / rows);
    out.push({ x: Math.min(0.92, Math.max(0.08, 0.08 + (c + 0.5) / cols * 0.84 + jx)), y: Math.min(0.92, Math.max(0.08, 0.08 + (r + 0.5) / rows * 0.84 + jy)) });
  }
  return out;
}

/** The answer key as a list of particles with positions, for drawing the key in review. */
export function keyParticles(q) {
  const out = [];
  for (const z of zonesOf(q)) {
    const list = [];
    for (const sp of speciesOf(q)) for (let i = 0; i < targetOf(q, z.id, sp.id); i++) list.push(sp.id);
    gridPositions(list.length).forEach((pos, i) => out.push({ s: list[i], z: z.id, x: pos.x, y: pos.y }));
  }
  return out;
}

const labelOf = (q, id) => {
  const sp = speciesOf(q).find((s) => s.id === id);
  return sp ? str(sp.label) || id : id;
};
const zoneLabel = (q, id) => {
  const z = zonesOf(q).find((x) => x.id === id);
  return z ? str(z.label) || id : id;
};

function countsText(q, counts) {
  const zones = zonesOf(q);
  return zones.map((z) => {
    const parts = speciesOf(q).map((sp) => [sp, (counts[z.id] || {})[sp.id] || 0]).filter(([, n]) => n > 0)
      .map(([sp, n]) => `${n} ${str(sp.label) || sp.id}`);
    const body = parts.length ? parts.join(', ') : 'empty';
    return zones.length > 1 ? `${zoneLabel(q, z.id)}: ${body}` : body;
  }).join('; ');
}

export const def = {
  type: 'particles',
  label: 'Particle diagram',
  shortLabel: 'Particles',
  group: 'Diagrams & graphs',

  normalize(q) {
    q.species = (Array.isArray(q.species) ? q.species : []).map((s, i) => {
      const src = isObj(s) ? s : { label: s };
      const tone = Number(src.tone);
      return { ...src, id: str(src.id).trim(), label: str(src.label),
        shape: SHAPES.includes(src.shape) ? src.shape : SHAPES[i % SHAPES.length], tone: TONES.includes(tone) ? tone : TONES[i % TONES.length] };
    });
    q.zones = (Array.isArray(q.zones) ? q.zones : []).map((z) => {
      const src = isObj(z) ? z : { id: z, label: z };
      return { ...src, id: str(src.id).trim(), label: str(src.label) };
    });
    q.targets = isObj(q.targets) ? q.targets : {};
    q.partialCredit = q.partialCredit === undefined || q.partialCredit === null ? true : Boolean(q.partialCredit);
    if (q.maxPerZone !== undefined && q.maxPerZone !== '') q.maxPerZone = Number(q.maxPerZone);
  },

  validate(q, where, errors) {
    const species = Array.isArray(q.species) ? q.species : [];
    if (species.length < 1) errors.push(`${where}: add at least one species to the palette.`);
    const sIds = new Set();
    species.forEach((s, i) => {
      const n = i + 1;
      if (!isObj(s)) { errors.push(`${where}: species ${n} must be an object.`); return; }
      if (!s.id) errors.push(`${where}: species ${n} needs an id.`);
      else if (!ID_RE.test(s.id)) errors.push(`${where}: species ${n} id may only contain letters, digits, "_" and "-".`);
      else if (sIds.has(s.id)) errors.push(`${where}: duplicate species id "${s.id}".`);
      else sIds.add(s.id);
      if (!str(s.label).trim()) errors.push(`${where}: species ${n} needs a label (the name students see, for example "H2").`);
      if (!SHAPES.includes(s.shape)) errors.push(`${where}: species ${n} shape must be one of ${SHAPES.join(', ')}.`);
      if (!TONES.includes(s.tone)) errors.push(`${where}: species ${n} tone must be a whole number from 1 to 6.`);
    });
    const zones = Array.isArray(q.zones) ? q.zones : [];
    const zIds = new Set();
    zones.forEach((z, i) => {
      const n = i + 1;
      if (!isObj(z)) { errors.push(`${where}: zone ${n} must be an object.`); return; }
      if (!z.id) errors.push(`${where}: zone ${n} needs an id.`);
      else if (!ID_RE.test(z.id)) errors.push(`${where}: zone ${n} id may only contain letters, digits, "_" and "-".`);
      else if (zIds.has(z.id)) errors.push(`${where}: duplicate zone id "${z.id}".`);
      else zIds.add(z.id);
      if (!str(z.label).trim()) errors.push(`${where}: zone ${n} needs a label.`);
    });
    if (zones.length > 4) errors.push(`${where}: use at most 4 zones.`);
    if (!zones.length) zIds.add('box');
    if (q.maxPerZone !== undefined && (!Number.isInteger(q.maxPerZone) || q.maxPerZone < 1 || q.maxPerZone > ABS_MAX)) errors.push(`${where}: maxPerZone must be a whole number from 1 to ${ABS_MAX}.`);
    const cap = maxPerZone(q);
    let total = 0;
    if (!isObj(q.targets)) errors.push(`${where}: targets must be an object like { "box": { "h2": 4 } }.`);
    else {
      for (const [z, row] of Object.entries(q.targets)) {
        if (!zIds.has(z)) { errors.push(`${where}: targets lists an unknown zone "${z}".`); continue; }
        if (!isObj(row)) { errors.push(`${where}: targets for zone "${z}" must be an object of species counts.`); continue; }
        for (const [s, n] of Object.entries(row)) {
          if (!sIds.has(s)) errors.push(`${where}: targets for zone "${z}" lists an unknown species "${s}".`);
          else if (!Number.isInteger(n) || n < 0 || n > cap) errors.push(`${where}: target of "${s}" in "${z}" must be a whole number from 0 to ${cap}.`);
          else total += n;
        }
      }
    }
    if (species.length && total < 1) errors.push(`${where}: targets need at least one particle.`);
  },

  blank(base) {
    return {
      ...base, text: 'Draw the box after the reaction is complete: place 4 particles of H₂O.', partialCredit: true, maxPerZone: 12,
      species: [{ id: 'h2o', label: 'H₂O', shape: 'circle', tone: 1 }, { id: 'o2', label: 'O₂', shape: 'square', tone: 2 }],
      zones: [{ id: 'box', label: 'Box' }], targets: { box: { h2o: 4 } },
    };
  },

  isAnswered: (q, answer) => Array.isArray(answer) && answer.some(validParticle),

  score(q, answer) {
    const counts = countParticles(answer);
    let cells = 0;
    let right = 0;
    for (const z of zonesOf(q)) {
      for (const sp of speciesOf(q)) {
        const t = targetOf(q, z.id, sp.id);
        const got = (counts[z.id] || {})[sp.id] || 0;
        if (t === 0 && got === 0) continue;
        cells++;
        if (t === got) right++;
      }
    }
    if (!cells) return { fraction: 0, full: false };
    if (right === cells) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / cells, full: false };
  },

  answerText(q, answer) {
    return Array.isArray(answer) && answer.some(validParticle) ? countsText(q, countParticles(answer)) : DASH;
  },

  keyText(q) {
    const counts = {};
    for (const z of zonesOf(q)) for (const sp of speciesOf(q)) { const t = targetOf(q, z.id, sp.id); if (t) { counts[z.id] = counts[z.id] || {}; counts[z.id][sp.id] = t; } }
    return countsText(q, counts);
  },

  correctAnswer: (q) => keyParticles(q),
};

registerType(def);
export { labelOf };
export default def;
