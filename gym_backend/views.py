import json
from pathlib import Path

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.http import FileResponse, HttpResponse, HttpResponseNotFound
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.views.decorators.http import require_GET


def _add_nocache_headers(response):
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def _is_admin_authenticated(request) -> bool:
    user = request.user
    return bool(user.is_authenticated and (user.is_staff or user.is_superuser))


def _frontend_public_dir() -> Path:
    return (settings.BASE_DIR / "gym-manager" / "public").resolve()


def _frontend_dist_dir() -> Path:
    return (settings.BASE_DIR / "gym-manager" / "dist" / "public").resolve()


def _frontend_patch_file() -> Path:
    # Canonical patch source lives under gym-manager/public so future dist rebuilds
    # can keep the same behavior by copying/serving from this file.
    source_patch = _frontend_public_dir() / "frontend-patch.js"
    if source_patch.exists():
        return source_patch
    return _frontend_dist_dir() / "frontend-patch.js"


LOGIN_BG_UPLOADS_DIR = (settings.BASE_DIR / "uploads").resolve()
LOGIN_BG_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
LOGIN_BG_CONFIG_FILE = LOGIN_BG_UPLOADS_DIR / "login-page-background.json"
LOGIN_BG_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".svg", ".tif", ".tiff"}
LOGIN_BG_VIDEO_EXTS = {".mp4", ".webm", ".ogg", ".mov", ".m4v", ".avi", ".mkv", ".mpeg", ".mpg", ".3gp"}


def _safe_upload_name(raw_name: str) -> str:
    original = Path(str(raw_name or "")).name
    stem = Path(original).stem or "file"
    suffix = Path(original).suffix.lower()
    cleaned_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in stem).strip("-_") or "file"
    return f"{cleaned_stem}{suffix}"


