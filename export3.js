window.exportMap = null;
let exportCenter = null;
let exportBounds = null;

function getMap() {
  return window.map;
}

//lat/lng to meters and meters to lat/lng
function latToMeters(input) {
  return 6378137 * Math.log(Math.tan((Math.PI / 4) + (input.lat * (Math.PI / 360))));
}
function lngToMeters(input) {
  return 6378137 * input.lng * Math.PI / 180;
}
function metersToLat(meters) {
  return (360 / Math.PI) * Math.atan(Math.exp(meters / 6378137)) - 90;
}
function metersToLng(meters) {
  return meters * 180 / (6378137 * Math.PI);
}

//A4 paper sizes in meters
function paperWidthToMilimeters(n) {
  const getWidth = (n) => Math.round(Math.sqrt(1 / (Math.pow(2, n) * Math.sqrt(2))) * 1000);
  return getWidth(n);
}
function paperLengthToMilimeters(n) {
  const getLength = (n) => Math.round(Math.sqrt(Math.sqrt(2) / Math.pow(2, n)) * 1000);
  return getLength(n);
}


function calculateExportBounds(center, width, height) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  //convert center lat/lng to meters
  const centerNorthing = latToMeters(center);
  const centerEasting = lngToMeters(center);
  console.log({ northingM: centerNorthing, eastingM: centerEasting });

  const mercatorScale = 1 / Math.cos(center.lat * Math.PI / 180);

  //calculate bounds in lat/lng
  const Nlat = metersToLat(centerNorthing + halfHeight * mercatorScale);
  const Slat = metersToLat(centerNorthing - halfHeight * mercatorScale);
  const Wlng = metersToLng(centerEasting - halfWidth * mercatorScale);
  const Elng = metersToLng(centerEasting + halfWidth * mercatorScale);

  const boundCoordinates = [Nlat, Slat, Wlng, Elng]
  return boundCoordinates;
}

function boundsToGeoJson(Nlat, Slat, Wlng, Elng){
  //points to maplibre usable geojson
  const geojson = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [Wlng, Slat],
          [Wlng, Nlat],
          [Elng, Nlat],
          [Elng, Slat],
          [Wlng, Slat]
        ]
      ]
    }
  };
  return geojson;
}

function drawBBox(geojson) {
  const map = getMap();
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

// Select Area for Export
document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();
  const scale = document.getElementById("scale-select").value;
  map.getCanvas().style.cursor = "crosshair";
  //cancel map select
  document.getElementById("export-select-btn").addEventListener("keydown", function (event) {
    if (event.code === "Escape") {
      map.getCanvas().style.cursor = "";
      return;
    }
  });
  //select map center
  map.once("click", (e) => {
    exportCenter = e.lngLat;
    map.getCanvas().style.cursor = "";
    console.log("Export center selected:", exportCenter);

    exportBounds = calculateExportBounds(exportCenter, scale * paperWidthToMilimeters(document.getElementById("page-size").value)/ 1000, scale * paperLengthToMilimeters(document.getElementById("page-size").value)/ 1000);
    console.log("Export bounds:", exportBounds);

    drawBBox(boundsToGeoJson(exportBounds[0], exportBounds[1], exportBounds[2], exportBounds[3]));
  });
};


document.getElementById("export-btn").onclick = async () => {
  const map = getMap();
  console.log("export recieved", exportBounds);

  await exportBbox(exportBounds);
}





function createExportContainer(width, height) {
  const existing = document.getElementById("map-export-container");

  if (existing) {
    existing.remove();
  }
  const container = document.createElement("div");

  container.id = "map-export-container";
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";

  document.body.appendChild(container);

  return container;
}

