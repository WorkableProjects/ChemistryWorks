// DOM renderers for the game modes: id -> render(host, attempt, ctx) -> { destroy() }. Later sessions append here.
import { render as classic } from './classic.js';
import { render as lightning } from './lightning.js';
import { render as survival } from './survival.js';

import { render as flashcards } from './flashcards.js';
import { render as mistakes } from './mistakes.js';
import { render as tower } from './tower.js';
import { render as boss } from './boss.js';
import { render as matchup } from './matchup.js';
import { render as quizshow } from './quizshow.js';
import { render as race } from './race.js';
import { render as bingo } from './bingo.js';

export const RENDERERS = { classic, lightning, survival, flashcards, mistakes, tower, boss, matchup, quizshow, race, bingo };
