/*
 * reproject-worker.js
 *
 * Runs off the main thread so the export doesn't freeze the UI.
 *
 * Input (via postMessage):
 *   sourceBuffer   - ArrayBuffer of the source canvas RGBA pixels
 *   sourceWidth/Height - dimensions of the source buffer
 *   gridSXBuffer/gridSYBuffer - ArrayBuffers (Float64) of a sparse
 *     (gridCols+1) x (gridRows+1) control grid giving the source
 *     canvas pixel position for each grid point. Computed on the
 *     main thread (needs proj4 + exportMap.project()).
 *   gridCols/gridRows - number of CELLS in the control grid (so the
 *     grid has gridCols+1 points per row, gridRows+1 rows)
 *   pixelWidth/pixelHeight - output raster dimensions
 *
 * Output (via postMessage, transferred):
 *   outputBuffer - ArrayBuffer of the resampled RGBA output pixels
 */

self.onmessage = function handleMessage(event) {
  const {
    sourceBuffer,
    sourceWidth,
    sourceHeight,
    gridSXBuffer,
    gridSYBuffer,
    gridCols,
    gridRows,
    pixelWidth,
    pixelHeight
  } = event.data;

  const sourcePixels = new Uint8ClampedArray(sourceBuffer);
  const gridSX = new Float64Array(gridSXBuffer);
  const gridSY = new Float64Array(gridSYBuffer);

  const pointCols = gridCols + 1;

  const outputPixels = new Uint8ClampedArray(pixelWidth * pixelHeight * 4);

  /*
   * Precompute per-column and per-row grid interpolation parameters.
   * fx only depends on px, fy only depends on py, so there's no need
   * to recompute these inside the nested loop.
   */

  const colI0 = new Int32Array(pixelWidth);
  const colI1 = new Int32Array(pixelWidth);
  const colTX = new Float64Array(pixelWidth);

  for (let px = 0; px < pixelWidth; px++) {
    const gx = ((px + 0.5) / pixelWidth) * gridCols;
    let i0 = Math.floor(gx);
    if (i0 < 0) i0 = 0;
    if (i0 > gridCols - 1) i0 = gridCols - 1;
    colI0[px] = i0;
    colI1[px] = i0 + 1;
    colTX[px] = gx - i0;
  }

  const rowJ0 = new Int32Array(pixelHeight);
  const rowJ1 = new Int32Array(pixelHeight);
  const rowTY = new Float64Array(pixelHeight);

  for (let py = 0; py < pixelHeight; py++) {
    const gy = ((py + 0.5) / pixelHeight) * gridRows;
    let j0 = Math.floor(gy);
    if (j0 < 0) j0 = 0;
    if (j0 > gridRows - 1) j0 = gridRows - 1;
    rowJ0[py] = j0;
    rowJ1[py] = j0 + 1;
    rowTY[py] = gy - j0;
  }

  for (let py = 0; py < pixelHeight; py++) {
    const j0 = rowJ0[py];
    const j1 = rowJ1[py];
    const ty = rowTY[py];

    const rowBase0 = j0 * pointCols;
    const rowBase1 = j1 * pointCols;

    const outRowOffset = py * pixelWidth * 4;

    for (let px = 0; px < pixelWidth; px++) {
      const i0 = colI0[px];
      const i1 = colI1[px];
      const tx = colTX[px];

      /*
       * Bilinearly interpolate the source canvas position from the
       * sparse control grid (instead of calling proj4 + project()
       * for every single output pixel).
       */

      const idx00 = rowBase0 + i0;
      const idx10 = rowBase0 + i1;
      const idx01 = rowBase1 + i0;
      const idx11 = rowBase1 + i1;

      const sxTop = gridSX[idx00] * (1 - tx) + gridSX[idx10] * tx;
      const sxBot = gridSX[idx01] * (1 - tx) + gridSX[idx11] * tx;
      const sx = sxTop * (1 - ty) + sxBot * ty;

      const syTop = gridSY[idx00] * (1 - tx) + gridSY[idx10] * tx;
      const syBot = gridSY[idx01] * (1 - tx) + gridSY[idx11] * tx;
      const sy = syTop * (1 - ty) + syBot * ty;

      const outputIndex = outRowOffset + px * 4;

      /*
       * Bilinear sample of the source pixels at (sx, sy) — same
       * logic as the original per-pixel implementation.
       */

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = sx - x0;
      const fy = sy - y0;

      if (x0 < 0 || y0 < 0 || x1 >= sourceWidth || y1 >= sourceHeight) {
        outputPixels[outputIndex] = 0;
        outputPixels[outputIndex + 1] = 0;
        outputPixels[outputIndex + 2] = 0;
        outputPixels[outputIndex + 3] = 0;
        continue;
      }

      const i00 = (y0 * sourceWidth + x0) * 4;
      const i10 = (y0 * sourceWidth + x1) * 4;
      const i01 = (y1 * sourceWidth + x0) * 4;
      const i11 = (y1 * sourceWidth + x1) * 4;

      for (let channel = 0; channel < 4; channel++) {
        const top =
          sourcePixels[i00 + channel] * (1 - fx) +
          sourcePixels[i10 + channel] * fx;

        const bottom =
          sourcePixels[i01 + channel] * (1 - fx) +
          sourcePixels[i11 + channel] * fx;

        outputPixels[outputIndex + channel] = Math.round(
          top * (1 - fy) + bottom * fy
        );
      }
    }
  }

  self.postMessage(
    { outputBuffer: outputPixels.buffer, pixelWidth, pixelHeight },
    [outputPixels.buffer]
  );
};
