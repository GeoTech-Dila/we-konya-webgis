import { useEffect, useMemo, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import AnalysisPanel from "./components/AnalysisPanel";


const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
const EMPTY_FC = { type: "FeatureCollection", features: [] };
// Türkçe karakterler ve büyük/küçük harf farkı arama sonucunu etkilemesin.
const normalizeSearchText = (value = "") => String(value)
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/ç/g, "c")
  .replace(/ğ/g, "g")
  .replace(/ö/g, "o")
  .replace(/ş/g, "s")
  .replace(/ü/g, "u")
  .trim();
// Bu zoomun altında Konya genel görünümü için sade geometri kullanılır.
const MAHALLE_DETAIL_ZOOM = 9.2;

const emergencyCategoryColors = {
  DEPREM: "#ef4444",
  YANGIN: "#f97316",
  SEL_TASKIN: "#2563eb",
  TRAFIK_KAZASI: "#7c3aed",
  ARAMA_KURTARMA: "#16a34a",
  DIGER_ACIL: "#64748b",
};

const USER_GUIDE_STEPS = [
  { selector: ".layers-panel", title: "Katmanlar", text: "İlçe, mahalle, fay, obruk ve hizmet katmanlarını buradan açıp kapatabilirsin." },
  { selector: ".analysis-panel", title: "Analiz Katmanları", text: "Erişilebilirlik ve öneri toplanma alanı gibi analizleri alt panelden inceleyebilirsin." },
  { selector: ".side-events-panel", title: "Acil Olaylar", text: "Olayların toplamını ve kategori dağılımını görür; Detay Gör ile sayfalı listeye geçersin." },
  { selector: ".resilience-score-panel", title: "Dirençlilik Skoru", text: "Renk haritasını buradan açabilirsin. Sağ panelde ilçe seçerek mahalle sıralamasını incelersin." },
  { selector: ".neighborhood-search", title: "Mahalle Arama", text: "Mahalle adını büyük-küçük harf fark etmeden yaz; harita seni doğrudan o bölgeye götürür." },
  { selector: ".maplibregl-ctrl-group", title: "Yakınlaştırma ve Kuzey", text: "+ ve − düğmeleriyle haritayı yakınlaştırıp uzaklaştırabilirsin. Pusula simgesine dokunarak haritayı tekrar kuzey yönüne çevirirsin." },
  { selector: ".map-home-button", title: "Başlangıç Görünümü", text: "Ev simgesi haritayı KOR-İZ’in ilk açılış görünümüne geri döndürür." },
];

