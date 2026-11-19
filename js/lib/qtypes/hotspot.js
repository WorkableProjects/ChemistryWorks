import { registerType } from './registry.js';
import { str, bool, isNum, nonEmptyStr } from './shared.js';

// `hotspot` ("Label the diagram") and its pure helpers. Answer shape: { labelId: { x, y } } with x, y as
// fractions (0-1) of the image width / height. A label is right when the distance to its target, measured in those
// fractions, is at most `radius` (a fraction of the image width; on a non-square image the hit area is slightly oval).

export const DEFAULT_RADIUS = 0.06;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPoint = (p) => isObj(p) && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));

export const hotspotRadius = (q) => (Number(q.radius) > 0 ? Number(q.radius) : DEFAULT_RADIUS);

export function isHotspotAnswered(answer) {
  return isObj(answer) && Object.values(answer).some(isPoint);
}

export function labelHit(label, point, radius) {
  if (!isPoint(point)) return false;
  return Math.hypot(Number(point.x) - Number(label.x), Number(point.y) - Number(label.y)) <= radius + 1e-9;
}

export function scoreHotspot(q, answer) {
  const labels = Array.isArray(q.labels) ? q.labels : [];
  if (!labels.length || !isObj(answer)) return { fraction: 0, full: false };
  const r = hotspotRadius(q);
  const right = labels.filter((l) => labelHit(l, answer[l.id], r)).length;
  if (right === labels.length) return { fraction: 1, full: true };
  return { fraction: q.partialCredit === false ? 0 : right / labels.length, full: false };
}

const pct = (n) => `${Math.round(Number(n) * 100)}%`;

export function hotspotText(q, answer) {
  const a = isObj(answer) ? answer : {};
  return (q.labels || []).map((l) => `${l.text}: ${isPoint(a[l.id]) ? `(${pct(a[l.id].x)}, ${pct(a[l.id].y)})` : '—'}`).join('; ');
}

export function hotspotKeyText(q) {
  return (q.labels || []).map((l) => `${l.text}: (${pct(l.x)}, ${pct(l.y)})`).join('; ') || '—';
}

export const def = {
  type: 'hotspot',
  label: 'Label the diagram',
  shortLabel: 'Label diagram',
  group: 'Diagrams & graphs',
  manual: false,
  layout: 'wide',

  normalize(q) {
    q.labels = (Array.isArray(q.labels) ? q.labels : []).map((l) => {
      const src = isObj(l) ? l : { id: l, text: l };
      const num = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);
      return { ...src, id: str(src.id).trim(), text: str(src.text), x: num(src.x), y: num(src.y) };
    });
    q.radius = q.radius === undefined || q.radius === null || q.radius === '' ? DEFAULT_RADIUS : Number(q.radius);
    q.partialCredit = bool(q.partialCredit, true);
  },

  validate(q, where, errors) {
    if (!isObj(q.image) || !nonEmptyStr(q.image.url)) errors.push(`${where}: hotspot needs image: { "url": "...", "alt": "..." }.`);
    const labels = Array.isArray(q.labels) ? q.labels : [];
    if (labels.length < 1) errors.push(`${where}: hotspot needs at least 1 label.`);
    const seen = new Set();
    labels.forEach((l, i) => {
      if (!isObj(l) || !nonEmptyStr(l.id)) { errors.push(`${where}: label ${i + 1} needs an id.`); return; }
      if (!nonEmptyStr(l.text)) errors.push(`${where}: label ${i + 1} has empty text.`);
      if (seen.has(l.id)) errors.push(`${where}: duplicate label id "${l.id}".`);
      seen.add(l.id);
      if (!isNum(l.x) || l.x < 0 || l.x > 1 || !isNum(l.y) || l.y < 0 || l.y > 1) errors.push(`${where}: label ${i + 1} ("${l.id}") x and y must be numbers from 0 to 1 (fractions of the image).`);
    });
    if (!isNum(q.radius) || q.radius <= 0 || q.radius > 1) errors.push(`${where}: radius must be a number above 0 and at most 1 (a fraction of the image width).`);
  },

  blank: (base) => ({
    ...base,
    text: 'Place each label on the diagram.',
    partialCredit: true,
    radius: DEFAULT_RADIUS,
    image: { url: 'data/tests/lab-bench.svg', alt: 'A lab bench with a beaker, a flask and a burner', position: 'right' },
    labels: [{ id: 'a', text: 'Beaker', x: 0.25, y: 0.6 }],
  }),

  isAnswered: (q, answer) => isHotspotAnswered(answer),

  grade: (q, answer) => scoreHotspot(q, answer),

  format: (q, answer) => hotspotText(q, answer),

  keyText: (q) => hotspotKeyText(q),

  correctAnswer: (q) => Object.fromEntries((q.labels || []).map((l) => [l.id, { x: l.x, y: l.y }])),
};

registerType(def);
export default def;
