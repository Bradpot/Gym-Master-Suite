import argparse
import os
import socket
import subprocess
import sys
from pathlib import Path

import uvicorn

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "gym-manager" / "dist" / "public"


def run_migrations() -> None:
    subprocess.run([sys.executable, "manage.py", "migrate", "--noinput"], cwd=ROOT_DIR, check=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Django + prebuilt frontend via Uvicorn (Python only).",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--skip-migrate",
        action="store_true",
        help="Skip Django migrations.",
    )
    return parser.parse_args()


def get_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"
    finally:
        sock.close()
    return ip


def main() -> None:
    args = parse_args()

    if not DIST_DIR.exists():
        print(
            f"Prebuilt frontend not found: {DIST_DIR}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "gym_backend.settings")

    if not args.skip_migrate:
        run_migrations()

    lan_ip = get_lan_ip()
    if args.host == "0.0.0.0":
        print(f"Frontend URL: http://127.0.0.1:{args.port}")
        print(f"Network URL:  http://{lan_ip}:{args.port}")
    else:
        print(f"Frontend URL: http://{args.host}:{args.port}")

    uvicorn.run("gym_backend.asgi:application", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
