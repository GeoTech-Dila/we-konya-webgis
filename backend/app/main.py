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
from io import BytesIO
from math import pi

import numpy as np
from PIL import Image
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from dotenv import load_dotenv
from app.resilience import build_region_summary
from app.agent.router import router as agent_router

load_dotenv()

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

# Konya'nın mevcut ESA WorldCover 2021 kapsamı.
ESA_WORLDCOVER_COG_URL = os.getenv("ESA_WORLDCOVER_COG_URL", "https://lrxzolwbujpmxfeljldc.supabase.co/storage/v1/object/public/map-data/esa_worldcover_2021_konya_mevcut_kapsam_10m_3857_cog%20%281%29.tif")

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

app.state.db_engine = engine
app.include_router(agent_router)


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


def mahalle_bbox_filter(bbox):
    """4326 mahalle geometrileri için GIST indeksinden yararlanan alan filtresi."""
    if not bbox:
        return "", {}

    try:
        minx, miny, maxx, maxy = [float(value) for value in bbox.split(",")]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="bbox minx,miny,maxx,maxy formatında olmalı.")

    return (
        """
        WHERE geom && ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
          AND ST_Intersects(geom, ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326))
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
def mahalleler(bbox: str | None = None, detail: str = "detailed"):
    """Return simplified boundaries for overview, detailed boundaries for the current viewport."""
    where_sql, params = mahalle_bbox_filter(bbox)
    tolerance = 0.0025 if detail == "overview" else 0.00008
    query = text(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(features.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(
                    ST_SimplifyPreserveTopology(ST_Transform(geom, 4326), {tolerance})
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


@app.get("/layers/kritik-tesis-hizmet-yuku")
def kritik_tesis_hizmet_yuku():
    """Return district critical-facility service-load analysis."""
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', COALESCE(to_jsonb(t) - 'geom', '{}'::jsonb)
            ) AS feature
            FROM public.konya_ilce_kritik_tesis_hizmet_yuku_2026 AS t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/sosyo-ekonomik-jeolojik-tehlike")
def sosyo_ekonomik_jeolojik_tehlike():
    """Return the verified district SES + geological hazard layer."""
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', COALESCE(to_jsonb(t) - 'geom', '{}'::jsonb)
            ) AS feature
            FROM public.konya_ilce_sosyo_jeolojik_risk_2026 AS t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/karapinar-lojistik-rotalar")
def karapinar_loji_rotalar():
    """Return the pilot area's fast-risky and safe alternative routes."""
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', COALESCE(to_jsonb(t) - 'geom', '{}'::jsonb)
            ) AS feature
            FROM public.karapinar_afet_lojistik_rotalar_2026 AS t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/karapinar-lojistik-izokron-10dk")
def karapinar_loji_izokron():
    """Return the 10-minute AFAD logistics-base access bands."""
    query = text("""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::json,
                'properties', COALESCE(to_jsonb(t) - 'geom', '{}'::jsonb)
            ) AS feature
            FROM public.karapinar_afet_lojistik_izokron_10dk_2026 AS t
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/layers/oneri-toplanma-alanlari")
def oneri_toplanma_alanlari():
    """Return preliminary AFAD-oriented safe-park assembly-area scenarios."""
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
                    to_jsonb(konya_oneri_toplanma_alanlari_afad_2025) - 'geom',
                    '{}'::jsonb
                )
            ) AS feature
            FROM konya_oneri_toplanma_alanlari_afad_2025
        ) AS features;
    """)
    with engine.connect() as conn:
        return conn.execute(query).scalar()


