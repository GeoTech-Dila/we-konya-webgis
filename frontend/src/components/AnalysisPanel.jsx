import { useRef, useState } from "react";

const analysisCards = [
  {
    id: "groundwater",
    title: "Yeraltı Suyu & Obruk",
    method: "IDW Interpolation",
    status: "Hazırlanıyor",
    summary:
      "Yeraltı su seviyesi düşümü ile obruk oluşumları arasındaki korelasyonu yüzey analizi olarak üretir.",
    inputs: ["Kuyu ölçüm noktaları", "Obruk envanteri", "Zaman aralığı"],
    output: "Risk yüzeyi ve yüksek duyarlılık zonları",
    image: "/heatmap1_gorsel.png",
  },
  {
    id: "exposure",
    title: "Kritik Altyapı Maruziyeti",
    method: "Select by Location + Buffer",
    status: "Gerçek veri hazır",
    summary:
      "Sağlık tesisi, okul, bina ve altyapıların fay tamponu veya obruk duyarlı alanlarla çakışmasını bulur.",
    inputs: ["Kritik tesis katmanı", "Risk bölgesi", "Tampon mesafesi"],
    output: "Risk altında kalan tesis listesi",
    image: "/network_centrality_gorsel.png",
  },
  {
    id: "vulnerability",
    title: "Sosyo-Ekonomik Kırılganlık ve Jeolojik Tehlike",
    method: "İlçe Bazlı Birleşik Risk Sınıflaması",
    status: "Doğrulanmış analiz hazır",
    summary:
      "İlçelerin sosyo-ekonomik kırılganlığını, fay uzunluğu ve obruk varlığıyla birlikte değerlendirir. Mevcut mahalle dirençlilik skorundan bağımsız bir ilçe analizidir.",
    inputs: ["Sosyo-ekonomik grup oranları", "2026 aktif fay verisi", "Obruk envanteri"],
    output: "1–4 derece birleşik jeolojik ve sosyo-ekonomik risk grubu",
    image: "/kirilganlik_gorsel.png",
  },
  {
    id: "service-area",
    title: "Toplanma Alanı Erişilebilirliği",
    method: "Network Analysis - Service Area",
    status: "Gerçek veri hazır",
    summary:
      "5, 10 ve 15 dakikalık yürüme erişim alanlarını hesaplayıp dışarıda kalan bölgeleri işaretler.",
    inputs: ["Toplanma alanları", "Yol ağı", "Yürüme hızı"],
    output: "Erişim alanları ve erişimi kısıtlı bölgeler",
    image: "/service_area1_gorsel.png",
  },
  {
    id: "logistics",
    title: "Lojistik Güzergahlar",
    method: "Network Analysis",
    status: "Gerçek veri hazır",
    summary:
      "Acil ulaşım yollarının afet bölgelerinden geçip geçmediğini inceler ve alternatif sevkiyat rotaları üretir.",
    inputs: ["Acil ulaşım yolları", "Afet bölgesi", "Kapanan yollar"],
    output: "Alternatif rota önerileri",
    image: "/network_centrality_gorsel.png",
  },
  {
    id: "sinkhole-building",
    title: "Obrukların Arazi Kullanımı Dağılımı",
    method: "ESA WorldCover 2021 · 10 m Mekânsal Çakıştırma",
    status: "Doğrulanmış analiz hazır",
    summary: "319 kayıtlı obruğun ESA WorldCover 2021 arazi örtüsü sınıflarıyla kesişimini gösterir.",
    inputs: ["319 obruk envanteri", "ESA WorldCover 2021", "10 m arazi örtüsü sınıfları"],
    output: "Obrukların tarım, mera, su ve yapılaşmış alanlardaki dağılımı",
    image: "/heatmap1_gorsel.png",
  },
  {
    id: "facility-access",
    title: "Kritik Tesis Servis Etki Alanı ve Hizmet Yükü",
    method: "Mekansal Sayım + Hizmet Yükü İndeksi",
    status: "Doğrulanmış analiz hazır",
    summary: "İtfaiye, ASHİ/112 ve hastanelerin ilçe nüfusu ile yapı stoğu karşısındaki hizmet yükünü değerlendirir.",
    inputs: ["İtfaiye istasyonları", "ASHİ / 112 noktaları", "Hastaneler", "İlçe nüfusu", "Yapı stoğu"],
    output: "1-4 derece kritik tesis yeterliliği ve öncelikli yatırım alanları",
    image: "/service_area1_gorsel.png",
  },
  {
    id: "recommended-assembly",
    title: "AFAD Ön Elemesi: Öneri Toplanma Alanları",
    method: "Nüfus + Güvenli Park Parçası Analizi",
    status: "Ön eleme senaryosu hazır",
    summary:
      "Parkların binalardan 30 m uzakta kalan güvenli bölümlerini, obruk ve fay çakışmalarını ve 2025 mahalle nüfusunu birlikte değerlendirir.",
    inputs: ["2025 mahalle nüfusu", "Park alanları", "Bina ayak izleri", "Fay hatları", "Obruklar"],
    output: "Resmî olmayan, AFAD odaklı ön elemeden geçen güvenli park parçaları",
    image: "/service_area1_gorsel.png",
  },
  {
    id: "resilience",
    title: "Afet Dirençlilik Skoru",
    method: "Ağırlıklı skor modeli",
    status: "Model taslağı",
    summary:
      "Tüm analizlerden gelen göstergeleri birleştirerek her mahalle veya ilçeye dirençlilik skoru verir.",
    inputs: ["Erişilebilirlik", "Maruziyet", "Kırılganlık", "Altyapı"],
    output: "0-100 afet dirençlilik skoru",
    image: "/3danaliz_gorsel.png",
  },
];

