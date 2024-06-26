import {createLayout} from '../util/struct_array';

import type {StructArrayLayout} from '../util/struct_array';

export const atmosphereLayout: StructArrayLayout = createLayout([
    {type: 'Float32', name: 'a_pos', components: 3},
    {type: 'Float32', name: 'a_uv', components: 2}
]);
