import { useEffect, useMemo, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import AnalysisPanel from "./components/AnalysisPanel";


const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
const EMPTY_FC = { type: "FeatureCollection", features: [] };

const emergencyCategoryColors = {
  DEPREM: "#ef4444",
  YANGIN: "#f97316",
  SEL_TASKIN: "#2563eb",
  TRAFIK_KAZASI: "#7c3aed",
  ARAMA_KURTARMA: "#16a34a",
  DIGER_ACIL: "#64748b",
};

function App() {
  // --- KATMAN STATE ---
  const [layerVisible, setLayerVisible] = useState(true);
  const [mahalleVisible, setMahalleVisible] = useState(false);
  const [toplanmaVisible, setToplanmaVisible] = useState(true);
  const [faultVisible, setFaultVisible] = useState(false);
  const [sinkholeVisible, setSinkholeVisible] = useState(false);
  const [facilityVisible, setFacilityVisible] = useState(false);
  const [roadVisible, setRoadVisible] = useState(false);
  const [emergencyVisible, setEmergencyVisible] = useState(false);

  const [provinceBoundaryVisible, setProvinceBoundaryVisible] = useState(false);
  const [parksVisible, setParksVisible] = useState(false);
  const [lawVisible, setLawVisible] = useState(false);
  const [healthPointVisible, setHealthPointVisible] = useState(false);
  const [healthAreaVisible, setHealthAreaVisible] = useState(false);
  const [transitPointVisible, setTransitPointVisible] = useState(false);
  const [transitAreaVisible, setTransitAreaVisible] = useState(false);
  const [resilienceVisible, setResilienceVisible] = useState(false);
  const [buildingsVisible, setBuildingsVisible] = useState(false);

const [buildings5Visible, setBuildings5Visible] = useState(false);

const [buildings10Visible, setBuildings10Visible] = useState(false);

const [buildings15Visible, setBuildings15Visible] = useState(false);

const [buildingsUnreachableVisible, setBuildingsUnreachableVisible] = useState(false);

const [heatmapVisible, setHeatmapVisible] = useState(false);

const [service5Visible, setService5Visible] = useState(false);

const [service10Visible, setService10Visible] = useState(false);

const [service15Visible, setService15Visible] = useState(false);



  // --- OPASITE STATE ---
  const [mahalleOpacity, setMahalleOpacity] = useState(1);
  const [serviceOpacity, setServiceOpacity] = useState(1);
  const [toplanmaOpacity, setToplanmaOpacity] = useState(1);
  const [districtOpacity, setDistrictOpacity] = useState(1);
  const [buildingsOpacity, setBuildingsOpacity] = useState(0.88);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.40);
  const [appLoading, setAppLoading] = useState(true);


  // --- UI STATE ---
  const [searchText, setSearchText] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeAnalysisLayer, setActiveAnalysisLayer] = useState(null);
  const [eventsPanelOpen, setEventsPanelOpen] = useState(true);
  const [activeSideTab, setActiveSideTab] = useState("events");

  // --- ACIL DURUM STATE ---
  const [emergencyFeatures, setEmergencyFeatures] = useState([]);
  const [emergencyCategory, setEmergencyCategory] = useState("Tümü");
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);

  // --- RISK / DIRENCLILIK STATE ---
  const [selectedRegionSummary, setSelectedRegionSummary] = useState(null);
  const [neighborhoodRankFeatures, setNeighborhoodRankFeatures] = useState([]);

  // --- REFS ---
  const mahalleDataRef = useRef(null);
  const mapRef = useRef(null);

  const loadedLayersRef = useRef({});
  const regionSummaryRef = useRef({});
  const viewportVisibilityRef = useRef({});

  // --- MEMO ---
  const emergencyCategories = useMemo(() => {
    const cats = emergencyFeatures
      .map((f) => f.properties?.birincil_etiket || "Kategori yok")
      .filter(Boolean);
    return ["Tümü", ...Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b, "tr"))];
  }, [emergencyFeatures]);

  const filteredEvents = useMemo(() => {
    return emergencyCategory === "Tümü"
      ? emergencyFeatures
      : emergencyFeatures.filter((f) => (f.properties?.birincil_etiket || "Kategori yok") === emergencyCategory);
  }, [emergencyCategory, emergencyFeatures]);

  const visibleEvents = useMemo(() => {
    return [...filteredEvents]
      .sort((a, b) => new Date(b.properties?.tarih_utc || 0) - new Date(a.properties?.tarih_utc || 0))
      .slice(0, 250);
  }, [filteredEvents]);

  const rankedNeighborhoods = useMemo(() => {
    return [...neighborhoodRankFeatures]
      .filter((f) => f.properties?.region_name)
      .sort((a, b) => Number(b.properties?.resilience_score || 0) - Number(a.properties?.resilience_score || 0));
  }, [neighborhoodRankFeatures]);

  useEffect(() => {
    viewportVisibilityRef.current = {
      "major-roads": roadVisible,
      "service-area-5-lines": service5Visible,
      "service-area-10-lines": service10Visible,
      "service-area-15-lines": service15Visible,
      "service-area-5-polygons": service5Visible,
      "service-area-10-polygons": service10Visible,
      "service-area-15-polygons": service15Visible,
      "buildings-5": buildings5Visible,
      "buildings-10": buildings10Visible,
      "buildings-15": buildings15Visible,
      "buildings-unreachable": buildingsUnreachableVisible,
      "inaccessible-heatmap": heatmapVisible,
    };
  }, [
    roadVisible,
    service5Visible,
    service10Visible,
    service15Visible,
    buildingsVisible,
    buildings5Visible,
    buildings10Visible,
    buildings15Visible,
    buildingsUnreachableVisible,
    heatmapVisible,
  ]);

  // --- REGION SUMMARY FONKSIYONLARI ---
  const setRegionSummarySource = (level, data, map = mapRef.current) => {
    const sourceId = level === "neighborhood" ? "neighborhood-risk" : "district-risk";
    map?.getSource(sourceId)?.setData(data);
  };

  const loadRegionSummary = async (level = "district", map = mapRef.current) => {
    const cached = regionSummaryRef.current[level];
    if (cached) {
      setRegionSummarySource(level, cached, map);
      if (level === "neighborhood") setNeighborhoodRankFeatures(cached.features || []);
      return cached;
    }

    const apiLevel = level === "neighborhood" ? "mahalle" : level;
    const res = await fetch(`${API_URL}/analysis/region-summary?level=${apiLevel}`);
    if (!res.ok) throw new Error("Region summary yuklenemedi");

    const data = await res.json();
    regionSummaryRef.current[level] = data;
    setRegionSummarySource(level, data, map);
    if (level === "neighborhood") setNeighborhoodRankFeatures(data.features || []);
    return data;
  };

  const selectRegionSummary = async (level, properties, map = mapRef.current) => {
    try {
      const data = await loadRegionSummary(level, map);
      const regionName = level === "neighborhood"
        ? properties.adi_numara || properties.ADI_NUMARA
        : properties.name;
      const feature = data.features.find((f) => f.properties?.region_name === regionName);
      if (feature) setSelectedRegionSummary(feature.properties);
    } catch {
      /* sessiz hata */
    }
  };

  // --- ACIL DURUM VERISI ---
  const loadEmergencyData = async (map = mapRef.current) => {
    /*
const cached = loadedLayersRef.current["emergency-points"];

if (cached) {
  setEmergencyFeatures(cached.features || []);
  map?.getSource("emergency-points")?.setData(cached);
  return;
}
*/
    try {
      const res = await fetch(`${API_URL}/layers/acil-durum`);
      if (!res.ok) return;
      const raw = await res.json();
      const data = normalizeEmergencyGeojson(raw);
      console.log(
  "ILK KAYIT",
  data.features[0]?.properties
);

console.log(
  "YANGIN ORNEK",
  data.features.find(
    x => x.properties?.birincil_etiket === "YANGIN"
  )?.properties
);

console.log(
  "ARAMA ORNEK",
  data.features.find(
    x => x.properties?.birincil_etiket === "ARAMA_KURTARMA"
  )?.properties
);
      setEmergencyFeatures(data.features);
      map?.getSource("emergency-points")?.setData(data);
      loadedLayersRef.current["emergency-points"] = data;
    } catch {
      /* sessiz */
    }
  };

  const loadMahalleData = async (map = mapRef.current) => {
    if (loadedLayersRef.current["mahalleler"]) {
      return loadedLayersRef.current["mahalleler"];
    }

    try {
      const data = await loadRegionSummary("neighborhood", map);
      mahalleDataRef.current = data.features || [];
      map?.getSource("mahalleler")?.setData(data);
      loadedLayersRef.current["mahalleler"] = data;
      return data;
    } catch {
      return EMPTY_FC;
    }
  };

  // --- GENEL LAYER TOGGLE FONKSIYONU ---
  const buildMapBboxEndpoint = (endpoint) => {

  const map = mapRef.current;

  if (!map) return endpoint;

  const bounds = map.getBounds();

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const bbox = [
    sw.lng,
    sw.lat,
    ne.lng,
    ne.lat
  ]
    .map((value) => value.toFixed(6))
    .join(",");

  const separator =
    endpoint.includes("?")
      ? "&"
      : "?";

  return `${endpoint}${separator}bbox=${bbox}`;
};

  const toggleDataLayer = async (nextVisible, setter, sourceId, layerIds, endpoint) => {
    setter(nextVisible);
    if (nextVisible && !loadedLayersRef.current[sourceId]) {
      try {
        const res = await fetch(
  endpoint.startsWith("http")
    ? buildMapBboxEndpoint(endpoint)
    : `${API_URL}${buildMapBboxEndpoint(endpoint)}`
);
        if (res.ok) {
          const data = await res.json();
          mapRef.current?.getSource(sourceId)?.setData(data);
          loadedLayersRef.current[sourceId] = true;
        }
      } catch {
        /* sessiz */
      }
    }
    layerIds.forEach((id) => {
      if (mapRef.current?.getLayer(id)) {
        mapRef.current.setLayoutProperty(id, "visibility", nextVisible ? "visible" : "none");
      }
    });
  };

  // --- MAHALLE RANK FONKSIYONU ---
  useEffect(() => {
    if (activeSideTab !== "resilience") return;
    loadRegionSummary("neighborhood")
      .then((data) => {
        setNeighborhoodRankFeatures(data.features || []);
      })
      .catch(() => {});
  }, [activeSideTab]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setAppLoading(false);
    }, 25000);

    return () => window.clearTimeout(fallbackTimer);
  }, []);

  // --- ANA MAP EFFECT ---
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
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
          },
        },
        layers: [{ id: "carto-light-layer", type: "raster", source: "carto-light" }],
      },
      center: [32.49, 37.87],
      zoom: 11,
      pitch: 60,
      bearing: -20,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl());
    let viewportReloadTimer = null;

    map.on("load", async () => {
      const fetchGeojson = async (path, timeoutMs = 90000) => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(`${API_URL}${path}`, { signal: controller.signal });
          if (!res.ok) return EMPTY_FC;
          return await res.json();
        } catch {
          return EMPTY_FC;
        } finally {
          window.clearTimeout(timeoutId);
        }
      };

      const withMapBbox = (path) => {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bbox = [sw.lng, sw.lat, ne.lng, ne.lat].map((value) => value.toFixed(6)).join(",");
        return `${path}?bbox=${bbox}`;
      };

      const [ilceData, toplanmaData] = await Promise.all([
  fetchGeojson("/ilceler"),
  fetchGeojson("/toplanma-alanlari"),
]);

