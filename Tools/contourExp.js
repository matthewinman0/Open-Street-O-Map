proj4.defs(
    "EPSG:27700",
    "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs"
);

function getMap() {
    return window.osomMap;
}

document.getElementById("export-contours").addEventListener("click", exportContours);

function exportContours() {
    const map = getMap();
    const button = document.getElementById("export-contours");
    const status = document.getElementById("export-status");

    if (!map) {
        console.error("OSOM map is not available");
        if (status) {
            status.style.display = "block";
            status.textContent = "Map is not ready yet.";
        }
        return;
    }

    if (!button || !status) {
        console.error("Contour export UI elements are missing");
        return;
    }

    button.disabled = true;
    button.textContent = "Exporting...";
    status.style.display = "block";
    status.textContent = "Collecting visible contours...";

    try {
        map.triggerRepaint();

        const features = map.queryRenderedFeatures(
            [
                [0, 0],
                [map.getCanvas().width, map.getCanvas().height]
            ],
            {
                layers: ["contour-lines"]
            }
        );

        if (!features.length) {
            throw new Error(
                "No contours are currently visible. Zoom in until the contour layer is loaded."
            );
        }

        status.textContent = `Found ${features.length} contour features...`;

        const unique = [];
        const seen = new Set();

        for (const feature of features) {
            const geometry = feature.geometry;
            const properties = feature.properties || {};
            const elevation = Number(properties.ele ?? 0);

            const key =
                elevation +
                "|" +
                JSON.stringify(geometry);

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            unique.push({
                geometry,
                elevation
            });
        }

        status.textContent =
            `Converting ${unique.length} contours to British National Grid...`;

        const converted = [];

        for (const contour of unique) {
            const geometries = geometryToLineStrings(contour.geometry);

            for (const coordinates of geometries) {
                if (coordinates.length < 2) {
                    continue;
                }

                const projected = coordinates.map(coordinate => {
                    const result = proj4(
                        "EPSG:4326",
                        "EPSG:27700",
                        [
                            coordinate[0],
                            coordinate[1]
                        ]
                    );

                    return {
                        x: result[0],
                        y: result[1],
                        z: contour.elevation
                    };
                });

                converted.push({
                    elevation: contour.elevation,
                    coordinates: projected
                });
            }
        }

        if (!converted.length) {
            throw new Error(
                "No usable contour geometries were found."
            );
        }

        status.textContent =
            `Creating DXF with ${converted.length} contour lines...`;

        const dxf = createDXF(converted);

        const blob = new Blob(
            [dxf],
            {
                type: "application/dxf"
            }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "OSOM_contours.dxf";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        status.textContent =
            `Done — exported ${converted.length} contour lines as OSOM_contours.dxf`;
    }
    catch (error) {
        console.error(
            "Contour export failed:",
            error
        );

        status.textContent =
            "Export failed: " + error.message;
    }
    finally {
        button.disabled = false;
        button.textContent = "Export contours to OCAD DXF";
    }
}

function geometryToLineStrings(geometry) {
    if (!geometry) {
        return [];
    }

    if (geometry.type === "LineString") {
        return [
            geometry.coordinates
        ];
    }

    if (geometry.type === "MultiLineString") {
        return geometry.coordinates;
    }

    return [];
}

function createDXF(contours) {
    const lines = [];

    lines.push(
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$ACADVER",
        "1",
        "AC1009",
        "0",
        "ENDSEC"
    );

    lines.push(
        "0",
        "SECTION",
        "2",
        "TABLES",
        "0",
        "TABLE",
        "2",
        "LAYER",
        "70",
        "1",
        "0",
        "LAYER",
        "2",
        "CONTOURS",
        "70",
        "0",
        "62",
        "7",
        "6",
        "CONTINUOUS",
        "0",
        "ENDTAB",
        "0",
        "ENDSEC"
    );

    lines.push(
        "0",
        "SECTION",
        "2",
        "ENTITIES"
    );

    for (const contour of contours) {
        const points = contour.coordinates;

        if (points.length < 2) {
            continue;
        }

        lines.push(
            "0",
            "POLYLINE",
            "8",
            "CONTOURS",
            "66",
            "1",
            "70",
            "8",
            "10",
            "0",
            "20",
            "0",
            "30",
            String(contour.elevation)
        );

        for (const point of points) {
            lines.push(
                "0",
                "VERTEX",
                "8",
                "CONTOURS",
                "70",
                "32",
                "10",
                formatNumber(point.x),
                "20",
                formatNumber(point.y),
                "30",
                formatNumber(point.z)
            );
        }

        lines.push(
            "0",
            "SEQEND"
        );
    }

    lines.push(
        "0",
        "ENDSEC",
        "0",
        "EOF"
    );

    return lines.join("\r\n");
}

function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return "0";
    }

    return Number(value).toFixed(3);
}