function AnalysisPanel({
  analysisOpen,
  setAnalysisOpen,
  service5Visible,
  setService5Visible,
  service10Visible,
  setService10Visible,
  service15Visible,
  setService15Visible,
  serviceOpacity,
  setServiceOpacity,
  buildingsVisible,
  setBuildingsVisible,
  buildingsOpacity,
  setBuildingsOpacity,

  buildings5Visible,
  setBuildings5Visible,

  buildings10Visible,
  setBuildings10Visible,

  buildings15Visible,
  setBuildings15Visible,

  buildingsUnreachableVisible,
  setBuildingsUnreachableVisible,

  heatmapVisible,
  setHeatmapVisible,



  heatmapOpacity,
  setHeatmapOpacity,

  recommendedAssemblyVisible,
  selectedAssemblyScenario,
  assemblyScenarioLoading,
  onToggleRecommendedAssembly,
  socioGeologicalVisible,
  onToggleSocioGeological,
  criticalServiceVisible,
  onToggleCriticalService,
  sinkholeInventoryHeatmapVisible,
  onToggleSinkholeInventoryHeatmap,

  activeAnalysisLayer,
  setActiveAnalysisLayer,

}) {
  const [activeCardId, setActiveCardId] = useState("service-area");
  const [panelHeight, setPanelHeight] = useState(() => (
    typeof window !== "undefined" && window.innerWidth <= 768
      ? Math.max(340, Math.floor(window.innerHeight * 0.62))
      : 250
  ));
  const resizeStart = useRef(null);

  const startResize = (event) => {
    if (!analysisOpen) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panelHeight;
    const onMove = (moveEvent) => {
      const nextHeight = startHeight + (startY - moveEvent.clientY);
      const mobile = window.innerWidth <= 768;
      const minHeight = mobile ? 340 : 250;
      const maxHeight = Math.floor(window.innerHeight * 0.78);
      setPanelHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      resizeStart.current = null;
    };
    resizeStart.current = { onMove, onEnd };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  };
  const activeCard = analysisCards.find((card) => card.id === activeCardId) || analysisCards[0];
  const [socioInfoOpen, setSocioInfoOpen] = useState(false);
  const [criticalFacilityInfoOpen, setCriticalFacilityInfoOpen] = useState(false);

  return (
    <>


      <aside
      id="analysis-panel"
      className="analysis-panel"
      style={{
        position: "absolute",
        left: 20,

right: 390,

bottom: analysisOpen ? 18 : -(panelHeight - 48),

height: `${panelHeight}px`,

        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(255,255,255,0.16)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 18px 50px rgba(15,23,42,0.28)",
        transition: "bottom 0.35s ease",
      }}
      aria-label="Analiz paneli"
    >
      {analysisOpen && <div
        onPointerDown={startResize}
        title="Panel yüksekliğini ayarlamak için yukarı veya aşağı sürükleyin"
        style={{
          height: "14px", flexShrink: 0, cursor: "ns-resize", touchAction: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ width: "46px", height: "4px", borderRadius: "2px", background: "rgba(71,85,105,0.45)" }} />
      </div>}
      <div
  onClick={() => setAnalysisOpen(!analysisOpen)}
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "2px 14px",
    gap: 12,
    cursor: "pointer",
    borderBottom: "1px solid rgba(255,255,255,0.16)",
    minHeight: "48px",
  }}
>
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
    <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 700 }}>
      KONYA WEBGIS
    </div>

    <div style={{ fontSize: "15px", fontWeight: "800" }}>
      Analiz Katmanları
    </div>
  </div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      borderRadius: "999px",
      background: "rgba(255,255,255,0.28)",
      color: "#64748b",
      fontSize: "15px",
      fontWeight: "900",
      transition: "0.25s",
      flexShrink: 0,
    }}
  >
    {analysisOpen ? "▼" : "▲"}
  </div>