const mahalleData = EMPTY_FC;
const service5Data = EMPTY_FC;
const service10Data = EMPTY_FC;
const service15Data = EMPTY_FC;
const service5PolyData = EMPTY_FC;
const service10PolyData = EMPTY_FC;
const service15PolyData = EMPTY_FC;

      mahalleDataRef.current = [];

      const addSrc = (id, cfg) => {
        if (!map.getSource(id)) map.addSource(id, cfg);
      };
      addSrc("districts", { type: "geojson", data: ilceData });
      addSrc("mahalleler", { type: "geojson", data: mahalleData });
      addSrc("toplanma", { type: "geojson", data: toplanmaData });
      addSrc("service-area-5-lines", {
  type: "geojson",
  data: service5Data,
});

addSrc("service-area-10-lines", {
  type: "geojson",
  data: service10Data,
});

addSrc("service-area-15-lines", {
  type: "geojson",
  data: service15Data,
});
addSrc("service-area-5-polygons", {
  type: "geojson",
  data: service5PolyData,
});

addSrc("service-area-10-polygons", {
  type: "geojson",
  data: service10PolyData,
});

addSrc("service-area-15-polygons", {
  type: "geojson",
  data: service15PolyData,
});

addSrc("buildings-3d", {
  type: "vector",
  tiles: [`${API_URL}/tiles/buildings-3d/{z}/{x}/{y}.pbf`],
  minzoom: 12,
  maxzoom: 16,
});

addSrc("buildings-5", {
  type: "geojson",
  data: EMPTY_FC,
});

addSrc("buildings-10", {
  type: "geojson",
  data: EMPTY_FC,
});

addSrc("buildings-15", {
  type: "geojson",
  data: EMPTY_FC,
});

addSrc("buildings-unreachable", {
  type: "geojson",
  data: EMPTY_FC,
});

