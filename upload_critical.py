import geopandas as gpd
from sqlalchemy import create_engine
gdf = gpd.read_file( r"D:\we-konya-webgis\data\data\ilce_nufuslu_hast_ashi_itfa" )
gdf = gdf.to_crs(epsg=4326)
engine = create_engine( "postgresql://postgres:postgres@localhost:5432/webgis" )
gdf.to_postgis( "ilce_nufuslu_hast_ashi_itfa", engine, if_exists="replace", index=False )
print("AKTARILDI")