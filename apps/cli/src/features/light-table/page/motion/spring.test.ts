import { expect, it } from 'bun:test';
import {
  calm,
  clamp,
  glide,
  mix,
  quick,
  rubberBand,
  springAt,
  step,
} from './spring.ts';

it('a spring arrives without swinging past', () => {
  const spring = springAt(0);
  spring.target = 100;
  let most = 0;
  let frames = 0;
  while (step(spring, calm, 1 / 60) && frames < 600) {
    most = Math.max(most, spring.value);
    frames += 1;
  }
  expect(spring.value).toBe(100);
  expect(most).toBeLessThanOrEqual(100.5);
  expect(frames).toBeLessThan(90);
});

it('a spring keeps its speed when the target changes', () => {
  const spring = springAt(0);
  spring.target = 100;
  step(spring, quick, 0.05);
  const speed = spring.velocity;
  spring.target = -100;
  expect(spring.velocity).toBe(speed);
  step(spring, quick, 1 / 60);
  expect(spring.velocity).toBeLessThan(speed);
});

it('a long frame does not make a spring fly off', () => {
  const spring = springAt(0);
  spring.target = 10;
  step(spring, quick, 2);
  expect(spring.value).toBe(10);
});

it('gliding, stretching and mixing', () => {
  expect(glide(0, 0.2)).toBe(0);
  expect(glide(1000, 0.2)).toBeGreaterThan(200);
  expect(rubberBand(0, 400)).toBe(0);
  expect(rubberBand(100, 400)).toBeLessThan(100);
  expect(rubberBand(100_000, 400)).toBeLessThan(400);
  expect(rubberBand(-100, 400)).toBe(-rubberBand(100, 400));
  expect(clamp(5, 0, 3)).toBe(3);
  expect(mix(10, 20, 0.5)).toBe(15);
});
