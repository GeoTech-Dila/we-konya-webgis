import re
import tempfile
import unicodedata
import zipfile
from pathlib import Path

import geopandas as gpd
from geoalchemy2 import Geometry
from sqlalchemy import create_engine, text


DATABASE_URL = "postgresql://postgres:postgres@postgis:5432/webgis"
# Docker container icindeki veri klasorleri.
# Host makinede beklenen duzen:
# webgis/
#   data/                 # verilerin oldugu klasor yolu
#   we-konya-webgis/
# Bu script `docker-compose.import.yml` ile calistiginda `../data`
# container icinde `/external-data` olarak okunur.
DATA_DIR = Path("/data")
EXTERNAL_DATA_DIR = Path("/external-data")
WGS84_CRS = "EPSG:4326"

engine = create_engine(DATABASE_URL)


def zip_source(zip_name, inner_path=None):
    path = EXTERNAL_DATA_DIR / zip_name
    if inner_path:
        return f"zip://{path.as_posix()}!{inner_path}"
    return f"zip://{path.as_posix()}"


def safe_column_name(column_name):
    normalized = unicodedata.normalize("NFKD", str(column_name))
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^0-9a-zA-Z]+", "_", ascii_name).strip("_").lower()
    if not ascii_name:
        ascii_name = "alan"
    if ascii_name[0].isdigit():
        ascii_name = f"alan_{ascii_name}"
    return ascii_name


def normalize_columns(gdf):
    geometry_name = gdf.geometry.name
    used = set()
    rename_map = {}

    for column in gdf.columns:
        if column == geometry_name:
            continue

        base_name = safe_column_name(column)
        next_name = base_name
        counter = 2
        while next_name in used or next_name == "geom":
            next_name = f"{base_name}_{counter}"
            counter += 1

        used.add(next_name)
        rename_map[column] = next_name

    return gdf.rename(columns=rename_map)


def prepare_gdf(gdf):
    if gdf.empty:
        gdf = gdf.set_crs(WGS84_CRS, allow_override=True)
    elif gdf.crs is None:
        gdf = gdf.set_crs(WGS84_CRS, allow_override=True)
    else:
        gdf = gdf.to_crs(WGS84_CRS)

    gdf = normalize_columns(gdf)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    return gdf.rename_geometry("geom")


def import_layer(table_name, source, layer=None, **kwargs):
    if layer:
        gdf = gpd.read_file(source, layer=layer, **kwargs)
    else:
        gdf = gpd.read_file(source, **kwargs)

    gdf = prepare_gdf(gdf)
    gdf.to_postgis(
        table_name,
        engine,
        if_exists="replace",
        index=False,
        dtype={"geom": Geometry("GEOMETRY", srid=4326)},
    )

    with engine.begin() as conn:
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS "{table_name}_geom_idx" ON "{table_name}" USING GIST (geom)'))
        conn.execute(text(f'ANALYZE "{table_name}"'))

    print(f"{table_name}: {len(gdf)} kayit aktarildi")


def import_zipped_shapefile(table_name, zip_name, suffix, **kwargs):
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        with zipfile.ZipFile(EXTERNAL_DATA_DIR / zip_name) as archive:
            archive.extractall(temp_path)

        suffix = suffix.replace("\\", "/").lower()
        matches = [
            path
            for path in temp_path.rglob("*.shp")
            if path.as_posix().lower().endswith(suffix)
        ]
        if not matches:
            raise FileNotFoundError(f"{zip_name} icinde {suffix} bulunamadi")

        import_layer(table_name, matches[0], **kwargs)


def main():
    jobs = [
        ("konya_il_siniri", EXTERNAL_DATA_DIR / "konya_il_siniri.geojson", None, {}),
        ("konya_fay_hatlari", zip_source("fay_hatlari_konya.zip"), "fay_hatlari_konya", {}),
        ("konya_yollar", zip_source("yollar.zip"), "yollar", {}),
        ("konya_parklar", zip_source("parklar.zip"), "parklar2", {}),
        ("konya_obruklar", zip_source("obruk.zip", "obruk/obruk331.shp"), None, {"engine": "fiona", "encoding": "CP1254"}),
        ("konya_kolluk", zip_source("kolluk.zip", "kolluk/kolluk.shp"), None, {"engine": "fiona", "encoding": "CP1254"}),
        ("konya_saglik_nokta", zip_source("saglik.zip", "saglik/poi_saglik.shp"), None, {"engine": "fiona", "encoding": "CP1254"}),
        ("konya_saglik_alan", zip_source("saglik.zip", "saglik/poly_saglik.shp"), None, {"engine": "fiona", "encoding": "CP1254"}),
        ("konya_acil_durum", EXTERNAL_DATA_DIR / "acil_durum.gpkg", "konya_acil_durum_noktalar", {}),
    ]

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))

    for table_name, source, layer, kwargs in jobs:
        import_layer(table_name, source, layer=layer, **kwargs)

    import_zipped_shapefile(
        "konya_toplu_ulasim_nokta",
        "toplu ula\u015f\u0131m.zip",
        "poi_toplu.shp",
        engine="fiona",
        encoding="CP1254",
    )
    import_zipped_shapefile(
        "konya_toplu_ulasim_alan",
        "toplu ula\u015f\u0131m.zip",
        "poly_toplu.shp",
        engine="fiona",
        encoding="CP1254",
    )


if __name__ == "__main__":
    main()
