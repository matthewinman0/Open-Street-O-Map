let map;
let mapInitialized = false;
let contourint = 2.5;
let savedState = {
  center: [0, 0],
  zoom: 2,
  bearing: 0,
  pitch: 0,
  terrain: false
};

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
    base = await (await fetch("../style/base.json")).json();
    land = await (await fetch("../style/land.json")).json();
    water = await (await fetch("../style/water.json")).json();
    paths = await (await fetch("../style/forest/paths.json")).json();
    roads = await (await fetch("../style/forest/roads.json")).json();
    buildings = await (await fetch("../style/forest/buildings.json")).json();

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


// Map Initialization
window.mapReady = loadStyle().then(style => {

  map = new maplibregl.Map({
    container: "map",
    style,
    center: savedState.center,
    zoom: savedState.zoom,
    bearing: savedState.bearing,
  });

  window.map = map;

  map.on("style.load", async () => {
  const patternImg = await map.loadImage("../patterns/dot.png");
  const marshImg = await map.loadImage("../patterns/marsh.png");
  const greenDotImg = await map.loadImage("../patterns/greenDot.png") 
  map.addImage("dot", patternImg.data);
  map.addImage("marsh", marshImg.data);
  map.addImage("greenDot", greenDotImg.data);

    if (!map.__initialized) {
    map.addLayer({
      id: "sand",
      type: "fill",
      source: "osm",
      "source-layer": "landcover",
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
      source: "osm",
      "source-layer": "landcover",
      filter: ["in", "subclass", "swamp", "marsh", "mangrove", "bog", "wetland", "reedbed", "wet_meadow"],
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
    map.addLayer({
      id: "orchard",
      type: "fill",
      source: "osm", 
      "source-layer": "landcover",
      filter: ["in", "subclass", "orchard"],
      paint: {
        "fill-pattern": "greenDot",
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
              11: [contourint, contourint * 5],
              12: [contourint, contourint * 5], 
              14: [contourint, contourint * 5],
              15: [contourint, contourint * 5],
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
    map.addLayer({
      id: "Placenames",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 10,
          12, 16
        ]
      },
      paint: {
        "text-color": "#222222",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2 ,
        "text-halo-blur": 1,
        "text-opacity": 1
      }
    });

    map.dragPan.disable()
    map.scrollZoom.disable()
    map.boxZoom.disable()

    
    let tourTimer = null;

    async function goToRandomPlace() {

    // Get random place in that country
    const placesResponse = await fetch(
    "https://api.randomcoords.com/v1/coordinates/?limit=1",
    {
        headers: {
        "x-api-token": import.meta.env.RANDOMCOORDS_API_KEY
        }
    }
    );

    const places = await placesResponse.json();

    if (!places.data || places.data.length === 0) {
        return;
    }

    const place = places.data[0];

    const [lng, lat] = place.coordinates;

    console.log(
        "Flying to:",
        place.city,
        country.name,
        lng,
        lat
    );

    // Fly there
    map.flyTo({
        center: [lng, lat],
        zoom: 14,
        duration: 4000,
        essential: true
    });
    }

    // First location
    goToRandomPlace();

    // Then every 10 seconds
    tourTimer = setInterval(() => {
    goToRandomPlace();
    }, 10000);
    
    });
});


function updateContours() {
  let value = contourType.value;
  contourint = parseFloat(contourInt.value);

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
          11: [contourint, contourint * 5],
          12: [contourint, contourint * 5],
          14: [contourint, contourint * 5],
          15: [contourint, contourint * 5],
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
}
