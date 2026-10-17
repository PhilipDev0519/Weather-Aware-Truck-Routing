import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatTimeOfDay, formatRelative, parseTime, toLocalInput } from "../format";
import { Icon } from "./Icon";

interface Props {
  id: string;
  value: string; // "YYYY-MM-DDTHH:mm", local time
  onChange: (value: string) => void;
  min: Date;
  max: Date;
}

const SLOT_MINUTES = 15;

const triggerFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayLabelFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const endFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const shortMonthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayFormat.format(new Date(2026, 0, 4 + i))); // Jan 4 2026 is a Sunday

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const atMinutes = (day: Date, minutes: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
const clamp = (d: Date, min: Date, max: Date) =>
  new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));
const ceilToSlot = (d: Date) => {
  const out = new Date(d);
  out.setMinutes(Math.ceil(d.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES, 0, 0);
  return out;
};

// One-click departures; each lands inside [min, max].
function presets(now: Date) {
  const tomorrow = addDays(now, 1);
  return [
    { label: "Now", date: now },
    { label: "In 1 h", date: ceilToSlot(new Date(now.getTime() + 3_600_000)) },
    { label: "In 3 h", date: ceilToSlot(new Date(now.getTime() + 3 * 3_600_000)) },
    { label: "Tomorrow 6 AM", date: atMinutes(tomorrow, 6 * 60) },
  ];
}

// A button that looks like the other inputs and opens a calendar + time list.
// The calendar pages through any future month, but only days the forecast covers
// (min..max) can be picked; anything else is clamped into that window.
export function DepartureInput({ id, value, onChange, min, max }: Props) {
  const popId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const slotList = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => new Date(value), [value]);
  const valid = !Number.isNaN(selected.getTime());
  const [cursor, setCursor] = useState(() => startOfDay(valid ? selected : min)); // day with keyboard focus
  const [view, setView] = useState(() => startOfMonth(valid ? selected : min)); // month on show
  const [draft, setDraft] = useState<string | null>(null); // typed time, while editing

  const firstDay = startOfDay(min);
  const lastDay = startOfDay(max);
  const firstMonth = startOfMonth(min);
  // Always six weeks, so the popover keeps its height from month to month.
  const days = useMemo(() => {
    const start = addDays(view, -view.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDay = startOfDay(valid ? selected : min);
  const slots = useMemo(() => {
    const out: Date[] = [];
    for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
      const slot = atMinutes(selectedDay, m);
      if (slot >= ceilToSlot(min) && slot <= max) out.push(slot);
    }
    return out;
  }, [selectedDay.getTime(), min.getTime(), max.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (date: Date, close = false) => {
    const next = clamp(date, min, max);
    onChange(toLocalInput(next));
    setCursor(startOfDay(next));
    setView(startOfMonth(next));
    if (close) closePicker(true);
  };

  const closePicker = (refocus: boolean) => {
    setOpen(false);
    setDraft(null);
    if (refocus) trigger.current?.focus();
  };

  const openPicker = () => {
    setCursor(selectedDay);
    setView(startOfMonth(selectedDay));
    setOpen(true);
  };

  const showMonth = (month: Date) => {
    setView(month);
    // keep the keyboard cursor on a pickable day of the month on show, if it has one
    const first = month < firstDay ? firstDay : month;
    if (first <= lastDay && first < addMonths(month, 1) && startOfMonth(cursor).getTime() !== month.getTime())
      setCursor(first);
  };

  // Close when the pointer or focus goes elsewhere on the page.
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) closePicker(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  // On open: focus the selected day and scroll its time into view.
  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    const list = slotList.current;
    const on = list?.querySelector<HTMLElement>(".on") ?? list?.firstElementChild;
    if (list && on instanceof HTMLElement) list.scrollTop = on.offsetTop - list.clientHeight / 2 + on.clientHeight / 2;
  }, [open]);

  // Arrow keys move focus with the cursor; clicks and typing leave focus alone.
  const keyNav = useRef(false);
  useEffect(() => {
    if (!keyNav.current) return;
    keyNav.current = false;
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [cursor]);

  const pickDay = (day: Date) => {
    const minutes = valid ? selected.getHours() * 60 + selected.getMinutes() : 9 * 60;
    commit(atMinutes(day, minutes));
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(cursor, step);
    if (next < firstDay || next > lastDay) return;
    keyNav.current = true;
    setCursor(next);
    setView(startOfMonth(next));
  };

  const commitDraft = (close: boolean) => {
    if (draft === null) return true;
    const minutes = parseTime(draft);
    if (minutes === null) return false;
    commit(atMinutes(selectedDay, minutes), close);
    setDraft(null);
    return true;
  };

  const now = new Date();
  const timeText = valid ? formatTimeOfDay(selected) : "";
  const draftBad = draft !== null && draft.trim() !== "" && parseTime(draft) === null;

  return (
    <div
      className="dt"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          closePicker(true);
        }
      }}
    >
      <div className="input-wrap">
        <Icon name="calendar" size={17} className="input-icon" />
        <button
          ref={trigger}
          id={id}
          type="button"
          className={open ? "dt-trigger open" : "dt-trigger"}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popId}
          onClick={() => (open ? closePicker(false) : openPicker())}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              openPicker();
            }
          }}
        >
          <span className="dt-value">{valid ? triggerFormat.format(selected) : "Pick a date and time"}</span>
          {valid && (
            <span className={selected < new Date(now.getTime() - 60_000) ? "dt-rel past" : "dt-rel"}>
              {formatRelative(selected, now)}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="dt-pop" id={popId} role="dialog" aria-label="Choose departure date and time">
          <div className="dt-presets">
            {presets(now).map((p) => (
              <button
                key={p.label}
                type="button"
                className={
                  valid && Math.abs(p.date.getTime() - selected.getTime()) < 60_000 ? "chip-btn on" : "chip-btn"
                }
                onClick={() => commit(p.date, true)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="dt-body">
            <div className="dt-cal">
              <div className="dt-cal-head">
                <button
                  type="button"
                  className="dt-nav"
                  aria-label="Previous month"
                  disabled={view <= firstMonth}
                  onClick={() => showMonth(addMonths(view, -1))}
                >
                  <Icon name="chevronLeft" size={16} />
                </button>
                <strong aria-live="polite">{monthFormat.format(view)}</strong>
                <button
                  type="button"
                  className="dt-nav"
                  aria-label="Next month"
                  onClick={() => showMonth(addMonths(view, 1))}
                >
                  <Icon name="chevronRight" size={16} />
                </button>
              </div>
              <div className="dt-grid" role="grid" ref={grid} onKeyDown={onGridKey}>
                <div role="row" className="dt-week">
                  {WEEKDAYS.map((w, i) => (
                    <span key={i} role="columnheader" className="dt-wd">
                      {w}
                    </span>
                  ))}
                </div>
                {Array.from({ length: days.length / 7 }, (_, row) => (
                  <div role="row" className="dt-week" key={row}>
                    {days.slice(row * 7, row * 7 + 7).map((day) => {
                      const inRange = day >= firstDay && day <= lastDay;
                      const outside = day.getMonth() !== view.getMonth();
                      const isSel = valid && sameDay(day, selected);
                      const cls = ["dt-day", isSel && "on", sameDay(day, now) && "today", outside && "outside"]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <span role="gridcell" key={day.getTime()} aria-selected={isSel}>
                          <button
                            type="button"
                            className={cls}
                            disabled={!inRange}
                            title={day > lastDay ? "No forecast for this day yet" : undefined}
                            tabIndex={inRange && sameDay(day, cursor) ? 0 : -1}
                            aria-label={dayLabelFormat.format(day)}
                            onClick={() => pickDay(day)}
                          >
                            {outside && day.getDate() === 1 && <small>{shortMonthFormat.format(day)}</small>}
                            {day.getDate()}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="dt-time">
              <label className="dt-time-label" htmlFor={`${popId}-time`}>
                Time
              </label>
              <input
                id={`${popId}-time`}
                className={draftBad ? "dt-time-input bad" : "dt-time-input"}
                value={draft ?? timeText}
                placeholder="e.g. 7:30 pm"
                autoComplete="off"
                aria-invalid={draftBad}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitDraft(false) || setDraft(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft(true);
                  }
                }}
              />
              <div className="dt-slots" ref={slotList} aria-label="Times">
                {slots.map((slot) => {
                  const on = valid && slot.getTime() === new Date(selected).setSeconds(0, 0);
                  return (
                    <button
                      key={slot.getTime()}
                      type="button"
                      className={on ? "dt-slot on" : "dt-slot"}
                      aria-pressed={on}
                      onClick={() => commit(slot, true)}
                    >
                      {formatTimeOfDay(slot)}
                    </button>
                  );
                })}
                {!slots.length && <p className="dt-empty">No times left this day.</p>}
              </div>
            </div>
          </div>

          <div className="dt-foot">
            <span>
              Forecast available through <strong>{endFormat.format(max)}</strong>; later days open as it extends.
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => closePicker(true)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
