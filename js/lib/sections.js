// Assessment sections (V2-04) and per-test reference resources (V2-02). Pure functions, no DOM.
//
//   test.sections    [{ id, title, instructions }]      optional named sections, in display order
//   question.section  section id, or absent / ""         unsectioned questions are allowed
//
// Canonical order (used everywhere: builder, runner, results, grading, export): unsectioned questions
// first, then each section in `test.sections` order; inside a group, questions keep their relative order
// from `test.questions`. normalizeTest() stores `questions` in this order, so index order == display order.
//
// Section point totals are CALCULATED (sum of the section's question points), never set by hand.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (x) => Math.round(x * 100) / 100;

/** Section ids of the test (a Set), ignoring malformed entries. */
export function sectionIds(test) {
  return new Set((Array.isArray(test?.sections) ? test.sections : []).filter(isObj).map((s) => String(s.id)));
}

/** Questions in canonical order (returns a new array; questions are not copied). */
export function orderQuestions(test) {
  const qs = Array.isArray(test?.questions) ? test.questions : [];
  const ids = sectionIds(test);
  if (!ids.size) return qs.slice();
  const order = (Array.isArray(test.sections) ? test.sections : []).filter(isObj).map((s) => String(s.id));
  const rank = (q) => (q && q.section && ids.has(q.section) ? order.indexOf(q.section) + 1 : 0);
  return qs.map((q, i) => ({ q, i, r: rank(q) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.q);
}

/**
 * Groups for display, in canonical order: [{ section: Section|null, questions: Question[], points: number }].
 * The unsectioned group (section null) comes first and is omitted when empty; empty sections are kept
 * (so authors see them) unless { skipEmpty: true }.
 */
export function groupQuestions(test, { skipEmpty = false } = {}) {
  const qs = orderQuestions(test);
  const ids = sectionIds(test);
  const groups = [];
  const loose = qs.filter((q) => !(q && q.section && ids.has(q.section)));
  if (loose.length) groups.push({ section: null, questions: loose, points: pointsOf(loose) });
  for (const s of (Array.isArray(test?.sections) ? test.sections : []).filter(isObj)) {
    const list = qs.filter((q) => q && q.section === s.id);
    if (skipEmpty && !list.length) continue;
    groups.push({ section: s, questions: list, points: pointsOf(list) });
  }
  return groups;
}

function pointsOf(list) {
  return round2(list.reduce((s, q) => s + (Number(q?.points) || 0), 0));
}

/** Calculated point total of one section (0 for an unknown id). */
export function sectionPoints(test, sectionId) {
  return pointsOf((Array.isArray(test?.questions) ? test.questions : []).filter((q) => q && q.section === sectionId));
}

/** The section object a question belongs to, or null. */
export function sectionOf(test, questionId) {
  const q = (Array.isArray(test?.questions) ? test.questions : []).find((x) => x && x.id === questionId);
  if (!q || !q.section) return null;
  return (Array.isArray(test.sections) ? test.sections : []).find((s) => isObj(s) && s.id === q.section) || null;
}

/** 'sec1', 'sec2', ... first unused. */
export function nextSectionId(sections) {
  const used = new Set((Array.isArray(sections) ? sections : []).map((s) => s && s.id));
  let n = 1;
  while (used.has(`sec${n}`)) n++;
  return `sec${n}`;
}

/* ------------------------------------------------------------------ references (V2-02) */

// Reference = { id, type: 'periodic-table', title? }
//           | { id, type: 'text',  title, content }          content: richText (KaTeX allowed), e.g. constants
//           | { id, type: 'image', title, url, alt }         url: https:// or a site-relative path
//           | { id, type: 'resources', title, items: [{ name, value, unit }] }   per-test values: constants, conversions… (V2 patch 1;
//             the legacy type name 'constants' is accepted and normalized to 'resources')
//             value / unit are richText (KaTeX allowed), e.g. value "$6.02 \times 10^{23}$", unit "mol$^{-1}$"
export const REFERENCE_TYPES = ['periodic-table', 'resources', 'text', 'image'];
export const REFERENCE_LABELS = { 'periodic-table': 'Periodic table', resources: 'Resources', text: 'Text', image: 'Image' };

/** Starting rows for a new Resources reference (classroom values; teachers edit them per test). */
export const DEFAULT_RESOURCES = [
  { name: "Avogadro's number", value: '$6.02 \\times 10^{23}$', unit: 'mol$^{-1}$' },
  { name: 'Molar volume of a gas at STP', value: '22.4', unit: 'L/mol' },
  { name: 'STP', value: '0 °C (273 K), 1 atm', unit: '' },
  { name: 'Ideal gas constant, R', value: '0.0821', unit: 'L·atm/(mol·K)' },
  { name: 'Ideal gas constant, R', value: '8.31', unit: 'J/(mol·K)' },
  { name: 'Specific heat of water', value: '4.18', unit: 'J/(g·°C)' },
];

/** Title shown on the pane tab. */
export function referenceTitle(ref) {
  const t = isObj(ref) && typeof ref.title === 'string' ? ref.title.trim() : '';
  return t || REFERENCE_LABELS[ref?.type] || 'Reference';
}

/** Safe image URL (https, or a relative path without a scheme); '' when unsafe. */
/**
 * Turn common share links into direct image links: http -> https, Google Drive file links -> the Drive thumbnail
 * endpoint (works for files shared "Anyone with the link"), Dropbox ?dl=0 -> ?raw=1. Anything else is returned trimmed.
 */
export function normalizeImageUrl(url) {
  let s = String(url ?? '').trim();
  if (!s) return '';
  if (/^http:\/\//i.test(s)) s = `https://${s.slice(7)}`;
  const drive = s.match(/^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/([\w-]{10,})|(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,}))/i);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1] || drive[2]}&sz=w2000`;
  if (/^https:\/\/(?:www\.)?dropbox\.com\//i.test(s)) return s.replace(/([?&])dl=0\b/, '$1raw=1');
  return s;
}

/** Inline uploaded pictures (raster only; SVG data URLs are not accepted). */
const DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

export function safeImageUrl(url) {
  const s = normalizeImageUrl(url);
  if (!s) return '';
  if (DATA_IMAGE_RE.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
  return s;
}

/** 'ref1', 'ref2', ... first unused. */
export function nextReferenceId(refs) {
  const used = new Set((Array.isArray(refs) ? refs : []).map((r) => r && r.id));
  let n = 1;
  while (used.has(`ref${n}`)) n++;
  return `ref${n}`;
}
