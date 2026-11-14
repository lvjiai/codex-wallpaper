export const appearanceControls = [
  { key: 'zoom', label: '壁纸缩放', min: 100, max: 250, initial: 100, unit: '%' },
  { key: 'x', label: '水平位置', min: 0, max: 100, initial: 50, unit: '%' },
  { key: 'y', label: '垂直位置', min: 0, max: 100, initial: 50, unit: '%' },
  { key: 'blur', label: '壁纸模糊', min: 0, max: 32, initial: 0, unit: ' px' },
  { key: 'darkness', label: '暗化', min: 0, max: 100, initial: 41, unit: '%' },
];

export function normalizeAppearance(values, legacyDim) {
  return Object.fromEntries(appearanceControls.map(({ key, min, max, initial }) => {
    const value = values?.[key] ?? (key === 'darkness' && Number.isFinite(legacyDim) ? legacyDim * 85 : initial);
    const rounded = key === 'x' || key === 'y' ? value : Math.round(value);
    return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, rounded)) : initial];
  }));
}

// Keep the source pixel at the viewport center when zoom changes, clamping only
// if zooming out makes that center impossible without exposing an empty edge.
export function preserveZoomAnchor(before, after, viewport, source) {
  if (!source || !viewport.width || !viewport.height) return after;
  if (before.zoom === after.zoom) return { ...after, x: before.x, y: before.y };
  const cover = Math.max(viewport.width / source.width, viewport.height / source.height);
  const result = { ...after };
  for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
    const base = source[size] * cover;
    const oldOverflow = Math.max(0, base * before.zoom / 100 - viewport[size]);
    const overflow = Math.max(0, base * after.zoom / 100 - viewport[size]);
    const offset = (before[axis] - 50) * oldOverflow * after.zoom / before.zoom;
    result[axis] = overflow > 1e-6 ? Math.max(0, Math.min(100, 50 + offset / overflow)) : 50;
  }
  return result;
}
