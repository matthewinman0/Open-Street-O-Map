let exportCenter = null;

const PAGE_SIZES = {
  A4: { w: 11.69, h: 8.27 },
  A3: { w: 16.54, h: 11.69 },
  A2: { w: 23.4, h: 16.5 }
};


// HELPERS
function getScale() {
  return parseInt(document.getElementById("scale-select").value);
}
function getPageSize() {
  return document.getElementById("page-size").value;
}
function getDPI() {
  return parseInt(document.getElementById("dpi").value) || 600;
}
function getMap() {
  return window.map;
}


// WEB MERCATOR HELPERS
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


// ============================
// PREVIEW
// ============================

let previewBoxId = "export-preview-box";


function calculateExportBounds() {
  const scale = getScale();
  const page = PAGE_SIZES[getPageSize()];

  const widthMeters =
    scale *
    page.w *
    0.0254;

  const heightMeters =
    scale *
    page.h *
    0.0254;

  const centre = lngLatToMeters(
    exportCenter.lng,
    exportCenter.lat
  );


  const sw = metersToLngLat(
    centre.x - widthMeters / 2,
    centre.y - heightMeters / 2
  );

  const ne = metersToLngLat(
    centre.x + widthMeters / 2,
    centre.y + heightMeters / 2
  );


  return new maplibregl.LngLatBounds(
    [sw.lng, sw.lat],
    [ne.lng, ne.lat]
  );
}



function updatePreview() {

  const map = getMap();

  if (!map || !exportCenter)
    return;


  const bounds = calculateExportBounds();

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();


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


  if(map.getSource(previewBoxId)){

    map
    .getSource(previewBoxId)
    .setData(geojson);

    return;
  }


  map.addSource(previewBoxId,{
    type:"geojson",
    data:geojson
  });


  map.addLayer({
    id:previewBoxId,
    type:"line",
    source:previewBoxId,
    paint:{
      "line-color":"#ff0000",
      "line-width":2
    }
  });
}



// ============================
// SELECT CENTRE
// ============================


document
.getElementById("export-select-btn")
.onclick = () => {

  const map=getMap();

  map.getCanvas().style.cursor="crosshair";


  map.once("click",(e)=>{

    exportCenter=e.lngLat;

    map.getCanvas().style.cursor="";

    drawCenter();

    updatePreview();

  });

};


document
.getElementById("scale-select")
.onchange=updatePreview;


document
.getElementById("page-size")
.onchange=updatePreview;



// ============================
// EXPORT
// ============================


document
.getElementById("export-btn")
.onclick = async ()=>{


const map=getMap();


if(!exportCenter){

alert("Select a centre first");
return;

}


const scale=getScale();
const dpi=getDPI();

const page=PAGE_SIZES[getPageSize()];


// final pixels

const pxWidth =
Math.round(page.w*dpi);

const pxHeight =
Math.round(page.h*dpi);



const bounds =
calculateExportBounds();



const container=document.createElement("div");

container.style.position="absolute";
container.style.left="-99999px";
container.style.top="0";


// CSS size
container.style.width=pxWidth+"px";
container.style.height=pxHeight+"px";


document.body.appendChild(container);



if(map.getLayer("export-center"))
map.setLayoutProperty(
"export-center",
"visibility",
"none"
);



const exportMap=new maplibregl.Map({

container,

style:map.getStyle(),

bounds,

interactive:false,

preserveDrawingBuffer:true,

pixelRatio:1

});



// restore patterns

exportMap.on(
"style.load",
async()=>{


const patterns=[
"dot",
"marsh",
"greenDot"
];


for(const p of patterns){

if(!exportMap.hasImage(p)){

try{

const img=
await exportMap.loadImage(
`./patterns/${p}.png`
);

exportMap.addImage(
p,
img.data
);

}catch(e){

console.warn(
"Pattern missing:",
p
);

}

}

}


});



await new Promise(r=>
exportMap.once("idle",r)
);


await new Promise(r=>
requestAnimationFrame(r)
);



// ============================
// IMAGE
// ============================


const canvas =
exportMap.getCanvas();


const image =
canvas.toDataURL(
"image/png"
);



// ============================
// WORLD FILE
// ============================


const nw =
exportMap.unproject(
[0,0]
);


const ne =
exportMap.unproject(
[pxWidth,0]
);


const sw =
exportMap.unproject(
[0,pxHeight]
);


// degrees per pixel

const pixelSizeX =
(ne.lng-nw.lng)/pxWidth;


const pixelSizeY =
(nw.lat-sw.lat)/pxHeight;



const upperLeftX =
nw.lng +
pixelSizeX/2;


const upperLeftY =
nw.lat -
pixelSizeY/2;



const pgw =
`${pixelSizeX}
0
0
${-pixelSizeY}
${upperLeftX}
${upperLeftY}`;



// cleanup

exportMap.remove();

container.remove();



const filename =
`map-${scale}-${getPageSize()}-${dpi}dpi`;



// PNG

const png =
document.createElement("a");

png.href=image;
png.download=filename+".png";
png.click();



// PGW

const blob =
new Blob(
[pgw],
{type:"text/plain"}
);


const url =
URL.createObjectURL(blob);


const world =
document.createElement("a");

world.href=url;
world.download=filename+".pgw";
world.click();


URL.revokeObjectURL(url);



if(map.getLayer("export-center"))
map.setLayoutProperty(
"export-center",
"visibility",
"visible"
);


};



// ============================
// CENTRE MARKER
// ============================


function drawCenter(){

const map=getMap();

if(!map||!exportCenter)
return;


if(map.getSource("export-center")){

map.removeLayer("export-center");

map.removeSource("export-center");

}



map.addSource(
"export-center",
{
type:"geojson",
data:{
type:"Feature",
geometry:{
type:"Point",
coordinates:[
exportCenter.lng,
exportCenter.lat
]
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