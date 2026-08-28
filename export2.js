
let exportCenter = null;
let sw = null;
let ne = null;

const PAGE_SIZES = {
  A4: { w: 11.69, h: 8.27 },
  A3: { w: 16.54, h: 11.69 },
  A2: { w: 23.4, h: 16.5 }
};

function getMap() {
  return window.map;
}

function getScale() {
  return parseInt(
    document.getElementById("scale-select").value
  );
}

function getPageSize() {
  return document.getElementById("page-size").value;
}

function getDPI() {
  return parseInt(
    document.getElementById("dpi").value
  ) || 300;
}


document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();

  map.getCanvas().style.cursor =
    "crosshair";

  map.once("click", (e) => {
    exportCenter = e.lngLat;

    map.getCanvas().style.cursor =
      "";

    drawCenter();
    drawBBox();
  });
};


function calculateBounds() {
  const page =
    PAGE_SIZES[
      getPageSize()
    ];

  const scale =
    getScale();

  /*
   * Physical paper size converted to
   * real-world ground metres.
   */

  const widthMetres =
    page.w *
    0.0254 *
    scale;

  const heightMetres =
    page.h *
    0.0254 *
    scale;

  /*
   * Centre in British National Grid.
   */

  const centre =
    proj4(
      "EPSG:4326",
      "EPSG:27700",
      [
        exportCenter.lng,
        exportCenter.lat
      ]
    );

  /*
   * Desired output extent in BNG.
   */

  const swBNG = [
    centre[0] -
      widthMetres / 2,

    centre[1] -
      heightMetres / 2
  ];

  const neBNG = [
    centre[0] +
      widthMetres / 2,

    centre[1] +
      heightMetres / 2
  ];

  /*
   * Store the BNG bounds.
   */

  sw = {
    bngX: swBNG[0],
    bngY: swBNG[1]
  };

  ne = {
    bngX: neBNG[0],
    bngY: neBNG[1]
  };

  /*
   * Convert BNG corners to WGS84 for
   * displaying the bounding box on MapLibre.
   */

  const swWGS84 =
    proj4(
      "EPSG:27700",
      "EPSG:4326",
      swBNG
    );

  const neWGS84 =
    proj4(
      "EPSG:27700",
      "EPSG:4326",
      neBNG
    );

  sw.lng = swWGS84[0];
  sw.lat = swWGS84[1];

  ne.lng = neWGS84[0];
  ne.lat = neWGS84[1];
}


function drawCenter() {
  const map = getMap();

  if (map.getSource("export-center")) {
    map.removeLayer(
      "export-center"
    );

    map.removeSource(
      "export-center"
    );
  }

  map.addSource(
    "export-center",
    {
      type: "geojson",

      data: {
        type: "Feature",

        geometry: {
          type: "Point",

          coordinates: [
            exportCenter.lng,
            exportCenter.lat
          ]
        }
      }
    }
  );

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

      coordinates: [[
        [
          sw.lng,
          sw.lat
        ],

        [
          sw.lng,
          ne.lat
        ],

        [
          ne.lng,
          ne.lat
        ],

        [
          ne.lng,
          sw.lat
        ],

        [
          sw.lng,
          sw.lat
        ]
      ]]
    }
  };

  if (map.getSource("export-bbox")) {
    map.removeLayer(
      "export-bbox"
    );

    map.removeSource(
      "export-bbox"
    );
  }

  map.addSource(
    "export-bbox",
    {
      type: "geojson",
      data: geojson
    }
  );

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


document.getElementById(
  "scale-select"
).onchange = drawBBox;

document.getElementById(
  "page-size"
).onchange = drawBBox;


/*
 * Convert a BNG coordinate into a pixel
 * position in the MapLibre export canvas.
 */

function bngToCanvas(
  x,
  y,
  exportMap,
  canvas
) {
  const wgs84 =
    proj4(
      "EPSG:27700",
      "EPSG:4326",
      [
        x,
        y
      ]
    );

  const point =
    exportMap.project({
      lng:
        wgs84[0],

      lat:
        wgs84[1]
    });

  return {
    x: point.x,
    y: point.y
  };
}


/*
 * Reproject the MapLibre canvas from
 * EPSG:3857 into an EPSG:27700 pixel grid.
 */

