import {createLayout} from '../util/struct_array';

import type {StructArrayLayout} from '../util/struct_array';

export const posAttributesGlobeExt: StructArrayLayout = createLayout([
    {name: 'a_pos_3', components: 3, type: 'Int16'},
]);

export default createLayout([
    {name: 'a_pos', type: 'Int16', components: 2}
]);
