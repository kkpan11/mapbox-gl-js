import MercatorCoordinate, {mercatorZfromAltitude, latFromMercatorY} from '../geo/mercator_coordinate';
import {degToRad, wrap, getColumn, setColumn} from '../util/util';
import {vec3, quat, mat4} from 'gl-matrix';

import type {vec4} from 'gl-matrix';
import type {Elevation} from '../terrain/elevation';
import type {LngLatLike} from '../geo/lng_lat';

function updateTransformOrientation(matrix: mat4, orientation: quat) {
    // Take temporary copy of position to prevent it from being overwritten
    const position: vec4 = getColumn(matrix, 3);

    // Convert quaternion to rotation matrix
    mat4.fromQuat(matrix, orientation);
    setColumn(matrix, 3, position);
}

function updateTransformPosition(matrix: mat4, position: vec3) {
    setColumn(matrix, 3, [position[0], position[1], position[2], 1.0]);
}

function orientationFromPitchBearing(pitch: number, bearing: number): quat {
    // Both angles are considered to define CW rotation around their respective axes.
    // Values have to be negated to achieve the proper quaternion in left handed coordinate space
    const orientation = quat.identity([] as unknown as quat);
    quat.rotateZ(orientation, orientation, -bearing);
    quat.rotateX(orientation, orientation, -pitch);
    return orientation;
}

/**
 * @private
 */
export function orientationFromFrame(forward: vec3, up: vec3): quat | null | undefined {
    // Find right-vector of the resulting coordinate frame. Up-vector has to be
    // sanitized first in order to remove the roll component from the orientation
    const xyForward = [forward[0], forward[1], 0];
    const xyUp = [up[0], up[1], 0];

    const epsilon = 1e-15;

    if (vec3.length(xyForward as [number, number, number]) >= epsilon) {
        // Roll rotation can be seen as the right vector not being on the xy-plane, ie. right[2] != 0.0.
        // It can be negated by projecting the up vector on top of the forward vector.
        const xyDir = vec3.normalize([] as unknown as vec3, xyForward as [number, number, number]);
        vec3.scale(xyUp as [number, number, number], xyDir, vec3.dot(xyUp as [number, number, number], xyDir));

        up[0] = xyUp[0];
        up[1] = xyUp[1];
    }

    const right = vec3.cross([] as unknown as vec3, up, forward);
    if (vec3.len(right) < epsilon) {
        return null;
    }

    const bearing = Math.atan2(-right[1], right[0]);
    const pitch = Math.atan2(Math.sqrt(forward[0] * forward[0] + forward[1] * forward[1]), -forward[2]);

    return orientationFromPitchBearing(pitch, bearing);
}

/**
 * Options for accessing physical properties of the underlying camera entity.
 * Direct access to these properties allows more flexible and precise controlling of the camera.
 * These options are also fully compatible and interchangeable with CameraOptions. All fields are optional.
 * See {@link Map#setFreeCameraOptions} and {@link Map#getFreeCameraOptions}.
 *
 * @param {MercatorCoordinate} position Position of the camera in slightly modified web mercator coordinates.
        - The size of 1 unit is the width of the projected world instead of the "mercator meter".
          Coordinate [0, 0, 0] is the north-west corner and [1, 1, 0] is the south-east corner.
        - Z coordinate is conformal and must respect minimum and maximum zoom values.
        - Zoom is automatically computed from the altitude (z).
 * @param {quat} orientation Orientation of the camera represented as a unit quaternion [x, y, z, w] in a left-handed coordinate space.
        Direction of the rotation is clockwise around the respective axis.
        The default pose of the camera is such that the forward vector is looking up the -Z axis.
        The up vector is aligned with north orientation of the map:
          forward: [0, 0, -1]
          up:      [0, -1, 0]
          right    [1, 0, 0]
        Orientation can be set freely but certain constraints still apply:
         - Orientation must be representable with only pitch and bearing.
         - Pitch has an upper limit.
 * @example
 * const camera = map.getFreeCameraOptions();
 *
 * const position = [138.72649, 35.33974];
 * const altitude = 3000;
 *
 * camera.position = mapboxgl.MercatorCoordinate.fromLngLat(position, altitude);
 * camera.lookAtPoint([138.73036, 35.36197]);
 *
 * map.setFreeCameraOptions(camera);
 * @see [Example: Animate the camera around a point in 3D terrain](https://docs.mapbox.com/mapbox-gl-js/example/free-camera-point/)
 * @see [Example: Animate the camera along a path](https://docs.mapbox.com/mapbox-gl-js/example/free-camera-path/)
 */
