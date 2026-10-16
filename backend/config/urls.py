import os

from django.urls import include, path, re_path

from routing.views import spa_index

urlpatterns = [
    path("api/", include("routing.urls")),
]

if os.environ.get("VERCEL"):
    # On Vercel the React app is its own service and only /api/* reaches
    # Django. Accept those paths with or without the /api prefix, in case the
    # router strips it.
    urlpatterns.append(path("", include("routing.urls")))
else:
    # Everything else is the React single-page app.
    urlpatterns.append(re_path(r"^(?!api/|static/).*$", spa_index))
