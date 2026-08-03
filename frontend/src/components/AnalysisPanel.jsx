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
    title: "Sosyo-Ekonomik Kırılganlık",
    method: "Join + Graduated Symbology",
    status: "Tamamlandı",
    summary:
      "İlçe veya mahalle ölçeğinde kırılganlık göstergelerini birleştirip sınıflı tematik harita üretir.",
    inputs: ["Nüfus", "Yaş grubu", "Gelir / sosyal göstergeler"],
    output: "Kırılganlık skoru",
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
    title: "Obruk & Yapı Stoğu",
    method: "Kernel Density",
    status: "Hazırlanıyor",
    summary:
      "Obruk yoğunluk yüzeyi ile yapı stoğunu çakıştırarak yapıların duyarlılık seviyesini belirler.",
    inputs: ["Obruk noktaları", "Bina verisi", "Yoğunluk yarıçapı"],
    output: "Yapı bazlı obruk duyarlılığı",
    image: "/heatmap1_gorsel.png",
  },
  {
    id: "facility-access",

  title: "Kritik Tesis Erişilebilirliği",

  method: "Network Analysis",

  status: "Gerçek veri hazır",

  summary:
    "Afet anında kapanabilecek yolları ağdan çıkarıp kritik tesislere erişilebilirliği tekrar hesaplar.",

  inputs: [
    "Yol ağı",
    "Kritik tesisler",
    "Kapanma senaryosu"
  ],

  output: "Erişilebilir / erişilemez tesisler",

  image: "/network_centrality_gorsel.png",


  },
  {
    id: "water-stress",
    title: "Tarımsal Su Stresi",
    method: "Çok kriterli analiz",
    status: "Veri bekliyor",
    summary:
      "Tarımsal alanları su ihtiyacı, yeraltı su düşümü ve kuraklık göstergeleriyle birlikte değerlendirir.",
    inputs: ["Tarım alanları", "Sulama verisi", "Kuraklık göstergesi"],
    output: "Su stresi sınıfları",
    image: "/kirilganlik_gorsel.png",
  },
  {
    id: "service-impact",
    title: "Tesis Servis Etki Alanı",
    method: "Voronoi / Hub Distance",
    status: "Hazırlanıyor",
    summary:
      "İtfaiye veya sağlık tesislerinin hizmet alanındaki nüfusla kişi / tesis oranını hesaplar.",
    inputs: ["Tesis noktaları", "Nüfus verisi", "Hizmet alanı yöntemi"],
    output: "Tesis başına düşen nüfus",
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

  activeAnalysisLayer,
  setActiveAnalysisLayer,

}) {
  const [activeCardId, setActiveCardId] = useState("service-area");
  const [panelHeight, setPanelHeight] = useState(250);
  const resizeStart = useRef(null);

  const startResize = (event) => {
    if (!analysisOpen) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panelHeight;
    const onMove = (moveEvent) => {
      const nextHeight = startHeight + (startY - moveEvent.clientY);
      const maxHeight = Math.floor(window.innerHeight * 0.78);
      setPanelHeight(Math.max(250, Math.min(maxHeight, nextHeight)));
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

  return (
    <>


      <aside
      id="analysis-panel"
      style={{
        position: "absolute",
        left: 20,

right: 390,

bottom: analysisOpen ? 18 : -205,

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
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{activeCard.title}</div>
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
            />
          )}
        </div>
      </div>
    </aside>
    </>
  );
}

function AnalysisInfo({ card, activeAnalysisLayer, setActiveAnalysisLayer }) {
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
      {/* Kritik Tesis için analiz butonu */}
      {card.id === "facility-access" && (
        <div style={{ gridColumn: "1 / -1", padding: "4px 4px 0" }}>
          <button
            type="button"
            onClick={() => setActiveAnalysisLayer(
              activeAnalysisLayer === "critical-accessibility" ? null : "critical-accessibility"
            )}
            style={{
              width: "100%", padding: "9px 13px", borderRadius: 12,
              border: "1px solid rgba(37,99,235,0.35)",
              background: activeAnalysisLayer === "critical-accessibility"
                ? "rgba(37,99,235,0.22)" : "rgba(255,255,255,0.12)",
              color: activeAnalysisLayer === "critical-accessibility" ? "#3b82f6" : "#64748b",
              cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 6
            }}
          >
            {activeAnalysisLayer === "critical-accessibility"
              ? "✓ Analiz Aktif — Kapat"
              : "▶ Analizi Haritada Göster"}
          </button>
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
