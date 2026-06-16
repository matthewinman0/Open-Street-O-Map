# <img src="./assets/OSOM.ico" width="32"> Open-Street-O-Map (OSOM)

![London](./assets/London-10000-A2-600dpi.png)
Example of OSOM in London

## What Is OSOM?

OSOM or Open street orienteering map, is a worldwide orienteering map with contours and basic vegitiation included. It uses styles to establish that true classic orienteering look with osm data from [openfreemap](https://tiles.openfreemap.org).

Contours and hillshade data come from [Mapterhorn](https://mapterhorn.com/) and the [Terrarium AWS S3 Bucket](https://registry.opendata.aws/terrain-tiles/) with contours converted from the data using [maplibre-contour](https://github.com/onthegomap/maplibre-contour) with [Mablibre GL JS](https://maplibre.org/projects/gl-js/) to render the vector tiles and output to the user.

The project has tools that let users upload their own maps to layer them ontop. This then means that the project can display maps in **3 dimentions** as it has terrain maps built in.

## Contributing

### Map

Contributing to the map is relatively easy. Styling is based off combined json files which are kept in the style folder. The map uses [Open Map Tiles Scheme](https://docs.maptiler.com/schema/omt-planet/) on [Maplibre](https://maplibre.org/maplibre-gl-js/docs/) with a variety of other datasets.

Some useful links:

* [Style Spec](https://maplibre.org/maplibre-style-spec/)
* [Examples](https://maplibre.org/maplibre-gl-js/docs/examples/)

#### Snippets:

Defining a source

```
 "sources": {
    "osm": {
      "type": "vector",
      "tiles": [
        "https://tiles.openfreemap.org/planet/20260506_001001_pt/{z}/{x}/{y}.pbf"
      ],
      "minzoom": 0,
      "maxzoom": 14
    }
```

Styling and adding a layer

```
"layers": [
  {
    "id": "buildings-2d",
    "type": "fill",
    "source": "osm",
    "source-layer": "building",
    "layout": {
        "visibility": "visible"
    },
    "paint": {
        "fill-color": "#231f20",
        "fill-opacity": 1
    }
  }
]
```

### Tools

Tools and other parts of the map are programed in Javascript

Useful Links:

* [API Docs](https://maplibre.org/maplibre-gl-js/docs/API/)
* [Plugins](https://maplibre.org/maplibre-gl-js/docs/plugins/)

## Running Yourself

Just download and host the repository, Maplibre doesn't like running from files unfortunatly so a web server is still needed
