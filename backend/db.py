"""Database models and explicit Alembic-managed schema."""
import os
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


ROOT = Path(__file__).resolve().parents[1]


def uid():
    return str(uuid4())


def stamp():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class Family(Base):
    __tablename__ = "families"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    name: Mapped[str]


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str]
    password_hash: Mapped[str]


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("family_id", "user_id"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str]


class LoginSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(primary_key=True)  # SHA-256, never a bearer secret
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    expires: Mapped[float]


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id: Mapped[str] = mapped_column(primary_key=True)
    failures: Mapped[int] = mapped_column(default=0)
    until: Mapped[float]


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)
    version: Mapped[int] = mapped_column(default=1)


class AdminCredential(Base):
    __tablename__ = "admin_credential"
    __table_args__ = (CheckConstraint("id = 'administrator'", name="single_administrator"),)
    id: Mapped[str] = mapped_column(primary_key=True, default="administrator")
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), unique=True)
    pattern_hash: Mapped[str]
    recovery_hash: Mapped[str]
    version: Mapped[int] = mapped_column(default=1)


class AdminSession(Base):
    __tablename__ = "admin_sessions"
    id: Mapped[str] = mapped_column(primary_key=True)  # Hash of the random bearer token
    credential_version: Mapped[int]
    expires: Mapped[float]


class Calendar(Base):
    __tablename__ = "calendars"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str]
    external_provider: Mapped[str | None] = mapped_column(nullable=True)
    external_id: Mapped[str | None] = mapped_column(nullable=True)


class RecordMixin:
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"), index=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    data: Mapped[dict] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[str | None] = mapped_column(nullable=True)
    updated_at: Mapped[str] = mapped_column(default=stamp)


class CalendarEvent(RecordMixin, Base):
    __tablename__ = "events"
    calendar_id: Mapped[str] = mapped_column(ForeignKey("calendars.id"))


class Task(RecordMixin, Base):
    __tablename__ = "tasks"


class Memo(RecordMixin, Base):
    __tablename__ = "memos"


class EventException(Base):
    __tablename__ = "event_exceptions"
    __table_args__ = (UniqueConstraint("event_id", "day"),)
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    day: Mapped[str]
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class TaskCompletion(Base):
    __tablename__ = "task_completions"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id"))
    owner_id: Mapped[str | None] = mapped_column(nullable=True)
    task_id: Mapped[str]
    title: Mapped[str]
    due: Mapped[str | None] = mapped_column(nullable=True)
    completed_by: Mapped[str | None] = mapped_column(nullable=True)
    completed_at: Mapped[str] = mapped_column(default=stamp)


class WidgetLayout(RecordMixin, Base):
    __tablename__ = "widget_layouts"
    __table_args__ = (UniqueConstraint("family_id", "profile"),)
    profile: Mapped[str]


class UserSettings(RecordMixin, Base):
    __tablename__ = "user_settings"
    __table_args__ = (UniqueConstraint("family_id", "profile"),)
    profile: Mapped[str]


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    family_id: Mapped[str]
    actor: Mapped[str | None] = mapped_column(nullable=True)
    resource: Mapped[str]
    resource_id: Mapped[str]
    action: Mapped[str]
    at: Mapped[str] = mapped_column(default=stamp)
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)


def database(path=None):
    path = Path(path or os.environ.get("UCHIMADO_DB", ROOT / "data" / "uchimado.sqlite3")).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{path.as_posix()}", connect_args={"check_same_thread": False, "timeout": 15})

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=15000")

    return engine, sessionmaker(engine, expire_on_commit=False), path


def migrate(engine):
    from alembic import command
    from alembic.config import Config
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    # The authentication migration preserves records and seals private data.
    # Keep a consistent pre-migration copy before disabling legacy credentials.
    import sqlite3
    import time
    location = Path(engine.url.database)
    if location.is_file():
        with sqlite3.connect(location) as source:
            exists = source.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'").fetchone()
            revision = source.execute("SELECT version_num FROM alembic_version").fetchone() if exists else None
            if revision and revision[0] == "0001_core":
                directory = location.parent / "backups"
                directory.mkdir(exist_ok=True)
                with sqlite3.connect(directory / f"before-auth-v2-{time.time_ns()}.sqlite3") as target:
                    source.backup(target)
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
