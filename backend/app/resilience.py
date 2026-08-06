from sqlalchemy import text


def build_region_summary(engine, level="district"):
    """Beş gerçek mekânsal göstergeyle ilçe/mahalle dirençlilik özeti üretir."""
    is_neighborhood = level in {"neighborhood", "mahalle"}
    region_table = "konya_mahalleler" if is_neighborhood else "konya_ilceler"
    name_column = "adi_numara" if is_neighborhood else "name"
    level_label = "Mahalle" if is_neighborhood else "İlçe"
    simplify_tolerance = 0.0001 if is_neighborhood else 0.00003

    query = text(f"""
        WITH regions AS MATERIALIZED (
            SELECT
                id::text AS region_id,
                COALESCE({name_column}, 'Bilinmiyor') AS region_name,
                ST_Transform(geom, 3857) AS geom_metric,
                ST_Transform(geom, 4326) AS geom_wgs84,
                ST_AsGeoJSON(
                    ST_SimplifyPreserveTopology(
                        ST_Transform(geom, 4326),
                        {simplify_tolerance}
                    )
                )::json AS geometry,
                GREATEST(
                    ST_Area(ST_Transform(geom, 3857)) / 1000000.0,
                    0.001
                ) AS area_km2
            FROM {region_table}
        ),
        emergency_categories AS (
            SELECT
                r.region_id,
                COALESCE(e.birincil_etiket, 'Bilinmiyor') AS category,
                COUNT(*) AS category_count
            FROM regions r
            JOIN konya_acil_durum e
              ON e.geom && r.geom_wgs84
             AND ST_Within(e.geom, r.geom_wgs84)
            GROUP BY r.region_id, COALESCE(e.birincil_etiket, 'Bilinmiyor')
        ),
        emergency_ranked AS (
            SELECT
                region_id,
                category,
                category_count,
                SUM(category_count) OVER (PARTITION BY region_id) AS emergency_count,
                ROW_NUMBER() OVER (
                    PARTITION BY region_id
                    ORDER BY category_count DESC, category
                ) AS category_rank
            FROM emergency_categories
        ),
        emergency_stats AS (
            SELECT region_id, emergency_count, category AS top_category
            FROM emergency_ranked
            WHERE category_rank = 1
        ),
        sinkhole_stats AS (
            SELECT r.region_id, COUNT(*) AS sinkhole_count
            FROM regions r
            JOIN konya_obruklar o
              ON o.geom && r.geom_wgs84
             AND ST_Within(ST_PointOnSurface(o.geom), r.geom_wgs84)
            GROUP BY r.region_id
        ),
        assembly_stats AS (
            SELECT r.region_id, COUNT(*) AS assembly_count
            FROM regions r
            JOIN konya_toplanma a
              ON a.geom && r.geom_metric
             AND ST_Within(a.geom, r.geom_metric)
            GROUP BY r.region_id
        ),
        critical_facilities AS MATERIALIZED (
            -- Haritadaki “Kritik Tesisler” katmanıyla aynı kapsam:
            -- sağlık noktaları ve kolluk noktaları. Sağlık alanları ayrı
            -- bir katman olduğundan bu skor göstergesine dahil edilmez.
            SELECT ST_PointOnSurface(ST_Transform(geom, 3857)) AS geom
            FROM konya_saglik_nokta
            UNION ALL
            SELECT ST_PointOnSurface(ST_Transform(geom, 3857)) AS geom
            FROM konya_kolluk
        ),
        facility_stats AS (
            SELECT r.region_id, COUNT(*) AS facility_count
            FROM regions r
            JOIN critical_facilities f
              ON ST_Within(f.geom, r.geom_metric)
            GROUP BY r.region_id
        ),
        fault_stats AS (
            SELECT
                r.region_id,
                SUM(
                    ST_Length(
                        ST_Intersection(ST_Transform(f.geom, 3857), r.geom_metric)
                    )
                ) / 1000.0 AS fault_length_km
            FROM regions r
            JOIN konya_fay_hatlari f
              ON f.geom && r.geom_wgs84
             AND ST_Intersects(f.geom, r.geom_wgs84)
            GROUP BY r.region_id
        ),
        raw AS (
            SELECT
                r.*,
                COALESCE(e.emergency_count, 0)::float8 AS emergency_count,
                COALESCE(e.top_category, '') AS top_category,
                COALESCE(s.sinkhole_count, 0)::float8 AS sinkhole_count,
                COALESCE(a.assembly_count, 0)::float8 AS assembly_count,
                COALESCE(c.facility_count, 0)::float8 AS facility_count,
                COALESCE(f.fault_length_km, 0)::float8 AS fault_length_km,
                COALESCE(e.emergency_count, 0)::float8 / r.area_km2 AS emergency_density,
                COALESCE(s.sinkhole_count, 0)::float8 / r.area_km2 AS sinkhole_density,
                COALESCE(f.fault_length_km, 0)::float8 / r.area_km2 AS fault_density,
                COALESCE(a.assembly_count, 0)::float8 / r.area_km2 AS assembly_density,
                COALESCE(c.facility_count, 0)::float8 / r.area_km2 AS facility_density
            FROM regions r
            LEFT JOIN emergency_stats e USING (region_id)
            LEFT JOIN sinkhole_stats s USING (region_id)
            LEFT JOIN assembly_stats a USING (region_id)
            LEFT JOIN facility_stats c USING (region_id)
            LEFT JOIN fault_stats f USING (region_id)
        ),
        normalized AS (
            SELECT
                raw.*,
                COALESCE(
                    emergency_density / NULLIF(MAX(emergency_density) OVER (), 0),
                    0
                ) AS emergency_norm,
                COALESCE(
                    sinkhole_density / NULLIF(MAX(sinkhole_density) OVER (), 0),
                    0
                ) AS sinkhole_norm,
                COALESCE(
                    fault_density / NULLIF(MAX(fault_density) OVER (), 0),
                    0
                ) AS fault_norm,
                COALESCE(
                    assembly_density / NULLIF(MAX(assembly_density) OVER (), 0),
                    0
                ) AS assembly_norm,
                COALESCE(
                    facility_density / NULLIF(MAX(facility_density) OVER (), 0),
                    0
                ) AS facility_norm
            FROM raw
        ),
        scored AS (
            SELECT
                normalized.*,
                emergency_norm * 0.45
                    + sinkhole_norm * 0.35
                    + fault_norm * 0.20 AS risk_value,
                assembly_norm * 0.55
                    + facility_norm * 0.45 AS capacity_value
            FROM normalized
        )
        SELECT
            region_id,
            region_name,
            geometry,
            ROUND(area_km2::numeric, 2) AS area_km2,
            emergency_count::int AS emergency_count,
            top_category,
            sinkhole_count::int AS sinkhole_count,
            ROUND(fault_length_km::numeric, 2) AS fault_length_km,
            assembly_count::int AS assembly_count,
            facility_count::int AS facility_count,
            ROUND((risk_value * 100)::numeric)::int AS risk_index,
            ROUND((capacity_value * 100)::numeric)::int AS capacity_index,
            ROUND(
                LEAST(
                    100,
                    GREATEST(0, 60 + capacity_value * 35 - risk_value * 45)
                )::numeric
            )::int AS resilience_score
        FROM scored
        ORDER BY region_name
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    features = []
    for row in rows:
        score = row["resilience_score"]
        resilience_level = (
            "Güçlü" if score >= 75 else ("Orta" if score >= 55 else "Kritik")
        )
        properties = {
            "id": row["region_id"],
            "region_name": row["region_name"],
            "region_level": level_label,
            "area_km2": float(row["area_km2"]),
            "resilience_score": score,
            "resilience_level": resilience_level,
            "emergency_count": row["emergency_count"],
            "top_emergency_category": row["top_category"],
            "sinkhole_count": row["sinkhole_count"],
            "fault_length_km": float(row["fault_length_km"]),
            "assembly_count": row["assembly_count"],
            "critical_facility_count": row["facility_count"],
            "risk_index": row["risk_index"],
            "capacity_index": row["capacity_index"],
            "analysis_type": "region_resilience",
        }
        if is_neighborhood:
            properties["adi_numara"] = row["region_name"]

        features.append(
            {
                "type": "Feature",
                "geometry": row["geometry"],
                "properties": properties,
            }
        )

    return {"type": "FeatureCollection", "features": features}