@app.get("/analysis/oneri-toplanma-ozet/{mahalle_id}")
def oneri_toplanma_ozet(mahalle_id: str):
    """Return the small, selected-neighborhood assembly scenario payload."""
    query = text("""
        SELECT json_build_object(
            'mahalle_id', n.mahalle_id,
            'mahalle_adi', n.mahalle_adi,
            'ilce_adi', n.ilce_adi,
            'nufus', n.nufus,
            'gerekli_alan_m2', ROUND((n.nufus::numeric * 1.29)::numeric, 1),
            'oneri_alan_sayisi', COUNT(o.*)::int,
            'guvenli_alan_m2', COALESCE(ROUND(SUM(o.bina_ve_obruklardan_guvenli_alan_m2)::numeric, 1), 0),
            'ihtiyatli_kapasite', COALESCE(SUM(o.ihtiyatli_kisi_kapasitesi), 0)::bigint,
            'karsilama_yuzdesi', COALESCE(
                ROUND((SUM(o.ihtiyatli_kisi_kapasitesi)::numeric / NULLIF(n.nufus, 0) * 100)::numeric, 1), 0
            )
        )
        FROM public.konya_mahalle_nufus n
        LEFT JOIN public.konya_oneri_toplanma_alanlari_afad_2025 o
          ON o.mahalle_id = n.mahalle_id
        WHERE n.yil = 2025 AND n.mahalle_id = :mahalle_id
        GROUP BY n.mahalle_id, n.mahalle_adi, n.ilce_adi, n.nufus
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {'mahalle_id': mahalle_id}).scalar()
    if result is None:
        raise HTTPException(status_code=404, detail="Mahalle nüfus kaydı bulunamadı")
    return result


@app.get("/analysis/oneri-toplanma-skor-senaryosu/{mahalle_id}")
def oneri_toplanma_skor_senaryosu(mahalle_id: str):
    """Return the precomputed, non-official score comparison for one neighborhood."""
    query = text("""
        SELECT json_build_object(
            'mahalle_id', region_id,
            'mahalle_adi', region_name,
            'mevcut_skor', mevcut_skor,
            'senaryo_skor', senaryo_skor,
            'puan_farki', senaryo_skor - mevcut_skor,
            'mevcut_toplanma_alani_sayisi', mevcut_toplanma_alani_sayisi,
            'oneri_alan_sayisi', oneri_alan_sayisi,
            'senaryo_toplanma_alani_sayisi', senaryo_toplanma_alani_sayisi,
            'guvenli_alan_m2', guvenli_alan_m2,
            'ihtiyatli_kapasite', ihtiyatli_kapasite,
            'senaryo_kapasite_endeksi', senaryo_kapasite_endeksi,
            'calculated_at', calculated_at
        )
        FROM public.mahalle_oneri_toplanma_skor_senaryosu_2026
        WHERE region_id = :mahalle_id
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {'mahalle_id': mahalle_id}).scalar()
    if result is None:
        raise HTTPException(status_code=404, detail="Öneri alan skor senaryosu henüz hazırlanmadı")
    return result


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


SERVICE_AREA_TILESETS = {
    "5-polygons": ("service_area_5_polygons", "service5polygons", ("toplanma_id",)),
    "10-polygons": ("service_area_10_polygons", "service10polygons", ("toplanma_id",)),
    "15-polygons": ("service_area_polygons", "service15polygons", ("toplanma_id",)),
    "5-lines": ("service_area_5_lines", "service5lines", ("id",)),
    "10-lines": ("service_area_10_lines", "service10lines", ("id",)),
    "15-lines": ("service_area_15_lines", "service15lines", ("id",)),
}