addSrc("inaccessible-heatmap", {
  type: "geojson",
  data: EMPTY_FC,
});

      addSrc("fault-lines", { type: "geojson", data: EMPTY_FC });
      addSrc("sinkholes", { type: "geojson", data: EMPTY_FC });
      addSrc("critical-facilities", { type: "geojson", data: EMPTY_FC });
      addSrc("major-roads", { type: "geojson", data: EMPTY_FC });
      addSrc("emergency-points", { type: "geojson", data: EMPTY_FC });
      addSrc("province-boundary", { type: "geojson", data: EMPTY_FC });
      addSrc("parks", { type: "geojson", data: EMPTY_FC });
      addSrc("law-enforcement", { type: "geojson", data: EMPTY_FC });
      addSrc("health-points", { type: "geojson", data: EMPTY_FC });
      addSrc("health-areas", { type: "geojson", data: EMPTY_FC });
      addSrc("transit-points", { type: "geojson", data: EMPTY_FC });
      addSrc("transit-areas", { type: "geojson", data: EMPTY_FC });
      addSrc("critical-accessibility", { type: "geojson", data: EMPTY_FC });
      addSrc("district-risk", { type: "geojson", data: EMPTY_FC });
      addSrc("neighborhood-risk", { type: "geojson", data: EMPTY_FC });


      const addLyr = (cfg) => {
        if (!map.getLayer(cfg.id)) map.addLayer(cfg);
      };

      addLyr({ id: "district-fill", type: "fill", source: "districts", paint: { "fill-color": "#ef4444", "fill-opacity": 0 } });
      addLyr({ id: "district-outline", type: "line", source: "districts", paint: { "line-color": "#ef4444", "line-width": 1.5 } });

      addLyr({
  id: "resilience-district-fill",

  type: "fill",

  source: "district-risk",

  layout: {
    visibility: "none",
  },

  paint: {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["get", "resilience_score"],

      0, "#dc2626",
      55, "#f59e0b",
      75, "#22c55e",
      100, "#0f766e"
    ],

    "fill-opacity": 0.24,
  },
});

      addLyr({ id: "mahalle-fill", type: "fill", source: "mahalleler", paint: { "fill-color": "#2563eb", "fill-opacity": 0 } });

      addLyr({
        id: "resilience-neighborhood-fill",
        type: "fill",
        source: "neighborhood-risk",
        layout: { visibility: "none" },
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "resilience_score"], 0, "#dc2626", 55, "#f59e0b", 75, "#22c55e", 100, "#0f766e"],
          "fill-opacity": 0.22,
        },
      });

      addLyr({ id: "mahalle-outline", type: "line", source: "mahalleler", paint: { "line-color": "#2563eb", "line-width": 1 } });

addLyr({

  id: "inaccessible-heatmap",

  type: "heatmap",

  source: "inaccessible-heatmap",

  maxzoom: 18,

  paint: {

    // yoğunluk

    "heatmap-weight": 1,

    // zoom ile yoğunluk

    "heatmap-intensity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      8, 0.6,
      15, 2
    ],

    // renk

    "heatmap-color": [

  "interpolate",
  ["linear"],
  ["heatmap-density"],

  0,
  "rgba(0,0,0,0)",

  0.2,
  "rgba(255,120,120,0.05)",

  0.4,
  "rgba(255,90,90,0.10)",

  0.6,
"rgba(255,40,40,0.28)",

  0.8,
  "rgba(255,0,0,0.28)",

  1,
  "rgba(255,0,0,0.55)"
],

    // radius

    "heatmap-radius": [
  "interpolate",
  ["linear"],
  ["zoom"],

  2, 4,

  10, 10,

  15, 18
],

    // opacity

    "heatmap-opacity": 0.45,
  },
});

     addLyr({

  id: "buildings-3d",

  type: "fill-extrusion",

  source: "buildings-3d",

  "source-layer": "buildings",

  minzoom: 12,

  layout: {
    visibility: "none"
  },

  paint: {

    // RENKLER

    "fill-extrusion-color": "#d1d5db",

    // YÜKSEKLİK

    "fill-extrusion-height": [
      "get",
      "height"
    ],

    // TABAN

    "fill-extrusion-base": 0,

    // OPACITY

    "fill-extrusion-opacity": 0.50,


    "fill-extrusion-vertical-gradient": true,
  },
});

addLyr({

  id: "buildings-5",

  type: "fill-extrusion",

  source: "buildings-5",

  minzoom: 8,


  layout: {
    visibility: "none"
  },

  paint: {

    "fill-extrusion-color": "#22c55e",

    "fill-extrusion-height": [
      "get",
      "height"
    ],

    "fill-extrusion-base": 0,

    "fill-extrusion-opacity": 0.95,
  },
});

addLyr({

  id: "buildings-10",

  type: "fill-extrusion",

  source: "buildings-10",

  minzoom: 8,

  layout: {
    visibility: "none"
  },

  paint: {

    "fill-extrusion-color": "#f59e0b",

    "fill-extrusion-height": [
      "get",
      "height"
    ],

    "fill-extrusion-base": 0,

    "fill-extrusion-opacity": 0.95,
  },
});

addLyr({

  id: "buildings-15",

  type: "fill-extrusion",

  source: "buildings-15",

  minzoom: 8,

  layout: {
    visibility: "none"
  },

  paint: {

    "fill-extrusion-color": "#ef4444",

    "fill-extrusion-height": [
      "get",
      "height"
    ],

    "fill-extrusion-base": 0,

    "fill-extrusion-opacity": 0.95,
  },
});

