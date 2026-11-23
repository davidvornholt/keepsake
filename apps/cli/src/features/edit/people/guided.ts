import { type Channel, channels, type Plane, type Planes } from './raster.ts';
import { type Average, multiplied } from './smooth.ts';

/** How a value follows from a pixel's red, green and blue, for every pixel. */
export type Fit = { readonly slopes: Planes; readonly offset: Plane };

export type GuidedFilter = (target: Plane) => Fit;

/** The covariance of two planes in each neighbourhood. */
const covariance = (
  average: Average,
  left: { readonly plane: Plane; readonly mean: Plane },
  right: { readonly plane: Plane; readonly mean: Plane },
): Plane =>
  average(multiplied(left.plane, right.plane)).map(
    (value, index) =>
      value - (left.mean[index] ?? 0) * (right.mean[index] ?? 0),
  );

type Triple = readonly [number, number, number];

/** Solves three linear equations whose matrix is [a b c; b d e; c e f]. */
const solved = (
  [a, b, c, d, e, f]: readonly [...Triple, ...Triple],
  [x, y, z]: Triple,
): Triple => {
  const inverseA = d * f - e * e;
  const inverseB = c * e - b * f;
  const inverseC = b * e - c * d;
  const inverseD = a * f - c * c;
  const inverseE = b * c - a * e;
  const inverseF = a * d - b * b;
  const determinant = a * inverseA + b * inverseB + c * inverseC;
  return [
    (inverseA * x + inverseB * y + inverseC * z) / determinant,
    (inverseB * x + inverseD * y + inverseE * z) / determinant,
    (inverseC * x + inverseE * y + inverseF * z) / determinant,
  ];
};

const at = (plane: Plane, index: number): number => plane[index] ?? 0;

/**
 * A guided filter (He, Sun and Tang): in each neighbourhood it fits the target
 * to the colours of the guide, so the result has the edges of the guide and
 * none of the target's own. A larger `calm` keeps it flatter.
 */
export const guidedFilter = (
  guide: Planes,
  average: Average,
  calm: number,
): GuidedFilter => {
  const colour = (channel: Channel) => ({
    plane: guide[channel],
    mean: average(guide[channel]),
  });
  const red = colour(0);
  const green = colour(1);
  const blue = colour(2);
  const redRed = covariance(average, red, red);
  const redGreen = covariance(average, red, green);
  const redBlue = covariance(average, red, blue);
  const greenGreen = covariance(average, green, green);
  const greenBlue = covariance(average, green, blue);
  const blueBlue = covariance(average, blue, blue);
  return (target) => {
    const wanted = { plane: target, mean: average(target) };
    const withRed = covariance(average, red, wanted);
    const withGreen = covariance(average, green, wanted);
    const withBlue = covariance(average, blue, wanted);
    const slopes: Planes = [
      new Float32Array(target.length),
      new Float32Array(target.length),
      new Float32Array(target.length),
    ];
    const offset = wanted.mean.map((mean, index) => {
      const slope = solved(
        [
          at(redRed, index) + calm,
          at(redGreen, index),
          at(redBlue, index),
          at(greenGreen, index) + calm,
          at(greenBlue, index),
          at(blueBlue, index) + calm,
        ],
        [at(withRed, index), at(withGreen, index), at(withBlue, index)],
      );
      for (const channel of channels) {
        slopes[channel][index] = slope[channel];
      }
      return (
        mean -
        slope[0] * at(red.mean, index) -
        slope[1] * at(green.mean, index) -
        slope[2] * at(blue.mean, index)
      );
    });
    return {
      slopes: [average(slopes[0]), average(slopes[1]), average(slopes[2])],
      offset: average(offset),
    };
  };
};

/** The fitted value of every pixel of the guide. */
export const fitted = ({ slopes, offset }: Fit, guide: Planes): Plane =>
  offset.map((rest, index) => {
    let value = rest;
    for (const channel of channels) {
      value += (slopes[channel][index] ?? 0) * (guide[channel][index] ?? 0);
    }
    return value;
  });
