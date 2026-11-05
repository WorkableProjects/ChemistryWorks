// Step registry for js/lib/instantiate.js (separate module so step modules can import it without an import cycle).
//   addInstantiateStep(name, fn): fn(testCopy, { seed, email, rand }) mutates the copy; rand() = seeded PRNG 0..1.
const STEPS = [];
export function addInstantiateStep(name, fn) {
  if (typeof fn === 'function' && !STEPS.some((s) => s.name === name)) STEPS.push({ name, fn });
}
export function instantiateSteps() { return STEPS.slice(); }
