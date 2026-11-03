// Pure helpers for the `hotspot` question type (V3-05). Answer shape: { labelId: { x, y } } with x, y as
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
