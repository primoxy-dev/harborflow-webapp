/* Local signature tracing. The result is a proposal and requires visual approval. */
export function traceSignature({ width, height, data }, threshold = 205) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 900 || height > 350 || !data || data.length !== width * height * 4) throw new TypeError('Invalid signature image');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) throw new RangeError('Invalid threshold');
  let path = '', ink = 0;
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const i = (y * width + x) * 4;
      // Composite onto white before measuring brightness, so transparent pixels are not ink.
      const alpha = x < width ? data[i + 3] / 255 : 0;
      const brightness = x < width ? (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha + 255 * (1 - alpha) : 255;
      const active = x < width && brightness < threshold;
      if (active && start < 0) start = x;
      if (!active && start >= 0) { const length = x - start; path += `M${start} ${y}h${length}v1h-${length}z`; ink += length; start = -1; }
    }
  }
  if (!ink) throw new Error('No visible signature found');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><path fill="#000" d="${path}"/></svg>`;
}
