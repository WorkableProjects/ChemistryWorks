// `heatcurve` question type: heating / cooling curve. Pure definition, no DOM.
//   { type: 'heatcurve', substance: 'Water', curve: [{ x: 0, y: -20 }, ...],   (heat added vs temperature; >= 2 points)
//     segments: [{ phase: 'solid', process: 'heat' }, ...] }                   (one per gap between points: the key)
//   phase: solid | liquid | gas | solid-liquid | liquid-gas;  process: heat (q = mcΔT) | fus (q = mΔH fus) | vap (q = mΔH vap)
//   Answer: { segments: [{ phase, process }, ...] } in segment order.
//   Score: each label (phase, process) per segment is one mark; fraction = marks right / marks (partialCredit false: all or 0).
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';
export const PHASES = ['solid', 'solid-liquid', 'liquid', 'liquid-gas', 'gas'];
export const PHASE_LABELS = { solid: 'Solid', 'solid-liquid': 'Solid and liquid', liquid: 'Liquid', 'liquid-gas': 'Liquid and gas', gas: 'Gas' };
export const PROCESSES = ['heat', 'fus', 'vap'];
export const PROCESS_LABELS = { heat: 'q = mcΔT', fus: 'q = mΔH fus', vap: 'q = mΔH vap' };
export const MAX_POINTS = 12;

export const DEFAULT_CURVE = [{ x: 0, y: -20 }, { x: 10, y: 0 }, { x: 43, y: 0 }, { x: 85, y: 100 }, { x: 306, y: 100 }, { x: 330, y: 130 }];
export const DEFAULT_SEGMENTS = [
  { phase: 'solid', process: 'heat' }, { phase: 'solid-liquid', process: 'fus' }, { phase: 'liquid', process: 'heat' },
  { phase: 'liquid-gas', process: 'vap' }, { phase: 'gas', process: 'heat' },
];

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
export const segCount = (q) => Math.max(0, (Array.isArray(q.curve) ? q.curve.length : 0) - 1);
/** The answer's segments padded or cut to the question's segment count. */
export function answerSegments(q, a) {
  const list = isObj(a) && Array.isArray(a.segments) ? a.segments : [];
  return Array.from({ length: segCount(q) }, (_, i) => (isObj(list[i]) ? { phase: str(list[i].phase), process: str(list[i].process) } : { phase: '', process: '' }));
}
const segText = (s) => `${PHASE_LABELS[s.phase] || DASH}, ${PROCESS_LABELS[s.process] || DASH}`;

export const def = {
  type: 'heatcurve',
  label: 'Heating or cooling curve',
  shortLabel: 'Heating curve',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.substance = str(q.substance).trim();
    q.curve = (Array.isArray(q.curve) ? q.curve : []).map((p) => (Array.isArray(p) ? { x: num(p[0]), y: num(p[1]) } : { x: num(p && p.x), y: num(p && p.y) }));
    const n = Math.max(0, q.curve.length - 1);
    const src = Array.isArray(q.segments) ? q.segments : [];
    q.segments = Array.from({ length: n }, (_, i) => {
      const s = isObj(src[i]) ? src[i] : {};
      return { phase: PHASES.includes(s.phase) ? s.phase : '', process: PROCESSES.includes(s.process) ? s.process : '' };
    });
    q.partialCredit = q.partialCredit === undefined ? true : Boolean(q.partialCredit);
  },

  validate(q, where, errors) {
    if (q.curve.length < 2) errors.push(`${where}: add at least two points to draw the curve.`);
    if (q.curve.length > MAX_POINTS) errors.push(`${where}: use ${MAX_POINTS} points or fewer.`);
    if (q.curve.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) errors.push(`${where}: every point needs a heat and a temperature.`);
    else if (q.curve.some((p, i) => i > 0 && p.x < q.curve[i - 1].x)) errors.push(`${where}: heat must not go down from one point to the next.`);
    q.segments.forEach((s, i) => {
      if (!s.phase || !s.process) errors.push(`${where}: set the phase and the equation for segment ${i + 1}.`);
    });
  },

  blank(base) {
    return { ...base, text: 'Label each segment of the heating curve with the phase or phases present and the equation that applies.',
      substance: 'Water', curve: DEFAULT_CURVE.map((p) => ({ ...p })), segments: DEFAULT_SEGMENTS.map((s) => ({ ...s })), partialCredit: true };
  },

  isAnswered(q, a) {
    return answerSegments(q, a).some((s) => s.phase || s.process);
  },

  score(q, a) {
    const key = Array.isArray(q.segments) ? q.segments : [];
    const given = answerSegments(q, a);
    const total = key.length * 2;
    if (!total) return { fraction: 0, full: false };
    let right = 0;
    key.forEach((k, i) => { if (given[i].phase === k.phase) right++; if (given[i].process === k.process) right++; });
    if (right === total) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / total, full: false };
  },

  answerText(q, a) {
    return answerSegments(q, a).map((s, i) => `${i + 1}: ${segText(s)}`).join('; ') || DASH;
  },

  keyText(q) {
    return (q.segments || []).map((s, i) => `${i + 1}: ${segText(s)}`).join('; ') || DASH;
  },

  correctAnswer: (q) => ({ segments: (q.segments || []).map((s) => ({ ...s })) }),
};

registerType(def);
export default def;
