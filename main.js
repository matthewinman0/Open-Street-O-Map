let map;
let is3D = false;


//contour definitions
var demSource = new mlcontour.DemSource({
  url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
  encoding: "terrarium", // "mapbox" or "terrarium" default="terrarium"
  maxzoom: 13,
  worker: true, // offload isoline computation to a web worker to reduce jank
  cacheSize: 100, // number of most-recent tiles to cache
  timeoutMs: 10_000, // timeout on fetch requests
});
demSource.setupMaplibre(maplibregl);


//  Style Loader - fetches and merges style layers
async function loadStyle() {
  const base = await (await fetch("./style/base.json")).json();
  const land = await (await fetch("./style/land.json")).json();
  const water = await (await fetch("./style/water.json")).json();
  const paths = await (await fetch("./style/paths.json")).json();
  const roads = await (await fetch("./style/roads.json")).json();
  const buildings = await (await fetch("./style/buildings.json")).json();

  base.layers = [
    ...base.layers,
    ...land.layers,
    ...water.layers,
    ...paths.layers,
    ...roads.layers,
    ...buildings.layers,
  ];

  return base;
}

//  Location 
const geolocate = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
});

// Contour detail definitions
function getContourInterval(zoom) {
  if (zoom < 10) return 200;
  if (zoom < 11) return 100;
  if (zoom < 12) return 50;
  if (zoom < 13) return 25;
  if (zoom < 14) return 10;
  return "5/10";
}

// HUD updater
function updateHUD() {
  const z = map.getZoom();
  const contour = getContourInterval(z);

  document.getElementById("hud").innerText =
    `Zoom: ${z.toFixed(2)} | Contour: ${contour} m`;
}

//  2D/3D Buildings
function toggleBuildings() {
  const terrainEnabled = map.getTerrain() !== null;

  map.setLayoutProperty(
    "buildings-2d",
    "visibility",
    terrainEnabled ? "none" : "visible"
  );

  map.setLayoutProperty(
    "buildings-3d",
    "visibility",
    terrainEnabled ? "visible" : "none"
  );

  map.setLayoutProperty(
    "hills",
    "visibility",
    terrainEnabled ? "visible" : "none"
  );
}

// Map Initialization
window.mapReady = loadStyle().then(style => {
  map = new maplibregl.Map({
    container: "map",
    style,
    center: [-2.5420, 54.0022],
    zoom: 5
});

  window.map = map;
  map.on("style.load", () => {
    map.addControl(new maplibregl.NavigationControl());
    map.addControl(geolocate);
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left"
    );
    map.addControl(
        new maplibregl.TerrainControl({
            source: '3d terrain',
            exaggeration: parseFloat(document.getElementById("terrain-exaggeration").value)
        })
    );
    map.addSource("contour-source", {
      type: "vector",
      tiles: [
        demSource.contourProtocolUrl({
          multiplier: 1, // 1 = meters
          thresholds: {
            // zoom: [minor contour, major contour]
            11: [5, 25],
            12: [5, 25],
            14: [5, 25],
            15: [5, 25],
          },
          // optional, override vector tile parameters:
          contourLayer: "contours",
          elevationKey: "ele",
          levelKey: "level",
          extent: 4096,
          buffer: 1,
        }),
      ],
      maxzoom: 15,
    });

    if (document.getElementById("contoursToggle").checked) {
      map.addLayer({
        id: "contour-lines",
        type: "line",
        source: "contour-source",
        "source-layer": "contours",
        paint: {
          "line-color": "rgba(0,0,0, 50%)",
          // level = highest index in thresholds array the elevation is a multiple of
          "line-width": ["match", ["get", "level"], 1, 1, 0.5],
        },
      });
    }

    map.setTerrain(null);
    toggleBuildings();

    let markerHeight = 50, markerRadius = 10, linearOffset = 25;

    // HUD updates
    updateHUD();
    map.on("move", updateHUD);
    map.on("zoom", updateHUD);
  });
  map.on("terrain", toggleBuildings);
});


//UI button handlers
document.getElementById("settings-toggle").onclick = () => {
  document.getElementById("ui-wrapper").classList.toggle("open");
};

document.getElementById("close-settings-btn").onclick = () => {
  document.getElementById("ui-wrapper").classList.remove("open");
};

//buttons to switch between settings sections
document.getElementById("map-settings-btn").onclick = () => {
  document.getElementById("map-settings").style.display = "block";
  document.getElementById("tools-settings").style.display = "none";
  document.getElementById("export-settings").style.display = "none";
};

document.getElementById("tools-settings-btn").onclick = () => {
  document.getElementById("map-settings").style.display = "none";
  document.getElementById("tools-settings").style.display = "block";
  document.getElementById("export-settings").style.display = "none";
};

document.getElementById("export-settings-btn").onclick = () => {
  document.getElementById("map-settings").style.display = "none";
  document.getElementById("tools-settings").style.display = "none";
  document.getElementById("export-settings").style.display = "block";
};

// Terrain exaggeration control
document.getElementById("terrain-exaggeration").onchange = (e) => {
  const value = parseFloat(e.target.value);
  const terrain = map.getTerrain();
  map.setTerrain({
    source: "3d terrain",
    exaggeration: value
  });
};

document.getElementById("contoursToggle").onchange = (e) => {
  const value = parseFloat(e.target.value);
  const terrain = map.getTerrain();
    if (e.target.checked) {
    map.addLayer({
      id: "contour-lines",
      type: "line",
      source: "contour-source",
      "source-layer": "contours",
      paint: {
        "line-color": "rgba(0,0,0, 50%)",
        // level = highest index in thresholds array the elevation is a multiple of
        "line-width": ["match", ["get", "level"], 1, 1, 0.5],
      },
    });
  } 
  else {
    map.removeLayer("contour-lines");
  }
};
