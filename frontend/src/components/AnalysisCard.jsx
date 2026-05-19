function AnalysisCard({

  title,
  subtitle,
  image,

  active,
  onToggle,

  expanded,
  onExpand,

  details

}) {

  return (

    <div
      onClick={onExpand}
      style={{

        background: "rgba(255,255,255,0.12)",

        border:
          "1px solid rgba(255,255,255,0.16)",

        borderRadius: "22px",

        overflow: expanded ? "visible" : "hidden",

        backdropFilter: "blur(12px)",

        transition: "0.25s",

        cursor: "pointer"
      }}
    >

      <div
        style={{

          height: "140px",

          backgroundImage: `url(${image})`,

          backgroundSize: "cover",

          backgroundPosition: "center"
        }}
      />

      <div
        style={{
          padding: "14px"
        }}
      >

        <div
          style={{

            display: "flex",

            justifyContent: "space-between",

            alignItems: "center"
          }}
        >

          <div>

            <div
              style={{
                fontWeight: "700",
                fontSize: "18px"
              }}
            >
              {title}
            </div>

            <div
              style={{
                opacity: 0.7,
                fontSize: "13px",
                marginTop: "4px"
              }}
            >
              {subtitle}
            </div>

          </div>

          <input
            type="checkbox"
            checked={active}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
          />

        </div>

      </div>

      {expanded && (

        <div
          style={{

            padding: "14px",

            borderTop:
              "1px solid rgba(255,255,255,0.12)",

            display: "flex",

            flexDirection: "column",

            gap: "14px"
          }}
        >

          {details}

        </div>

      )}

    </div>

  );

}

export default AnalysisCard;