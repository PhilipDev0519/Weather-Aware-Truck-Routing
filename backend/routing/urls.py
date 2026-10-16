from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health),
    path("geocode", views.GeocodeView.as_view()),
    path("rules", views.RulesView.as_view()),
    path("plan", views.PlanView.as_view()),
    path("heatmap", views.HeatmapView.as_view()),
    path("tiles/<slug:style>/<int:z>/<int:x>/<int:y>", views.tile),
]
