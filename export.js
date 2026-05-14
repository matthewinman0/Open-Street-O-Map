let exportCenter = null;

const PAGE_SIZES = {
  A4: { w: 11.69, h: 8.27 },
  A3: { w: 16.54, h: 11.69 },
  A2: { w: 23.4, h: 16.5 }
};

// Helpers
function getScale() {
  return parseInt(document.getElementById("scale-select").value);
}
function getPageSize() {
  return document.getElementById("page-size").value;
}
function getDPI() {
  return parseInt(document.getElementById("dpi").value) || 600;
}
function getMap() {
  return window.map;
}

// Preview box
let previewBoxId = "export-preview-box";

function updatePreview() {
  const map = getMap();
  if (!map || !exportCenter) return;

  const scale = getScale();
  const page = PAGE_SIZES[getPageSize()];

  const inchesToMeters = 0.0254;

  const widthMeters = scale * (page.w * inchesToMeters);
  const heightMeters = scale * (page.h * inchesToMeters);

  const lat = exportCenter.lat;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);

  const deltaLat = heightMeters / metersPerDegLat;
  const deltaLng = widthMeters / metersPerDegLng;

  const bounds = new maplibregl.LngLatBounds(
    [
      exportCenter.lng - deltaLng / 2,
      exportCenter.lat - deltaLat / 2
    ],
    [
      exportCenter.lng + deltaLng / 2,
      exportCenter.lat + deltaLat / 2
    ]
  );

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const geojson = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [sw.lng, sw.lat],
        [sw.lng, ne.lat],
        [ne.lng, ne.lat],
        [ne.lng, sw.lat],
        [sw.lng, sw.lat]
      ]]
    }
  };

  // remove old
  if (map.getSource(previewBoxId)) {
    map.getSource(previewBoxId).setData(geojson);
    return;
  }

  map.addSource(previewBoxId, {
    type: "geojson",
    data: geojson
  });

  map.addLayer({
    id: previewBoxId,
    type: "line",
    source: previewBoxId,
    paint: {
      "line-color": "#ff0000",
      "line-width": 2
    }
  });
}

// Select center
document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();
  if (!map) return;

  map.getCanvas().style.cursor = "crosshair";

  map.once("click", (e) => {
    exportCenter = e.lngLat;
    map.getCanvas().style.cursor = "";

    drawCenter();
    updatePreview();

    console.log("Export center:", exportCenter);
  });
};

// update preview when settings change
document.getElementById("scale-select").onchange = updatePreview;
document.getElementById("page-size").onchange = updatePreview;

// EXPORT
document.getElementById("export-btn").onclick = async () => {
  const map = getMap();

  if (!exportCenter) {
    alert("Select a center first");
    return;
  }

  const scale = getScale();
  const page = PAGE_SIZES[getPageSize()];
  const dpi = getDPI();

  const inchesToMeters = 0.0254;

  const widthMeters = scale * (page.w * inchesToMeters);
  const heightMeters = scale * (page.h * inchesToMeters);

  const lat = exportCenter.lat;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);

  const deltaLat = heightMeters / metersPerDegLat;
  const deltaLng = widthMeters / metersPerDegLng;

  const bounds = new maplibregl.LngLatBounds(
    [
      exportCenter.lng - deltaLng / 2,
      exportCenter.lat - deltaLat / 2
    ],
    [
      exportCenter.lng + deltaLng / 2,
      exportCenter.lat + deltaLat / 2
    ]
  );

  const pxWidth = Math.round(page.w * dpi);
  const pxHeight = Math.round(page.h * dpi);

  const container = document.createElement("div");
  container.style.width = pxWidth + "px";
  container.style.height = pxHeight + "px";
  container.style.position = "absolute";
  container.style.top = "-99999px";
  document.body.appendChild(container);

  const exportMap = new maplibregl.Map({
    container,
    style: map.getStyle(),
    bounds,
    fitBoundsOptions: { padding: 0 },
    interactive: false,
    preserveDrawingBuffer: true
  });

  await new Promise(r => exportMap.once("idle", r));
  await new Promise(r => requestAnimationFrame(r));

  const canvas = exportMap.getCanvas();
  const image = canvas.toDataURL("image/png");

  exportMap.remove();
  container.remove();

  const a = document.createElement("a");
  a.href = image;
  a.download = `map-${scale}-${getPageSize()}-${dpi}dpi.png`;
  a.click();
};

// Dot maker
function drawCenter() {
  const map = getMap();
  if (!map || !exportCenter) return;

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