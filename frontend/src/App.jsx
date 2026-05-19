import { useEffect, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import AnalysisPanel
from "./components/AnalysisPanel";


function App() {

  const [service5Visible, setService5Visible] = useState(true);
  const [service10Visible, setService10Visible] = useState(true);
  const [service15Visible, setService15Visible] = useState(true);
  const [yollarVisible, setYollarVisible] = useState(true);
  const [layerVisible, setLayerVisible] = useState(true);
  const [mahalleVisible, setMahalleVisible] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [toplanmaVisible, setToplanmaVisible] = useState(true);
  const [mahalleOpacity, setMahalleOpacity] = useState(1);
  const [yollarOpacity, setYollarOpacity] = useState(1);
  const [serviceOpacity, setServiceOpacity] = useState(1);
  const [toplanmaOpacity, setToplanmaOpacity] = useState(1);
  const [districtOpacity, setDistrictOpacity] = useState(1);

  const [isPlaying, setIsPlaying] = useState(true);

  const mahalleDataRef = useRef(null);
  const mapRef = useRef(null);
  const animationIdRef = useRef(null);
  const isPausedRef = useRef(false);
  const topTimerRef = useRef(null);
  const [analysisOpen, setAnalysisOpen] =
  useState(false);

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

    map.addControl(new maplibregl.NavigationControl());

    map.on("load", async () => {

      // --- VERİ FETCH ---
      const service5Data = await fetch("http://localhost:8000/service-5").then(r => r.json());
      const service10Data = await fetch("http://localhost:8000/service-10").then(r => r.json());
      const service15Data = await fetch("http://localhost:8000/service-15").then(r => r.json());
      const ilceData = await fetch("http://localhost:8000/ilceler").then(r => r.json());
      const mahalleData = await fetch("http://localhost:8000/mahalleler").then(r => r.json());
      const toplanmaData = await fetch("http://localhost:8000/toplanma-alanlari").then(r => r.json());
      const yollarData = await fetch("http://localhost:8000/yollar").then(r => r.json());

      mahalleDataRef.current = mahalleData.features;

      // --- SOURCES ---
      map.addSource("districts", { type: "geojson", data: ilceData });
      map.addSource("mahalleler", { type: "geojson", data: mahalleData });
      map.addSource("toplanma", { type: "geojson", data: toplanmaData });
      map.addSource("yollar", { type: "geojson", data: yollarData });
      map.addSource("service-5", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("service-10", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("service-15", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("flow-point", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("flow-pulse", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      // --- LAYERS (sıralama önemli: altta kalanlar önce eklenir) ---
      map.addLayer({
        id: "district-fill",
        type: "fill",
        source: "districts",
        paint: { "fill-color": "#ff0000", "fill-opacity": 0 }
      });

      map.addLayer({
        id: "district-outline",
        type: "line",
        source: "districts",
        paint: { "line-color": "#ff0000", "line-width": 1.5 }
      });

      map.addLayer({
        id: "mahalle-fill",
        type: "fill",
        source: "mahalleler",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0 }
      });

      map.addLayer({
        id: "mahalle-outline",
        type: "line",
        source: "mahalleler",
        paint: { "line-color": "#2563eb", "line-width": 1 }
      });

      map.addLayer({
        id: "yollar-line",
        type: "line",
        source: "yollar",
        paint: { "line-color": "#f59e0b", "line-width": 0.5, "line-opacity": 0.8 }
      });

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

      // Service area layer'ları (hepsi burada, animasyondan önce)
      map.addLayer({
        id: "service-15-line",
        type: "line",
        source: "service-15",
        paint: { "line-color": "#ef4444", "line-width": 1.5 }
      });

      map.addLayer({
        id: "service-10-line",
        type: "line",
        source: "service-10",
        paint: { "line-color": "#eab308", "line-width": 1.5 }
      });

      map.addLayer({
        id: "service-5-line",
        type: "line",
        source: "service-5",
        paint: { "line-color": "#22c55e", "line-width": 2.5 }
      });

      // Hover district
      map.addLayer({
        id: "district-hover",
        type: "fill",
        source: "districts",
        paint: { "fill-color": "#ff0000", "fill-opacity": 0.2 },
        filter: ["==", "NAME_2", ""]
      });

      // Pulse ve top layer'ları (en üstte)
      map.addLayer({
        id: "flow-pulse-layer",
        type: "circle",
        source: "flow-pulse",
        paint: {
          "circle-radius": 18,
          "circle-color": "transparent",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#22c55e",
          "circle-opacity": 0.4,
          "circle-blur": 0.5
        }
      });

      map.addLayer({
        id: "flow-point-layer",
        type: "circle",
        source: "flow-point",
        paint: {
          "circle-radius": 8,
          "circle-color": "#ffffff",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#22c55e",
          "circle-blur": 0,
          "circle-opacity": 1
        }
      });

      // --- splitFeatures ve ANİMASYON ---
      const splitFeatures = service5Data.features.sort(
        (a, b) => a.properties.start - b.properties.start
      );

      // service-5 boş başlar, animasyon dolduracak
      // (service-10 ve service-15 zaten boş source olarak eklendi)

      // --- PROGRESSİVE ÇİZGİ ANİMASYONU ---
      // service-5: LineString  → coordinates: [x,y][]
      // service-10/15: MultiLineString → coordinates: [x,y][][]

      function getPoints(feature) {
        const geom = feature.geometry;
        if (geom.type === "LineString") return geom.coordinates;
        if (geom.type === "MultiLineString") return geom.coordinates.flat();
        return [];
      }

      function buildGeometry(feature, points) {
        const geom = feature.geometry;
        if (geom.type === "LineString") return { type: "LineString", coordinates: points };
        if (geom.type === "MultiLineString") return { type: "MultiLineString", coordinates: [points] };
        return geom;
      }

      console.log("=== ANİMASYON DEBUG ===");
      console.log("service5 features:", splitFeatures.length);
      console.log("service10 features:", service10Data.features?.length);
      console.log("service15 features:", service15Data.features?.length);

      let idx5 = 0, idx10 = 0, idx15 = 0;

      let cameraTick = 0;

      // service-5: 25k feature var, her feature sadece 2 nokta → feature başına 1 adım yeterli
      // service-10/15: çok adım var, toplu atlayacağız

      function animateDraw() {
        if (isPausedRef.current) {
          topTimerRef.current = setTimeout(animateDraw, 100);
          return;
        }

        const flowSrc  = map.getSource("flow-point");
        const pulseSrc = map.getSource("flow-pulse");

        // --- service-5: her turda 5 feature ekle ---
        const BATCH_5 = 5;
        let lastPt5 = null;
        if (idx5 < splitFeatures.length) {
          const end5 = Math.min(idx5 + BATCH_5, splitFeatures.length);
          const visibleFeatures = splitFeatures.slice(0, end5);
          map.getSource("service-5").setData({ type: "FeatureCollection", features: visibleFeatures });
          const lastF = visibleFeatures[visibleFeatures.length - 1];
          const pts = getPoints(lastF);
          lastPt5 = pts[pts.length - 1];
          idx5 = end5;
        }

        // --- service-10: her turda 1 feature ekle ---
        let lastPt10 = null;
        if (idx10 < service10Data.features.length) {
          const visibleFeatures = service10Data.features.slice(0, idx10 + 1);
          map.getSource("service-10").setData({ type: "FeatureCollection", features: visibleFeatures });
          const lastF = visibleFeatures[visibleFeatures.length - 1];
          const pts = getPoints(lastF);
          lastPt10 = pts[pts.length - 1];
          idx10++;
        }

        // --- service-15: her turda 1 feature ekle ---
        let lastPt15 = null;
        if (idx15 < service15Data.features.length) {
          const visibleFeatures = service15Data.features.slice(0, idx15 + 1);
          map.getSource("service-15").setData({ type: "FeatureCollection", features: visibleFeatures });
          const lastF = visibleFeatures[visibleFeatures.length - 1];
          const pts = getPoints(lastF);
          lastPt15 = pts[pts.length - 1];
          idx15++;
        }

        // Top: service-5 öncelikli
        const topPt = lastPt5 ?? lastPt10 ?? lastPt15;
        if (topPt && flowSrc && pulseSrc) {
          const pd = {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: { type: "Point", coordinates: topPt }, properties: {} }]
          };
          flowSrc.setData(pd);
          pulseSrc.setData(pd);
        }

    cameraTick++;

if (
  topPt &&
  cameraTick % 15 === 0
) {

  map.easeTo({

    center: topPt,

    zoom: 13,

    duration: 800,

    essential: true

  });

}

        // Hepsi bittiyse sıfırla
        const all5done  = idx5  >= splitFeatures.length;
        const all10done = idx10 >= service10Data.features.length;
        const all15done = idx15 >= service15Data.features.length;

        if (all5done && all10done && all15done) {
          idx5 = 0; idx10 = 0; idx15 = 0;
          map.getSource("service-5").setData({ type: "FeatureCollection", features: [] });
          map.getSource("service-10").setData({ type: "FeatureCollection", features: [] });
          map.getSource("service-15").setData({ type: "FeatureCollection", features: [] });
          if (flowSrc) flowSrc.setData({ type: "FeatureCollection", features: [] });
          if (pulseSrc) pulseSrc.setData({ type: "FeatureCollection", features: [] });
          topTimerRef.current = setTimeout(animateDraw, 1200);
          return;
        }

        topTimerRef.current = setTimeout(animateDraw, 200);
      }

      animateDraw();

      // --- HOVER / POPUP ---
      map.on("mousemove", "district-fill", (e) => {
        const district = e.features[0].properties.name;
        map.setFilter("district-hover", ["==", "name", district]);
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "district-fill", () => {
        map.setFilter("district-hover", ["==", "NAME_2", ""]);
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "district-fill", (e) => {
        const props = e.features[0].properties;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<pre>${JSON.stringify(props, null, 2)}</pre>`)
          .addTo(map);
      });

      const mahallePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

      map.on("mousemove", "mahalle-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        mahallePopup.setLngLat(e.lngLat).setHTML(`<div style="font-size:14px;font-weight:600;">${props.adi_numara}</div>`).addTo(map);
      });

      map.on("mouseleave", "mahalle-fill", () => {
        map.getCanvas().style.cursor = "";
        mahallePopup.remove();
      });

      // --- İLK GÖRÜNÜRLÜK ---
      map.setLayoutProperty("district-outline", "visibility", layerVisible ? "visible" : "none");
      map.setLayoutProperty("district-fill", "visibility", layerVisible ? "visible" : "none");
      map.setLayoutProperty("district-hover", "visibility", layerVisible ? "visible" : "none");
      map.setLayoutProperty("mahalle-fill", "visibility", mahalleVisible ? "visible" : "none");
      map.setLayoutProperty("mahalle-outline", "visibility", mahalleVisible ? "visible" : "none");
      map.setLayoutProperty("toplanma-points", "visibility", toplanmaVisible ? "visible" : "none");

    });

    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (topTimerRef.current) clearTimeout(topTimerRef.current);
      map.remove();
    };

  }, []);

  // Pause/Play senkronizasyonu
  useEffect(() => {
    isPausedRef.current = !isPlaying;
  }, [isPlaying]);

  // --- VISIBILITY EFFECTS ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("district-outline")) return;
    const v = layerVisible ? "visible" : "none";
    map.setLayoutProperty("district-outline", "visibility", v);
    map.setLayoutProperty("district-fill", "visibility", v);
    map.setLayoutProperty("district-hover", "visibility", v);
  }, [layerVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("district-outline")) return;
    map.setPaintProperty("district-outline", "line-opacity", districtOpacity);
  }, [districtOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("mahalle-outline")) return;
    map.setLayoutProperty("mahalle-outline", "visibility", mahalleVisible ? "visible" : "none");
    map.setLayoutProperty("mahalle-fill", "visibility", mahalleVisible ? "visible" : "none");
  }, [mahalleVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("toplanma-points")) return;
    map.setLayoutProperty("toplanma-points", "visibility", toplanmaVisible ? "visible" : "none");
  }, [toplanmaVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("yollar-line")) return;
    map.setLayoutProperty("yollar-line", "visibility", yollarVisible ? "visible" : "none");
  }, [yollarVisible]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded() || !mapRef.current.getLayer("service-5-line")) return;
    mapRef.current.setLayoutProperty("service-5-line", "visibility", service5Visible ? "visible" : "none");
  }, [service5Visible]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded() || !mapRef.current.getLayer("service-10-line")) return;
    mapRef.current.setLayoutProperty("service-10-line", "visibility", service10Visible ? "visible" : "none");
  }, [service10Visible]);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded() || !mapRef.current.getLayer("service-15-line")) return;
    mapRef.current.setLayoutProperty("service-15-line", "visibility", service15Visible ? "visible" : "none");
  }, [service15Visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("toplanma-points")) return;
    map.setPaintProperty("toplanma-points", "circle-opacity", toplanmaOpacity);
  }, [toplanmaOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("mahalle-outline")) return;
    map.setPaintProperty("mahalle-outline", "line-opacity", mahalleOpacity);
  }, [mahalleOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("yollar-line")) return;
    map.setPaintProperty("yollar-line", "line-opacity", yollarOpacity);
  }, [yollarOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("service-5-line")) return;
    map.setPaintProperty("service-5-line", "line-opacity", serviceOpacity);
    map.setPaintProperty("service-10-line", "line-opacity", serviceOpacity);
    map.setPaintProperty("service-15-line", "line-opacity", serviceOpacity);
  }, [serviceOpacity]);

  // --- HELPERS ---
  const moveLayerToTop = (layerIds) => {
    const map = mapRef.current;
    if (!map) return;
    layerIds.forEach((id) => { if (map.getLayer(id)) map.moveLayer(id); });
  };

  return (
    <div
  style={{

    width: "100vw",

    height: "100vh",

    position: "relative",

    overflow: "hidden",

    background: "#e5e7eb"
  }}
>

      <div id="map" style={{ width: "100%", height: "100%" }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "72px",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
        display: "flex", alignItems: "center", padding: "0 28px",
        zIndex: 5, boxShadow: "0 8px 32px rgba(0,0,0,0.12)"
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "34px", fontWeight: "800", fontStyle: "italic", letterSpacing: "1px", display: "flex", alignItems: "center" }}>
            <span style={{ color: "#c7d2fe" }}>KOR-</span>
            <span style={{ color: "#ef4444" }}>İZ</span>
          </div>
          <span style={{ color: "#cbd5e1", fontSize: "13px", marginTop: "-2px" }}>
            Acil Durumda Koruma ve İzleme Sistemi
          </span>
        </div>

        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <input
            type="text"
            placeholder="Mahalle ara..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const mahalleler = mahalleDataRef.current;
              if (!mahalleler) return;
              const found = mahalleler.find((m) =>
                m.properties.adi_numara?.toLowerCase().includes(searchText.toLowerCase())
              );
              if (!found) return;
              let coords = [];
              if (found.geometry.type === "Polygon") coords = found.geometry.coordinates[0];
              else if (found.geometry.type === "MultiPolygon") coords = found.geometry.coordinates[0][0];
              const bounds = coords.reduce(
                (b, coord) => b.extend(coord),
                new maplibregl.LngLatBounds(coords[0], coords[0])
              );
              mapRef.current.fitBounds(bounds, { padding: 40, duration: 1500 });
            }}
            style={{
              width: "320px", padding: "12px 18px", borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)", color: "#111827", fontSize: "14px",
              outline: "none", boxShadow: "0 8px 32px rgba(0,0,0,0.12)"
            }}
          />
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 30, left: 30,
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.18)", padding: "12px",
        borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.2)", zIndex: 1, minWidth: "180px"
      }}>
        <h4 style={{ margin: 0, marginBottom: "10px" }}>Katmanlar</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* İlçe */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "grid", gridTemplateColumns: "24px 20px 1fr 30px", alignItems: "center", columnGap: "10px", cursor: "pointer" }}>
              <div style={{ width: "22px", height: "3px", borderRadius: "2px", background: "#ef4444" }} />
              <input type="checkbox" checked={layerVisible} onChange={() => setLayerVisible(!layerVisible)} />
              <span>İlçe Sınırları</span>
              <button onClick={() => moveLayerToTop(["district-outline"])}>↑</button>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={districtOpacity} onChange={(e) => setDistrictOpacity(Number(e.target.value))} />
          </div>

          {/* Mahalle */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "grid", gridTemplateColumns: "24px 20px 1fr 30px", alignItems: "center", columnGap: "10px", cursor: "pointer" }}>
              <div style={{ width: "22px", height: "3px", borderRadius: "2px", background: "#2563eb" }} />
              <input type="checkbox" checked={mahalleVisible} onChange={() => setMahalleVisible(!mahalleVisible)} />
              <span>Mahalle Sınırları</span>
              <button onClick={() => moveLayerToTop(["mahalle-outline"])}>↑</button>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={mahalleOpacity} onChange={(e) => setMahalleOpacity(Number(e.target.value))} />
          </div>

          {/* Toplanma */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "grid", gridTemplateColumns: "24px 20px 1fr 30px", alignItems: "center", columnGap: "10px", cursor: "pointer" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#16a34a" }} />
              <input type="checkbox" checked={toplanmaVisible} onChange={() => setToplanmaVisible(!toplanmaVisible)} />
              <span>Toplanma Alanları</span>
              <button onClick={() => moveLayerToTop(["toplanma-points"])}>↑</button>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={toplanmaOpacity} onChange={(e) => setToplanmaOpacity(Number(e.target.value))} />
          </div>

          {/* Yollar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "grid", gridTemplateColumns: "24px 20px 1fr 30px", alignItems: "center", columnGap: "10px", cursor: "pointer" }}>
              <div style={{ width: "22px", height: "3px", borderRadius: "2px", background: "#f59e0b" }} />
              <input type="checkbox" checked={yollarVisible} onChange={() => setYollarVisible(!yollarVisible)} />
              <span>Yol Ağı</span>
              <button onClick={() => moveLayerToTop(["yollar-line"])}>↑</button>
            </label>
            <input type="range" min="0" max="1" step="0.1" value={yollarOpacity} onChange={(e) => setYollarOpacity(Number(e.target.value))} />
          </div>

        </div>
      </div>

{/* Floating Analysis Button */}
<div
  onClick={() =>
    setAnalysisOpen(!analysisOpen)
  }
  style={{
    position: "absolute",
    top: 100,
    right: 30,

    padding: "0 22px",
    height: "58px",

    borderRadius: "18px",

    background:
      "rgba(255,255,255,0.14)",

    backdropFilter: "blur(14px)",

    border:
      "1px solid rgba(255,255,255,0.18)",

    boxShadow:
      "0 10px 35px rgba(0,0,0,0.18)",

    display: "flex",
    alignItems: "center",
    justifyContent: "center",

    gap: "12px",

    cursor: "pointer",

    zIndex: 20,

    transition: "all 0.25s"
  }}
>

  <img
    src="/analysis_icon.png"
    alt="analysis"
    style={{
      width: "24px",
      height: "24px",
      objectFit: "contain"
    }}
  />

  <span
    style={{
      color: "black",
      fontWeight: "700",
      fontSize: "15px",
      letterSpacing: "0.3px"
    }}
  >
    Analiz Katmanları
  </span>

</div>

<AnalysisPanel

  analysisOpen={analysisOpen}
  setAnalysisOpen={setAnalysisOpen}

  service5Visible={service5Visible}
  setService5Visible={
    setService5Visible
  }
  service10Visible={service10Visible}
setService10Visible={
  setService10Visible
}

service15Visible={service15Visible}
setService15Visible={
  setService15Visible
}

serviceOpacity={serviceOpacity}
setServiceOpacity={
  setServiceOpacity
}

isPlaying={isPlaying}
setIsPlaying={setIsPlaying}

/>

{/* Bottom Footer */}
<div
  style={{

    position: "absolute",

    left: "50%",
transform: "translateX(-50%)",
bottom: 20,

    height: "54px",

    padding: "0 22px",

    borderRadius: "18px",

    background:
      "rgba(255,255,255,0.14)",

    backdropFilter: "blur(14px)",

    border:
      "1px solid rgba(255,255,255,0.18)",

    boxShadow:
      "0 10px 35px rgba(0,0,0,0.18)",

    display: "flex",

    alignItems: "center",

    justifyContent: "center",

    zIndex: 20
  }}
>

  <span
    style={{
      color: "#ddd6fe",
      fontSize: "14px",
      fontWeight: "600",
      letterSpacing: "0.4px"
    }}
  >
    Team KOR-İZ
  </span>

</div>

</div>
  );
}

export default App;
