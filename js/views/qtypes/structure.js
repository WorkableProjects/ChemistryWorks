// `structure` student widget. The widget and the static diagram share their drawing code in js/views/structure-view.js,
// which results, grading and export also use.
import { structureWidget } from '../structure-view.js';

export default {
  type: 'structure',
  render: ({ q, api }) => structureWidget(q, api),
};
