import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import types

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import build_tool_registry
from app.resilience import build_region_summary


@dataclass
class GISContext:
    engine: Any
    _summary_cache: dict[str, dict[str, Any]] = field(default_factory=dict)

    def get_region_summary(self, level: str) -> dict[str, Any]:
        normalized = "mahalle" if level == "neighborhood" else "district"
        if normalized not in self._summary_cache:
            self._summary_cache[normalized] = build_region_summary(self.engine, normalized)
        return self._summary_cache[normalized]


@lru_cache(maxsize=1)
def get_registry():
    return build_tool_registry()


class AgentService:
    def __init__(self, engine: Any, client: Any | None = None) -> None:
        self.context = GISContext(engine)
        self.client = client or genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        self.registry = get_registry()
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

    def chat(self, message: str, history: list[dict[str, str]] | None = None) -> dict[str, Any]:
        used_tools: list[str] = []

        def get_region_summary(region_name: str, level: str) -> dict:
            """Bir Konya ilçesi veya mahallesi için güncel afet risk ve dirençlilik özetini getirir.

            Args:
                region_name: İlçe veya mahalle adı.
                level: district veya neighborhood.
            """
            used_tools.append("get_region_summary")
            return self.registry.execute(
                "get_region_summary",
                {"region_name": region_name, "level": level},
                self.context,
            )

        def get_assembly_area_stats(region_name: str, level: str) -> dict:
            """Bir bölgenin toplanma alanı sayısını ve kapasite göstergelerini getirir.

            Args:
                region_name: İlçe veya mahalle adı.
                level: district veya neighborhood.
            """
            used_tools.append("get_assembly_area_stats")
            return self.registry.execute(
                "get_assembly_area_stats",
                {"region_name": region_name, "level": level},
                self.context,
            )

        def get_most_problematic_regions(level: str, limit: int) -> dict:
            """Dirençlilik skoru en düşük olan ilçe veya mahalleleri sıralar.

            Args:
                level: district veya neighborhood.
                limit: Döndürülecek bölge sayısı; 1 ile 10 arasında.
            """
            used_tools.append("get_most_problematic_regions")
            return self.registry.execute(
                "get_most_problematic_regions",
                {"level": level, "limit": limit},
                self.context,
            )

        def get_region_count(level: str) -> dict:
            """PostGIS analizindeki toplam ilçe veya mahalle sayısını getirir.

            Args:
                level: district veya neighborhood.
            """
            used_tools.append("get_region_count")
            return self.registry.execute("get_region_count", {"level": level}, self.context)

        def compare_regions(first_region: str, second_region: str, level: str) -> dict:
            """İki bölgeyi risk, kapasite ve dirençlilik göstergeleriyle karşılaştırır.

            Args:
                first_region: İlk ilçe veya mahalle adı.
                second_region: İkinci ilçe veya mahalle adı.
                level: district veya neighborhood.
            """
            used_tools.append("compare_regions")
            return self.registry.execute(
                "compare_regions",
                {"first_region": first_region, "second_region": second_region, "level": level},
                self.context,
            )

        def rank_regions_by_metric(level: str, metric: str, order: str, limit: int) -> dict:
            """Bölgeleri mevcut GIS göstergelerinden birine göre sıralar.

            Args:
                level: district veya neighborhood.
                metric: resilience_score, risk_index, capacity_index, emergency_count,
                    sinkhole_count, fault_length_km, assembly_count,
                    critical_facility_count veya area_km2.
                order: highest veya lowest.
                limit: Döndürülecek bölge sayısı; 1 ile 10 arasında.
            """
            used_tools.append("rank_regions_by_metric")
            return self.registry.execute(
                "rank_regions_by_metric",
                {"level": level, "metric": metric, "order": order, "limit": limit},
                self.context,
            )

        contents = [
            types.Content(
                role="model" if item["role"] == "assistant" else "user",
                parts=[types.Part(text=item["text"])],
            )
            for item in (history or [])[-10:]
        ]
        contents.append(types.Content(role="user", parts=[types.Part(text=message)]))

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=[
                    get_region_summary,
                    get_assembly_area_stats,
                    get_most_problematic_regions,
                    get_region_count,
                    compare_regions,
                    rank_regions_by_metric,
                ],
            ),
        )
        return {
            "answer": response.text or "Bu soru için metin yanıtı üretilemedi.",
            "tools_used": used_tools,
            "model": self.model,
        }
