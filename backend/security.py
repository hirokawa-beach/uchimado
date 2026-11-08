"""Pattern authentication, global throttling and recovery; independent of family profiles."""
import hashlib
import hmac
import math
import secrets
import time

from fastapi import HTTPException
from sqlalchemy import delete
from .db import AdminCredential, AdminSession, LoginAttempt

ADMIN_COOKIE = "uchimado_admin"
ADMIN_TTL = 15 * 60


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def normalize_pattern(nodes):
    if not isinstance(nodes, list) or len(nodes) > 9 or any(type(n) is not int or not 0 <= n <= 8 for n in nodes):
        raise ValueError("3×3の点を4個以上、一度ずつ結んでください。")
    result = []
    for node in nodes:
        if node in result:
            raise ValueError("同じ点は一度だけ選べます。")
        if result:
            previous = result[-1]
            dx, dy = node % 3 - previous % 3, node // 3 - previous // 3
            if math.gcd(abs(dx), abs(dy)) == 2:
                middle = (previous + node) // 2
                if middle not in result:
                    result.append(middle)
        result.append(node)
    if len(result) < 4:
        raise ValueError("4個以上の点を結んでください。")
    return result


def pattern_secret(nodes):
    return "uchimado-pattern-v1:" + ",".join(map(str, normalize_pattern(nodes)))


def hash_pattern(nodes, salt=None):
    salt = salt or secrets.token_hex(16)
    # OWASP scrypt baseline: N=2^17, r=8, p=1. Allow the required 128 MiB allocation.
    value = hashlib.scrypt(pattern_secret(nodes).encode(), salt=bytes.fromhex(salt), n=131072, r=8, p=1, maxmem=256 * 1024 * 1024).hex()
    return f"scrypt-v1${salt}${value}"


def verify_pattern(nodes, stored):
    try:
        kind, salt, _ = stored.split("$")
        return kind == "scrypt-v1" and hmac.compare_digest(hash_pattern(nodes, salt), stored)
    except (ValueError, TypeError):
        return False


def recovery_code():
    # 192 random bits; never derive this from the lower-entropy pattern.
    return secrets.token_hex(24)


def recovery_digest(code):
    return digest("uchimado-recovery-v1:" + code.strip().lower().replace("-", "").replace(" ", ""))


def credential(db):
    return db.get(AdminCredential, "administrator")


def active_admin(db, token):
    record = db.get(AdminSession, digest(token or ""))
    admin = credential(db)
    if not record or not admin or record.expires <= time.time() or record.credential_version != admin.version:
        return None
    return record


def throttle(db, scope, source):
    now = time.time()
    keys = [digest(f"{scope}:global"), digest(f"{scope}:{source}")]
    records = []
    for key in keys:
        record = db.get(LoginAttempt, key)
        if record and record.until <= now:
            db.delete(record)
            db.flush()
            record = None
        if record and record.failures >= (3 if scope == "recovery" else 5):
            remaining = max(1, math.ceil(record.until - now))
            raise HTTPException(429, "試行回数の上限です。しばらく待って再試行してください。", headers={"Retry-After": str(remaining)})
        records.append((key, record))
    return records


def record_failure(db, attempts):
    for key, record in attempts:
        if not record:
            record = LoginAttempt(id=key, failures=0, until=time.time() + 900)
            db.add(record)
        record.failures += 1
    db.commit()


def clear_attempts(db, attempts):
    for _, record in attempts:
        if record:
            db.delete(record)


def revoke_admin(db):
    db.execute(delete(AdminSession))
