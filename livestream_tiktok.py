from __future__ import annotations

import os
from pathlib import Path

from browser_use import BrowserSession


def _expand_path(value: str) -> str:
    return str(Path(value).expanduser().resolve())


def get_agent_profile_path(agent_id: int, platform: str) -> str:
    if platform == "tiktok" and 1 <= agent_id <= 3:
        profile_env = f"MASTERBUILD_TIKTOK_PROFILE_{agent_id}"
        if os.getenv(profile_env):
            return _expand_path(os.environ[profile_env])

    profile_env = f"MASTERBUILD_PROFILE_{agent_id}"
    if os.getenv(profile_env):
        return _expand_path(os.environ[profile_env])

    runtime_dir = Path(os.getenv("MASTERBUILD_RUNTIME_DIR", Path.cwd() / "runtime")).expanduser()
    return str((runtime_dir / "browser" / f"agent-{agent_id}").resolve())


def build_local_browser_session(agent_id: int, platform: str, *, headless: bool) -> BrowserSession:
    profile_path = get_agent_profile_path(agent_id, platform)
    Path(profile_path).mkdir(parents=True, exist_ok=True)

    return BrowserSession(
        headless=headless,
        user_data_dir=profile_path,
        disable_security=False,
        extra_chromium_args=[
            "--window-size=1440,960",
            "--disable-features=AutomationControlled",
        ],
    )
