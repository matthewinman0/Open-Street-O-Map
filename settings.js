
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

// Terrain exaggeration control
document.getElementById("terrain-exaggeration").onchange = (e) => {
  const value = parseFloat(e.target.value);
  const terrain = map.getTerrain();
  map.setTerrain({
    source: "3d terrain",
    exaggeration: value
  });
};