from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

MAX_DAYS_AHEAD = 14  # forecasts go out 16 days, leave some room for the drive
MAX_HOURS_PAST = 1
MAX_LOAD_LBS = 150_000


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
    if value > now + timedelta(days=MAX_DAYS_AHEAD):
        raise serializers.ValidationError(f"Departure must be within {MAX_DAYS_AHEAD} days (forecast range).")
    return value


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField(validators=[validate_departure])
    load_lbs = serializers.FloatField(min_value=0, max_value=MAX_LOAD_LBS)
    interval_miles = serializers.ChoiceField(choices=[10, 25, 50])
    rest_breaks = serializers.BooleanField(default=True)
