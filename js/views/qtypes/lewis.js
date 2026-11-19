// `lewis` student widget. The widget and the static diagram share their drawing code in js/views/lewis-view.js, which
// results, grading and export also use.
import { lewisWidget } from '../lewis-view.js';

export default {
  type: 'lewis',
  render: ({ q, api }) => lewisWidget(q, api),
};
