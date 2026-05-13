let map;
let is3D = false;

//  Style Loader - fetches and merges style layers
async function loadStyle() {
  const base = await (await fetch("./style/base.json")).json();
  const land = await (await fetch("./style/land.json")).json();
  const water = await (await fetch("./style/water.json")).json();
  const roads = await (await fetch("./style/roads.json")).json();
  const buildings = await (await fetch("./style/buildings.json")).json();

  base.layers = [
    ...base.layers,
    ...land.layers,
    ...water.layers,
    ...roads.layers,
    ...buildings.layers
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

// ---------- INIT ----------
loadStyle().then(style => {
  map = new maplibregl.Map({
    container: "map",
    style,
    center: [-2.5420, 54.0022],
    zoom: 5
  });
  

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
            exaggeration: 1
        })
    );
    map.setTerrain(null);
    toggleBuildings();

    let markerHeight = 50, markerRadius = 10, linearOffset = 25;

    // HUD updates
    updateHUD();
    map.on("move", updateHUD);
    map.on("zoom", updateHUD);

    geolocate.trigger();
  });
  map.on("terrain", toggleBuildings);
});


// UI

const wrapper = document.getElementById("ui-wrapper");
const btn = document.getElementById("settings-toggle");

btn.onclick = () => {
  wrapper.classList.toggle("open");
};
