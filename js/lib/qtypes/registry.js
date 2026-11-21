// Question-type registry. A type is a definition module (js/lib/qtypes/<type>.js: pure, no DOM, loaded statically by
// js/lib/qtypes/index.js), a UI module (js/views/qtypes/<type>.js) and an editor module
// (js/views/admin/editors/<type>.js), the last two loaded lazily with loadTypeUI / loadTypeEditor. See "TypeDef" in
// docs/ARCHITECTURE.md for the full contract.
//
// Definition, every function required unless marked optional:
//   {
//     type: 'mcq', label, shortLabel, group: 'Basics'|'Match & sort'|'Chemistry'|'Diagrams & graphs',
//     manual: false,                                   // teacher graded
//     layout: 'split' | 'wide',                        // optional, default 'split'; 'wide' = answer area takes the full width
//     normalize(q, H),                                 // mutate q in place; q.type/id/points/text already done
//     validate(q, where, errors, H),                   // push `${where}: ...`; never throw
//     blank(base) -> question,                         // builder "Add question" template
//     isAnswered(q, answer) -> boolean,
//     grade(q, answer, H) -> { fraction: 0..1, full },
//     format(q, answer) -> string,                     // the student's answer as text
//     keyText(q) -> string,                            // the correct answer as text
//     correctAnswer(q) -> any,                         // stored as `correctAnswer` in graded results
//     toPdf(q, answer, H) -> string[],                 // optional; lines for the PDF / print export. Default [format(q, answer)]
//     isManual(q) -> boolean,                          // optional; per-question teacher grading (structure with studentCharges); replaces `manual`
//     resultExtras(q) -> object,                       // optional; extra fields copied onto each graded result row (open: rubric)
//   }
// H is the helper bag the callers pass in, so type modules never import schema.js / grading.js:
//   { normalizeQuestion, validateQuestion, gradeQuestion, isAnswered, formatAnswer, correctAnswerText, parseNumber }

import { ensureCssAll, pendingCss } from '../css-loader.js';

const DEFS = new Map();

export function registerType(def) {
  if (!def || typeof def.type !== 'string' || !def.type) return;
  if (def.layout !== 'wide') def.layout = 'split';
  DEFS.set(def.type, def);
}

/** 'split' or 'wide': how the student question view lays the type out (default 'split'). */
export function typeLayout(type) {
  return DEFS.get(type)?.layout === 'wide' ? 'wide' : 'split';
}

/** The definition for a registered type, or null for an unknown type. */
export function typeDef(type) {
  return DEFS.get(type) || null;
}

export function registeredTypes() {
  return [...DEFS.keys()];
}

/* ------------------------------------------------------------------ UI and editor modules (lazy) */

const UI = new Map();       // type -> UI module, once loaded
const EDITORS = new Map();  // type -> editor module, once loaded
const UI_PROMISES = new Map();
const EDITOR_PROMISES = new Map();

/** Older UI modules register themselves with { type, widget, editor, review }; newer ones export { type, render, review }. */
export function registerTypeUI(def) {
  if (def && def.type) UI.set(def.type, def);
}

