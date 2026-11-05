// Builder "Game mode" panel for test.gameOptions (V4-04). S05 mounts it in the builder's test settings (shown while
// gameMode is on). Contract: gameOptionsPanel(test, changed) -> Node | null (null = game mode is off, nothing to show).
// It edits test.gameOptions in place and calls changed() after every edit; empty fields mean "game default".

import { h } from '../../ui.js';
import { field, switchEl } from './common.js';
import { GAMES } from '../../lib/games/index.js';
import { normalizeGameOptions, LIMITS, POWERUP_IDS } from '../../lib/games/options.js';
import { SURVIVAL_TYPES } from '../../lib/games/survival.js';
import { TYPE_LABELS } from '../../lib/schema.js';

const POWERUP_LABELS = { fifty: '50/50', freeze: 'Freeze (+time)', skip: 'Skip', hint: 'Hint' };
const TYPE_CHOICES = [...new Set([...SURVIVAL_TYPES, 'matching'])];

export function gameOptionsPanel(test, changed) {
  if (!test || test.gameMode !== true) return null;
  const raw = () => { if (!test.gameOptions || typeof test.gameOptions !== 'object') test.gameOptions = {}; return test.gameOptions; };
  const cur = () => normalizeGameOptions(test);
  const set = (key, value) => { const o = raw(); if (value === null || value === undefined || value === '') delete o[key]; else o[key] = value; changed(); };

  const num = (key, label, hint, testid, placeholder) => {
    const [lo, hi] = LIMITS[key];
    const input = h('input', { class: 'input', type: 'number', min: String(lo), max: String(hi), step: '1', inputmode: 'numeric', placeholder, dataset: { testid } });
    input.value = cur()[key] !== null && (test.gameOptions || {})[key] !== undefined ? String(cur()[key]) : '';
    input.addEventListener('change', () => {
      const v = input.value.trim() === '' ? null : Math.min(hi, Math.max(lo, Math.round(Number(input.value))));
      input.value = v === null || Number.isNaN(v) ? '' : String(v);
      set(key, Number.isNaN(v) ? null : v);
    });
    return field(label, input, hint);
  };

  const listSwitches = (key, items, labelOf, testPrefix) => items.map((id) => {
    const on = () => (cur()[key] ? cur()[key].includes(id) : true);
    return switchEl({
      label: labelOf(id), checked: on(), testid: `${testPrefix}-${id}`,
      onChange: (v) => {
        const have = new Set(cur()[key] || items);
        if (v) have.add(id); else have.delete(id);
        const next = items.filter((x) => have.has(x));
        set(key, next.length === items.length || next.length === 0 ? null : next);
      },
    });
  });

  const power = (id) => switchEl({
    label: POWERUP_LABELS[id], checked: cur().powerUps[id], testid: `go-power-${id}`,
    onChange: (v) => { const o = raw(); o.powerUps = { ...cur().powerUps, [id]: v }; if (POWERUP_IDS.every((p) => o.powerUps[p])) delete o.powerUps; changed(); },
  });
  const flag = (key, label, hint, def) => switchEl({ label, hint, checked: cur()[key] ?? def, testid: `go-${key}`, onChange: (v) => set(key, v === def ? null : v) });

  return h('section', { class: 'card adm-settings', 'aria-label': 'Game mode options', dataset: { testid: 'game-options' } },
    h('h3', { class: 'adm-h3' }, 'Game mode options'),
    h('p', { class: 'field__hint' }, 'Empty number boxes use each game’s default. These settings apply to every student playing this test.'),
    h('fieldset', { class: 'adm-fieldset' }, h('legend', { class: 'field__label' }, 'Games offered'),
      h('div', { class: 'adm-switches' }, listSwitches('games', GAMES.map((g) => g.id), (id) => GAMES.find((g) => g.id === id).title, 'go-game'))),
    h('div', { class: 'adm-grid adm-grid--3' },
      num('questions', 'Number of questions', 'Classic, Survival, Boss Battle, Match-Up (pairs), Flashcards', 'go-questions', 'All'),
      num('timePerQuestion', 'Seconds per question', 'Classic (default 20)', 'go-timePerQuestion', '20'),
      num('totalSeconds', 'Total seconds', 'Lightning Round and Unit Dash (default 60)', 'go-totalSeconds', '60'),
      num('lives', 'Lives', 'Survival and Boss Battle (default 3)', 'go-lives', '3')),
    h('fieldset', { class: 'adm-fieldset' }, h('legend', { class: 'field__label' }, 'Power-ups (Classic, Survival)'),
      h('div', { class: 'adm-switches' }, POWERUP_IDS.map(power))),
    h('div', { class: 'adm-switches' },
      flag('untimed', 'Relaxed mode for everyone', 'No clock and no speed points in every timed game', false),
      flag('allowUntimed', 'Let students switch on relaxed mode', 'A checkbox on the game intro screen', true),
      flag('sound', 'Allow sound', 'Students still start with sound off', true),
      flag('leaderboard', 'Class leaderboard', 'Only stores the setting for now', false)),
    h('details', { class: 'adm-details' }, h('summary', {}, 'Question types included'),
      h('div', { class: 'adm-switches' }, listSwitches('types', TYPE_CHOICES, (t) => TYPE_LABELS[t] || t, 'go-type'))));
}
