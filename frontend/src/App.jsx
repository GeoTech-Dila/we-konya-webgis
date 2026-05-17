import { useEffect, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

function App() {

    const [yollarVisible, setYollarVisible] =
  useState(true);

    const [layerVisible, setLayerVisible] =
  useState(true);

const [mahalleVisible, setMahalleVisible] =
  useState(false);

  const [searchText, setSearchText] =
  useState("");

  const mahalleDataRef = useRef(null);


    const [toplanmaVisible, setToplanmaVisible] = useState(true);

const mapRef = useRef(null);

  useEffect(() => {

    const map = new maplibregl.Map({
      container: "map",

      style: {
        version: 8,
        sources: {
          "carto-light": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            ],
            tileSize: 256
          }
        },

        layers: [
          {
            id: "carto-light-layer",
            type: "raster",
            source: "carto-light"
          }
        ]
      },

      center: [32.49, 37.87],
      zoom: 11,
      pitch: 60,
      bearing: -20
    });

mapRef.current = map;

    // Navigation controls
    map.addControl(
      new maplibregl.NavigationControl()
    );

    map.on("load", async () => {

      // GeoJSON verisini yükle
      const ilceResponse = await fetch(
  "http://localhost:8000/ilceler"
);

const ilceData = await ilceResponse.json();


      map.addSource("districts", {
  type: "geojson",
  data: ilceData
});

  const mahalleResponse = await fetch(
  "http://localhost:8000/mahalleler"
);

const mahalleData =
  await mahalleResponse.json();

mahalleDataRef.current =
  mahalleData.features;

const toplanmaResponse = await fetch(
  "http://localhost:8000/toplanma-alanlari"
);

const toplanmaData =
  await toplanmaResponse.json();

  const yollarResponse = await fetch(
  "http://localhost:8000/yollar"
);

const yollarData =
  await yollarResponse.json();


map.addSource("mahalleler", {
  type: "geojson",
  data: mahalleData
});

map.addSource("toplanma", {
  type: "geojson",
  data: toplanmaData
});

map.addSource("yollar", {
  type: "geojson",
  data: yollarData
});

      // Polygon fill layer
      map.addLayer({
        id: "district-fill",
        type: "fill",
        source: "districts",

        paint: {
          "fill-color": "#ff0000",
          "fill-opacity": 0
        }
      });

      // Polygon outline layer
      map.addLayer({


        id: "district-outline",
        type: "line",
        source: "districts",

        paint: {
          "line-color": "#ff0000",
          "line-width": 1.5
        }
      });

map.addLayer({
  id: "mahalle-fill",
  type: "fill",
  source: "mahalleler",

  paint: {
    "fill-color": "#2563eb",
    "fill-opacity": 0
  }
});

// Mahalle outline
map.addLayer({
  id: "mahalle-outline",
  type: "line",
  source: "mahalleler",

  paint: {
    "line-color": "#2563eb",
    "line-width": 1
  }
});

map.addLayer({
  id: "yollar-line",
  type: "line",
  source: "yollar",

  paint: {
    "line-color": "#f59e0b",
    "line-width": 0.5,
    "line-opacity": 0.8
  }
});

// Toplanma alanları
map.addLayer({
  id: "toplanma-points",
  type: "circle",
  source: "toplanma",

  paint: {
  "circle-radius": 4,

  "circle-color": "#22c55e",

  "circle-stroke-width": 1,

  "circle-stroke-color": "#dcfce7",

  "circle-opacity": 0.95,

  "circle-blur": 0.2
}
});

      // Hover layer
      map.addLayer({
        id: "district-hover",
        type: "fill",
        source: "districts",

        paint: {
          "fill-color": "#ff0000",
          "fill-opacity": 0.2
        },

        filter: ["==", "NAME_2", ""]
      });

      // Hover efekti
      map.on("mousemove", "district-fill", (e) => {

        const district =
          e.features[0].properties.name;

        map.setFilter(
          "district-hover",
          ["==", "name", district]
        );

        map.getCanvas().style.cursor = "pointer";
      });

      // Mouse çıkışı
      map.on("mouseleave", "district-fill", () => {

        map.setFilter(
          "district-hover",
          ["==", "NAME_2", ""]
        );

        map.getCanvas().style.cursor = "";
      });

      // Popup
      map.on("click", "district-fill", (e) => {

        const props = e.features[0].properties;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <pre>
${JSON.stringify(props, null, 2)}
            </pre>
          `)
          .addTo(map);

      });

  // Mahalle hover popup
const mahallePopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false
});

map.on("mousemove", "mahalle-fill", (e) => {

  map.getCanvas().style.cursor = "pointer";

  const props = e.features[0].properties;

  mahallePopup
    .setLngLat(e.lngLat)
    .setHTML(`
      <div style="
        font-size:14px;
        font-weight:600;
      ">
        ${props.adi_numara}
      </div>
    `)
    .addTo(map);

});

map.on("mouseleave", "mahalle-fill", () => {

  map.getCanvas().style.cursor = "";

  mahallePopup.remove();

});

map.setLayoutProperty(
  "district-outline",
  "visibility",
  layerVisible ? "visible" : "none"
);

map.setLayoutProperty(
  "district-fill",
  "visibility",
  layerVisible ? "visible" : "none"
);

map.setLayoutProperty(
  "district-hover",
  "visibility",
  layerVisible ? "visible" : "none"
);

map.setLayoutProperty(
  "mahalle-fill",
  "visibility",
  mahalleVisible ? "visible" : "none"
);

map.setLayoutProperty(
  "mahalle-outline",
  "visibility",
  mahalleVisible ? "visible" : "none"
);

map.setLayoutProperty(
  "toplanma-points",
  "visibility",
  toplanmaVisible ? "visible" : "none"
);

    });

    return () => map.remove();

 }, []);

 // YENİ USEEFFECT
useEffect(() => {

 const map = mapRef.current;

  if (
    !map ||
    !map.getLayer("district-outline")
  ) return;

  const visibility =
    layerVisible ? "visible" : "none";

  map.setLayoutProperty(
    "district-outline",
    "visibility",
    visibility
  );

  map.setLayoutProperty(
    "district-fill",
    "visibility",
    visibility
  );

  map.setLayoutProperty(
    "district-hover",
    "visibility",
    visibility
  );

}, [layerVisible]);

useEffect(() => {

  const map = mapRef.current;

  if (
    !map ||
    !map.getLayer("mahalle-outline")
  ) return;

  map.setLayoutProperty(
    "mahalle-outline",
    "visibility",
    mahalleVisible ? "visible" : "none"
  );

  map.setLayoutProperty(
    "mahalle-fill",
    "visibility",
    mahalleVisible ? "visible" : "none"
  );

}, [mahalleVisible]);

useEffect(() => {

  const map = mapRef.current;

  if (
    !map ||
    !map.getLayer("toplanma-points")
  ) return;

  map.setLayoutProperty(
    "toplanma-points",
    "visibility",
    toplanmaVisible ? "visible" : "none"
  );

}, [toplanmaVisible]);

useEffect(() => {

  const map = mapRef.current;

  if (
    !map ||
    !map.getLayer("yollar-line")
  ) return;

  map.setLayoutProperty(
    "yollar-line",
    "visibility",
    yollarVisible ? "visible" : "none"
  );

}, [yollarVisible]);

  return (
  <div
    style={{
      width: "100vw",
      height: "100vh",
      position: "relative"
    }}
  >

    {/* Harita */}
    <div
      id="map"
      style={{
        width: "100%",
        height: "100%"
      }}
    />

{/* Header */}
<div
  style={{
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "72px",

    background:
      "rgba(255,255,255,0.12)",

    backdropFilter: "blur(10px)",

    borderBottom:
      "1px solid rgba(255,255,255,0.18)",

    display: "flex",
    alignItems: "center",

    padding: "0 28px",

    zIndex: 5,

    boxShadow:
      "0 8px 32px rgba(0,0,0,0.12)"
  }}
>

  {/* Logo */}
  <div
    style={{
      display: "flex",
      flexDirection: "column"
    }}
  >

    <div
      style={{
        fontSize: "34px",
        fontWeight: "800",
        fontStyle: "italic",
        letterSpacing: "1px",
        display: "flex",
        alignItems: "center"
      }}
    >

      <span
        style={{
          color: "#c7d2fe"
        }}
      >
        KOR-
      </span>

      <span
        style={{
          color: "#ef4444"
        }}
      >
        İZ
      </span>

    </div>

    <span
      style={{
        color: "#cbd5e1",
        fontSize: "13px",
        marginTop: "-2px"
      }}
    >
      Acil Durumda Koruma ve İzleme Sistemi
    </span>

  </div>

  {/* Search */}
  <div
    style={{
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)"
    }}
  >

    <input
      type="text"

      placeholder="Mahalle ara..."

      value={searchText}

      onChange={(e) =>
        setSearchText(e.target.value)
      }

      onKeyDown={(e) => {

        if (e.key !== "Enter") return;

        const mahalleler =
          mahalleDataRef.current;

        if (!mahalleler) return;

        const found =
          mahalleler.find((m) =>
            m.properties.adi_numara
              ?.toLowerCase()
              .includes(
                searchText.toLowerCase()
              )
          );

        if (!found) return;

        let coords = [];

if (
  found.geometry.type === "Polygon"
) {

  coords =
    found.geometry.coordinates[0];

} else if (
  found.geometry.type === "MultiPolygon"
) {

  coords =
    found.geometry.coordinates[0][0];

}

const bounds =
  coords.reduce(

    (b, coord) =>
      b.extend(coord),

    new maplibregl.LngLatBounds(
      coords[0],
      coords[0]
    )

  );

        mapRef.current.fitBounds(bounds, {
          padding: 40,
          duration: 1500
        });

      }}

      style={{
        width: "320px",
        padding: "12px 18px",

        borderRadius: "999px",

        border:
          "1px solid rgba(255,255,255,0.18)",

        background:
          "rgba(255,255,255,0.14)",

        backdropFilter: "blur(10px)",

        color: "#111827",

        fontSize: "14px",

        outline: "none",

        boxShadow:
          "0 4px 20px rgba(0,0,0,0.15)"
      }}
    />

  </div>

</div>

{/* Legend */}
<div
  style={{
    position: "absolute",
    bottom: 30,
    left: 30,
    background: "white",
    padding: "12px",
    borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    zIndex: 1,
    minWidth: "180px"
  }}
>

  <h4
    style={{
      margin: 0,
      marginBottom: "10px"
    }}
  >
    Katmanlar
  </h4>

<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  }}
>

  {/* İlçe */}
  <label
  style={{
    display: "grid",
    gridTemplateColumns: "24px 20px 1fr",
    alignItems: "center",
    columnGap: "10px",
    cursor: "pointer"
  }}
>

    <div
      style={{
        width: "22px",
        height: "3px",
        borderRadius: "2px",
        background: "#ef4444",
        flexShrink: 0
      }}
    />

    <input
      type="checkbox"
      checked={layerVisible}
      onChange={() =>
        setLayerVisible(!layerVisible)
      }
    />

    <span>İlçe Sınırları</span>

  </label>

  {/* Mahalle */}
  <label
  style={{
    display: "grid",
    gridTemplateColumns: "24px 20px 1fr",
    alignItems: "center",
    columnGap: "10px",
    cursor: "pointer"
  }}
>

    <div
      style={{
        width: "22px",
        height: "3px",
        borderRadius: "2px",
        background: "#2563eb",
        flexShrink: 0
      }}
    />

    <input
      type="checkbox"
      checked={mahalleVisible}
      onChange={() =>
        setMahalleVisible(!mahalleVisible)
      }
    />

    <span>Mahalle Sınırları</span>

  </label>

  {/* Toplanma */}
  <label
  style={{
    display: "grid",
    gridTemplateColumns: "24px 20px 1fr",
    alignItems: "center",
    columnGap: "10px",
    cursor: "pointer"
  }}
>

    <div
      style={{
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: "#16a34a",
        flexShrink: 0
      }}
    />

    <input
      type="checkbox"
      checked={toplanmaVisible}
      onChange={() =>
        setToplanmaVisible(!toplanmaVisible)
      }
    />

    <span>Toplanma Alanları</span>

  </label>

  {/* Yollar */}
  <label
  style={{
    display: "grid",
    gridTemplateColumns: "24px 20px 1fr",
    alignItems: "center",
    columnGap: "10px",
    cursor: "pointer"
  }}
>

    <div
      style={{
        width: "22px",
        height: "3px",
        borderRadius: "2px",
        background: "#f59e0b",
        flexShrink: 0
      }}
    />

    <input
      type="checkbox"
      checked={yollarVisible}
      onChange={() =>
        setYollarVisible(!yollarVisible)
      }
    />

    <span>Yol Ağı</span>

  </label>

</div>



      </div>

    </div>

);
}

export default App;
