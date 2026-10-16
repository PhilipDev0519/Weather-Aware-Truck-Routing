# No database: everything comes from outside APIs and is cached in memory for a while.

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent
FRONTEND_DIST = REPO_DIR / "frontend" / "dist"


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")
if render_host := os.environ.get("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(render_host)
    CSRF_TRUSTED_ORIGINS.append(f"https://{render_host}")
if os.environ.get("VERCEL"):
    # Production, preview and branch deployments all get a *.vercel.app host.
    DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
    ALLOWED_HOSTS += [".vercel.app", *env_list("VERCEL_PROJECT_PRODUCTION_URL", "")]

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_CONTENT_TYPE_NOSNIFF = True

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "routing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "OPTIONS": {"MAX_ENTRIES": 20_000},
    },
    # map tiles are ~20 KB each, so keep this one small (~60 MB)
    "tiles": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "tiles",
        "OPTIONS": {"MAX_ENTRIES": 3_000},
    },
}

TIME_ZONE = "UTC"
USE_I18N = False

# In production the built React app is served from here by WhiteNoise.
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
WHITENOISE_AUTOREFRESH = DEBUG
# Vite puts a content hash in every asset name, so browsers can keep them forever.
WHITENOISE_IMMUTABLE_FILE_TEST = r"^.+[.-][0-9a-zA-Z_-]{8,12}\.\w+$"
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "UNAUTHENTICATED_USER": None,
}

ROUTING = {
    "OSRM_URL": os.environ.get("OSRM_URL", "https://router.project-osrm.org"),
    # With a key (free at openrouteservice.org), routes come from its truck
    # profile instead of OSRM's car profile; OSRM stays as the fallback.
    "ORS_API_KEY": os.environ.get("ORS_API_KEY", ""),
    "ORS_URL": os.environ.get("ORS_URL", "https://api.openrouteservice.org"),
    # Gross weight = this + the load; a typical empty tractor-trailer.
    "EMPTY_TRUCK_LBS": float(os.environ.get("EMPTY_TRUCK_LBS", "33000")),
    # The free tier allows ~600 locations a minute. With a paid key, also point
    # OPEN_METEO_URL at https://customer-api.open-meteo.com/v1/forecast
    "OPEN_METEO_URL": os.environ.get("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast"),
    "OPEN_METEO_API_KEY": os.environ.get("OPEN_METEO_API_KEY", ""),
    "GEOCODER_URL": os.environ.get("GEOCODER_URL", "https://geocoding-api.open-meteo.com/v1/search"),
    "PHOTON_URL": os.environ.get("PHOTON_URL", "https://photon.komoot.io/api/"),
    "USER_AGENT": "WeatherAwareTruckRouting/1.0",
    "HTTP_TIMEOUT_S": 25,
    # public OSRM only knows cars, so we cap speeds at this
    "TRUCK_MAX_SPEED_MPH": float(os.environ.get("TRUCK_MAX_SPEED_MPH", "65")),
    "WEATHER_CACHE_TTL_S": 30 * 60,
    # Forecast locations in the corridor heatmap. 160 suits the free tier; with
    # an API key, ~400 gives a much finer grid.
    "HEATMAP_MAX_CELLS": int(os.environ.get("HEATMAP_MAX_CELLS", "160")),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