@app.get("/tiles/service-area/{layer}/{z}/{x}/{y}.pbf", response_class=Response)
def service_area_tile(layer: str, z: int, x: int, y: int):
    """Return one compact, cached tile from an existing service-area table."""
    config = SERVICE_AREA_TILESETS.get(layer)
    if config is None:
        raise HTTPException(status_code=404, detail="Erişilebilirlik karo katmanı bulunamadı.")
    table, layer_name, properties = config
    columns = ", ".join(properties)
    query = text(f"""
        WITH tile_bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857
        ), mvt_rows AS (
            SELECT {columns},
                   ST_AsMVTGeom(s.geom, t.geom_3857, 4096, 32, true) AS geom
            FROM public.{table} s
            CROSS JOIN tile_bounds t
            WHERE s.geom && t.geom_3857
              AND ST_Intersects(s.geom, t.geom_3857)
        )
        SELECT ST_AsMVT(mvt_rows, '{layer_name}', 4096, 'geom') FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(
        content=bytes(tile),
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=86400"},
    )


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


@app.get("/tiles/corine-2018/{z}/{x}/{y}.pbf", response_class=Response)
def corine_2018_tile(z: int, x: int, y: int):
    """Return only one visible CORINE map tile as a compact binary payload."""
    query = text("""
        WITH tile_bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857
        ),
        mvt_rows AS (
            SELECT
                c.id,
                c.code_18,
                c.area_ha,
                ST_AsMVTGeom(ST_Transform(c.geom, 3857), t.geom_3857, 4096, 32, true) AS geom
            FROM public.konya_corine_2018 c
            CROSS JOIN tile_bounds t
            WHERE c.geom && ST_Transform(t.geom_3857, 4326)
              AND ST_Intersects(c.geom, ST_Transform(t.geom_3857, 4326))
        )
        SELECT ST_AsMVT(mvt_rows, 'corine', 4096, 'geom') FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(
        content=bytes(tile),
        media_type="application/vnd.mapbox-vector-tile",
        headers={"Cache-Control": "public, max-age=86400"},
    )


WEB_MERCATOR_LIMIT = 20037508.342789244


def _web_mercator_tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    width = (WEB_MERCATOR_LIMIT * 2) / (1 << z)
    minx = -WEB_MERCATOR_LIMIT + x * width
    maxx = minx + width
    maxy = WEB_MERCATOR_LIMIT - y * width
    miny = maxy - width
    return minx, miny, maxx, maxy


@lru_cache(maxsize=512)
def _esa_worldcover_png(z: int, x: int, y: int) -> bytes:
    """COG'dan tek bir görünür 256 px PNG karosu üretir ve bellekte önbelleğe alır."""
    if z < 5 or z > 16:
        return b""

    minx, miny, maxx, maxy = _web_mercator_tile_bounds(z, x, y)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff",
        GDAL_HTTP_MULTIRANGE="YES",
    ):
        with rasterio.open(ESA_WORLDCOVER_COG_URL) as dataset:
            left, bottom, right, top = dataset.bounds
            if maxx <= left or minx >= right or maxy <= bottom or miny >= top:
                return b""
            window = from_bounds(minx, miny, maxx, maxy, transform=dataset.transform)
            band_indexes = [1, 2] if dataset.count >= 2 else [1]
            data = dataset.read(
                band_indexes,
                window=window,
                out_shape=(len(band_indexes), 256, 256),
                boundless=True,
                fill_value=0,
                resampling=Resampling.nearest,
            )
            palette = dataset.colormap(1)

    lut = np.zeros((256, 4), dtype=np.uint8)
    for value, rgba in palette.items():
        if 0 <= value < 256:
            lut[value] = rgba
    rgba = lut[data[0]]
    alpha = data[1] if len(data) > 1 else np.where(data[0] == 0, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], alpha)
    image = Image.fromarray(rgba, mode="RGBA")
    payload = BytesIO()
    image.save(payload, format="PNG", optimize=True)
    return payload.getvalue()


