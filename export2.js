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
  return parseInt(document.getElementById("scale-select").value);
}
function getPageSize() {
  return document.getElementById("page-size").value;
}

function getCenterMetres() {
    const map = getMap();
    const center = map.getCenter();
    return lngLatToMeters(center.lng, center.lat);
}
function getCenterLatLon() {
  const map = getMap();
  const center = map.getCenter();
  return { lat: center.lat, lng: center.lng };
}

const EARTH_RADIUS = 6378137;
function lngLatToMeters(lng, lat) {
  const x = EARTH_RADIUS * lng * Math.PI / 180;
  const y =
    EARTH_RADIUS *
    Math.log(
      Math.tan(
        Math.PI / 4 +
        lat * Math.PI / 360
      )
    );

  return { x, y };
}

function metersToLngLat(x, y) {
  const lng = x / EARTH_RADIUS * 180 / Math.PI;
  const lat =
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS))
      - Math.PI / 2)
      * 180 / Math.PI;
  return {
    lng,
    lat
  };
}

function calculateExportBounds() {
    const scale = getScale();
    const page = PAGE_SIZES[getPageSize()];

    const widthMeters = scale * page.w * 0.0254;
    const heightMeters = scale * page.h * 0.0254;

    const centre = lngLatToMeters(exportCenter.lng, exportCenter.lat);

    const sw = metersToLngLat(centre.x - widthMeters / 2, centre.y - heightMeters / 2);
    const ne = metersToLngLat(centre.x + widthMeters / 2, centre.y + heightMeters / 2);
}



document.getElementById("export-select-btn").onclick = () => {
  const map = getMap();
  map.getCanvas().style.cursor="crosshair";
  map.once("click",(e)=>{
    exportCenter=e.lngLat;
    map.getCanvas().style.cursor="";
    drawCenter();
    drawBBox();
  });
};

function drawCenter() {
    const map = getMap();

    if(map.getSource("export-center")){
        map.removeLayer("export-center");
        map.removeSource("export-center");
    }
    map.addSource(
    "export-center",{
        type:"geojson",
        data:{
            type:"Feature",
            geometry:{
                type:"Point",
                coordinates:[exportCenter.lng, exportCenter.lat]
            }
        }
        }
    );
    map.addLayer({
        id:"export-center",
        type:"circle",
        source:"export-center",
        paint:{
            "circle-radius":4,
            "circle-color":"#ff0000"
        }
    });
}

function drawBBox() {
    const map = getMap();
    calculateExportBounds();
    const geojson = {
        type:"Feature",
        geometry:{
            type:"Polygon",
            coordinates:[[
                [sw.lng,sw.lat],
                [sw.lng,ne.lat],
                [ne.lng,ne.lat],
                [ne.lng,sw.lat],
                [sw.lng,sw.lat]
            ]]
        }
    };

    if(map.getSource("export-bbox")){
        map.removeLayer("export-bbox");
        map.removeSource("export-bbox");
    }
    
    map.addSource("export-bbox",{
        type:"geojson",
        data:geojson
    });

    map.addLayer({
        id:"export-bbox",
        type:"line",
        source:"export-bbox",
        paint:{
            "line-color":"#ff0000",
            "line-width":2
        }
    });
}

