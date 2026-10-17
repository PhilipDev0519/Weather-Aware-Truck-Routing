from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .services.weather import forecast_end

MAX_HOURS_PAST = 1
MAX_LOAD_LBS = 150_000
MAX_CORRIDOR_LINES = 3  # one per route option
MAX_CORRIDOR_POINTS = 5_000  # per line; a coast-to-coast route simplifies to a few hundred


class PlaceSerializer(serializers.Serializer):
    # lat/lon are missing when the user typed a place instead of picking one
    label = serializers.CharField(max_length=300)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lon = serializers.FloatField(min_value=-180, max_value=180, required=False)

    def validate(self, attrs):
        if ("lat" in attrs) != ("lon" in attrs):
            raise serializers.ValidationError("Provide both lat and lon, or neither.")
        return attrs


def validate_departure(value):
    now = timezone.now()
    if value < now - timedelta(hours=MAX_HOURS_PAST):
        raise serializers.ValidationError("Departure time is in the past.")
    # Any departure the forecast reaches is allowed; checkpoints the truck reaches
    # after the forecast ends are reported as "No forecast".
    end = forecast_end(now)
    if value > end:
        raise serializers.ValidationError(
            f"Departure must be within the weather forecast range (through {end:%b} {end.day})."
        )
    return value


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField(validators=[validate_departure])
    load_lbs = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LBS)
    interval_miles = serializers.ChoiceField(choices=[10, 25, 50])
    rest_breaks = serializers.BooleanField(default=True)
    # The web app sets this to false and loads the heatmap from /api/heatmap.
    include_heatmap = serializers.BooleanField(default=True)


class LatLonField(serializers.ListField):
    child = serializers.FloatField()

    def to_internal_value(self, data):
        # ListField checks min/max length only after this runs, so check here.
        values = super().to_internal_value(data)
        if len(values) != 2:
            raise serializers.ValidationError("Expected [lat, lon].")
        lat, lon = values
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise serializers.ValidationError("Coordinates out of range.")
        return lat, lon


class HeatmapRequestSerializer(serializers.Serializer):
    corridor = serializers.ListField(
        child=serializers.ListField(child=LatLonField(), min_length=1, max_length=MAX_CORRIDOR_POINTS),
        min_length=1,
        max_length=MAX_CORRIDOR_LINES,
    )
    departure = serializers.DateTimeField(validators=[validate_departure])
    load_lbs = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LBS)
