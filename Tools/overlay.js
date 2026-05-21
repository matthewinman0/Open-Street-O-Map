// ============================
// OVERLAY SYSTEM (CLEAN VERSION)
// ============================

let uploadedOverlaySourceId = "uploaded-overlay-source";
let uploadedOverlayLayerId = "uploaded-overlay-layer";

// ============================
// PROJ4 SETUP (OSGB36)
// ============================

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 " +
  "+x_0=400000 +y_0=-100000 +ellps=airy " +
  "+towgs84=446.448,-125.157,542.060,-0.1502,-0.2470,-0.8421,20.4894 " +
  "+units=m +no_defs"
);

// ============================
// DOM ELEMENTS
// ============================

const mapInput = document.getElementById("uploaded-map");
const pgwInput = document.getElementById("uploaded-pgw");

const displayButton = document.getElementById("display-uploaded-map");
const clearButton = document.getElementById("clear-uploaded-map");

// ============================
// INDEXEDDB
// ============================

const DB_NAME = "OverlayDB";
const STORE_NAME = "overlayStore";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveOverlayToDB(imageFile, pgwText) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  store.put(imageFile, "image");
  store.put(pgwText, "pgw");

  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function loadOverlayFromDB() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const imgReq = store.get("image");
    const pgwReq = store.get("pgw");

    tx.oncomplete = () => {
      resolve({
        image: imgReq.result,
        pgw: pgwReq.result
      });
    };

    tx.onerror = () => reject(tx.error);
  });
}

async function clearOverlayDB() {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  store.delete("image");
  store.delete("pgw");
}

// ============================
// OVERLAY CLEANUP
// ============================

function clearOverlay() {
  const map = window.map;
  if (!map) return;

  if (map.getLayer(uploadedOverlayLayerId)) {
    map.removeLayer(uploadedOverlayLayerId);
  }

  if (map.getSource(uploadedOverlaySourceId)) {
    map.removeSource(uploadedOverlaySourceId);
  }
}

// ============================
// IMAGE LOADER
// ============================

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ============================
// CORE RENDER
// ============================

async function displayOverlay(imageFile, pgwText) {
  try {
    const lines = pgwText.trim().split(/\r?\n/).map(Number);

    if (lines.length < 6) {
      alert("Invalid PGW file");
      return;
    }

    const [A, B, D, E, C, F] = lines;

    const map = window.map;
    if (!map || !map.isStyleLoaded()) return;

    const imageURL = URL.createObjectURL(imageFile);
    const img = await loadImage(imageURL);

    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const worldFromPixel = (x, y) => ([
      A * (x + 0.5) + B * (y + 0.5) + C,
      D * (x + 0.5) + E * (y + 0.5) + F
    ]);

    const tl = worldFromPixel(0, 0);
    const tr = worldFromPixel(w, 0);
    const bl = worldFromPixel(0, h);
    const br = worldFromPixel(w, h);

    const coords = [
      proj4("EPSG:27700", "EPSG:4326", tl),
      proj4("EPSG:27700", "EPSG:4326", tr),
      proj4("EPSG:27700", "EPSG:4326", br),
      proj4("EPSG:27700", "EPSG:4326", bl)
    ];

    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);

    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    ];

    map.fitBounds(bounds, { padding: 40 });

    console.log("COORDS:");
    coords.forEach((c, i) => {
      console.log(i, "=>", c[0], c[1]);
    });
    console.log(
      proj4("EPSG:27700", "EPSG:4326", [300000, 200000])
    );


    clearOverlay();

    map.addSource(uploadedOverlaySourceId, {
      type: "image",
      url: imageURL,
      coordinates: coords
    });

    map.addLayer({
      id: uploadedOverlayLayerId,
      type: "raster",
      source: uploadedOverlaySourceId,
      paint: {
        "raster-opacity": 0.5
      }
    });

    map.fitBounds([bl, tr], { padding: 40 });

    console.log("Overlay loaded");
  } catch (e) {
    console.error(e);
  }
}

// ============================
// BUTTONS
// ============================

displayButton.onclick = async () => {
  const imageFile = mapInput.files[0];
  const pgwFile = pgwInput.files[0];

  if (!imageFile || !pgwFile) {
    alert("Upload both files");
    return;
  }

  const pgwText = await pgwFile.text();

  await saveOverlayToDB(imageFile, pgwText);
  await displayOverlay(imageFile, pgwText);
};

clearButton.onclick = async () => {
  clearOverlay();
  mapInput.value = "";
  pgwInput.value = "";
  await clearOverlayDB();
};

// ============================
// AUTO LOAD
// ============================

async function loadSavedOverlay() {
  const saved = await loadOverlayFromDB();
  if (!saved?.image || !saved?.pgw) return;
  await displayOverlay(saved.image, saved.pgw);
}

// wait for map
function waitForMap() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.map?.isStyleLoaded) resolve(window.map);
      else setTimeout(check, 50);
    };
    check();
  });
}

waitForMap().then(() => loadSavedOverlay());