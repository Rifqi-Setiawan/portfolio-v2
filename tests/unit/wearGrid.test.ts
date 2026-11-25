import { expect, it } from 'vitest';
import { TRAIL } from '../../src/core/timings';
import { parsePreset } from '../../src/gl/preset';
import { WearGrid, wearThreshold } from '../../src/gl/wearGrid';

const hero = parsePreset({}).photo;

it('moves the fragment cutoff from half wear to a noisy threshold as roughness rises', () => {
  expect(wearThreshold(0, 0)).toBe(.5);
  expect(wearThreshold(1, 0)).toBe(.5);
  expect(wearThreshold(0, 1)).toBeCloseTo(.04);
  expect(wearThreshold(1, 1)).toBeCloseTo(.96);
  expect(wearThreshold(.5, 1)).toBe(.5);
  expect(wearThreshold(.25, .85)).toBeCloseTo(.3045);
});

it('requires movement and stamps the swept capsule at viewport scale', () => {
  const grid = new WearGrid(2, TRAIL.hero, hero);
  const at = (x: number, y: number) => grid.pixels[y * grid.columns + x];
  expect(grid.rows).toBe(96);
  expect(grid.move(.25, .5)).toBe(false);
  expect(grid.move(.25 + .03 / grid.columns, .5)).toBe(false);
  expect(grid.update(0)).toBe(false);
  expect(grid.move(.75, .5)).toBe(true);
  expect(grid.update(0)).toBe(true);
  expect(at(96, 48)).toBe(255);
  expect(at(43, 48)).toBeGreaterThan(0);
  expect(at(96, 55)).toBeGreaterThan(0);
  expect(at(96, 56)).toBe(0);
});

it.each([TRAIL.hero, TRAIL.about])('heals linearly over %s seconds and stops uploading', lifetime => {
  const grid = new WearGrid(2, lifetime, hero);
  grid.move(.1, .5);
  grid.move(.5, .5);
  grid.update(0);
  const index = 48 * grid.columns + 72;
  grid.update(lifetime / 2);
  expect(grid.pixels[index]).toBe(128);
  grid.update(lifetime / 2);
  expect(grid.active).toBe(false);
  expect(grid.pixels[index]).toBe(0);
  expect(grid.update(.1)).toBe(false);
});

it('breaks a stroke across pointer exits and clears wear on route changes', () => {
  const grid = new WearGrid(2, TRAIL.hero, hero);
  grid.move(.1, .1);
  grid.move(.2, .1);
  grid.update(0);
  grid.end();
  grid.move(.8, .1);
  grid.move(.9, .1);
  grid.update(0);
  expect(grid.pixels[10 * grid.columns + 96]).toBe(0);
  grid.end(true);
  expect(grid.active).toBe(false);
  expect(grid.pixels.some(Boolean)).toBe(false);
  expect(grid.update(0)).toBe(false);
});
