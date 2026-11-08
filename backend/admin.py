import os
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select

from . import db as models, schemas
from .security import (ADMIN_COOKIE, ADMIN_TTL, active_admin, clear_attempts, credential, digest,
                       hash_pattern, record_failure, recovery_code, recovery_digest, revoke_admin,
                       throttle, verify_pattern)


def admin_routes(db_session, administrator, family_for, publish):
    router = APIRouter(prefix="/api/admin", tags=["administrator"])

    def issue(db, response, request, admin):
        token = secrets.token_urlsafe(32)
        expires = time.time() + ADMIN_TTL
        db.execute(delete(models.AdminSession).where(models.AdminSession.expires <= time.time()))
        if old := request.cookies.get(ADMIN_COOKIE):
            db.execute(delete(models.AdminSession).where(models.AdminSession.id == digest(old)))
        db.add(models.AdminSession(id=digest(token), credential_version=admin.version, expires=expires))
        response.set_cookie(ADMIN_COOKIE, token, max_age=ADMIN_TTL, httponly=True, samesite="strict",
                            secure=os.environ.get("UCHIMADO_SECURE_COOKIE") == "1", path="/")
        return expires

    def log_action(db, family_id, action):
        # Never record entered patterns, recovery codes or their hashes in audit payloads.
        db.add(models.Audit(family_id=family_id, actor="administrator", resource="admin", resource_id="administrator", action=action))

    @router.post("/setup")
    def setup(value: schemas.AdminSetup, request: Request, response: Response, db=Depends(db_session)):
        if not request.client or request.client.host not in ("127.0.0.1", "::1") or request.url.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise HTTPException(403, "管理者の初期設定はサーバーPCのlocalhostから実行してください。")
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        if credential(db):
            raise HTTPException(409, "管理者の設定は完了しています。")
        family = family_for(db)
        family.name = value.family_name
        code = recovery_code()
        admin = models.AdminCredential(family_id=family.id, pattern_hash=hash_pattern(value.pattern), recovery_hash=recovery_digest(code))
        db.add(admin)
        db.flush()
        expires = issue(db, response, request, admin)
        log_action(db, family.id, "setup")
        db.commit()
        return {"recoveryCode": code, "expiresAt": expires}

    @router.post("/unlock")
    def unlock(value: schemas.PatternInput, request: Request, response: Response, db=Depends(db_session)):
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        attempts = throttle(db, "pattern", request.client.host if request.client else "unknown")
        admin = credential(db)
        if not admin or not verify_pattern(value.pattern, admin.pattern_hash):
            record_failure(db, attempts)
            raise HTTPException(401, "管理者パターンを確認してください。")
        clear_attempts(db, attempts)
        expires = issue(db, response, request, admin)
        log_action(db, admin.family_id, "unlock")
        db.commit()
        return {"expiresAt": expires}

    @router.post("/lock")
    def lock(request: Request, response: Response, db=Depends(db_session)):
        # Lock is intentionally possible even after expiry, and never grants access.
        db.execute(delete(models.AdminSession).where(models.AdminSession.id == digest(request.cookies.get(ADMIN_COOKIE) or "")))
        db.commit()
        response.delete_cookie(ADMIN_COOKIE, path="/")
        return {"ok": True}

    @router.post("/recover")
    def recover(value: schemas.RecoverAdmin, request: Request, response: Response, db=Depends(db_session)):
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        attempts = throttle(db, "recovery", request.client.host if request.client else "unknown")
        admin = credential(db)
        if not admin or not secrets.compare_digest(recovery_digest(value.recovery_code), admin.recovery_hash):
            record_failure(db, attempts)
            raise HTTPException(401, "回復コードを確認してください。")
        code = recovery_code()
        admin.pattern_hash = hash_pattern(value.pattern)
        admin.recovery_hash = recovery_digest(code)
        admin.version += 1
        revoke_admin(db)
        clear_attempts(db, attempts)
        # Recovery also clears the pattern lockout so the new pattern can be used.
        db.execute(delete(models.LoginAttempt).where(models.LoginAttempt.id.in_([digest("pattern:global"), digest(f"pattern:{request.client.host if request.client else 'unknown'}")])))
        log_action(db, admin.family_id, "recover")
        db.commit()
        response.delete_cookie(ADMIN_COOKIE, path="/")
        return {"recoveryCode": code, "requiresUnlock": True}

    @router.post("/pattern")
    def change_pattern(value: schemas.ChangePattern, request: Request, response: Response, actor=Depends(administrator), db=Depends(db_session)):
        if not active_admin(db, request.cookies.get(ADMIN_COOKIE)):
            raise HTTPException(403, "管理者認証が期限切れです。")
        attempts = throttle(db, "pattern", request.client.host if request.client else "unknown")
        admin = credential(db)
        if not verify_pattern(value.current_pattern, admin.pattern_hash):
            record_failure(db, attempts)
            raise HTTPException(401, "現在の管理者パターンを確認してください。")
        code = recovery_code()
        admin.pattern_hash, admin.recovery_hash = hash_pattern(value.pattern), recovery_digest(code)
        admin.version += 1
        revoke_admin(db)
        clear_attempts(db, attempts)
        log_action(db, actor["familyId"], "change_pattern")
        db.commit()
        response.delete_cookie(ADMIN_COOKIE, path="/")
        return {"recoveryCode": code, "requiresUnlock": True}

    @router.post("/profiles")
    async def create_profile(value: schemas.ProfileData, actor=Depends(administrator), db=Depends(db_session)):
        if db.scalar(select(models.Profile).where(models.Profile.family_id == actor["familyId"], models.Profile.name == value.name)):
            raise HTTPException(409, "同じ名前のプロフィールがあります。")
        profile = models.Profile(family_id=actor["familyId"], name=value.name, active=value.active)
        db.add(profile)
        db.flush()
        log_action(db, actor["familyId"], "create_profile")
        db.commit()
        await publish(actor["familyId"])
        return {"id": profile.id, "name": profile.name, "active": profile.active, "version": profile.version}

    @router.put("/profiles/{profile_id}")
    async def update_profile(profile_id: str, value: schemas.Mutation, actor=Depends(administrator), db=Depends(db_session)):
        from .main import validate
        from sqlalchemy import update
        data = validate(schemas.ProfileData, value.data)
        profile = db.scalar(select(models.Profile).where(models.Profile.id == profile_id, models.Profile.family_id == actor["familyId"]))
        if not profile:
            raise HTTPException(404)
        if db.scalar(select(models.Profile.id).where(models.Profile.family_id == actor["familyId"], models.Profile.name == data["name"], models.Profile.id != profile_id)):
            raise HTTPException(409, "同じ名前のプロフィールがあります。")
        changed = db.execute(update(models.Profile).where(models.Profile.id == profile_id, models.Profile.version == value.version).values(**data, version=models.Profile.version + 1))
        if changed.rowcount != 1:
            raise HTTPException(409, "プロフィールが更新されています。再取得してください。")
        log_action(db, actor["familyId"], "update_profile")
        db.commit()
        await publish(actor["familyId"])
        return {"ok": True}

    @router.put("/family")
    async def update_family(value: schemas.FamilySettings, actor=Depends(administrator), db=Depends(db_session)):
        family_for(db).name = value.name
        log_action(db, actor["familyId"], "update_family")
        db.commit()
        await publish(actor["familyId"])
        return {"ok": True}

    return router