</div>
      <div
        className="analysis-panel-content"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, 0.95fr) minmax(360px, 1.05fr)",
          gap: 14,
          minHeight: 0,
          flex: 1,
          padding: 10,
        }}
      >
        <div
          className="analysis-card-list"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {analysisCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveCardId(card.id)}
              style={{
                minHeight: 52,
                border: `1px solid ${activeCardId === card.id ? "#2563eb" : "rgba(255,255,255,0.18)"}`,
                borderRadius: 12,
                overflow: "hidden",
                background: activeCardId === card.id ? "rgba(239,246,255,0.84)" : "rgba(255,255,255,0.2)",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
                boxShadow: activeCardId === card.id ? "0 8px 22px rgba(37,99,235,0.18)" : "none",
              }}
            >
              <div style={{ height: "100%" }}>
  <div
    style={{
      padding: 10,
      minWidth: 0,
      width: "100%",
    }}
  >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 8, color: "#64748b", marginTop: 3 }}>{card.method}</div>

                </div>
              </div>
            </button>
          ))}
        </div>

        <div
  className="analysis-detail"
  style={{
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    borderRadius: 18,

    background:
      "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(240,245,255,0.92))",



    color: "#0f172a",

    border: "1px solid rgba(168,85,247,0.22)",

    backdropFilter: "blur(18px)",

    boxShadow: "0 18px 45px rgba(139,92,246,0.10)",

    overflow: "hidden",
  }}
>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ color: "#6366f1", fontSize: 12, fontWeight: 800 }}>{activeCard.method}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{activeCard.title}</div>
              {activeCard.id === "facility-access" && (
                <button
                  type="button"
                  aria-label="Kritik tesis hizmet yükü analizi hakkında bilgi"
                  title="Analiz yöntemi hakkında bilgi"
                  onClick={() => setCriticalFacilityInfoOpen((open) => !open)}
                  style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", border: "1px solid #fca5a5", background: "#fff7f7", color: "#b91c1c", cursor: "pointer", fontWeight: 800, lineHeight: 1 }}
                >ⓘ</button>
              )}
              {activeCard.id === "vulnerability" && (
                <button
                  type="button"
                  aria-label="Analiz yöntemi hakkında bilgi"
                  title="Analiz yöntemi hakkında bilgi"
                  onClick={() => setSocioInfoOpen((open) => !open)}
                  style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", border: "1px solid #94a3b8", background: "#ffffff", color: "#475569", cursor: "pointer", fontWeight: 800, lineHeight: 1 }}
                >ⓘ</button>
              )}
            </div>
            {activeCard.id === "facility-access" && criticalFacilityInfoOpen && (
              <div style={{ marginTop: 8, padding: "12px", borderRadius: 11, background: "#fff7f7", border: "1px solid #fecaca", color: "#7f1d1d", fontSize: 11, lineHeight: 1.55, maxHeight: 250, overflowY: "auto" }}>
                <strong style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Kritik tesis hizmet yükü neyi gösterir?</strong>
                <p style={{ margin: "0 0 8px" }}>Bu analiz, Konya ilçelerindeki itfaiye istasyonları, Acil Sağlık Hizmetleri İstasyonları (ASHİ/112) ve hastanelerin; nüfus ve yapı stoğu karşısında yeterli olup olmadığını karşılaştırır. Amaç yalnızca tesisin varlığını değil, afet veya kriz anında kapasite aşımı ve operasyonel yetersizlik olasılığını görünür kılmaktır.</p>
                <strong>1. Mekânsal sayım</strong>
                <p style={{ margin: "3px 0 8px" }}>Her ilçe poligonu içinde kalan itfaiye, ASHİ ve hastane noktaları sayılır. Böylece tesislerin ilçe içindeki mevcut dağılımı analiz edilir.</p>
                <strong>2. Hizmet yükü hesapları</strong>
                <ul style={{ margin: "3px 0 8px", paddingLeft: 17 }}>
                  <li><b>İtfaiye yükü:</b> ilçedeki yapı sayısı ÷ itfaiye sayısıdır. Yapı başına müdahale kapasitesini temsil eder.</li>
                  <li><b>ASHİ yükü:</b> ilçe nüfusu ÷ ASHİ sayısıdır. İlk tıbbi müdahaleye yetişme baskısını gösterir.</li>
                  <li><b>Hastane yükü:</b> ilçe nüfusu ÷ hastane sayısıdır. Afet sonrası yataklı tedavi ve ağır müdahale kapasitesi baskısını gösterir.</li>
                </ul>
                <strong>3. Risk puanlama ve sınıflama</strong>
                <p style={{ margin: "3px 0 8px" }}>Her üç yük değeri 1 ile 5 arasında puanlanır. Tesisi hiç bulunmayan ilçeler doğrudan en yüksek risk puanını alır; tesis başına düşen nüfus veya yapı sayısı büyüdükçe risk de yükselir. Üç puanın toplamı 3-15 arasındadır: 3-5 yeterli altyapı, 6-8 orta düzey, 9-11 yüksek tesis yükü, 12-15 çok yüksek kritik tesis yetersizliği olarak gösterilir.</p>
                <strong>Nasıl yorumlanmalı?</strong>
                <p style={{ margin: "3px 0" }}>Kırmızı ve turuncu ilçeler, yeni itfaiye istasyonu, 112 noktası, hastane kapasitesi veya ayrıntılı saha değerlendirmesi için öncelik taşıyan yerleri işaret eder. Bu katman resmî yatırım kararı vermez; kaynak planlamasını destekleyen ilçe ölçekli karşılaştırmalı bir karar destek çıktısıdır.</p>
              </div>
            )}
            {activeCard.id === "vulnerability" && socioInfoOpen && (
              <div style={{ marginTop: 8, padding: "10px 11px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12", fontSize: 11, lineHeight: 1.5 }}>
                <strong style={{ display: "block", marginBottom: 4 }}>Bu analiz neyi gösterir?</strong>
                Fay uzunluğu ve obruk varlığıyla hesaplanan jeolojik tehlike puanı (1–5), alt ve en alt sosyo-ekonomik grupların oranıyla hesaplanan kırılganlık puanıyla (1–5) birleştirilir. Toplam puan 4–9 aralığındadır; amaç müdahale, sakınım ve kaynak önceliği için ilçe ölçeğinde karar desteği sağlamaktır. Bu, mevcut mahalle dirençlilik skorundan bağımsız bir analizdir.
              </div>
            )}
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 4, lineHeight: 1.3 }}>{activeCard.summary}</div>
          </div>

          {activeCard.id === "service-area" ? (
            <ServiceAreaControls
              service5Visible={service5Visible}
              setService5Visible={setService5Visible}
              service10Visible={service10Visible}
              setService10Visible={setService10Visible}
              service15Visible={service15Visible}
              setService15Visible={setService15Visible}
              serviceOpacity={serviceOpacity}
              setServiceOpacity={setServiceOpacity}
              buildingsVisible={buildingsVisible}
              setBuildingsVisible={setBuildingsVisible}

              buildingsOpacity={buildingsOpacity}
              setBuildingsOpacity={setBuildingsOpacity}

              buildings5Visible={buildings5Visible}
              setBuildings5Visible={setBuildings5Visible}

              buildings10Visible={buildings10Visible}
              setBuildings10Visible={setBuildings10Visible}

              buildings15Visible={buildings15Visible}
              setBuildings15Visible={setBuildings15Visible}

              buildingsUnreachableVisible={buildingsUnreachableVisible}
              setBuildingsUnreachableVisible={setBuildingsUnreachableVisible}

              heatmapVisible={heatmapVisible}
              setHeatmapVisible={setHeatmapVisible}

              heatmapOpacity={heatmapOpacity}
              setHeatmapOpacity={setHeatmapOpacity}

            />
           ) : (
            <AnalysisInfo
              card={activeCard}
              activeAnalysisLayer={activeAnalysisLayer}
              setActiveAnalysisLayer={setActiveAnalysisLayer}
              recommendedAssemblyVisible={recommendedAssemblyVisible}
              selectedAssemblyScenario={selectedAssemblyScenario}
              assemblyScenarioLoading={assemblyScenarioLoading}
              onToggleRecommendedAssembly={onToggleRecommendedAssembly}
              socioGeologicalVisible={socioGeologicalVisible}
              onToggleSocioGeological={onToggleSocioGeological}
              criticalServiceVisible={criticalServiceVisible}
              onToggleCriticalService={onToggleCriticalService}
              sinkholeInventoryHeatmapVisible={sinkholeInventoryHeatmapVisible}
              onToggleSinkholeInventoryHeatmap={onToggleSinkholeInventoryHeatmap}
            />
          )}
        </div>
      </div>
    </aside>
    </>
  );
}

