from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from sqlalchemy import create_engine
from sqlalchemy.sql import text
import json
import random

app = FastAPI()

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://we-konya-webgis.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgis:5432/webgis")

connect_args = {}
if "supabase" in DATABASE_URL or "pooler" in DATABASE_URL:
    connect_args = {
        "sslmode": "require",
        "options": "-c search_path=public,extensions",
    }

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=1,
    max_overflow=0,
    connect_args=connect_args,
)


@app.get("/")
def root():
    return {"message": "WebGIS Backend Çalışıyor"}


@app.get("/health/db")
def health_db():
    with engine.connect() as conn:
        current_database = conn.execute(text("SELECT current_database()")).scalar()
        postgis_version = conn.execute(text("SELECT PostGIS_Version()")).scalar()
        return {
            "ok": True,
            "database": current_database,
            "postgis": postgis_version,
        }


@app.get("/mahalleler")
def mahalleler():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(features.feature)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object(
                    'id', id,
                    'adi_numara', adi_numara
                )
            ) AS feature
            FROM konya_mahalleler
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/ilceler")
def ilceler():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(features.feature)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object(
                    'id', id,
                    'name', name
                )
            ) AS feature
            FROM konya_ilceler
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/toplanma-alanlari")
def toplanma_alanlari():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(features.feature)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_toplanma
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/yollar")
def yollar():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(features.feature)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_yollar
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/service-area-15-polygons")
def service_area_15_polygons():

    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )

        FROM (

            SELECT json_build_object(
                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',
                json_build_object(
                    'toplanma_id', toplanma_id,
                    'time', 15
                )

            ) AS feature

            FROM service_area_polygons

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()

@app.get("/service-area-10-polygons")
def service_area_10_polygons():

    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )

        FROM (

            SELECT json_build_object(
                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',
                json_build_object(
                    'toplanma_id', toplanma_id,
                    'time', 10
                )

            ) AS feature

            FROM service_area_10_polygons

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()

@app.get("/service-area-5-polygons")
def service_area_5_polygons():

    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )

        FROM (

            SELECT json_build_object(
                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',
                json_build_object(
                    'toplanma_id', toplanma_id,
                    'time', 5
                )

            ) AS feature

            FROM service_area_5_polygons

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/service-area-15-lines")
def service_area_15_lines():
            query = text("""
                SELECT json_build_object(
                    'type', 'FeatureCollection',
                    'features', COALESCE(json_agg(f.feature), '[]'::json)
                )

                FROM (

                    SELECT json_build_object(
                        'type', 'Feature',

                        'geometry',
                        ST_AsGeoJSON(
                            ST_Transform(geom, 4326)
                        )::json,

                        'properties',
                        json_build_object(
                            'id', id,
                            'time', 15
                        )

                    ) AS feature

                    FROM service_area_15_lines

                ) AS f;
            """)

            with engine.connect() as conn:
                return conn.execute(query).scalar()

@app.get("/service-area-10-lines")
def service_area_10_lines():
        query = text("""
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(f.feature), '[]'::json)
            )

            FROM (

                SELECT json_build_object(
                    'type', 'Feature',

                    'geometry',
                    ST_AsGeoJSON(
                        ST_Transform(geom, 4326)
                    )::json,

                    'properties',
                    json_build_object(
                        'id', id,
                        'time', 10
                    )

                ) AS feature

                FROM service_area_10_lines

            ) AS f;
        """)

        with engine.connect() as conn:
            return conn.execute(query).scalar()

@app.get("/service-area-5-lines")
def service_area_5_lines():

    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )

        FROM (

            SELECT json_build_object(
                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',
                json_build_object(
                    'id', id,
                    'time', 5
                )

            ) AS feature

            FROM service_area_5_lines

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()


# --- LAYER ENDPOINTLERİ ---

@app.get("/layers/fay-hatlari")
def fay_hatlari():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_fay_hatlari
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/obruklar")
def obruklar():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_obruklar
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/kritik-tesisler")
def kritik_tesisler():
    # Sağlık + kolluk tesislerini birleştir
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object(
                    'id', id,
                    'facility_type', 'Sağlık Tesisi',
                    'amenity', 'clinic'
                )
            ) AS feature
            FROM konya_saglik_nokta
            UNION ALL
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object(
                    'id', id,
                    'facility_type', 'Kolluk Kuvveti',
                    'amenity', 'police'
                )
            ) AS feature
            FROM konya_kolluk
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/ana-yollar")
def ana_yollar():
    # konya_yollar tablosundan ana yolları döndür
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_yollar
            LIMIT 5000
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/il-siniri")
def il_siniri():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_il_siniri t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/parklar")
def parklar():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_parklar t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/kolluk")
def kolluk():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_kolluk t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/saglik-nokta")
def saglik_nokta():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_saglik_nokta t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/saglik-alan")
def saglik_alan():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_saglik_alan t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/toplu-ulasim-nokta")
def toplu_ulasim_nokta():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_toplu_ulasim_nokta t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/toplu-ulasim-alan")
def toplu_ulasim_alan():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_toplu_ulasim_alan t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/acil-durum")
def acil_durum():
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_acil_durum t
        ) AS f;
    """)
    with engine.connect() as conn:
        result = conn.execute(query).scalar()
        if result is None:
            return {"type": "FeatureCollection", "features": []}
        return result


# --- REGION SUMMARY ---

@app.get("/analysis/region-summary")
def region_summary(level: str = "district"):
    """
    Mahalle veya ilçe bazında afet dirençlilik özeti.
    Gerçek verilerden toplanma alanı sayısı hesaplanır,
    diğer metrikler şimdilik deterministik mock skorlarla üretilir.
    """

    if level == "district":
        # İlçeleri getir
        ilce_query = text("""
            SELECT id, name,
                   ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry
            FROM konya_ilceler
            ORDER BY name
        """)

        with engine.connect() as conn:
            rows = conn.execute(ilce_query).fetchall()

        features = []
        for row in rows:
            ilce_id = row[0]
            name = row[1] or "Bilinmiyor"

            # Deterministik skor (id bazlı, her çalıştırmada aynı)
            seed = sum(ord(c) for c in name)
            score = 40 + (seed % 55)
            level_label = "Yüksek" if score >= 75 else ("Orta" if score >= 55 else "Kritik")

            features.append({
                "type": "Feature",
                "geometry": row[2],
                "properties": {
                    "region_name": name,
                    "region_level": "İlçe",
                    "resilience_score": score,
                    "resilience_level": level_label,
                    "emergency_count": seed % 30,
                    "top_emergency_category": "YANGIN" if seed % 3 == 0 else ("DEPREM" if seed % 3 == 1 else "SEL_TASKIN"),
                    "sinkhole_count": seed % 8,
                    "fault_length_km": round((seed % 20) + 1.5, 1),
                    "assembly_count": (seed % 12) + 1,
                    "critical_facility_count": (seed % 20) + 2,
                    "risk_index": 100 - score,
                    "capacity_index": score - 5 + (seed % 10),
                    "analysis_type": "region_resilience",
                },
            })

        return {"type": "FeatureCollection", "features": features}

    else:
        # Mahalle bazında — gerçek toplanma alanı sayısı ile
        mahalle_query = text("""
            SELECT
                m.id,
                m.adi_numara,
                ST_AsGeoJSON(ST_Transform(m.geom, 4326))::json AS geometry,
                COUNT(t.id) AS toplanma_sayisi
            FROM konya_mahalleler m
            LEFT JOIN konya_toplanma t
                ON ST_Within(ST_Transform(t.geom, 4326), ST_Transform(m.geom, 4326))
            GROUP BY m.id, m.adi_numara, m.geom
            ORDER BY m.adi_numara
        """)

        with engine.connect() as conn:
            rows = conn.execute(mahalle_query).fetchall()

        features = []
        for row in rows:
            name = row[1] or "Bilinmiyor"
            toplanma = int(row[3] or 0)

            seed = sum(ord(c) for c in name)
            # Toplanma alanı sayısı skoru etkilesin
            score = min(95, max(20, 35 + (seed % 45) + min(toplanma * 5, 20)))
            level_label = "Yüksek" if score >= 75 else ("Orta" if score >= 55 else "Kritik")

            features.append({
                "type": "Feature",
                "geometry": row[2],
                "properties": {
                    "region_name": name,
                    "region_level": "Mahalle",
                    "resilience_score": score,
                    "resilience_level": level_label,
                    "emergency_count": seed % 15,
                    "top_emergency_category": "YANGIN" if seed % 3 == 0 else ("DEPREM" if seed % 3 == 1 else "SEL_TASKIN"),
                    "sinkhole_count": seed % 4,
                    "fault_length_km": round((seed % 10) + 0.5, 1),
                    "assembly_count": toplanma,
                    "critical_facility_count": (seed % 8) + 1,
                    "risk_index": 100 - score,
                    "capacity_index": max(10, score - 8 + (seed % 15)),
                    "analysis_type": "region_resilience",
                },
            })

        return {"type": "FeatureCollection", "features": features}

@app.get("/layers/ilce_nufuslu_hast_ashi_itfa")
def ilce_nufuslu_hast_ashi_itfa():

    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry',
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json,

                'properties',
json_build_object(
    'id', id,
    'risk_level', risk_level
)

            ) AS feature
            FROM ilce_nufuslu_hast_ashi_itfa
        ) AS f;
    """)

    with engine.connect() as conn:
        result = conn.execute(query).scalar()

        if result is None:
            return {
                "type": "FeatureCollection",
                "features": []
            }

        return result

@app.get("/buildings-3d")
def buildings_3d():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'access_level', access_level,
                    'height', 12
                )

            ) AS feature

            FROM buildings_access_levels

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()

@app.get("/inaccessible-buildings-heatmap")
def inaccessible_buildings_heatmap():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'weight', 1
                )

            ) AS feature

            FROM inaccessible_building_points

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/buildings-5")
def buildings_5():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'height', 12
                )

            ) AS feature

            FROM buildings_5

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/buildings-10")
def buildings_10():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'height', 12
                )

            ) AS feature

            FROM buildings_10

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()

@app.get("/buildings-15")
def buildings_15():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'height', 12
                )

            ) AS feature

            FROM buildings_15

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()

@app.get("/buildings-unreachable")
def buildings_unreachable():

    query = text("""

        SELECT json_build_object(

            'type', 'FeatureCollection',

            'features',
            COALESCE(json_agg(f.feature), '[]'::json)

        )

        FROM (

            SELECT json_build_object(

                'type', 'Feature',

                'geometry',
                ST_AsGeoJSON(
                    ST_Transform(geom, 4326)
                )::json,

                'properties',

                json_build_object(
                    'id', id,
                    'height', 12
                )

            ) AS feature

            FROM buildings_unreachable

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query).scalar()
