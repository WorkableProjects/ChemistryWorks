// `orbital` student widget. The widget and the static diagram share their drawing code in js/views/orbital-view.js,
// which results, grading and export also use.
import { orbitalWidget } from '../orbital-view.js';

export default {
  type: 'orbital',
  render: ({ q, api }) => orbitalWidget(q, api),
};
