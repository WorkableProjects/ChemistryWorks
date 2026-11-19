// Which student tools a test turns on (V4-05). Pure.
//   toolsFor(test, { accommodations }) -> { calculator, constants, scratchpad, highlighter, readAloud }
// test.tools = { calculator, constants, scratchpad, highlighter, readAloud } (booleans). A student's accommodation (S12) can switch read-aloud on: accommodations.readAloud.

export const TOOL_KEYS = ['calculator', 'constants', 'scratchpad', 'highlighter', 'readAloud'];

export function toolsFor(test, { accommodations = null } = {}) {
  const out = Object.fromEntries(TOOL_KEYS.map((k) => [k, false]));
  const t = test && test.tools && typeof test.tools === 'object' ? test.tools : {};
  for (const k of TOOL_KEYS) out[k] = t[k] === true;
  if (accommodations && accommodations.readAloud === true) out.readAloud = true;
  return out;
}

export const anyTool = (tools) => TOOL_KEYS.some((k) => tools && tools[k]);