addLyr({

  id: "buildings-unreachable",

  type: "fill-extrusion",

  source: "buildings-unreachable",

  minzoom: 8,

  layout: {
    visibility: "none"
  },

  paint: {

    "fill-extrusion-color": "#6b7280",

    "fill-extrusion-height": [
      "get",
      "height"
    ],

    "fill-extrusion-base": 0,

    "fill-extrusion-opacity": 0.98,
  },
});

      addLyr({
  id: "service-area-15-fill",

  type: "fill",

  source: "service-area-15-polygons",

  paint: {
    "fill-color": "#ef4444",
    "fill-opacity": 0.08,
  },
});
addLyr({
  id: "service-area-10-fill",

  type: "fill",

  source: "service-area-10-polygons",

  paint: {
    "fill-color": "#f59e0b",
    "fill-opacity": 0.12,
  },
});
addLyr({
  id: "service-area-5-fill",

  type: "fill",

  source: "service-area-5-polygons",

  paint: {
    "fill-color": "#22c55e",
    "fill-opacity": 0.18,
  },
});
      addLyr({
  id: "service-area-15-line",
  type: "line",
  source: "service-area-15-lines",

  layout: {
    visibility: "visible",
  },

  paint: {
    "line-color": "#ef4444",
    "line-width": 2,
    "line-opacity": 0.18,
  },
});
addLyr({
  id: "service-area-10-line",
  type: "line",
  source: "service-area-10-lines",

  layout: {
    visibility: "visible",
  },

  paint: {
    "line-color": "#f59e0b",
    "line-width": 2.5,
    "line-opacity": 0.28,
  },
});
addLyr({
  id: "service-area-5-line",
  type: "line",
  source: "service-area-5-lines",

  layout: {
    visibility: "visible",
  },

  paint: {
    "line-color": "#22c55e",
    "line-width": 3,
    "line-opacity": 0.42,
  },
});
      addLyr({
        id: "toplanma-points",
        type: "circle",
        source: "toplanma",
        paint: {
          "circle-radius": 4,
          "circle-color": "#22c55e",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#dcfce7",
          "circle-opacity": 0.95,
          "circle-blur": 0.2,
        },
      });

      addLyr({ id: "fault-lines-line", type: "line", source: "fault-lines", layout: { visibility: "none" }, paint: { "line-color": "#dc2626", "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 13, 3] } });
      addLyr({ id: "sinkholes-point", type: "circle", source: "sinkholes", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 7], "circle-color": "#7c2d12", "circle-stroke-color": "#fff7ed", "circle-stroke-width": 1, "circle-opacity": 0.9 } });
      addLyr({ id: "critical-facilities-point", type: "circle", source: "critical-facilities", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#64748b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.88 } });
      addLyr({ id: "major-roads-line", type: "line", source: "major-roads", layout: { visibility: "none" }, paint: { "line-color": "#64748b", "line-opacity": 0.58, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 13, 2.4] } });
      addLyr({ id: "province-boundary-line", type: "line", source: "province-boundary", layout: { visibility: "none" }, paint: { "line-color": "#0f172a", "line-opacity": 0.86, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.3, 12, 3] } });
      addLyr({ id: "parks-fill", type: "fill", source: "parks", layout: { visibility: "none" }, paint: { "fill-color": "#22c55e", "fill-opacity": 0.24 } });
      addLyr({ id: "parks-outline", type: "line", source: "parks", layout: { visibility: "none" }, paint: { "line-color": "#15803d", "line-width": 0.8, "line-opacity": 0.8 } });
      addLyr({ id: "law-enforcement-point", type: "circle", source: "law-enforcement", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.9 } });
      addLyr({ id: "health-points-point", type: "circle", source: "health-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#0891b2", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.9 } });
      addLyr({ id: "health-areas-fill", type: "fill", source: "health-areas", layout: { visibility: "none" }, paint: { "fill-color": "#06b6d4", "fill-opacity": 0.22 } });
      addLyr({ id: "health-areas-outline", type: "line", source: "health-areas", layout: { visibility: "none" }, paint: { "line-color": "#0891b2", "line-width": 0.8, "line-opacity": 0.82 } });
      addLyr({ id: "transit-points-point", type: "circle", source: "transit-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#9333ea", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.9 } });
      addLyr({ id: "transit-areas-fill", type: "fill", source: "transit-areas", layout: { visibility: "none" }, paint: { "fill-color": "#a855f7", "fill-opacity": 0.2 } });
      addLyr({ id: "transit-areas-outline", type: "line", source: "transit-areas", layout: { visibility: "none" }, paint: { "line-color": "#7e22ce", "line-width": 0.8, "line-opacity": 0.82 } });
      addLyr({
  id: "critical-accessibility-fill",
  type: "fill",
  source: "critical-accessibility",
  layout: { visibility: "none" },

  paint: {
    "fill-color": [
      "match",
      ["get", "risk_level"],

      "Çok Düşük Risk", "#b8f28f",
      "Düşük Risk", "#ff4fa3",
      "Kritik Risk", "#facc15",
      "Orta Risk", "#4f6df5",
      "Yüksek Risk", "#43e6c3",

      "#94a3b8"
    ],

    "fill-opacity": 0.55,

    "fill-outline-color": "rgba(255,255,255,0.35)"
  }
});
      addLyr({ id: "emergency-heatmap", type: "heatmap", source: "emergency-points", layout: { visibility: "none" }, paint: { "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 7, 0.55, 13, 1], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 7, 0.75, 13, 1.8], "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 7, 16, 13, 42], "heatmap-opacity": 0.72 } });
      addLyr({ id: "emergency-points-circle", type: "circle", source: "emergency-points", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": ["match", ["get", "birincil_etiket"], "DEPREM", "#ef4444", "YANGIN", "#f97316", "SEL_TASKIN", "#2563eb", "TRAFIK_KAZASI", "#7c3aed", "ARAMA_KURTARMA", "#16a34a", "#f59e0b"], "circle-stroke-color": "#fff7ed", "circle-stroke-width": 1.2, "circle-opacity": 0.9 } });



      addLyr({ id: "district-hover", type: "fill", source: "districts", paint: { "fill-color": "#ef4444", "fill-opacity": 0.2 }, filter: ["==", "name", ""] });




      map.on("mousemove", "district-fill", (e) => {
        map.setFilter("district-hover", ["==", "name", e.features[0].properties.name]);
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "district-fill", () => {
        map.setFilter("district-hover", ["==", "name", ""]);
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "district-fill", (e) => {
        selectRegionSummary("district", e.features[0].properties, map);
      });
      map.on("click", "resilience-district-fill", (e) => {
        setSelectedRegionSummary(e.features[0].properties);
      });

      const mahallePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "mahalle-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        mahallePopup
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:14px;font-weight:600;">${e.features[0].properties.adi_numara}</div>`)
          .addTo(map);
      });
      map.on("mouseleave", "mahalle-fill", () => {
        map.getCanvas().style.cursor = "";
        mahallePopup.remove();
      });
      map.on("click", "mahalle-fill", (e) => {
        selectRegionSummary("neighborhood", e.features[0].properties, map);
      });
      map.on("click", "resilience-neighborhood-fill", (e) => {
        setSelectedRegionSummary(e.features[0].properties);
      });

      loadEmergencyData(map);
      loadRegionSummary("district", map).catch(() => {});

      map.setLayoutProperty("district-outline", "visibility", "visible");
      map.setLayoutProperty("district-fill", "visibility", "visible");
      map.setLayoutProperty("mahalle-fill", "visibility", "none");
      map.setLayoutProperty("mahalle-outline", "visibility", "none");
      map.setLayoutProperty("toplanma-points", "visibility", "visible");

      const viewportSourcePaths = [

  ["major-roads", "/layers/ana-yollar"],

  ["service-area-5-lines", "/service-area-5-lines"],
  ["service-area-10-lines", "/service-area-10-lines"],
  ["service-area-15-lines", "/service-area-15-lines"],

  ["service-area-5-polygons", "/service-area-5-polygons"],
  ["service-area-10-polygons", "/service-area-10-polygons"],
  ["service-area-15-polygons", "/service-area-15-polygons"],

  ["buildings-5", "/buildings-5"],
  ["buildings-10", "/buildings-10"],
  ["buildings-15", "/buildings-15"],
  ["buildings-unreachable", "/buildings-unreachable"],
  ["inaccessible-heatmap", "/inaccessible-buildings-heatmap"],

];

      const reloadViewportSources = () => {
  window.clearTimeout(viewportReloadTimer);
  viewportReloadTimer = window.setTimeout(() => {


    Promise.all(
  viewportSourcePaths.map(async ([sourceId, path]) => {
        if (!viewportVisibilityRef.current[sourceId]) return;
        const source = map.getSource(sourceId);
        if (!source) return;
        const data = await fetchGeojson(withMapBbox(path), 60000);
        if (!data.features?.length) return;
        source.setData(data);
      })
    ).catch(() => {});
  }, 450);
};
map.on("moveend", reloadViewportSources);
reloadViewportSources();
      requestAnimationFrame(() => {

  requestAnimationFrame(() => {

    setAppLoading(false);

  });

});
    });

    return () => {

      window.clearTimeout(viewportReloadTimer);
      map.remove();
    };
  }, []);



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

    if (mahalleVisible) {
      loadMahalleData(map).catch(() => {});
    }
  }, [mahalleVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("toplanma-points")) return;
    map.setLayoutProperty("toplanma-points", "visibility", toplanmaVisible ? "visible" : "none");
    map.setPaintProperty("toplanma-points", "circle-opacity", toplanmaOpacity);
  }, [toplanmaVisible, toplanmaOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("mahalle-outline")) return;
    map.setPaintProperty("mahalle-outline", "line-opacity", mahalleOpacity);
  }, [mahalleOpacity]);

  useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  // 5 DK

  if (map.getLayer("service-area-5-line")) {
    map.setLayoutProperty(
      "service-area-5-line",
      "visibility",
      service5Visible ? "visible" : "none"
    );
  }

  if (map.getLayer("service-area-5-fill")) {
    map.setLayoutProperty(
      "service-area-5-fill",
      "visibility",
      service5Visible ? "visible" : "none"
    );
  }

  // 10 DK

  if (map.getLayer("service-area-10-line")) {
    map.setLayoutProperty(
      "service-area-10-line",
      "visibility",
      service10Visible ? "visible" : "none"
    );
  }

  if (map.getLayer("service-area-10-fill")) {
    map.setLayoutProperty(
      "service-area-10-fill",
      "visibility",
      service10Visible ? "visible" : "none"
    );
  }

  // 15 DK

  if (map.getLayer("service-area-15-line")) {
    map.setLayoutProperty(
      "service-area-15-line",
      "visibility",
      service15Visible ? "visible" : "none"
    );
  }

  if (map.getLayer("service-area-15-fill")) {
    map.setLayoutProperty(
      "service-area-15-fill",
      "visibility",
      service15Visible ? "visible" : "none"
    );
  }

}, [
  service5Visible,
  service10Visible,
  service15Visible,
]);

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  let opacity = 0.10;

  let direction = 1;

  const interval = setInterval(() => {

    if (!map.getLayer("inaccessible-heatmap"))
      return;

    opacity += direction * 0.015;

    if (opacity >= 0.45) {
      direction = -1;
    }

    if (opacity <= 0.12) {
      direction = 1;
    }

    map.setPaintProperty(
      "inaccessible-heatmap",
      "heatmap-opacity",
      opacity
    );

  }, 90);

  return () => clearInterval(interval);

}, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("service-area-5-line")) return;
    map.setPaintProperty("service-area-5-line", "line-opacity", serviceOpacity);
    map.setPaintProperty("service-area-10-line", "line-opacity", serviceOpacity);
    map.setPaintProperty("service-area-15-line", "line-opacity", serviceOpacity);
  }, [serviceOpacity]);

  useEffect(() => {
  const map = mapRef.current;
  if (!map?.getLayer("resilience-district-fill")) return;
  map.setLayoutProperty("resilience-district-fill", "visibility", resilienceVisible ? "visible" : "none");
}, [resilienceVisible]);

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  // visibility

  if (map.getLayer("buildings-3d")) {

    map.setLayoutProperty(
      "buildings-3d",
      "visibility",
      buildingsVisible ? "visible" : "none"
    );

    map.setPaintProperty(
      "buildings-3d",
      "fill-extrusion-opacity",
      buildingsOpacity
    );
  }


}, [
  buildingsVisible,
  buildingsOpacity,
]);

