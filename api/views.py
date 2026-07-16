import csv
import io
import json
import mimetypes
import os
import base64
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.core.exceptions import RequestDataTooBig
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.http.multipartparser import MultiPartParser, MultiPartParserError
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Member, NotificationLog

UPLOADS_DIR = settings.BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
LOGIN_BG_CONFIG_FILE = UPLOADS_DIR / "login-page-background.json"
LOGIN_BG_ALLOWED_IMAGE_EXTS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".avif",
    ".svg",
    ".tif",
    ".tiff",
}
LOGIN_BG_ALLOWED_VIDEO_EXTS = {
    ".mp4",
    ".webm",
    ".ogg",
    ".mov",
    ".m4v",
    ".avi",
    ".mkv",
    ".mpeg",
    ".mpg",
    ".3gp",
}
GROQ_CHAT_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant").strip() or "llama-3.1-8b-instant"
GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
GROQ_HTTP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    # Some edge gateways block requests that look non-browser/bot-like without a UA.
    "User-Agent": "GymMasterSuite/1.0 (+django-chatbot)",
}

TWILIO_MESSAGES_BASE = "https://api.twilio.com/2010-04-01/Accounts"


def _add_months(source: date, months: int) -> date:
    year = source.year + (source.month - 1 + months) // 12
    month = (source.month - 1 + months) % 12 + 1
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    last_day = (next_month - timezone.timedelta(days=1)).day
    day = min(source.day, last_day)
    return date(year, month, day)


def _add_membership_duration(source: date, duration_months: Decimal, duration_days: int | None = None) -> date:
    if duration_days is not None and int(duration_days) > 0:
        return source + timezone.timedelta(days=int(duration_days))
    whole_months = int(duration_months)
    has_half_month = (duration_months - Decimal(whole_months)) >= Decimal("0.5")
    end_date = _add_months(source, whole_months)
    if has_half_month:
        end_date += timezone.timedelta(days=15)
    return end_date


