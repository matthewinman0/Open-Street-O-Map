let exportCenter = null;
let sw = null;
let ne = null;

const PAGE_SIZES = {
  A4: { w: 11.69, h: 8.27 },
  A3: { w: 16.54, h: 11.69 },
  A2: { w: 23.4, h: 16.5 }
};

/*
 * Cache the proj4 converters instead of re-resolving the EPSG
 * definitions on every single call. Built lazily (on first actual
 * use) rather than at script load, since EPSG:27700 is registered
 * via proj4.defs() elsewhere in the project and may not exist yet
 * at the moment this file is parsed.
 */
let _toBNG = null;
let _toWGS84 = null;

function getToBNG() {
  if (!_toBNG) {
    _toBNG = proj4("EPSG:4326", "EPSG:27700");
  }
  return _toBNG;
}

function getToWGS84() {
  if (!_toWGS84) {
    _toWGS84 = proj4("EPSG:27700", "EPSG:4326");
  }
  return _toWGS84;
}

/*
 * Approx. spacing (in output pixels) between control-grid points
 * used to approximate the BNG <-> map-canvas transform. Smaller =
 * more accurate but more proj4/project() calls when building the
 * grid. 64px spacing is comfortably sub-pixel accurate for a single
 * map sheet's extent, since the BNG/OSTN correction and Mercator
 * curvature are both effectively linear over that distance.
 */
const GRID_STEP_PX = 64;

function getMap() {
  return window.map;
}

function getScale() {
  return parseInt(document.getElementById("scale-select").value);
}

function getPageSize() {
  return document.getElementById("page-size").value;
}

function getDPI() {
  return parseInt(document.getElementById("dpi").value) || 300;
}

document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();

  map.getCanvas().style.cursor = "crosshair";

  map.once("click", (e) => {
    exportCenter = e.lngLat;

    map.getCanvas().style.cursor = "";

    drawCenter();
    drawBBox();
  });
};

function calculateBounds() {
  const page = PAGE_SIZES[getPageSize()];
  const scale = getScale();

  /*
   * Physical paper size converted to real-world ground metres.
   */

  const widthMetres = page.w * 0.0254 * scale;
  const heightMetres = page.h * 0.0254 * scale;

  /*
   * Centre in British National Grid.
   */

  const centre = getToBNG().forward([exportCenter.lng, exportCenter.lat]);

  /*
   * Desired output extent in BNG.
   */

  const swBNG = [centre[0] - widthMetres / 2, centre[1] - heightMetres / 2];
  const neBNG = [centre[0] + widthMetres / 2, centre[1] + heightMetres / 2];

  /*
   * Store the BNG bounds.
   */

  sw = { bngX: swBNG[0], bngY: swBNG[1] };
  ne = { bngX: neBNG[0], bngY: neBNG[1] };

  /*
   * Convert BNG corners to WGS84 for displaying the bounding box on
   * MapLibre.
   */

  const swWGS84 = getToWGS84().forward(swBNG);
  const neWGS84 = getToWGS84().forward(neBNG);

  sw.lng = swWGS84[0];
  sw.lat = swWGS84[1];

  ne.lng = neWGS84[0];
  ne.lat = neWGS84[1];
}

function drawCenter() {
  const map = getMap();

  if (map.getSource("export-center")) {
    map.removeLayer("export-center");
    map.removeSource("export-center");
  }

  map.addSource("export-center", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [exportCenter.lng, exportCenter.lat]
      }
    }
  });

  map.addLayer({
    id: "export-center",
    type: "circle",
    source: "export-center",
    paint: {
      "circle-radius": 4,
      "circle-color": "#ff0000"
    }
  });
}

function drawBBox() {
  const map = getMap();

  if (!exportCenter) {
    return;
  }

  calculateBounds();

  const geojson = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [sw.lng, sw.lat],
          [sw.lng, ne.lat],
          [ne.lng, ne.lat],
          [ne.lng, sw.lat],
          [sw.lng, sw.lat]
        ]
      ]
    }
  };

  if (map.getSource("export-bbox")) {
    map.removeLayer("export-bbox");
    map.removeSource("export-bbox");
  }

  map.addSource("export-bbox", {
    type: "geojson",
    data: geojson
  });

  map.addLayer({
    id: "export-bbox",
    type: "line",
    source: "export-bbox",
    paint: {
      "line-color": "#ff0000",
      "line-width": 2
    }
  });
}

document.getElementById("scale-select").onchange = drawBBox;
document.getElementById("page-size").onchange = drawBBox;

/*
 * Convert a BNG coordinate into a pixel position in the MapLibre
 * export canvas.
 */