// BUILDINGS 5

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  if (
    buildings5Visible &&
    !loadedLayersRef.current["buildings-5"]
  ) {

    fetch(
  API_URL +
  buildMapBboxEndpoint("/buildings-5")
)
      .then((r) => r.json())
      .then((data) => {

        map
          .getSource("buildings-5")
          ?.setData(data);

        loadedLayersRef.current[
          "buildings-5"
        ] = true;
      });
  }

  if (map.getLayer("buildings-5")) {

    map.setLayoutProperty(
      "buildings-5",
      "visibility",
      buildings5Visible
        ? "visible"
        : "none"
    );
  }

}, [buildings5Visible]);



// BUILDINGS 10

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  if (
    buildings10Visible &&
    !loadedLayersRef.current["buildings-10"]
  ) {

    fetch(
  API_URL +
  buildMapBboxEndpoint("/buildings-10")
)
      .then((r) => r.json())
      .then((data) => {

        map
          .getSource("buildings-10")
          ?.setData(data);

        loadedLayersRef.current[
          "buildings-10"
        ] = true;
      });
  }

  if (map.getLayer("buildings-10")) {

    map.setLayoutProperty(
      "buildings-10",
      "visibility",
      buildings10Visible
        ? "visible"
        : "none"
    );
  }

}, [buildings10Visible]);



// BUILDINGS 15

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  if (
    buildings15Visible &&
    !loadedLayersRef.current["buildings-15"]
  ) {

    fetch(
  API_URL +
  buildMapBboxEndpoint("/buildings-15")
)
      .then((r) => r.json())
      .then((data) => {

        map
          .getSource("buildings-15")
          ?.setData(data);

        loadedLayersRef.current[
          "buildings-15"
        ] = true;
      });
  }

  if (map.getLayer("buildings-15")) {

    map.setLayoutProperty(
      "buildings-15",
      "visibility",
      buildings15Visible
        ? "visible"
        : "none"
    );
  }

}, [buildings15Visible]);



// BUILDINGS UNREACHABLE

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  if (
    buildingsUnreachableVisible &&
    !loadedLayersRef.current["buildings-unreachable"]
  ) {

    fetch(
  API_URL +
  buildMapBboxEndpoint("/buildings-unreachable")
)
      .then((r) => r.json())
      .then((data) => {

        map
          .getSource("buildings-unreachable")
          ?.setData(data);

        loadedLayersRef.current[
          "buildings-unreachable"
        ] = true;
      });
  }

  if (map.getLayer("buildings-unreachable")) {

    map.setLayoutProperty(
      "buildings-unreachable",
      "visibility",
      buildingsUnreachableVisible
        ? "visible"
        : "none"
    );
  }

}, [buildingsUnreachableVisible]);



// HEATMAP

