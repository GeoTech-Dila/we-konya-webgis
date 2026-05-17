from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import create_engine
from sqlalchemy.sql import text

import json

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PostgreSQL bağlantısı
DATABASE_URL = (
    "postgresql://postgres:postgres@postgis:5432/webgis"
)

engine = create_engine(DATABASE_URL)

# Test endpoint
@app.get("/")
def root():
    return {"message": "WebGIS Backend Çalışıyor"}

# Mahalle GeoJSON endpoint
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

                'geometry',
                ST_AsGeoJSON(geom)::json,

                'properties',
                json_build_object(
                    'id', id,
                    'adi_numara', adi_numara
                )

            ) AS feature

            FROM konya_mahalleler

        ) AS features;

    """)

    with engine.connect() as conn:
        result = conn.execute(query)

        geojson = result.scalar()

        return geojson





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

                'geometry',
                ST_AsGeoJSON(geom)::json,

                'properties',
json_build_object(
    'id', id,
    'name', name
)

            ) AS feature

            FROM konya_ilceler

        ) AS features;

    """)

    with engine.connect() as conn:

        result = conn.execute(query)

        geojson = result.scalar()

    return geojson

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

                'geometry',
                ST_AsGeoJSON(geom)::json,

                'properties',
                json_build_object(
                    'id', id
                )

            ) AS feature

            FROM konya_toplanma

        ) AS features;

    """)

    with engine.connect() as conn:

        result = conn.execute(query)

        geojson = result.scalar()

    return geojson

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

                'geometry',
                ST_AsGeoJSON(geom)::json,

                'properties',
                json_build_object(
                    'id', id
                )

            ) AS feature

            FROM konya_yollar

        ) AS features;

    """)

    with engine.connect() as conn:

        result = conn.execute(query)

        geojson = result.scalar()

    return geojson