def _read_login_bg_config() -> dict:
    default_payload = {"mediaType": None, "mediaUrl": None}
    if not LOGIN_BG_CONFIG_FILE.exists():
        return default_payload
    try:
        payload = json.loads(LOGIN_BG_CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_payload
    media_type = str(payload.get("mediaType") or "").strip().lower()
    media_url = str(payload.get("mediaUrl") or "").strip()
    if media_type not in {"image", "video"} or not media_url:
        return default_payload
    return {"mediaType": media_type, "mediaUrl": media_url}


def _write_login_bg_config(media_type: str | None, media_url: str | None) -> None:
    payload = {
        "mediaType": media_type if media_type in {"image", "video"} else None,
        "mediaUrl": media_url if media_url else None,
        "updatedAt": timezone.now().isoformat(),
    }
    LOGIN_BG_CONFIG_FILE.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def _remove_login_bg_file(media_url: str | None) -> None:
    if not media_url or not str(media_url).startswith("/api/uploads/"):
        return
    safe_name = Path(str(media_url).split("/api/uploads/", 1)[1]).name
    if not safe_name.startswith("login-bg-"):
        return
    target = (LOGIN_BG_UPLOADS_DIR / safe_name).resolve()
    if not str(target).startswith(str(LOGIN_BG_UPLOADS_DIR)) or not target.exists():
        return
    try:
        target.unlink()
    except OSError:
        return


@csrf_exempt
@require_http_methods(["GET", "POST", "DELETE"])
def login_background_bridge(request):
    if request.method == "GET":
        cfg = _read_login_bg_config()
        return _add_nocache_headers(
            HttpResponse(
                json.dumps(
                    {
                        "mediaType": cfg.get("mediaType"),
                        "mediaUrl": cfg.get("mediaUrl"),
                        "configured": bool(cfg.get("mediaType") and cfg.get("mediaUrl")),
                    }
                ),
                content_type="application/json; charset=utf-8",
            )
        )

    if request.method == "DELETE":
        prev = _read_login_bg_config()
        _remove_login_bg_file(prev.get("mediaUrl"))
        _write_login_bg_config(None, None)
        return _add_nocache_headers(
            HttpResponse(
                json.dumps({"success": True, "message": "Login background reset"}),
                content_type="application/json; charset=utf-8",
            )
        )

    try:
        uploaded = request.FILES.get("file")
    except RequestDataTooBig:
        return _add_nocache_headers(
            HttpResponse(
                json.dumps({"error": "Uploaded file is too large"}),
                status=413,
                content_type="application/json; charset=utf-8",
            )
        )
    if not uploaded:
        return _add_nocache_headers(
            HttpResponse(
                json.dumps({"error": "No media file provided"}),
                status=400,
                content_type="application/json; charset=utf-8",
            )
        )

    safe_name = _safe_upload_name(uploaded.name)
    suffix = Path(safe_name).suffix.lower()
    content_type = str(uploaded.content_type or "").strip().lower()
    requested_type = str(request.POST.get("mediaType", "")).strip().lower()
    guessed_type = "video" if (content_type.startswith("video/") or suffix in LOGIN_BG_VIDEO_EXTS) else "image"
    media_type = requested_type if requested_type in {"image", "video"} else guessed_type

    if media_type == "video":
        allowed = content_type.startswith("video/") or suffix in LOGIN_BG_VIDEO_EXTS
        if not allowed:
            return _add_nocache_headers(
                HttpResponse(
                    json.dumps({"error": "Unsupported video format"}),
                    status=400,
                    content_type="application/json; charset=utf-8",
                )
            )
    else:
        allowed = content_type.startswith("image/") or suffix in LOGIN_BG_IMAGE_EXTS
        if not allowed:
            return _add_nocache_headers(
                HttpResponse(
                    json.dumps({"error": "Unsupported image format"}),
                    status=400,
                    content_type="application/json; charset=utf-8",
                )
            )

    filename = f"login-bg-{int(timezone.now().timestamp() * 1000)}-{safe_name}"
    file_path = (LOGIN_BG_UPLOADS_DIR / filename).resolve()
    if not str(file_path).startswith(str(LOGIN_BG_UPLOADS_DIR)):
        return _add_nocache_headers(
            HttpResponse(
                json.dumps({"error": "Invalid upload path"}),
                status=400,
                content_type="application/json; charset=utf-8",
            )
        )
    with open(file_path, "wb+") as destination:
        for chunk in uploaded.chunks():
            destination.write(chunk)

    prev = _read_login_bg_config()
    media_url = f"/api/uploads/{filename}"
    _write_login_bg_config(media_type, media_url)
    _remove_login_bg_file(prev.get("mediaUrl"))

    return _add_nocache_headers(
        HttpResponse(
            json.dumps({"success": True, "mediaType": media_type, "mediaUrl": media_url, "configured": True}),
            content_type="application/json; charset=utf-8",
        )
    )


def _render_login_page() -> HttpResponse:
    html = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fitness Temple Admin</title>
    <style>
      :root {
        --bg-a: #020617;
        --bg-b: #071428;
        --bg-c: #0b1f35;
        --card: rgba(8, 22, 41, 0.82);
        --card-border: rgba(92, 164, 201, 0.28);
        --text: #e5f4ff;
        --muted: #8fb4cf;
        --input: rgba(6, 19, 36, 0.95);
        --input-border: rgba(93, 170, 208, 0.34);
        --primary: #0ea5e9;
        --primary-2: #06b6d4;
        --primary-ink: #ecfeff;
        --danger: #ff647c;
        --ok: #7bf1c7;
        --scene-overlay: linear-gradient(180deg, rgba(2, 8, 18, .58) 0%, rgba(4, 16, 30, .24) 55%, rgba(2, 8, 18, .62) 100%);
        --aurora-a: radial-gradient(circle, rgba(14, 165, 233, 0.56) 0%, rgba(14, 165, 233, 0) 70%);
        --aurora-b: radial-gradient(circle, rgba(6, 182, 212, 0.44) 0%, rgba(6, 182, 212, 0) 70%);
      }
      body[data-theme="light"] {
        --bg-a: #e6f6ff;
        --bg-b: #d9f2ff;
        --bg-c: #c7e9ff;
        --card: rgba(255, 255, 255, 0.86);
        --card-border: rgba(82, 146, 176, 0.28);
        --text: #0f2742;
        --muted: #4c6f8c;
        --input: rgba(245, 252, 255, 0.96);
        --input-border: rgba(102, 157, 186, 0.4);
        --primary: #0284c7;
        --primary-2: #0891b2;
        --primary-ink: #ecfeff;
        --scene-overlay: linear-gradient(180deg, rgba(210, 236, 251, .5) 0%, rgba(220, 242, 255, .18) 55%, rgba(206, 234, 250, .56) 100%);
        --aurora-a: radial-gradient(circle, rgba(56, 189, 248, 0.38) 0%, rgba(56, 189, 248, 0) 70%);
        --aurora-b: radial-gradient(circle, rgba(34, 211, 238, 0.3) 0%, rgba(34, 211, 238, 0) 70%);
      }
      body[data-theme="light"] .intro h1 span {
        background: linear-gradient(95deg, #0f2742 5%, #0f4a6e 45%, #0369a1 95%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      body[data-theme="light"] .intro p {
        color: #3f5f7a;
      }
      body[data-theme="light"] .chip {
        background: rgba(236, 249, 255, 0.82);
        color: #0f4a6e;
        border-color: rgba(64, 145, 180, 0.35);
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        min-height: 100vh;
        color: var(--text);
        font-family: "Segoe UI", "Plus Jakarta Sans", "Inter", Arial, sans-serif;
        background: linear-gradient(135deg, var(--bg-a) 0%, var(--bg-b) 55%, var(--bg-c) 100%);
        overflow: hidden;
      }
      .login-media-layer {
        position: fixed;
        inset: 0;
        overflow: hidden;
        opacity: 0;
        transition: opacity .38s ease;
        pointer-events: none;
        z-index: 0;
      }
      .login-media-layer.gm-ready { opacity: 1; }
      .login-media-layer img,
      .login-media-layer video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .login-media-layer::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(2, 8, 18, .58) 0%, rgba(4, 16, 30, .24) 55%, rgba(2, 8, 18, .62) 100%);
      }
      .scene {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 1;
      }
      .scene::before {
        content: "";
        position: absolute;
        inset: 0;
        background: var(--scene-overlay);
      }
      .aurora {
        position: absolute;
        width: 58vmax;
        height: 58vmax;
        filter: blur(36px);
        opacity: 0.26;
        border-radius: 50%;
        mix-blend-mode: screen;
      }
      .aurora-a {
        top: -14vmax;
        left: -10vmax;
        background: var(--aurora-a);
        animation: floatA 17s ease-in-out infinite alternate;
      }
      .aurora-b {
        bottom: -18vmax;
        right: -14vmax;
        background: var(--aurora-b);
        animation: floatB 19s ease-in-out infinite alternate;
      }
      .gym-rig {
        position: absolute;
        inset: 0;
        opacity: 0.38;
      }
      .gym-rig .bar {
        position: absolute;
        left: 50%;
        top: 56%;
        width: min(86vw, 940px);
        height: 4px;
        transform: translate(-50%, -50%);
        background: linear-gradient(90deg, transparent, rgba(182, 198, 238, 0.45), rgba(182, 198, 238, 0.45), transparent);
        box-shadow: 0 0 20px rgba(100, 120, 200, 0.25);
        animation: barPulse 5.2s ease-in-out infinite;
      }
      .gym-rig .plate {
        position: absolute;
        top: 56%;
        width: 78px;
        height: 78px;
        border-radius: 50%;
        border: 2px solid rgba(132, 149, 194, 0.42);
        box-shadow: inset 0 0 0 8px rgba(72, 86, 122, 0.22), 0 0 22px rgba(91, 108, 172, 0.16);
        transform: translateY(-50%);
      }
      .gym-rig .plate::after {
        content: "";
        position: absolute;
        inset: 24px;
        border-radius: 50%;
        border: 2px solid rgba(132, 149, 194, 0.33);
      }
      .gym-rig .plate-left { left: max(6vw, 72px); animation: plateRollL 11s linear infinite; }
      .gym-rig .plate-right { right: max(6vw, 72px); animation: plateRollR 11s linear infinite; }
      .gym-rig .bench-line {
        position: absolute;
        left: 50%;
        bottom: 17%;
        width: min(70vw, 680px);
        height: 2px;
        transform: translateX(-50%);
        background: linear-gradient(90deg, transparent, rgba(120, 137, 189, 0.55), transparent);
        animation: benchGlow 4.8s ease-in-out infinite;
      }
      .grid-flow {
        position: absolute;
        inset: -25%;
        background:
          repeating-linear-gradient(0deg, rgba(56, 189, 248, 0.09) 0, rgba(56, 189, 248, 0.09) 1px, transparent 1px, transparent 48px),
          repeating-linear-gradient(90deg, rgba(34, 211, 238, 0.08) 0, rgba(34, 211, 238, 0.08) 1px, transparent 1px, transparent 48px);
        transform: perspective(900px) rotateX(70deg) translateY(-16vh);
        transform-origin: center;
        animation: gridMove 22s linear infinite;
        opacity: 0.26;
      }
      .orbits {
        position: absolute;
        width: min(70vmin, 640px);
        height: min(70vmin, 640px);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        opacity: 0.22;
      }
      .orbit {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        border: 1px solid rgba(168, 187, 235, 0.2);
      }
      .orbit:nth-child(1) { animation: spin 16s linear infinite; }
      .orbit:nth-child(2) { inset: 12%; animation: spin 11s linear infinite reverse; }
      .orbit:nth-child(3) { inset: 24%; animation: spin 8s linear infinite; }
      .particle-wrap {
        position: absolute;
        inset: 0;
      }
      .particle {
        position: absolute;
        width: 2px;
        height: 2px;
        border-radius: 50%;
        background: rgba(212, 224, 255, 0.85);
        box-shadow: 0 0 12px rgba(140, 185, 255, 0.75);
        animation: drift linear infinite;
      }
      .scan {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, transparent 0%, rgba(120, 140, 230, 0.13) 50%, transparent 100%);
        animation: scan 6.5s ease-in-out infinite;
        opacity: 0.2;
      }

      .layout {
        position: relative;
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(260px, 1fr) minmax(350px, 460px);
        align-items: center;
        gap: 2rem;
        padding: clamp(1rem, 2vw, 2.2rem);
        z-index: 2;
      }
      .intro {
        max-width: 700px;
        align-self: stretch;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1rem;
        padding: clamp(0.8rem, 2vw, 1.6rem);
        animation: introIn 1.1s cubic-bezier(.16,1,.3,1);
      }
      .intro .kicker {
        display: inline-flex;
        width: fit-content;
        border: 1px solid rgba(138, 159, 212, 0.35);
        background: rgba(22, 30, 58, 0.5);
        border-radius: 999px;
        padding: 0.35rem 0.75rem;
        letter-spacing: 0.08em;
        font-size: 0.72rem;
        text-transform: uppercase;
        color: #bfd3ff;
        backdrop-filter: blur(8px);
      }
      .intro h1 {
        margin: 0;
        font-size: clamp(2rem, 4.2vw, 3.9rem);
        line-height: 1.03;
        letter-spacing: -0.02em;
      }
      .intro h1 span {
        background: linear-gradient(95deg, #ffffff 5%, #b9cbff 45%, #8fb4ff 95%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .intro p {
        margin: 0;
        color: var(--muted);
        max-width: 58ch;
        font-size: clamp(0.95rem, 1.3vw, 1.05rem);
        line-height: 1.6;
      }
      .intro-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
        margin-top: 0.25rem;
      }
      .chip {
        border: 1px solid rgba(148, 168, 216, 0.3);
        background: rgba(18, 25, 48, 0.55);
        color: #d5e1ff;
        border-radius: 12px;
        padding: 0.5rem 0.7rem;
        font-size: 0.78rem;
        backdrop-filter: blur(8px);
        animation: chipFloat 5s ease-in-out infinite;
      }
      .chip:nth-child(2) { animation-delay: .7s; }
      .chip:nth-child(3) { animation-delay: 1.2s; }

      .card {
        width: 100%;
        border-radius: 24px;
        border: 1px solid var(--card-border);
        background: linear-gradient(160deg, color-mix(in srgb, var(--card) 92%, transparent) 10%, color-mix(in srgb, var(--card) 78%, transparent) 100%);
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(210, 225, 255, 0.09);
        backdrop-filter: blur(14px);
        padding: clamp(1rem, 2.2vw, 1.6rem);
        position: relative;
        overflow: hidden;
        animation: cardIn 0.95s cubic-bezier(.16,1,.3,1);
      }
      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(120deg, rgba(14,165,233,0.12), transparent 45%, rgba(6,182,212,0.09));
        pointer-events: none;
      }
      .card-inner { position: relative; z-index: 2; }

      .brand-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.9rem;
      }
      .brand-left {
        display: flex;
        align-items: center;
        gap: 0.7rem;
      }
      .logo {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: radial-gradient(circle at 20% 25%, #67e8f9, #0284c7 78%);
        box-shadow: 0 0 26px rgba(6, 182, 212, 0.45);
        position: relative;
      }
      .logo::after {
        content: "";
        position: absolute;
        inset: 7px;
        border: 2px solid rgba(245, 248, 255, 0.8);
        border-radius: 6px;
      }
      .brand-title { font-size: 1.08rem; font-weight: 700; letter-spacing: .01em; }
      .theme-btn {
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: color-mix(in srgb, var(--input) 90%, transparent);
        color: var(--text);
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        padding: 0.45rem 0.65rem;
        cursor: pointer;
        transition: 0.2s ease;
      }
      .theme-btn:hover { border-color: color-mix(in srgb, var(--primary) 60%, var(--input-border)); }
      .subtitle {
        margin: 0.35rem 0 0;
        color: var(--muted);
        font-size: 0.9rem;
      }

      .tabs {
        margin-top: 1rem;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.45rem;
      }
      .tab {
        border-radius: 11px;
        border: 1px solid rgba(129, 152, 210, 0.27);
        background: color-mix(in srgb, var(--input) 84%, transparent);
        color: color-mix(in srgb, var(--text) 84%, transparent);
        font-size: 0.8rem;
        font-weight: 700;
        padding: 0.56rem 0.5rem;
        cursor: pointer;
        transition: 0.24s ease;
      }
      .tab:hover { border-color: rgba(143, 169, 227, 0.48); }
      .tab.active {
        background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 40%, transparent), color-mix(in srgb, var(--primary-2) 34%, transparent));
        border-color: rgba(149, 167, 224, 0.58);
        color: var(--text);
        box-shadow: 0 8px 24px rgba(7, 89, 133, 0.28);
      }
      form {
        margin-top: 0.95rem;
        display: grid;
        gap: 0.7rem;
      }
      label {
        color: color-mix(in srgb, var(--text) 92%, transparent);
        font-size: 0.84rem;
        letter-spacing: 0.01em;
      }
      input {
        width: 100%;
        margin-top: 0.35rem;
        border-radius: 11px;
        border: 1px solid var(--input-border);
        background: var(--input);
        color: var(--text);
        outline: none;
        padding: 0.62rem 0.72rem;
        font-size: 0.92rem;
        transition: 0.2s ease;
      }
      input::placeholder { color: #7f90ba; }
      input:focus {
        border-color: color-mix(in srgb, var(--primary) 72%, transparent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
      }
      .action-btn {
        margin-top: 0.2rem;
        border: 0;
        border-radius: 12px;
        background: linear-gradient(130deg, var(--primary) 0%, var(--primary-2) 100%);
        color: var(--primary-ink);
        font-weight: 800;
        font-size: 0.97rem;
        letter-spacing: 0.01em;
        padding: 0.72rem 0.9rem;
        cursor: pointer;
        transition: transform .2s ease, filter .25s ease, box-shadow .25s ease;
        box-shadow: 0 14px 30px rgba(2, 132, 199, 0.34);
      }
      .action-btn:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
      }
      .action-btn:active { transform: translateY(1px); }
      .action-btn:disabled {
        opacity: 0.82;
        cursor: wait;
      }
      .error {
        min-height: 18px;
        color: var(--danger);
        font-size: 0.82rem;
      }
      .help {
        margin-top: 0.45rem;
        font-size: 0.75rem;
        color: var(--muted);
      }
      .hidden { display: none; }

      .site-transition {
        position: fixed;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        opacity: 0;
      }
      .site-transition.active {
        opacity: 1;
      }
      .site-transition .veil {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 20% 20%, rgba(14, 165, 233, 0.44), transparent 42%),
          radial-gradient(circle at 80% 78%, rgba(6, 182, 212, 0.35), transparent 45%),
          linear-gradient(145deg, #041122 0%, #072036 55%, #0c2b44 100%);
        transform: scale(1.2);
        opacity: 0;
      }
      .site-transition.active .veil {
        animation: enterSite 1.05s cubic-bezier(.16,1,.3,1) forwards;
      }
      .site-transition .title {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(0.94);
        font-size: clamp(1.1rem, 4vw, 2rem);
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #dcf5ff;
        text-transform: uppercase;
        opacity: 0;
      }
      .site-transition.active .title {
        animation: titleFlash 0.95s ease forwards;
      }

      @media (max-width: 980px) {
        .layout {
          grid-template-columns: 1fr;
          justify-items: center;
          gap: 1rem;
          padding-top: 1.2rem;
        }
        .intro {
          width: min(700px, 100%);
          text-align: center;
          align-items: center;
          padding-bottom: 0;
        }
        .intro p { max-width: 44ch; }
        .card { width: min(460px, 100%); }
      }
      @media (max-width: 560px) {
        .tabs { grid-template-columns: 1fr; }
      }

      @keyframes floatA {
        0% { transform: translate(0, 0) scale(1); }
        100% { transform: translate(6vw, 8vh) scale(1.1); }
      }
      @keyframes floatB {
        0% { transform: translate(0, 0) scale(1); }
        100% { transform: translate(-7vw, -6vh) scale(1.08); }
      }
      @keyframes gridMove {
        from { transform: perspective(900px) rotateX(70deg) translateY(-16vh) translateX(0); }
        to { transform: perspective(900px) rotateX(70deg) translateY(-12vh) translateX(24px); }
      }
      @keyframes barPulse {
        0%, 100% { opacity: .45; transform: translate(-50%, -50%) scaleX(1); }
        50% { opacity: .95; transform: translate(-50%, -50%) scaleX(1.015); }
      }
      @keyframes plateRollL {
        from { transform: translateY(-50%) rotate(0deg); }
        to { transform: translateY(-50%) rotate(-360deg); }
      }
      @keyframes plateRollR {
        from { transform: translateY(-50%) rotate(0deg); }
        to { transform: translateY(-50%) rotate(360deg); }
      }
      @keyframes benchGlow {
        0%, 100% { opacity: .35; }
        50% { opacity: .78; }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes drift {
        from { transform: translate3d(0, 14px, 0); opacity: 0; }
        20% { opacity: 0.9; }
        80% { opacity: 0.9; }
        to { transform: translate3d(0, -22vh, 0); opacity: 0; }
      }
      @keyframes scan {
        0%, 100% { transform: translateY(-26%); }
        50% { transform: translateY(118%); }
      }
      @keyframes introIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes cardIn {
        from { opacity: 0; transform: translateY(20px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes chipFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes enterSite {
        0% { opacity: 0; transform: scale(1.12); }
        30% { opacity: 1; }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes titleFlash {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        35% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(1.03); }
      }
    </style>
  </head>
  <body>
    <div id="login-media-layer" class="login-media-layer" aria-hidden="true"></div>
    <div class="scene">
      <div class="aurora aurora-a"></div>
      <div class="aurora aurora-b"></div>
      <div class="gym-rig">
        <div class="bar"></div>
        <div class="plate plate-left"></div>
        <div class="plate plate-right"></div>
        <div class="bench-line"></div>
      </div>
      <div class="grid-flow"></div>
      <div class="orbits">
        <div class="orbit"></div>
        <div class="orbit"></div>
        <div class="orbit"></div>
      </div>
      <div class="particle-wrap" id="particle-wrap"></div>
      <div class="scan"></div>
    </div>

    <div class="layout">
      <section class="intro">
        <h1><span>Fitness Temple</span></h1>
        <p>
          Track members, monitor renewals, and manage your gym operations from one animated control center.
          Sign in as admin to continue.
        </p>
        <div class="intro-stats">
          <span class="chip">Live Membership Ops</span>
          <span class="chip">Renewal Intelligence</span>
          <span class="chip">Automated Notifications</span>
        </div>
      </section>

      <main class="card" aria-label="Authentication Panel">
        <div class="card-inner">
          <div class="brand-row">
            <div class="brand-left">
              <div class="logo" aria-hidden="true"></div>
              <div class="brand-title">Welcome to Fitness Temple</div>
            </div>
            <button type="button" id="theme-toggle" class="theme-btn">Light Mode</button>
          </div>
          <p id="subtitle" class="subtitle">Sign in to continue to the dashboard.</p>

          <div class="tabs">
            <button type="button" class="tab active" data-mode="login">Login</button>
            <button type="button" class="tab" data-mode="register">Register</button>
            <button type="button" class="tab" data-mode="change">Change Password</button>
          </div>

          <form id="auth-form">
            <label>Username
              <input id="username" name="username" type="text" autocomplete="username" required placeholder="Enter admin username" />
            </label>
            <label id="current-password-wrap">Password
              <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter password" />
            </label>
            <label id="new-password-wrap" class="hidden">New Password
              <input id="new-password" name="newPassword" type="password" autocomplete="new-password" placeholder="Create new password" />
            </label>
            <label id="confirm-password-wrap" class="hidden">Confirm Password
              <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" placeholder="Confirm password" />
            </label>
            <label id="confirm-new-password-wrap" class="hidden">Confirm New Password
              <input id="confirm-new-password" name="confirmNewPassword" type="password" autocomplete="new-password" placeholder="Confirm new password" />
            </label>
            <div id="error" class="error"></div>
            <button type="submit" id="submit-btn" class="action-btn">Login</button>
          </form>
          <div class="help">Secure admin-only access with animated site intro and entry transition.</div>
        </div>
      </main>
    </div>

    <div id="site-transition" class="site-transition" aria-hidden="true">
      <div class="veil"></div>
      <div class="title">Entering Fitness Temple</div>
    </div>

    <script>
      (function () {
        var mode = "login";
        var form = document.getElementById("auth-form");
        var subtitle = document.getElementById("subtitle");
        var errorBox = document.getElementById("error");
        var submitBtn = document.getElementById("submit-btn");
        var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
        var currentPasswordWrap = document.getElementById("current-password-wrap");
        var newPasswordWrap = document.getElementById("new-password-wrap");
        var confirmPasswordWrap = document.getElementById("confirm-password-wrap");
        var confirmNewPasswordWrap = document.getElementById("confirm-new-password-wrap");
        var passwordEl = document.getElementById("password");
        var newPasswordEl = document.getElementById("new-password");
        var confirmPasswordEl = document.getElementById("confirm-password");
        var confirmNewPasswordEl = document.getElementById("confirm-new-password");
        var transitionEl = document.getElementById("site-transition");
        var themeToggle = document.getElementById("theme-toggle");
        var loginMediaLayer = document.getElementById("login-media-layer");

        function applyLoginBackgroundConfig(config) {
          if (!loginMediaLayer) return;
          var mediaType = config && (config.mediaType === "video" || config.mediaType === "image") ? config.mediaType : null;
          var mediaUrl = config && config.mediaUrl ? String(config.mediaUrl) : "";
          loginMediaLayer.innerHTML = "";
          loginMediaLayer.classList.remove("gm-ready");
          if (!mediaType || !mediaUrl) return;
          var cacheBust = mediaUrl.indexOf("?") === -1 ? "?v=" + Date.now() : "&v=" + Date.now();
          if (mediaType === "video") {
            var video = document.createElement("video");
            video.src = mediaUrl + cacheBust;
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            loginMediaLayer.appendChild(video);
          } else {
            var img = document.createElement("img");
            img.src = mediaUrl + cacheBust;
            img.alt = "";
            loginMediaLayer.appendChild(img);
          }
          loginMediaLayer.classList.add("gm-ready");
        }

        function fetchLoginBackgroundConfig() {
          var endpoints = [
            "/gm/login-background",
            "/gm/login-background/",
            "/api/auth/login-background",
            "/api/auth/login-background/",
            "/auth/login-background",
            "/auth/login-background/",
            "gm/login-background",
            "gm/login-background/",
            "api/auth/login-background",
            "api/auth/login-background/",
            "auth/login-background",
            "auth/login-background/"
          ];
          var index = 0;

          function parseJsonSafe(resp) {
            return resp.text().then(function (raw) {
              if (!resp.ok || !raw) return null;
              try {
                return JSON.parse(raw);
              } catch (_err) {
                return null;
              }
            });
          }

          function attempt() {
            return fetch(endpoints[index], { credentials: "include" })
              .then(function (r) {
                if (r.status === 404 && index < endpoints.length - 1) {
                  index += 1;
                  return attempt();
                }
                return parseJsonSafe(r);
              });
          }

          attempt()
            .then(function (data) {
              if (data) applyLoginBackgroundConfig(data);
            })
            .catch(function () {});
        }

        function applyTheme(theme) {
          var next = theme === "light" ? "light" : "dark";
          document.body.setAttribute("data-theme", next);
          document.documentElement.style.colorScheme = next;
          if (themeToggle) {
            themeToggle.textContent = next === "dark" ? "Light Mode" : "Dark Mode";
            themeToggle.setAttribute("aria-label", next === "dark" ? "Switch to light mode" : "Switch to dark mode");
          }
          try {
            localStorage.setItem("fitnestemple-theme", next);
          } catch (_err) {}
        }

        function initTheme() {
          var saved = null;
          try {
            saved = localStorage.getItem("fitnestemple-theme");
          } catch (_err) {
            saved = null;
          }
          if (saved === "dark" || saved === "light") {
            applyTheme(saved);
            return;
          }
          var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
          applyTheme(prefersLight ? "light" : "dark");
        }

        function spawnParticles() {
          var wrap = document.getElementById("particle-wrap");
          if (!wrap) return;
          var count = window.innerWidth < 700 ? 28 : 52;
          for (var i = 0; i < count; i += 1) {
            var p = document.createElement("span");
            p.className = "particle";
            p.style.left = Math.round(Math.random() * 100) + "%";
            p.style.top = Math.round(Math.random() * 100) + "%";
            p.style.animationDuration = (8 + Math.random() * 12).toFixed(2) + "s";
            p.style.animationDelay = (-Math.random() * 10).toFixed(2) + "s";
            p.style.opacity = (0.3 + Math.random() * 0.7).toFixed(2);
            wrap.appendChild(p);
          }
        }

        function enterSiteTransition() {
          transitionEl.classList.add("active");
          try {
            sessionStorage.setItem("gm.enter.after.login", "1");
          } catch (_err) {}
          setTimeout(function () {
            window.location.replace("/");
          }, 940);
        }

        function setMode(nextMode) {
          mode = nextMode;
          errorBox.textContent = "";
          tabs.forEach(function (tab) {
            tab.classList.toggle("active", tab.getAttribute("data-mode") === mode);
          });

          if (mode === "login") {
            subtitle.textContent = "Sign in to continue to the dashboard.";
            submitBtn.textContent = "Login";
            currentPasswordWrap.classList.remove("hidden");
            newPasswordWrap.classList.add("hidden");
            confirmPasswordWrap.classList.add("hidden");
            confirmNewPasswordWrap.classList.add("hidden");
            passwordEl.required = true;
            newPasswordEl.required = false;
            confirmPasswordEl.required = false;
            confirmNewPasswordEl.required = false;
          } else if (mode === "register") {
            subtitle.textContent = "Create a new admin account.";
            submitBtn.textContent = "Register";
            currentPasswordWrap.classList.remove("hidden");
            newPasswordWrap.classList.add("hidden");
            confirmPasswordWrap.classList.remove("hidden");
            confirmNewPasswordWrap.classList.add("hidden");
            passwordEl.required = true;
            newPasswordEl.required = false;
            confirmPasswordEl.required = true;
            confirmNewPasswordEl.required = false;
          } else {
            subtitle.textContent = "Change your admin password securely.";
            submitBtn.textContent = "Change Password";
            currentPasswordWrap.classList.remove("hidden");
            newPasswordWrap.classList.remove("hidden");
            confirmPasswordWrap.classList.add("hidden");
            confirmNewPasswordWrap.classList.remove("hidden");
            passwordEl.required = true;
            newPasswordEl.required = true;
            confirmPasswordEl.required = false;
            confirmNewPasswordEl.required = true;
          }
        }

        tabs.forEach(function (tab) {
          tab.addEventListener("click", function () {
            setMode(tab.getAttribute("data-mode"));
          });
        });
        if (themeToggle) {
          themeToggle.addEventListener("click", function () {
            var current = document.body.getAttribute("data-theme") || "dark";
            applyTheme(current === "dark" ? "light" : "dark");
          });
        }

        fetch("/api/auth/me", { credentials: "same-origin" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && data.authenticated) window.location.replace("/");
          })
          .catch(function () {});

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          errorBox.textContent = "";
          errorBox.style.color = "#ff647c";
          submitBtn.disabled = true;
          submitBtn.textContent = mode === "login" ? "Signing In..." : (mode === "register" ? "Registering..." : "Updating...");

          var username = document.getElementById("username").value.trim();
          var password = passwordEl.value;
          var endpoint = "/api/auth/login";
          var payload = { username: username, password: password };

          if (mode === "register") {
            endpoint = "/api/auth/register";
            payload = { username: username, password: password, confirmPassword: confirmPasswordEl.value };
          } else if (mode === "change") {
            endpoint = "/api/auth/change-password";
            payload = {
              username: username,
              currentPassword: password,
              newPassword: newPasswordEl.value,
              confirmNewPassword: confirmNewPasswordEl.value
            };
          }

          fetch(endpoint, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
            .then(function (r) {
              return r.json().then(function (data) { return { ok: r.ok, data: data }; });
            })
            .then(function (result) {
              if (!result.ok) throw new Error(result.data && result.data.error ? result.data.error : "Login failed");
              if (mode === "login") {
                enterSiteTransition();
                return;
              }
              if (mode === "register") {
                setMode("login");
                passwordEl.value = "";
                confirmPasswordEl.value = "";
                errorBox.style.color = "#7bf1c7";
                errorBox.textContent = "Registration successful. Please login.";
              } else {
                setMode("login");
                passwordEl.value = "";
                newPasswordEl.value = "";
                confirmNewPasswordEl.value = "";
                errorBox.style.color = "#7bf1c7";
                errorBox.textContent = "Password changed successfully. Please login.";
              }
            })
            .catch(function (err) {
              errorBox.style.color = "#ff647c";
              errorBox.textContent = err.message || "Unable to login.";
            })
            .finally(function () {
              submitBtn.disabled = false;
              submitBtn.textContent = mode === "login" ? "Login" : (mode === "register" ? "Register" : "Change Password");
            });
        });

        spawnParticles();
        initTheme();
        fetchLoginBackgroundConfig();
        setMode("login");
      })();
    </script>
  </body>
</html>"""
    return _add_nocache_headers(HttpResponse(html, content_type="text/html; charset=utf-8"))


@require_GET
def spa(request, path=""):
    dist_dir = _frontend_dist_dir()

    if path:
        candidate = (dist_dir / path).resolve()
        if str(candidate).startswith(str(dist_dir)) and candidate.is_file():
            return _add_nocache_headers(FileResponse(open(candidate, "rb")))

    if not _is_admin_authenticated(request):
        return _render_login_page()

    index_file = dist_dir / "index.html"
    if index_file.exists():
        html = index_file.read_text(encoding="utf-8")
        patch_file = _frontend_patch_file()
        patch_version = str(int(patch_file.stat().st_mtime)) if patch_file.exists() else "1"
        patch_tag = f'<script src="/frontend-patch.js?v={patch_version}"></script>'
        if patch_tag not in html:
            html = html.replace("</body>", f"  {patch_tag}\n  </body>")
        return _add_nocache_headers(HttpResponse(html, content_type="text/html; charset=utf-8"))

    return HttpResponseNotFound(
        "Prebuilt frontend not found at gym-manager/dist/public."
    )


@require_GET
def frontend_patch_js(_request):
    patch_file = _frontend_patch_file()
    if not patch_file.exists():
        return HttpResponseNotFound("frontend-patch.js not found.")
    response = FileResponse(open(patch_file, "rb"), content_type="application/javascript; charset=utf-8")
    return _add_nocache_headers(response)