function reprojectCanvas(
  sourceCanvas,
  exportMap,
  pixelWidth,
  pixelHeight
) {
  /*
   * MapLibre uses a WebGL canvas.
   *
   * Copy it into a normal 2D canvas so
   * that we can access the pixel data.
   */

  const source2D =
    document.createElement(
      "canvas"
    );

  source2D.width =
    sourceCanvas.width;

  source2D.height =
    sourceCanvas.height;

  const sourceCtx =
    source2D.getContext(
      "2d"
    );

  sourceCtx.drawImage(
    sourceCanvas,
    0,
    0
  );

  const sourceWidth =
    source2D.width;

  const sourceHeight =
    source2D.height;

  const sourceImage =
    sourceCtx.getImageData(
      0,
      0,
      sourceWidth,
      sourceHeight
    );

  const sourcePixels =
    sourceImage.data;

  /*
   * Create the final EPSG:27700
   * output canvas.
   */

  const output =
    document.createElement(
      "canvas"
    );

  output.width =
    pixelWidth;

  output.height =
    pixelHeight;

  const ctx =
    output.getContext(
      "2d"
    );

  const outputImage =
    ctx.createImageData(
      pixelWidth,
      pixelHeight
    );

  const outputPixels =
    outputImage.data;

  /*
   * BNG extent.
   */

  const bngWidth =
    ne.bngX -
    sw.bngX;

  const bngHeight =
    ne.bngY -
    sw.bngY;

  /*
   * BNG metres per output pixel.
   */

  const pixelSizeX =
    bngWidth /
    pixelWidth;

  const pixelSizeY =
    bngHeight /
    pixelHeight;

  /*
   * MapLibre pixel ratio.
   */

  const pixelRatio =
    exportMap.getPixelRatio();

  /*
   * Process every output pixel.
   */

  for (
    let py = 0;
    py < pixelHeight;
    py++
  ) {
    /*
     * BNG northing at the centre
     * of this output pixel.
     */

    const bngY =
      ne.bngY -
      (
        py +
        0.5
      ) *
      pixelSizeY;

    for (
      let px = 0;
      px < pixelWidth;
      px++
    ) {
      /*
       * BNG easting at the centre
       * of this output pixel.
       */

      const bngX =
        sw.bngX +
        (
          px +
          0.5
        ) *
        pixelSizeX;

      /*
       * Convert BNG -> WGS84.
       */

      const wgs84 =
        proj4(
          "EPSG:27700",
          "EPSG:4326",
          [
            bngX,
            bngY
          ]
        );

      /*
       * Convert WGS84 into a MapLibre
       * canvas coordinate.
       */

      const sourcePoint =
        exportMap.project({
          lng:
            wgs84[0],

          lat:
            wgs84[1]
        });

      /*
       * MapLibre project() returns CSS
       * pixels, so convert to physical
       * WebGL canvas pixels.
       */

      const sx =
        sourcePoint.x *
        pixelRatio;

      const sy =
        sourcePoint.y *
        pixelRatio;

      /*
       * Bilinear interpolation.
       */

      const x0 =
        Math.floor(sx);

      const y0 =
        Math.floor(sy);

      const x1 =
        x0 + 1;

      const y1 =
        y0 + 1;

      const fx =
        sx -
        x0;

      const fy =
        sy -
        y0;

      const outputIndex =
        (
          py *
          pixelWidth +
          px
        ) *
        4;

      /*
       * Check source bounds.
       */

      if (
        x0 < 0 ||
        y0 < 0 ||
        x1 >= sourceWidth ||
        y1 >= sourceHeight
      ) {
        outputPixels[
          outputIndex
        ] = 0;

        outputPixels[
          outputIndex + 1
        ] = 0;

        outputPixels[
          outputIndex + 2
        ] = 0;

        outputPixels[
          outputIndex + 3
        ] = 0;

        continue;
      }

      const i00 =
        (
          y0 *
          sourceWidth +
          x0
        ) *
        4;

      const i10 =
        (
          y0 *
          sourceWidth +
          x1
        ) *
        4;

      const i01 =
        (
          y1 *
          sourceWidth +
          x0
        ) *
        4;

      const i11 =
        (
          y1 *
          sourceWidth +
          x1
        ) *
        4;

      /*
       * Interpolate each colour channel.
       */

      for (
        let channel = 0;
        channel < 4;
        channel++
      ) {
        const top =
          sourcePixels[
            i00 + channel
          ] *
          (1 - fx) +

          sourcePixels[
            i10 + channel
          ] *
          fx;

        const bottom =
          sourcePixels[
            i01 + channel
          ] *
          (1 - fx) +

          sourcePixels[
            i11 + channel
          ] *
          fx;

        outputPixels[
          outputIndex + channel
        ] =
          Math.round(
            top *
            (1 - fy) +

            bottom *
            fy
          );
      }
    }
  }

  /*
   * Write the reprojected pixels.
   */

  ctx.putImageData(
    outputImage,
    0,
    0
  );

  return output;
}



