import StyleLayer from '../style_layer';
import {getLayoutProperties, getPaintProperties} from './hillshade_style_layer_properties';

import type {Transitionable, Transitioning, PossiblyEvaluated, ConfigOptions} from '../properties';
import type {PaintProps} from './hillshade_style_layer_properties';
import type {LayerSpecification} from '../../style-spec/types';
import type {CreateProgramParams} from '../../render/painter';
import type {LUT} from "../../util/lut";

class HillshadeStyleLayer extends StyleLayer {
    _transitionablePaint: Transitionable<PaintProps>;
    _transitioningPaint: Transitioning<PaintProps>;
    paint: PossiblyEvaluated<PaintProps>;

    constructor(layer: LayerSpecification, scope: string, lut: LUT | null, options?: ConfigOptions | null) {
        const properties = {
            layout: getLayoutProperties(),
            paint: getPaintProperties()
        };
        super(layer, properties, scope, lut, options);
    }

    shouldRedrape(): boolean {
        return this.hasOffscreenPass() && this.paint.get('hillshade-illumination-anchor') === 'viewport';
    }

    hasOffscreenPass(): boolean {
        return this.paint.get('hillshade-exaggeration') !== 0 && this.visibility !== 'none';
    }

    getProgramIds(): Array<string> {
        return ['hillshade', 'hillshadePrepare'];
    }

    // eslint-disable-next-line no-unused-vars
    getDefaultProgramParams(name: string, zoom: number, lut: LUT | null): CreateProgramParams | null {
        return {
            overrideFog: false
        };
    }
}

export default HillshadeStyleLayer;