useEffect(() => {

  const map = mapRef.current;

  if (!map) return;

  if (
    heatmapVisible &&
    !loadedLayersRef.current["inaccessible-heatmap"]
  ) {

    fetch(
  API_URL +
  buildMapBboxEndpoint(
    "/inaccessible-buildings-heatmap"
  )
)
      .then((r) => r.json())
      .then((data) => {

        map
          .getSource("inaccessible-heatmap")
          ?.setData(data);

        loadedLayersRef.current[
          "inaccessible-heatmap"
        ] = true;
      });
  }

  if (map.getLayer("inaccessible-heatmap")) {

    map.setLayoutProperty(
      "inaccessible-heatmap",
      "visibility",
      heatmapVisible
        ? "visible"
        : "none"
    );

    map.setPaintProperty(
      "inaccessible-heatmap",
      "heatmap-opacity",
      heatmapOpacity
    );
  }

}, [
  heatmapVisible,
  heatmapOpacity
]);

  useEffect(() => {
  const map = mapRef.current;

  if (!map?.getLayer("critical-accessibility-fill")) return;

  if (activeAnalysisLayer === "critical-accessibility") {

    fetch(`${API_URL}/layers/ilce_nufuslu_hast_ashi_itfa`)

      .then((r) => r.json())
      .then((data) => {
        map.getSource("critical-accessibility")?.setData(data);
      });
  }

  map.setLayoutProperty(
    "critical-accessibility-fill",
    "visibility",
    activeAnalysisLayer === "critical-accessibility"
      ? "visible"
      : "none"
  );

}, [activeAnalysisLayer]);

  const focusEmergencyEvent = async (feature) => {
  const map = mapRef.current;
  const coords = feature.geometry?.coordinates;
  if (!map || !coords) return;

  await loadEmergencyData(map);
  setEmergencyVisible(true);

  // Katmanı görünür yap
  if (map.getLayer("emergency-points-circle")) {
    map.setLayoutProperty("emergency-points-circle", "visibility", "visible");
  }
  if (map.getLayer("emergency-heatmap")) {
    map.setLayoutProperty("emergency-heatmap", "visibility", "visible");
  }

  setSelectedEmergencyId(feature.properties?.kayit_id);
  map.flyTo({ center: coords, zoom: 14, speed: 0.9 });

  new maplibregl.Popup({ closeButton: true })
    .setLngLat(coords)
    .setHTML(`<div style="max-width:240px"><strong>${feature.properties?.birincil_etiket || ""}</strong><p style="font-size:12px;color:#475569;margin:4px 0 0">${feature.properties?.konum_adi || ""}</p></div>`)
    .addTo(map);
};

  const focusRankedRegion = (feature) => {
    const map = mapRef.current;
    if (!map || !feature) return;
    setSelectedRegionSummary(feature.properties || null);
    setMahalleVisible(true);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", background: "#e5e7eb" }}>
      <div id="map" style={{ width: "100%", height: "100%" }} />

{appLoading && (

  <div
    style={{

      position: "absolute",
      inset: 0,

      zIndex: 9999,


      display: "flex",
      flexDirection: "column",

      alignItems: "center",
      justifyContent: "center",

      background:
  "radial-gradient(circle at center, rgba(49,46,129,0.98), rgba(88,28,135,0.96), rgba(30,27,75,1))",

      overflow: "hidden",
      pointerEvents: "none",
    }}
  >

    {/* glow */}

    <div
      style={{
        position: "absolute",
        width: 420,
        height: 420,
        borderRadius: "50%",

        background:
  "radial-gradient(circle, rgba(192,132,252,0.42), transparent 70%)",

        filter: "blur(40px)",

        animation: "pulseGlow 4s ease-in-out infinite",
      }}
    />

    {/* logo */}

    <div
      style={{
        fontSize: "72px",
        fontWeight: "900",
        fontStyle: "italic",

        letterSpacing: "2px",

        display: "flex",
        alignItems: "center",

        zIndex: 2,
      }}
    >
      <span
  style={{
    color: "#f8fafc",
    textShadow:
      "0 0 18px rgba(255,255,255,0.35)"
  }}
>
        KOR-
      </span>

      <span
  style={{
    color: "#ef4444",

    textShadow:
      "0 0 18px rgba(239,68,68,0.45)"
  }}
>
        İZ
      </span>
    </div>

    {/* subtitle */}

    <div
      style={{
        marginTop: 12,

        color: "#94a3b8",

        fontSize: "14px",
        letterSpacing: "1px",

        zIndex: 2,
      }}
    >
      Acil Durumda Koruma ve İzleme Sistemi
    </div>

    {/* loader */}

    <div
      style={{
        marginTop: 42,

        width: 52,
        height: 52,

        borderRadius: "50%",

        border:
          "3px solid rgba(255,255,255,0.10)",

        borderTop:
  "3px solid #c084fc",

        animation:
          "spinLoader 1s linear infinite",

        zIndex: 2,
      }}
    />

    {/* loading text */}

    <div
      style={{
        marginTop: 18,

        color: "#4c1d95",

        fontSize: "13px",
        fontWeight: "600",

        letterSpacing: "1px",

        zIndex: 2,
      }}
    >
      Veriler yükleniyor...
    </div>

    {/* animation styles */}

    <style>
      {`

        @keyframes spinLoader {

          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulseGlow {

          0% {
            transform: scale(1);
            opacity: 0.7;
          }

          50% {
            transform: scale(1.15);
            opacity: 1;
          }

          100% {
            transform: scale(1);
            opacity: 0.7;
          }
        }

      `}
    </style>

  </div>
)}

      <div style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "72px",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
        display: "flex", alignItems: "center", padding: "0 28px",
        zIndex: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)"
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: "34px", fontWeight: "800", fontStyle: "italic", letterSpacing: "1px", display: "flex", alignItems: "center" }}>
            <span
  style={{
    color: "#ede9fe",
    textShadow:
      "0 0 10px rgba(255,255,255,0.55)"
  }}
>KOR-</span>
            <span
  style={{
    color: "#ef4444",

    textShadow:
      "0 0 18px rgba(239,68,68,0.45)"
  }}
>İZ</span>
          </div>
          <span style={{ color: "#94a3b8", fontSize: "13px", marginTop: "-2px" }}>Acil Durumda Koruma ve İzleme Sistemi</span>
        </div>

        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <input
            type="text"
            placeholder="Mahalle ara..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              if (!mahalleDataRef.current?.length) {
                await loadMahalleData();
              }

              const found = mahalleDataRef.current?.find((m) => m.properties.adi_numara?.toLowerCase().includes(searchText.toLowerCase()));
              if (!found) return;
              const coords = found.geometry.type === "Polygon" ? found.geometry.coordinates[0] : found.geometry.coordinates[0][0];
              const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
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
        <div style={{
  position: "absolute",
  right: "80px",
  top: "18px",
  padding: "8px 14px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.10)",
  border: "1px solid rgba(255,255,255,0.14)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.12)"
}}>
  <span style={{
    color: "#7376F2",
    fontSize: "13px",
    fontWeight: "700",
    letterSpacing: "0.5px"
  }}>
    Team KOR-İZ
  </span>
