export interface Point {
  x: number;
  y: number;
}
export type Quad = [Point, Point, Point, Point];
export function defaultCorners(width: number, height: number): Quad {
  return [
    { x: width * 0.08, y: height * 0.08 },
    { x: width * 0.92, y: height * 0.08 },
    { x: width * 0.92, y: height * 0.92 },
    { x: width * 0.08, y: height * 0.92 },
  ];
}
export function validateQuad(points: Quad, width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return false;
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > width ||
        p.y < 0 ||
        p.y > height,
    )
  )
    return false;
  const crosses = points.map((p, i) => {
    const q = points[(i + 1) % 4],
      r = points[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  return crosses.every((value) => value > 1) || crosses.every((value) => value < -1);
}
function solve(matrix: number[][], vector: number[]): number[] {
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < vector.length; col++) {
    let pivot = col;
    for (let row = col + 1; row < vector.length; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10)
      throw new Error('Crop corners do not define a stable perspective transform.');
    [a[pivot], a[col]] = [a[col], a[pivot]];
    const divisor = a[col][col];
    for (let i = col; i <= vector.length; i++) a[col][i] /= divisor;
    for (let row = 0; row < vector.length; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let i = col; i <= vector.length; i++) a[row][i] -= factor * a[col][i];
    }
  }
  return a.map((row) => row[vector.length]);
}
/** Inverse mapping: output rectangle to original image. */
export function perspectiveTransform(
  corners: Quad,
  outputWidth: number,
  outputHeight: number,
): number[] {
  const destination: Quad = [
    { x: 0, y: 0 },
    { x: outputWidth - 1, y: 0 },
    { x: outputWidth - 1, y: outputHeight - 1 },
    { x: 0, y: outputHeight - 1 },
  ];
  const matrix: number[][] = [],
    vector: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = destination[i],
      { x, y } = corners[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    vector.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    vector.push(y);
  }
  return [...solve(matrix, vector), 1];
}
export function mapPoint(t: number[], p: Point): Point {
  const d = t[6] * p.x + t[7] * p.y + 1;
  return { x: (t[0] * p.x + t[1] * p.y + t[2]) / d, y: (t[3] * p.x + t[4] * p.y + t[5]) / d };
}
export function warpImage(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  corners: Quad,
  outputWidth: number,
  outputHeight: number,
): Uint8ClampedArray {
  if (!validateQuad(corners, width, height))
    throw new Error('Place four crop corners around a convex page boundary.');
  if (
    !Number.isInteger(outputWidth) ||
    !Number.isInteger(outputHeight) ||
    outputWidth < 2 ||
    outputHeight < 2 ||
    outputWidth * outputHeight > 6_000_000
  )
    throw new Error('Output must be 2 pixels or larger and at most 6 megapixels.');
  if (source.length !== width * height * 4)
    throw new Error('Image pixel buffer does not match the source dimensions.');
  const transform = perspectiveTransform(corners, outputWidth, outputHeight),
    output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y++)
    for (let x = 0; x < outputWidth; x++) {
      const p = mapPoint(transform, { x, y }),
        sx = Math.max(0, Math.min(width - 1, p.x)),
        sy = Math.max(0, Math.min(height - 1, p.y));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1),
        dx = sx - x0,
        dy = sy - y0,
        index = (y * outputWidth + x) * 4;
      for (let c = 0; c < 3; c++)
        output[index + c] =
          source[(y0 * width + x0) * 4 + c] * (1 - dx) * (1 - dy) +
          source[(y0 * width + x1) * 4 + c] * dx * (1 - dy) +
          source[(y1 * width + x0) * 4 + c] * (1 - dx) * dy +
          source[(y1 * width + x1) * 4 + c] * dx * dy;
      output[index + 3] = 255;
    }
  return output;
}
