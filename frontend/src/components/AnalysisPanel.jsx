import AnalysisCard
from "./AnalysisCard";

import { useState }
from "react";



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

isPlaying,
setIsPlaying

}) {

    const [expandedCard,
  setExpandedCard] =
  useState(null);

  return (

    <div
      style={{

        position: "absolute",

        top: 175,

        right:
          analysisOpen
            ? 100
            : -420,

        width: "380px",

        maxHeight: "calc(100vh - 220px)",

        overflowY: "scroll",
paddingBottom: "120px",

        display: "flex",

        flexDirection: "column",

        gap: "18px",

        transition: "0.35s",

        zIndex: 20
      }}
    >

      {[
  {
    title: "Service Area",
  subtitle: "Isochrone Analysis",

  image:
    "/service_area1_gorsel.png",

  active: service5Visible,

  onToggle: () =>
    setService5Visible(
      !service5Visible
    ),

  expandable: true
},

  {
    title: "Network",
    subtitle: "Route Analysis",

    image:
      "/network_centrality_gorsel.png"
  },

  {
    title: "Heatmap",
    subtitle: "Density Analysis",

    image:
      "/heatmap1_gorsel.png"
  },

  {
    title: "Kırılganlık",
    subtitle: "Analysis",

    image:
      "/kirilganlik_gorsel.png"
  },

  {
    title: "3D Analysis",
    subtitle: "Pseudo 3D",

    image:
      "/3danaliz_gorsel.png"
  },




].map((card, i) => (

  <AnalysisCard

    key={i}

    title={card.title}

    subtitle={card.subtitle}

    image={card.image}

    active={card.active}

    onToggle={card.onToggle}

    expanded={
  expandedCard === i
}

onExpand={() =>

  setExpandedCard(

    expandedCard === i
      ? null
      : i

  )

}
details={
  card.title === "Service Area" ? (

    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}
    >

      {/* Animasyon */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsPlaying(!isPlaying);
        }}
        style={{
          padding: "12px",
          borderRadius: "12px",
          border: "none",
          background: "rgba(34,197,94,0.18)",
          color: "#22c55e",
          cursor: "pointer",
          fontWeight: "700"
        }}
      >
        {isPlaying
          ? "⏸ Animasyonu Durdur"
          : "▶ Animasyonu Başlat"}
      </button>

      {/* Başlık */}
      <div>

        <div
          style={{
            fontWeight: "700",
            fontSize: "17px"
          }}
        >
          Service Area
        </div>

        <div
          style={{
            fontSize: "13px",
            opacity: 0.7
          }}
        >
          Acil durum erişilebilirlik analizi
        </div>

      </div>

      {/* Checkboxlar */}
      <label
        style={{
          display: "flex",
          justifyContent: "space-between"
        }}
      >

        <span>5 DK Service Area</span>

        <input
          type="checkbox"
          checked={service5Visible}
          onClick={(e) => e.stopPropagation()}
          onChange={() =>
            setService5Visible(!service5Visible)
          }
        />

      </label>

      <label
        style={{
          display: "flex",
          justifyContent: "space-between"
        }}
      >

        <span>10 DK Service Area</span>

        <input
          type="checkbox"
          checked={service10Visible}
          onClick={(e) => e.stopPropagation()}
          onChange={() =>
            setService10Visible(!service10Visible)
          }
        />

      </label>

      <label
        style={{
          display: "flex",
          justifyContent: "space-between"
        }}
      >

        <span>15 DK Service Area</span>

        <input
          type="checkbox"
          checked={service15Visible}
          onClick={(e) => e.stopPropagation()}
          onChange={() =>
            setService15Visible(!service15Visible)
          }
        />

      </label>

      {/* Slider */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}
      >

        <span
          style={{
            fontSize: "13px",
            opacity: 0.8
          }}
        >
          Katman Opaklığı
        </span>

        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={serviceOpacity}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setServiceOpacity(
              Number(e.target.value)
            )
          }
        />

      </div>

      {/* LEJANT */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >

          <div
            style={{
              width: "26px",
              height: "4px",
              borderRadius: "999px",
              background: "#22c55e"
            }}
          />

          <span>5 DK</span>

        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >

          <div
            style={{
              width: "26px",
              height: "4px",
              borderRadius: "999px",
              background: "#eab308"
            }}
          />

          <span>10 DK</span>

        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >

          <div
            style={{
              width: "26px",
              height: "4px",
              borderRadius: "999px",
              background: "#ef4444"
            }}
          />

          <span>15 DK</span>

        </div>

      </div>

    </div>

  ) : null
}

  />

))}

    </div>

  );

}

export default AnalysisPanel;