function bngToCanvas(x, y, exportMap, canvas) {
  const wgs84 = getToWGS84().forward([x, y]);

  const point = exportMap.project({ lng: wgs84[0], lat: wgs84[1] });

  return { x: point.x, y: point.y };
}

/*
 * Build a sparse control grid mapping BNG output-pixel positions to
 * source-canvas pixel positions. This is the only place that needs
 * proj4 + exportMap.project() for the reprojection — a few thousand
 * calls instead of one (or two) per output pixel.
 */
function buildControlGrid(exportMap, pixelRatio, pixelWidth, pixelHeight) {
  const gridCols = Math.max(2, Math.ceil(pixelWidth / GRID_STEP_PX));
  const gridRows = Math.max(2, Math.ceil(pixelHeight / GRID_STEP_PX));

  const bngWidth = ne.bngX - sw.bngX;
  const bngHeight = ne.bngY - sw.bngY;

  const pointCols = gridCols + 1;
  const pointRows = gridRows + 1;

  const gridSX = new Float64Array(pointCols * pointRows);
  const gridSY = new Float64Array(pointCols * pointRows);

  for (let j = 0; j < pointRows; j++) {
    const fy = j / gridRows;
    const bngY = ne.bngY - fy * bngHeight;

    for (let i = 0; i < pointCols; i++) {
      const fx = i / gridCols;
      const bngX = sw.bngX + fx * bngWidth;

      const wgs84 = getToWGS84().forward([bngX, bngY]);
      const sourcePoint = exportMap.project({ lng: wgs84[0], lat: wgs84[1] });

      const idx = j * pointCols + i;
      gridSX[idx] = sourcePoint.x * pixelRatio;
      gridSY[idx] = sourcePoint.y * pixelRatio;
    }
  }

  return { gridCols, gridRows, gridSX, gridSY };
}

/*
 * Run the heavy per-pixel resampling in a Web Worker so the export
 * doesn't block the main thread / freeze the UI.
 */
function runReprojectionWorker(payload, transferList) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./reproject-worker.js");

    worker.onmessage = (event) => {
      worker.terminate();
      resolve(event.data);
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage(payload, transferList);
  });
}

/*
 * Reproject the MapLibre canvas from EPSG:3857 into an EPSG:27700
 * pixel grid.
 */
async function reprojectCanvas(sourceCanvas, exportMap, pixelWidth, pixelHeight) {
  /*
   * MapLibre uses a WebGL canvas. Copy it into a normal 2D canvas so
   * that we can access the pixel data.
   */

  const source2D = document.createElement("canvas");
  source2D.width = sourceCanvas.width;
  source2D.height = sourceCanvas.height;

  const sourceCtx = source2D.getContext("2d");
  sourceCtx.drawImage(sourceCanvas, 0, 0);

  const sourceWidth = source2D.width;
  const sourceHeight = source2D.height;

  const sourceImage = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight);

  const pixelRatio = exportMap.getPixelRatio();

  /*
   * Build the sparse control grid (cheap — a few thousand proj4 /
   * project() calls instead of millions).
   */

  const { gridCols, gridRows, gridSX, gridSY } = buildControlGrid(
    exportMap,
    pixelRatio,
    pixelWidth,
    pixelHeight
  );

  const sourceBuffer = sourceImage.data.buffer;
  const gridSXBuffer = gridSX.buffer;
  const gridSYBuffer = gridSY.buffer;

  /*
   * Hand the O(pixelWidth * pixelHeight) resampling work off to a
   * worker thread.
   */

  const result = await runReprojectionWorker(
    {
      sourceBuffer,
      sourceWidth,
      sourceHeight,
      gridSXBuffer,
      gridSYBuffer,
      gridCols,
      gridRows,
      pixelWidth,
      pixelHeight
    },
    [sourceBuffer, gridSXBuffer, gridSYBuffer]
  );

  const outputPixels = new Uint8ClampedArray(result.outputBuffer);
  const outputImage = new ImageData(outputPixels, pixelWidth, pixelHeight);

  const output = document.createElement("canvas");
  output.width = pixelWidth;
  output.height = pixelHeight;

  const ctx = output.getContext("2d");
  ctx.putImageData(outputImage, 0, 0);

  return output;
}

