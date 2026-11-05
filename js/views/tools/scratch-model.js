// Scratchpad data model (V4-05). Per question: { text, strokes }. Strokes are arrays of [x, y] integer points on a
// fixed logical canvas (SCRATCH_W x SCRATCH_H) so they redraw at any size. Saved with progress, never submitted.

export const SCRATCH_W = 400;
export const SCRATCH_H = 240;
export const MAX_TEXT = 4000;
export const MAX_STROKES = 200;
export const MAX_POINTS = 600;

const num = (v) => Math.max(0, Math.round(Number(v) || 0));

export function normalizeStroke(raw) {
  if (!Array.isArray(raw)) return null;
  const pts = raw.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .slice(0, MAX_POINTS).map((p) => [Math.min(SCRATCH_W, num(p[0])), Math.min(SCRATCH_H, num(p[1]))]);
  return pts.length ? pts : null;
}

export function normalizeScratch(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    text: String(r.text ?? '').slice(0, MAX_TEXT),
    strokes: (Array.isArray(r.strokes) ? r.strokes : []).map(normalizeStroke).filter(Boolean).slice(-MAX_STROKES),
  };
}

export const isEmptyScratch = (s) => !s || (!String(s.text || '').trim() && !(s.strokes || []).length);

/** Whole map { qid: scratch } for storage: unknown questions and empty pads are dropped. */
export function normalizeScratchMap(raw, validIds) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const ok = validIds ? new Set(validIds) : null;
  for (const [id, v] of Object.entries(raw)) {
    if (ok && !ok.has(id)) continue;
    const n = normalizeScratch(v);
    if (!isEmptyScratch(n)) out[id] = n;
  }
  return out;
}

export function addStroke(scratch, stroke) {
  const s = normalizeScratch(scratch);
  const st = normalizeStroke(stroke);
  if (st) s.strokes = [...s.strokes, st].slice(-MAX_STROKES);
  return s;
}

export function undoStroke(scratch) {
  const s = normalizeScratch(scratch);
  s.strokes = s.strokes.slice(0, -1);
  return s;
}
