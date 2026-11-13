// Dashboard greetings. One easy-to-edit list: add or change lines in SLOTS / DAYS / SPECIAL below.
// "{FirstName}" is replaced with the admin's first name; with no name the placeholder and its punctuation are dropped.
// Pure and DOM-free: pickGreeting(date, firstName, rand) is unit-tested.

/** Time-of-day slots by local hour: [fromHour, toHour) (24 h). Late night wraps midnight (21–1). */
export const SLOTS = [
  { id: 'early', from: 5, to: 8, lines: [
    'Morning, {FirstName}', 'Early start, {FirstName}', 'Coffee first, {FirstName}', 'Rise and titrate, {FirstName}',
    'Up before the bell, {FirstName}?', 'The lab is quiet, {FirstName}', 'Fresh reagents, fresh start, {FirstName}',
    'Early bird gets the lab, {FirstName}', 'Sunrise synthesis, {FirstName}?', 'Good early morning, {FirstName}',
  ] },
  { id: 'morning', from: 8, to: 12, lines: [
    'Good morning, {FirstName}', 'Hey {FirstName}, ready to react?', "Let's get to work, {FirstName}", 'Welcome back, {FirstName}',
    "Morning, {FirstName}. Lab's open.", 'Rise and shine, {FirstName}', 'Another day, another reaction, {FirstName}',
    'Ready when you are, {FirstName}', 'Hello, {FirstName}. Good to see you', 'Time to catalyze the day, {FirstName}',
  ] },
  { id: 'afternoon', from: 12, to: 17, lines: [
    'Good afternoon, {FirstName}', 'Afternoon, {FirstName}', 'Halfway there, {FirstName}', 'Keep it balanced, {FirstName}',
    'Still going strong, {FirstName}', 'Welcome back, {FirstName}', 'Hope lunch was exothermic, {FirstName}',
    'Steady as a noble gas, {FirstName}', 'Afternoon rate: stable, {FirstName}', 'Hi {FirstName}, the lab is ready',
  ] },
  { id: 'evening', from: 17, to: 21, lines: [
    'Good evening, {FirstName}', 'Evening, {FirstName}', 'Wrapping up, {FirstName}?', 'Late grading session, {FirstName}?',
    'One more batch, {FirstName}?', 'Welcome back, {FirstName}', 'Winding down, {FirstName}?',
    'Evening shift, {FirstName}', "Still at it, {FirstName}? Respect", 'Almost at equilibrium, {FirstName}',
  ] },
  { id: 'night', from: 21, to: 1, lines: [
    'Go to sleep, {FirstName}', "It's late, {FirstName}", 'The tests will still be here tomorrow, {FirstName}',
    'Burning the midnight oil, {FirstName}?', 'Even electrons rest, {FirstName}', 'Night owl mode, {FirstName}?',
    'Grading by lamplight, {FirstName}?', 'Time to cool down, {FirstName}', 'Sleep is a good catalyst, {FirstName}',
    'Lights out soon, {FirstName}?',
  ] },
  { id: 'verylate', from: 1, to: 5, lines: [
    'Seriously, go to sleep, {FirstName}', 'Why are you awake, {FirstName}?', 'Bed. Now. {FirstName}.',
    'Your half-life is showing, {FirstName}', 'The molecules are asleep, {FirstName}', 'It is the middle of the night, {FirstName}',
    'Coffee will not fix this, {FirstName}', 'Sleep deprivation is not a catalyst, {FirstName}',
    'Are you still grading, {FirstName}?', 'Rest is part of the method, {FirstName}',
  ] },
];

/** Day-of-week lines (0 = Sunday). Mixed into the pool for that day. */
export const DAYS = {
  0: ['Working on a weekend, {FirstName}?', 'Sunday planning, {FirstName}?'],
  1: ['Happy Monday, {FirstName}', 'Monday again, {FirstName}. You have this'],
  2: ['Tuesday already, {FirstName}'],
  3: ['Midweek check-in, {FirstName}', 'Hump day, {FirstName}'],
  4: ['Almost Friday, {FirstName}', 'Thursday, {FirstName}. Nearly there'],
  5: ['Happy Friday, {FirstName}!', 'Friday at last, {FirstName}'],
  6: ['Working on a weekend, {FirstName}?', 'Saturday lab session, {FirstName}?'],
};

/** Month/day specials (1-based month). Used instead of the normal pool on that day. */
export const SPECIAL = [
  { month: 10, day: 23, lines: ['Happy Mole Day, {FirstName}!', 'Happy Mole Day, {FirstName}! 6.02 × 10²³ greetings'] },
];

const FALLBACK = 'Welcome back';

/** The slot id for an hour (0-23). */
export function slotForHour(hour) {
  const h = ((Math.floor(Number(hour)) % 24) + 24) % 24;
  for (const s of SLOTS) {
    const inside = s.from < s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to;
    if (inside) return s.id;
  }
  return 'morning';
}

/** Fill in the name. No name: drop ", {FirstName}" / " {FirstName}" and tidy the punctuation that was attached to it. */
export function fillName(line, firstName) {
  const name = String(firstName || '').trim();
  if (name) return line.replace(/\{FirstName\}/g, name);
  let out = line
    .replace(/,\s*\{FirstName\}/g, '')
    .replace(/\s*\{FirstName\}\s*/g, ' ')
    .replace(/\s+([?!.,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/([.!?])\.+/g, '$1')
    .trim();
  out = out.replace(/^[\s,.]+/, '');
  // "Hey, ready to react?" reads better than "Hey ready to react?"
  out = out.replace(/^(Hey|Hi) (?=[a-z])/, '$1, ');
  return out || FALLBACK;
}

/** Every candidate line (unfilled) for a date: the special day's lines, or the time slot's plus the weekday's. */
export function greetingPool(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const special = SPECIAL.find((s) => s.month === d.getMonth() + 1 && s.day === d.getDate());
  if (special) return special.lines.slice();
  const slot = SLOTS.find((s) => s.id === slotForHour(d.getHours()));
  return [...slot.lines, ...(DAYS[d.getDay()] || [])];
}

/** First name from a display name ("Ada Lovelace" -> "Ada"); '' when there is none. */
export function firstNameOf(user) {
  const raw = String((user && (user.given_name || user.name)) || '').trim();
  if (!raw || raw.includes('@')) return '';
  return raw.split(/\s+/)[0];
}

/**
 * Pick one greeting. `date` decides the pool, `firstName` may be empty, `rand` is a 0..1 source (default Math.random).
 * Returns a plain string, never empty.
 */
export function pickGreeting(date = new Date(), firstName = '', rand = Math.random) {
  const pool = greetingPool(date);
  const r = Number(rand());
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * pool.length)));
  return fillName(pool[i], firstName);
}