document.getElementById("export-btn").onclick = async () => {
  const button = document.getElementById("export-btn");
  button.textContent = "Exporting...";

  const map = getMap();

  const dpi = getDPI();
  const page = PAGE_SIZES[getPageSize()];

  if (!exportCenter) {
    alert("Please select a center point first.");
    button.textContent = "Export";
    return;
  }

  calculateBounds();

  /*
   * Final BNG raster dimensions.
   */

  const pxWidth = Math.round(page.w * dpi);
  const pxHeight = Math.round(page.h * dpi);

  /*
   * MapLibre uses CSS pixels internally.
   */

  const cssWidth = Math.round(page.w * 128);
  const cssHeight = Math.round(page.h * 128);

  const pixelRatio = dpi / 128;

  const container = document.createElement("div");

  container.style.position = "absolute";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = `${cssWidth}px`;
  container.style.height = `${cssHeight}px`;

  document.body.appendChild(container);

  /*
   * Hide export overlays.
   */

  if (map.getLayer("export-center")) {
    map.setLayoutProperty("export-center", "visibility", "none");
  }

  if (map.getLayer("export-bbox")) {
    map.setLayoutProperty("export-bbox", "visibility", "none");
  }

  /*
   * Create temporary MapLibre map.
   */

  const exportMap = new maplibregl.Map({
    container: container,
    style: map.getStyle(),
    bounds: [
      [sw.lng, sw.lat],
      [ne.lng, ne.lat]
    ],
    fitBoundsOptions: {
      padding: 0
    },
    interactive: false,
    preserveDrawingBuffer: true,
    pixelRatio: pixelRatio
  });

  try {
    /*
     * Wait for the copied style to load.
     */

    await new Promise((resolve) => {
      exportMap.once("style.load", resolve);
    });

    /*
     * Load pattern images into the EXPORT MAP.
     *
     * Runtime images added to the original map are not copied by
     * map.getStyle(). Load them in parallel rather than one at a
     * time.
     */

    const [patternImg, marshImg, greenDotImg] = await Promise.all([
      exportMap.loadImage("./patterns/dot.png"),
      exportMap.loadImage("./patterns/marsh.png"),
      exportMap.loadImage("./patterns/greenDot.png")
    ]);

    /*
     * Add them to the export map.
     */

    if (!exportMap.hasImage("dot")) {
      exportMap.addImage("dot", patternImg.data);
    }

    if (!exportMap.hasImage("marsh")) {
      exportMap.addImage("marsh", marshImg.data);
    }

    if (!exportMap.hasImage("greenDot")) {
      exportMap.addImage("greenDot", greenDotImg.data);
    }

    /*
     * Wait for all map data and patterns to finish rendering.
     */

    await new Promise((resolve) => {
      exportMap.once("idle", resolve);
    });

    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });

    const sourceCanvas = exportMap.getCanvas();

    console.log("MapLibre canvas:", sourceCanvas.width, "x", sourceCanvas.height);
    console.log("BNG output:", pxWidth, "x", pxHeight);

    /*
     * Reproject the actual pixels into the BNG grid (heavy lifting
     * happens in a worker thread).
     */

    const outputCanvas = await reprojectCanvas(sourceCanvas, exportMap, pxWidth, pxHeight);

    /*
     * Export the reprojected image.
     */

    const image = outputCanvas.toDataURL("image/png");

    const link = document.createElement("a");
    link.download = `OSOM-${getScale()}-${getPageSize()}-${dpi}dpi.png`;
    link.href = image;
    link.click();

    /*
     * Generate matching BNG PGW.
     */

    PGW(pxWidth, pxHeight);
  } finally {
    exportMap.remove();
    container.remove();

    /*
     * Restore overlays.
     */

    if (map.getLayer("export-center")) {
      map.setLayoutProperty("export-center", "visibility", "visible");
    }

    if (map.getLayer("export-bbox")) {
      map.setLayoutProperty("export-bbox", "visibility", "visible");
    }

    button.textContent = "Export";
  }
};

function PGW(pixelWidth, pixelHeight) {
  calculateBounds();

  /*
   * Exact BNG extent used by the reprojected PNG.
   */

  const mapWidth = ne.bngX - sw.bngX;
  const mapHeight = ne.bngY - sw.bngY;

  /*
   * BNG metres per pixel.
   */

  const pixelSizeX = mapWidth / pixelWidth;
  const pixelSizeY = -mapHeight / pixelHeight;

  /*
   * Centre of the upper-left pixel.
   */

  const topLeftX = sw.bngX + pixelSizeX / 2;
  const topLeftY = ne.bngY + pixelSizeY / 2;

  /*
   * North-up BNG raster.
   */

  const pgw = `${pixelSizeX}\n0\n0\n${pixelSizeY}\n${topLeftX}\n${topLeftY}`;

  console.log("EPSG:27700 PGW:");
  console.log(pgw);

  const blob = new Blob([pgw], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const world = document.createElement("a");
  world.href = url;
  world.download = `OSOM-${getScale()}-${getPageSize()}-${getDPI()}dpi.pgw`;
  world.click();

  URL.revokeObjectURL(url);

  return pgw;
}