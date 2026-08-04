from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from functools import lru_cache
import os
from sqlalchemy import create_engine
from sqlalchemy.sql import text
import json
import random
from app.resilience import build_region_summary

app = FastAPI()

app.add_middleware(GZipMiddleware, minimum_size=1000)

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


def bbox_filter(bbox):
    if not bbox:
        return "", {}

    try:
        minx, miny, maxx, maxy = [float(value) for value in bbox.split(",")]
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="bbox minx,miny,maxx,maxy formatında olmalı.",
        )

    return (
        """
        WHERE ST_Intersects(
            ST_Transform(geom, 4326),
            ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
        )
        """,
        {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy},
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
def mahalleler(bbox: str | None = None):
    where_sql, params = bbox_filter(bbox)
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(features.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(
                    ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), 0.0001)
                )::json,
                'properties', json_build_object(
                    'id', id,
                    'adi_numara', adi_numara
                )
            ) AS feature
            FROM konya_mahalleler
            {where_sql}
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


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
                'properties', COALESCE(to_jsonb(konya_toplanma) - 'geom', '{}'::jsonb)
            ) AS feature
            FROM konya_toplanma
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/oneri-toplanma-alanlari")
def oneri_toplanma_alanlari():
    """Return non-official park-based assembly-area recommendations."""
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(features.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', COALESCE(
                    to_jsonb(konya_oneri_toplanma_alanlari_2025) - 'geom',
                    '{}'::jsonb
                )
            ) AS feature
            FROM konya_oneri_toplanma_alanlari_2025
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/yollar")
def yollar(bbox: str | None = None):
    where_sql, params = bbox_filter(bbox)
    query = text(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(features.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', json_build_object('id', id)
            ) AS feature
            FROM konya_yollar
            {where_sql}
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


@app.get("/service-area-15-polygons")
def service_area_15_polygons(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)
    query = text(f"""
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
            {where_sql}

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

@app.get("/service-area-10-polygons")
def service_area_10_polygons(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)
    query = text(f"""
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
            {where_sql}

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

@app.get("/service-area-5-polygons")
def service_area_5_polygons(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)
    query = text(f"""
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
            {where_sql}

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


@app.get("/service-area-15-lines")
def service_area_15_lines(bbox: str | None = None):
            where_sql, params = bbox_filter(bbox)
            query = text(f"""
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
                    {where_sql}

                ) AS f;
            """)

            with engine.connect() as conn:
                return conn.execute(query, params).scalar()

@app.get("/service-area-10-lines")
def service_area_10_lines(bbox: str | None = None):
        where_sql, params = bbox_filter(bbox)
        query = text(f"""
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
                {where_sql}

            ) AS f;
        """)

        with engine.connect() as conn:
            return conn.execute(query, params).scalar()

@app.get("/service-area-5-lines")
def service_area_5_lines(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)
    query = text(f"""
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
            {where_sql}

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


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
                'properties', to_jsonb(t) - 'geom'
            ) AS feature
            FROM konya_obruklar t
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


@app.get("/tiles/ana-yollar/{z}/{x}/{y}.pbf", response_class=Response)
def ana_yollar_tile(z: int, x: int, y: int):
    """Return visible road segments as a compact map vector tile."""
    query = text("""
        WITH tile_bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857
        ),
        mvt_rows AS (
            SELECT
                r.id,
                ST_AsMVTGeom(ST_Transform(r.geom, 3857), t.geom_3857, 4096, 64, true) AS geom
            FROM konya_yollar r
            CROSS JOIN tile_bounds t
            WHERE ST_Intersects(ST_Transform(r.geom, 3857), t.geom_3857)
        )
        SELECT ST_AsMVT(mvt_rows, 'roads', 4096, 'geom')
        FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(
        content=bytes(tile),
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/layers/ana-yollar")
def ana_yollar(bbox: str | None = None):
    # konya_yollar tablosundan ana yolları döndür
    where_sql, params = bbox_filter(bbox)
    query = text(f"""
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
            {where_sql}
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


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
@lru_cache(maxsize=2)
def region_summary(level: str = "district"):
    return build_region_summary(engine, level)

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

@app.get("/tiles/buildings-3d/{z}/{x}/{y}.pbf", response_class=Response)
def buildings_3d_tile(z: int, x: int, y: int):
    """Return only the buildings in one map tile as a vector tile."""
    query = text("""
        WITH tile_bounds AS (
            SELECT
                ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
        ),
        mvt_rows AS (
            SELECT
                b.id,
                15::integer AS height,
                ST_AsMVTGeom(ST_Transform(b.geom, 3857), t.geom_3857, 4096, 64, true) AS geom
            FROM konya_buildings b
            CROSS JOIN tile_bounds t
            WHERE b.geom && t.geom_4326
              AND ST_Intersects(b.geom, t.geom_4326)
        )
        SELECT ST_AsMVT(mvt_rows, 'buildings', 4096, 'geom')
        FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(
        content=bytes(tile),
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/buildings-3d")
def buildings_3d(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)

    query = text(f"""
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
                    'height',
15
                )

            ) AS feature

            FROM konya_buildings

{where_sql}

LIMIT 3000

        ) AS f;
    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

@app.get("/inaccessible-buildings-heatmap")
def inaccessible_buildings_heatmap(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)
    query = text(f"""

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
            {where_sql}

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


@app.get("/buildings-5")
def buildings_5(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)

    query = text(f"""

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

            {where_sql}

            LIMIT 3000

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


@app.get("/buildings-10")
def buildings_10(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)

    query = text(f"""

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

            {where_sql}

            LIMIT 3000

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

@app.get("/buildings-15")
def buildings_15(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)

    query = text(f"""

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

            {where_sql}

            LIMIT 3000

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

@app.get("/buildings-unreachable")
def buildings_unreachable(bbox: str | None = None):

    where_sql, params = bbox_filter(bbox)

    query = text(f"""

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

            {where_sql}

            LIMIT 3000

        ) AS f;

    """)

    with engine.connect() as conn:
        return conn.execute(query, params).scalar()

