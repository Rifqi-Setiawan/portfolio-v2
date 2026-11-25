import { BufferAttribute, BufferGeometry, DataTexture, type NormalOrGLBufferAttributes } from 'three';
import { expect, it, vi } from 'vitest';
import { uploadMap, uploadPoints } from '../../src/gl/sceneUploads';
import type { Stage } from '../../src/gl/stage';

it('submits complete contiguous RGBA rows through bounded views, including the last partial band', async () => {
  const width = 1600, height = 101, stride = width * 4;
  const rgba = new Uint8ClampedArray(stride * height);
  for (let y = 0; y < height; y++) rgba.fill(y, y * stride, (y + 1) * stride);
  const photo = new DataTexture(rgba, width, height);
  let nextRow = 0;
  const stage = {
    contextLost: false,
    renderer: {
      domElement: new EventTarget(), initTexture: vi.fn(),
      copyTextureToTexture(source: DataTexture, target: DataTexture, region: unknown, offset: { x: number; y: number }) {
        const { data, width: w, height: h } = source.image;
        if (!data) throw Error('Empty upload');
        expect(target).toBe(photo);
        expect(region).toBeNull();
        expect([w, offset.x, offset.y, target.flipY]).toEqual([width, 0, nextRow, false]);
        expect(data.buffer).toBe(rgba.buffer);
        expect(data.byteLength).toBe(h * stride);
        expect(data.byteLength).toBeLessThanOrEqual(256 * 1024);
        expect(data.byteOffset).toBe(nextRow * stride);
        expect([data[0], data[data.length - 1]]).toEqual([nextRow, nextRow + h - 1]);
        nextRow += h;
        expect(target.mipmapsAutoUpdate).toBe(nextRow === height);
      },
    },
    preparation: { async run(next: () => boolean) { while (!next()) { /* process each slice */ } } },
  } as unknown as Stage;
  await uploadMap(stage, photo, new AbortController().signal);
  expect(nextRow).toBe(height);
  expect(photo.image.data).toBe(rgba);
});

it('restores complete CPU sources when a context disappears and returns between upload slices', async () => {
  const canvas = new EventTarget();
  const bufferSubData = vi.fn(), copyTextureToTexture = vi.fn();
  const stage = {
    contextLost: false,
    renderer: {
      domElement: canvas, initTexture: vi.fn(), copyTextureToTexture,
      getContext: () => ({ createBuffer: () => ({}), bindBuffer: vi.fn(), bufferData: vi.fn(), bufferSubData }),
    },
    preparation: {
      async run(next: () => boolean) {
        expect(next()).toBe(false);
        canvas.dispatchEvent(new Event('webglcontextlost'));
        canvas.dispatchEvent(new Event('webglcontextrestored'));
        expect(next()).toBe(true);
      },
    },
  } as unknown as Stage;
  const signal = new AbortController().signal;
  const image = new Uint8Array(16);
  const photo = new DataTexture(image, 2, 2);
  await uploadMap(stage, photo, signal);
  expect(copyTextureToTexture).not.toHaveBeenCalled();
  expect(photo.image.data).toBe(image);
  expect(photo.source.dataReady && photo.mipmapsAutoUpdate).toBe(true);
  expect(photo.version).toBeGreaterThan(0);

  const geom = new BufferGeometry<NormalOrGLBufferAttributes>();
  const arrays = [6, 6, 2, 2].map(size => new Float32Array(size));
  await uploadPoints(stage, geom, arrays, signal);
  expect(bufferSubData).toHaveBeenCalledTimes(1);
  for (const [i, key] of ['position', 'aColor', 'aKey', 'aSeed'].entries()) {
    const attribute = geom.getAttribute(key) as BufferAttribute;
    expect(attribute).toBeInstanceOf(BufferAttribute);
    expect(attribute.array).toBe(arrays[i]);
  }
});
