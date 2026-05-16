# Open-Street-O-Map (OSOM)

![London](./examples/London-10000-A2-600dpi.png)
Example of OSOM in London

## What Is OSOM?

OSOM or Open street orienteering map, is a worldwide orienteering map with contours and basic vegitiation included. It uses styles to establish that true classic orienteering look with osm data from [openfreemap](https://tiles.openfreemap.org). 

Contours and hillshade data come from the [Terrarium AWS S3 Bucket](https://registry.opendata.aws/terrain-tiles/) with contours converted from the data using [maplibre-contour](https://github.com/onthegomap/maplibre-contour) with [Mablibre GL JS](https://maplibre.org/projects/gl-js/) to render the vector tiles and output to the user.

The project has tools that let users upload their own maps to layer them ontop. This then means that the project can display maps in **3 dimentions** as it has terrain maps built in.

## Running Yourself
Just download and host the repository, Maplibre doesn't like running from files unfortunatly so a web server is still needed
