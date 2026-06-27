let map;
let is3D = false;
let mapStyle = "Forest"; // default map style
let mapInitialized = false;

//contour definitions
var demSource = new mlcontour.DemSource({
  url: "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp",
  encoding: "terrarium", // "mapbox" or "terrarium" default="terrarium"
  maxzoom: 13,
  worker: true, // offload isoline computation to a web worker to reduce jank
  cacheSize: 100, // number of most-recent tiles to cache
  timeoutMs: 10_000, // timeout on fetch requests
});
demSource.setupMaplibre(maplibregl);


//  Style Loader - fetches and merges style layers
async function loadStyle() {
  let base, land, water, paths, roads, buildings;
  base = await (await fetch("./style/base.json")).json();
  land = await (await fetch("./style/land.json")).json();
  water = await (await fetch("./style/water.json")).json();
  if (mapStyle === "Forest") {
    paths = await (await fetch("./style/forest/paths.json")).json();
    roads = await (await fetch("./style/forest/roads.json")).json();
    buildings = await (await fetch("./style/forest/buildings.json")).json();
  } else if (mapStyle === "Sprint") {
    paths = await (await fetch("./style/sprint/paths.json")).json();
    roads = await (await fetch("./style/sprint/roads.json")).json();
    buildings = await (await fetch("./style/sprint/buildings.json")).json();
  }
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

document.getElementById("style-select").onchange = async (e) => {
  mapStyle = e.target.value;
  const newStyle = await loadStyle();
  map.setStyle(newStyle, { diff: false });
};

//  Location 
const geolocate = new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true
});

// HUD updater
function updateHUD() {
  const z = map.getZoom();
  const { lng, lat } = map.getCenter();

  document.getElementById("hud").innerText =
    `Zoom: ${z.toFixed(2)} | Longitude: ${lng.toFixed(4)} | Latitude: ${lat.toFixed(4)}`;
}

//  2D/3D Buildings & hillshade
document.getElementById("3d-buildings-toggle").addEventListener("change", (e) => {
  const buildingsEnabled = e.target.checked;

  map.setLayoutProperty(
    "buildings-2d",
    "visibility",
    buildingsEnabled ? "none" : "visible"
  );

  map.setLayoutProperty(
    "buildings-3d",
    "visibility",
    buildingsEnabled ? "visible" : "none"
  );
});

function toggleBuildings() {
  const terrainEnabled = map.getTerrain() !== null;
  map.setLayoutProperty(
    "hillshade",
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

  map.on("style.load", async () => {
  const patternImg = await map.loadImage("./patterns/dot.png");
  map.addImage("dot", patternImg.data);
  const marshImg = await map.loadImage("./patterns/marsh.png");
  map.addImage("marsh", marshImg.data);
    if (!map.__initialized) {
      map.addControl(new maplibregl.NavigationControl());
      map.addControl(geolocate);
      map.addControl(
        new maplibregl.ScaleControl({maxWidth: 120, unit: "metric"}),"bottom-left"
      );
      map.addControl(
        new maplibregl.TerrainControl({
          source: "3d terrain",
          exaggeration: parseFloat(document.getElementById("terrain-exaggeration").value
          )
        })
      );
      map.addLayer({
        id: "sand",
        type: "fill",
        source: "osm", // <-- must exist already
        "source-layer": "landcover",     // if vector tiles
        filter: ["in", "subclass", "sand", "farmland"],
        paint: {
          "fill-pattern": "dot",
          "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.1,
          13, 0.3,
          14, 0.8
        ]
        }
      });
      map.addLayer({
        id: "marsh",
        type: "fill",
        source: "osm", // <-- must exist already
        "source-layer": "landcover",     // if vector tiles
        filter: ["in", "subclass", "swamp", "marsh", "mangrove", "bog", "wetland"],
        paint: {
          "fill-pattern": "marsh",
          "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10, 0.1,
          13, 0.3,
          14, 0.8
        ]
        }
      });
      map.__initialized = true;
    }

    if (!map.getSource("contour-source")) {
      map.addSource("contour-source", {
        type: "vector",
        tiles: [
          demSource.contourProtocolUrl({
            multiplier: 1,
            thresholds: {
              11: [5, 25],
              12: [5, 25],
              14: [5, 25],
              15: [5, 25],
            },
            contourLayer: "contours",
            elevationKey: "ele",
            levelKey: "level",
            extent: 4096,
            buffer: 1,
          }),
        ],
        maxzoom: 15,
      });
    }
    if (!map.getLayer("contour-lines")) {
      map.addLayer({
        id: "contour-lines",
        type: "line",
        source: "contour-source",
        "source-layer": "contours",
        paint: {
          "line-color": "rgba(0,0,0, 50%)",
          "line-width": ["match", ["get", "level"], 1, 1, 0.5],
        },
      });
    }
    map.setTerrain(null);
    toggleBuildings();

    // HUD
    updateHUD();
    map.on("move", updateHUD);
    map.on("zoom", updateHUD);
    map.on("terrain", toggleBuildings);


  });
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

document.getElementById("contour-type").onchange = (e) => {
  const value = e.target.value;

  // remove existing contour layer
  if (map.getLayer("contour-lines")) {
    map.removeLayer("contour-lines");
  }
  // remove existing source
  if (map.getSource("contour-source")) {
    map.removeSource("contour-source");
  }
  // none selected
  if (value === "none") {
    return;
  }

  // choose DEM source URL
  let demUrl;
  let encoding;
  if (value === "mapterhorn") {
    demUrl = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
  }
  else if (value === "amazon") {
    demUrl = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  }

  // create NEW contour source
  const demSource = new mlcontour.DemSource({
    url: demUrl,
    encoding: encoding||"terrarium",
    maxzoom: 13,
    worker: true,
    cacheSize: 100,
    timeoutMs: 10000
  });

  demSource.setupMaplibre(maplibregl);

  map.addSource("contour-source", {
    type: "vector",
    tiles: [
      demSource.contourProtocolUrl({
        multiplier: 1,
        thresholds: {
          11: [5, 25],
          12: [5, 25],
          14: [5, 25],
          15: [5, 25],
        },
        contourLayer: "contours",
        elevationKey: "ele",
        levelKey: "level",
        extent: 4096,
        buffer: 1,
      }),
    ],
    maxzoom: 15,
  });

  // recreate contour layer
  map.addLayer({
    id: "contour-lines",
    type: "line",
    source: "contour-source",
    "source-layer": "contours",
    paint: {
      "line-color": "rgba(0,0,0,0.5)",
      "line-width": [
        "match",
        ["get", "level"],
        1, 1,
        0.5
      ]
    }
  });
};
