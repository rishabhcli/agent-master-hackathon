from __future__ import annotations

import os
import random
from pathlib import Path

from browser_use import BrowserSession


NOPECHA_EXT_DIR = str((Path(__file__).resolve().parent / "extensions" / "nopecha").resolve())

# Realistic Chrome user agents — rotated per session to avoid fingerprinting
_USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]


def _expand_path(value: str) -> str:
    return str(Path(value).expanduser().resolve())


def get_agent_profile_path(agent_id: int, platform: str) -> str:
    profile_env = f"MASTERBUILD_PROFILE_{agent_id}"
    if os.getenv(profile_env):
        return _expand_path(os.environ[profile_env])

    runtime_dir = Path(os.getenv("MASTERBUILD_RUNTIME_DIR", Path.cwd() / "runtime")).expanduser()
    return str((runtime_dir / "browser" / f"agent-{agent_id}").resolve())


def _get_captcha_ext_path() -> str | None:
    ext_dir = os.getenv("MASTERBUILD_CAPTCHA_EXT_DIR", NOPECHA_EXT_DIR)
    manifest = Path(ext_dir) / "manifest.json"
    if manifest.is_file():
        return str(Path(ext_dir).resolve())
    return None


def build_local_browser_session(agent_id: int, platform: str, *, headless: bool) -> BrowserSession:
    profile_path = get_agent_profile_path(agent_id, platform)
    Path(profile_path).mkdir(parents=True, exist_ok=True)

    captcha_ext = _get_captcha_ext_path()
    user_agent = _USER_AGENTS[(agent_id - 1) % len(_USER_AGENTS)]

    # Core stealth args — suppress all automation signals
    chromium_args = [
        "--disable-features=AutomationControlled",
        "--disable-blink-features=AutomationControlled",
        "--exclude-switches=enable-automation",
        "--disable-infobars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
        "--lang=en-US",
        "--accept-lang=en-US,en;q=0.9",
        # Prevent detection via missing hardware APIs
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        # WebGL fingerprint suppression
        "--disable-reading-from-canvas",
        f"--user-agent={user_agent}",
    ]

    if captcha_ext:
        chromium_args.extend([
            f"--load-extension={captcha_ext}",
            f"--disable-extensions-except={captcha_ext}",
        ])

    if headless:
        # Use new headless mode (--headless=new) which is far harder to detect than old mode
        chromium_args.extend([
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-software-rasterizer",
            "--hide-scrollbars",
            "--mute-audio",
        ])

    # Randomise window size slightly per agent to avoid uniform fingerprint
    base_w, base_h = 1440, 900
    width = base_w + (agent_id * 7) % 60    # 1440–1499
    height = base_h + (agent_id * 13) % 80  # 900–979

    return BrowserSession(
        headless=headless,
        user_data_dir=profile_path,
        user_agent=user_agent,
        disable_security=False,
        chromium_sandbox=False,
        window_size={"width": width, "height": height},
        args=chromium_args,
    )
