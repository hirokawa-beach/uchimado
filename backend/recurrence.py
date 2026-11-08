"""Date recurrence is wall-clock based in each event's IANA timezone."""
from datetime import date, datetime, timedelta
from dateutil.rrule import rrule, DAILY, WEEKLY, MONTHLY, YEARLY

FREQUENCIES = {"daily": DAILY, "weekly": WEEKLY, "monthly": MONTHLY, "yearly": YEARLY}


def rule(start: date, repeat: dict):
    until = date.fromisoformat(repeat["until"]) if repeat.get("until") else date.max
    return rrule(FREQUENCIES[repeat["frequency"]], dtstart=datetime.combine(start, datetime.min.time()),
                 interval=repeat.get("interval", 1), until=datetime.combine(until, datetime.max.time()))


def is_occurrence(data, day):
    start = date.fromisoformat(data["date"])
    if data["recurrence"]["frequency"] == "none":
        return day == start
    value = datetime.combine(day, datetime.min.time())
    return rule(start, data["recurrence"]).before(value, inc=True) == value


def next_due(data):
    start = date.fromisoformat(data["due"])
    value = rule(start, data["recurrence"]).after(datetime.combine(start, datetime.min.time()))
    return value.date().isoformat() if value else None


def occurrences(data, begin, end):
    start, finish = date.fromisoformat(data["date"]), date.fromisoformat(data["endDate"])
    duration = finish - start
    if data["recurrence"]["frequency"] == "none":
        return [start] if start <= end and finish >= begin else []
    values = rule(start, data["recurrence"]).between(
        datetime.combine(begin - duration, datetime.min.time()), datetime.combine(end, datetime.max.time()), inc=True)
    return [value.date() for value in values]
