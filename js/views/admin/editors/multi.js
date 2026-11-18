// `multi` editor.
import { choiceEditor } from './choice.js';

export default { type: 'multi', edit: ({ q, redraw, changed, uid }) => choiceEditor(q, redraw, changed, uid) };
