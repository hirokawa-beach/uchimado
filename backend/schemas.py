from datetime import date, time, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProfileData(Input):
    name: str = Field(min_length=1, max_length=40)
    active: bool = True

    @field_validator("name")
    @classmethod
    def profile_name(cls, value):
        if value == "家族" or any(ord(c) < 32 for c in value):
            raise ValueError("家族と区別できるプロフィール名を入力してください")
        return value


class PatternInput(Input):
    pattern: list[int] = Field(min_length=2, max_length=9)

    @field_validator("pattern", mode="before")
    @classmethod
    def canonical(cls, value):
        from .security import normalize_pattern
        return normalize_pattern(value)


class SetPattern(PatternInput):
    confirmation: list[int]

    @field_validator("confirmation", mode="before")
    @classmethod
    def confirm_canonical(cls, value):
        from .security import normalize_pattern
        return normalize_pattern(value)

    @model_validator(mode="after")
    def equal(self):
        if self.pattern != self.confirmation:
            raise ValueError("確認用パターンが一致しません")
        return self


class AdminSetup(SetPattern):
    family_name: str = Field(default="わが家", min_length=1, max_length=80)


class RecoverAdmin(SetPattern):
    recovery_code: str = Field(min_length=20, max_length=100)


class ChangePattern(SetPattern):
    current_pattern: list[int]


class FamilySettings(Input):
    name: str = Field(min_length=1, max_length=80)


class Repeat(Input):
    frequency: Literal["none", "daily", "weekly", "monthly", "yearly"] = "none"
    interval: int = Field(default=1, ge=1, le=99)
    until: date | None = None


class EventData(Input):
    title: str = Field(min_length=1, max_length=80)
    date: date
    endDate: date
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    allDay: bool = False
    member: str = Field(default="家族", min_length=1, max_length=40)
    memberId: str | None = Field(default=None, max_length=80)
    location: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=2000)
    color: str = Field(default="#53786c", pattern=r"^#[a-fA-F0-9]{6}$")
    visibility: Literal["family"] = "family"
    timezone: Literal["Asia/Tokyo"] = "Asia/Tokyo"
    recurrence: Repeat = Field(default_factory=Repeat)

    @field_validator("timezone")
    @classmethod
    def timezone_exists(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("有効なタイムゾーンを指定してください")
        return value

    @model_validator(mode="after")
    def dates_valid(self):
        if self.endDate < self.date:
            raise ValueError("終了日は開始日以降にしてください")
        if (self.endDate - self.date).days > 366:
            raise ValueError("1件の予定は366日以内にしてください")
        if not self.allDay and datetime.combine(self.date, time.fromisoformat(self.start)) >= datetime.combine(self.endDate, time.fromisoformat(self.end)):
            raise ValueError("終了日時は開始日時より後にしてください")
        if self.recurrence.until and self.recurrence.until < self.date:
            raise ValueError("繰り返しの終了日は開始日以降にしてください")
        return self


class TaskData(Input):
    title: str = Field(min_length=1, max_length=160)
    member: str = Field(default="家族", min_length=1, max_length=40)
    memberId: str | None = Field(default=None, max_length=80)
    done: bool = False
    due: date | None = None
    priority: Literal["low", "normal", "high"] = "normal"
    visibility: Literal["family"] = "family"
    recurrence: Repeat = Field(default_factory=Repeat)

    @model_validator(mode="after")
    def repeat_due(self):
        if self.recurrence.frequency != "none" and not self.due:
            raise ValueError("繰り返しタスクには期限が必要です")
        if self.due and self.recurrence.until and self.recurrence.until < self.due:
            raise ValueError("繰り返し終了日は期限以降にしてください")
        return self


class MemoData(Input):
    title: str = Field(default="", max_length=100)
    text: str = Field(min_length=1, max_length=2000)
    pinned: bool = False
    visibility: Literal["family"] = "family"


class Mutation(Input):
    version: int | None = Field(default=None, ge=1)
    data: dict


class ExceptionMutation(Mutation):
    cancelled: bool = False


class Widget(Input):
    id: Literal["clock", "schedule", "weather", "forecast", "tasks", "memo", "transit"]
    size: Literal["standard", "wide", "tall"]
    x: int | None = Field(default=None, ge=1, le=12)
    y: int | None = Field(default=None, ge=1, le=2)


class Layout(Input):
    widgets: list[Widget] = Field(max_length=7)

    @model_validator(mode="after")
    def no_overlap(self):
        columns = {"clock": 4, "schedule": 4, "weather": 4, "forecast": 8, "tasks": 4, "memo": 5, "transit": 3}
        occupied = set()
        ids = set()
        for w in self.widgets:
            if w.id in ids:
                raise ValueError("同じウィジェットは1個までです")
            ids.add(w.id)
            width = (12 if w.id == "forecast" else 6) if w.size == "wide" else columns[w.id]
            height = 2 if w.size == "tall" else 1
            if w.x is None or w.y is None or w.x + width > 13 or w.y + height > 3:
                raise ValueError("ウィジェットを画面内に配置してください")
            cells = {(x, y) for x in range(w.x, w.x + width) for y in range(w.y, w.y + height)}
            if cells & occupied:
                raise ValueError("ウィジェットを重ならないように配置してください")
            occupied |= cells
        return self


class SettingsData(Input):
    theme: Literal["light", "dark"] = "light"
    background: Literal["lake", "forest", "coast", "custom"] = "lake"
    customBackground: str = Field(default="", max_length=4_000_000)
    blur: int = Field(default=6, ge=0, le=20)
    widgetOpacity: int = Field(default=94, ge=40, le=100)
    reduceMotion: bool = False
    performance: bool = False

    @field_validator("customBackground")
    @classmethod
    def image_only(cls, v):
        import re
        if v and not re.fullmatch(r"data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+", v):
            raise ValueError("JPEG・PNG・WebP画像を使用してください")
        return v
