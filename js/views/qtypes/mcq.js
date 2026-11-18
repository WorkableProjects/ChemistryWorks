// `mcq` student widget.
import { choiceWidget } from './choice.js';



export default {
  type: 'mcq',
  render: ({ q, api }) => choiceWidget(q, api, false),
};