class FreeCameraOptions {
    orientation: quat | null | undefined;
    _position: MercatorCoordinate | null | undefined;
    _elevation: Elevation | null | undefined;
    _renderWorldCopies: boolean;

    constructor(position?: MercatorCoordinate | null, orientation?: quat | null) {
        this.position = position;
        this.orientation = orientation;
    }

    get position(): MercatorCoordinate | null | undefined {
        return this._position;
    }

    set position(position: MercatorCoordinate | null | undefined | vec3) {
        if (!position) {
            this._position = null;
        } else {
            const mercatorCoordinate = position instanceof MercatorCoordinate ? position : new MercatorCoordinate(position[0], position[1], position[2]);
            if (this._renderWorldCopies) {
                mercatorCoordinate.x = wrap(mercatorCoordinate.x, 0, 1);
            }
            this._position = mercatorCoordinate;
        }
    }

    /**
     * Helper function for setting orientation of the camera by defining a focus point
     * on the map.
     *
     * @param {LngLatLike} location Location of the focus point on the map.
     * @param {vec3?} up Up vector of the camera is necessary in certain scenarios where bearing can't be deduced from the viewing direction.
     * @example
     * const camera = map.getFreeCameraOptions();
     *
     * const position = [138.72649, 35.33974];
     * const altitude = 3000;
     *
     * camera.position = mapboxgl.MercatorCoordinate.fromLngLat(position, altitude);
     * camera.lookAtPoint([138.73036, 35.36197]);
     * // Apply camera changes
     * map.setFreeCameraOptions(camera);
     */
    lookAtPoint(location: LngLatLike, up?: vec3) {
        this.orientation = null;
        if (!this.position) {
            return;
        }

        const pos: MercatorCoordinate = this.position;
        const altitude = this._elevation ? this._elevation.getAtPointOrZero(MercatorCoordinate.fromLngLat(location)) : 0;
        const target = MercatorCoordinate.fromLngLat(location, altitude);
        const forward: vec3 = [target.x - pos.x, target.y - pos.y, target.z - pos.z];
        if (!up)
            up = [0, 0, 1];

        // flip z-component if the up vector is pointing downwards
        up[2] = Math.abs(up[2]);

        this.orientation = orientationFromFrame(forward, up);
    }

    /**
     * Helper function for setting the orientation of the camera as a pitch and a bearing.
     *
     * @param {number} pitch Pitch angle in degrees.
     * @param {number} bearing Bearing angle in degrees.
     * @example
     * const camera = map.getFreeCameraOptions();
     *
     * // Update camera pitch and bearing
     * camera.setPitchBearing(80, 90);
     * // Apply changes
     * map.setFreeCameraOptions(camera);
     */
    setPitchBearing(pitch: number, bearing: number) {
        this.orientation = orientationFromPitchBearing(degToRad(pitch), degToRad(-bearing));
    }
}

/**
 * While using the free camera API the outcome value of isZooming, isMoving and isRotating
 * is not a result of the free camera API.
 * If the user sets the map.interactive to true, there will be conflicting behaviors while
 * interacting with map via zooming or moving using mouse or/and keyboard which will result
 * in isZooming, isMoving and isRotating to return true while using free camera API. In order
 * to prevent the confilicting behavior please set map.interactive to false which will result
 * in muting the following events: zoom, zoomend, zoomstart, rotate, rotateend, rotatestart,
 * move, moveend, movestart, pitch, pitchend, pitchstart.
 */

class FreeCamera {
    _transform: mat4;
    _orientation: quat;

    constructor(position?: vec3 | null, orientation?: quat | null) {
        this._transform = mat4.identity([] as unknown as mat4);
        this.orientation = orientation;
        this.position = position;
    }

    get mercatorPosition(): MercatorCoordinate {
        const pos = this.position;
        return new MercatorCoordinate(pos[0], pos[1], pos[2]);
    }

    get position(): vec3 {
        const col: vec4 = getColumn(this._transform, 3);
        return [col[0], col[1], col[2]];
    }

    set position(value: vec3 | null | undefined) {
        if (value) {
            updateTransformPosition(this._transform, value);
        }
    }

    get orientation(): quat {
        return this._orientation;
    }

    set orientation(value: quat | null | undefined) {
        this._orientation = value || quat.identity([] as unknown as quat);
        if (value) {
            updateTransformOrientation(this._transform, this._orientation);
        }
    }

    getPitchBearing(): {
        pitch: number;
        bearing: number;
        } {
        const f = this.forward();
        const r = this.right();

        return {
            bearing: Math.atan2(-r[1], r[0]),
            pitch: Math.atan2(Math.sqrt(f[0] * f[0] + f[1] * f[1]), -f[2])
        };
    }