async function createExportMap(bounds, outputWidth, outputHeight) {
  const mainMap = getMap();

  const EXPORT_ZOOM = 14;

  const [Nlat, Slat, Wlng, Elng] = bounds;

  // ----------------------------------------------------------
  // Calculate the CSS viewport size at zoom 14.
  //
  // This controls the geographic area shown.
  // DPI is NOT used here.
  // ----------------------------------------------------------

  const worldSize = 512 * Math.pow(2, EXPORT_ZOOM);

  function lngToPixel(lng) {
    return ((lng + 180) / 360) * worldSize;
  }

  function latToPixel(lat) {
    const latRad = lat * Math.PI / 180;

    return (
      (1 -
        Math.log(
          Math.tan(latRad) +
          1 / Math.cos(latRad)
        ) / Math.PI
      ) / 2
    ) * worldSize;
  }

  const westPixel = lngToPixel(Wlng);
  const eastPixel = lngToPixel(Elng);

  const northPixel = latToPixel(Nlat);
  const southPixel = latToPixel(Slat);

  const cssWidth = Math.abs(
    eastPixel - westPixel
  );

  const cssHeight = Math.abs(
    southPixel - northPixel
  );

  console.log("Export viewport:", {
    cssWidth,
    cssHeight,
    outputWidth,
    outputHeight,
    zoom: EXPORT_ZOOM
  });

  // ----------------------------------------------------------
  // Create the CSS-sized container.
  //
  // This determines the geographic extent.
  // ----------------------------------------------------------

  const container = createExportContainer(
    Math.ceil(cssWidth),
    Math.ceil(cssHeight)
  );

  // ----------------------------------------------------------
  // Calculate the pixel ratio required to make the
  // MapLibre WebGL canvas itself the requested resolution.
  //
  // We use both dimensions and take the larger ratio.
  // ----------------------------------------------------------

  const pixelRatio = Math.max(
    outputWidth / cssWidth,
    outputHeight / cssHeight
  );

  console.log("Export pixel ratio:", pixelRatio);

  // ----------------------------------------------------------
  // Create MapLibre export map.
  //
  // IMPORTANT:
  // MapLibre itself renders at the high resolution.
  // There is NO later upscaling.
  // ----------------------------------------------------------

  window.exportMap = new maplibregl.Map({
    container: container,

    style: mainMap.getStyle(),

    interactive: false,

    preserveDrawingBuffer: true,

    attributionControl: false,

    center: exportCenter,

    zoom: EXPORT_ZOOM,

    bearing: 0,

    pitch: 0,

    pixelRatio: pixelRatio
  });

  const exportMap = window.exportMap;

  // ----------------------------------------------------------
  // Wait for style
  // ----------------------------------------------------------

  await new Promise((resolve) => {
    if (exportMap.isStyleLoaded()) {
      resolve();
    } else {
      exportMap.once("style.load", resolve);
    }
  });

  // ----------------------------------------------------------
  // Force MapLibre to recognise the container size.
  // ----------------------------------------------------------

  exportMap.resize();

  // ----------------------------------------------------------
  // Wait until everything has rendered.
  // ----------------------------------------------------------

  await new Promise((resolve) => {
    if (
      exportMap.loaded() &&
      exportMap.areTilesLoaded()
    ) {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    } else {
      exportMap.once("idle", () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
    }
  });

  console.log("Actual MapLibre canvas:", {
    width: exportMap.getCanvas().width,
    height: exportMap.getCanvas().height
  });

  return exportMap;
}


async function exportBbox(bounds) {
  // ----------------------------------------------------------
  // DPI
  // ----------------------------------------------------------

  const DPI = parseFloat(
    document.getElementById("dpi").value
  );

  if (!Number.isFinite(DPI) || DPI <= 0) {
    console.error("Invalid DPI:", DPI);
    return;
  }

  // ----------------------------------------------------------
  // Paper size
  //
  // Currently A4.
  // ----------------------------------------------------------

  const paperWidthMM =
    paperWidthToMilimeters(4);

  const paperHeightMM =
    paperLengthToMilimeters(4);

  // ----------------------------------------------------------
  // Convert physical paper size to actual pixels.
  //
  // This is the resolution MapLibre must render at.
  // ----------------------------------------------------------

  const outputWidth = Math.round(
    (paperWidthMM / 25.4) * DPI
  );

  const outputHeight = Math.round(
    (paperHeightMM / 25.4) * DPI
  );

  console.log("Export settings:", {
    DPI,
    paperWidthMM,
    paperHeightMM,
    outputWidth,
    outputHeight
  });

  // ----------------------------------------------------------
  // Create MapLibre map at the required resolution.
  //
  // No second canvas.
  // No upscaling.
  // ----------------------------------------------------------

  const exportMap = await createExportMap(
    bounds,
    outputWidth,
    outputHeight
  );

  // ----------------------------------------------------------
  // Get the actual MapLibre WebGL canvas.
  // ----------------------------------------------------------

  const canvas = exportMap.getCanvas();

  console.log("Final rendered canvas:", {
    width: canvas.width,
    height: canvas.height,

    expectedWidth: outputWidth,
    expectedHeight: outputHeight
  });

  // ----------------------------------------------------------
  // Export directly from MapLibre's high-resolution canvas.
  // ----------------------------------------------------------

  const imgUrl = canvas.toDataURL(
    "image/png"
  );

  // ----------------------------------------------------------
  // Download
  // ----------------------------------------------------------

  const downloadLink =
    document.createElement("a");

  downloadLink.href = imgUrl;

  downloadLink.download =
    `map-export-${DPI}dpi.png`;

  document.body.appendChild(downloadLink);

  downloadLink.click();

  document.body.removeChild(downloadLink);

  // ----------------------------------------------------------
  // Clean up
  // ----------------------------------------------------------

  exportMap.remove();

  window.exportMap = null;

  const container =
    document.getElementById(
      "map-export-container"
    );

  if (container) {
    container.remove();
  }

  console.log("Export complete.");
}