import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import type { Place } from "../types";

interface Props {
  label: string;
  value: Place;
  onChange: (place: Place) => void;
  placeholder?: string;
  icon: IconName;
}

// Typing clears the coordinates; picking a suggestion fills them in.
export function PlaceInput({ label, value, onChange, placeholder, icon }: Props) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<Required<Place>[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number>();

  const query = value.lat === undefined ? value.label.trim() : "";

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .geocode(query, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setActive(-1);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pick = (place: Required<Place>) => {
    onChange(place);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <Icon name={icon} size={17} className="input-icon" />
        <input
          id={id}
          value={value.label}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          onChange={(e) => {
            onChange({ label: e.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => (blurTimer.current = window.setTimeout(() => setOpen(false), 150))}
          onKeyDown={onKeyDown}
        />
        {value.lat !== undefined && (
          <span className="pin-ok" title="Location selected">
            <Icon name="check" size={16} />
          </span>
        )}
      </div>
      {showList && (
        <ul id={`${id}-list`} role="listbox" className="suggestions">
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat},${s.lon},${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                window.clearTimeout(blurTimer.current);
                pick(s);
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