function App() {
  // --- KATMAN STATE ---
  // Katman panelinde başlangıçta yalnız başlıklar görünür.
  const [openLayerGroup, setOpenLayerGroup] = useState(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(false);

  const [layerVisible, setLayerVisible] = useState(true);
  const [mahalleVisible, setMahalleVisible] = useState(false);
  const [toplanmaVisible, setToplanmaVisible] = useState(true);
  const [recommendedAssemblyVisible, setRecommendedAssemblyVisible] = useState(false);
  const [socioGeologicalVisible, setSocioGeologicalVisible] = useState(false);
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
  const [resilienceInfoOpen, setResilienceInfoOpen] = useState(false);
  const [resilienceRankingHelpOpen, setResilienceRankingHelpOpen] = useState(false);
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
  // Açılış metinlerinin hızı: her aşama 700 ms sonra görünür.
  const LOADING_STEP_DELAY_MS = 2000;
  const [appLoading, setAppLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState({ coordinate: "—", scale: "—" });
  const [guideOpen, setGuideOpen] = useState(() => localStorage.getItem("koriz-user-guide-seen") !== "1");
  const [guideStep, setGuideStep] = useState(-1);
  const [guideTargetRect, setGuideTargetRect] = useState(null);


  // --- UI STATE ---
  const [searchText, setSearchText] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [activeAnalysisLayer, setActiveAnalysisLayer] = useState(null);
  const [eventsPanelOpen, setEventsPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 768);
  const [activeSideTab, setActiveSideTab] = useState("events");

  // --- ACIL DURUM STATE ---
  const [emergencyFeatures, setEmergencyFeatures] = useState([]);
  const [emergencyCategory, setEmergencyCategory] = useState("Tümü");
  const [emergencyPage, setEmergencyPage] = useState(1);
  const [emergencyPageFeatures, setEmergencyPageFeatures] = useState([]);
  const [emergencyPageTotal, setEmergencyPageTotal] = useState(0);
  const [emergencyOverallTotal, setEmergencyOverallTotal] = useState(0);
  const [emergencyPanelCategories, setEmergencyPanelCategories] = useState(["Tümü"]);
  const [emergencyPageLoading, setEmergencyPageLoading] = useState(false);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const [emergencyDetailsOpen, setEmergencyDetailsOpen] = useState(false);
  const [emergencySummary, setEmergencySummary] = useState({ total: 0, categories: [], last_updated: null });

  // --- RISK / DIRENCLILIK STATE ---
  const [selectedRegionSummary, setSelectedRegionSummary] = useState(null);
  const [selectedMahalle, setSelectedMahalle] = useState(null);
  const [selectedAssemblyScenario, setSelectedAssemblyScenario] = useState(null);
  const [assemblyScenarioLoading, setAssemblyScenarioLoading] = useState(false);
  const [mahalleScoreLoading, setMahalleScoreLoading] = useState(false);
  const [neighborhoodRankFeatures, setNeighborhoodRankFeatures] = useState([]);
  const [resilienceRankOrder, setResilienceRankOrder] = useState("desc");
  const [resilienceDistrictOptions, setResilienceDistrictOptions] = useState([]);
  const [resilienceDistrictId, setResilienceDistrictId] = useState("");

  // --- REFS ---
  const mahalleDataRef = useRef(null);
  const mahalleRequestRef = useRef(null);
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
      .sort((a, b) => {
        const scoreDifference = Number(a.properties?.resilience_score || 0) - Number(b.properties?.resilience_score || 0);
        return resilienceRankOrder === "asc" ? scoreDifference : -scoreDifference;
      });
  }, [neighborhoodRankFeatures, resilienceRankOrder]);

  useEffect(() => {
    viewportVisibilityRef.current = {
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
      "mahalleler": mahalleVisible,
    };
  }, [
    mahalleVisible,
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

  const loadRegionSummary = async (level = "district", map = mapRef.current, districtId = "") => {
    const cacheKey = districtId ? `${level}:${districtId}` : level;
    const cached = regionSummaryRef.current[cacheKey];
    if (cached) {
      setRegionSummarySource(level, cached, map);
      if (level === "neighborhood") setNeighborhoodRankFeatures(cached.features || []);
      return cached;
    }

    const apiLevel = level === "neighborhood" ? "mahalle" : level;
    const districtQuery = districtId ? `&district_id=${encodeURIComponent(districtId)}` : "";
    const res = await fetch(`${API_URL}/analysis/region-summary?level=${apiLevel}${districtQuery}`);
    if (!res.ok) throw new Error("Region summary yuklenemedi");

    const data = await res.json();
    regionSummaryRef.current[cacheKey] = data;
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

  const calculateSelectedMahalleScore = async () => {
    if (!selectedMahalle || mahalleScoreLoading) return;
    setMahalleScoreLoading(true);
    const startedAt = Date.now();
    try {
      const response = await fetch(
        `${API_URL}/analysis/region-detail?level=${selectedMahalle.level || "mahalle"}&region_id=${encodeURIComponent(selectedMahalle.id)}`
      );
      if (!response.ok) throw new Error("Skor bulunamadı");
      const properties = await response.json();
      const remainingDelay = Math.max(0, 1000 - (Date.now() - startedAt));
      if (remainingDelay) await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
      setSelectedRegionSummary(properties);
      setSelectedMahalle(null);
    } catch {
      window.alert("Bu bölge için hazır skor alınamadı. Lütfen tekrar deneyin.");
    } finally {
      setMahalleScoreLoading(false);
    }
  };


  const loadAssemblyScenario = async (mahalleId) => {
    if (!mahalleId) return;
    setAssemblyScenarioLoading(true);
    setSelectedAssemblyScenario(null);
    try {
      const response = await fetch(`${API_URL}/analysis/oneri-toplanma-ozet/${encodeURIComponent(mahalleId)}`);
      if (!response.ok) throw new Error("Senaryo özeti bulunamadı");
      setSelectedAssemblyScenario(await response.json());
    } catch {
      setSelectedAssemblyScenario(null);
    } finally {
      setAssemblyScenarioLoading(false);
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


  const loadEmergencyPage = async (page = emergencyPage, category = emergencyCategory) => {
    setEmergencyPageLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "10" });
      if (category !== "Tümü") params.set("category", category);
      const res = await fetch(`${API_URL}/layers/acil-durum-sayfa?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const normalized = normalizeEmergencyGeojson({ type: "FeatureCollection", features: data.features || [] });
      setEmergencyPageFeatures(normalized.features || []);
      setEmergencyPageTotal(Number(data.total || 0));
      setEmergencyOverallTotal(Number(data.overall_total || 0));
      setEmergencyPanelCategories(["Tümü", ...(data.categories || [])]);
    } catch {
      /* sessiz hata */
    } finally {
      setEmergencyPageLoading(false);
    }
  };

  const loadEmergencySummary = async () => {
    try {
      const res = await fetch(`${API_URL}/layers/acil-durum-ozet`);
      if (!res.ok) return;
      const data = await res.json();
      setEmergencySummary({
        total: Number(data.total || 0),
        categories: Array.isArray(data.categories) ? data.categories : [],
        last_updated: data.last_updated || null,
      });
    } catch {
      /* sessiz hata */
    }
  };

  const loadMahalleData = async (map = mapRef.current) => {
    if (!map) return EMPTY_FC;
    mahalleRequestRef.current?.abort();
    const controller = new AbortController();
    mahalleRequestRef.current = controller;
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bbox = [sw.lng, sw.lat, ne.lng, ne.lat].map((value) => value.toFixed(6)).join(",");
    const detail = map.getZoom() < MAHALLE_DETAIL_ZOOM ? "overview" : "detailed";

    try {
      const res = await fetch(`${API_URL}/mahalleler?bbox=${bbox}&detail=${detail}`, { signal: controller.signal });
      if (!res.ok) return EMPTY_FC;
      const data = await res.json();
      if (mahalleRequestRef.current === controller) {
        mahalleDataRef.current = data.features || [];
        map.getSource("mahalleler")?.setData(data);
      }
      return data;
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("Mahalle katmanı yüklenemedi", error);
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

  // 31 ilçe poligonu küçük olduğu için kullanıcı tıklamadan arka planda hazırlarız.
  // Böylece analiz düğmesi ilk kullanımda bekletmez.
  const loadSocioGeologicalRiskLayer = async () => {
    if (loadedLayersRef.current["socio-geological-risk"]) return;
    try {
      const res = await fetch(`${API_URL}/layers/sosyo-ekonomik-jeolojik-tehlike`);
      if (!res.ok) return;
      const data = await res.json();
      mapRef.current?.getSource("socio-geological-risk")?.setData(data);
      loadedLayersRef.current["socio-geological-risk"] = true;
    } catch {
      /* Arka plan hazırlığı başarısız olsa bile kullanıcı düğmesi normal şekilde tekrar dener. */
    }
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

  // Katmanlar panelindeki tüm temel harita katmanlarını tek seferde gizler.
  const closeAllLayers = () => {
    [
      setLayerVisible, setMahalleVisible, setToplanmaVisible,
      setFaultVisible, setSinkholeVisible, setFacilityVisible,
      setRoadVisible, setEmergencyVisible, setProvinceBoundaryVisible,
      setParksVisible, setLawVisible, setHealthPointVisible,
      setHealthAreaVisible, setTransitPointVisible, setTransitAreaVisible,
      setBuildingsVisible,
    ].forEach((setVisible) => setVisible(false));
    setOpenLayerGroup(null);
    const map = mapRef.current;
    if (map?.getLayer("emergency-points-circle")) {
      map.setLayoutProperty("emergency-points-circle", "visibility", "none");
    }
  };

  // --- MAHALLE RANK FONKSIYONU ---

  useEffect(() => {
    if (activeSideTab !== "events" || !eventsPanelOpen) return;
    loadEmergencySummary();
    if (emergencyDetailsOpen) loadEmergencyPage(emergencyPage, emergencyCategory);
  }, [activeSideTab, eventsPanelOpen, emergencyDetailsOpen, emergencyPage, emergencyCategory]);

  useEffect(() => {
    if (activeSideTab !== "resilience" || resilienceDistrictOptions.length) return;
    fetch(`${API_URL}/analysis/resilience-district-options`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => setResilienceDistrictOptions(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [activeSideTab, resilienceDistrictOptions.length]);

  useEffect(() => {
    if (activeSideTab !== "resilience" || !resilienceDistrictId) {
      setNeighborhoodRankFeatures([]);
      return;
    }
    loadRegionSummary("neighborhood", mapRef.current, resilienceDistrictId)
      .then((data) => setNeighborhoodRankFeatures(data.features || []))
      .catch(() => setNeighborhoodRankFeatures([]));
  }, [activeSideTab, resilienceDistrictId]);

  useEffect(() => {
    const secondStep = window.setTimeout(() => setLoadingStep(1), LOADING_STEP_DELAY_MS);
    const thirdStep = window.setTimeout(() => setLoadingStep(2), LOADING_STEP_DELAY_MS * 2);
    // Harita beklenmedik biçimde yüklenmezse açılış ekranı en fazla 25 saniye kalır.
    const fallbackTimer = window.setTimeout(() => setMapReady(true), 25000);
    return () => {
      window.clearTimeout(secondStep);
      window.clearTimeout(thirdStep);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || loadingStep < 2) return;
    const closeTimer = window.setTimeout(() => setAppLoading(false), 350);
    return () => window.clearTimeout(closeTimer);
  }, [mapReady, loadingStep]);

  useEffect(() => {
    if (!guideOpen || guideStep < 0) {
      setGuideTargetRect(null);
      return;
    }
    const updateTarget = () => {
      const item = document.querySelector(USER_GUIDE_STEPS[guideStep]?.selector);
      if (!item) return setGuideTargetRect(null);
      const rect = item.getBoundingClientRect();
      setGuideTargetRect({ left: Math.max(4, rect.left - 6), top: Math.max(4, rect.top - 6), width: rect.width + 12, height: rect.height + 12 });
    };
    requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    return () => window.removeEventListener("resize", updateTarget);
  }, [guideOpen, guideStep]);

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
      // Açılış görünümü: Konya ilini eğimli, perspektif bir genel bakışla gösterir.
      center: [32.55, 37.87],
      zoom: 7.05,
      pitch: 55,
      bearing: -18,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl());
    const updateScale = () => {
      const centerLatitude = map.getCenter().lat;
      const resolutionMPerPixel = (156543.03392804097 * Math.cos(centerLatitude * Math.PI / 180)) / Math.pow(2, map.getZoom() + 1);
      const scale = Math.max(1, Math.round(resolutionMPerPixel * 96 * 39.3701));
      setMapStatus((previous) => ({ ...previous, scale: `1:${scale.toLocaleString("tr-TR")}` }));
    };
    const updateCoordinate = (lngLat) => {
      setMapStatus((previous) => ({
        ...previous,
        coordinate: `${Number(lngLat.lng).toFixed(5)}, ${Number(lngLat.lat).toFixed(5)}`,
      }));
    };
    // Koordinat fare/parmak konumuyla değişir; ölçek yalnızca zoom sonunda yenilenir.
    map.on("mousemove", (event) => updateCoordinate(event.lngLat));
    map.on("zoomend", updateScale);
    updateCoordinate(map.getCenter());
    updateScale();
    let viewportReloadTimer = null;
    let mahalleReloadTimer = null;

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
      addSrc("recommended-assembly-parks", { type: "geojson", data: EMPTY_FC });
      addSrc("socio-geological-risk", { type: "geojson", data: EMPTY_FC });
      // Temel harita görünür olduktan kısa süre sonra katmanı önbelleğe al.
      window.setTimeout(() => { loadSocioGeologicalRiskLayer(); }, 900);
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
  minzoom: 14,
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
      addSrc("major-roads", { type: "vector", tiles: [`${API_URL}/tiles/ana-yollar/{z}/{x}/{y}.pbf`], minzoom: 11, maxzoom: 16 });
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

  minzoom: 14,

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
      addLyr({ id: "sinkholes-fill", type: "fill", source: "sinkholes", layout: { visibility: "none" }, paint: { "fill-color": "#a16207", "fill-opacity": 0.30 } });
      addLyr({ id: "sinkholes-outline", type: "line", source: "sinkholes", layout: { visibility: "none" }, paint: { "line-color": "#78350f", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 13, 2.2], "line-opacity": 0.95 } });
      addLyr({ id: "critical-facilities-point", type: "circle", source: "critical-facilities", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#64748b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.88 } });
      addLyr({ id: "major-roads-line", type: "line", source: "major-roads", "source-layer": "roads", minzoom: 11, layout: { visibility: "none" }, paint: { "line-color": "#64748b", "line-opacity": 0.58, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 15, 2.4] } });
      addLyr({ id: "province-boundary-line", type: "line", source: "province-boundary", layout: { visibility: "none" }, paint: { "line-color": "#0f172a", "line-opacity": 0.86, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.3, 12, 3] } });
      addLyr({ id: "parks-fill", type: "fill", source: "parks", layout: { visibility: "none" }, paint: { "fill-color": "#22c55e", "fill-opacity": 0.24 } });
      addLyr({ id: "parks-outline", type: "line", source: "parks", layout: { visibility: "none" }, paint: { "line-color": "#15803d", "line-width": 0.8, "line-opacity": 0.8 } });
      addLyr({ id: "recommended-assembly-parks-fill", type: "fill", source: "recommended-assembly-parks", layout: { visibility: "none" }, paint: { "fill-color": "#f59e0b", "fill-opacity": 0.32 } });
      addLyr({ id: "recommended-assembly-parks-outline", type: "line", source: "recommended-assembly-parks", layout: { visibility: "none" }, paint: { "line-color": "#b45309", "line-width": 1.2, "line-opacity": 0.9 } });
      addLyr({ id: "socio-geological-risk-fill", type: "fill", source: "socio-geological-risk", layout: { visibility: "none" }, paint: { "fill-color": ["step", ["coalesce", ["to-number", ["get", "toplam_risk"]], 0], "#15803d", 6, "#eab308", 7, "#f97316", 9, "#dc2626"], "fill-opacity": 0.46 } });
      addLyr({ id: "socio-geological-risk-outline", type: "line", source: "socio-geological-risk", layout: { visibility: "none" }, paint: { "line-color": "#7f1d1d", "line-width": 1.35, "line-opacity": 0.84 } });
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
        const properties = e.features?.[0]?.properties || {};
        setSelectedRegionSummary(null);
        setSelectedMahalle({ id: properties.id, name: properties.name || "İlçe", level: "district" });
      });
      map.on("click", "resilience-district-fill", (e) => {
        setSelectedRegionSummary(e.features[0].properties);
      });

      const toplanmaPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 10, maxWidth: "280px" });
      const escapePopupHtml = (value) => String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      const assemblyFieldLabels = {
        id: "Kayıt No", name: "Adı", ad: "Adı", adi: "Adı", alan_adi: "Alan adı",
        adres: "Adres", mahalle: "Mahalle", ilce: "İlçe", ilçe: "İlçe",
        kapasite: "Kapasite", capacity: "Kapasite", aciklama: "Açıklama", açıklama: "Açıklama"
      };
      map.on("mouseenter", "toplanma-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "toplanma-points", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", "toplanma-points", (e) => {
        const properties = e.features?.[0]?.properties || {};
        const title = properties.name || properties.ad || properties.adi || properties.alan_adi || "Acil Toplanma Alanı";
        const rows = Object.entries(properties)
          .filter(([key, value]) => value !== null && value !== "" && !["geom", "geometry", "name", "ad", "adi", "alan_adi"].includes(key))
          .slice(0, 6)
          .map(([key, value]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-top:1px solid #e2e8f0"><span style="color:#64748b">${escapePopupHtml(assemblyFieldLabels[key] || key.replaceAll("_", " "))}</span><strong style="text-align:right;color:#0f172a">${escapePopupHtml(value)}</strong></div>`)
          .join("");
        toplanmaPopup
          .setLngLat(e.lngLat)
          .setHTML(`<div style="min-width:190px;font-family:Arial,sans-serif"><div style="color:#15803d;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px">Acil toplanma alanı</div><div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px">${escapePopupHtml(title)}</div>${rows || '<div style="font-size:12px;color:#64748b">Bu alan için ek kayıt bilgisi bulunmuyor.</div>'}</div>`)
          .addTo(map);
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
        const properties = e.features?.[0]?.properties || {};
        setSelectedRegionSummary(null);
        setSelectedMahalle({ id: properties.id, name: properties.adi_numara || properties.ADI_NUMARA || "Mahalle", level: "mahalle" });
        loadAssemblyScenario(properties.id);
      });
      map.on("click", "resilience-neighborhood-fill", (e) => {
        const properties = e.features[0].properties || {};
        setSelectedRegionSummary(properties);
        loadAssemblyScenario(properties.region_id || properties.id);
      });

      loadEmergencyData(map);
      loadRegionSummary("district", map).catch(() => {});

      map.setLayoutProperty("district-outline", "visibility", "visible");
      map.setLayoutProperty("district-fill", "visibility", "visible");
      map.setLayoutProperty("mahalle-fill", "visibility", "none");
      map.setLayoutProperty("mahalle-outline", "visibility", "none");
      map.setLayoutProperty("toplanma-points", "visibility", "visible");

      const viewportSourcePaths = [


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
      map.on("moveend", () => {
        if (!viewportVisibilityRef.current["mahalleler"]) return;
        window.clearTimeout(mahalleReloadTimer);
        mahalleReloadTimer = window.setTimeout(() => loadMahalleData(map).catch(() => {}), 250);
      });
reloadViewportSources();
      requestAnimationFrame(() => {

  requestAnimationFrame(() => {

    setMapReady(true);

  });

});
    });

    return () => {

      window.clearTimeout(viewportReloadTimer);
      window.clearTimeout(mahalleReloadTimer);
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

useEffect(() => {
  const map = mapRef.current;
  if (!map?.getLayer("major-roads-line")) return;
  map.setLayoutProperty("major-roads-line", "visibility", roadVisible ? "visible" : "none");
}, [roadVisible]);

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

  const clearEmergencyOverlay = () => {
    const map = mapRef.current;
    if (!map) return;
    ["emergency-heatmap", "emergency-points-circle"].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    });
    setSelectedEmergencyId(null);
  };

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
      <button className="map-home-button" title="Başlangıç görünümüne dön" aria-label="Başlangıç görünümüne dön"
        onClick={() => mapRef.current?.flyTo({ center: [32.55, 37.87], zoom: 7.05, pitch: 55, bearing: -18, duration: 1200 })}>
        ⌂
      </button>
      <div className="map-status-bar" aria-label="Harita koordinat ve ölçek bilgisi">
        <span>Koordinat <strong>{mapStatus.coordinate}</strong></span>
        <span className="map-status-divider" />
        <span>Ölçek <strong>{mapStatus.scale}</strong></span>
      </div>

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
      {[
        "Harita hazırlanıyor...",
        "Veriler yükleniyor...",
        "Analizler yükleniyor...",
      ].map((message, index) => {
        const visible = loadingStep >= index;
        return <div key={message} style={{
          display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px",
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 350ms ease, transform 350ms ease",
        }}>
          <span style={{ color: visible && loadingStep > index ? "#86efac" : "#c4b5fd", fontSize: "15px" }}>
            {visible && loadingStep > index ? "✓" : "•"}
          </span>
          <span>{message}</span>
        </div>;
      })}
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

      <div className="app-header" style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "72px",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.18)",
        display: "flex", alignItems: "center", padding: "0 28px",
        zIndex: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)"
      }}>
        <div className="app-brand" style={{ display: "flex", flexDirection: "column" }}>
          <div className="app-logo" style={{ fontSize: "34px", fontWeight: "800", fontStyle: "italic", letterSpacing: "1px", display: "flex", alignItems: "center" }}>
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
          <span className="app-subtitle" style={{ color: "#94a3b8", fontSize: "13px", marginTop: "-2px" }}>Acil Durumda Koruma ve İzleme Sistemi</span>
        </div>

        <div className="neighborhood-search" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
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

              const found = mahalleDataRef.current?.find((m) => normalizeSearchText(m.properties.adi_numara).includes(normalizeSearchText(searchText)));
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
        <div className="team-badge" title="OpenGIS Türkiye Ekibi" style={{
  position: "absolute",
  right: "80px",
  top: "10px",
  width: "104px",
  height: "52px",
  display: "flex",
  alignItems: "center",
  background: "transparent",
  border: "none",
  boxShadow: "none"
}}>
  <img src="/opengis-turkiye.png" alt="OpenGIS Türkiye" style={{ width: "52px", height: "52px", objectFit: "contain", display: "block" }} />
  <span className="opengis-team-label" style={{
    alignSelf: "flex-end",
    marginLeft: "-14px",
    marginBottom: "1.5px",
    color: "#e59a00",
    fontFamily: "Arial, sans-serif",
    fontSize: "5.5px",
    lineHeight: 1,
    fontWeight: "700",
    letterSpacing: "0.02em"
  }}>EKİBİ</span>
