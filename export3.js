window.exportMap = null;
let exportCenter = null;
let exportBounds = null;
let Nlat = null, Slat = null, Wlng = null, Elng = null;
let scale = null;
let DPI = null;

function getMap() {
  return window.map;
}

//lat/lng to meters and meters to lat/lng
function latToMeters(input) {
  return 6378137 * Math.log(Math.tan((Math.PI / 4) + (input * (Math.PI / 360))));
}
function lngToMeters(input) {
  return 6378137 * input * Math.PI / 180;
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
  const centerNorthing = latToMeters(center.lat);
  const centerEasting = lngToMeters(center.lng);
  console.log({ northingM: centerNorthing, eastingM: centerEasting });

  const mercatorScale = 1 / Math.cos(center.lat * Math.PI / 180);

  //calculate bounds in lat/lng
  Nlat = metersToLat(centerNorthing + halfHeight * mercatorScale);
  Slat = metersToLat(centerNorthing - halfHeight * mercatorScale);
  Wlng = metersToLng(centerEasting - halfWidth * mercatorScale);
  Elng = metersToLng(centerEasting + halfWidth * mercatorScale);

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

function drawBBox() {
  const map = getMap();
  if (document.getElementById("landscape").checked) {
    exportBounds = calculateExportBounds(exportCenter, document.getElementById("scale-select").value * paperLengthToMilimeters(document.getElementById("page-size").value)/ 1000, document.getElementById("scale-select").value * paperWidthToMilimeters(document.getElementById("page-size").value)/ 1000);
  } else {
    exportBounds = calculateExportBounds(exportCenter, document.getElementById("scale-select").value * paperWidthToMilimeters(document.getElementById("page-size").value)/ 1000, document.getElementById("scale-select").value * paperLengthToMilimeters(document.getElementById("page-size").value)/ 1000);
  }
  if (map.getSource("export-bbox") || map.getSource("export-center")) {
    map.removeLayer("export-bbox");
    map.removeSource("export-bbox");
    map.removeLayer("export-center");
    map.removeSource("export-center");
  }
  if (!exportBounds) {
    console.error("Export bounds not set.");
    return;
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
  map.addSource("export-bbox", {
    type: "geojson",
    data: boundsToGeoJson(exportBounds[0], exportBounds[1], exportBounds[2], exportBounds[3])
  });

  map.addLayer({
    id: "export-center",
    type: "circle",
    source: "export-center",
    paint: {
      "circle-radius": 3,
      "circle-color": "#ff0000"
    }
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

// Event listeners for scale and page size changes
document.getElementById("scale-select").onchange = drawBBox;
document.getElementById("page-size").onchange = drawBBox;
document.getElementById("landscape").onchange = drawBBox;
document.getElementById("portrait").onchange = drawBBox;

// Select Area for Export
document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();
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
    map.getCanvas().style.cursor = ""; //Set cursor back to default 
    drawBBox();
  });
};

// Export Button click event
document.getElementById("export-btn").onclick = async () => {
  console.log("export recieved", exportBounds);
  await exportBbox(exportBounds);
}




function calculatePGW (mapWidthPx, mapHeightPx) {
  // 1. Convert bounding box edges from degrees to Web Mercator meters
  const minX = lngToMeters(exportBounds[2]);
  const maxX = lngToMeters(exportBounds[3]);
  const minY = latToMeters(exportBounds[1]);
  const maxY = latToMeters(exportBounds[0]);

  // 2. Calculate pixel size strictly in meters
  let l1 = (maxX - minX) / mapWidthPx;  // Width of a pixel in meters
  let l2 = 0;
  let l3 = 0;
  let l4 = (minY - maxY) / mapHeightPx;  // Height of a pixel in meters (negative value)
  
  // 3. Set the origin coordinates (center of the top-left pixel)
  // To be mathematically precise, offset by half a pixel size to hit the pixel center
  let l5 = minX + (l1 / 2);
  let l6 = maxY + (l4 / 2);

  const pgwContent = `${l1}\n${l2}\n${l3}\n${l4}\n${l5}\n${l6}`;
  console.log("PGW content:", pgwContent);
  return pgwContent;
}



function downloadPGW(pgwContent) {
  const blob = new Blob([pgwContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "export.pgw";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
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

  // Calculate the CSS viewport size at zoom 14.
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

  const container = createExportContainer(
    Math.ceil(cssWidth),
    Math.ceil(cssHeight)
  );

  const pixelRatio = Math.max(
    outputWidth / cssWidth,
    outputHeight / cssHeight
  );

  console.log("Export pixel ratio:", pixelRatio);

  // Create MapLibre export map.
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

  // Wait for style to load first
  await new Promise((resolve) => {
    if (exportMap.isStyleLoaded()) {
      resolve();
    } else {
      exportMap.once("style.load", resolve);
    }
  });

  //hide red bounds
  exportMap.setLayoutProperty("export-center", "visibility", "none");
  exportMap.setLayoutProperty("export-bbox", "visibility", "none");

  // Load custom pattern images
  const patternImg = await exportMap.loadImage("./patterns/dot.png");
  const marshImg = await exportMap.loadImage("./patterns/marsh.png");
  const greenDotImg = await exportMap.loadImage("./patterns/greenDot.png");

  exportMap.addImage("dot", patternImg.data);
  exportMap.addImage("marsh", marshImg.data);
  exportMap.addImage("greenDot", greenDotImg.data);

  // Force MapLibre to recognise the container size.
  exportMap.resize();

  // Wait until everything has rendered.
  await new Promise((resolve) => {
    if (exportMap.loaded() && exportMap.areTilesLoaded()) {     
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
  const DPI = parseFloat(document.getElementById("dpi").value);
  if (!Number.isFinite(DPI) || DPI <= 0) {
    console.error("Invalid DPI:", DPI);
    return;
  }
  const paperWidthMM = paperWidthToMilimeters(document.getElementById("page-size").value);
  const paperHeightMM = paperLengthToMilimeters(document.getElementById("page-size").value);

  const outputWidth = Math.round((paperWidthMM / 25.4) * DPI);
  const outputHeight = Math.round((paperHeightMM / 25.4) * DPI);

  console.log("Export settings:", {
    DPI,
    paperWidthMM,
    paperHeightMM,
    outputWidth,
    outputHeight
  });

  // Create MapLibre map at the required resolution.
  const exportMap = await createExportMap(
    bounds,
    outputWidth,
    outputHeight
  );

  // Get the actual MapLibre WebGL canvas.
  const canvas = exportMap.getCanvas();

  console.log("Final rendered canvas:", {
    width: canvas.width,
    height: canvas.height,
    expectedWidth: outputWidth,
    expectedHeight: outputHeight
  });

  downloadPGW(calculatePGW(canvas.width, canvas.height));

  // Export directly from MapLibre's high-resolution canvas.
  const imgUrl = canvas.toDataURL("image/png");
  const downloadLink = document.createElement("a");

  downloadLink.href = imgUrl;
  downloadLink.download =`map-export-${DPI}dpi.png`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  //clean up
  exportMap.remove();
  window.exportMap = null;
  const container =
    document.getElementById(
      "map-export-container"
    );
  if (container) {
    container.remove();
  }

  //add back bbox and center
  console.log("Export complete.");
}