    setPitchBearing(pitch: number, bearing: number) {
        this._orientation = orientationFromPitchBearing(pitch, bearing);
        updateTransformOrientation(this._transform, this._orientation);
    }

    forward(): vec3 {
        const col: vec4 = getColumn(this._transform, 2);
        // Forward direction is towards the negative Z-axis
        return [-col[0], -col[1], -col[2]];
    }

    up(): vec3 {
        const col: vec4 = getColumn(this._transform, 1);
        // Up direction has to be flipped to point towards north
        return [-col[0], -col[1], -col[2]];
    }

    right(): vec3 {
        const col: vec4 = getColumn(this._transform, 0);
        return [col[0], col[1], col[2]];
    }

    getCameraToWorld(worldSize: number, pixelsPerMeter: number): mat4 {
        const cameraToWorld = new Float64Array(16) as unknown as mat4;
        mat4.invert(cameraToWorld, this.getWorldToCamera(worldSize, pixelsPerMeter));
        return cameraToWorld;
    }

    getCameraToWorldMercator(): mat4 {
        return this._transform;
    }

    getWorldToCameraPosition(worldSize: number, pixelsPerMeter: number, uniformScale: number): mat4 {
        const invPosition = this.position;

        vec3.scale(invPosition, invPosition, -worldSize);
        const matrix = new Float64Array(16) as unknown as mat4;
        mat4.fromScaling(matrix as unknown as mat4, [uniformScale, uniformScale, uniformScale]);
        mat4.translate(matrix as unknown as mat4, matrix as unknown as mat4, invPosition);

        // Adjust scale on z (3rd column 3rd row)
        matrix[10] *= pixelsPerMeter;

        return matrix;
    }

    getWorldToCamera(worldSize: number, pixelsPerMeter: number): mat4 {
        // transformation chain from world space to camera space:
        // 1. Height value (z) of renderables is in meters. Scale z coordinate by pixelsPerMeter
        // 2. Transform from pixel coordinates to camera space with cameraMatrix^-1
        // 3. flip Y if required

        // worldToCamera: flip * cam^-1 * zScale
        // cameraToWorld: (flip * cam^-1 * zScale)^-1 => (zScale^-1 * cam * flip^-1)
        const matrix = new Float64Array(16) as unknown as mat4;

        // Compute inverse of camera matrix and post-multiply negated translation
        const invOrientation = new Float64Array(4) as unknown as quat;
        const invPosition = this.position;

        quat.conjugate(invOrientation, this._orientation);
        vec3.scale(invPosition, invPosition, -worldSize);
        mat4.fromQuat(matrix, invOrientation);
        mat4.translate(matrix, matrix, invPosition);

        // Pre-multiply y (2nd row)
        matrix[1] *= -1.0;
        matrix[5] *= -1.0;
        matrix[9] *= -1.0;
        matrix[13] *= -1.0;

        // Post-multiply z (3rd column)
        matrix[8] *= pixelsPerMeter;
        matrix[9] *= pixelsPerMeter;
        matrix[10] *= pixelsPerMeter;
        matrix[11] *= pixelsPerMeter;

        return matrix;
    }

    getCameraToClipPerspective(fovy: number, aspectRatio: number, nearZ: number, farZ: number): mat4 {
        const matrix = new Float64Array(16) as unknown as mat4;
        mat4.perspective(matrix, fovy, aspectRatio, nearZ, farZ);
        return matrix;
    }

    getCameraToClipOrthographic(
        left: number,
        right: number,
        bottom: number,
        top: number,
        nearZ: number,
        farZ: number,
    ): mat4 {
        const matrix = new Float64Array(16) as unknown as mat4;
        mat4.ortho(matrix, left, right, bottom, top, nearZ, farZ);
        return matrix;
    }

    // The additional parameter needs to be removed. This was introduced because originally
    // the value returned by this function was incorrect. Fixing it would break the fog visuals and needs to be
    // communicated carefully first. Also see transform.cameraWorldSizeForFog.
    getDistanceToElevation(elevationMeters: number, convert: boolean = false): number {
        const z0 = elevationMeters === 0 ? 0 : mercatorZfromAltitude(elevationMeters, convert ? latFromMercatorY(this.position[1]) : this.position[1]);
        const f = this.forward();
        return (z0 - this.position[2]) / f[2];
    }

    clone(): FreeCamera {
        return new FreeCamera([...this.position] as vec3, [...this.orientation] as quat);
    }
}

export {
    FreeCamera,
    FreeCameraOptions
};
