"""Initial Core Foundation schema. Future changes use new migrations."""
from alembic import op
import sqlalchemy as sa

revision = "0001_core"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("families", sa.Column("id", sa.String(), primary_key=True), sa.Column("name", sa.String(), nullable=False))
    op.create_table("users", sa.Column("id", sa.String(), primary_key=True), sa.Column("username", sa.String(80), nullable=False, unique=True), sa.Column("name", sa.String(), nullable=False), sa.Column("password_hash", sa.String(), nullable=False))
    op.create_table("memberships", sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False), sa.Column("user_id", sa.String(), sa.ForeignKey("users.id"), nullable=False), sa.Column("role", sa.String(), nullable=False), sa.UniqueConstraint("family_id", "user_id"))
    op.create_table("sessions", sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False), sa.Column("user_id", sa.String(), sa.ForeignKey("users.id")), sa.Column("expires", sa.Float(), nullable=False))
    op.create_table("login_attempts", sa.Column("id", sa.String(), primary_key=True), sa.Column("failures", sa.Integer(), nullable=False), sa.Column("until", sa.Float(), nullable=False))
    op.create_table("calendars", sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False), sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id")), sa.Column("name", sa.String(), nullable=False), sa.Column("external_provider", sa.String()), sa.Column("external_id", sa.String()))
    for table in ("events", "tasks", "memos", "widget_layouts", "user_settings"):
        columns = [sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False), sa.Column("owner_id", sa.String(), sa.ForeignKey("users.id")), sa.Column("data", sa.JSON(), nullable=False), sa.Column("version", sa.Integer(), nullable=False), sa.Column("created_by", sa.String()), sa.Column("updated_at", sa.String(), nullable=False)]
        if table == "events":
            columns.append(sa.Column("calendar_id", sa.String(), sa.ForeignKey("calendars.id"), nullable=False))
        if table in ("widget_layouts", "user_settings"):
            columns.extend([sa.Column("profile", sa.String(), nullable=False), sa.UniqueConstraint("family_id", "profile")])
        op.create_table(table, *columns)
        op.create_index(f"ix_{table}_family_id", table, ["family_id"])
    op.create_table("event_exceptions", sa.Column("id", sa.String(), primary_key=True), sa.Column("event_id", sa.String(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False), sa.Column("day", sa.String(), nullable=False), sa.Column("data", sa.JSON()), sa.UniqueConstraint("event_id", "day"))
    op.create_table("task_completions", sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), sa.ForeignKey("families.id"), nullable=False), sa.Column("owner_id", sa.String()), sa.Column("task_id", sa.String(), nullable=False), sa.Column("title", sa.String(), nullable=False), sa.Column("due", sa.String()), sa.Column("completed_by", sa.String()), sa.Column("completed_at", sa.String(), nullable=False))
    op.create_table("audit", sa.Column("id", sa.String(), primary_key=True), sa.Column("family_id", sa.String(), nullable=False), sa.Column("actor", sa.String()), sa.Column("resource", sa.String(), nullable=False), sa.Column("resource_id", sa.String(), nullable=False), sa.Column("action", sa.String(), nullable=False), sa.Column("at", sa.String(), nullable=False), sa.Column("before", sa.JSON()), sa.Column("after", sa.JSON()))


def downgrade():
    raise RuntimeError("Data-preserving rollback requires restoring an offline backup. See README.")