function AnalysisInfo({ card, activeAnalysisLayer, setActiveAnalysisLayer, recommendedAssemblyVisible, selectedAssemblyScenario, assemblyScenarioLoading, onToggleRecommendedAssembly, socioGeologicalVisible, onToggleSocioGeological, criticalServiceVisible, onToggleCriticalService, sinkholeInventoryHeatmapVisible, onToggleSinkholeInventoryHeatmap }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 2,
        padding: 4,
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      {card.id === "vulnerability" && (
        <div style={{ gridColumn: "1 / -1", padding: "4px 4px 0" }}>
          <button type="button" onClick={onToggleSocioGeological} style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1px solid rgba(220,38,38,0.45)", background: socioGeologicalVisible ? "rgba(254,226,226,0.88)" : "rgba(255,255,255,0.12)", color: "#991b1b", cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            {socioGeologicalVisible ? "✓ İlçe Risk Analizini Gizle" : "▶ İlçe Risk Analizini Haritada Göster"}
          </button>
          <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,247,237,0.74)", color: "#7c2d12", fontSize: 11, lineHeight: 1.45 }}>
            Skor, jeolojik risk ile sosyo-ekonomik riskin toplamıdır. Aşağıdaki lejant haritada görünen renkleri açıklar.
          </div>
          <div style={{ marginTop: 8, padding: "9px 10px", borderRadius: 10, background: "rgba(255,255,255,0.78)", border: "1px solid rgba(148,163,184,0.36)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#334155", marginBottom: 7 }}>Harita Lejantı · Birleşik Risk Puanı</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
              {[
                ["#15803d", "4–5", "Düşük"],
                ["#eab308", "6", "Orta"],
                ["#f97316", "7–8", "Yüksek"],
                ["#dc2626", "9", "Kritik"],
              ].map(([color, score, label]) => (
                <div key={label} style={{ minWidth: 0 }}>
                  <div style={{ height: 8, borderRadius: 4, background: color, marginBottom: 4 }} />
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#334155" }}>{score}</div>
                  <div style={{ fontSize: 8, color: "#64748b" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {card.id === "recommended-assembly" && (
        <div style={{ gridColumn: "1 / -1", padding: "4px 4px 0" }}>
          <button
            type="button"
            onClick={onToggleRecommendedAssembly}
            style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1px solid rgba(245,158,11,0.55)", background: recommendedAssemblyVisible ? "rgba(254,243,199,0.82)" : "rgba(255,255,255,0.12)", color: "#92400e", cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 6 }}
          >
            {recommendedAssemblyVisible ? "✓ AFAD Ön Eleme Alanlarını Gizle" : "▶ AFAD Ön Eleme Alanlarını Haritada Göster"}
          </button>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#92400e", padding: "0 4px 7px" }}>
            Bu alanlar resmî toplanma alanı değildir. Bina yüksekliği yerine 30 m sabit uzaklık kullanılmıştır; saha incelemesi ve yetkili kurum değerlendirmesi gerektirir.
          </div>

          {(assemblyScenarioLoading || selectedAssemblyScenario) && (
            <div style={{ margin: "4px 4px 10px", padding: "11px", borderRadius: 10, background: "#ffffff", border: "1px solid #cbd5e1", color: "#0f172a", boxShadow: "0 6px 18px rgba(15,23,42,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, paddingBottom: 7, borderBottom: "2px solid #0f766e" }}>
                <div><div style={{ fontSize: 12, fontWeight: 800 }}>Mahalle Kapasite Senaryosu</div><div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>Nüfus ve güvenli park alanı karşılaştırması</div></div>
                <span style={{ fontSize: 8, letterSpacing: "0.06em", fontWeight: 800, color: "#0f766e", border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 4, padding: "3px 5px" }}>ÖN ELEME</span>
              </div>
              {assemblyScenarioLoading ? (
                <div style={{ fontSize: 11, color: "#475569", padding: "14px 0" }}>Seçili mahallenin senaryosu yükleniyor…</div>
              ) : (() => {
                const population = Number(selectedAssemblyScenario.nufus || 0);
                const capacity = Number(selectedAssemblyScenario.ihtiyatli_kapasite || 0);
                const requiredArea = Number(selectedAssemblyScenario.gerekli_alan_m2 || 0);
                const safeArea = Number(selectedAssemblyScenario.guvenli_alan_m2 || 0);
                const peopleMax = Math.max(population, capacity, 1);
                const areaMax = Math.max(requiredArea, safeArea, 1);
                const peopleHeight = Math.max(5, Math.round((population / peopleMax) * 76));
                const capacityHeight = capacity ? Math.max(5, Math.round((capacity / peopleMax) * 76)) : 2;
                const requiredHeight = Math.max(5, Math.round((requiredArea / areaMax) * 76));
                const safeHeight = safeArea ? Math.max(5, Math.round((safeArea / areaMax) * 76)) : 2;
                return <>
                  <div style={{ margin: "8px 0", fontSize: 10, fontWeight: 700, color: "#334155" }}>{selectedAssemblyScenario.mahalle_adi} <span style={{ color: "#94a3b8", fontWeight: 500 }}>· {selectedAssemblyScenario.oneri_alan_sayisi || 0} güvenli öneri alanı</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", marginBottom: 4 }}>KİŞİ KARŞILAŞTIRMASI</div>
                      <div style={{ height: 96, display: "flex", alignItems: "end", justifyContent: "space-evenly", backgroundImage: "repeating-linear-gradient(to top, transparent 0, transparent 23px, #e2e8f0 24px)", borderBottom: "1px solid #94a3b8" }}>
                        <div style={{ width: "38%", textAlign: "center" }}><div style={{ fontSize: 10, fontWeight: 800, marginBottom: 3 }}>{population.toLocaleString("tr-TR")}</div><div style={{ height: peopleHeight, background: "#475569", borderRadius: "3px 3px 0 0" }} /></div>
                        <div style={{ width: "38%", textAlign: "center" }}><div style={{ fontSize: 10, fontWeight: 800, marginBottom: 3, color: "#b45309" }}>{capacity.toLocaleString("tr-TR")}</div><div style={{ height: capacityHeight, background: "#f59e0b", borderRadius: "3px 3px 0 0" }} /></div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4, fontSize: 8, fontWeight: 700, color: "#475569" }}><span>Nüfus</span><span style={{ color: "#b45309" }}>Kapasite</span></div>
                    </div>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px" }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", marginBottom: 4 }}>ALAN KARŞILAŞTIRMASI (m²)</div>
                      <div style={{ height: 96, display: "flex", alignItems: "end", justifyContent: "space-evenly", backgroundImage: "repeating-linear-gradient(to top, transparent 0, transparent 23px, #e2e8f0 24px)", borderBottom: "1px solid #94a3b8" }}>
                        <div style={{ width: "38%", textAlign: "center" }}><div style={{ fontSize: 10, fontWeight: 800, marginBottom: 3 }}>{requiredArea.toLocaleString("tr-TR")}</div><div style={{ height: requiredHeight, background: "#64748b", borderRadius: "3px 3px 0 0" }} /></div>
                        <div style={{ width: "38%", textAlign: "center" }}><div style={{ fontSize: 10, fontWeight: 800, marginBottom: 3, color: "#0f766e" }}>{safeArea.toLocaleString("tr-TR")}</div><div style={{ height: safeHeight, background: "#0f766e", borderRadius: "3px 3px 0 0" }} /></div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 4, fontSize: 8, fontWeight: 700, color: "#475569" }}><span>Hedef alan</span><span style={{ color: "#0f766e" }}>Güvenli alan</span></div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 9, fontSize: 9 }}>
                    <div style={{ background: "#f8fafc", borderLeft: "3px solid #0f766e", padding: "5px 6px" }}><span style={{ color: "#64748b" }}>İhtiyatlı karşılama</span><br /><strong style={{ fontSize: 13, color: "#0f766e" }}>%{selectedAssemblyScenario.karsilama_yuzdesi || 0}</strong></div>
                    <div style={{ background: "#f8fafc", borderLeft: "3px solid #f59e0b", padding: "5px 6px" }}><span style={{ color: "#64748b" }}>Referans</span><br /><strong style={{ fontSize: 10 }}>1,29 m² / kişi</strong></div>
                  </div>
                  <div style={{ marginTop: 7, fontSize: 8, lineHeight: 1.35, color: "#64748b" }}>Not: Kapasite hesabında güvenli alanın %60’ı ihtiyatlı kullanım senaryosu olarak alınmıştır.</div>
                </>;
              })()}
            </div>
          )}
        </div>
      )}

      {card.id === "facility-access" && (
        <div style={{ gridColumn: "1 / -1", padding: "4px 4px 0" }}>
          <button type="button" onClick={onToggleCriticalService} style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1px solid rgba(220,38,38,0.45)", background: criticalServiceVisible ? "rgba(254,226,226,0.88)" : "rgba(255,255,255,0.12)", color: "#991b1b", cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 7 }}>
            {criticalServiceVisible ? "✓ Hizmet Yükü Analizini Gizle" : "▶ Hizmet Yükü Analizini Haritada Göster"}
          </button>
          <div style={{ padding: "9px 10px", borderRadius: 10, background: "rgba(255,247,237,0.74)", color: "#7c2d12", fontSize: 11, lineHeight: 1.45 }}>
            İtfaiye başına yapı sayısı; ASHİ ve hastane başına nüfus hesaplanır. Üç hizmet yükü 1-5 risk puanına dönüştürülerek toplam 3-15 puan üretilir.
          </div>
          <div style={{ marginTop: 8, padding: "9px 10px", borderRadius: 10, background: "rgba(255,255,255,0.78)", border: "1px solid rgba(148,163,184,0.36)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#334155", marginBottom: 7 }}>Harita Lejantı · Toplam Hizmet Yükü</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
              {[["#15803d", "3-5", "Yeterli"], ["#eab308", "6-8", "Orta"], ["#f97316", "9-11", "Yüksek"], ["#dc2626", "12-15", "Çok yüksek"]].map(([color, score, label]) => <div key={label}><div style={{ height: 8, borderRadius: 4, background: color, marginBottom: 4 }} /><div style={{ fontSize: 9, fontWeight: 800, color: "#334155" }}>{score}</div><div style={{ fontSize: 8, color: "#64748b" }}>{label}</div></div>)}
            </div>
          </div>
        </div>
      )}

      {card.id === "sinkhole-building" && (
        <div style={{ gridColumn: "1 / -1", padding: "4px 4px 2px" }}>
          <button type="button" onClick={onToggleSinkholeInventoryHeatmap} style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1px solid rgba(194,65,12,0.48)", background: sinkholeInventoryHeatmapVisible ? "rgba(254,215,170,0.72)" : "rgba(255,255,255,0.14)", color: "#9a3412", cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 7 }}>
            {sinkholeInventoryHeatmapVisible ? "✓ Obruk Yoğunluk Haritasını Gizle" : "▶ Obruk Yoğunluk Haritasını Göster"}
          </button>
          <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,247,237,0.78)", color: "#7c2d12", fontSize: 11, lineHeight: 1.45, marginBottom: 8 }}>
            Isı haritası, 319 kayıtlı obruğun mekânsal yoğunluğunu gösterir. Koyu renkler daha fazla envanter kaydını ifade eder; bu katman doğrudan tehlike veya risk sınıfı değildir.
          </div>
          <div style={{ borderRadius: 12, padding: "11px", background: "linear-gradient(135deg, #fffaf0, #ffffff)", border: "1px solid #fed7aa", color: "#431407" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div><div style={{ fontSize: 11, fontWeight: 800 }}>ESA WorldCover 2021 obruk arazi kullanımı</div><div style={{ fontSize: 9, color: "#9a3412", marginTop: 2 }}>10 m çözünürlük · Konya il geneli</div></div>
              <div style={{ borderRadius: 999, padding: "4px 7px", background: "#fff7ed", color: "#c2410c", fontSize: 10, fontWeight: 900 }}>319 OBRUK</div>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {[
                ["Mera, otlak ve doğal bitki", 168, "52,7", "#65a30d"],
                ["Tarım alanları", 146, "45,8", "#eab308"],
                ["Su kütleleri / göllenmiş alan", 4, "1,3", "#0284c7"],
                ["Yerleşim / yapılaşmış alan", 1, "0,3", "#64748b"],
              ].map(([label, count, percent, color]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 36px", gap: 8, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10, fontWeight: 700, marginBottom: 3 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span><span>{percent}%</span></div>
                    <div style={{ height: 8, background: "#ffedd5", borderRadius: 5, overflow: "hidden" }}><div style={{ height: "100%", width: `${Number(String(percent).replace(',', '.'))}%`, minWidth: count ? 3 : 0, borderRadius: 5, background: color }} /></div>
                  </div>
                  <strong style={{ fontSize: 12, textAlign: "right", color }}>{count}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #fed7aa" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7c2d12", marginBottom: 6 }}>CORINE 2018 ile karşılaştırma</div>
              <div style={{ fontSize: 9, color: "#9a3412", lineHeight: 1.35, marginBottom: 7 }}>Aynı 319 obruk kaydının iki farklı arazi örtüsü veri setindeki dağılımı.</div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 44px 44px", gap: "4px 7px", alignItems: "center", fontSize: 9 }}>
                <div style={{ color: "#92400e", fontWeight: 800 }}>Sınıf</div><div style={{ textAlign: "right", color: "#0369a1", fontWeight: 800 }}>ESA 2021</div><div style={{ textAlign: "right", color: "#7c3aed", fontWeight: 800 }}>CORINE</div>
                {[
                  ["Tarım alanları", "146 · %45,8", "183 · %57,4"],
                  ["Mera / doğal bitki", "168 · %52,7", "121 · %37,9"],
                  ["Su", "4 · %1,3", "0 · %0"],
                  ["Yerleşim", "1 · %0,3", "0 · %0"],
                  ["Diğer", "0 · %0", "15 · %4,7"],
                ].map(([label, esa, corine]) => <>
                  <div key={`${label}-name`} style={{ borderTop: "1px solid rgba(254,215,170,0.72)", paddingTop: 4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                  <div key={`${label}-esa`} style={{ borderTop: "1px solid rgba(254,215,170,0.72)", paddingTop: 4, textAlign: "right", color: "#0369a1", fontWeight: 700 }}>{esa}</div>
                  <div key={`${label}-corine`} style={{ borderTop: "1px solid rgba(254,215,170,0.72)", paddingTop: 4, textAlign: "right", color: "#7c3aed", fontWeight: 700 }}>{corine}</div>
                </>)}
              </div>
              <div style={{ marginTop: 7, fontSize: 8, color: "#9a3412", lineHeight: 1.35 }}>ESA 10 m çözünürlüklü daha ayrıntılı bir sınıflama sunduğu için değerlerin birebir aynı olması beklenmez.</div>
            </div>
            <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid #fed7aa", fontSize: 10, lineHeight: 1.45, color: "#7c2d12" }}>
              <b>Yorum:</b> Kayıtlı obrukların %98,4’ü tarım veya doğal açık alan sınıflarında bulunur. ESA’nın 10 m çözünürlüğü, eski CORINE 2018 genelleştirmesine göre nadas, otlak ve küçük su yüzeylerini daha ayrıntılı ayırır.
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          borderRadius: 10,
          background:
   "linear-gradient(135deg, rgba(224,231,255,0.72), rgba(233,213,255,0.58))",
          border: "1px solid rgba(180,190,255,0.18)",
          padding: 10,
          color: "black",
          fontSize: 10,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", color: "#7376F2", marginBottom: 8 }}>Kullanılacak Veriler</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {card.inputs.map((input) => (
            <span
              key={input}
              style={{
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#black",
                padding: "3px 6px",
                fontWeight: 600,
              }}
            >
              {input}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          borderRadius: 12,
          background: "rgba(240,245,255,0.82)",
          border: "1px solid rgba(255,255,255,0.09)",
          padding: 14,
          color: "#cbd5e1",
          fontSize: 10,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", color: "#7376F2", marginBottom: 8 }}>Çıktı</strong>
        <p
  style={{
    margin: 0,
    color: "black",
    fontWeight: 500,
  }}
>
  {card.output}
</p>
        <span
          style={{
            display: "inline-flex",
            marginTop: 12,
            borderRadius: 999,
            background:
  "linear-gradient(135deg, rgba(224,231,255,0.78), rgba(233,213,255,0.72))",

            color: "black",
            padding: "2px 5px",
            fontWeight: 800,
          }}
        >
          {card.status}
        </span>
      </div>
    </div>
  );
}

function ServiceAreaControls({
  service5Visible,
  setService5Visible,
  service10Visible,
  setService10Visible,
  service15Visible,
  setService15Visible,
  serviceOpacity,
  setServiceOpacity,
  buildingsVisible,
  setBuildingsVisible,

  buildingsOpacity,
  setBuildingsOpacity,

  buildings5Visible,
  setBuildings5Visible,

  buildings10Visible,
  setBuildings10Visible,

  buildings15Visible,
  setBuildings15Visible,

  buildingsUnreachableVisible,
  setBuildingsUnreachableVisible,

  heatmapVisible,
  setHeatmapVisible,

  heatmapOpacity,
  setHeatmapOpacity,

}) {
  return (
    <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",

    gap: 8,

    padding: 14,

    minHeight: 0,

    overflowY: "auto",

    maxHeight: "100%",
  }}
>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>


        <ToggleRow label="5 dk erişim" color="#22c55e" checked={service5Visible} onChange={() => setService5Visible(!service5Visible)} />
        <ToggleRow label="10 dk erişim" color="#eab308" checked={service10Visible} onChange={() => setService10Visible(!service10Visible)} />
        <ToggleRow label="15 dk erişim" color="#ef4444" checked={service15Visible} onChange={() => setService15Visible(!service15Visible)} />

        <label style={{ display: "grid", gap: 7, color: "#cbd5e1", fontSize: 8, fontWeight: 800 }}>
          Katman opaklığı
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={serviceOpacity}
            onChange={(event) => setServiceOpacity(Number(event.target.value))}
            style={{ accentColor: "#22c55e" }}
          />
        </label>
      </div>


<div
  style={{
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  }}
>

  <div
    style={{
      color: "#94a3b8",
      fontSize: 10,
      fontWeight: 800,
      marginBottom: 10,
      letterSpacing: 1,
    }}
  >
    ERİŞİM BİNALARI
  </div>

  <div
    style={{
      display: "grid",
      gap: 8,
    }}
  >

    <ToggleRow
      label="5 DK Binalar"
      color="#22c55e"
      checked={buildings5Visible}
      onChange={() =>
        setBuildings5Visible(
          !buildings5Visible
        )
      }
    />

    <ToggleRow
      label="10 DK Binalar"
      color="#f59e0b"
      checked={buildings10Visible}
      onChange={() =>
        setBuildings10Visible(
          !buildings10Visible
        )
      }
    />

    <ToggleRow
      label="15 DK Binalar"
      color="#ef4444"
      checked={buildings15Visible}
      onChange={() =>
        setBuildings15Visible(
          !buildings15Visible
        )
      }
    />

    <ToggleRow
      label="Erişilemeyen"
      color="#6b7280"
      checked={buildingsUnreachableVisible}
      onChange={() =>
        setBuildingsUnreachableVisible(
          !buildingsUnreachableVisible
        )
      }
    />

  </div>

</div>

  <div
  style={{
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.08)",
  }}
>

  <ToggleRow
    label="Alarm Heatmap"
    color="#ef4444"
    checked={heatmapVisible}
    onChange={() =>
      setHeatmapVisible(!heatmapVisible)
    }
  />

  <label
    style={{
      display: "grid",
      gap: 7,
      color: "#cbd5e1",
      fontSize: 8,
      fontWeight: 800,
      marginTop: 10,
    }}
  >
    Heatmap opaklığı

    <input
      type="range"

      min="0"
      max="1"
      step="0.05"

      value={heatmapOpacity}

      onChange={(event) =>
        setHeatmapOpacity(
          Number(event.target.value)
        )
      }

      style={{ accentColor: "#ef4444" }}
    />
  </label>

</div>

      <div
        style={{
          borderRadius: 12,
          background:
  "linear-gradient(135deg, rgba(192,132,252,0.30), rgba(129,140,248,0.28))",
          border: "1px solid rgba(255,255,255,0.09)",
          padding: 10,
          color: "#475569",
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", color: "#0f172a", marginBottom: 8 }}>Analiz Parametreleri</strong>
        Ağ tabanlı servis alanı analizi uygulanmıştır. Yaya erişilebilirliği esas alınır ve yol ağı üzerinden
        5, 10, 15 dakikalık erişim bölgeleri modellenir. Ortalama yaya hızı yaklaşık 5 km/s kabul edilmiştir.
      </div>
    </div>
  );
}

function ToggleRow({ label, color, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "3px 5px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.06)",
        color: "#1e293b",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <i style={{ width: 24, height: 4, borderRadius: 999, background: color }} />
        {label}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

export default AnalysisPanel;
