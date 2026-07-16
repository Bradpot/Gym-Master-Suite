from django.contrib import admin
from django.urls import include, path, re_path

from api import views as api_views
from .views import frontend_patch_js, login_background_bridge, spa

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("auth/login-background", api_views.auth_login_background),
    path("auth/login-background/", api_views.auth_login_background),
    path("gm/login-background", login_background_bridge),
    path("gm/login-background/", login_background_bridge),
    path("frontend-patch.js", frontend_patch_js, name="frontend-patch-js"),
    path("", spa, name="spa-root"),
    re_path(r"^(?!api/)(?P<path>.*)$", spa, name="spa-catch-all"),
]
