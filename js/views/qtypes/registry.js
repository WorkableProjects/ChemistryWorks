// V4-03 UI registry for v4 question types (see js/lib/qtypes/registry.js for the pure side).
//   {
//     type,
//     widget(q, api) -> { el, refresh(answer), focus() },        // student widget; same contract as js/views/runner/widgets.js
//                                                               // (api.get(id), api.set(id, value, { debounce })).
//     editor(q, redraw, changed, uid) -> Node,                  // builder editor; same contract as js/views/admin/editors/core.js
//     review(q, answer, { key: boolean, size: 'sm'|'md' }) -> Node|null,   // optional visual for results / grading / export
//   }
const UI = new Map();

export function registerTypeUI(def) {
  if (def && def.type) UI.set(def.type, def);
}

export function typeUI(type) {
  return UI.get(type) || null;
}