</div>
      </div>

      {selectedRegionSummary && (
        <div style={{
          position: "absolute",

top: 110,

left: 280,

height: "280px",
          background:
  "linear-gradient(135deg, rgba(199,210,254,0.22), rgba(196,181,253,0.20))", backdropFilter: "blur(22px)",
border: "1px solid rgba(255,255,255,0.22)", borderRadius: "16px",
          padding: "10px 12px", zIndex: 50, width: "280px", color: "black",
          boxShadow: "0 16px 42px rgba(15,23,42,0.28)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "2px", textTransform: "uppercase", letterSpacing: "1px" }}>
                {selectedRegionSummary.region_level || "Bölge"}
              </div>
              <div style={{ fontSize: "13px", fontWeight: "800" }}>{selectedRegionSummary.region_name}</div>
            </div>
            <button onClick={() => setSelectedRegionSummary(null)}
              style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "9px", padding: "9px", background: "rgba(255,255,255,0.06)", borderRadius: "12px" }}>
            <ScoreGauge score={selectedRegionSummary.resilience_score} sizeOverride={42} />
            <div>
              <div style={{ fontWeight: "700", fontSize: "14px" }}>{selectedRegionSummary.resilience_level || "—"}</div>
              <div style={{ color: "#94a3b8", fontSize: "11px", marginBottom: "3px" }}>Afet Dirençlilik Skoru</div>
              <div style={{ fontSize: "21px", fontWeight: "900", color: getScoreColor(selectedRegionSummary.resilience_score) }}>
                {selectedRegionSummary.resilience_score} <span style={{ fontSize: "12px", color: "#94a3b8" }}>/ 100</span>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
            {[
              ["🚨 Acil Olay", selectedRegionSummary.emergency_count],
              ["⚡ Baskın Kategori", selectedRegionSummary.top_emergency_category || "—"],
              ["🕳 Obruk", selectedRegionSummary.sinkhole_count],
              ["📏 Fay Uzunluğu", selectedRegionSummary.fault_length_km != null ? `${selectedRegionSummary.fault_length_km} km` : "—"],
              ["🏕 Toplanma Alanı", selectedRegionSummary.assembly_count],
              ["🏥 Kritik Tesis", selectedRegionSummary.critical_facility_count],
              ["📊 Risk Endeksi", selectedRegionSummary.risk_index ?? "—"],
              ["💪 Kapasite Endeksi", selectedRegionSummary.capacity_index ?? "—"],
            ].map(([label, value]) => (
              <div
  key={label}
  style={{
    background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))",
    borderRadius: "6px",
    padding: "3px",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
    transition: "0.2s"
  }}
>
                <div style={{
  fontSize: "9px",
  color: "#ddd6fe",
  marginBottom: "4px",
  letterSpacing: "0.4px",
  textTransform: "uppercase",
  fontWeight: "700"
}}>{label}</div>
                <div style={{ fontSize: "12px", fontWeight: "700" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        position: "absolute", top: 90, right: 30,
        width: "340px", maxHeight: "calc(100vh - 120px)",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.18)", borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 10,
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: "16px", fontWeight: "700" }}>
            {activeSideTab === "events" ? "Acil Olaylar TEST 999" : "Dirençlilik Sıralaması"}
          </div>
          <button onClick={() => setEventsPanelOpen((p) => !p)}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "18px", color: "#64748b" }}>
            {eventsPanelOpen ? "▲" : "▼"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "8px", background: "rgba(0,0,0,0.04)" }}>
          {["events", "resilience"].map((tab) => (
            <button key={tab} onClick={() => setActiveSideTab(tab)}
              style={{
                padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "700", fontSize: "13px",
                background: activeSideTab === tab ? "white" : "transparent",
                boxShadow: activeSideTab === tab ? "0 1px 6px rgba(0,0,0,0.12)" : "none",
                color: activeSideTab === tab ? "#18212f" : "#64748b"
              }}>
              {tab === "events" ? "Olaylar" : "Dirençlilik"}
            </button>
          ))}
        </div>

        {eventsPanelOpen && (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {activeSideTab === "events" ? (
              <>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", background: "#fff7ed", color: "#c2410c", borderRadius: "999px", padding: "5px 9px" }}>
                    {filteredEvents.length} kayıt
                  </span>
                  <select value={emergencyCategory} onChange={(e) => setEmergencyCategory(e.target.value)}
                    style={{ fontSize: "12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "5px 8px", background: "rgba(255,255,255,0.14)", cursor: "pointer" }}>
                    {emergencyCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div
  style={{
    background: "red",
    color: "white",
    padding: "8px",
    margin: "8px",
    borderRadius: "8px",
    fontSize: "12px"
  }}
>
  Kategori: {emergencyCategory}
  <br />
  Filtrelenen: {filteredEvents.length}
  <br />
  Toplam: {emergencyFeatures.length}
</div>

<div
  style={{
    flex: 1,
    overflowY: "auto",
    padding: "0 8px 8px",
    display: "grid",
    gap: "6px"
  }}
>




  {visibleEvents.map((f, i) => (
                    <button
  key={`${emergencyCategory}-${f.properties?.kayit_id}-${f.properties?.birincil_etiket}`}
                      onClick={() => focusEmergencyEvent(f)}
                      style={{
                        background: selectedEmergencyId === f.properties?.kayit_id ? "linear-gradient(135deg, rgba(192,132,252,0.30), rgba(129,140,248,0.26))"

: "linear-gradient(135deg, rgba(255,255,255,0.32), rgba(224,231,255,0.20))",
                        border: `1px solid ${selectedEmergencyId === f.properties?.kayit_id ? "#f97316" : "rgba(255,255,255,0.12)"}`,
                        borderRadius: "10px", padding: "10px", textAlign: "left", cursor: "pointer", color: "inherit"
                      }}>



                      <div style={{ fontSize: "11px", fontWeight: "750", color: emergencyCategoryColors[f.properties?.birincil_etiket] || "#f97316", marginBottom: "4px" }}>
                        {f.properties?.birincil_etiket || "Kategori yok"}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "2px" }}>
                        {f.properties?.konum_adi || f.properties?.arama_terimi || "Konum yok"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        {f.properties?.tarih_utc ? new Date(f.properties.tarih_utc).toLocaleDateString("tr-TR") : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: "8px 12px" }}>
                  <div style={{ fontSize: "12px", color: "#0f766e", fontWeight: "800" }}>{rankedNeighborhoods.length} mahalle</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>En yüksek dirençlilik skoruna göre</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", display: "grid", gap: "6px" }}>
                  {rankedNeighborhoods.map((f, i) => {
                    const p = f.properties || {};
                    return (
                      <button key={`${p.region_name}-${i}`} onClick={() => focusRankedRegion(f)}
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", padding: "10px", textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "28px 36px 1fr 36px", alignItems: "center", gap: "8px" }}>
                        <span style={{ background: "#eef4ff", color: "#24579f", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800" }}>{i + 1}</span>
                        <ScoreGauge score={p.resilience_score} compact />
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.region_name}</div>
                          <div style={{ fontSize: "10px", color: "#64748b" }}>{p.resilience_level}</div>
                        </div>
                        <span style={{ fontSize: "15px", fontWeight: "800", justifySelf: "end" }}>{p.resilience_score}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{
  position: "absolute",

  top: 110,

  left: 22,

  width: "230px",

  height: "280px",

  overflowY: "auto",
        padding: "12px", borderRadius: "16px",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 10px 40px rgba(0,0,0,0.18)", zIndex: 10,
        overflowY: "auto", scrollbarWidth: "thin"
      }}>
        <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px" }}>Katmanlar</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { label: "İlçe Sınırları", color: "#ef4444", checked: layerVisible, onChange: () => setLayerVisible((v) => !v), type: "line", opacity: districtOpacity, onOpacity: (v) => setDistrictOpacity(v) },
            { label: "Mahalle Sınırları", color: "#2563eb", checked: mahalleVisible, onChange: () => setMahalleVisible((v) => !v), type: "line", opacity: mahalleOpacity, onOpacity: (v) => setMahalleOpacity(v) },
            { label: "Toplanma Alanları", color: "#16a34a", checked: toplanmaVisible, onChange: () => setToplanmaVisible((v) => !v), type: "point", opacity: toplanmaOpacity, onOpacity: (v) => setToplanmaOpacity(v) },
            { label: "Fay Hatları", color: "#dc2626", checked: faultVisible, type: "line", opacity: null, onChange: () => toggleDataLayer(!faultVisible, setFaultVisible, "fault-lines", ["fault-lines-line"], "/layers/fay-hatlari") },
            { label: "Obruklar", color: "#7c2d12", checked: sinkholeVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!sinkholeVisible, setSinkholeVisible, "sinkholes", ["sinkholes-point"], `/layers/obruklar`) },
            { label: "Kritik Tesisler", color: "#64748b", checked: facilityVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!facilityVisible, setFacilityVisible, "critical-facilities", ["critical-facilities-point"], `/layers/kritik-tesisler`) },
            { label: "Ana Yollar", color: "#64748b", checked: roadVisible, type: "line", opacity: null, onChange: () => toggleDataLayer(!roadVisible, setRoadVisible, "major-roads", ["major-roads-line"], `/layers/ana-yollar`) },
            { label: "İl Sınırı", color: "#0f172a", checked: provinceBoundaryVisible, type: "line", opacity: null, onChange: () => toggleDataLayer(!provinceBoundaryVisible, setProvinceBoundaryVisible, "province-boundary", ["province-boundary-line"], `/layers/il-siniri`) },
            { label: "Parklar", color: "#22c55e", checked: parksVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!parksVisible, setParksVisible, "parks", ["parks-fill", "parks-outline"], `/layers/parklar`) },
            { label: "Kolluk", color: "#2563eb", checked: lawVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!lawVisible, setLawVisible, "law-enforcement", ["law-enforcement-point"], `/layers/kolluk`) },
            { label: "Sağlık Noktaları", color: "#0891b2", checked: healthPointVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!healthPointVisible, setHealthPointVisible, "health-points", ["health-points-point"], `/layers/saglik-nokta`) },
            { label: "Sağlık Alanları", color: "#06b6d4", checked: healthAreaVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!healthAreaVisible, setHealthAreaVisible, "health-areas", ["health-areas-fill", "health-areas-outline"], `/layers/saglik-alan`) },
            { label: "Toplu Ulaşım Noktaları", color: "#9333ea", checked: transitPointVisible, type: "point", opacity: null, onChange: () => toggleDataLayer(!transitPointVisible, setTransitPointVisible, "transit-points", ["transit-points-point"], `/layers/toplu-ulasim-nokta`) },
            {
  label: "3D Binalar",
  color: "#d1d5db",
  checked: buildingsVisible,
  type: "point",
  opacity: buildingsOpacity,

  onOpacity: (v) =>
    setBuildingsOpacity(v),

  onChange: () =>
    setBuildingsVisible(
      (v) => !v
    ),
},
            {
  label: "Toplu Ulaşım Alanları",
  color: "#a855f7",
  checked: transitAreaVisible,
  type: "point",
  opacity: null,
  onChange: () =>
    toggleDataLayer(
      !transitAreaVisible,
      setTransitAreaVisible,
      "transit-areas",
      ["transit-areas-fill", "transit-areas-outline"],
      "/layers/toplu-ulasim-alan"
    ),
},
            {
              label: "Acil Durum Noktaları",
              color: "#f97316",
              checked: emergencyVisible,
              type: "point",
              opacity: null,
              onChange: async () => {
                const next = !emergencyVisible;
                setEmergencyVisible(next);
                if (next) await loadEmergencyData();
                mapRef.current?.setLayoutProperty("emergency-points-circle", "visibility", next ? "visible" : "none");
              },
            },
          ].map(({ label, color, checked, onChange, type, opacity, onOpacity }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "8px 9px", borderRadius: "11px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <div style={{ width: type === "point" ? "10px" : "16px", height: type === "point" ? "10px" : "4px", borderRadius: type === "point" ? "50%" : "999px", background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                </div>
                <button onClick={onChange} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "17px", padding: 0, lineHeight: 1, flexShrink: 0 }}>
                  {checked ? "⦿" : "⦸"}
                </button>
              </div>
              {opacity !== null && onOpacity && (
                <input type="range" min="0" max="1" step="0.1" value={opacity}
                  onChange={(e) => onOpacity(Number(e.target.value))}
                  style={{ accentColor: color, width: "100%" }} />
              )}
            </div>
          ))}
        </div>
      </div>

{/* Dirençlilik Skoru Paneli */}
      <div style={{
        position: "absolute",
        top: 450,
        left: 22,
        width: "230px",
        padding: "12px",
        borderRadius: "16px",
        background: "rgba(255,255,255,0.12)",
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        zIndex: 10,
      }}>
        <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px" }}>
          Dirençlilik Skoru
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: "600" }}>İlçe Renk Haritası</span>
          <button
            onClick={() => setResilienceVisible(v => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "17px", padding: 0, lineHeight: 1 }}
          >
            {resilienceVisible ? "⦿" : "⦸"}
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ height: "10px", borderRadius: "999px", background: "linear-gradient(to right, #dc2626, #f59e0b, #22c55e, #0f766e)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", fontWeight: "600" }}>
            <span>0 Kritik</span>
            <span>55 Orta</span>
            <span>75 İyi</span>
            <span>100</span>
          </div>
        </div>
      </div>

      <AnalysisPanel
        analysisOpen={analysisOpen}
        setAnalysisOpen={setAnalysisOpen}
        service5Visible={service5Visible}
        setService5Visible={setService5Visible}
        service10Visible={service10Visible}
        setService10Visible={setService10Visible}
        service15Visible={service15Visible}
        setService15Visible={setService15Visible}
        buildingsVisible={buildingsVisible}
        setBuildingsVisible={setBuildingsVisible}

        buildingsOpacity={buildingsOpacity}
        setBuildingsOpacity={setBuildingsOpacity}

        serviceOpacity={serviceOpacity}
        setServiceOpacity={setServiceOpacity}

        heatmapVisible={heatmapVisible}
        setHeatmapVisible={setHeatmapVisible}

        heatmapOpacity={heatmapOpacity}
        setHeatmapOpacity={setHeatmapOpacity}

        buildings5Visible={buildings5Visible}
        setBuildings5Visible={setBuildings5Visible}

        buildings10Visible={buildings10Visible}
        setBuildings10Visible={setBuildings10Visible}

        buildings15Visible={buildings15Visible}
        setBuildings15Visible={setBuildings15Visible}

        buildingsUnreachableVisible={buildingsUnreachableVisible}
        setBuildingsUnreachableVisible={setBuildingsUnreachableVisible}

        activeAnalysisLayer={activeAnalysisLayer}
        setActiveAnalysisLayer={setActiveAnalysisLayer}
      />


    </div>
  );
}