def _parse_duration_value(raw_value: str) -> Decimal:
    try:
        duration = Decimal(str(raw_value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid membership duration")

    if duration < Decimal("0.5"):
        raise ValueError("Invalid membership duration")

    # Only .0 and .5 increments are supported for offers.
    if (duration * 2) % 1 != 0:
        raise ValueError("Invalid membership duration")

    return duration.quantize(Decimal("0.1"))


def _parse_duration_days_value(raw_value: str) -> int:
    cleaned = str(raw_value).strip()
    if not cleaned:
        raise ValueError("Invalid membership duration days")
    if not cleaned.isdigit():
        raise ValueError("Invalid membership duration days")
    days = int(cleaned)
    if days <= 0:
        raise ValueError("Invalid membership duration days")
    return days


def _duration_to_json_value(duration: Decimal) -> float:
    return float(duration)


def _duration_to_csv_value(duration: Decimal) -> str:
    return str(int(duration)) if duration == duration.to_integral_value() else str(duration.normalize())


def _parse_payment_received_value(raw_value: str | None) -> Decimal:
    if raw_value is None:
        return Decimal("0.00")
    cleaned = str(raw_value).strip()
    if not cleaned:
        return Decimal("0.00")
    cleaned = cleaned.replace(",", "")
    try:
        amount = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid payment received amount")
    if amount < 0:
        raise ValueError("Payment received amount cannot be negative")
    return amount.quantize(Decimal("0.01"))


def _compute_member_fields(member: Member) -> dict:
    duration_days = member.membership_duration_days if member.membership_duration_days else None
    membership_end_date = _add_membership_duration(
        member.membership_start_date,
        member.membership_duration_months,
        duration_days,
    )
    duration_months_json = (
        round((float(duration_days) / 30.0), 1)
        if duration_days is not None
        else _duration_to_json_value(member.membership_duration_months)
    )
    days_remaining = (membership_end_date - timezone.localdate()).days

    if days_remaining < 0:
        status = "expired"
    elif days_remaining <= 7:
        status = "expiring_soon"
    else:
        status = "active"

    return {
        "id": member.id,
        "memberId": member.member_id,
        "fullName": member.full_name,
        "phoneNumber": member.phone_number,
        "profilePhotoUrl": member.profile_photo_url,
        "paymentMode": member.payment_mode,
        "paymentReceived": float(member.payment_received or Decimal("0")),
        "dateOfJoining": (member.date_of_joining or member.membership_start_date).isoformat(),
        "depositDate": member.deposit_date.isoformat() if member.deposit_date else None,
        "membershipStartDate": member.membership_start_date.isoformat(),
        "membershipDurationMonths": duration_months_json,
        "membershipDurationDays": duration_days,
        "membershipEndDate": membership_end_date.isoformat(),
        "status": status,
        "daysRemaining": days_remaining,
        "createdAt": member.created_at.isoformat(),
    }


def _next_member_id() -> str:
    max_num = 0
    for mid in Member.objects.values_list("member_id", flat=True):
        if mid.startswith("GYM-"):
            try:
                max_num = max(max_num, int(mid.split("-", 1)[1]))
            except ValueError:
                continue
    return f"GYM-{max_num + 1:04d}"


def _sort_members(members: list[dict], sort_by: str, sort_order: str) -> list[dict]:
    reverse = sort_order != "asc"

    def key_fn(item: dict):
        value = item.get(sort_by)
        if value is None:
            return ""
        return str(value).lower()

    return sorted(members, key=key_fn, reverse=reverse)


def _parse_put_form_data(request):
    content_type = request.META.get("CONTENT_TYPE", "")
    if not content_type.startswith("multipart/form-data"):
        return {}, {}

    try:
        parser = MultiPartParser(request.META, request, request.upload_handlers, request.encoding)
        data, files = parser.parse()
        return data, files
    except MultiPartParserError:
        return {}, {}


def _json_error(message: str, status: int = 400) -> JsonResponse:
    return JsonResponse({"error": message}, status=status)


def _read_twilio_whatsapp_config() -> tuple[str, str, str]:
    account_sid = str(os.environ.get("TWILIO_ACCOUNT_SID", "")).strip()
    auth_token = str(os.environ.get("TWILIO_AUTH_TOKEN", "")).strip()
    from_number = str(os.environ.get("TWILIO_WHATSAPP_FROM", "")).strip()
    if from_number and not from_number.lower().startswith("whatsapp:"):
        from_number = "whatsapp:" + from_number
    return account_sid, auth_token, from_number


def _normalize_phone_for_whatsapp(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.lower().startswith("whatsapp:"):
        raw = raw.split(":", 1)[1].strip()
    plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""
    if plus:
        return "+" + digits
    # India-friendly normalization for local 10-digit numbers.
    if len(digits) == 10:
        return "+91" + digits
    return "+" + digits


def _send_whatsapp_message(phone_number: str, message: str) -> tuple[bool, str]:
    account_sid, auth_token, from_number = _read_twilio_whatsapp_config()
    if not account_sid or not auth_token or not from_number:
        return False, "WhatsApp config missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM"

    recipient = _normalize_phone_for_whatsapp(phone_number)
    if not recipient:
        return False, "Invalid member phone number"

    payload = urlparse.urlencode(
        {
            "From": from_number,
            "To": "whatsapp:" + recipient,
            "Body": str(message or ""),
        }
    ).encode("utf-8")
    endpoint = f"{TWILIO_MESSAGES_BASE}/{account_sid}/Messages.json"
    auth = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
    req = urlrequest.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "GymMasterSuite/1.0 (+whatsapp-notifier)",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=20) as resp:
            status = getattr(resp, "status", 200)
            body = resp.read().decode("utf-8", errors="ignore")
            if 200 <= int(status) < 300:
                return True, body
            return False, f"Twilio HTTP {status}: {body[:220]}"
    except urlerror.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        return False, f"Twilio HTTP {exc.code}: {body[:220]}"
    except Exception as exc:
        return False, str(exc)


def send_expiry_notifications_whatsapp() -> dict:
    members = [_compute_member_fields(m) for m in Member.objects.all()]
    expiring = [m for m in members if m["status"] == "expiring_soon"]

    sent = 0
    failed = 0
    member_names: list[str] = []

    for member in expiring:
        message = (
            f"Your gym membership expires on {member['membershipEndDate']}. "
            "Please renew to continue."
        )
        was_sent, detail = _send_whatsapp_message(member.get("phoneNumber", ""), message)
        log_message = message if was_sent else f"{message} [Delivery error: {detail}]"
        try:
            NotificationLog.objects.create(
                member_id=member["id"],
                member_name=member["fullName"],
                phone_number=member["phoneNumber"],
                message=log_message,
                status=NotificationLog.STATUS_SENT if was_sent else NotificationLog.STATUS_FAILED,
                sent_at=timezone.now(),
            )
            if was_sent:
                sent += 1
                member_names.append(member["fullName"])
            else:
                failed += 1
        except Exception:
            failed += 1
            NotificationLog.objects.create(
                member_id=member["id"],
                member_name=member["fullName"],
                phone_number=member["phoneNumber"],
                message=log_message,
                status=NotificationLog.STATUS_FAILED,
                sent_at=timezone.now(),
            )

    return {"sent": sent, "failed": failed, "members": member_names, "provider": "twilio_whatsapp"}


def _is_admin_authenticated(request) -> bool:
    user = request.user
    return bool(user.is_authenticated and (user.is_staff or user.is_superuser))


def _safe_upload_name(raw_name: str) -> str:
    original = Path(str(raw_name or "")).name
    stem = Path(original).stem or "file"
    suffix = Path(original).suffix.lower()
    cleaned_stem = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in stem).strip("-_") or "file"
    return f"{cleaned_stem}{suffix}"


def _read_login_background_config() -> dict:
    default_payload = {"mediaType": None, "mediaUrl": None}
    if not LOGIN_BG_CONFIG_FILE.exists():
        return default_payload
    try:
        raw = LOGIN_BG_CONFIG_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return default_payload
    media_type = str(data.get("mediaType") or "").strip().lower()
    media_url = str(data.get("mediaUrl") or "").strip()
    if media_type not in {"image", "video"} or not media_url:
        return default_payload
    return {"mediaType": media_type, "mediaUrl": media_url}


def _write_login_background_config(media_type: str | None, media_url: str | None) -> None:
    payload = {
        "mediaType": media_type if media_type in {"image", "video"} else None,
        "mediaUrl": media_url if media_url else None,
        "updatedAt": timezone.now().isoformat(),
    }
    LOGIN_BG_CONFIG_FILE.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def _remove_uploaded_login_background(media_url: str | None) -> None:
    if not media_url:
        return
    prefix = "/api/uploads/"
    if not str(media_url).startswith(prefix):
        return
    safe_name = Path(str(media_url)[len(prefix) :]).name
    file_path = (UPLOADS_DIR / safe_name).resolve()
    if not str(file_path).startswith(str(UPLOADS_DIR.resolve())):
        return
    if not file_path.exists():
        return
    if not safe_name.startswith("login-bg-"):
        return
    try:
        file_path.unlink()
    except OSError:
        return


@require_http_methods(["GET"])
def healthz(_request):
    return JsonResponse({"status": "ok"})


@csrf_exempt
@require_http_methods(["GET"])
def auth_me(request):
    user = request.user
    is_admin = _is_admin_authenticated(request)
    return JsonResponse(
        {
            "authenticated": is_admin,
            "username": user.username if is_admin else None,
        }
    )


@csrf_exempt
@require_http_methods(["POST"])
def auth_login(request):
    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        payload = {}

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()
    if not username or not password:
        return _json_error("Username and password are required")

    user = authenticate(request, username=username, password=password)
    if not user:
        return _json_error("Invalid username or password", status=401)
    if not (user.is_staff or user.is_superuser):
        return _json_error("Admin access required", status=403)

    login(request, user)
    return JsonResponse({"success": True, "username": user.username})


@csrf_exempt
@require_http_methods(["POST"])
def auth_logout(request):
    logout(request)
    return JsonResponse({"success": True})


@csrf_exempt
@require_http_methods(["POST"])
def auth_register(request):
    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        payload = {}

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()
    confirm_password = str(payload.get("confirmPassword", "")).strip()

    if not username or not password or not confirm_password:
        return _json_error("Username, password and confirm password are required")
    if password != confirm_password:
        return _json_error("Passwords do not match")
    if len(password) < 8:
        return _json_error("Password must be at least 8 characters")

    User = get_user_model()
    if User.objects.filter(username=username).exists():
        return _json_error("Username already exists")

    user = User.objects.create_user(
        username=username,
        password=password,
        is_staff=True,
    )
    return JsonResponse({"success": True, "username": user.username}, status=201)


@csrf_exempt
@require_http_methods(["POST"])
def auth_change_password(request):
    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        payload = {}

    username = str(payload.get("username", "")).strip()
    current_password = str(payload.get("currentPassword", "")).strip()
    new_password = str(payload.get("newPassword", "")).strip()
    confirm_new_password = str(payload.get("confirmNewPassword", "")).strip()

    if not username or not current_password or not new_password or not confirm_new_password:
        return _json_error("All fields are required")
    if new_password != confirm_new_password:
        return _json_error("New passwords do not match")
    if len(new_password) < 8:
        return _json_error("New password must be at least 8 characters")

    user = authenticate(request, username=username, password=current_password)
    if not user:
        return _json_error("Invalid username or current password", status=401)
    if not (user.is_staff or user.is_superuser):
        return _json_error("Admin access required", status=403)

    user.set_password(new_password)
    user.save(update_fields=["password"])
    return JsonResponse({"success": True, "message": "Password changed successfully"})


@csrf_exempt
@require_http_methods(["GET", "POST", "DELETE"])
def auth_login_background(request):
    if request.method == "GET":
        config = _read_login_background_config()
        return JsonResponse(
            {
                "mediaType": config.get("mediaType"),
                "mediaUrl": config.get("mediaUrl"),
                "configured": bool(config.get("mediaType") and config.get("mediaUrl")),
            }
        )

    # In local/dev deployments, allow this endpoint even when the session check
    # is not available (for example reverse-proxy or prefixed frontend setups).
    if not _is_admin_authenticated(request) and not settings.DEBUG:
        return _json_error("Admin access required", status=403)

    if request.method == "DELETE":
        current = _read_login_background_config()
        _remove_uploaded_login_background(current.get("mediaUrl"))
        _write_login_background_config(None, None)
        return JsonResponse({"success": True, "message": "Login background reset"})

    try:
        uploaded = request.FILES.get("file")
    except RequestDataTooBig:
        return _json_error("Uploaded file is too large", status=413)
    if not uploaded:
        return _json_error("No media file provided")

    safe_name = _safe_upload_name(uploaded.name)
    suffix = Path(safe_name).suffix.lower()
    try:
        requested_type = str(request.POST.get("mediaType", "")).strip().lower()
    except RequestDataTooBig:
        return _json_error("Uploaded file is too large", status=413)
    content_type = str(uploaded.content_type or "").strip().lower()
    if content_type.startswith("video/") or suffix in LOGIN_BG_ALLOWED_VIDEO_EXTS:
        guessed_type = "video"
    else:
        guessed_type = "image"
    media_type = requested_type if requested_type in {"image", "video"} else guessed_type

    if media_type == "video":
        if not (content_type.startswith("video/") or suffix in LOGIN_BG_ALLOWED_VIDEO_EXTS):
            return _json_error("Unsupported video format")
    else:
        if not (content_type.startswith("image/") or suffix in LOGIN_BG_ALLOWED_IMAGE_EXTS):
            return _json_error("Unsupported image format")

    filename = f"login-bg-{int(timezone.now().timestamp() * 1000)}-{safe_name}"
    file_path = (UPLOADS_DIR / filename).resolve()
    if not str(file_path).startswith(str(UPLOADS_DIR.resolve())):
        return _json_error("Invalid upload path", status=400)
    with open(file_path, "wb+") as destination:
        for chunk in uploaded.chunks():
            destination.write(chunk)

    previous = _read_login_background_config()
    media_url = f"/api/uploads/{filename}"
    _write_login_background_config(media_type, media_url)
    _remove_uploaded_login_background(previous.get("mediaUrl"))

    return JsonResponse(
        {
            "success": True,
            "mediaType": media_type,
            "mediaUrl": media_url,
            "configured": True,
        }
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def members_collection(request):
    if request.method == "GET":
        search = request.GET.get("search", "").strip().lower()
        status = request.GET.get("status")
        page = int(request.GET.get("page", "1") or "1")
        limit = int(request.GET.get("limit", "10") or "10")
        sort_by = request.GET.get("sortBy", "createdAt")
        sort_order = request.GET.get("sortOrder", "desc")

        members = [_compute_member_fields(m) for m in Member.objects.all()]

        if search:
            members = [
                m
                for m in members
                if search in m["fullName"].lower()
                or search in m["memberId"].lower()
                or search in m["phoneNumber"].lower()
            ]

        if status and status != "all":
            members = [m for m in members if m["status"] == status]

        members = _sort_members(members, sort_by, sort_order)

        total = len(members)
        total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 0
        page = max(1, page)
        start = (page - 1) * limit
        end = start + limit

        return JsonResponse(
            {
                "members": members[start:end],
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": total_pages,
            }
        )

    json_payload = {}
    content_type = (request.content_type or "").split(";")[0].strip().lower()
    if content_type == "application/json":
        try:
            raw = request.body.decode("utf-8") if request.body else "{}"
            parsed = json.loads(raw or "{}")
            if isinstance(parsed, dict):
                json_payload = parsed
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _json_error("Invalid JSON body")

    def _read_field(key: str) -> str:
        post_val = request.POST.get(key)
        if post_val is not None and str(post_val).strip() != "":
            return str(post_val).strip()
        json_val = json_payload.get(key)
        return str(json_val).strip() if json_val is not None else ""

    full_name = _read_field("fullName")
    phone_number = _read_field("phoneNumber")
    payment_mode = _read_field("paymentMode") or "cash"
    payment_received = _read_field("paymentReceived")
    date_of_joining = _read_field("dateOfJoining")
    deposit_date = _read_field("depositDate")
    membership_start_date = _read_field("membershipStartDate")
    membership_duration_months = _read_field("membershipDurationMonths")
    membership_duration_days = _read_field("membershipDurationDays")

    if not full_name or not phone_number or not membership_start_date:
        return _json_error("Missing required fields")
    if not membership_duration_months and not membership_duration_days:
        return _json_error("Missing required fields")

    duration_days_value = None
    if membership_duration_days:
        try:
            duration_days_value = _parse_duration_days_value(membership_duration_days)
        except ValueError as exc:
            return _json_error(str(exc))

    try:
        if membership_duration_months:
            duration = _parse_duration_value(membership_duration_months)
        elif duration_days_value is not None:
            duration = Decimal("1.0")
        else:
            return _json_error("Missing required fields")
    except ValueError as exc:
        return _json_error(str(exc))

    try:
        start_date = date.fromisoformat(membership_start_date)
    except ValueError:
        return _json_error("Invalid start date")

    try:
        joining_date = date.fromisoformat(date_of_joining) if date_of_joining else start_date
    except ValueError:
        return _json_error("Invalid date of joining")

    try:
        parsed_deposit_date = date.fromisoformat(deposit_date) if deposit_date else None
    except ValueError:
        return _json_error("Invalid deposit date")
    try:
        parsed_payment_received = _parse_payment_received_value(payment_received)
    except ValueError as exc:
        return _json_error(str(exc))

    profile_photo_url = None
    if "profilePhoto" in request.FILES:
        uploaded = request.FILES["profilePhoto"]
        filename = f"{int(timezone.now().timestamp() * 1000)}-{uploaded.name}"
        file_path = UPLOADS_DIR / filename
        with open(file_path, "wb+") as destination:
            for chunk in uploaded.chunks():
                destination.write(chunk)
        profile_photo_url = f"/api/uploads/{filename}"

    member = Member.objects.create(
        member_id=_next_member_id(),
        full_name=full_name,
        phone_number=phone_number,
        profile_photo_url=profile_photo_url,
        payment_mode=payment_mode,
        payment_received=parsed_payment_received,
        membership_start_date=start_date,
        date_of_joining=joining_date,
        deposit_date=parsed_deposit_date,
        membership_duration_days=duration_days_value,
        membership_duration_months=duration,
    )

    return JsonResponse(_compute_member_fields(member), status=201)


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def member_item(request, member_id: int):
    try:
        member = Member.objects.get(id=member_id)
    except Member.DoesNotExist:
        return _json_error("Member not found", status=404)

    if request.method == "GET":
        return JsonResponse(_compute_member_fields(member))

    if request.method == "DELETE":
        member.delete()
        return JsonResponse({"success": True, "message": "Member deleted"})

    data, files = _parse_put_form_data(request)
    json_payload = {}
    content_type = (request.content_type or "").split(";")[0].strip().lower()
    if content_type == "application/json":
        try:
            raw = request.body.decode("utf-8") if request.body else "{}"
            parsed = json.loads(raw or "{}")
            if isinstance(parsed, dict):
                json_payload = parsed
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _json_error("Invalid JSON body")

    def _read_update_field(key: str):
        form_val = data.get(key)
        if form_val is not None:
            return form_val
        return json_payload.get(key)

    full_name = _read_update_field("fullName")
    phone_number = _read_update_field("phoneNumber")
    payment_mode = _read_update_field("paymentMode")
    payment_received = _read_update_field("paymentReceived")
    date_of_joining = _read_update_field("dateOfJoining")
    deposit_date = _read_update_field("depositDate")
    membership_start_date = _read_update_field("membershipStartDate")
    membership_duration_months = _read_update_field("membershipDurationMonths")
    membership_duration_days = _read_update_field("membershipDurationDays")

    if full_name is not None:
        member.full_name = full_name.strip()
    if phone_number is not None:
        member.phone_number = phone_number.strip()
    if payment_mode is not None:
        cleaned_payment_mode = payment_mode.strip()
        member.payment_mode = cleaned_payment_mode or member.payment_mode
    if payment_received is not None:
        try:
            member.payment_received = _parse_payment_received_value(payment_received)
        except ValueError as exc:
            return _json_error(str(exc))
    if membership_start_date:
        try:
            member.membership_start_date = date.fromisoformat(membership_start_date)
        except ValueError:
            return _json_error("Invalid start date")
    if date_of_joining is not None:
        cleaned_joining = str(date_of_joining).strip()
        if cleaned_joining:
            try:
                member.date_of_joining = date.fromisoformat(cleaned_joining)
            except ValueError:
                return _json_error("Invalid date of joining")
        else:
            member.date_of_joining = None
    if deposit_date is not None:
        cleaned_deposit = str(deposit_date).strip()
        if cleaned_deposit:
            try:
                member.deposit_date = date.fromisoformat(cleaned_deposit)
            except ValueError:
                return _json_error("Invalid deposit date")
        else:
            member.deposit_date = None
    if membership_duration_months is not None:
        try:
            duration = _parse_duration_value(membership_duration_months)
            member.membership_duration_months = duration
        except ValueError as exc:
            return _json_error(str(exc))
    if membership_duration_days is not None:
        cleaned_days = str(membership_duration_days).strip()
        if cleaned_days:
            try:
                member.membership_duration_days = _parse_duration_days_value(cleaned_days)
            except ValueError as exc:
                return _json_error(str(exc))
        else:
            member.membership_duration_days = None
    elif membership_duration_months is not None:
        # Month-based update should clear any previously stored day override.
        member.membership_duration_days = None

    if "profilePhoto" in files:
        uploaded = files["profilePhoto"]
        filename = f"{int(timezone.now().timestamp() * 1000)}-{uploaded.name}"
        file_path = UPLOADS_DIR / filename
        with open(file_path, "wb+") as destination:
            for chunk in uploaded.chunks():
                destination.write(chunk)
        member.profile_photo_url = f"/api/uploads/{filename}"

    member.save()
    return JsonResponse(_compute_member_fields(member))


@require_http_methods(["GET"])
def members_export_csv(_request):
    headers = [
        "Full Name",
        "Phone Number",
        "Start Date",
        "End Date",
        "Payment Mode",
        "Duration",
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)

    for member in Member.objects.all():
        m = _compute_member_fields(member)
        writer.writerow(
            [
                m["fullName"],
                m["phoneNumber"],
                m["membershipStartDate"],
                m["membershipEndDate"],
                m["paymentMode"],
                _duration_to_csv_value(Decimal(str(m["membershipDurationMonths"]))),
            ]
        )

    response = HttpResponse(output.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="members-{timezone.localdate().isoformat()}.csv"'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def members_import_csv(request):
    csv_file = request.FILES.get("csv")
    if not csv_file:
        return _json_error("No CSV file provided")

    try:
        text = csv_file.read().decode("utf-8")
    except UnicodeDecodeError:
        return _json_error("Invalid CSV encoding")

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return _json_error("CSV file is empty")

    def _norm(label: str) -> str:
        return "".join(ch for ch in label.lower() if ch.isalnum())

    header_aliases = {
        "full_name": {"fullname", "name"},
        "phone_number": {"phonenumber", "phone", "mobile", "mobilenumber", "contactnumber"},
        "start_date": {"startdate", "membershipstartdate", "start"},
        "end_date": {"enddate", "membershipenddate", "expirydate", "end"},
        "payment_mode": {"paymentmode", "modeofpayment", "payment"},
        "duration": {"duration", "durationmonths", "membershipduration", "months"},
    }

    first_row = next(csv.reader([lines[0]]))
    first_norm = {_norm(col) for col in first_row}
    has_header = any(first_norm & aliases for aliases in header_aliases.values())

    imported = 0
    errors: list[str] = []

    def _parse_duration_from_end(start_date: date, end_date_raw: str, row_num: int) -> Decimal | None:
        try:
            end_date = date.fromisoformat(end_date_raw)
        except ValueError:
            errors.append(f"Row {row_num}: invalid end date '{end_date_raw}' - use YYYY-MM-DD")
            return None
        for half_step in range(1, 481):
            months = Decimal(half_step) / Decimal(2)
            if _add_membership_duration(start_date, months) == end_date:
                return months
        errors.append(f"Row {row_num}: end date '{end_date_raw}' does not match a valid month duration")
        return None

    if has_header:
        reader = csv.DictReader(io.StringIO(text))
        norm_to_actual: dict[str, str] = {}
        for col in (reader.fieldnames or []):
            norm_to_actual[_norm(col or "")] = col or ""

        def _get_col(row: dict, logical_name: str) -> str:
            for alias in header_aliases[logical_name]:
                actual = norm_to_actual.get(alias)
                if actual:
                    return str(row.get(actual, "")).strip().strip('"')
            return ""

        for idx, row in enumerate(reader):
            row_num = idx + 2
            if not row:
                continue
            full_name = _get_col(row, "full_name")
            phone_number = _get_col(row, "phone_number")
            start_date_raw = _get_col(row, "start_date")
            end_date_raw = _get_col(row, "end_date")
            payment_mode_raw = _get_col(row, "payment_mode")
            duration_raw = _get_col(row, "duration")

            if len(full_name) < 2:
                errors.append(f"Row {row_num}: invalid name")
                continue
            if len(phone_number) < 5:
                errors.append(f"Row {row_num}: invalid phone")
                continue
            if not start_date_raw:
                errors.append(f"Row {row_num}: missing start date")
                continue

            try:
                start_date = date.fromisoformat(start_date_raw)
            except ValueError:
                errors.append(f"Row {row_num}: invalid start date '{start_date_raw}' - use YYYY-MM-DD")
                continue

            duration: Decimal | None = None
            if duration_raw:
                try:
                    duration = _parse_duration_value(duration_raw)
                except ValueError:
                    errors.append(f"Row {row_num}: invalid duration '{duration_raw}'")
                    continue
            elif end_date_raw:
                duration = _parse_duration_from_end(start_date, end_date_raw, row_num)
                if duration is None:
                    continue
            else:
                errors.append(f"Row {row_num}: provide either duration or end date")
                continue

            payment_mode = "online" if payment_mode_raw.lower() == "online" else "cash"

            Member.objects.create(
                member_id=_next_member_id(),
                full_name=full_name,
                phone_number=phone_number,
                payment_mode=payment_mode,
                membership_start_date=start_date,
                date_of_joining=start_date,
                membership_duration_months=duration,
            )
            imported += 1
    else:
        data_lines = lines
        for idx, line in enumerate(data_lines):
            row_num = idx + 1
            fields = next(csv.reader([line]))
            fields = [f.strip().strip('"') for f in fields]

            if len(fields) >= 6:
                full_name = fields[0]
                phone_number = fields[1]
                start_date_raw = fields[2]
                end_date_raw = fields[3]
                payment_mode_raw = fields[4]
                duration_raw = fields[5]
            elif len(fields) >= 4:
                # Backward compatibility: Full Name, Phone Number, Start Date, Duration
                full_name = fields[0]
                phone_number = fields[1]
                start_date_raw = fields[2]
                end_date_raw = ""
                payment_mode_raw = "cash"
                duration_raw = fields[3]
            else:
                errors.append(f"Row {row_num}: expected at least 4 columns")
                continue

            if len(full_name) < 2:
                errors.append(f"Row {row_num}: invalid name")
                continue
            if len(phone_number) < 5:
                errors.append(f"Row {row_num}: invalid phone")
                continue
            if not start_date_raw:
                errors.append(f"Row {row_num}: missing start date")
                continue

            try:
                start_date = date.fromisoformat(start_date_raw)
            except ValueError:
                errors.append(f"Row {row_num}: invalid start date '{start_date_raw}' - use YYYY-MM-DD")
                continue

            duration: Decimal | None = None
            if duration_raw:
                try:
                    duration = _parse_duration_value(duration_raw)
                except ValueError:
                    errors.append(f"Row {row_num}: invalid duration '{duration_raw}'")
                    continue
            elif end_date_raw:
                duration = _parse_duration_from_end(start_date, end_date_raw, row_num)
                if duration is None:
                    continue
            else:
                errors.append(f"Row {row_num}: provide either duration or end date")
                continue

            payment_mode = "online" if payment_mode_raw.lower() == "online" else "cash"

            Member.objects.create(
                member_id=_next_member_id(),
                full_name=full_name,
                phone_number=phone_number,
                payment_mode=payment_mode,
                membership_start_date=start_date,
                date_of_joining=start_date,
                membership_duration_months=duration,
            )
            imported += 1

    return JsonResponse(
        {
            "imported": imported,
            "skipped": len(errors),
            "errors": errors,
            "total": len(lines) - (1 if has_header else 0),
        }
    )


@require_http_methods(["GET"])
def members_calendar(_request, year: int, month: int):
    if month < 1 or month > 12:
        return _json_error("Invalid year or month")

    expiry_dates: dict[str, list[dict]] = {}
    for member in Member.objects.all():
        m = _compute_member_fields(member)
        y, mo, day = m["membershipEndDate"].split("-")
        if int(y) == year and int(mo) == month:
            expiry_dates.setdefault(day, []).append(m)

    return JsonResponse({"year": year, "month": month, "expiryDates": expiry_dates})


@require_http_methods(["GET"])
def dashboard_stats(_request):
    members = [_compute_member_fields(m) for m in Member.objects.all()]

    today = timezone.localdate()
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = date(today.year + 1, 1, 1) - timezone.timedelta(days=1)
    else:
        month_end = date(today.year, today.month + 1, 1) - timezone.timedelta(days=1)

    total_members = len(members)
    active_members = len([m for m in members if m["status"] == "active"])
    expiring_soon_members = len([m for m in members if m["status"] == "expiring_soon"])
    expired_members = len([m for m in members if m["status"] == "expired"])
    new_members_this_month = len(
        [
            m
            for m in members
            if month_start.isoformat() <= m["membershipStartDate"] <= month_end.isoformat()
        ]
    )

    return JsonResponse(
        {
            "totalMembers": total_members,
            "activeMembers": active_members,
            "expiringSoonMembers": expiring_soon_members,
            "expiredMembers": expired_members,
            "newMembersThisMonth": new_members_this_month,
            "renewalsDue": expiring_soon_members + expired_members,
        }
    )


@require_http_methods(["GET"])
def dashboard_expiring_soon(_request):
    members = [_compute_member_fields(m) for m in Member.objects.all()]
    expiring = [m for m in members if m["status"] == "expiring_soon"]
    expiring.sort(key=lambda item: item["daysRemaining"])
    return JsonResponse(expiring, safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def notifications_send(_request):
    return JsonResponse(send_expiry_notifications_whatsapp())


@require_http_methods(["GET"])
def notifications_history(_request):
    logs = NotificationLog.objects.select_related("member").all()[:100]
    data = [
        {
            "id": log.id,
            "memberId": log.member_id,
            "memberName": log.member_name,
            "phoneNumber": log.phone_number,
            "message": log.message,
            "status": log.status,
            "sentAt": log.sent_at.isoformat(),
        }
        for log in logs
    ]
    return JsonResponse(data, safe=False)


def _read_groq_api_keys() -> list[str]:
    key_path = settings.BASE_DIR / "api_key.txt"
    try:
        raw = key_path.read_text(encoding="utf-8")
    except OSError:
        raw = ""

    parsed: list[str] = []
    for line in raw.splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.startswith("#"):
            continue
        if "=" in cleaned:
            cleaned = cleaned.split("=", 1)[1].strip()
        cleaned = cleaned.strip("\"'")
        if cleaned:
            parsed.append(cleaned)

    # newest key wins: if user appends keys, last line is tried first
    ordered = list(reversed(parsed))
    if ordered:
        return ordered

    env_key = str(os.environ.get("GROQ_API_KEY", "")).strip() or str(os.environ.get("GEMINI_API_KEY", "")).strip()
    if env_key:
        return [env_key.strip("\"'")]
    return []


def _read_groq_api_key() -> str:
    keys = _read_groq_api_keys()
    return keys[0] if keys else ""


def _read_groq_api_key_with_source() -> tuple[str, str]:
    keys = _read_groq_api_keys()
    if not keys:
        return "", "none"
    key_path = settings.BASE_DIR / "api_key.txt"
    try:
        raw = key_path.read_text(encoding="utf-8")
    except OSError:
        raw = ""
    source = "file" if any((ln or "").strip() for ln in raw.splitlines()) else "env"
    return keys[0], source


def _mask_key(value: str) -> str:
    v = str(value or "")
    if len(v) <= 8:
        return "*" * len(v)
    return v[:6] + ("*" * (len(v) - 10)) + v[-4:]


def _compact_member_row(member: dict) -> dict:
    return {
        "memberId": member.get("memberId"),
        "fullName": member.get("fullName"),
        "phoneNumber": member.get("phoneNumber"),
        "paymentMode": member.get("paymentMode"),
        "paymentReceived": member.get("paymentReceived"),
        "membershipStartDate": member.get("membershipStartDate"),
        "membershipEndDate": member.get("membershipEndDate"),
        "membershipDurationMonths": member.get("membershipDurationMonths"),
        "membershipDurationDays": member.get("membershipDurationDays"),
        "status": member.get("status"),
        "daysRemaining": member.get("daysRemaining"),
    }


def _is_membership_domain_query(question: str) -> bool:
    q = str(question or "").lower()
    domain_terms = [
        "member",
        "members",
        "membership",
        "renew",
        "renewal",
        "expiry",
        "expire",
        "expiring",
        "active",
        "expired",
        "joining",
        "join date",
        "end date",
        "status",
        "gym-",
    ]
    return any(term in q for term in domain_terms)


def _build_chatbot_context(question: str) -> dict:
    members = [_compute_member_fields(m) for m in Member.objects.all()]
    q = question.lower().strip()
    tokens = [t for t in q.replace(",", " ").split() if len(t) >= 3]

    matched_members: list[dict] = []
    if tokens:
        for member in members:
            haystack = " ".join(
                [
                    str(member.get("memberId", "")).lower(),
                    str(member.get("fullName", "")).lower(),
                    str(member.get("phoneNumber", "")).lower(),
                    str(member.get("status", "")).lower(),
                ]
            )
            if all(tok in haystack for tok in tokens[:4]):
                matched_members.append(member)

    if matched_members:
        matched_members = matched_members[:80]
    elif _is_membership_domain_query(question):
        # For domain-related queries without an exact text hit, provide a broad sample.
        matched_members = members[:150]
    else:
        matched_members = []

    stats = {
        "totalMembers": len(members),
        "activeMembers": len([m for m in members if m["status"] == "active"]),
        "expiringSoonMembers": len([m for m in members if m["status"] == "expiring_soon"]),
        "expiredMembers": len([m for m in members if m["status"] == "expired"]),
        "today": timezone.localdate().isoformat(),
    }

    return {
        "stats": stats,
        "matchedMembers": [_compact_member_row(m) for m in matched_members],
    }


def _groq_generate_db_answer(question: str, context_payload: dict, api_key: str) -> str:
    system_prompt = (
        "You are a gym management assistant. Use ONLY the JSON context data provided below. "
        "First compute from stats and matchedMembers when possible. "
        "Do not say data is unavailable if the needed fields exist in the context. "
        "Only say data is unavailable when the specific data is truly absent from context. "
        "Be concise and accurate. For dates, keep YYYY-MM-DD format."
    )
    user_prompt = f"User question: {question}\n\nContext JSON:\n{json.dumps(context_payload, ensure_ascii=True)}"

    payload = {
        "model": GROQ_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 350,
    }

    req = urlrequest.Request(
        GROQ_CHAT_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={**GROQ_HTTP_HEADERS, "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=25) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    candidates = data.get("candidates") or []
    if not candidates and isinstance(data.get("choices"), list):
        candidates = data.get("choices") or []
    if not candidates:
        return "I could not generate an answer from the available database context."
    first = candidates[0] if isinstance(candidates[0], dict) else {}
    msg = first.get("message") if isinstance(first, dict) else None
    answer = ""
    if isinstance(msg, dict):
        answer = str(msg.get("content", "")).strip()
    if not answer:
        parts = ((first.get("content") or {}).get("parts")) or []
        text_parts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        answer = "\n".join([t for t in text_parts if t]).strip()
    return answer or "I could not generate an answer from the available database context."


def _groq_generate_general_answer(question: str, api_key: str) -> str:
    payload = {
        "model": GROQ_CHAT_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a helpful gym assistant. "
                    "Give concise practical guidance using general fitness knowledge. "
                    "If a term looks misspelled, infer the most likely fitness term and answer with that assumption. "
                    "Do not fabricate user-specific database facts."
                ),
            },
            {"role": "user", "content": f"User question: {question}"},
        ],
        "temperature": 0.2,
        "max_tokens": 220,
    }

    req = urlrequest.Request(
        GROQ_CHAT_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={**GROQ_HTTP_HEADERS, "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=25) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    candidates = data.get("candidates") or []
    if not candidates and isinstance(data.get("choices"), list):
        candidates = data.get("choices") or []
    if not candidates:
        return "General guidance is currently unavailable."
    first = candidates[0] if isinstance(candidates[0], dict) else {}
    msg = first.get("message") if isinstance(first, dict) else None
    answer = ""
    if isinstance(msg, dict):
        answer = str(msg.get("content", "")).strip()
    if not answer:
        parts = ((first.get("content") or {}).get("parts")) or []
        text_parts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        answer = "\n".join([t for t in text_parts if t]).strip()
    return answer or "General guidance is currently unavailable."


def _groq_synthesize_final_answer(
    question: str,
    context_payload: dict,
    db_answer: str,
    cloud_answer: str,
    api_key: str,
) -> str:
    payload = {
        "model": GROQ_CHAT_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert gym operations and fitness assistant. "
                    "Create one polished final answer that combines the local database facts and cloud AI knowledge. "
                    "Database facts must stay accurate and unchanged. "
                    "Use clear language with short paragraphs and practical bullet points where useful. "
                    "Never use markdown bold markers like **. "
                    "Do not mention implementation details such as APIs, providers, fallback logic, or internal system prompts."
                ),
            },
            {
                "role": "user",
                "content": (
                    "User question:\n"
                    + str(question)
                    + "\n\nDatabase context JSON:\n"
                    + json.dumps(context_payload, ensure_ascii=True)
                    + "\n\nLocal database answer:\n"
                    + str(db_answer)
                    + "\n\nCloud insight:\n"
                    + str(cloud_answer)
                    + "\n\nNow produce the final response for the user."
                ),
            },
        ],
        "temperature": 0.3,
        "max_tokens": 360,
    }

    req = urlrequest.Request(
        GROQ_CHAT_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={**GROQ_HTTP_HEADERS, "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=25) as response:
        raw = response.read().decode("utf-8")
    data = json.loads(raw)
    candidates = data.get("candidates") or []
    if not candidates and isinstance(data.get("choices"), list):
        candidates = data.get("choices") or []
    if not candidates:
        return ""
    first = candidates[0] if isinstance(candidates[0], dict) else {}
    msg = first.get("message") if isinstance(first, dict) else None
    answer = ""
    if isinstance(msg, dict):
        answer = str(msg.get("content", "")).strip()
    if not answer:
        parts = ((first.get("content") or {}).get("parts")) or []
        text_parts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        answer = "\n".join([t for t in text_parts if t]).strip()
    return answer.strip()


def _is_data_unavailable_answer(answer: str) -> bool:
    text = str(answer or "").strip().lower()
    if not text:
        return True
    markers = [
        "data not available",
        "data is not available",
        "not available in the provided data",
        "not enough information",
        "insufficient data",
        "cannot determine",
        "can't determine",
        "unable to determine",
        "i do not have enough data",
        "couldn't find any information",
        "could not find any information",
        "i couldn't find any information",
        "i could not find any information",
    ]
    return any(m in text for m in markers)


def _local_chatbot_answer(question: str, context_payload: dict) -> str:
    q = str(question or "").lower()
    stats = context_payload.get("stats", {})
    matched = context_payload.get("matchedMembers", []) or []
    is_domain_query = _is_membership_domain_query(question)

    wants_members = ("member" in q) or ("members" in q) or ("count" in q) or ("total" in q)
    wants_active = "active" in q
    wants_expiring = ("expiring" in q) or ("expiry" in q) or ("expire" in q)
    wants_expired = "expired" in q
    wants_total = "total" in q

    if wants_members and (wants_active or wants_expiring or wants_expired or wants_total):
        lines = []
        if wants_total:
            lines.append(f"Total members: {stats.get('totalMembers', 0)}")
        if wants_active:
            lines.append(f"Active members: {stats.get('activeMembers', 0)}")
        if wants_expiring:
            lines.append(f"Expiring soon members: {stats.get('expiringSoonMembers', 0)}")
        if wants_expired:
            lines.append(f"Expired members: {stats.get('expiredMembers', 0)}")
        if lines:
            return ". ".join(lines) + "."

    if wants_members and not (wants_active or wants_expiring or wants_expired or wants_total):
        return (
            f"Total members: {stats.get('totalMembers', 0)}. "
            f"Active: {stats.get('activeMembers', 0)}. "
            f"Expiring soon: {stats.get('expiringSoonMembers', 0)}. "
            f"Expired: {stats.get('expiredMembers', 0)}."
        )

    if matched and is_domain_query:
        lines = []
        for item in matched[:8]:
            lines.append(
                f"{item.get('fullName', '-')}: status {item.get('status', '-')}, end date {item.get('membershipEndDate', '-')}"
            )
        return "From local database records:\n" + "\n".join(lines)

    if not is_domain_query:
        return (
            "This question is outside member-specific database data. "
            f"Current local database snapshot: Total members {stats.get('totalMembers', 0)}, "
            f"Active {stats.get('activeMembers', 0)}, "
            f"Expiring soon {stats.get('expiringSoonMembers', 0)}, "
            f"Expired {stats.get('expiredMembers', 0)}."
        )

    return (
        "Local database summary:\n"
        f"Total members: {stats.get('totalMembers', 0)}, "
        f"Active: {stats.get('activeMembers', 0)}, "
        f"Expiring soon: {stats.get('expiringSoonMembers', 0)}, "
        f"Expired: {stats.get('expiredMembers', 0)}."
    )


def _probe_groq_api(api_key: str) -> dict:
    if not api_key:
        return {"ok": False, "reason": "missing_key"}
    probe_context = {
        "stats": {"totalMembers": 0, "activeMembers": 0, "expiringSoonMembers": 0, "expiredMembers": 0, "today": timezone.localdate().isoformat()},
        "matchedMembers": [],
    }
    try:
        _groq_generate_db_answer("Reply with exactly: OK", probe_context, api_key)
        return {"ok": True, "reason": "success"}
    except urlerror.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")
        except Exception:
            detail = str(exc)
        return {"ok": False, "reason": f"http_{exc.code}", "detail": detail[:300]}
    except urlerror.URLError as exc:
        return {"ok": False, "reason": "network_error", "detail": str(exc.reason)}
    except Exception as exc:
        return {"ok": False, "reason": "unexpected_error", "detail": str(exc)}


def _probe_groq_api_keys(api_keys: list[str]) -> dict:
    if not api_keys:
        return {"ok": False, "reason": "missing_key", "tested": 0, "results": []}
    results: list[dict] = []
    for idx, key in enumerate(api_keys, 1):
        probe = _probe_groq_api(key)
        probe["keyIndex"] = idx
        probe["keyMasked"] = _mask_key(key)
        results.append(probe)
        if probe.get("ok"):
            return {"ok": True, "reason": "success", "tested": idx, "results": results}
    return {"ok": False, "reason": "all_failed", "tested": len(api_keys), "results": results}


@csrf_exempt
@require_http_methods(["POST"])
def chatbot_query(request):
    try:
        payload = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        payload = {}

    question = str(payload.get("message", "")).strip()
    if not question:
        return _json_error("Message is required")

    api_keys = _read_groq_api_keys()
    context_payload = _build_chatbot_context(question)

    if not api_keys:
        db_answer = _local_chatbot_answer(question, context_payload)
        return JsonResponse(
            {
                "answer": (
                    "Database Insight:\n"
                    + db_answer
                    + "\n\nGroq Insight:\n"
                    + "Groq insight is unavailable because API key is missing."
                ),
                "provider": "local-fallback",
                "warning": "Groq API key missing. Using local database fallback.",
                "dbAnswer": db_answer,
                "groqGeneralAnswer": "Groq insight unavailable (missing key).",
                # Backward compatibility for existing frontend consumers.
                "geminiGeneralAnswer": "Groq insight unavailable (missing key).",
                "contextSummary": {
                    "totalMembers": context_payload["stats"]["totalMembers"],
                    "matchedMembersCount": len(context_payload["matchedMembers"]),
                },
            }
        )

    is_domain_query = _is_membership_domain_query(question)
    last_warning = ""
    for idx, api_key in enumerate(api_keys, 1):
        db_answer = _local_chatbot_answer(question, context_payload)
        groq_db_answer = ""
        groq_general = ""
        warnings: list[str] = []

        if is_domain_query:
            try:
                groq_db_answer = _groq_generate_db_answer(question, context_payload, api_key)
            except urlerror.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8")
                except Exception:
                    detail = str(exc)
                warnings.append(f"Groq DB-call HTTP error on key #{idx}: {detail[:160]}")
            except urlerror.URLError as exc:
                warnings.append(f"Groq DB-call network error on key #{idx}: {exc.reason}")
            except Exception as exc:
                warnings.append(f"Groq DB-call error on key #{idx}: {str(exc)}")
        else:
            try:
                groq_general = _groq_generate_general_answer(question, api_key)
            except urlerror.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8")
                except Exception:
                    detail = str(exc)
                warnings.append(f"Groq general-call HTTP error on key #{idx}: {detail[:160]}")
            except urlerror.URLError as exc:
                warnings.append(f"Groq general-call network error on key #{idx}: {exc.reason}")
            except Exception as exc:
                warnings.append(f"Groq general-call error on key #{idx}: {str(exc)}")

        if _is_data_unavailable_answer(groq_db_answer):
            groq_db_answer = ""
        if _is_data_unavailable_answer(groq_general):
            groq_general = ""

        if is_domain_query:
            effective_cloud = ("Database-aware AI:\n" + groq_db_answer) if groq_db_answer else "Groq insight is temporarily unavailable."
        else:
            effective_cloud = ("General AI:\n" + groq_general) if groq_general else "Groq insight is temporarily unavailable."
        hybrid_answer = "Database Insight:\n" + db_answer + "\n\nGroq Insight:\n" + effective_cloud

        if groq_db_answer or groq_general:
            cloud_source_answer = groq_db_answer if is_domain_query else groq_general
            final_answer = ""
            if cloud_source_answer:
                try:
                    final_answer = _groq_synthesize_final_answer(
                        question=question,
                        context_payload=context_payload,
                        db_answer=db_answer,
                        cloud_answer=cloud_source_answer,
                        api_key=api_key,
                    )
                except Exception:
                    final_answer = ""
            if not final_answer:
                final_answer = hybrid_answer

            return JsonResponse(
                {
                    "answer": final_answer,
                    "provider": "hybrid",
                    "keyIndexUsed": idx,
                    "hybridAnswer": hybrid_answer,
                    "finalAnswer": final_answer,
                    "dbAnswer": db_answer,
                    "groqDbAnswer": groq_db_answer or db_answer,
                    "groqGeneralAnswer": groq_general or "",
                    # Backward compatibility for existing frontend consumers.
                    "geminiDbAnswer": groq_db_answer or db_answer,
                    "geminiGeneralAnswer": groq_general or "",
                    "warning": " | ".join(warnings) if warnings else "",
                    "contextSummary": {
                        "totalMembers": context_payload["stats"]["totalMembers"],
                        "matchedMembersCount": len(context_payload["matchedMembers"]),
                    },
                }
            )

        last_warning = " | ".join(warnings)
        continue

    db_answer = _local_chatbot_answer(question, context_payload)
    return JsonResponse(
        {
            "answer": (
                "Database Insight:\n"
                + db_answer
                + "\n\nGroq Insight:\n"
                + "Groq insight is temporarily unavailable."
            ),
            "provider": "local-fallback",
            "warning": f"All Groq keys failed. Using local fallback. {last_warning}",
            "dbAnswer": db_answer,
            "groqGeneralAnswer": "Groq insight temporarily unavailable.",
            "geminiGeneralAnswer": "Groq insight temporarily unavailable.",
            "contextSummary": {
                "totalMembers": context_payload["stats"]["totalMembers"],
                "matchedMembersCount": len(context_payload["matchedMembers"]),
            },
        }
    )


@require_http_methods(["GET"])
def chatbot_debug_key(_request):
    api_key, source = _read_groq_api_key_with_source()
    keys = _read_groq_api_keys()
    probe = _probe_groq_api_keys(keys)
    return JsonResponse(
        {
            "keyPresent": bool(api_key),
            "keyCount": len(keys),
            "keySource": source,
            "keyMasked": _mask_key(api_key),
            "allKeysMasked": [_mask_key(k) for k in keys],
            "groqProbe": probe,
            "geminiProbe": probe,
            "model": GROQ_CHAT_MODEL,
            "timestamp": timezone.now().isoformat(),
        }
    )


@require_http_methods(["GET"])
def uploaded_file(_request, filename: str):
    safe_name = Path(filename).name
    file_path = (UPLOADS_DIR / safe_name).resolve()

    if not str(file_path).startswith(str(UPLOADS_DIR.resolve())) or not file_path.exists():
        raise Http404("File not found")

    guessed_type, _enc = mimetypes.guess_type(str(file_path))
    return FileResponse(open(file_path, "rb"), content_type=guessed_type or "application/octet-stream")
