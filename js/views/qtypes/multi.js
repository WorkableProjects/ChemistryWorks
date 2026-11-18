// `multi` student widget.
import { choiceWidget } from './choice.js';



export default {
  type: 'multi',
  render: ({ q, api }) => choiceWidget(q, api, true),
};
