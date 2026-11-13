// `imagechoice` question type: pick the picture(s) that answer the question. Pure definition, no DOM.
//   { type: 'imagechoice', multiple: false, options: [{ id: 'a', text?: 'caption', image: { url, alt } }, ...],
//     correctAnswer: 'a' (single) | ['a', 'c'] (multiple), partialCredit: false (multiple only) }
//   Answer: an option id (single) or an array of option ids (multiple). Every option needs a picture with alt text.
import { registerType } from './registry.js';
import { safeImageUrl } from '../sections.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';

const optionsOf = (q) => (Array.isArray(q && q.options) ? q.options.filter(isObj) : []);

/** Plain name of an option for text exports and aria-labels: caption, else the picture's description. */
export const optionName = (o) => str(o && o.text).trim() || str(o && o.image && o.image.alt).trim() || str(o && o.id);

const idsOf = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map(String);

export const def = {
  type: 'imagechoice',
  label: 'Picture choice',
  shortLabel: 'Picture choice',
  group: 'Diagrams & graphs',

  normalize(q) {
    q.multiple = Boolean(q.multiple);
    q.partialCredit = q.multiple ? Boolean(q.partialCredit) : false;
    q.options = (Array.isArray(q.options) ? q.options : []).map((o, i) => {
      const src = isObj(o) ? o : { text: o };
      const out = { ...src, id: str(src.id).trim() || String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '') };
      if (src.text !== undefined) out.text = str(src.text);
      if (isObj(src.image) && str(src.image.url).trim()) out.image = { url: str(src.image.url).trim(), alt: str(src.image.alt) };
      else delete out.image;
      return out;
    });
    if (q.multiple) q.correctAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : idsOf(q.correctAnswer);
    else if (Array.isArray(q.correctAnswer)) q.correctAnswer = q.correctAnswer.length ? String(q.correctAnswer[0]) : '';
  },

  validate(q, where, errors) {
    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < 2) errors.push(`${where}: add at least two picture options.`);
    const ids = new Set();
    opts.forEach((o, i) => {
      const n = i + 1;
      if (!isObj(o)) { errors.push(`${where}: option ${n} must be an object.`); return; }
      if (typeof o.id !== 'string' || !o.id.trim()) errors.push(`${where}: option ${n} needs an id.`);
      else if (ids.has(o.id)) errors.push(`${where}: duplicate option id "${o.id}".`);
      else ids.add(o.id);
      if (!isObj(o.image) || !safeImageUrl(o.image.url)) errors.push(`${where}: option ${n} needs a picture: image url must start with https://, be a path on this site, or be an uploaded picture.`);
      else if (!str(o.image.alt).trim()) errors.push(`${where}: option ${n} picture needs alt text describing the image.`);
    });
    const a = q.correctAnswer;
    if (q.multiple) {
      if (!Array.isArray(a) || !a.length) errors.push(`${where}: correctAnswer must be a non-empty array of option ids.`);
      else if (a.some((id) => !ids.has(id))) errors.push(`${where}: correctAnswer contains an unknown option id.`);
    } else if (typeof a !== 'string' || !ids.has(a)) errors.push(`${where}: correctAnswer must be the id of one of the options.`);
  },

  blank(base) {
    return {
      ...base, text: 'Which picture shows the correct particle diagram?', multiple: false, partialCredit: false,
      options: [
        { id: 'a', image: { url: 'data/tests/lab-bench.svg', alt: 'Option A picture' } },
        { id: 'b', image: { url: 'data/tests/lab-bench.svg', alt: 'Option B picture' } },
      ],
      correctAnswer: 'a',
    };
  },

  isAnswered: (q, answer) => (q.multiple ? Array.isArray(answer) && answer.length > 0 : typeof answer === 'string' && answer !== ''),

  score(q, answer) {
    const key = new Set(idsOf(q.correctAnswer));
    if (!key.size) return { fraction: 0, full: false };
    if (!q.multiple) return typeof answer === 'string' && key.has(answer) ? { fraction: 1, full: true } : { fraction: 0, full: false };
    if (!Array.isArray(answer)) return { fraction: 0, full: false };
    const picked = new Set(answer.map(String));
    let right = 0;
    let wrong = 0;
    for (const id of picked) (key.has(id) ? right++ : wrong++);
    if (right === key.size && wrong === 0) return { fraction: 1, full: true };
    if (q.partialCredit) return { fraction: Math.max(0, (right - wrong) / key.size), full: false };
    return { fraction: 0, full: false };
  },

  answerText(q, answer) {
    const by = new Map(optionsOf(q).map((o) => [String(o.id), o]));
    const names = idsOf(answer).map((id) => (by.has(id) ? optionName(by.get(id)) : id));
    return names.length ? names.join('; ') : DASH;
  },

  keyText(q) {
    const by = new Map(optionsOf(q).map((o) => [String(o.id), o]));
    const names = idsOf(q.correctAnswer).map((id) => (by.has(id) ? optionName(by.get(id)) : id));
    return names.length ? names.join('; ') : DASH;
  },

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