document.getElementById("export-btn").onclick = async () => {
  const button = document.getElementById("export-btn");
  button.textContent = "Exporting...";

  const map = getMap();

  const dpi =
    getDPI();

  const page =
    PAGE_SIZES[
      getPageSize()
    ];

  if (!exportCenter) {
    alert(
      "Please select a center point first."
    );
    button.textContent = "Export";
    return;
  }

  calculateBounds();

  /*
   * Final BNG raster dimensions.
   */

  const pxWidth =
    Math.round(
      page.w *
      dpi
    );

  const pxHeight =
    Math.round(
      page.h *
      dpi
    );

  /*
   * MapLibre uses CSS pixels internally.
   */

  const cssWidth =
    Math.round(
      page.w *
      128
    );

  const cssHeight =
    Math.round(
      page.h *
      128
    );

  const pixelRatio =
    dpi /
    128;

  const container =
    document.createElement(
      "div"
    );

  container.style.position =
    "absolute";

  container.style.left =
    "-99999px";

  container.style.top =
    "0";

  container.style.width =
    `${cssWidth}px`;

  container.style.height =
    `${cssHeight}px`;

  document.body.appendChild(
    container
  );

  /*
   * Hide export overlays.
   */

  if (map.getLayer("export-center")) {
    map.setLayoutProperty(
      "export-center",
      "visibility",
      "none"
    );
  }

  if (map.getLayer("export-bbox")) {
    map.setLayoutProperty(
      "export-bbox",
      "visibility",
      "none"
    );
  }

  /*
   * Create temporary MapLibre map.
   */

  const exportMap =
    new maplibregl.Map({
      container: container,

      style: map.getStyle(),

      bounds: [
        [
          sw.lng,
          sw.lat
        ],
        [
          ne.lng,
          ne.lat
        ]
      ],

      fitBoundsOptions: {
        padding: 0
      },

      interactive: false,

      preserveDrawingBuffer: true,

      pixelRatio: pixelRatio
    });

  try {
    await new Promise(
      (resolve) => {
        exportMap.once(
          "idle",
          resolve
        );
      }
    );

    await new Promise(
      (resolve) => {
        requestAnimationFrame(
          resolve
        );
      }
    );

    const sourceCanvas =
      exportMap.getCanvas();

    console.log(
      "MapLibre canvas:",
      sourceCanvas.width,
      "x",
      sourceCanvas.height
    );

    console.log(
      "BNG output:",
      pxWidth,
      "x",
      pxHeight
    );

    /*
     * Reproject the actual pixels
     * into the BNG grid.
     */

    const outputCanvas =
      reprojectCanvas(
        sourceCanvas,
        exportMap,
        pxWidth,
        pxHeight
      );

    /*
     * Export the reprojected image.
     */

    const image =
      outputCanvas.toDataURL(
        "image/png"
      );

    const link =
      document.createElement(
        "a"
      );

    link.download =
      `OSOM-${getScale()}-${getPageSize()}-${dpi}dpi.png`;

    link.href =
      image;

    link.click();

    /*
     * Generate matching BNG PGW.
     */

    PGW(
      pxWidth,
      pxHeight
    );

  } finally {
    exportMap.remove();

    container.remove();

    /*
     * Restore overlays.
     */

    if (map.getLayer("export-center")) {
      map.setLayoutProperty(
        "export-center",
        "visibility",
        "visible"
      );
    }

    if (map.getLayer("export-bbox")) {
      map.setLayoutProperty(
        "export-bbox",
        "visibility",
        "visible"
      );
    }
  }
  button.textContent = "Export";
};


function PGW(
  pixelWidth,
  pixelHeight
) {
  calculateBounds();

  /*
   * Exact BNG extent used by
   * the reprojected PNG.
   */

  const mapWidth =
    ne.bngX -
    sw.bngX;

  const mapHeight =
    ne.bngY -
    sw.bngY;

  /*
   * BNG metres per pixel.
   */

  const pixelSizeX =
    mapWidth /
    pixelWidth;

  const pixelSizeY =
    -mapHeight /
    pixelHeight;

  /*
   * Centre of the upper-left pixel.
   */

  const topLeftX =
    sw.bngX +
    pixelSizeX /
    2;

  const topLeftY =
    ne.bngY +
    pixelSizeY /
    2;

  /*
   * North-up BNG raster.
   */

  const pgw =
`${pixelSizeX}
0
0
${pixelSizeY}
${topLeftX}
${topLeftY}`;

  console.log(
    "EPSG:27700 PGW:"
  );

  console.log(
    pgw
  );

  const blob =
    new Blob(
      [pgw],
      {
        type: "text/plain"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const world =
    document.createElement(
      "a"
    );

  world.href =
    url;

  world.download =
    `OSOM-${getScale()}-${getPageSize()}-${getDPI()}dpi.pgw`;

  world.click();

  URL.revokeObjectURL(
    url
  );

  return pgw;
}