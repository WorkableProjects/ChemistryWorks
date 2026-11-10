// DOM renderers for the game modes: id -> render(host, attempt, ctx) -> { destroy() }. Later sessions append here.
import { render as classic } from './classic.js';
import { render as lightning } from './lightning.js';
import { render as survival } from './survival.js';

export const RENDERERS = { classic, lightning, survival };
