import { describe, expect, it } from 'bun:test';
import {
  advance,
  follow,
  hold,
  scrollerAt,
  speedOf,
  type Trail,
} from './scroller.ts';

const frame = 1 / 60;

const run = (scroller: ReturnType<typeof scrollerAt>, most: number) => {
  let frames = 0;
  while (advance(scroller, { least: 0, most }, frame) && frames < 1000) {
    frames += 1;
  }
  return frames;
};

describe('advance', () => {
  it('glides on and comes to rest', () => {
    const scroller = scrollerAt(100);
    scroller.velocity = 2000;
    const frames = run(scroller, 100_000);
    expect(scroller.value).toBeGreaterThan(500);
    expect(scroller.velocity).toBe(0);
    expect(frames).toBeLessThan(240);
  });

  it('springs back from beyond the end', () => {
    const scroller = scrollerAt(900);
    scroller.velocity = 3000;
    run(scroller, 1000);
    expect(scroller.value).toBe(1000);
    const before = scrollerAt(-50);
    run(before, 1000);
    expect(before.value).toBe(0);
  });

  it('heads for a target and stops there', () => {
    const scroller = scrollerAt(0);
    scroller.target = 400;
    run(scroller, 1000);
    expect(scroller.value).toBe(400);
    expect(scroller.target).toBeNull();
  });

  it('never heads beyond the ends', () => {
    const scroller = scrollerAt(0);
    scroller.target = 5000;
    run(scroller, 1000);
    expect(scroller.value).toBe(1000);
  });

  it('is stopped by a finger', () => {
    const scroller = scrollerAt(0);
    scroller.velocity = 2000;
    scroller.target = 300;
    hold(scroller);
    expect(advance(scroller, { least: 0, most: 1000 }, frame)).toBe(false);
    expect(scroller.value).toBe(0);
  });
});

describe('speedOf', () => {
  it('measures the last moments of a movement', () => {
    const trail: Trail = [];
    for (let at = 0; at <= 300; at += 10) {
      follow(trail, at, at * 2);
    }
    expect(trail.length).toBeLessThan(15);
    expect(speedOf(trail, 300)).toBeCloseTo(2000);
  });

  it('is nothing for a finger that rested or barely moved', () => {
    const trail: Trail = [];
    follow(trail, 0, 0);
    expect(speedOf(trail, 0)).toBe(0);
    follow(trail, 10, 50);
    expect(speedOf(trail, 200)).toBe(0);
  });
});