// Each entry is a static import() so the paths stay relative and analysable.
const UI_LOADERS = {
  mcq: () => import('../../views/qtypes/mcq.js'),
  multi: () => import('../../views/qtypes/multi.js'),
  truefalse: () => import('../../views/qtypes/truefalse.js'),
  numeric: () => import('../../views/qtypes/numeric.js'),
  formula: () => import('../../views/qtypes/formula.js'),
  matching: () => import('../../views/qtypes/matching.js'),
  ordering: () => import('../../views/qtypes/ordering.js'),
  fillblank: () => import('../../views/qtypes/fillblank.js'),
  categorize: () => import('../../views/qtypes/categorize.js'),
  balance: () => import('../../views/qtypes/balance.js'),
  econfig: () => import('../../views/qtypes/econfig.js'),
  ptable: () => import('../../views/qtypes/ptable.js'),
  sigfigs: () => import('../../views/qtypes/sigfigs.js'),
  hotspot: () => import('../../views/qtypes/hotspot.js'),
  lewis: () => import('../../views/qtypes/lewis.js'),
  structure: () => import('../../views/qtypes/structure.js'),
  orbital: () => import('../../views/qtypes/orbital.js'),
  graph: () => import('../../views/qtypes/graph.js'),
  short: () => import('../../views/qtypes/short.js'),
  open: () => import('../../views/qtypes/open.js'),
  multipart: () => import('../../views/qtypes/multipart.js'),
  naming: () => import('../../views/qtypes/naming.js'),
  dropdown: () => import('../../views/qtypes/dropdown.js'),
  dimensional: () => import('../../views/qtypes/dimensional.js'),
  nuclear: () => import('../../views/qtypes/nuclear.js'),
  reaction: () => import('../../views/qtypes/reaction.js'),
  vsepr: () => import('../../views/qtypes/vsepr.js'),
  datatable: () => import('../../views/qtypes/datatable.js'),
  molarmass: () => import('../../views/qtypes/molarmass.js'),
  imagechoice: () => import('../../views/qtypes/imagechoice.js'),
  particles: () => import('../../views/qtypes/particles.js'),
  titration: () => import('../../views/qtypes/titration.js'),
  estimate: () => import('../../views/qtypes/estimate.js'),
  ionicformula: () => import('../../views/qtypes/ionicformula.js'),
  isotopemass: () => import('../../views/qtypes/isotopemass.js'),
  ionbuilder: () => import('../../views/qtypes/ionbuilder.js'),
  heatcurve: () => import('../../views/qtypes/heatcurve.js'),
  oxidation: () => import('../../views/qtypes/oxidation.js'),
  solubility: () => import('../../views/qtypes/solubility.js'),
  bohr: () => import('../../views/qtypes/bohr.js'),
  molbuild: () => import('../../views/qtypes/molbuild.js'),
  gaslaw: () => import('../../views/qtypes/gaslaw.js'),
};

const EDITOR_LOADERS = {
  mcq: () => import('../../views/admin/editors/mcq.js'),
  multi: () => import('../../views/admin/editors/multi.js'),
  truefalse: () => import('../../views/admin/editors/truefalse.js'),
  numeric: () => import('../../views/admin/editors/numeric.js'),
  formula: () => import('../../views/admin/editors/formula.js'),
  matching: () => import('../../views/admin/editors/matching.js'),
  ordering: () => import('../../views/admin/editors/ordering.js'),
  fillblank: () => import('../../views/admin/editors/fillblank.js'),
  categorize: () => import('../../views/admin/editors/categorize.js'),
  balance: () => import('../../views/admin/editors/balance.js'),
  econfig: () => import('../../views/admin/editors/econfig.js'),
  ptable: () => import('../../views/admin/editors/ptable.js'),
  sigfigs: () => import('../../views/admin/editors/sigfigs.js'),
  hotspot: () => import('../../views/admin/editors/hotspot.js'),
  lewis: () => import('../../views/admin/editors/lewis.js'),
  structure: () => import('../../views/admin/editors/structure.js'),
  orbital: () => import('../../views/admin/editors/orbital.js'),
  graph: () => import('../../views/admin/editors/graph.js'),
  short: () => import('../../views/admin/editors/short.js'),
  open: () => import('../../views/admin/editors/open.js'),
};

/* ------------------------------------------------------------------ stylesheets */

// Types that have their own css/qt-<type>.css. A unit test keeps this list in step with the css folder.
export const QT_SHEETS = [
  'balance', 'bohr', 'categorize', 'datatable', 'dimensional', 'dropdown', 'econfig', 'estimate', 'fillblank', 'formula',
  'gaslaw', 'heatcurve', 'hotspot', 'imagechoice', 'ionbuilder', 'ionicformula', 'isotopemass', 'matching', 'molarmass',
  'molbuild', 'multipart', 'naming', 'nuclear', 'ordering', 'oxidation', 'particles', 'ptable', 'reaction', 'solubility',
  'titration', 'truefalse', 'vsepr',
];
const DIAGRAM_TYPES = new Set(['lewis', 'structure', 'orbital']);

