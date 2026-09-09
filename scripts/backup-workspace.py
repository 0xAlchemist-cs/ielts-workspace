"""Daily workspace backup to OneDrive (off-site layer).

  1. git bundle --all        → IELTS-Workspace-Backup/repo/*.bundle   (keep 3)
  2. app.db VACUUM INTO      → IELTS-Workspace-Backup/db/*.sqlite     (keep 14)

VACUUM INTO takes a consistent snapshot even while the app is running (WAL-safe).
Scheduled daily via Windows Task Scheduler; also safe to run manually any time.
"""
import sqlite3
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DB = REPO / "data" / "app.db"
BACKUP_ROOT = Path.home() / "OneDrive" / "IELTS-Workspace-Backup"
REPO_DIR = BACKUP_ROOT / "repo"
DB_DIR = BACKUP_ROOT / "db"
KEEP_BUNDLES = 3
KEEP_DBS = 14


def rotate(directory: Path, pattern: str, keep: int) -> None:
    files = sorted(directory.glob(pattern))
    for old in files[:-keep] if keep > 0 else files:
        old.unlink(missing_ok=True)


def backup_repo() -> Path | None:
    if not (REPO / ".git").exists():
        return None
    REPO_DIR.mkdir(parents=True, exist_ok=True)
    dest = REPO_DIR / f"ielts-workspace-{date.today():%Y%m%d}.bundle"
    # same-day rerun overwrites (a bundle is a full snapshot, not incremental)
    subprocess.run(
        ["git", "-C", str(REPO), "bundle", "create", str(dest), "--all"],
        check=True,
        capture_output=True,
    )
    rotate(REPO_DIR, "*.bundle", KEEP_BUNDLES)
    return dest


def backup_db() -> Path | None:
    if not DB.exists():
        return None
    DB_DIR.mkdir(parents=True, exist_ok=True)
    dest = DB_DIR / f"app-db-{date.today():%Y%m%d}.sqlite"
    if dest.exists():
        dest.unlink()
    conn = sqlite3.connect(str(DB))
    try:
        conn.execute("VACUUM INTO ?", (str(dest),))
    finally:
        conn.close()
    rotate(DB_DIR, "app-db-*.sqlite", KEEP_DBS)
    return dest


def main() -> int:
    if not BACKUP_ROOT.parent.exists():
        print(f"ERROR: OneDrive folder not found at {BACKUP_ROOT.parent}")
        return 1
    started = time.time()
    bundle = backup_repo()
    dbfile = backup_db()
    if not bundle and not dbfile:
        print("nothing to back up")
        return 1
    size_mb = lambda p: f"{p.stat().st_size / 1e6:.1f}MB" if p else "-"
    print(f"backup ok in {time.time() - started:.1f}s")
    if bundle:
        print(f"  repo: {bundle.name} ({size_mb(bundle)})")
    if dbfile:
        print(f"  db:   {dbfile.name} ({size_mb(dbfile)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