</div>
      </div>

      {selectedMahalle && (
        <div className="region-summary-card" style={{
          position: "absolute", top: 438, left: 350, width: "210px", height: "104px", padding: "10px 12px",
          borderRadius: "18px", zIndex: 55, color: "#fff7f7",
          background: "linear-gradient(135deg, rgba(185,28,28,0.76), rgba(127,29,29,0.66))",
          border: "1px solid rgba(254,202,202,0.46)", backdropFilter: "blur(22px) saturate(150%)",
          boxShadow: "0 18px 44px rgba(127,29,29,0.30)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
            <div><div style={{ color: "#fee2e2", fontSize: "11px", fontWeight: "800", letterSpacing: "0.07em" }}>{selectedMahalle.level === "district" ? "İLÇE ANALİZİ" : "MAHALLE ANALİZİ"}</div><div style={{ fontSize: "14px", fontWeight: "900", marginTop: "2px" }}>{selectedMahalle.name}</div></div>
            <button onClick={() => setSelectedMahalle(null)} style={{ border: "none", background: "transparent", color: "#fecaca", cursor: "pointer", fontSize: "17px", padding: "0 2px" }}>×</button>
          </div>
          <p style={{ margin: "0 0 7px", color: "#fee2e2", fontSize: "11px", lineHeight: 1.35 }}>{selectedMahalle.level === "district" ? "İlçenin afet dirençlilik göstergelerini görmek için skoru hesaplayın." : "Mahallenin afet dirençlilik göstergelerini görmek için skoru hesaplayın."}</p>
          <button onClick={calculateSelectedMahalleScore} disabled={mahalleScoreLoading} style={{ width: "100%", border: "none", cursor: mahalleScoreLoading ? "wait" : "pointer", borderRadius: "9px", padding: "7px 10px", background: mahalleScoreLoading ? "rgba(254,202,202,0.62)" : "rgba(255,255,255,0.92)", color: mahalleScoreLoading ? "#7f1d1d" : "#991b1b", fontWeight: "800", fontSize: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {mahalleScoreLoading ? "Hesaplanıyor…" : "Skoru Hesapla"}
          </button>
        </div>
      )}

      {selectedRegionSummary && (
        <div className="region-summary-card" style={{
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
  color: "#475569",
  marginBottom: "4px",
  letterSpacing: "0.4px",
  textTransform: "uppercase",
  fontWeight: "800"
}}>{label}</div>
                <div style={{ fontSize: "12px", fontWeight: "700" }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resilienceRankingHelpOpen && <div style={{ position: "fixed", inset: 0, zIndex: 31, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15,23,42,0.32)", backdropFilter: "blur(4px)" }} onClick={() => setResilienceRankingHelpOpen(false)}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(390px, 100%)", borderRadius: "18px", padding: "20px", background: "rgba(255,255,255,0.98)", color: "#0f172a", boxShadow: "0 20px 55px rgba(15,23,42,0.25)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
            <div><div style={{ color: "#0f766e", fontSize: "11px", fontWeight: "800", letterSpacing: ".05em", textTransform: "uppercase" }}>Mahalle görünümü</div><div style={{ marginTop: "4px", fontSize: "18px", fontWeight: "800" }}>Sıralamayı haritada gör</div></div>
            <button onClick={() => setResilienceRankingHelpOpen(false)} aria-label="Bilgi panelini kapat" style={{ width: "32px", height: "32px", borderRadius: "9px", border: "none", cursor: "pointer", background: "#f1f5f9", color: "#475569", fontSize: "19px" }}>×</button>
          </div>
          <p style={{ margin: "0 0 14px", color: "#475569", fontSize: "13px", lineHeight: 1.55 }}>Mahalle dirençlilik sıralamasını haritada görmek ve bir mahalleye tıklayarak ayrıntısına ulaşmak için:</p>
          <ol style={{ margin: 0, paddingLeft: "20px", color: "#334155", fontSize: "13px", lineHeight: 1.8 }}>
            <li>Soldaki <strong>Katmanlar</strong> başlığını aç.</li>
            <li><strong>Sınırlar ve Bölgeler</strong> grubunu aç.</li>
            <li><strong>Mahalle Sınırları</strong> katmanını etkinleştir.</li>
          </ol>
          <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px", background: "#ecfdf5", color: "#166534", fontSize: "12px", lineHeight: 1.45 }}>Sağdaki liste mahalleleri puana göre sıralar; katmanı açtığında aynı mahalleleri harita üzerinde de inceleyebilirsin.</div>
        </div>
      </div>}

      <div className={`side-events-panel ${eventsPanelOpen ? "is-open" : ""}`} style={{
        position: "absolute", top: 90, right: 30,
        width: "340px", maxHeight: "calc(100vh - 120px)",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.18)", borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 10,
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        <div onClick={() => { if (window.innerWidth <= 768) setEventsPanelOpen((open) => !open); }}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)", cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "16px", fontWeight: "700" }}>
            <span>{activeSideTab === "events" ? "Acil Olaylar Sınıflandırması" : "Dirençlilik Sıralaması"}</span>
            {activeSideTab === "resilience" && <button onClick={(e) => { e.stopPropagation(); setResilienceRankingHelpOpen(true); }} title="Mahalle sıralamasını nasıl görüntüleyeceğini göster" style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>ⓘ</button>}
          </div>
{activeSideTab === "events" && eventsPanelOpen && <button className="clear-emergency-overlay-button" onClick={(e) => { e.stopPropagation(); clearEmergencyOverlay(); }}
            title="Olay yoğunluğunu ve olay noktalarını haritadan kaldır"
            style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(239,68,68,0.28)", borderRadius: "8px", color: "#b91c1c", cursor: "pointer", fontSize: "10px", fontWeight: "700", padding: "5px 7px", lineHeight: "1.2", textAlign: "center", width: "100px", marginLeft: "auto", marginRight: "6px" }}>
            Acil Olaylar<br />Isı Haritasını Kaldır
          </button>}
          <button onClick={(e) => { e.stopPropagation(); setEventsPanelOpen((open) => !open); }} aria-label={eventsPanelOpen ? "Paneli kapat" : "Paneli aç"}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "18px", color: "#64748b", padding: "6px", lineHeight: 1 }}>
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
              emergencyDetailsOpen ? <>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", background: "#fff7ed", color: "#c2410c", borderRadius: "999px", padding: "5px 9px" }}>
                    {emergencyPageTotal} kayıt
                  </span>
                  <select value={emergencyCategory} onChange={(e) => { setEmergencyCategory(e.target.value); setEmergencyPage(1); }}
                    style={{ fontSize: "12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "5px 8px", background: "rgba(255,255,255,0.14)", cursor: "pointer" }}>
                    {emergencyPanelCategories.map((c) => <option key={c} value={c}>{c}</option>)}
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
  Toplam: {emergencyOverallTotal}
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




  {emergencyPageFeatures.map((f, i) => (
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


                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", padding: "8px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.16)" }}>
                  <button onClick={() => setEmergencyPage((p) => Math.max(1, p - 1))} disabled={emergencyPage <= 1 || emergencyPageLoading}
                    style={{ border: "1px solid rgba(148,163,184,0.45)", background: "rgba(255,255,255,0.62)", borderRadius: "8px", padding: "6px 9px", fontSize: "11px", fontWeight: "700", cursor: emergencyPage <= 1 ? "not-allowed" : "pointer", opacity: emergencyPage <= 1 ? 0.42 : 1 }}>Önceki 10</button>
                  <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>{emergencyPageLoading ? "Yükleniyor…" : `${emergencyPage}. sayfa`}</span>
                  <button onClick={() => setEmergencyPage((p) => p + 1)} disabled={emergencyPage * 10 >= emergencyPageTotal || emergencyPageLoading}
                    style={{ border: "1px solid rgba(148,163,184,0.45)", background: "rgba(255,255,255,0.62)", borderRadius: "8px", padding: "6px 9px", fontSize: "11px", fontWeight: "700", cursor: emergencyPage * 10 >= emergencyPageTotal ? "not-allowed" : "pointer", opacity: emergencyPage * 10 >= emergencyPageTotal ? 0.42 : 1 }}>Sonraki 10</button>
                </div>
              </> : (
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ padding: "18px 12px", textAlign: "center", borderRadius: "12px", background: "linear-gradient(135deg, rgba(254,242,242,0.90), rgba(255,255,255,0.62))", border: "1px solid rgba(239,68,68,0.16)" }}>
                    <div style={{ color: "#64748b", fontSize: "11px", fontWeight: "700", marginBottom: "4px" }}>TOPLAM ACİL OLAY</div>
                    <div style={{ color: "#dc2626", fontSize: "34px", lineHeight: 1, fontWeight: "800" }}>{emergencySummary.total.toLocaleString("tr-TR")}</div>
                    <div style={{ color: "#64748b", fontSize: "11px", marginTop: "7px" }}>Tüm kategoriler</div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: "800", letterSpacing: "0.04em" }}>KATEGORİ DAĞILIMI</div>
                  <div style={{ display: "grid", gap: "6px" }}>
                    {emergencySummary.categories.slice(0, 6).map((item) => (
                      <div key={item.category} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: "9px", background: "rgba(255,255,255,0.52)", border: "1px solid rgba(148,163,184,0.16)" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: emergencyCategoryColors[item.category] || "#475569" }}>{item.category}</span>
                        <strong style={{ fontSize: "13px", color: "#0f172a" }}>{Number(item.count || 0).toLocaleString("tr-TR")}</strong>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "auto", color: "#64748b", fontSize: "10px" }}>
                    Son güncelleme: {emergencySummary.last_updated ? new Date(emergencySummary.last_updated).toLocaleString("tr-TR") : "—"}
                  </div>
                  <button onClick={() => { setEmergencyPage(1); setEmergencyCategory("Tümü"); setEmergencyDetailsOpen(true); }}
                    style={{ marginTop: "2px", border: "none", borderRadius: "9px", padding: "10px", cursor: "pointer", background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "white", fontSize: "12px", fontWeight: "800", boxShadow: "0 5px 14px rgba(220,38,38,0.22)" }}>
                    Detay Gör →
                  </button>
                </div>
              )
            ) : (
              <>
                <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "7px 10px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#0f766e", fontWeight: "800" }}>{resilienceDistrictId ? `${rankedNeighborhoods.length} mahalle` : "İlçe seçin"}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>{resilienceDistrictId ? (resilienceRankOrder === "desc" ? "En yüksek dirençlilik skoruna göre" : "En düşük dirençlilik skoruna göre") : "Mahalle sıralamasını hızlı getirmek için"}</div>
                  </div>
                  <select value={resilienceRankOrder} onChange={(e) => setResilienceRankOrder(e.target.value)} disabled={!resilienceDistrictId} aria-label="Dirençlilik sıralama yönü"
                    style={{ flexShrink: 0, fontSize: "10px", fontWeight: "700", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "6px", background: "rgba(255,255,255,0.85)", cursor: resilienceDistrictId ? "pointer" : "not-allowed", opacity: resilienceDistrictId ? 1 : 0.48 }}>
                    <option value="desc">Yüksek → Düşük</option>
                    <option value="asc">Düşük → Yüksek</option>
                  </select>
                  <select value={resilienceDistrictId} onChange={(e) => setResilienceDistrictId(e.target.value)} aria-label="İlçe seç"
                    style={{ gridColumn: "1 / -1", width: "100%", fontSize: "11px", fontWeight: "700", color: "#334155", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "7px 8px", background: "rgba(255,255,255,0.85)", cursor: "pointer" }}>
                    <option value="">İlçe seçin…</option>
                    {resilienceDistrictOptions.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", display: "grid", gap: "6px" }}>
                  {!resilienceDistrictId ? (
                    <div style={{ padding: "20px 12px", textAlign: "center", color: "#64748b", fontSize: "12px", lineHeight: 1.55 }}>Bir ilçe seçtiğinde yalnızca o ilçenin mahalleleri yüklenir.</div>
                  ) : rankedNeighborhoods.map((f, i) => {
                    const p = f.properties || {};
                    return (
                      <button key={`${p.region_name}-${i}`} onClick={() => focusRankedRegion(f)}
                        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", padding: "10px", textAlign: "left", cursor: "pointer", display: "grid", gridTemplateColumns: "28px 36px 1fr 36px", alignItems: "center", gap: "8px" }}>
                        <span style={{ background: "#eef4ff", color: "#24579f", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800" }}>{i + 1}</span>
                        <ScoreGauge score={p.resilience_score} compact />
                        <div><div style={{ fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.region_name}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{p.resilience_level}</div></div>
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

      <div className={`layers-panel ${layersPanelOpen ? "is-open" : ""}`} style={{
        position: "absolute", top: 110, left: 22, width: "230px", height: layersPanelOpen ? "300px" : "auto",
        overflowY: layersPanelOpen ? "auto" : "hidden", padding: "12px", borderRadius: "16px",
        background: "rgba(255,255,255,0.12)", backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        zIndex: 10, scrollbarWidth: "thin"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <button onClick={() => setLayersPanelOpen((open) => !open)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", color: "inherit", border: "none", cursor: "pointer", padding: 0, fontSize: "14px", fontWeight: "700" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "#64748b", flexShrink: 0 }}>
                <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="m5.5 11.2 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m5.5 15.2 6.5 3.5 6.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Katmanlar
            </span>
            <span style={{ fontSize: "16px", color: "#64748b" }}>{layersPanelOpen ? "▲" : "▼"}</span>
          </button>
          {layersPanelOpen && <button onClick={closeAllLayers} title="Haritadaki tüm katmanları kapat"
            style={{ border: "1px solid rgba(239,68,68,0.32)", borderRadius: "7px", background: "rgba(255,255,255,0.58)", color: "#b91c1c", cursor: "pointer", fontSize: "10px", fontWeight: "700", padding: "5px 7px", whiteSpace: "nowrap" }}>
            Tümünü kapat
          </button>}
        </div>
        {layersPanelOpen && <>
        {[
          {
            id: "boundaries", title: "Sınırlar ve Bölgeler", items: [
              { label: "İl Sınırı", color: "#0f172a", checked: provinceBoundaryVisible, type: "line", onChange: () => toggleDataLayer(!provinceBoundaryVisible, setProvinceBoundaryVisible, "province-boundary", ["province-boundary-line"], "/layers/il-siniri") },
              { label: "İlçe Sınırları", color: "#ef4444", checked: layerVisible, type: "line", opacity: districtOpacity, onOpacity: setDistrictOpacity, onChange: () => setLayerVisible((v) => !v) },
              { label: "Mahalle Sınırları", color: "#2563eb", checked: mahalleVisible, type: "line", opacity: mahalleOpacity, onOpacity: setMahalleOpacity, onChange: () => setMahalleVisible((v) => !v) },
            ]
          },
          {
            id: "risk", title: "Afet Riski", items: [
              { label: "Fay Hatları", color: "#dc2626", checked: faultVisible, type: "line", onChange: () => toggleDataLayer(!faultVisible, setFaultVisible, "fault-lines", ["fault-lines-line"], "/layers/fay-hatlari") },
              { label: "Obruklar", color: "#a16207", checked: sinkholeVisible, type: "area", onChange: () => toggleDataLayer(!sinkholeVisible, setSinkholeVisible, "sinkholes", ["sinkholes-fill", "sinkholes-outline"], "/layers/obruklar") },
            ]
          },
          {
            id: "emergency", title: "Acil Durum ve Hizmetler", items: [
              { label: "Toplanma Alanları", color: "#16a34a", checked: toplanmaVisible, type: "point", opacity: toplanmaOpacity, onOpacity: setToplanmaOpacity, onChange: () => setToplanmaVisible((v) => !v) },
              { label: "Acil Durum Noktaları", color: "#f97316", checked: emergencyVisible, type: "point", onChange: async () => { const next = !emergencyVisible; setEmergencyVisible(next); if (next) await loadEmergencyData(); mapRef.current?.setLayoutProperty("emergency-points-circle", "visibility", next ? "visible" : "none"); } },
              { label: "Kritik Tesisler", color: "#64748b", checked: facilityVisible, type: "point", onChange: () => toggleDataLayer(!facilityVisible, setFacilityVisible, "critical-facilities", ["critical-facilities-point"], "/layers/kritik-tesisler") },
              { label: "Kolluk", color: "#2563eb", checked: lawVisible, type: "point", onChange: () => toggleDataLayer(!lawVisible, setLawVisible, "law-enforcement", ["law-enforcement-point"], "/layers/kolluk") },
              { label: "Sağlık Noktaları", color: "#0891b2", checked: healthPointVisible, type: "point", onChange: () => toggleDataLayer(!healthPointVisible, setHealthPointVisible, "health-points", ["health-points-point"], "/layers/saglik-nokta") },
              { label: "Sağlık Alanları", color: "#06b6d4", checked: healthAreaVisible, type: "point", onChange: () => toggleDataLayer(!healthAreaVisible, setHealthAreaVisible, "health-areas", ["health-areas-fill", "health-areas-outline"], "/layers/saglik-alan") },
            ]
          },
          {
            id: "transport", title: "Ulaşım", items: [
              { label: "Ana Yollar", color: "#64748b", checked: roadVisible, type: "line", onChange: () => setRoadVisible((v) => !v) },
              { label: "Toplu Ulaşım Noktaları", color: "#9333ea", checked: transitPointVisible, type: "point", onChange: () => toggleDataLayer(!transitPointVisible, setTransitPointVisible, "transit-points", ["transit-points-point"], "/layers/toplu-ulasim-nokta") },
              { label: "Toplu Ulaşım Alanları", color: "#a855f7", checked: transitAreaVisible, type: "point", onChange: () => toggleDataLayer(!transitAreaVisible, setTransitAreaVisible, "transit-areas", ["transit-areas-fill", "transit-areas-outline"], "/layers/toplu-ulasim-alan") },
            ]
          },
          {
            id: "urban", title: "Kentsel Doku", items: [
              { label: "Parklar", color: "#22c55e", checked: parksVisible, type: "point", onChange: () => toggleDataLayer(!parksVisible, setParksVisible, "parks", ["parks-fill", "parks-outline"], "/layers/parklar") },
              { label: "3B Binalar", color: "#d1d5db", checked: buildingsVisible, type: "point", opacity: buildingsOpacity, onOpacity: setBuildingsOpacity, onChange: () => setBuildingsVisible((v) => !v) },
            ]
          },
        ].map((group) => {
          const isOpen = openLayerGroup === group.id;
          return <div key={group.id} style={{ marginBottom: "7px", borderRadius: "11px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)" }}>
            <button onClick={() => setOpenLayerGroup(isOpen ? null : group.id)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "rgba(255,255,255,0.07)", color: "inherit", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "700", textAlign: "left" }}>
              <span>{group.title}</span><span style={{ fontSize: "15px" }}>{isOpen ? "⌃" : "⌄"}</span>
            </button>
            {isOpen && <div style={{ padding: "7px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {group.items.map(({ label, color, checked, onChange, type, opacity, onOpacity }) => <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "7px", borderRadius: "9px", background: "rgba(255,255,255,0.07)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}><div style={{ width: type === "point" ? "10px" : "16px", height: type === "point" ? "10px" : "4px", borderRadius: type === "point" ? "50%" : "999px", background: color, flexShrink: 0 }} /><span style={{ fontSize: "12px", fontWeight: "600" }}>{label}</span></div><button onClick={onChange} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "17px", padding: 0 }}>{checked ? "⦿" : "⦸"}</button></div>
                {opacity !== undefined && onOpacity && <input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => onOpacity(Number(e.target.value))} className="koriz-opacity-slider" style={{ "--slider-color": color, "--slider-progress": `${opacity * 100}%`, width: "100%" }} />}
              </div>)}
            </div>}
          </div>;
        })}
        </>}
      </div>


      {resilienceInfoOpen && <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15,23,42,0.42)", backdropFilter: "blur(5px)" }} onClick={() => setResilienceInfoOpen(false)}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "min(720px, calc(100vh - 40px))", overflowY: "auto", borderRadius: "20px", background: "rgba(255,255,255,0.97)", boxShadow: "0 24px 70px rgba(15,23,42,0.28)", padding: "24px", color: "#0f172a" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "16px" }}>
            <div>
              <div style={{ color: "#0f766e", fontSize: "12px", fontWeight: "800", letterSpacing: "0.06em", textTransform: "uppercase" }}>KOR-İZ karar destek göstergesi</div>
              <h2 style={{ margin: "5px 0 0", fontSize: "24px" }}>Afet Dirençlilik Skoru nedir?</h2>
            </div>
            <button onClick={() => setResilienceInfoOpen(false)} aria-label="Bilgi panelini kapat" style={{ border: "none", background: "#f1f5f9", color: "#475569", borderRadius: "10px", cursor: "pointer", fontSize: "21px", width: "36px", height: "36px" }}>×</button>
          </div>

          <p style={{ margin: "0 0 18px", color: "#475569", lineHeight: 1.6, fontSize: "14px" }}>
            Bu puan, bir ilçe ya da mahallenin afetlere karşı <strong>göreli hazırlık durumunu</strong> gösterir. Risk arttıkça puan düşer; toplanma ve müdahale imkânları arttıkça puan yükselir.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "16px" }}>
            <div style={{ border: "1px solid #fecaca", borderRadius: "14px", padding: "15px", background: "#fff7f7" }}>
              <div style={{ color: "#b91c1c", fontWeight: "800", marginBottom: "7px" }}>Risk puanı düşürür</div>
              <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.55 }}>Acil olay yoğunluğu (%45), obruk yoğunluğu (%35) ve fay hattı yoğunluğu (%20) değerlendirilir.</div>
            </div>
            <div style={{ border: "1px solid #bbf7d0", borderRadius: "14px", padding: "15px", background: "#f5fff8" }}>
              <div style={{ color: "#15803d", fontWeight: "800", marginBottom: "7px" }}>Kapasite puanı yükseltir</div>
              <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.55 }}>Toplanma alanı yoğunluğu (%55) ve kritik tesis yoğunluğu (%45) değerlendirilir.</div>
            </div>
          </div>

          <div style={{ borderRadius: "14px", padding: "15px", background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
            <div style={{ fontWeight: "800", marginBottom: "7px" }}>Hesaplama mantığı</div>
            <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
              Her veri önce bölgenin yüzölçümüne bölünür. Böylece büyük ilçeler yalnızca büyüklükleri nedeniyle avantaj ya da dezavantaj almaz. Ardından ilçeler kendi aralarında, mahalleler de kendi aralarında karşılaştırılır ve sonuç 0–100 arasına getirilir.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "9px", marginBottom: "18px" }}>
            {[ ["0–54", "Kritik", "#dc2626"], ["55–74", "Orta", "#f59e0b"], ["75–100", "Güçlü", "#15803d"] ].map(([range, label, color]) => <div key={label} style={{ borderRadius: "12px", padding: "12px", border: `1px solid ${color}33`, textAlign: "center", background: "#fff" }}><div style={{ color, fontWeight: "900", fontSize: "16px" }}>{range}</div><div style={{ color: "#475569", fontSize: "12px", fontWeight: "700" }}>{label}</div></div>)}
          </div>

          <div style={{ fontSize: "12px", lineHeight: 1.55, color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
            Not: Bu skor, mutlak afet güvenliği kararı değil; Konya içindeki bölgeleri karşılaştırmaya yardımcı olan bir karar destek göstergesidir. Ayrıntıları görmek için haritada bir ilçe veya mahalleye tıklayabilirsin.
          </div>
        </div>
      </div>}

{/* Dirençlilik Skoru Paneli */}
      <div className="resilience-score-panel" style={{
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
        <button onClick={() => setResilienceInfoOpen(true)}
          title="Dirençlilik skorunun nasıl hesaplandığını göster"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "6px", background: "transparent", border: "none", padding: 0, marginBottom: "10px", color: "inherit", cursor: "pointer", fontSize: "12px", fontWeight: "600", textAlign: "left" }}>
          <span>Dirençlilik Skoru</span>
          <span style={{ color: "#64748b", fontSize: "13px" }}>ⓘ</span>
        </button>
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

        recommendedAssemblyVisible={recommendedAssemblyVisible}
        socioGeologicalVisible={socioGeologicalVisible}
        onToggleSocioGeological={() => toggleDataLayer(
          !socioGeologicalVisible,
          setSocioGeologicalVisible,
          "socio-geological-risk",
          ["socio-geological-risk-fill", "socio-geological-risk-outline"],
          "/layers/sosyo-ekonomik-jeolojik-tehlike"
        )}
        selectedAssemblyScenario={selectedAssemblyScenario}
        assemblyScenarioLoading={assemblyScenarioLoading}
        onToggleRecommendedAssembly={() => toggleDataLayer(
          !recommendedAssemblyVisible,
          setRecommendedAssemblyVisible,
          "recommended-assembly-parks",
          ["recommended-assembly-parks-fill", "recommended-assembly-parks-outline"],
          "/layers/oneri-toplanma-alanlari"
        )}

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
      <button onClick={() => { setGuideStep(-1); setGuideOpen(true); }} title="Kullanıcı rehberini aç"
        style={{ position: "absolute", right: "18px", bottom: "18px", zIndex: 70, border: "1px solid rgba(255,255,255,0.70)", borderRadius: "999px", background: "rgba(15,23,42,0.82)", color: "white", padding: "8px 11px", cursor: "pointer", fontSize: "11px", fontWeight: "800" }}>
        ? Rehber
      </button>
      {guideOpen && <>
        {guideStep < 0 ? <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.56)", backdropFilter: "blur(3px)" }} /> : guideTargetRect && <div style={{ position: "fixed", left: guideTargetRect.left, top: guideTargetRect.top, width: guideTargetRect.width, height: guideTargetRect.height, zIndex: 1000, borderRadius: "16px", border: "2px solid #f59e0b", boxShadow: "0 0 0 9999px rgba(15,23,42,0.58), 0 0 28px rgba(245,158,11,0.62)", pointerEvents: "none" }} />}
        <div role="dialog" aria-modal="true" style={{ position: "fixed", zIndex: 1001, left: "50%", top: guideStep >= 0 && guideTargetRect && guideTargetRect.top > window.innerHeight / 2 ? "24px" : "auto", bottom: guideStep >= 0 && guideTargetRect && guideTargetRect.top > window.innerHeight / 2 ? "auto" : "24px", transform: "translateX(-50%)", width: "min(370px, calc(100vw - 32px))", maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: "18px", borderRadius: "16px", background: "rgba(255,255,255,0.97)", color: "#0f172a", boxShadow: "0 16px 42px rgba(15,23,42,0.32)" }}>
          {guideStep < 0 ? <>
            <div style={{ color: "#dc2626", fontSize: "11px", fontWeight: "900", letterSpacing: "0.08em" }}>KOR-İZ KULLANICI REHBERİ</div>
            <div style={{ fontSize: "21px", fontWeight: "800", marginTop: "6px" }}>Haritayı 1 dakikada keşfedin</div>
            <p style={{ margin: "9px 0 16px", color: "#475569", fontSize: "13px", lineHeight: 1.55 }}>Katmanları, analizleri, acil olayları ve dirençlilik araçlarını kısa bir görsel turla tanıyın.</p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => { localStorage.setItem("koriz-user-guide-seen", "1"); setGuideOpen(false); }} style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", padding: "8px" }}>Şimdi değil</button>
              <button onClick={() => setGuideStep(0)} style={{ border: "none", borderRadius: "9px", background: "#dc2626", color: "white", cursor: "pointer", padding: "9px 13px", fontWeight: "800" }}>Turu Başlat</button>
            </div>
          </> : <>
            <div style={{ color: "#dc2626", fontSize: "11px", fontWeight: "900" }}>{guideStep + 1} / {USER_GUIDE_STEPS.length}</div>
            <div style={{ fontSize: "19px", fontWeight: "800", marginTop: "5px" }}>{USER_GUIDE_STEPS[guideStep].title}</div>
            <p style={{ margin: "8px 0 16px", color: "#475569", fontSize: "13px", lineHeight: 1.55 }}>{USER_GUIDE_STEPS[guideStep].text}</p>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between" }}>
              <button onClick={() => { localStorage.setItem("koriz-user-guide-seen", "1"); setGuideOpen(false); }} style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", padding: "8px 0" }}>Turu Kapat</button>
              <div style={{ display: "flex", gap: "7px" }}>
                {guideStep > 0 && <button onClick={() => setGuideStep((step) => step - 1)} style={{ border: "1px solid #cbd5e1", borderRadius: "8px", background: "white", color: "#334155", cursor: "pointer", padding: "8px 10px", fontWeight: "700" }}>Geri</button>}
                <button onClick={() => { if (guideStep === USER_GUIDE_STEPS.length - 1) { localStorage.setItem("koriz-user-guide-seen", "1"); setGuideOpen(false); } else setGuideStep((step) => step + 1); }} style={{ border: "none", borderRadius: "8px", background: "#dc2626", color: "white", cursor: "pointer", padding: "8px 11px", fontWeight: "800" }}>{guideStep === USER_GUIDE_STEPS.length - 1 ? "Bitir" : "Sonraki"}</button>
              </div>
            </div>
          </>}
        </div>
      </>}
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