/** Stylesheets a question of this type needs: the shared question styles, its own sheet, and diagrams where it draws them. */
export function typeCssNames(type) {
  const names = ['runner', 'qtypes'];
  if (QT_SHEETS.includes(type)) names.push(`qt-${type}`);
  if (DIAGRAM_TYPES.has(type)) names.push('diagrams');
  return names;
}

/** True when a UI module exists for this type (loaded or loadable). */
export function hasTypeUI(type) {
  return UI.has(type) || Object.hasOwn(UI_LOADERS, type);
}

/** The UI module, synchronously, once loadTypeUI(type) has resolved; null before that. */
export function typeUI(type) {
  const ui = UI.get(type) || null;
  if (ui) ensureCssAll(typeCssNames(type));
  return ui;
}

/** The editor module `{ type, edit(editorCtx) }`, synchronously, once loaded; null before that. */
export function typeEditorModule(type) {
  if (EDITORS.has(type)) return EDITORS.get(type);
  // Older UI modules carry their editor as `editor(q, redraw, changed, uid)`.
  const ui = UI.get(type);
  if (ui && typeof ui.editor === 'function') {
    const mod = { type, edit: ({ q, redraw, changed, uid }) => ui.editor(q, redraw, changed, uid) };
    EDITORS.set(type, mod);
    return mod;
  }
  return null;
}

/** Loads (once) the UI module for a type. Rejects with `unknown_type:<type>` for a type nothing is registered for. */
export function loadTypeUI(type) {
  if (UI_PROMISES.has(type)) return UI_PROMISES.get(type);
  const load = Object.hasOwn(UI_LOADERS, type) ? UI_LOADERS[type] : null;
  if (!load) return Promise.reject(new Error(`unknown_type:${type}`));
  const p = Promise.all([load(), ensureCssAll(typeCssNames(type))]).then(([m]) => {
    if (m && m.default && typeof m.default === 'object') UI.set(type, m.default);
    return UI.get(type);
  });
  UI_PROMISES.set(type, p);
  p.catch(() => UI_PROMISES.delete(type));
  return p;
}

/** Loads (once) the editor module for a type. Rejects with `unknown_type:<type>` for an unknown type. */
export function loadTypeEditor(type) {
  if (EDITOR_PROMISES.has(type)) return EDITOR_PROMISES.get(type);
  let p;
  if (Object.hasOwn(EDITOR_LOADERS, type)) {
    p = EDITOR_LOADERS[type]().then((m) => { EDITORS.set(type, m.default); return m.default; });
  } else if (Object.hasOwn(UI_LOADERS, type)) {
    p = loadTypeUI(type).then(() => typeEditorModule(type));
  } else {
    return Promise.reject(new Error(`unknown_type:${type}`));
  }
  EDITOR_PROMISES.set(type, p);
  p.catch(() => EDITOR_PROMISES.delete(type));
  return p;
}

/** Every type used by these questions, including the parts of multipart questions. */
function typesIn(questions, out = new Set()) {
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q || typeof q.type !== 'string') continue;
    out.add(q.type);
    if (Array.isArray(q.parts)) typesIn(q.parts, out);
  }
  return out;
}

/**
 * Loads the UI module and stylesheets of every type these questions use. Returns null when they are all loaded already (so a caller can
 * carry on synchronously), else a promise that never rejects.
 */
export function preloadQuestionTypes(questions) {
  const types = [...typesIn(questions)].filter(hasTypeUI);
  const wanted = types.filter((t) => !UI.has(t));
  const sheets = pendingCss(types.flatMap(typeCssNames));
  if (!wanted.length && !sheets) return null;
  const jobs = wanted.map((t) => loadTypeUI(t).catch(() => null));
  if (sheets) jobs.push(sheets);
  return Promise.all(jobs).then(() => undefined);
}
