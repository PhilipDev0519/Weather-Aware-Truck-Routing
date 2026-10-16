import { useLayoutEffect, useRef, useState } from "react";
import { LEVELS } from "../risk";
import { Icon } from "./Icon";

// The fast route goes through the storm, the recommended one goes around it.
const FAST = "M70 340 C 170 300, 290 210, 360 168 S 455 108, 490 90";
const SAFE = "M70 340 C 170 362, 300 340, 390 290 S 482 170, 490 90";
const NORTH = "M70 340 C 86 250, 160 150, 262 122 S 430 66, 490 90";
const [GREEN, YELLOW, ORANGE, RED, PURPLE] = LEVELS.map((l) => l.color);

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function HeroIllustration() {
  const safeRef = useRef<SVGPathElement>(null);
  const [dots, setDots] = useState<{ x: number; y: number }[]>([]);
  const [animate] = useState(() => !prefersReducedMotion());

  useLayoutEffect(() => {
    const path = safeRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    setDots(
      Array.from({ length: 11 }, (_, i) => {
        const p = path.getPointAtLength((length * (i + 1)) / 12);
        return { x: p.x, y: p.y };
      }),
    );
  }, []);

  return (
    <div className="hero-visual" aria-hidden="true">
      <svg viewBox="0 0 560 420" className="hero-svg">
        <defs>
          <linearGradient id="hv-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3f7f9" />
            <stop offset="1" stopColor="#e7eef2" />
          </linearGradient>
          <radialGradient id="hv-storm">
            <stop offset="0" stopColor={RED} stopOpacity="0.55" />
            <stop offset="0.45" stopColor={ORANGE} stopOpacity="0.35" />
            <stop offset="1" stopColor={YELLOW} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hv-mild">
            <stop offset="0" stopColor={YELLOW} stopOpacity="0.35" />
            <stop offset="1" stopColor={YELLOW} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hv-calm">
            <stop offset="0" stopColor={GREEN} stopOpacity="0.16" />
            <stop offset="1" stopColor={GREEN} stopOpacity="0" />
          </radialGradient>
          <pattern id="hv-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#d5dfe5" strokeWidth="1" />
          </pattern>
          <filter id="hv-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect width="560" height="420" rx="22" fill="url(#hv-bg)" />
        <rect width="560" height="420" rx="22" fill="url(#hv-grid)" opacity="0.6" />
        {/* faint state lines */}
        <path
          d="M0 210 C 120 200, 200 230, 300 215 S 470 190, 560 205"
          stroke="#cbd6dd"
          strokeDasharray="4 6"
          fill="none"
        />
        <path d="M250 0 C 240 120, 270 260, 255 420" stroke="#cbd6dd" strokeDasharray="4 6" fill="none" />

        {/* weather corridor */}
        <circle cx="250" cy="260" r="210" fill="url(#hv-calm)" />
        <circle cx="185" cy="300" r="70" fill="url(#hv-mild)" />
        <circle cx="430" cy="255" r="48" fill="url(#hv-mild)" />
        <g className="storm">
          <circle cx="345" cy="175" r="105" fill="url(#hv-storm)" />
          <circle cx="360" cy="165" r="38" fill={RED} opacity="0.18" />
        </g>

        {/* alternative routes */}
        <path d={NORTH} fill="none" stroke="#7d8d98" strokeWidth="5" strokeLinecap="round" opacity="0.45" />
        <path d={FAST} fill="none" stroke="#7d8d98" strokeWidth="5" strokeLinecap="round" opacity="0.45" />
        <path
          d={FAST}
          pathLength={100}
          fill="none"
          stroke={PURPLE}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="0 58 16 100"
        />
        <path
          d={FAST}
          pathLength={100}
          fill="none"
          stroke={ORANGE}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="0 48 10 100"
          opacity="0.9"
        />

        {/* recommended route, risk-coloured */}
        <path d={SAFE} fill="none" stroke="#0b2e3b" strokeWidth="12" strokeLinecap="round" opacity="0.9" />
        <path ref={safeRef} d={SAFE} fill="none" stroke={GREEN} strokeWidth="7" strokeLinecap="round" />
        <path d={SAFE} pathLength={100} fill="none" stroke={YELLOW} strokeWidth="7" strokeDasharray="0 62 9 100" />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="5" fill={i === 7 ? YELLOW : GREEN} stroke="#fff" strokeWidth="2" />
        ))}

        {/* endpoints */}
        <g filter="url(#hv-shadow)">
          <circle cx="70" cy="340" r="11" fill="#127185" stroke="#fff" strokeWidth="3" />
          <circle cx="490" cy="90" r="11" fill="#0b3c4a" stroke="#fff" strokeWidth="3" />
        </g>

        {/* truck */}
        <g filter="url(#hv-shadow)">
          <g transform={animate || !dots[3] ? undefined : `translate(${dots[3].x} ${dots[3].y})`}>
            <circle r="17" fill="#fff" />
            <g
              transform="translate(-10 -10) scale(0.84)"
              stroke="#0b3c4a"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
              <path d="M15 18H9" />
              <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
              <circle cx="17" cy="18" r="2" />
              <circle cx="7" cy="18" r="2" />
            </g>
            {animate ? (
              <animateMotion
                dur="14s"
                repeatCount="indefinite"
                path={SAFE}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="linear"
              />
            ) : null}
          </g>
        </g>
      </svg>

      <div className="hv-card hv-card-rec">
        <span className="hv-icon">
          <Icon name="shield" size={16} />
        </span>
        <div>
          <strong>Route B recommended</strong>
          <span>0 mi Severe · 9h 12m</span>
        </div>
      </div>
      <div className="hv-card hv-card-storm">
        <span className="chip" style={{ background: PURPLE }}>
          No Travel
        </span>
        <div>
          <strong>Route A · mile 212</strong>
          <span>Wind 48 mph with 45,000 lb</span>
        </div>
      </div>
      <div className="hv-card hv-card-time">
        <Icon name="clock" size={16} />
        <div className="hv-slider">
          <span>Forecast +18h</span>
          <i>
            <b />
          </i>
        </div>
      </div>
    </div>
  );
}
