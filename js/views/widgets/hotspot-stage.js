// Shared read-only stage for `hotspot` questions (FIX-3): the picture with numbered pins, used by results,
// the grading view and the PDF export. Same geometry as the student widget and the teacher editor
// (.q-hot__stage > .q-hot__frame > img + pins, all positioned in % of the frame, which is exactly the rendered
// picture), so a pin sits on the same spot of the picture everywhere.
import { h } from '../../ui.js';
import { safeImageUrl } from '../../lib/sections.js';
import { hotspotRadius, labelHit } from '../../lib/qtypes/hotspot.js';

const isPoint = (p) => p && typeof p === 'object' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y));
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n)));

/**
 * Read-only picture with numbered pins.
 *   q       hotspot question
 *   points  { labelId: {x,y} } to draw (student answer), or null to draw the answer key (label x/y)
 *   opts    { size: 'sm'|'md'|'lg' (max width 280/420/640 px), showTargets: boolean (accepted-distance circles at the
 *            key positions), marks: boolean (colour + check / cross glyph per pin; never colour alone),
 *            label: string (aria-label) }
 * Returns .q-hot__stage.q-hot__stage--static > .q-hot__frame > img + pins (+ circles), plus a numbered legend.
 */
export function hotspotDiagram(q, points, opts = {}) {
  const { size = 'md', showTargets = false, marks = false, label = 'Label the diagram' } = opts;
  const url = q && q.image && safeImageUrl(q.image.url);
  if (!url) return h('p', { class: 'muted' }, 'No image set for this question.');
  const labels = Array.isArray(q.labels) ? q.labels : [];
  const radius = hotspotRadius(q);
  const key = points == null;
  const given = !key && typeof points === 'object' && !Array.isArray(points) ? points : {};

  const state = labels.map((l) => {
    const p = key ? { x: l.x, y: l.y } : given[l.id];
    const placed = isPoint(p);
    return { l, p: placed ? { x: clamp01(p.x), y: clamp01(p.y) } : null, ok: placed && !key ? labelHit(l, p, radius) : null };
  });

  const circles = showTargets ? labels.filter((l) => isPoint(l)).map((l) => h('span', {
    class: 'q-hot__target', 'aria-hidden': 'true',
    style: `left:${clamp01(l.x) * 100}%;top:${clamp01(l.y) * 100}%;width:calc(${radius} * 200%)`,
  })) : [];

  const pins = state.map(({ l, p, ok }, i) => {
    if (!p) return null;
    const judged = marks && !key;
    return h('span', {
      class: ['q-hot__pin', 'q-hot__pin--static', judged && (ok ? 'q-hot__pin--ok' : 'q-hot__pin--bad'), key && 'q-hot__pin--key'],
      style: `left:${p.x * 100}%;top:${p.y * 100}%`,
      dataset: { testid: `hotspot-pin-${key ? 'key' : 'ans'}-${l.id}`, labelId: l.id },
    }, String(i + 1), judged ? h('span', { class: 'q-hot__mark', 'aria-hidden': 'true' }, ok ? '✓' : '✗') : null);
  }).filter(Boolean);

  const img = h('img', { class: 'q-hot__img', src: url, alt: (q.image && q.image.alt) || '', draggable: 'false', decoding: 'async', referrerpolicy: 'no-referrer' });
  const stage = h('div', { class: `q-hot__stage q-hot__stage--static q-hot__stage--${size}`, role: 'img', 'aria-label': label, dataset: { testid: 'hotspot-diagram' } },
    h('div', { class: 'q-hot__frame' }, img, circles, pins));

  const legend = h('ol', { class: 'q-hot__legend' }, state.map(({ l, p, ok }) => h('li', {},
    h('span', {}, l.text),
    key ? null
      : !p ? h('span', { class: 'q-hot__verdict q-hot__verdict--none' }, ' — not placed')
        : marks ? h('span', { class: `q-hot__verdict q-hot__verdict--${ok ? 'ok' : 'bad'}` }, ok ? ' — ✓ correct' : ' — ✗ wrong spot')
          : null)));

  return h('div', { class: 'q-hot__diagram', dataset: { testid: 'hotspot-diagram-wrap' } }, stage, legend);
}
