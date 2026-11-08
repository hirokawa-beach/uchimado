"""Offline operations. Run python -m backend.manage --help."""
import argparse
import getpass
from pathlib import Path
import sqlite3
import time

from .db import database, migrate
from .db import AdminCredential
from .security import credential, recovery_code, recovery_digest, revoke_admin, verify_pattern


def main():
    parser = argparse.ArgumentParser(description="uchimado DB maintenance; stop the server before restore")
    parser.add_argument("action", choices=["migrate", "backup", "restore", "issue-admin-recovery"])
    parser.add_argument("file", nargs="?")
    parser.add_argument("--server-stopped", action="store_true")
    args = parser.parse_args()
    engine, Session, path = database()
    admin_snapshot = None
    if args.action != "migrate":
        migrate(engine)
        with Session() as db:
            admin = credential(db)
            if not admin:
                parser.error("configure the administrator pattern on localhost first")
            if args.action == "issue-admin-recovery":
                if not args.server_stopped:
                    parser.error("stop the server and pass --server-stopped")
                code = recovery_code()
                admin.recovery_hash = recovery_digest(code)
                admin.version += 1
                revoke_admin(db)
                db.commit()
                print("One-use administrator recovery code (store offline):", code)
                print("All administrator sessions revoked. Use the recovery screen to set a new pattern.")
                engine.dispose()
                return
            entered = getpass.getpass("Administrator pattern (dot numbers 1-9, no separators): ")
            nodes = [int(c)-1 for c in entered] if entered.isascii() and entered.isdigit() else []
            if not verify_pattern(nodes, admin.pattern_hash):
                parser.error("administrator verification failed")
            admin_snapshot = {"id": admin.id, "family_id": admin.family_id, "pattern_hash": admin.pattern_hash,
                              "recovery_hash": admin.recovery_hash, "version": admin.version + 1}
    if args.action == "migrate":
        migrate(engine)
    elif args.action == "backup":
        if not args.file:
            parser.error("backup requires a destination path")
        target = Path(args.file).resolve()
        if target.exists() or target == path:
            parser.error("destination must be a new file, different from the live database")
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path) as source, sqlite3.connect(target) as dest:
            source.backup(dest)
        print("Backup created:", target)
    else:
        if not args.file or not args.server_stopped:
            parser.error("restore requires a backup file and --server-stopped")
        source_path = Path(args.file).resolve()
        if not source_path.is_file() or source_path == path:
            parser.error("source must be an existing backup, different from the live database")
        # Validate without mutating the backup.
        with sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True) as source:
            if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                parser.error("backup integrity check failed")
            tables = {row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"alembic_version", "users", "families", "sessions"} <= tables:
                parser.error("file is not an uchimado backup")
            if not source.execute("SELECT 1 FROM families WHERE id=?", (admin_snapshot["family_id"],)).fetchone():
                parser.error("backup belongs to another family")
            # Every existing live database is preserved before replacement.
            if path.exists():
                safety = path.with_name(f"before-restore-{time.time_ns()}.sqlite3")
                with sqlite3.connect(path) as old, sqlite3.connect(safety) as dest:
                    old.backup(dest)
                print("Previous database preserved:", safety)
            with sqlite3.connect(path) as dest:
                source.backup(dest)
                dest.execute("DELETE FROM sessions")
                dest.commit()
        migrate(engine)
        with Session() as db:
            # Never resurrect an old pattern, consumed recovery code or session from a backup.
            db.query(AdminCredential).delete()
            db.add(AdminCredential(**admin_snapshot))
            revoke_admin(db)
            db.commit()
        print("Database restored; administrator sessions revoked. Current pattern and recovery code retained.")
    engine.dispose()


if __name__ == "__main__":
    main()
