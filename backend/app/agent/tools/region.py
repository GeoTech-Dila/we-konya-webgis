from typing import Any

from app.agent.registry import RegisteredTool, ToolRegistry


def _normalized(value: str) -> str:
    return value.casefold().replace("ı", "i").strip()


def _properties(context: Any, level: str) -> list[dict[str, Any]]:
    summary = context.get_region_summary(level)
    return [feature.get("properties", {}) for feature in summary.get("features", [])]


def get_region_summary(*, context: Any, region_name: str, level: str) -> dict[str, Any]:
    target = _normalized(region_name)
    rows = _properties(context, level)
    exact = next((row for row in rows if _normalized(str(row.get("region_name", ""))) == target), None)
    if exact:
        return exact

    matches = [row for row in rows if target in _normalized(str(row.get("region_name", "")))]
    if len(matches) == 1:
        return matches[0]
    return {
        "found": False,
        "message": "Bölge bulunamadı veya ad birden fazla bölgeyle eşleşti.",
        "possible_matches": [row.get("region_name") for row in matches[:10]],
    }


def get_assembly_area_stats(*, context: Any, region_name: str, level: str) -> dict[str, Any]:
    result = get_region_summary(context=context, region_name=region_name, level=level)
    if result.get("found") is False:
        return result
    return {
        "region_name": result["region_name"],
        "region_level": result["region_level"],
        "assembly_count": result["assembly_count"],
        "area_km2": result["area_km2"],
        "capacity_index": result["capacity_index"],
        "critical_facility_count": result["critical_facility_count"],
        "note": "Toplanma alanı sayısı bölge alanı ve kritik tesislerle birlikte değerlendirilmelidir.",
    }


def get_most_problematic_regions(*, context: Any, level: str, limit: int) -> dict[str, Any]:
    limit = max(1, min(limit, 10))
    rows = sorted(
        _properties(context, level),
        key=lambda row: (row.get("resilience_score", 100), -row.get("risk_index", 0)),
    )[:limit]
    fields = (
        "region_name", "region_level", "resilience_score", "resilience_level",
        "risk_index", "capacity_index", "emergency_count", "sinkhole_count",
        "fault_length_km", "assembly_count", "critical_facility_count",
    )
    return {"regions": [{key: row.get(key) for key in fields} for row in rows]}


def get_region_count(*, context: Any, level: str) -> dict[str, Any]:
    rows = _properties(context, level)
    return {
        "level": level,
        "region_type": "ilçe" if level == "district" else "mahalle",
        "count": len(rows),
        "source": "KOR-İZ PostGIS bölge analizi",
    }


def compare_regions(
    *, context: Any, first_region: str, second_region: str, level: str
) -> dict[str, Any]:
    first = get_region_summary(context=context, region_name=first_region, level=level)
    second = get_region_summary(context=context, region_name=second_region, level=level)
    if first.get("found") is False or second.get("found") is False:
        return {"found": False, "first": first, "second": second}

    fields = (
        "region_name", "resilience_score", "resilience_level", "risk_index",
        "capacity_index", "emergency_count", "sinkhole_count", "fault_length_km",
        "assembly_count", "critical_facility_count", "area_km2",
    )
    return {
        "level": level,
        "first": {key: first.get(key) for key in fields},
        "second": {key: second.get(key) for key in fields},
    }


RANKABLE_METRICS = {
    "resilience_score", "risk_index", "capacity_index", "emergency_count",
    "sinkhole_count", "fault_length_km", "assembly_count",
    "critical_facility_count", "area_km2",
}


def rank_regions_by_metric(
    *, context: Any, level: str, metric: str, order: str, limit: int
) -> dict[str, Any]:
    if metric not in RANKABLE_METRICS:
        return {"error": "Desteklenmeyen gösterge", "supported_metrics": sorted(RANKABLE_METRICS)}
    limit = max(1, min(limit, 10))
    descending = order != "lowest"
    rows = sorted(
        _properties(context, level),
        key=lambda row: float(row.get(metric) or 0),
        reverse=descending,
    )[:limit]
    return {
        "level": level,
        "metric": metric,
        "order": "highest" if descending else "lowest",
        "regions": [
            {
                "region_name": row.get("region_name"),
                metric: row.get(metric),
                "resilience_score": row.get("resilience_score"),
                "risk_index": row.get("risk_index"),
            }
            for row in rows
        ],
    }


LEVEL_SCHEMA = {"type": "string", "enum": ["district", "neighborhood"]}


def register_region_tools(registry: ToolRegistry) -> None:
    registry.register(RegisteredTool(
        name="get_region_summary",
        description="Bir Konya ilçesi veya mahallesi için güncel afet risk ve dirençlilik özetini getirir.",
        parameters={
            "type": "object",
            "properties": {
                "region_name": {"type": "string", "description": "İlçe veya mahalle adı"},
                "level": LEVEL_SCHEMA,
            },
            "required": ["region_name", "level"],
            "additionalProperties": False,
        },
        handler=get_region_summary,
    ))
    registry.register(RegisteredTool(
        name="get_assembly_area_stats",
        description="Bir bölgenin toplanma alanı sayısını ve ilgili kapasite göstergelerini getirir.",
        parameters={
            "type": "object",
            "properties": {"region_name": {"type": "string"}, "level": LEVEL_SCHEMA},
            "required": ["region_name", "level"],
            "additionalProperties": False,
        },
        handler=get_assembly_area_stats,
    ))
    registry.register(RegisteredTool(
        name="get_most_problematic_regions",
        description="Dirençlilik skoru en düşük olan ilçe veya mahalleleri sıralar.",
        parameters={
            "type": "object",
            "properties": {
                "level": LEVEL_SCHEMA,
                "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["level", "limit"],
            "additionalProperties": False,
        },
        handler=get_most_problematic_regions,
    ))
    registry.register(RegisteredTool(
        name="get_region_count",
        description="PostGIS analizindeki toplam Konya ilçe veya mahalle sayısını getirir.",
        parameters={
            "type": "object",
            "properties": {"level": LEVEL_SCHEMA},
            "required": ["level"],
            "additionalProperties": False,
        },
        handler=get_region_count,
    ))
    registry.register(RegisteredTool(
        name="compare_regions",
        description="İki ilçe veya mahalleyi mevcut risk ve kapasite göstergeleriyle karşılaştırır.",
        parameters={
            "type": "object",
            "properties": {
                "first_region": {"type": "string"},
                "second_region": {"type": "string"},
                "level": LEVEL_SCHEMA,
            },
            "required": ["first_region", "second_region", "level"],
            "additionalProperties": False,
        },
        handler=compare_regions,
    ))
    registry.register(RegisteredTool(
        name="rank_regions_by_metric",
        description="İlçe veya mahalleleri seçilen GIS göstergesine göre sıralar.",
        parameters={
            "type": "object",
            "properties": {
                "level": LEVEL_SCHEMA,
                "metric": {"type": "string", "enum": sorted(RANKABLE_METRICS)},
                "order": {"type": "string", "enum": ["highest", "lowest"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["level", "metric", "order", "limit"],
            "additionalProperties": False,
        },
        handler=rank_regions_by_metric,
    ))
