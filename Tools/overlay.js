// overlay.js

let uploadedOverlaySourceId = "uploaded-overlay-source";
let uploadedOverlayLayerId = "uploaded-overlay-layer";

// ============================
// DEFINE CRS
// ============================

// British National Grid
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
// DISPLAY OVERLAY
// ============================

displayButton.addEventListener("click", async () => {

  try {

    const imageFile = mapInput.files[0];
    const pgwFile = pgwInput.files[0];

    if (!imageFile || !pgwFile) {
      alert("Upload both image and PGW.");
      return;
    }

    // ============================
    // READ PGW
    // ============================

    const pgwText = await pgwFile.text();

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

    // ============================
    // LOAD IMAGE
    // ============================

    const imageURL = URL.createObjectURL(imageFile);

    const img = new Image();

    img.onload = () => {

      const width = img.width;
      const height = img.height;

      // ============================
      // IMAGE EXTENTS IN BNG
      // ============================

        // PGW coordinates are pixel CENTERS
        // Convert to OUTER EDGES using half-pixel offset

        const minX = topLeftX - (pixelSizeX / 2);
        const maxY = topLeftY + (pixelSizeY / 2);

        const maxX = minX + (width * pixelSizeX);
        const minY = maxY + (height * pixelSizeY);
      // ============================
      // CONVERT TO WGS84
      // ============================

    function convert27700(x, y) {

    const p = proj4(
        "EPSG:27700",
        "EPSG:4326",
        [x, y]
    );

    // tiny south correction
    p[1] -= 0.0001;
    p[0] -= 0.00135;

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

      // ============================
      // REMOVE OLD
      // ============================

      clearOverlay();

      // ============================
      // ADD SOURCE
      // ============================

      map.addSource(uploadedOverlaySourceId, {
        type: "image",
        url: imageURL,
        coordinates: coordinates
      });

      // ============================
      // ADD LAYER
      // ============================

      map.addLayer({
        id: uploadedOverlayLayerId,
        type: "raster",
        source: uploadedOverlaySourceId,
        paint: {
          "raster-opacity": 0.7
        }
      });

      // ============================
      // FIT BOUNDS
      // ============================

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

});

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

clearButton.addEventListener("click", () => {

  clearOverlay();

  mapInput.value = "";
  pgwInput.value = "";

});