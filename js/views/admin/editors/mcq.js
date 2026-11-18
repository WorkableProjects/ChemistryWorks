// `mcq` editor.
import { choiceEditor } from './choice.js';

export default { type: 'mcq', edit: ({ q, redraw, changed, uid }) => choiceEditor(q, redraw, changed, uid) };