function getScoreColor(score) {
  const n = Number(score);
  if (n >= 75) return "#0f766e";
  if (n >= 55) return "#d97706";
  return "#dc2626";
}

function ScoreGauge({ score, compact = false, sizeOverride = null }) {
  const n = Math.max(0, Math.min(100, Number(score) || 0));
  const size = sizeOverride || (compact ? 36 : 70);
  const stroke = compact ? 4 : sizeOverride ? 6 : 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (n / 100) * circ;
  const color = getScoreColor(n);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "black", fontWeight: "800", fontSize: sizeOverride ? "14px" : "16px" }}>
          {n}
        </div>
      )}
    </div>
  );
}

function normalizeEmergencyGeojson(data) {
  const features = Array.isArray(data?.features) ? data.features : [];
  return {
    type: "FeatureCollection",
    features: features.map((f, i) => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const lon = Number(coords[0] ?? p.x_lon);
      const lat = Number(coords[1] ?? p.y_lat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          kayit_id: String(p.kayit_id || `emergency-${i + 1}`),
          birincil_etiket: String(p.birincil_etiket || p.kaynak_kategori || "Kategori yok"),
          tarih_utc: String(p.tarih_utc || ""),
          konum_adi: String(p.konum_adi || ""),
          arama_terimi: String(p.arama_terimi || ""),
          metin: String(p.metin || ""),
        },
      };
    }).filter(Boolean),
  };
}

export default App;

