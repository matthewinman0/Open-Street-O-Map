let uploadedOverlaySourceId = "uploaded-overlay-source";
let uploadedOverlayLayerId = "uploaded-overlay-layer";

// ============================
// DEFINE CRS
// ============================

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 " +
  "+x_0=400000 +y_0=-100000 +ellps=airy " +
  "+units=m +no_defs"
);

// ============================
// ELEMENTS
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
const DB_VERSION = 1;

function openDatabase() {

  return new Promise((resolve, reject) => {

    const request = indexedDB.open(DB_NAME, DB_VERSION);

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

// ============================
// SAVE OVERLAY
// ============================

async function saveOverlayToDB(imageFile, pgwText) {

  const db = await openDatabase();

  const tx = db.transaction(STORE_NAME, "readwrite");

  const store = tx.objectStore(STORE_NAME);

  store.put(imageFile, "image");
  store.put(pgwText, "pgw");

  return new Promise((resolve, reject) => {

    tx.oncomplete = () => resolve();

    tx.onerror = () => reject(tx.error);

  });

}

// ============================
// LOAD OVERLAY
// ============================

async function loadOverlayFromDB() {

  const db = await openDatabase();

  const tx = db.transaction(STORE_NAME, "readonly");

  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {

    const imageReq = store.get("image");
    const pgwReq = store.get("pgw");

    tx.oncomplete = () => {

      resolve({
        image: imageReq.result,
        pgw: pgwReq.result
      });

    };

    tx.onerror = () => reject(tx.error);

  });

}

// ============================
// CLEAR DATABASE
// ============================

async function clearOverlayDB() {

  const db = await openDatabase();

  const tx = db.transaction(STORE_NAME, "readwrite");

  const store = tx.objectStore(STORE_NAME);

  store.delete("image");
  store.delete("pgw");

}

// ============================
// CLEAR OVERLAY
// ============================

function clearOverlay() {

  if (map.getLayer(uploadedOverlayLayerId)) {
    map.removeLayer(uploadedOverlayLayerId);
  }

  if (map.getSource(uploadedOverlaySourceId)) {
    map.removeSource(uploadedOverlaySourceId);
  }

}

// ============================
// DISPLAY OVERLAY
// ============================

async function displayOverlay(imageFile, pgwText) {

  try {

    const lines = pgwText
      .trim()
      .split(/\r?\n/)
      .map(Number);

    if (lines.length < 6) {
      alert("Invalid PGW file.");
      return;
    }

    const pixelSizeX = lines[0];
    const pixelSizeY = lines[3];

    const topLeftX = lines[4];
    const topLeftY = lines[5];

    const imageURL = URL.createObjectURL(imageFile);

    const img = new Image();

    img.onload = () => {

      const width = img.width;
      const height = img.height;

      const minX = topLeftX - (pixelSizeX / 2);
      const maxY = topLeftY + (pixelSizeY / 2);

      const maxX = minX + (width * pixelSizeX);
      const minY = maxY + (height * pixelSizeY);

      function convert27700(x, y) {

        const p = proj4(
          "EPSG:27700",
          "EPSG:4326",
          [x, y]
        );

        p[1] += 0.00008;
        p[0] -= 0.00042;

        return p;

      }

      const topLeft = convert27700(minX, maxY);
      const topRight = convert27700(maxX, maxY);
      const bottomRight = convert27700(maxX, minY);
      const bottomLeft = convert27700(minX, minY);

      const coordinates = [
        topLeft,
        topRight,
        bottomRight,
        bottomLeft
      ];

      clearOverlay();

      if (!map.isStyleLoaded()) {
        console.warn("Map style not loaded yet.");
        return;
      }

      map.addSource(uploadedOverlaySourceId, {
        type: "image",
        url: imageURL,
        coordinates: coordinates
      });

      if (!map.getLayer(uploadedOverlayLayerId)) {
        map.addLayer({
          id: uploadedOverlayLayerId,
          type: "raster",
          source: uploadedOverlaySourceId,
          paint: {
            "raster-opacity": 1
          }
        });
      }

      map.fitBounds([
        bottomLeft,
        topRight
      ], {
        padding: 40
      });

      console.log("Overlay added.");

    };

    img.src = imageURL;

  } catch (err) {

    console.error(err);
    alert("Failed to load overlay.");

  }

}

// ============================
// DISPLAY BUTTON
// ============================

displayButton.addEventListener("click", async () => {

  try {

    const imageFile = mapInput.files[0];
    const pgwFile = pgwInput.files[0];

    if (!imageFile || !pgwFile) {
      alert("Upload both image and PGW.");
      return;
    }

    const pgwText = await pgwFile.text();

    await saveOverlayToDB(imageFile, pgwText);

    await displayOverlay(imageFile, pgwText);

  } catch (err) {

    console.error(err);
    alert("Failed to load overlay.");

  }

});

// ============================
// CLEAR BUTTON
// ============================

clearButton.addEventListener("click", async () => {

  clearOverlay();

  mapInput.value = "";
  pgwInput.value = "";

  await clearOverlayDB();

});

// ============================
// AUTO LOAD SAVED OVERLAY
// ============================

async function loadSavedOverlay() {

  try {

    const saved = await loadOverlayFromDB();

    if (!saved.image || !saved.pgw) {
      return;
    }

    await displayOverlay(saved.image, saved.pgw);

    console.log("Saved overlay restored.");

  } catch (err) {

    console.error("Failed loading saved overlay:", err);

  }

}

// ============================
// AUTO LOAD
// ============================

window.mapReady.then(() => {

  const map = window.map;

  const tryLoad = () => {
    if (map && map.isStyleLoaded()) {
      loadSavedOverlay();
    } else {
      map.once("load", loadSavedOverlay);
    }
  };

  tryLoad();

});