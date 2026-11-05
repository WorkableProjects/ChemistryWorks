// Per-student test instance (V4-09 algorithmic variables, V4-02 question pools). Pure, no DOM.
// The runner never sees the raw test: js/app.js openTest() calls instantiateTest() with the signed-in student's email,
// so every device (and the admin "Preview as student" with a fake email) gets the same numbers and the same drawn questions.
//
//   studentSeed(email, code) -> string          stable seed: lower-cased email + '|' + upper-cased code
//   instantiateTest(test, { email }) -> test    a deep copy run through every registered step, in order; also sets
//                                              test.instance = { seed, drawn?: [questionIds] , ... } for the payload.
// Steps register with addInstantiateStep(name, fn) from './instantiate-steps.js': fn(testCopy, { seed, email, rand })
// mutates the copy; rand = seeded PRNG (0..1) made per step from seed + name, so steps stay independent.
// './algorithmic.js' (S10) and './pools.js' (S11) register themselves when imported below.

import { instantiateSteps } from './instantiate-steps.js';

export { addInstantiateStep } from './instantiate-steps.js';

export function studentSeed(email, code) {
  return `${String(email || '').trim().toLowerCase()}|${String(code || '').trim().toUpperCase()}`;
}

export function seededRandom(seedString) {
  let seed = 2166136261;
  for (const ch of String(seedString)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}

export function instantiateTest(test, { email = '' } = {}) {
  if (!test || typeof test !== 'object') return test;
  const copy = JSON.parse(JSON.stringify(test));
  const seed = studentSeed(email, copy.code);
  copy.instance = { ...(copy.instance || {}), seed };
  for (const { name, fn } of instantiateSteps()) {
    try { fn(copy, { seed, email, rand: seededRandom(`${seed}#${name}`) }); } catch (e) { console.error(`[instantiate:${name}]`, e); }
  }
  return copy;
}

import './algorithmic.js';
import './pools.js';
