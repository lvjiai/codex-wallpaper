import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveZoomAnchor } from '../src/appearance.mjs';

const viewport = { width: 1280, height: 720 };
const source = { width: 1280, height: 800 };

test('zoom preserves the source point at the viewport center on both axes', () => {
  const before = { zoom: 150, x: 21, y: 78 };
  const after = preserveZoomAnchor(before, { ...before, zoom: 200 }, viewport, source);
  for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    const center = ({ zoom, [axis]: position }) => {
      const extent = source[size] * zoom / 100;
      return (viewport[size] / 2 + (extent - viewport[size]) * position / 100) / extent;
    };
    assert.ok(Math.abs(center(before) - center(after)) < 1e-10);
  }
});

test('zooming out clamps the position to keep the viewport covered', () => {
  const before = { zoom: 200, x: 0, y: 100 };
  assert.deepEqual(preserveZoomAnchor(before, { ...before, zoom: 100 }, viewport, source),
    { zoom: 100, x: 50, y: 100 });
});