@app.get("/tiles/esa-worldcover-2021/{z}/{x}/{y}.png", response_class=Response)
def esa_worldcover_2021_tile(z: int, x: int, y: int):
    """ESA WorldCover 2021'i yalnızca ekranda gereken raster karo olarak döndürür."""
    try:
        tile = _esa_worldcover_png(z, x, y)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ESA raster karosu okunamadı: {exc}") from exc
    return Response(content=tile, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/layers/corine-2018")
def corine_2018(bbox: str | None = None):
    """Return only the visible, simplified CORINE 2018 polygons."""
    where_sql, params = mahalle_bbox_filter(bbox)
    query = text(f"""
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(f.feature), '[]'::json)
        )
        FROM (
            SELECT json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00012))::json,
                'properties', json_build_object('id', id, 'code_18', code_18, 'area_ha', area_ha)
            ) AS feature
            FROM public.konya_corine_2018
            {where_sql}
        ) AS f;
    """)
    with engine.connect() as conn:
        return conn.execute(query, params).scalar()


@app.get("/tiles/toplanma-alanlari-geometri/{z}/{x}/{y}.pbf", response_class=Response)
def toplanma_alani_geometri_tile(z: int, x: int, y: int):
    """Return only the visible official assembly-area polygons as a compact MVT tile."""
    query = text("""
        WITH tile_bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                   ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
        ), mvt_rows AS (
            SELECT a.id,
                   a.adi,
                   ST_AsMVTGeom(ST_Transform(a.geom, 3857), t.geom_3857, 4096, 32, true) AS geom
            FROM public.konya_toplanma_alanlari_geometri_2026 a
            CROSS JOIN tile_bounds t
            WHERE a.geom && t.geom_4326
              AND ST_Intersects(a.geom, t.geom_4326)
        )
        SELECT ST_AsMVT(mvt_rows, 'toplanmaalanlari', 4096, 'geom') FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(content=bytes(tile), media_type="application/vnd.mapbox-vector-tile", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/tiles/obruk-envanter-319/{z}/{x}/{y}.pbf", response_class=Response)
def obruk_envanter_319_tile(z: int, x: int, y: int):
    """Return only visible records from the verified 319-point sinkhole inventory."""
    query = text("""
        WITH tile_bounds AS (
            SELECT ST_TileEnvelope(:z, :x, :y) AS geom_3857,
                   ST_Transform(ST_TileEnvelope(:z, :x, :y), 4326) AS geom_4326
        ), mvt_rows AS (
            SELECT o.id,
                   o.obruk_adi,
                   o.ilce,
                   o.derinlik,
                   o.alan,
                   ST_AsMVTGeom(ST_Transform(o.geom, 3857), t.geom_3857, 4096, 32, true) AS geom
            FROM public.konya_obruk_envanter_319_2026 o
            CROSS JOIN tile_bounds t
            WHERE o.geom && t.geom_4326
              AND ST_Intersects(o.geom, t.geom_4326)
        )
        SELECT ST_AsMVT(mvt_rows, 'obrukenvanter', 4096, 'geom') FROM mvt_rows;
    """)
    with engine.connect() as conn:
        tile = conn.execute(query, {"z": z, "x": x, "y": y}).scalar() or b""
    return Response(content=bytes(tile), media_type="application/vnd.mapbox-vector-tile", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/layers/obruk-envanter-319")
def obruk_envanter_319():
    """Return the verified 319-point sinkhole inventory for the density heatmap."""
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
                    'obruk_adi', obruk_adi,
                    'ilce', ilce,
                    'derinlik', derinlik,
                    'alan', alan
                )
            ) AS feature
            FROM public.konya_obruk_envanter_319_2026
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




@app.get("/layers/acil-durum-ozet")
def acil_durum_ozet():
    """Return small event totals for the overview card without loading the event list."""
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM konya_acil_durum")).scalar() or 0
        categories = conn.execute(text("""
            SELECT COALESCE(birincil_etiket, 'Kategori yok') AS category, COUNT(*)::integer AS count
            FROM konya_acil_durum
            GROUP BY COALESCE(birincil_etiket, 'Kategori yok')
            ORDER BY count DESC, category
        """)).mappings().all()
        last_updated = conn.execute(text("SELECT MAX(tarih_utc) FROM konya_acil_durum")).scalar()
    return {
        "total": int(total),
        "categories": [dict(row) for row in categories],
        "last_updated": last_updated.isoformat() if last_updated else None,
    }


@app.get("/layers/acil-durum-sayfa")
def acil_durum_sayfa(category: str | None = None, page: int = 1, page_size: int = 10):
    """Return one compact page for the event list; the map heatmap keeps using the full endpoint."""
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    offset = (page - 1) * page_size
    params = {"category": category, "limit": page_size, "offset": offset}
    where_sql = "WHERE (:category IS NULL OR COALESCE(birincil_etiket, 'Kategori yok') = :category)"

    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT COUNT(*) FROM konya_acil_durum {where_sql}"), params).scalar() or 0
        overall_total = conn.execute(text("SELECT COUNT(*) FROM konya_acil_durum")).scalar() or 0
        category_rows = conn.execute(text("""
            SELECT DISTINCT COALESCE(birincil_etiket, 'Kategori yok') AS category
            FROM konya_acil_durum
            ORDER BY category
        """)).all()
        result = conn.execute(text(f"""
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
                {where_sql}
                ORDER BY tarih_utc DESC NULLS LAST, kayit_id DESC
                LIMIT :limit OFFSET :offset
            ) AS f
        """), params).scalar() or {"type": "FeatureCollection", "features": []}

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "overall_total": overall_total,
        "categories": [row[0] for row in category_rows],
        "features": result.get("features", []),
    }
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


def cached_region_summary(level: str, district_id: str | None = None):
    """Read fast, precomputed resilience properties and join the live geometry."""
    normalized_level = "mahalle" if level in {"mahalle", "neighborhood"} else "district"
    region_table = "konya_mahalleler" if normalized_level == "mahalle" else "konya_ilceler"
    tolerance = 0.0001 if normalized_level == "mahalle" else 0.00003
    district_join = ""
    district_where = ""
    query_params = {"level": normalized_level}
    if normalized_level == "mahalle" and district_id:
        district_join = "JOIN public.konya_ilceler d ON ST_Intersects(ST_PointOnSurface(r.geom), d.geom)"
        district_where = "AND d.id::text = :district_id"
        query_params["district_id"] = district_id
    exists_query = text("""
        SELECT EXISTS(SELECT 1 FROM public.region_resilience_cache WHERE analysis_level = :level)
    """)
    with engine.connect() as conn:
        if not conn.execute(exists_query, {"level": normalized_level}).scalar():
            return None
        query = text(f"""
            WITH features AS (
                SELECT c.region_name, json_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Transform(r.geom, 4326), {tolerance}))::json,
                    'properties', c.properties
                ) AS feature
                FROM public.region_resilience_cache c
                JOIN public.{region_table} r ON r.id::text = c.region_id
                {district_join}
                WHERE c.analysis_level = :level {district_where}
            )
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(feature ORDER BY region_name), '[]'::json))
            FROM features
        """)
        return conn.execute(query, query_params).scalar()


@app.get("/analysis/resilience-district-options")
def resilience_district_options():
    query = text("""
        SELECT region_id AS id, region_name AS name
        FROM public.region_resilience_cache
        WHERE analysis_level = 'district'
        ORDER BY region_name
    """)
    with engine.connect() as conn:
        return [dict(row._mapping) for row in conn.execute(query).all()]


# --- REGION SUMMARY ---

@app.get("/analysis/region-summary")
def region_summary(level: str = "district", district_id: str | None = None):
    cached = cached_region_summary(level, district_id)
    return cached if cached is not None else build_region_summary(engine, level)

@app.get("/analysis/region-detail")
def region_detail(level: str = "mahalle", region_id: str = ""):
    """Return one precomputed region score without loading every neighborhood."""
    normalized_level = "mahalle" if level in {"mahalle", "neighborhood"} else "district"
    query = text("""
        SELECT properties
        FROM public.region_resilience_cache
        WHERE analysis_level = :level AND region_id = :region_id
    """)
    with engine.connect() as conn:
        result = conn.execute(query, {"level": normalized_level, "region_id": region_id}).scalar()
    if result is None:
        raise HTTPException(status_code=404, detail="Hazır skor bulunamadı")
    return result


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
