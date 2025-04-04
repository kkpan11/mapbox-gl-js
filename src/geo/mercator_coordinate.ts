import LngLat, {earthCircumference} from '../geo/lng_lat';
import {clamp, degToRad} from '../util/util';
import EXTENT from '../style-spec/data/extent';

import type {LngLatLike} from '../geo/lng_lat';
import type {CanonicalTileID} from '../source/tile_id';

const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 25.5;
/**
 * The circumference at a line of latitude in meters.
 * @private
 */
export function circumferenceAtLatitude(latitude: number): number {
    return earthCircumference * Math.cos(latitude * Math.PI / 180);
}

/**
 * @private
 */
export function mercatorXfromLng(lng: number): number {
    return (180 + lng) / 360;
}

/**
 * @private
 */
export function mercatorYfromLat(lat: number): number {
    return (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)))) / 360;
}

/**
 * @private
 */
export function mercatorZfromAltitude(altitude: number, lat: number): number {
    return altitude / circumferenceAtLatitude(lat);
}

/**
 * @private
 */
export function lngFromMercatorX(x: number): number {
    return x * 360 - 180;
}

/**
 * @private
 */
export function latFromMercatorY(y: number): number {
    const y2 = 180 - y * 360;
    return 360 / Math.PI * Math.atan(Math.exp(y2 * Math.PI / 180)) - 90;
}

/**
 * @private
 */
export function altitudeFromMercatorZ(z: number, y: number): number {
    return z * circumferenceAtLatitude(latFromMercatorY(y));
}

export const MAX_MERCATOR_LATITUDE = 85.051129;

/**
 * @private
 */
export function getLatitudeScale(lat: number): number {
    return Math.cos(degToRad(clamp(lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)));
}

/**
 * @private
 */
export function getMetersPerPixelAtLatitude(lat: number, zoom: number): number {
    const constrainedZoom = clamp(zoom, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM);
    const constrainedScale = Math.pow(2.0, constrainedZoom);
    return getLatitudeScale(lat) * earthCircumference / (constrainedScale * 512.0);
}

/**
 * Determine the Mercator scale factor for a given latitude, see
 * https://en.wikipedia.org/wiki/Mercator_projection#Scale_factor
 *
 * At the equator the scale factor will be 1, which increases at higher latitudes.
 *
 * @param {number} lat Latitude
 * @returns {number} scale factor
 * @private
 */
export function mercatorScale(lat: number): number {
    return 1 / Math.cos(lat * Math.PI / 180);
}

/**
 * @private
 */
export function tileToMeter(canonical: CanonicalTileID, tileYCoordinate: number = 0): number {
    const circumferenceAtEquator = 40075017;
    const mercatorY = (canonical.y + tileYCoordinate / EXTENT) / (1 << canonical.z);
    const exp = Math.exp(Math.PI * (1 - 2 * mercatorY));
    // simplify cos(2 * atan(e) - PI/2) from mercator_coordinate.js, remove trigonometrics.
    return circumferenceAtEquator * 2 * exp / (exp * exp + 1) / EXTENT / (1 << canonical.z);
}

/**
 * A `MercatorCoordinate` object represents a projected three dimensional position.
 *
 * `MercatorCoordinate` uses the web mercator projection ([EPSG:3857](https://epsg.io/3857)) with slightly different units:
 * - the size of 1 unit is the width of the projected world instead of the "mercator meter"
 * - the origin of the coordinate space is at the north-west corner instead of the middle.
 *
 * For example, `MercatorCoordinate(0, 0, 0)` is the north-west corner of the mercator world and
 * `MercatorCoordinate(1, 1, 0)` is the south-east corner. If you are familiar with
 * [vector tiles](https://github.com/mapbox/vector-tile-spec) it may be helpful to think
 * of the coordinate space as the `0/0/0` tile with an extent of `1`.
 *
 * The `z` dimension of `MercatorCoordinate` is conformal. A cube in the mercator coordinate space would be rendered as a cube.
 *
 * @param {number} x The x component of the position.
 * @param {number} y The y component of the position.
 * @param {number} z The z component of the position.
 * @example
 * const nullIsland = new mapboxgl.MercatorCoordinate(0.5, 0.5, 0);
 *
 * @see [Example: Add a custom style layer](https://www.mapbox.com/mapbox-gl-js/example/custom-style-layer/)
 */
class MercatorCoordinate {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number = 0) {
        this.x = +x;
        this.y = +y;
        this.z = +z;
    }

    /**
     * Project a `LngLat` to a `MercatorCoordinate`.
     *
     * @param {LngLatLike} lngLatLike The location to project.
     * @param {number} altitude The altitude in meters of the position.
     * @returns {MercatorCoordinate} The projected mercator coordinate.
     * @example
     * const coord = mapboxgl.MercatorCoordinate.fromLngLat({lng: 0, lat: 0}, 0);
     * console.log(coord); // MercatorCoordinate(0.5, 0.5, 0)
     */
    static fromLngLat(lngLatLike: LngLatLike, altitude: number = 0): MercatorCoordinate {
        const lngLat = LngLat.convert(lngLatLike);

        return new MercatorCoordinate(
                mercatorXfromLng(lngLat.lng),
                mercatorYfromLat(lngLat.lat),
                mercatorZfromAltitude(altitude, lngLat.lat));
    }

    /**
     * Returns the `LngLat` for the coordinate.
     *
     * @returns {LngLat} The `LngLat` object.
     * @example
     * const coord = new mapboxgl.MercatorCoordinate(0.5, 0.5, 0);
     * const lngLat = coord.toLngLat(); // LngLat(0, 0)
     */
    toLngLat(): LngLat {
        return new LngLat(
                lngFromMercatorX(this.x),
                latFromMercatorY(this.y));
    }

    /**
     * Returns the altitude in meters of the coordinate.
     *
     * @returns {number} The altitude in meters.
     * @example
     * const coord = new mapboxgl.MercatorCoordinate(0, 0, 0.02);
     * coord.toAltitude(); // 6914.281956295339
     */
    toAltitude(): number {
        return altitudeFromMercatorZ(this.z, this.y);
    }

    /**
     * Returns the distance of 1 meter in `MercatorCoordinate` units at this latitude.
     *
     * For coordinates in real world units using meters, this naturally provides the scale
     * to transform into `MercatorCoordinate`s.
     *
     * @returns {number} Distance of 1 meter in `MercatorCoordinate` units.
     * @example
     * // Calculate a new MercatorCoordinate that is 150 meters west of the other coord.
     * const coord = new mapboxgl.MercatorCoordinate(0.5, 0.25, 0);
     * const offsetInMeters = 150;
     * const offsetInMercatorCoordinateUnits = offsetInMeters * coord.meterInMercatorCoordinateUnits();
     * const westCoord = new mapboxgl.MercatorCoordinate(coord.x - offsetInMercatorCoordinateUnits, coord.y, coord.z);
     */
    meterInMercatorCoordinateUnits(): number {
        // 1 meter / circumference at equator in meters * Mercator projection scale factor at this latitude
        return 1 / earthCircumference * mercatorScale(latFromMercatorY(this.y));
    }

}

export default MercatorCoordinate;
