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
  { selector: ".layers-panel", mobileSelector: ".layers-panel-guide-trigger", title: "Katmanlar", text: "İlçe, mahalle, fay, obruk ve hizmet katmanlarını buradan açıp kapatabilirsin." },
  { selector: ".analysis-panel", title: "Analiz Katmanları", text: "Alt paneli yukarı açarak analiz kartlarına ulaşabilirsin. Rehber, anlatılan kartı senin için otomatik seçer." },
  { selector: ".analysis-panel", analysisPanelDemo: true, title: "Analiz Panelini Açma", text: "Alt kenardaki Analiz Katmanları başlığına bastığında panel yukarı doğru açılır. Rehber şimdi bu hareketi kısa bir turla gösteriyor; ardından analiz kartlarını tek tek tanıtacak." },
  { selector: ".analysis-panel", analysisCardId: "service-area", title: "Toplanma Alanı Erişilebilirliği", text: "5, 10 ve 15 dakikalık yürüme erişimini gösterir. Erişim süresi uzadıkça tahliye ve müdahale planlamasında öncelik artar." },
  { selector: ".analysis-panel", analysisCardId: "logistics", title: "Karapınar Afet Lojistik Analizi", text: "AFAD lojistik üssünden hastane, itfaiye ve toplanma alanlarına en hızlı ve daha güvenli alternatif rotaları karşılaştırır." },
  { selector: ".analysis-panel", analysisCardId: "vulnerability", title: "Sosyo-Ekonomik Kırılganlık ve Jeolojik Tehlike", text: "İlçeleri sosyo-ekonomik yapı, fay uzunluğu ve obruk envanterini birlikte değerlendirerek dört risk derecesinde sınıflar." },
  { selector: ".analysis-panel", analysisCardId: "facility-access", title: "Kritik Tesis Hizmet Yükü", text: "İtfaiye, ASHİ/112 ve hastanelerin nüfus ve yapı stoğu karşısındaki hizmet yükünü gösterir. Yüksek puan, altyapının güçlendirilmesi gereken ilçeleri işaret eder." },
  { selector: ".analysis-panel", analysisCardId: "recommended-assembly", title: "Öneri Toplanma Alanları", text: "Resmî alan değildir. Güvenli park parçalarını, fay-obruk etkisini ve mahalle nüfusunu AFAD odaklı bir ön eleme senaryosunda birleştirir." },
  { selector: ".analysis-panel", analysisCardId: "sinkhole-building", title: "Obruk Yoğunluğu ve Arazi Kullanımı", text: "319 obruk kaydının yoğunluğunu ve ESA WorldCover arazi kullanım dağılımını gösterir. Aynı karttan CORINE katmanını ve Öznitelik Tablosunu açabilirsin." },
  { selector: ".emergency-summary-guide", emergencyOverview: true, title: "Acil Olaylar Özeti", text: "Olaylar sekmesi önce toplam acil olay sayısını ve kategori dağılımını gösterir. Böylece hangi olay türünün öne çıktığını listeyi yüklemeden hızlıca görürsün." },
  { selector: ".emergency-detail-guide", emergencyDetail: true, title: "Acil Olayların Ayrıntısı", text: "Detay Gör bölümünde olayları kategoriye göre süzebilir, tek tek haritada odaklayabilir ve 10'arlı sayfalarla ilerleyebilirsin. Bu yöntem tüm olayları aynı anda yüklemez." },
  { selector: ".resilience-legend-panel", resilienceOverview: true, title: "İlçe Bazlı Dirençlilik Skoru Haritası", text: "Dirençlilik sekmesi ilk olarak ilçe renk haritasını açar. Renk skalası kritik, orta ve güçlü ilçeleri karşılaştırır; simgeden haritayı açıp kapatabilirsin." },
  { selector: ".resilience-district-detail", resilienceDetail: true, title: "Mahalle Bazlı Detay", text: "Mahalle Bazlı Detay Gör düğmesiyle ilçe seçimine geçersin. Seçtiğin ilçenin mahalleleri sıralanır; sıralama yönünü de değiştirebilirsin." },
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
  const [criticalServiceVisible, setCriticalServiceVisible] = useState(false);
  const [faultVisible, setFaultVisible] = useState(false);
  const [sinkholeVisible, setSinkholeVisible] = useState(false);
  const [sinkholeInventoryHeatmapVisible, setSinkholeInventoryHeatmapVisible] = useState(false);
  const [corineLandcoverVisible, setCorineLandcoverVisible] = useState(false);
  const [esaWorldcoverVisible, setEsaWorldcoverVisible] = useState(false);
  const [esaCorineCompareVisible, setEsaCorineCompareVisible] = useState(false);
  const [esaComparePosition, setEsaComparePosition] = useState(50);
  const [baseMapStyle, setBaseMapStyle] = useState("light");
  const [karapinarLogisticsVisible, setKarapinarLogisticsVisible] = useState(false);
  const [karapinarHospitalFastVisible, setKarapinarHospitalFastVisible] = useState(false);
  const [karapinarHospitalSafeVisible, setKarapinarHospitalSafeVisible] = useState(false);
  const [karapinarFireFastVisible, setKarapinarFireFastVisible] = useState(false);
  const [karapinarFireSafeVisible, setKarapinarFireSafeVisible] = useState(false);
  const [karapinarAssemblyFastVisible, setKarapinarAssemblyFastVisible] = useState(false);
  const [karapinarAssemblySafeVisible, setKarapinarAssemblySafeVisible] = useState(false);
  const [karapinarIso3Visible, setKarapinarIso3Visible] = useState(false);
  const [karapinarIso5Visible, setKarapinarIso5Visible] = useState(false);
  const [karapinarIso10Visible, setKarapinarIso10Visible] = useState(false);
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
  const [emergencyHeatmapInfoOpen, setEmergencyHeatmapInfoOpen] = useState(false);
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
  const [scaleInput, setScaleInput] = useState("");
  const [guideOpen, setGuideOpen] = useState(() => localStorage.getItem("koriz-user-guide-seen") !== "1");
  const [guideStep, setGuideStep] = useState(-1);
  const [guideTargetRect, setGuideTargetRect] = useState(null);
  const [dataSourcesOpen, setDataSourcesOpen] = useState(false);
  const [dataSourcesPosition, setDataSourcesPosition] = useState(() => ({
    left: typeof window === "undefined" ? 24 : Math.max(12, Math.floor((window.innerWidth - 760) / 2)),
    top: 92,
  }));


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
  const [resilienceDetailsOpen, setResilienceDetailsOpen] = useState(false);

  // --- REFS ---
  const mahalleDataRef = useRef(null);
  const mahalleRequestRef = useRef(null);
  const mapRef = useRef(null);
  const esaCompareMapRef = useRef(null);
  const esaCompareRootRef = useRef(null);
  const dataSourcesDragRef = useRef(null);

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
      "corine-landcover": corineLandcoverVisible,
      "esa-worldcover-2021": esaWorldcoverVisible,
      "karapinar-logistics-routes": karapinarLogisticsVisible,
      "karapinar-logistics-isochrones": karapinarLogisticsVisible,
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
    corineLandcoverVisible,
    esaWorldcoverVisible,
    karapinarLogisticsVisible,
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
  const loadCriticalServiceLayer = async () => {
    if (loadedLayersRef.current["critical-service-load"]) return;
    try {
      const res = await fetch(`${API_URL}/layers/kritik-tesis-hizmet-yuku`);
      if (!res.ok) return;
      const data = await res.json();
      mapRef.current?.getSource("critical-service-load")?.setData(data);
      loadedLayersRef.current["critical-service-load"] = true;
    } catch { /* Kullanıcı açtığında yeniden istenebilir. */ }
  };

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

  // 319 noktalı obruk envanteri küçük bir katmandır; analiz kartı açıldığında
  // beklememesi için temel harita hazır olduktan sonra arka planda yüklenir.
  const loadSinkholeInventoryHeatmap = async () => {
    if (loadedLayersRef.current["sinkhole-inventory-heatmap"]) return;
    try {
      const res = await fetch(`${API_URL}/layers/obruk-envanter-319`);
      if (!res.ok) return;
      const data = await res.json();
      mapRef.current?.getSource("sinkhole-inventory-heatmap")?.setData(data);
      loadedLayersRef.current["sinkhole-inventory-heatmap"] = true;
    } catch {
      /* Kullanıcı düğmeye bastığında normal yükleme yeniden denenir. */
    }
  };

  // Karapınar pilot analizi toplam 28 küçük geometridir; kullanıcı beklemesin diye arka planda hazırlanır.
  const loadKarapinarLogisticsLayer = async () => {
    if (loadedLayersRef.current["karapinar-logistics"]) return;
    try {
      const [routesResponse, isochroneResponse] = await Promise.all([
        fetch(`${API_URL}/layers/karapinar-lojistik-rotalar`),
        fetch(`${API_URL}/layers/karapinar-lojistik-izokron-10dk`),
      ]);
      if (!routesResponse.ok || !isochroneResponse.ok) return;
      const [routes, isochrones] = await Promise.all([routesResponse.json(), isochroneResponse.json()]);
      mapRef.current?.getSource("karapinar-logistics-routes")?.setData(routes);
      mapRef.current?.getSource("karapinar-logistics-isochrones")?.setData(isochrones);
      loadedLayersRef.current["karapinar-logistics"] = true;
    } catch {
      /* Kullanıcı düğmeye bastığında yeniden denenir. */
    }
  };

  const karapinarLogisticsGroups = {
    hospitalFast: ["karapinar-logistics-hospital-fast-line"],
    hospitalSafe: ["karapinar-logistics-hospital-safe-line"],
    fireFast: ["karapinar-logistics-fire-fast-line"],
    fireSafe: ["karapinar-logistics-fire-safe-line"],
    assemblyFast: ["karapinar-logistics-assembly-fast-line"],
    assemblySafe: ["karapinar-logistics-assembly-safe-line"],
    iso3: ["karapinar-logistics-iso-3-line"],
    iso5: ["karapinar-logistics-iso-5-line"],
    iso10: ["karapinar-logistics-iso-10-fill", "karapinar-logistics-iso-10-line"],
  };
  const setKarapinarGroupVisibility = (layerIds, visible) => {
    layerIds.forEach((id) => {
      if (mapRef.current?.getLayer(id)) mapRef.current.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    });
  };
  const toggleKarapinarLogistics = async () => {
    const nextVisible = !karapinarLogisticsVisible;
    setKarapinarLogisticsVisible(nextVisible);
    setKarapinarHospitalFastVisible(nextVisible); setKarapinarHospitalSafeVisible(nextVisible);
    setKarapinarFireFastVisible(nextVisible); setKarapinarFireSafeVisible(nextVisible);
    setKarapinarAssemblyFastVisible(nextVisible); setKarapinarAssemblySafeVisible(nextVisible);
    setKarapinarIso3Visible(nextVisible); setKarapinarIso5Visible(nextVisible); setKarapinarIso10Visible(nextVisible);
    if (nextVisible) {
      await loadKarapinarLogisticsLayer();
      mapRef.current?.flyTo({ center: [33.56, 37.72], zoom: 10.6, pitch: 35, bearing: -16, essential: true });
    }
    Object.values(karapinarLogisticsGroups).flat().forEach((id) => {
      if (mapRef.current?.getLayer(id)) mapRef.current.setLayoutProperty(id, "visibility", nextVisible ? "visible" : "none");
    });
  };
  const toggleKarapinarLogisticsGroup = (group, visible, setVisible) => {
    const nextVisible = !visible;
    setVisible(nextVisible);
    if (nextVisible) setKarapinarLogisticsVisible(true);
    setKarapinarGroupVisibility(karapinarLogisticsGroups[group], nextVisible);
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

  // Katmanlar panelindeki temel ve analiz katmanlarının tamamını tek seferde gizler.
  const closeAllLayers = () => {
    [
      setLayerVisible, setMahalleVisible, setToplanmaVisible,
      setRecommendedAssemblyVisible, setSocioGeologicalVisible, setCriticalServiceVisible,
      setFaultVisible, setSinkholeVisible, setSinkholeInventoryHeatmapVisible, setCorineLandcoverVisible, setEsaWorldcoverVisible, setFacilityVisible,
      setRoadVisible, setEmergencyVisible, setProvinceBoundaryVisible,
      setParksVisible, setLawVisible, setHealthPointVisible,
      setHealthAreaVisible, setTransitPointVisible, setTransitAreaVisible,
      setResilienceVisible, setBuildingsVisible,
      setBuildings5Visible, setBuildings10Visible, setBuildings15Visible,
      setBuildingsUnreachableVisible, setHeatmapVisible,
      setService5Visible, setService10Visible, setService15Visible,
    ].forEach((setVisible) => setVisible(false));

    setActiveAnalysisLayer(null);
    setSelectedEmergencyId(null);
    setOpenLayerGroup(null);

    // Bazı katmanlar ilk açıldıklarında doğrudan MapLibre'a görünür atanır.
    // State güncellemesini beklemeden bunları burada da kapatıyoruz.
    const map = mapRef.current;
    if (!map) return;
    [
      "district-fill", "district-outline", "district-hover",
      "mahalle-fill", "mahalle-outline", "toplanma-points",
      "fault-lines-line", "sinkholes-fill", "sinkholes-outline", "sinkhole-inventory-heatmap", "corine-landcover-fill", "corine-landcover-outline", "esa-worldcover-2021",
      "critical-facilities-point", "major-roads-line", "province-boundary-line",
      "parks-fill", "parks-outline", "law-enforcement-point",
      "health-points-point", "health-areas-fill", "health-areas-outline",
      "transit-points-point", "transit-areas-fill", "transit-areas-outline",
      "recommended-assembly-parks-fill", "recommended-assembly-parks-outline",
      "socio-geological-risk-fill", "socio-geological-risk-outline",
      "critical-service-load-fill", "critical-service-load-outline",
      "karapinar-logistics-iso-10-fill", "karapinar-logistics-iso-3-line", "karapinar-logistics-iso-5-line", "karapinar-logistics-iso-10-line",
      "karapinar-logistics-hospital-fast-line", "karapinar-logistics-hospital-safe-line",
      "karapinar-logistics-fire-fast-line", "karapinar-logistics-fire-safe-line",
      "karapinar-logistics-assembly-fast-line", "karapinar-logistics-assembly-safe-line",
      "resilience-district-fill", "critical-accessibility-fill",
      "emergency-points-circle", "emergency-heatmap",
      "service-area-5-lines", "service-area-10-lines", "service-area-15-lines",
      "buildings-5-fill", "buildings-10-fill", "buildings-15-fill",
      "buildings-unreachable-fill", "inaccessible-heatmap",
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
    });
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
      const step = USER_GUIDE_STEPS[guideStep];
      const selector = window.innerWidth <= 768 && step?.mobileSelector
        ? step.mobileSelector
        : step?.selector;
      const item = document.querySelector(selector);
      if (!item) return setGuideTargetRect(null);
      const rect = item.getBoundingClientRect();
      setGuideTargetRect({ left: Math.max(4, rect.left - 6), top: Math.max(4, rect.top - 6), width: rect.width + 12, height: rect.height + 12 });
    };
    // Çerçeve panelin açılma/kapanma hareketini kısa süre takip eder;
    // böylece rehberdeki vurgu ve panel aynı ritimde kalır.
    let refreshFrame = null;
    const refreshTarget = () => {
      const startedAt = performance.now();
      const followPanel = (now) => {
        updateTarget();
        if (now - startedAt < 720) refreshFrame = requestAnimationFrame(followPanel);
      };
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(followPanel);
    };
    requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("koriz-guide-target-refresh", refreshTarget);
    return () => {
      if (refreshFrame) cancelAnimationFrame(refreshFrame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("koriz-guide-target-refresh", refreshTarget);
    };
  }, [guideOpen, guideStep]);

  // Rehber analiz panelinin acilis hareketini gosterir; analiz disindaki her adimda panel kapali kalir.
  useEffect(() => {
    const step = USER_GUIDE_STEPS[guideStep];
    if (!guideOpen) {
      setAnalysisOpen(false);
      return undefined;
    }

    if (step?.analysisPanelDemo) {
      setAnalysisOpen(false);
      const openTimer = window.setTimeout(() => {
        setAnalysisOpen(true);
        window.dispatchEvent(new CustomEvent("koriz-guide-analysis-panel-demo"));
      }, 100);
      const closeTimer = window.setTimeout(() => setAnalysisOpen(false), 820);
      return () => {
        window.clearTimeout(openTimer);
        window.clearTimeout(closeTimer);
      };
    }

    if (step?.analysisCardId) {
      setAnalysisOpen(true);
      window.dispatchEvent(new CustomEvent("koriz-guide-analysis-card", { detail: { id: step.analysisCardId } }));
      return undefined;
    }

    if (step?.emergencyOverview || step?.emergencyDetail) {
      setAnalysisOpen(false);
      setEventsPanelOpen(true);
      setActiveSideTab("events");
      setEmergencyPage(1);
      setEmergencyCategory("Tümü");
      setEmergencyDetailsOpen(Boolean(step.emergencyDetail));
      const refreshTimer = window.setTimeout(() => window.dispatchEvent(new CustomEvent("koriz-guide-target-refresh")), 80);
      return () => window.clearTimeout(refreshTimer);
    }

    if (step?.resilienceOverview || step?.resilienceDetail) {
      setAnalysisOpen(false);
      setEventsPanelOpen(true);
      setActiveSideTab("resilience");
      setResilienceDetailsOpen(Boolean(step.resilienceDetail));
      const refreshTimer = window.setTimeout(() => window.dispatchEvent(new CustomEvent("koriz-guide-target-refresh")), 80);
      return () => window.clearTimeout(refreshTimer);
    }

    setAnalysisOpen(false);
    return undefined;
  }, [guideOpen, guideStep]);

  const updateEsaComparePosition = (event) => {
    const root = esaCompareRootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setEsaComparePosition(Math.max(8, Math.min(92, next)));
  };

  // Karşılaştırma açıldığında ikinci, etkileşimsiz bir harita yalnızca ESA rasterını çizer.
  // Ana harita CORINE'i sağda tutar; iki harita aynı kamera hareketini paylaşır.
  useEffect(() => {
    if (!esaCorineCompareVisible || !mapReady || !esaCompareRootRef.current || !mapRef.current) return undefined;
    const primary = mapRef.current;
    const compareMap = new maplibregl.Map({
      container: esaCompareRootRef.current,
      interactive: false,
      attributionControl: false,
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
      center: primary.getCenter().toArray(),
      zoom: primary.getZoom(),
      bearing: primary.getBearing(),
      pitch: primary.getPitch(),
    });
    esaCompareMapRef.current = compareMap;

    let queued = false;
    // İki harita aynı MapLibre kamera değerlerini kullanır. Böylece sürükleme,
    // yakınlaştırma, döndürme ve ekran boyutu değişimi aynı anda yansır.
    const syncCamera = () => {
      if (queued || !compareMap.loaded()) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const center = primary.getCenter();
        compareMap.resize();
        compareMap.jumpTo({
          center: [center.lng, center.lat],
          zoom: primary.getZoom(),
          bearing: primary.getBearing(),
          pitch: primary.getPitch(),
        });
      });
    };
    const resizeComparison = () => {
      compareMap.resize();
      syncCamera();
    };
    primary.on("move", syncCamera);
    primary.on("moveend", syncCamera);
    primary.on("resize", resizeComparison);
    compareMap.on("load", () => {
      const comparisonBaseSource = baseMapStyle === "streets"
        ? { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" }
        : baseMapStyle === "satellite"
          ? { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }
          : null;
      if (comparisonBaseSource) {
        compareMap.addSource("comparison-selected-basemap", comparisonBaseSource);
        compareMap.addLayer({ id: "comparison-selected-basemap-layer", type: "raster", source: "comparison-selected-basemap" });
      }
      compareMap.addSource("esa-worldcover-2021", {
        type: "raster",
        tiles: [`${API_URL}/tiles/esa-worldcover-2021/{z}/{x}/{y}.png`],
        tileSize: 256,
        // CORINE vektör karoları 8. seviyeden itibaren geldiği için iki taraf
        // karşılaştırmada aynı ölçek eşiğinde görünür.
        minzoom: 8,
        maxzoom: 16,
      });
      compareMap.addLayer({
        id: "esa-worldcover-2021", type: "raster", source: "esa-worldcover-2021", minzoom: 8,
        paint: { "raster-opacity": 0.84, "raster-resampling": "nearest", "raster-fade-duration": 0 },
      });
      syncCamera();
    });

    return () => {
      primary.off("move", syncCamera);
      primary.off("moveend", syncCamera);
      primary.off("resize", resizeComparison);
      esaCompareMapRef.current = null;
      compareMap.remove();
    };
  }, [esaCorineCompareVisible, mapReady, baseMapStyle]);

  // Altlık değişiminde analiz ve kullanıcı katmanları yerinde kalır; yalnız taban rasterı değişir.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const active = {
      light: "carto-light-layer",
      streets: "osm-streets-layer",
      satellite: "esri-world-imagery-layer",
    }[baseMapStyle];
    ["carto-light-layer", "osm-streets-layer", "esri-world-imagery-layer"].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", layerId === active ? "visible" : "none");
    });
  }, [baseMapStyle, mapReady]);

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
            attribution: "© OpenStreetMap contributors © CARTO",
          },
          "osm-streets": {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "© OpenStreetMap contributors",
          },
          "esri-world-imagery": {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            maxzoom: 19,
            attribution: "Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        },
        layers: [
          { id: "carto-light-layer", type: "raster", source: "carto-light", layout: { visibility: "visible" } },
          { id: "osm-streets-layer", type: "raster", source: "osm-streets", layout: { visibility: "none" } },
          { id: "esri-world-imagery-layer", type: "raster", source: "esri-world-imagery", layout: { visibility: "none" } },
        ],
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
      addSrc("critical-service-load", { type: "geojson", data: EMPTY_FC });
      addSrc("karapinar-logistics-routes", { type: "geojson", data: EMPTY_FC });
      addSrc("karapinar-logistics-isochrones", { type: "geojson", data: EMPTY_FC });
      // Temel harita görünür olduktan kısa süre sonra katmanı önbelleğe al.
      window.setTimeout(() => { loadSocioGeologicalRiskLayer(); loadCriticalServiceLayer(); loadSinkholeInventoryHeatmap(); loadKarapinarLogisticsLayer(); }, 900);
      addSrc("service-area-5-lines", { type: "vector", tiles: [`${API_URL}/tiles/service-area/5-lines/{z}/{x}/{y}.pbf`], minzoom: 10, maxzoom: 16 });

addSrc("service-area-10-lines", { type: "vector", tiles: [`${API_URL}/tiles/service-area/10-lines/{z}/{x}/{y}.pbf`], minzoom: 10, maxzoom: 16 });

addSrc("service-area-15-lines", { type: "vector", tiles: [`${API_URL}/tiles/service-area/15-lines/{z}/{x}/{y}.pbf`], minzoom: 10, maxzoom: 16 });
addSrc("service-area-5-polygons", { type: "vector", tiles: [`${API_URL}/tiles/service-area/5-polygons/{z}/{x}/{y}.pbf`], minzoom: 7, maxzoom: 16 });

addSrc("service-area-10-polygons", { type: "vector", tiles: [`${API_URL}/tiles/service-area/10-polygons/{z}/{x}/{y}.pbf`], minzoom: 7, maxzoom: 16 });

addSrc("service-area-15-polygons", { type: "vector", tiles: [`${API_URL}/tiles/service-area/15-polygons/{z}/{x}/{y}.pbf`], minzoom: 7, maxzoom: 16 });

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
      addSrc("sinkhole-inventory-heatmap", { type: "geojson", data: EMPTY_FC });
      addSrc("corine-landcover", { type: "vector", tiles: [`${API_URL}/tiles/corine-2018/{z}/{x}/{y}.pbf`], minzoom: 8, maxzoom: 14 });
      addSrc("esa-worldcover-2021", { type: "raster", tiles: [`${API_URL}/tiles/esa-worldcover-2021/{z}/{x}/{y}.png`], tileSize: 256, minzoom: 5, maxzoom: 16 });
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
  "source-layer": "service15polygons",

  layout: { visibility: "none" },

  paint: {
    "fill-color": "#ef4444",
    "fill-opacity": 0.08,
  },
});
addLyr({
  id: "service-area-10-fill",

  type: "fill",

  source: "service-area-10-polygons",
  "source-layer": "service10polygons",

  layout: { visibility: "none" },

  paint: {
    "fill-color": "#f59e0b",
    "fill-opacity": 0.12,
  },
});
addLyr({
  id: "service-area-5-fill",

  type: "fill",

  source: "service-area-5-polygons",
  "source-layer": "service5polygons",

  layout: { visibility: "none" },

  paint: {
    "fill-color": "#22c55e",
    "fill-opacity": 0.18,
  },
});
      addLyr({
  id: "service-area-15-line",
  type: "line",
  source: "service-area-15-lines",
  "source-layer": "service15lines",

  layout: {
    visibility: "none",
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
  "source-layer": "service10lines",

  layout: {
    visibility: "none",
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
  "source-layer": "service5lines",

  layout: {
    visibility: "none",
  },

  paint: {
    "line-color": "#22c55e",
    "line-width": 3,
    "line-opacity": 0.42,
  },
});
      // Acil toplanma alanları: daire yerine haritadaki gerçek konumu daha iyi anlatan pin işareti.
      if (!map.hasImage("assembly-area-pin")) {
        const pinCanvas = document.createElement("canvas");
        pinCanvas.width = 44;
        pinCanvas.height = 50;
        const pin = pinCanvas.getContext("2d");
        pin.save();
        pin.shadowColor = "rgba(21, 128, 61, 0.34)";
        pin.shadowBlur = 5;
        pin.shadowOffsetY = 2;
        pin.beginPath();
        pin.moveTo(22, 2);
        pin.bezierCurveTo(12, 2, 5, 10, 5, 20);
        pin.bezierCurveTo(5, 31, 15, 39, 22, 47);
        pin.bezierCurveTo(29, 39, 39, 31, 39, 20);
        pin.bezierCurveTo(39, 10, 32, 2, 22, 2);
        pin.closePath();
        pin.fillStyle = "#16a34a";
        pin.fill();
        pin.shadowColor = "transparent";
        pin.lineWidth = 2;
        pin.strokeStyle = "#dcfce7";
        pin.stroke();
        pin.beginPath();
        pin.arc(22, 19, 6, 0, Math.PI * 2);
        pin.fillStyle = "#f0fdf4";
        pin.fill();
        pin.restore();
        map.addImage("assembly-area-pin", pin.getImageData(0, 0, 44, 50));
      }
      addLyr({
        id: "toplanma-points",
        type: "symbol",
        source: "toplanma",
        layout: {
          "icon-image": "assembly-area-pin",
          "icon-anchor": "bottom",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.56, 11, 0.76, 15, 1.02],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": 0.96,
        },
      });

      addLyr({ id: "fault-lines-line", type: "line", source: "fault-lines", layout: { visibility: "none" }, paint: { "line-color": "#dc2626", "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 13, 3] } });
      addLyr({ id: "sinkholes-fill", type: "fill", source: "sinkholes", layout: { visibility: "none" }, paint: { "fill-color": "#a16207", "fill-opacity": 0.30 } });
      addLyr({ id: "sinkholes-outline", type: "line", source: "sinkholes", layout: { visibility: "none" }, paint: { "line-color": "#78350f", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 13, 2.2], "line-opacity": 0.95 } });
      addLyr({ id: "sinkhole-inventory-heatmap", type: "heatmap", source: "sinkhole-inventory-heatmap", maxzoom: 14, layout: { visibility: "none" }, paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.1, 12, 1.8, 14, 2.2],
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(127,29,29,0)", 0.18, "#fef3c7", 0.42, "#f59e0b", 0.68, "#ea580c", 1, "#991b1b"],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 15, 9, 25, 12, 38, 14, 48],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.72, 12, 0.86, 14, 0]
      } });
      const corineColor = ["case",
        ["in", ["get", "code_18"], ["literal", ["111", "112", "121", "122", "123", "124", "131", "132", "133"]]], "#ef4444",
        ["in", ["get", "code_18"], ["literal", ["211", "212", "213", "221", "222", "223", "231", "241", "242", "243", "244"]]], "#eab308",
        ["in", ["get", "code_18"], ["literal", ["311", "312", "313", "321", "322", "323", "324"]]], "#16a34a",
        ["in", ["get", "code_18"], ["literal", ["331", "332", "333", "334", "335"]]], "#84cc16",
        ["in", ["get", "code_18"], ["literal", ["411", "412", "421", "422", "423"]]], "#14b8a6",
        ["in", ["get", "code_18"], ["literal", ["511", "512", "521", "522", "523"]]], "#2563eb",
        "#94a3b8"
      ];
      addLyr({ id: "corine-landcover-fill", type: "fill", source: "corine-landcover", "source-layer": "corine", minzoom: 8, layout: { visibility: "none" }, paint: { "fill-color": corineColor, "fill-opacity": 0.38 } });
      addLyr({ id: "corine-landcover-outline", type: "line", source: "corine-landcover", "source-layer": "corine", minzoom: 8, layout: { visibility: "none" }, paint: { "line-color": corineColor, "line-width": 0.55, "line-opacity": 0.62 } });
      addLyr({ id: "esa-worldcover-2021", type: "raster", source: "esa-worldcover-2021", layout: { visibility: "none" }, paint: { "raster-opacity": 0.82, "raster-resampling": "nearest", "raster-fade-duration": 0 } });
      addLyr({ id: "critical-facilities-point", type: "circle", source: "critical-facilities", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 13, 6], "circle-color": "#64748b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.88 } });
      addLyr({ id: "major-roads-line", type: "line", source: "major-roads", "source-layer": "roads", minzoom: 11, layout: { visibility: "none" }, paint: { "line-color": "#64748b", "line-opacity": 0.58, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 15, 2.4] } });
      addLyr({ id: "province-boundary-line", type: "line", source: "province-boundary", layout: { visibility: "none" }, paint: { "line-color": "#0f172a", "line-opacity": 0.86, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.3, 12, 3] } });
      addLyr({ id: "parks-fill", type: "fill", source: "parks", layout: { visibility: "none" }, paint: { "fill-color": "#22c55e", "fill-opacity": 0.24 } });
      addLyr({ id: "parks-outline", type: "line", source: "parks", layout: { visibility: "none" }, paint: { "line-color": "#15803d", "line-width": 0.8, "line-opacity": 0.8 } });
      addLyr({ id: "recommended-assembly-parks-fill", type: "fill", source: "recommended-assembly-parks", layout: { visibility: "none" }, paint: { "fill-color": "#f59e0b", "fill-opacity": 0.32 } });
      addLyr({ id: "recommended-assembly-parks-outline", type: "line", source: "recommended-assembly-parks", layout: { visibility: "none" }, paint: { "line-color": "#b45309", "line-width": 1.2, "line-opacity": 0.9 } });
      addLyr({ id: "socio-geological-risk-fill", type: "fill", source: "socio-geological-risk", layout: { visibility: "none" }, paint: { "fill-color": ["step", ["coalesce", ["to-number", ["get", "toplam_risk"]], 0], "#15803d", 6, "#eab308", 7, "#f97316", 9, "#dc2626"], "fill-opacity": 0.46 } });
      addLyr({ id: "socio-geological-risk-outline", type: "line", source: "socio-geological-risk", layout: { visibility: "none" }, paint: { "line-color": "#7f1d1d", "line-width": 1.35, "line-opacity": 0.84 } });
      addLyr({ id: "critical-service-load-fill", type: "fill", source: "critical-service-load", layout: { visibility: "none" }, paint: { "fill-color": ["step", ["coalesce", ["to-number", ["get", "toplam_puan"]], 0], "#15803d", 6, "#eab308", 9, "#f97316", 12, "#dc2626"], "fill-opacity": 0.48 } });
      addLyr({ id: "critical-service-load-outline", type: "line", source: "critical-service-load", layout: { visibility: "none" }, paint: { "line-color": "#9f1239", "line-width": 1.35, "line-opacity": 0.88 } });
      // Her dakika için birikimli poligon yerine 3, 5 ve 10 dakika katmanları ayrı kontrol edilir.
      addLyr({ id: "karapinar-logistics-iso-10-fill", type: "fill", source: "karapinar-logistics-isochrones", filter: ["==", ["get", "sure_saniye"], 600], layout: { visibility: "none" }, paint: { "fill-color": "#60a5fa", "fill-opacity": 0.11 } });
      addLyr({ id: "karapinar-logistics-iso-3-line", type: "line", source: "karapinar-logistics-isochrones", filter: ["==", ["get", "sure_saniye"], 180], layout: { visibility: "none" }, paint: { "line-color": "#16a34a", "line-width": 2.3, "line-opacity": 0.94 } });
      addLyr({ id: "karapinar-logistics-iso-5-line", type: "line", source: "karapinar-logistics-isochrones", filter: ["==", ["get", "sure_saniye"], 300], layout: { visibility: "none" }, paint: { "line-color": "#f59e0b", "line-width": 2.3, "line-opacity": 0.94 } });
      addLyr({ id: "karapinar-logistics-iso-10-line", type: "line", source: "karapinar-logistics-isochrones", filter: ["==", ["get", "sure_saniye"], 600], layout: { visibility: "none" }, paint: { "line-color": "#2563eb", "line-width": 2.3, "line-opacity": 0.94 } });
      const karapinarRouteLayer = (id, facility, safety, color, dashed = false) => addLyr({ id, type: "line", source: "karapinar-logistics-routes", filter: ["all", ["==", ["get", "hedef_turu"], facility], ["==", ["get", "guvenlik_sinifi"], safety]], layout: { visibility: "none", "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.7, 12, 5.2], "line-opacity": 0.95, ...(dashed ? { "line-dasharray": [1.4, 1.15] } : {}) } });
      karapinarRouteLayer("karapinar-logistics-hospital-fast-line", "Hastane", "riskli", "#2563eb");
      karapinarRouteLayer("karapinar-logistics-hospital-safe-line", "Hastane", "guvenli", "#2563eb", true);
      karapinarRouteLayer("karapinar-logistics-fire-fast-line", "İtfaiye", "riskli", "#ea580c");
      karapinarRouteLayer("karapinar-logistics-fire-safe-line", "İtfaiye", "guvenli", "#ea580c", true);
      karapinarRouteLayer("karapinar-logistics-assembly-fast-line", "Toplanma alanı", "riskli", "#7c3aed");
      karapinarRouteLayer("karapinar-logistics-assembly-safe-line", "Toplanma alanı", "guvenli", "#7c3aed", true);
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


  // Erişim alanları harita sürüklenirken tekrar çağrılmaz. Tam veri yalnız
  // kullanıcı ilgili süreyi açtığında bir kez getirilir.

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
    map.setPaintProperty("toplanma-points", "icon-opacity", toplanmaOpacity);
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

  useEffect(() => () => {
    const drag = dataSourcesDragRef.current;
    if (!drag) return;
    window.removeEventListener("pointermove", drag.onMove);
    window.removeEventListener("pointerup", drag.onEnd);
  }, []);

  const startDataSourcesDrag = (event) => {
    if (event.button !== 0 || event.target.closest("button, input")) return;
    const panel = document.querySelector(".data-sources-window");
    if (!panel) return;
    event.preventDefault();
    const startLeft = dataSourcesPosition.left;
    const startTop = dataSourcesPosition.top;
    const startX = event.clientX;
    const startY = event.clientY;
    const onMove = (moveEvent) => {
      const maxLeft = Math.max(12, window.innerWidth - panel.offsetWidth - 12);
      const maxTop = Math.max(12, window.innerHeight - panel.offsetHeight - 12);
      setDataSourcesPosition({
        left: Math.min(maxLeft, Math.max(12, startLeft + moveEvent.clientX - startX)),
        top: Math.min(maxTop, Math.max(12, startTop + moveEvent.clientY - startY)),
      });
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      dataSourcesDragRef.current = null;
    };
    dataSourcesDragRef.current = { onMove, onEnd };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  };

  const applyManualScale = (event) => {
    event.preventDefault();
    const map = mapRef.current;
    // 50000, 50.000 veya 1:50.000 biçimleri kabul edilir.
    const targetScale = Number(String(scaleInput).replace(/^\s*1\s*:\s*/, "").replace(/[.\s]/g, "").replace(",", "."));
    if (!map || !Number.isFinite(targetScale) || targetScale < 250) return;
    const latitude = map.getCenter().lat;
    const numerator = 156543.03392804097 * Math.cos(latitude * Math.PI / 180) * 96 * 39.3701;
    const zoom = Math.log2(numerator / targetScale) - 1;
    map.easeTo({ zoom: Math.max(0, Math.min(22, zoom)), duration: 850 });
    setScaleInput("");
  };


  // Telefonda rehber kartı hedef panelin karşı tarafında kalır; böylece açıklama, gösterilen alanı kapatmaz.
  const guideDialogPlacement = (() => {
    const step = guideStep >= 0 ? USER_GUIDE_STEPS[guideStep] : null;
    const mobile = typeof window !== "undefined" && window.innerWidth <= 768;
    const analysisStep = Boolean(step?.analysisPanelDemo || step?.analysisCardId);
    const targetUpperArea = Boolean(guideTargetRect && guideTargetRect.top < window.innerHeight * 0.48);

    if (mobile && guideStep >= 0) {
      // Analiz kartları alttan açıldığı için açıklama telefonda her zaman üstte kalır.
      if (analysisStep) {
        return { top: "74px", bottom: "auto", width: "min(340px, calc(100vw - 24px))", maxHeight: "min(270px, calc(100vh - 96px))", padding: "13px" };
      }
      return targetUpperArea
        ? { top: "auto", bottom: "18px", width: "min(340px, calc(100vw - 24px))", maxHeight: "min(270px, calc(100vh - 86px))", padding: "13px" }
        : { top: "74px", bottom: "auto", width: "min(340px, calc(100vw - 24px))", maxHeight: "min(270px, calc(100vh - 96px))", padding: "13px" };
    }

    const placeAtTop = Boolean(analysisStep || (guideTargetRect && guideTargetRect.top > window.innerHeight / 2));
    return {
      top: placeAtTop ? "24px" : "auto",
      bottom: placeAtTop ? "auto" : "24px",
      width: "min(370px, calc(100vw - 32px))",
      maxHeight: "calc(100vh - 48px)",
      padding: "18px",
    };
  })();

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", background: "#e5e7eb" }}>
      <div id="map" style={{ width: "100%", height: "100%" }} />
      {esaCorineCompareVisible && <>
        <div
          ref={esaCompareRootRef}
          id="esa-corine-compare-map"
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", clipPath: `inset(0 ${100 - esaComparePosition}% 0 0)` }}
        />
        <div
          aria-label="ESA ve CORINE karşılaştırma ayırıcı"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); updateEsaComparePosition(event); }}
          onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) updateEsaComparePosition(event); }}
          style={{ position: "absolute", zIndex: 9, top: 0, bottom: 0, left: `${esaComparePosition}%`, width: 42, transform: "translateX(-50%)", cursor: "ew-resize", touchAction: "none", display: "flex", justifyContent: "center", pointerEvents: "auto" }}
        >
          <div style={{ width: 3, height: "100%", background: "rgba(255,255,255,0.96)", boxShadow: "0 0 0 1px rgba(79,70,229,0.5), 0 0 14px rgba(15,23,42,0.28)" }} />
          <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "#ffffff", border: "2px solid #7c3aed", color: "#6d28d9", boxShadow: "0 6px 18px rgba(15,23,42,0.25)", fontWeight: 900, fontSize: 17 }}>↔</div>
          <div style={{ position: "absolute", top: 18, left: 8, transform: "translateX(-100%)", padding: "5px 8px", borderRadius: 7, background: "rgba(109,40,217,0.92)", color: "white", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>ESA 2021</div>
          <div style={{ position: "absolute", top: 18, right: 8, transform: "translateX(100%)", padding: "5px 8px", borderRadius: 7, background: "rgba(21,128,61,0.92)", color: "white", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>CORINE 2018</div>
        </div>
      </>}
      <button className="map-home-button" title="Başlangıç görünümüne dön" aria-label="Başlangıç görünümüne dön"
        onClick={() => mapRef.current?.flyTo({ center: [32.55, 37.87], zoom: 7.05, pitch: 55, bearing: -18, duration: 1200 })}>
        ⌂
      </button>
      <div className="map-status-bar" aria-label="Harita koordinat ve ölçek bilgisi">
        <span>Koordinat <strong>{mapStatus.coordinate}</strong></span>
        <span className="map-status-divider" />
        <form className="map-scale-inline" onSubmit={applyManualScale}>
          <span>Ölçek</span>
          <label htmlFor="manual-map-scale">1:</label>
          <input
            id="manual-map-scale"
            inputMode="numeric"
            value={scaleInput || mapStatus.scale.replace(/^1:/, "")}
            onFocus={() => setScaleInput(mapStatus.scale.replace(/^1:/, "").replace(/\./g, ""))}
            onChange={(event) => setScaleInput(event.target.value)}
            aria-label="Hedef ölçek"
          />
          <button type="submit" className="map-scale-apply" title="Bu ölçeğe git" aria-label="Bu ölçeğe git">↵</button>
        </form>
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
  right: "126px",
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

      {dataSourcesOpen && (
        <section className="data-sources-window" role="dialog" aria-label="Veri kaynakları tablosu" style={{ position: "fixed", left: `${dataSourcesPosition.left}px`, top: `${dataSourcesPosition.top}px`, zIndex: 130, width: "min(760px, calc(100vw - 24px))", maxHeight: "min(560px, calc(100vh - 24px))", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #b9bcff", borderRadius: 10, background: "#ffffff", color: "#0f172a", boxShadow: "0 18px 46px rgba(115,118,242,0.24)" }}>
          <header onPointerDown={startDataSourcesDrag} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", cursor: "grab", userSelect: "none", background: "linear-gradient(135deg, #f7f7ff, #dfe0ff)", color: "#585bd8" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Veri Kaynakları</div>
              <div style={{ marginTop: 2, fontSize: 10, color: "#7376f2" }}>Taşımak için bu başlıktan tutun · Kaynak listesi hazırlanıyor</div>
            </div>
            <button type="button" onClick={() => setDataSourcesOpen(false)} aria-label="Veri kaynakları penceresini kapat" title="Kapat" style={{ flex: "0 0 auto", width: 28, height: 28, border: "1px solid rgba(115,118,242,0.34)", borderRadius: 7, background: "rgba(255,255,255,0.70)", color: "#5f63e8", cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
          </header>
          <div style={{ overflow: "auto", background: "#ffffff" }}>
            <table style={{ width: "100%", minWidth: 620, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, zIndex: 1, padding: "10px 12px", textAlign: "left", background: "#ebecff", color: "#585bd8", borderRight: "1px solid #d7d8ff", borderBottom: "2px solid #b9bcff", fontWeight: 800 }}>Veri</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 1, padding: "10px 12px", textAlign: "left", background: "#ebecff", color: "#585bd8", borderBottom: "2px solid #b9bcff", fontWeight: 800 }}>Kaynağı</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((row) => (
                  <tr key={row} style={{ background: row % 2 ? "#fbfbff" : "#ffffff" }}>
                    <td style={{ height: 37, padding: "0 12px", borderRight: "1px solid #e3e4ff", borderBottom: "1px solid #e3e4ff" }}>&nbsp;</td>
                    <td style={{ height: 37, padding: "0 12px", borderBottom: "1px solid #e3e4ff" }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer style={{ flex: "0 0 auto", padding: "7px 11px", borderTop: "1px solid #d7d8ff", background: "#f7f7ff", color: "#7376f2", fontSize: 10 }}>Bu tablo, veri ve kaynak bilgileri hazır olduğunda aynı düzen korunarak doldurulacaktır.</footer>
        </section>
      )}

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

      {emergencyHeatmapInfoOpen && <div style={{ position: "fixed", inset: 0, zIndex: 31, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15,23,42,0.32)", backdropFilter: "blur(4px)" }} onClick={() => setEmergencyHeatmapInfoOpen(false)}>
        <div onClick={(event) => event.stopPropagation()} style={{ width: "min(390px, 100%)", borderRadius: "18px", padding: "20px", background: "rgba(255,255,255,0.98)", color: "#0f172a", boxShadow: "0 20px 55px rgba(15,23,42,0.25)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
            <div><div style={{ color: "#dc2626", fontSize: "11px", fontWeight: "800", letterSpacing: ".05em", textTransform: "uppercase" }}>Acil olay katmanı</div><div style={{ marginTop: "4px", fontSize: "18px", fontWeight: "800" }}>Olay seçimi ve ısı haritası</div></div>
            <button onClick={() => setEmergencyHeatmapInfoOpen(false)} aria-label="Bilgi panelini kapat" style={{ border: "none", background: "#fef2f2", color: "#dc2626", borderRadius: "9px", cursor: "pointer", fontSize: "18px", width: "30px", height: "30px" }}>×</button>
          </div>
          <p style={{ margin: 0, color: "#475569", fontSize: "13px", lineHeight: 1.6 }}>Listeden herhangi bir acil olaya tıkladığında, ilgili olay konumu haritada odaklanır ve <strong>Acil Olaylar Isı Haritası</strong> otomatik olarak açılır.</p>
          <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "10px", background: "#fef2f2", border: "1px solid rgba(220,38,38,0.18)", color: "#991b1b", fontSize: "12px", lineHeight: 1.5 }}>Isı haritasındaki koyu kırmızı alanlar, olay kayıtlarının daha yoğun olduğu yerleri gösterir. Bu görünüm tek başına risk sınıfı veya kesin tehlike sınırı anlamına gelmez.</div>
        </div>
      </div>}

      {resilienceRankingHelpOpen && <div style={{ position: "fixed", inset: 0, zIndex: 31, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", background: "rgba(15,23,42,0.32)", backdropFilter: "blur(4px)" }} onClick={() => setResilienceRankingHelpOpen(false)}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(390px, 100%)", borderRadius: "18px", padding: "20px", background: "rgba(255,255,255,0.98)", color: "#0f172a", boxShadow: "0 20px 55px rgba(15,23,42,0.25)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
            <div><div style={{ color: "#0f766e", fontSize: "11px", fontWeight: "800", letterSpacing: ".05em", textTransform: "uppercase" }}>Mahalle görünümü</div><div style={{ marginTop: "4px", fontSize: "18px", fontWeight: "800" }}>Sıralamayı haritada gör</div></div>
            <button onClick={() => setResilienceRankingHelpOpen(false)} aria-label="Bilgi panelini kapat" style={{ width: "32px", height: "32px", borderRadius: "9px", border: "none", cursor: "pointer", background: "#f1f5f9", color: "#475569", fontSize: "19px" }}>×</button>
          </div>
          <p style={{ margin: "0 0 14px", color: "#475569", fontSize: "13px", lineHeight: 1.55 }}>Mahalle dirençlilik sıralamasını haritada görmek ve bir mahalleye tıklayarak ayrıntısına ulaşmak için:</p>
          <ol style={{ margin: 0, paddingLeft: "20px", color: "#334155", fontSize: "13px", lineHeight: 1.8 }}>
            <li>Soldaki <strong>Katmanlar</strong> başlığını aç.</li>
            <li><strong>İdari Sınırlar</strong> grubunu aç.</li>
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
            <span>{activeSideTab === "events" ? "Acil Olaylar Sınıflandırması" : (resilienceDetailsOpen ? "Mahalle Bazlı Dirençlilik Sıralaması" : "İlçe Bazlı Dirençlilik Skoru Haritası")}</span>
            {activeSideTab === "events" && <button onClick={(e) => { e.stopPropagation(); setEmergencyHeatmapInfoOpen(true); }} title="Acil olay ısı haritası hakkında bilgi" style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: "14px", padding: 0, lineHeight: 1 }}>ⓘ</button>}
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
            <button key={tab} onClick={() => { setActiveSideTab(tab); if (tab === "resilience") setResilienceDetailsOpen(false); }}
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
                <div className="emergency-detail-guide" style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(239,68,68,0.16)" }}>
                  <button onClick={() => { setEmergencyPage(1); setEmergencyCategory("Tümü"); setEmergencyDetailsOpen(false); }} style={{ width: "100%", marginTop: "10px", border: "1px solid rgba(220,38,38,0.32)", borderRadius: "9px", padding: "10px", cursor: "pointer", background: "rgba(254,242,242,0.94)", color: "#dc2626", fontSize: "12px", fontWeight: "800" }}>Genel Özete Dön</button>
                </div>
              </> : (
                <div className="emergency-summary-guide" style={{ flex: 1, overflowY: "auto", padding: "14px 12px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
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
              resilienceDetailsOpen ? <>
                <div className="resilience-district-detail" style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "7px 10px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: "800" }}>{resilienceDistrictId ? `${rankedNeighborhoods.length} mahalle` : "Mahalle Bazlı dirençlilik skorunu görmek için ilçe seçin"}</div>
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
                <div style={{ padding: "0 12px 12px", borderTop: "1px solid rgba(115,118,242,0.18)" }}>
                  <button onClick={() => setResilienceDetailsOpen(false)} style={{ width: "100%", marginTop: "10px", border: "1px solid rgba(115,118,242,0.42)", borderRadius: "9px", padding: "10px", cursor: "pointer", background: "rgba(245,245,255,0.90)", color: "#5f63e8", fontSize: "12px", fontWeight: "800" }}>İlçe Bazlı Veriye Dön</button>
                </div>
              </> : <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div className="resilience-legend-panel" style={{ padding: "13px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(239,246,255,0.92), rgba(255,255,255,0.80))", border: "1px solid rgba(59,130,246,0.16)" }}>
                  <button onClick={() => setResilienceInfoOpen(true)} title="Dirençlilik skoru açıklamasını göster" style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: 0, border: "none", background: "transparent", color: "#64748b", fontFamily: "Georgia, Times New Roman, serif", fontSize: "13px", fontWeight: "700", letterSpacing: "0.01em", textAlign: "left", cursor: "pointer" }}>
                    İlçe Bazlı Dirençlilik Skoru Haritası <span style={{ color: "#64748b", fontSize: "14px" }}>ⓘ</span>
                  </button>
                  <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "11px", lineHeight: 1.5 }}>Konya ilçelerinin afetlere karşı göreli dirençlilik skorlarını renk sınıflarıyla gösterir.</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", gap: "8px" }}>
                    <span style={{ color: "#475569", fontSize: "11px", fontWeight: "700" }}>İlçe renk haritası</span>
                    <button onClick={() => setResilienceVisible((value) => !value)} aria-label="İlçe renk haritasını aç veya kapat" style={{ border: "none", background: "transparent", padding: 0, color: "#0f172a", fontSize: "17px", lineHeight: 1, cursor: "pointer" }}>{resilienceVisible ? "⦿" : "⦸"}</button>
                  </div>
                  <div style={{ height: "9px", borderRadius: "999px", marginTop: "7px", background: "linear-gradient(to right, #dc2626, #f59e0b, #22c55e, #0f766e)" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#64748b", fontSize: "9px", fontWeight: "700" }}><span>0 Kritik</span><span>55 Orta</span><span>75 İyi</span><span>100</span></div>
                </div>
                <button onClick={() => setResilienceDetailsOpen(true)} style={{ marginTop: "auto", border: "none", borderRadius: "9px", padding: "11px", cursor: "pointer", background: "linear-gradient(135deg, #7376f2, #5f63e8)", color: "white", fontSize: "12px", fontWeight: "800", boxShadow: "0 5px 14px rgba(115,118,242,0.28)" }}>Mahalle Bazlı Detay Gör →</button>
              </div>
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
        <div className="layers-panel-guide-trigger" style={{ display: "flex", alignItems: "center", gap: "7px" }}>
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
        <div style={{ margin: "10px 0 13px", padding: "9px", borderRadius: "15px", background: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(241,245,249,0.72))", border: "1px solid rgba(148,163,184,0.24)", boxShadow: "0 8px 20px rgba(71,85,105,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 8px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Harita altlığı</div>
              <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: 2 }}>Görünümü değiştir</div>
            </div>
            <span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: 8, color: "#6366f1", background: "rgba(238,242,255,0.92)", fontSize: 14 }}>◫</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
            {[
              ["light", "Açık", "Yalın", "linear-gradient(145deg, #f8fafc 0 42%, #e2e8f0 43% 52%, #ffffff 53% 100%)"],
              ["streets", "Sokak", "Yollar", "linear-gradient(145deg, #b9dbf8 0 35%, #f8fafc 36% 49%, #dbeafe 50% 61%, #f8fafc 62% 100%)"],
              ["satellite", "Uydu", "Görüntü", "linear-gradient(145deg, #244014 0 28%, #778b36 29% 48%, #b59b55 49% 66%, #3f5e2b 67% 100%)"],
            ].map(([id, label, note, preview]) => {
              const selected = baseMapStyle === id;
              return <button key={id} type="button" onClick={() => setBaseMapStyle(id)} aria-pressed={selected} style={{ minWidth: 0, padding: 0, overflow: "hidden", textAlign: "left", cursor: "pointer", borderRadius: 11, border: selected ? "1.5px solid #6366f1" : "1px solid rgba(148,163,184,0.26)", background: selected ? "#ffffff" : "rgba(255,255,255,0.58)", boxShadow: selected ? "0 5px 14px rgba(99,102,241,0.20)" : "none", transform: selected ? "translateY(-1px)" : "none", transition: "all .18s ease" }}>
                <span style={{ display: "block", height: 28, margin: 4, borderRadius: 7, background: preview, position: "relative", overflow: "hidden" }}>
                  {selected && <span style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, borderRadius: 99, display: "grid", placeItems: "center", background: "#6366f1", color: "white", fontSize: 9, fontWeight: 900 }}>✓</span>}
                </span>
                <span style={{ display: "block", padding: "0 7px 7px", color: "#334155" }}>
                  <span style={{ display: "block", fontSize: 10, fontWeight: 900, lineHeight: 1.1 }}>{label}</span>
                  <span style={{ display: "block", marginTop: 2, color: "#94a3b8", fontSize: 8, fontWeight: 700 }}>{note}</span>
                </span>
              </button>;
            })}
          </div>
        </div>
        {[
          {
            id: "boundaries", title: "İdari Sınırlar", items: [
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
        criticalServiceVisible={criticalServiceVisible}
        sinkholeInventoryHeatmapVisible={sinkholeInventoryHeatmapVisible}
        corineLandcoverVisible={corineLandcoverVisible}
        esaWorldcoverVisible={esaWorldcoverVisible}
        esaCorineCompareVisible={esaCorineCompareVisible}
        karapinarLogisticsVisible={karapinarLogisticsVisible}
        karapinarLogisticsLayers={{ hospitalFast: karapinarHospitalFastVisible, hospitalSafe: karapinarHospitalSafeVisible, fireFast: karapinarFireFastVisible, fireSafe: karapinarFireSafeVisible, assemblyFast: karapinarAssemblyFastVisible, assemblySafe: karapinarAssemblySafeVisible, iso3: karapinarIso3Visible, iso5: karapinarIso5Visible, iso10: karapinarIso10Visible }}
        onToggleKarapinarLogistics={toggleKarapinarLogistics}
        onToggleKarapinarLogisticsGroup={(group) => {
          const handlers = {
            hospitalFast: [karapinarHospitalFastVisible, setKarapinarHospitalFastVisible], hospitalSafe: [karapinarHospitalSafeVisible, setKarapinarHospitalSafeVisible],
            fireFast: [karapinarFireFastVisible, setKarapinarFireFastVisible], fireSafe: [karapinarFireSafeVisible, setKarapinarFireSafeVisible],
            assemblyFast: [karapinarAssemblyFastVisible, setKarapinarAssemblyFastVisible], assemblySafe: [karapinarAssemblySafeVisible, setKarapinarAssemblySafeVisible],
            iso3: [karapinarIso3Visible, setKarapinarIso3Visible], iso5: [karapinarIso5Visible, setKarapinarIso5Visible], iso10: [karapinarIso10Visible, setKarapinarIso10Visible],
          };
          toggleKarapinarLogisticsGroup(group, handlers[group][0], handlers[group][1]);
        }}
        onToggleCorineLandcover={() => {
          const nextVisible = !corineLandcoverVisible;
          setCorineLandcoverVisible(nextVisible);
          ["corine-landcover-fill", "corine-landcover-outline"].forEach((layerId) => {
            if (mapRef.current?.getLayer(layerId)) {
              mapRef.current.setLayoutProperty(layerId, "visibility", nextVisible ? "visible" : "none");
            }
          });
        }}
        onToggleEsaWorldcover={() => {
          const nextVisible = !esaWorldcoverVisible;
          setEsaWorldcoverVisible(nextVisible);
          if (mapRef.current?.getLayer("esa-worldcover-2021")) {
            mapRef.current.setLayoutProperty("esa-worldcover-2021", "visibility", nextVisible ? "visible" : "none");
          }
        }}
        onToggleEsaCorineComparison={() => {
          const nextVisible = !esaCorineCompareVisible;
          const map = mapRef.current;
          setEsaCorineCompareVisible(nextVisible);
          if (nextVisible) {
            // Karşılaştırma iki veri için de ortak olan 8. zoomdan başlar ve
            // eğimsiz görünümde tutulur; böylece sınırlar optik olarak kaymaz.
            if (map) {
              map.easeTo({ zoom: Math.max(map.getZoom(), 8), bearing: 0, pitch: 0, duration: 360 });
            }
            setEsaWorldcoverVisible(false);
            if (map?.getLayer("esa-worldcover-2021")) map.setLayoutProperty("esa-worldcover-2021", "visibility", "none");
            setCorineLandcoverVisible(true);
            if (map?.getLayer("corine-landcover-fill")) {
              map.setLayoutProperty("corine-landcover-fill", "visibility", "visible");
              map.setPaintProperty("corine-landcover-fill", "fill-opacity", 0.84);
            }
            // Kıyas sırasında CORINE sınır çizgisi kapatılır: ESA rasterı ile
            // iki tarafın görsel yoğunluğu eşit olur.
            if (map?.getLayer("corine-landcover-outline")) map.setLayoutProperty("corine-landcover-outline", "visibility", "none");
          } else if (map) {
            if (map.getLayer("corine-landcover-fill")) map.setPaintProperty("corine-landcover-fill", "fill-opacity", 0.38);
            if (corineLandcoverVisible && map.getLayer("corine-landcover-outline")) map.setLayoutProperty("corine-landcover-outline", "visibility", "visible");
          }
        }}
        onToggleSinkholeInventoryHeatmap={() => toggleDataLayer(
          !sinkholeInventoryHeatmapVisible,
          setSinkholeInventoryHeatmapVisible,
          "sinkhole-inventory-heatmap",
          ["sinkhole-inventory-heatmap"],
          "/layers/obruk-envanter-319"
        )}
        onToggleCriticalService={() => toggleDataLayer(
          !criticalServiceVisible,
          setCriticalServiceVisible,
          "critical-service-load",
          ["critical-service-load-fill", "critical-service-load-outline"],
          "/layers/kritik-tesis-hizmet-yuku"
        )}
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
      <div className="quick-actions" aria-label="Hızlı araçlar">
        <button className="data-sources-button" type="button" onClick={() => setDataSourcesOpen(true)} title="Veri kaynakları tablosunu aç">
          ▤ <span>Veri Kaynakları</span>
        </button>
        <span className="quick-actions-divider" aria-hidden="true" />
        <button className="quick-actions-guide" onClick={() => { setGuideStep(-1); setGuideOpen(true); }} title="Kullanıcı rehberini aç">
          ? Rehber
        </button>
      </div>
      {guideOpen && <>
        {guideStep < 0 ? <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.56)", backdropFilter: "blur(3px)" }} /> : guideTargetRect && <div style={{ position: "fixed", left: guideTargetRect.left, top: guideTargetRect.top, width: guideTargetRect.width, height: guideTargetRect.height, zIndex: 1000, borderRadius: "16px", border: "2px solid #f59e0b", boxShadow: "0 0 0 9999px rgba(15,23,42,0.58), 0 0 28px rgba(245,158,11,0.62)", pointerEvents: "none" }} />}
        <div key={`guide-dialog-${guideStep}`} role="dialog" aria-modal="true" style={{ position: "fixed", zIndex: 1001, left: "50%", top: guideDialogPlacement.top, bottom: guideDialogPlacement.bottom, transform: "translateX(-50%)", width: guideDialogPlacement.width, maxHeight: guideDialogPlacement.maxHeight, overflowY: "auto", padding: guideDialogPlacement.padding, borderRadius: "16px", background: "rgba(255,255,255,0.97)", color: "#0f172a", boxShadow: "0 16px 42px rgba(15,23,42,0.32)" }}>
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

