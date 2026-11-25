import { BufferAttribute, BufferGeometry, DataTexture, GLBufferAttribute, type NormalOrGLBufferAttributes, Vector2 } from 'three';
import type { Stage } from './stage';

const chunkBytes = 256 * 1024;

/** Allocate once, then fill a few contiguous image rows per job. Generate the mip chain on the last band. */
export async function uploadMap(stage: Stage, texture: DataTexture, signal: AbortSignal): Promise<void> {
  const { renderer } = stage;
  const { width, height, data } = texture.image;
  if (!data) throw new Error('Missing decoded texture pixels');
  const source = new DataTexture();
  const position = new Vector2();
  const stride = width * 4;
  const rows = Math.max(1, Math.floor(chunkBytes / stride));
  let row = 0, allocated = false;
  let lost = stage.contextLost;
  const onLost = () => { lost = true; };
  renderer.domElement.addEventListener('webglcontextlost', onLost, { once: true });
  try {
    await stage.preparation.run(() => {
      // The context can disappear and return while preparation is paused for input.
      if (lost) { texture.needsUpdate = true; return true; }
      if (!allocated) {
        texture.source.dataReady = false;
        texture.mipmapsAutoUpdate = false;
        renderer.initTexture(texture);
        allocated = true;
        return false;
      }
      const next = Math.min(height, row + rows);
      // Bind only this strip of the retained RGBA image. No UNPACK_SKIP_ROWS
      // through a multi-megabyte view, including on the final partial strip.
      source.image = { width, height: next - row, data: data.subarray(row * stride, next * stride) };
      texture.mipmapsAutoUpdate = next === height;
      renderer.copyTextureToTexture(source, texture, null, position.set(0, row));
      row = next;
      return row === height;
    }, signal);
  } finally {
    renderer.domElement.removeEventListener('webglcontextlost', onLost);
    // Retain the decoded CPU image for Three's automatic context restoration.
    texture.source.dataReady = texture.mipmapsAutoUpdate = true;
    source.dispose();
  }
}

/** COPY_WRITE_BUFFER leaves Three's current vertex array and attribute bindings untouched. */
export async function uploadPoints(stage: Stage, geo: BufferGeometry<NormalOrGLBufferAttributes>, arrays: Float32Array[], signal: AbortSignal) {
  const gl = stage.renderer.getContext() as WebGL2RenderingContext;
  const names = ['position', 'aColor', 'aKey', 'aSeed'], sizes = [3, 3, 1, 1];
  const restore = () => arrays.forEach((array, i) => geo.setAttribute(names[i], new BufferAttribute(array, sizes[i])));
  if (stage.contextLost) { restore(); return; }
  const buffers: WebGLBuffer[] = [];
  let index = 0, offset = 0;
  let lost = false;
  const canvas = stage.renderer.domElement;
  const onLost = () => { lost = true; };
  canvas.addEventListener('webglcontextlost', onLost, { once: true });
  try {
    await stage.preparation.run(() => {
      if (lost) { restore(); return true; }
      const array = arrays[index];
      if (offset === 0) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('Unable to allocate portrait vertex buffer');
        buffers.push(buffer);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer);
        gl.bufferData(gl.COPY_WRITE_BUFFER, array.byteLength, gl.STATIC_DRAW);
      } else {
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffers[index]);
      }
      const length = Math.min(chunkBytes / array.BYTES_PER_ELEMENT, array.length - offset);
      gl.bufferSubData(gl.COPY_WRITE_BUFFER, offset * array.BYTES_PER_ELEMENT, array, offset, length);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
      offset += length;
      if (offset === array.length) {
        geo.setAttribute(names[index], new GLBufferAttribute(buffers[index], gl.FLOAT, sizes[index], 4, array.length / sizes[index]));
        index++; offset = 0;
      }
      return index === arrays.length;
    }, signal);
    if (!lost) canvas.addEventListener('webglcontextrestored', restore, { signal, once: true });
  } catch (error) {
    if (!lost) for (const buffer of buffers) gl.deleteBuffer(buffer);
    throw error;
  } finally { canvas.removeEventListener('webglcontextlost', onLost); }
}
