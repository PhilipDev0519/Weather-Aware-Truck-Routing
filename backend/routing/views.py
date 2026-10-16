import logging

from django.conf import settings
from django.http import FileResponse, HttpResponse
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import planner, risk
from .heatmap import build_heatmap
from .serializers import HeatmapRequestSerializer, PlanRequestSerializer
from .services import ProviderError, geocoding, tiles

logger = logging.getLogger(__name__)


def bad_gateway(exc: ProviderError) -> Response:
    logger.warning("Provider error: %s", exc)
    return Response({"detail": str(exc)}, status=502)


class GeocodeView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "")
        if len(query.strip()) < 2:
            return Response({"results": []})
        try:
            return Response({"results": geocoding.search(query)})
        except ProviderError as exc:
            return bad_gateway(exc)


class RulesView(APIView):
    def get(self, request):
        return Response(risk.rules_payload())


class PlanView(APIView):
    # Each plan spends free-tier routing and weather quota (see THROTTLE_RATES).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "plan"

    def post(self, request):
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            origin = find_place(data["origin"], "origin")
            destination = find_place(data["destination"], "destination")
            plan = planner.plan_trip(
                origin,
                destination,
                data["departure"],
                data["load_lbs"],
                int(data["interval_miles"]),
                data["rest_breaks"],
                data["include_heatmap"],
            )
        except ProviderError as exc:
            return bad_gateway(exc)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception:
            logger.exception("Planning failed")
            return Response({"detail": "Something went wrong while planning this trip. Please try again."}, status=500)
        return Response(plan)


class HeatmapView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "heatmap"

    def post(self, request):
        serializer = HeatmapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            return Response(build_heatmap(data["corridor"], data["departure"], data["load_lbs"]))
        except ProviderError as exc:
            return bad_gateway(exc)
        except Exception:
            logger.exception("Heatmap failed")
            return Response({"detail": planner.HEATMAP_FAILED}, status=500)


def find_place(place: dict, role: str) -> dict:
    # Places picked from the autocomplete already have coordinates; typed ones don't.
    if "lat" in place:
        return {"label": place["label"], "lat": place["lat"], "lon": place["lon"]}
    matches = geocoding.search(place["label"], limit=1)
    if not matches:
        raise LookupError(f"Could not find the {role} “{place['label']}”.")
    return matches[0]


def tile(request, style, z, x, y):
    try:
        content, content_type = tiles.get_tile(style, z, x, y)
    except (KeyError, ValueError):
        return HttpResponse(status=404)
    except ProviderError as exc:
        logger.warning("Tile %s/%s/%s/%s failed: %s", style, z, x, y, exc)
        return HttpResponse(status=502)
    response = HttpResponse(content, content_type=content_type)
    response["Cache-Control"] = "public, max-age=86400"
    return response


def health(request):
    return HttpResponse("ok", content_type="text/plain")


def spa_index(request):
    index = settings.FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index.open("rb"), content_type="text/html")
    return HttpResponse(
        "Frontend not built. Use <code>npm run dev</code> in frontend/ (http://localhost:5173), "
        "or <code>npm run build</code> to serve it from here.",
        status=404,
    )
