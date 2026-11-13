// V4-03 question-type registry. A v4 type is described in one definition module (js/lib/qtypes/<type>.js, pure, no
// DOM) plus one UI module (js/views/qtypes/<type>.js). Shared code — schema.js, grading.js, the runner, the builder,
// results, grading and export — asks the registry before its built-in switch, so adding a type never touches them.
//
// Definition (lib side), every function optional except score:
//   {
//     type: 'naming', label: 'Name ↔ formula', shortLabel: 'Naming', group: 'Basics'|'Match & sort'|'Chemistry'|'Diagrams & graphs',
//     manual: false,                                   // teacher graded (like short/open)
//     normalize(q, H),                                 // mutate q in place (defaults, coercion); q.type/id/points/text already done
//     validate(q, where, errors, H),                   // push human-readable strings: `${where}: …`
//     blank(base) -> question,                         // builder "Add question" template; base = { id, type, text, points, … }
//     isAnswered(q, answer) -> boolean,
//     score(q, answer, H) -> { fraction: 0..1, full: boolean },
//     answerText(q, answer) -> string,                 // student's answer as text (results, CSV, PDF)
//     keyText(q) -> string,                            // correct answer as text
//     correctAnswer(q) -> any,                         // value stored as `correctAnswer` in graded results
//   }
// H (helpers passed in by the callers, so type modules never import schema.js / grading.js and no import cycle forms):
//   { normalizeQuestion(raw) -> q, validateQuestion(q, where, errors), gradeQuestion(q, answer) -> { answered, isCorrect,
//     pointsEarned, pointsPossible, partial }, isAnswered(q, answer), formatAnswer(q, answer), correctAnswerText(q), parseNumber }
//   (validate/normalize receive the schema helpers; score receives the grading helpers.)

const DEFS = new Map();

export function registerType(def) {
  if (!def || typeof def.type !== 'string' || !def.type) return;
  DEFS.set(def.type, def);
}

/** The definition for a registered type, or null for built-in / unknown types. */
export function typeDef(type) {
  return DEFS.get(type) || null;
}

export function registeredTypes() {
  return [...DEFS.keys()];
}
