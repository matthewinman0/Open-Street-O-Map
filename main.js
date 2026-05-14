let map;
let is3D = false;

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
            source: 'terrain',
            exaggeration: parseFloat(document.getElementById("terrain-exaggeration").value)
        })
    );
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


// Terrain exaggeration control (broken)
document.getElementById("terrain-exaggeration").onchange = (e) => {
  const value = parseFloat(e.target.value);
  const terrain = map.getTerrain();

  map.setTerrain({
    source: "terrain",
    exaggeration: value
  });
};