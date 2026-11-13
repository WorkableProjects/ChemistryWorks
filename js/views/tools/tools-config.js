// Which student tools a test turns on. Pure.
//   toolsFor(test, { enabled, accommodations }) -> { calculator, constants, scratchpad, highlighter, readAloud }
// `enabled` is true; with it off every tool is off. test.tools = { calculator, constants, scratchpad,
// Highlighter, readAloud } (booleans). A student's accommodation can switch read-aloud on: accommodations.readAloud.

export const TOOL_KEYS = ['calculator', 'constants', 'scratchpad', 'highlighter', 'readAloud'];

export function toolsFor(test, { enabled = false, accommodations = null } = {}) {
  const out = Object.fromEntries(TOOL_KEYS.map((k) => [k, false]));
  if (!enabled) return out;
  const t = test && test.tools && typeof test.tools === 'object' ? test.tools : {};
  for (const k of TOOL_KEYS) out[k] = t[k] === true;
  if (accommodations && accommodations.readAloud === true) out.readAloud = true;
  return out;
}

export const anyTool = (tools) => TOOL_KEYS.some((k) => tools && tools[k]);
