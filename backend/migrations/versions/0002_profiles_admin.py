"""Separate family profiles from the sole pattern-protected administrator."""
from alembic import op
import sqlalchemy as sa

revision = "0002_profiles_admin"
down_revision = "0001_core"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("profiles", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False),
                    sa.Column("name", sa.String(), nullable=False), sa.Column("active", sa.Boolean(), nullable=False),
                    sa.Column("version", sa.Integer(), nullable=False))
    op.create_index("ix_profiles_family_id", "profiles", ["family_id"])
    op.create_table("admin_credential", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False, unique=True),
                    sa.Column("pattern_hash", sa.String(), nullable=False), sa.Column("recovery_hash", sa.String(), nullable=False),
                    sa.Column("version", sa.Integer(), nullable=False), sa.CheckConstraint("id = 'administrator'", name="single_administrator"))
    op.create_table("admin_sessions", sa.Column("id", sa.String(), primary_key=True),
                    sa.Column("credential_version", sa.Integer(), nullable=False), sa.Column("expires", sa.Float(), nullable=False))
    connection = op.get_bind()
    connection.execute(sa.text("INSERT INTO families (id,name) SELECT 'home','わが家' WHERE NOT EXISTS (SELECT 1 FROM families)"))
    connection.execute(sa.text("INSERT INTO calendars (id,family_id,owner_id,name) SELECT 'family-'||f.id,f.id,NULL,'家族' FROM families f WHERE NOT EXISTS (SELECT 1 FROM calendars c WHERE c.family_id=f.id AND c.owner_id IS NULL)"))
    # Keep original IDs so existing creators and assignees still identify the same person.
    connection.execute(sa.text("INSERT INTO profiles (id,family_id,name,active,version) SELECT u.id,MIN(m.family_id),u.name,1,1 FROM users u JOIN memberships m ON m.user_id=u.id GROUP BY u.id,u.name"))
    import json
    profiles = {(row.family_id, row.name): row.id for row in connection.execute(sa.text("SELECT id,family_id,name FROM profiles"))}
    for table in ("events", "tasks"):
        for row in connection.execute(sa.text(f"SELECT id,family_id,data FROM {table} WHERE owner_id IS NULL")).fetchall():
            data = json.loads(row.data)
            profile_id = profiles.get((row.family_id, data.get("member")))
            if profile_id:
                data["memberId"] = profile_id
                connection.execute(sa.text(f"UPDATE {table} SET data=:data WHERE id=:id"), {"data": json.dumps(data, ensure_ascii=False), "id": row.id})
    # Retain legacy rows only as FK targets for sealed private records; disable all old credentials.
    connection.execute(sa.text("UPDATE users SET password_hash='disabled-profile-migration'"))
    connection.execute(sa.text("UPDATE memberships SET role='profile'"))
    connection.execute(sa.text("DELETE FROM sessions"))
    connection.execute(sa.text("DELETE FROM login_attempts"))
    # Only explicitly shared appearance may become the family-wide preference.
    for table in ("widget_layouts", "user_settings"):
        connection.execute(sa.text(f"UPDATE {table} SET profile=REPLACE(profile,'shared:','family:') WHERE owner_id IS NULL AND profile LIKE 'shared:%'"))


def downgrade():
    raise RuntimeError("Restore a protected pre-migration backup instead of re-enabling legacy credentials.")
