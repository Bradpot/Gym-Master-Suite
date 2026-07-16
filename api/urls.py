from django.urls import path, re_path

from . import views

urlpatterns = [
    path("healthz", views.healthz),
    path("auth/me", views.auth_me),
    path("auth/login", views.auth_login),
    path("auth/logout", views.auth_logout),
    path("auth/register", views.auth_register),
    path("auth/change-password", views.auth_change_password),
    path("auth/login-background", views.auth_login_background),
    path("auth/login-background/", views.auth_login_background),
    path("members", views.members_collection),
    path("members/export/csv", views.members_export_csv),
    path("members/import-csv", views.members_import_csv),
    path("members/calendar/<int:year>/<int:month>", views.members_calendar),
    path("members/<int:member_id>", views.member_item),
    re_path(r"^uploads/(?P<filename>.+)$", views.uploaded_file),
    path("dashboard/stats", views.dashboard_stats),
    path("dashboard/expiring-soon", views.dashboard_expiring_soon),
    path("notifications/send", views.notifications_send),
    path("notifications/history", views.notifications_history),
    path("chatbot/query", views.chatbot_query),
    path("chatbot/query/", views.chatbot_query),
    path("chatbot/debug-key", views.chatbot_debug_key),
    path("chatbot/debug-key/", views.chatbot_debug_key),
]
