import asyncio
import logging
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError, OperationalError

from . import db as models
from . import schemas as schemas
from .recurrence import is_occurrence, next_due, occurrences

from .security import ADMIN_COOKIE, active_admin, credential
from .admin import admin_routes
RESOURCES = {"events": (models.CalendarEvent, schemas.EventData), "tasks": (models.Task, schemas.TaskData), "memos": (models.Memo, schemas.MemoData)}
log = logging.getLogger("uchimado")


def serialize(record, db=None):
    result = {**record.data, "id": record.id, "version": record.version,
              "createdBy": record.created_by, "updatedAt": record.updated_at}
    if db and result.get("memberId"):
        profile = db.get(models.Profile, result["memberId"])
        if profile and profile.family_id == record.family_id:
            result["member"] = profile.name
    if isinstance(record, models.CalendarEvent):
        result["calendarId"] = record.calendar_id
        if db:
            result["exceptions"] = {e.day: e.data for e in db.scalars(select(models.EventException).where(models.EventException.event_id == record.id))}
    return result


def visible(model, actor):
    condition = (model.family_id == actor["familyId"]) & model.owner_id.is_(None)
    if hasattr(model, "data"):
        visibility = model.data["visibility"].as_string()
        condition &= or_(visibility.is_(None), visibility == "family")
    return condition


def validate(schema, data):
    try:
        return schema.model_validate(data).model_dump(mode="json")
    except ValidationError as exc:
        raise HTTPException(422, "入力内容を確認してください: " + "; ".join(e["msg"] for e in exc.errors())) from exc


