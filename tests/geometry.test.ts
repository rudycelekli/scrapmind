import { expect, it } from 'vitest';
import {
  mapPoint,
  perspectiveTransform,
  validateQuad,
  warpImage,
  type Quad,
} from '../core/geometry.js';
it('maps all output corners to the original quadrilateral', () => {
  const corners: Quad = [
      { x: 20, y: 10 },
      { x: 180, y: 30 },
      { x: 160, y: 190 },
      { x: 40, y: 170 },
    ],
    t = perspectiveTransform(corners, 100, 200);
  [
    { x: 0, y: 0 },
    { x: 99, y: 0 },
    { x: 99, y: 199 },
    { x: 0, y: 199 },
  ].forEach((point, i) => {
    const mapped = mapPoint(t, point);
    expect(mapped.x).toBeCloseTo(corners[i].x, 6);
    expect(mapped.y).toBeCloseTo(corners[i].y, 6);
  });
});
it('rejects crossed, degenerate and out-of-bounds crops', () => {
  expect(
    validateQuad(
      [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
        { x: 20, y: 0 },
      ],
      20,
      20,
    ),
  ).toBe(false);
  expect(
    validateQuad(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      20,
      20,
    ),
  ).toBe(false);
  expect(
    validateQuad(
      [
        { x: -1, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      20,
      20,
    ),
  ).toBe(false);
});
it('preserves pixels for an identity warp', () => {
  const source = new Uint8ClampedArray(64);
  for (let i = 0; i < 16; i++) {
    source[i * 4] = i * 10;
    source[i * 4 + 1] = 50;
    source[i * 4 + 2] = 100;
    source[i * 4 + 3] = 255;
  }
  expect(
    Array.from(
      warpImage(
        source,
        4,
        4,
        [
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 3, y: 3 },
          { x: 0, y: 3 },
        ],
        4,
        4,
      ),
    ),
  ).toEqual(Array.from(source));
});
it('bounds output allocation and validates source buffers', () => {
  const corners: Quad = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 3 },
    { x: 0, y: 3 },
  ];
  expect(() => warpImage(new Uint8ClampedArray(64), 4, 4, corners, 10000, 10000)).toThrow(
    '6 megapixels',
  );
  expect(() => warpImage(new Uint8ClampedArray(10), 4, 4, corners, 4, 4)).toThrow('buffer');
});
