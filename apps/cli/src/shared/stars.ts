const pointsPerStar = 2;

/** A score from 1 to 10 as 1 to 5 stars. */
export const starsFor = (score: number): number =>
  Math.ceil(score / pointsPerStar);