def create_app(db_path=None):
    engine, Session, path = models.database(db_path)
    clients: dict[WebSocket, dict] = {}

    @asynccontextmanager
    async def lifespan(_):
        models.migrate(engine)
        log.info("uchimado ready; database migrations applied")
        yield
        for ws in list(clients):
            try:
                await ws.close(code=1001)
            except (WebSocketDisconnect, RuntimeError, OSError):
                pass
        engine.dispose()

    app = FastAPI(title="uchimado", version="1.0.0", lifespan=lifespan)
    app.state.engine, app.state.Session, app.state.db_path = engine, Session, path

    @app.middleware("http")
    async def security(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            if request.headers.get("X-Uchimado") != "1":
                return JSONResponse({"detail": "操作元を確認できません。ページを開き直してください。"}, status_code=403)
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
                return JSONResponse({"detail": "別サイトからの操作は許可されません。"}, status_code=403)
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 5_000_000:
                    return JSONResponse({"detail": "送信データが大きすぎます。"}, status_code=413)
            request._body = bytes(body)
        result = await call_next(request)
        result.headers["X-Content-Type-Options"] = "nosniff"
        result.headers["Referrer-Policy"] = "same-origin"
        result.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            result.headers["Cache-Control"] = "no-store"
        return result

    @app.exception_handler(OperationalError)
    async def database_error(_, exc):
        log.error("Database operation failed (%s)", type(exc).__name__)
        return JSONResponse({"detail": "データベースを更新できません。少し待って再試行してください。"}, status_code=503)

    @app.exception_handler(IntegrityError)
    async def duplicate_error(_, __):
        return JSONResponse({"detail": "同じ名前のアカウント、または同時に作成されたデータがあります。再読み込みしてください。"}, status_code=409)

    def db_session():
        with Session() as db:
            yield db

    def family_for(db):
        family = db.get(models.Family, "home") or db.scalar(select(models.Family).order_by(models.Family.id).limit(1))
        if not family:
            raise HTTPException(503, "初期化中です。少し待って再読み込みしてください。")
        return family

    def actor_for(db, connection):
        family = family_for(db)
        selected = connection.headers.get("X-Uchimado-Profile")
        profile = db.scalar(select(models.Profile).where(models.Profile.id == selected, models.Profile.family_id == family.id, models.Profile.active.is_(True))) if selected else None
        session = active_admin(db, connection.cookies.get(ADMIN_COOKIE))
        return {"id": profile.id if profile else None, "name": profile.name if profile else "家族", "role": "admin" if session else "family",
                "familyId": family.id, "adminExpiresAt": session.expires if session else None}

    def authenticated(request: Request, db=Depends(db_session)):
        # Profile attribution is untrusted family input; it never unlocks private data.
        return actor_for(db, request)

    def administrator(request: Request, db=Depends(db_session)):
        # Serialize privilege validation with protected mutations and credential revocation.
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        actor = actor_for(db, request)
        if actor["role"] != "admin":
            raise HTTPException(403, "管理者パターンで解除してください。")
        return actor

    async def publish(family_id):
        # Invalidations carry no record contents, including private records.
        for ws, client in list(clients.items()):
            if client["familyId"] != family_id:
                continue
            try:
                with Session() as db:
                    actor_for(db, ws)
                await asyncio.wait_for(ws.send_json({"type": "changed"}), timeout=2)
            except Exception:
                clients.pop(ws, None)
                try:
                    await ws.close(code=4401)
                except Exception:
                    pass

    def audit(db, actor, kind, record, action, before=None):
        db.add(models.Audit(family_id=actor["familyId"], actor=actor["id"], resource=kind, resource_id=record.id,
                            action=action, before=before, after=None if action == "delete" else record.data))

    def get_record(db, kind, record_id, actor):
        if kind not in RESOURCES:
            raise HTTPException(404, "対象の機能はありません。")
        model, _ = RESOURCES[kind]
        record = db.scalar(select(model).where(model.id == record_id, visible(model, actor)))
        if not record:
            raise HTTPException(404, "データが見つからないか、アクセスできません。")
        return record

    def owner_for(data, actor):
        if data.get("visibility", "family") != "family":
            raise HTTPException(403, "プロフィール選択は認証ではありません。非公開データは利用できません。")
        return None

    def resolve_member(db, data, actor, previous=None):
        if "member" not in data:
            return data
        member_id = data.get("memberId")
        profile = db.scalar(select(models.Profile).where(models.Profile.family_id == actor["familyId"], models.Profile.active.is_(True),
                    models.Profile.id == member_id if member_id else models.Profile.name == data["member"])) if member_id or data["member"] != "家族" else None
        if profile:
            return {**data, "memberId": profile.id, "member": profile.name}
        if data["member"] == "家族" and not member_id:
            return {**data, "memberId": None}
        if previous and previous.get("member") == data["member"] and previous.get("memberId") == member_id:
            return data  # Keep historical attribution to an archived profile.
        if previous and member_id and member_id == previous.get("memberId"):
            archived = db.scalar(select(models.Profile).where(models.Profile.id == member_id, models.Profile.family_id == actor["familyId"]))
            if archived:
                return {**data, "member": archived.name}
        raise HTTPException(422, "担当する有効なプロフィールを選んでください。")

    def calendar_for(db, actor, owner):
        calendar = db.scalar(select(models.Calendar).where(models.Calendar.family_id == actor["familyId"], models.Calendar.owner_id == owner))
        if not calendar:
            raise HTTPException(404, "カレンダーが見つかりません。")
        return calendar.id

    def replace(db, record, version, data, owner=None):
        if version is None:
            raise HTTPException(428, "更新前のバージョンが必要です。再読み込みしてください。")
        values = {"data": data, "owner_id": owner, "version": version + 1, "updated_at": models.stamp()}
        changed = db.execute(update(type(record)).where(type(record).id == record.id, type(record).version == version).values(**values))
        if changed.rowcount != 1:
            raise HTTPException(409, "ほかの端末で変更されています。入力内容を控え、最新データを読み直してください。")
        db.refresh(record)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "uchimado"}

    @app.get("/api/session")
    def session_info(request: Request, db=Depends(db_session)):
        local = bool(request.client and request.client.host in ("127.0.0.1", "::1") and request.url.hostname in ("localhost", "127.0.0.1", "::1"))
        return {"setupRequired": credential(db) is None, "canSetup": local, "user": actor_for(db, request), "familyName": family_for(db).name}

    app.include_router(admin_routes(db_session, administrator, family_for, publish))

    @app.get("/api/state")
    def state(actor=Depends(authenticated), db=Depends(db_session)):
        result = {kind: [serialize(r, db) for r in db.scalars(select(model).where(visible(model, actor)).order_by(model.updated_at.desc()))] for kind, (model, _) in RESOURCES.items()}
        result["members"] = [{"id": p.id, "name": p.name, "active": p.active, "version": p.version} for p in db.scalars(select(models.Profile).where(models.Profile.family_id == actor["familyId"]).order_by(models.Profile.name))]
        result["calendars"] = [{"id": c.id, "name": c.name, "ownerId": c.owner_id} for c in db.scalars(select(models.Calendar).where(visible(models.Calendar, actor)))]
        result["completions"] = [{"id": c.id, "title": c.title, "due": c.due, "completedBy": c.completed_by, "completedAt": c.completed_at} for c in db.scalars(select(models.TaskCompletion).where(visible(models.TaskCompletion, actor)).order_by(models.TaskCompletion.completed_at.desc()).limit(100))]
        result["user"] = actor
        result["familyName"] = family_for(db).name
        return result

    @app.get("/api/events/occurrences")
    def event_occurrences(begin: date, end: date, actor=Depends(authenticated), db=Depends(db_session)):
        if end < begin or (end - begin).days > 366:
            raise HTTPException(422, "取得期間は366日以内で指定してください。")
        result = []
        for record in db.scalars(select(models.CalendarEvent).where(visible(models.CalendarEvent, actor))):
            series = serialize(record, db)
            exceptions = series.pop("exceptions")
            for day in occurrences(record.data, begin, end):
                if day.isoformat() in exceptions:
                    continue
                duration = date.fromisoformat(record.data["endDate"]) - date.fromisoformat(record.data["date"])
                result.append({**series, "date": day.isoformat(), "endDate": (day + duration).isoformat(), "occurrenceDate": day.isoformat()})
            for day, data in exceptions.items():
                if data and data["date"] <= end.isoformat() and data["endDate"] >= begin.isoformat():
                    result.append({**series, **data, "occurrenceDate": day})
        return result

    @app.post("/api/records/{kind}")
    async def create_record(kind: str, value: schemas.Mutation, actor=Depends(authenticated), db=Depends(db_session)):
        if kind not in RESOURCES:
            raise HTTPException(404)
        model, schema = RESOURCES[kind]
        data = resolve_member(db, validate(schema, value.data), actor)
        owner = owner_for(data, actor)
        author = actor["id"]
        if value.profile_id:
            profile = db.scalar(select(models.Profile).where(models.Profile.id == value.profile_id, models.Profile.family_id == actor["familyId"], models.Profile.active.is_(True)))
            if not profile:
                raise HTTPException(422, "使用できる作成者を選んでください。")
            author = profile.id
        record = model(family_id=actor["familyId"], owner_id=owner, data=data, created_by=author)
        if kind == "events":
            record.calendar_id = calendar_for(db, actor, owner)
        db.add(record)
        db.flush()
        audit(db, actor, kind, record, "create")
        db.commit()
        result = serialize(record, db)
        await publish(actor["familyId"])
        return result

    @app.put("/api/records/{kind}/{record_id}")
    async def update_record(kind: str, record_id: str, value: schemas.Mutation, actor=Depends(authenticated), db=Depends(db_session)):
        record = get_record(db, kind, record_id, actor)
        data = resolve_member(db, validate(RESOURCES[kind][1], value.data), actor, record.data)
        owner = owner_for(data, actor)
        before = record.data
        if kind == "tasks" and data["done"] and not before["done"]:
            db.add(models.TaskCompletion(family_id=actor["familyId"], owner_id=owner, task_id=record.id, title=data["title"], due=data["due"], completed_by=actor["id"]))
            if data["recurrence"]["frequency"] != "none":
                following = next_due(data)
                if following:
                    data = {**data, "due": following, "done": False}
        replace(db, record, value.version, data, owner)
        if kind == "events":
            record.calendar_id = calendar_for(db, actor, owner)
            db.execute(delete(models.EventException).where(models.EventException.event_id == record.id))
        audit(db, actor, kind, record, "update", before)
        db.commit()
        result = serialize(record, db)
        await publish(actor["familyId"])
        return result

    @app.delete("/api/records/{kind}/{record_id}")
    async def delete_record(kind: str, record_id: str, version: int = Query(ge=1), actor=Depends(authenticated), db=Depends(db_session)):
        record = get_record(db, kind, record_id, actor)
        model = type(record)
        result = db.execute(delete(model).where(model.id == record_id, model.version == version))
        if result.rowcount != 1:
            raise HTTPException(409, "ほかの端末で変更されています。最新データを確認してください。")
        audit(db, actor, kind, record, "delete", record.data)
        db.commit()
        await publish(actor["familyId"])
        return {"ok": True}

    @app.put("/api/events/{record_id}/occurrences/{day}")
    async def edit_occurrence(record_id: str, day: date, value: schemas.ExceptionMutation, actor=Depends(authenticated), db=Depends(db_session)):
        record = get_record(db, "events", record_id, actor)
        if record.data["recurrence"]["frequency"] == "none" or not is_occurrence(record.data, day):
            raise HTTPException(422, "この日は繰り返し予定の開始日ではありません。")
        data = None if value.cancelled else resolve_member(db, validate(schemas.EventData, value.data), actor, record.data)
        if data and (data["visibility"] != record.data["visibility"] or data["recurrence"]["frequency"] != "none"):
            raise HTTPException(422, "この回だけの変更では公開範囲と繰り返し設定を変更できません。")
        replace(db, record, value.version, record.data, record.owner_id)
        exception = db.scalar(select(models.EventException).where(models.EventException.event_id == record.id, models.EventException.day == day.isoformat()))
        if not exception:
            exception = models.EventException(event_id=record.id, day=day.isoformat(), data=data)
            db.add(exception)
        else:
            exception.data = data
        db.add(models.Audit(family_id=actor["familyId"], actor=actor["id"], resource="event_occurrence", resource_id=record.id,
                            action="cancel" if value.cancelled else "update", before={"day": day.isoformat()}, after=data))
        db.commit()
        await publish(actor["familyId"])
        return serialize(record, db)

    def preference_profile(actor, device):
        return f"family:{device}"

    @app.get("/api/preferences/{device}")
    def get_preferences(device: str, actor=Depends(authenticated), db=Depends(db_session)):
        if device not in ("wall", "mobile"):
            raise HTTPException(422)
        profile = preference_profile(actor, device)
        return {key: serialize(record) if (record := db.scalar(select(model).where(model.family_id == actor["familyId"], model.profile == profile, model.owner_id.is_(None)))) else None
                for key, model in (("layout", models.WidgetLayout), ("settings", models.UserSettings))}

    @app.put("/api/preferences/{device}/{kind}")
    async def save_preferences(device: str, kind: str, value: schemas.Mutation, actor=Depends(authenticated), db=Depends(db_session)):
        if device not in ("wall", "mobile") or kind not in ("layout", "settings"):
            raise HTTPException(422)
        model, schema = (models.WidgetLayout, schemas.Layout) if kind == "layout" else (models.UserSettings, schemas.SettingsData)
        data = validate(schema, value.data)
        profile = preference_profile(actor, device)
        record = db.scalar(select(model).where(model.family_id == actor["familyId"], model.profile == profile))
        before = record.data if record else None
        if record:
            replace(db, record, value.version, data, None)
        else:
            if value.version is not None:
                raise HTTPException(409, "設定を読み直してください。")
            record = model(family_id=actor["familyId"], owner_id=None, data=data, profile=profile, created_by=actor["id"])
            db.add(record)
            db.flush()
        audit(db, actor, kind, record, "update", before)
        db.commit()
        await publish(actor["familyId"])
        return serialize(record)

    @app.get("/api/history/{kind}/{record_id}")
    def history(kind: str, record_id: str, actor=Depends(authenticated), db=Depends(db_session)):
        get_record(db, kind, record_id, actor)
        return [{"action": a.action, "at": a.at, "actor": a.actor} for a in db.scalars(select(models.Audit).where(models.Audit.family_id == actor["familyId"], models.Audit.resource == kind, models.Audit.resource_id == record_id).order_by(models.Audit.at.desc()).limit(100))]

    @app.get("/api/admin/backup")
    def backup(actor=Depends(administrator)):
        # Online SQLite backup provides a consistent copy including committed WAL data.
        directory = path.parent / "backups"
        directory.mkdir(exist_ok=True)
        target = directory / f"uchimado-{time.time_ns()}.sqlite3"
        with sqlite3.connect(path) as source, sqlite3.connect(target) as dest:
            source.backup(dest)
        return FileResponse(target, media_type="application/octet-stream", filename=target.name, headers={"Cache-Control": "no-store"})

    @app.websocket("/api/ws")
    async def websocket(ws: WebSocket):
        expected = f"{'https' if ws.url.scheme == 'wss' else 'http'}://{ws.headers.get('host')}"
        if ws.headers.get("origin") != expected:
            await ws.close(code=4403)
            return
        try:
            with Session() as db:
                actor = actor_for(db, ws)
        except HTTPException:
            await ws.close(code=4401)
            return
        await ws.accept()
        clients[ws] = actor
        try:
            await ws.send_json({"type": "ready"})
            while True:
                try:
                    await asyncio.wait_for(ws.receive_text(), timeout=20)
                except asyncio.TimeoutError:
                    pass
                with Session() as db:
                    actor_for(db, ws)
                await ws.send_json({"type": "heartbeat"})
        except WebSocketDisconnect:
            pass  # The peer has already closed its transport; do not close it twice.
        except (HTTPException, RuntimeError, OSError):
            try:
                await ws.close(code=4401)
            except (WebSocketDisconnect, RuntimeError, OSError):
                pass
        finally:
            clients.pop(ws, None)

    @app.api_route("/api/{unmatched:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def missing_api(unmatched: str):
        raise HTTPException(404, "このAPIは利用できません。")

    dist = models.ROOT / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app


app = create_app()
