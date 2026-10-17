// Background for the home page hero: an American highway at dusk, a semi on
// the road and two drivers checking the route. Purely decorative.

const NAVY = "#0a2342";
const RED = "#b22234";
const GOLD = "#f2b632";
const CHROME = "#c9d1db";

const STARS = [
  [90, 60], [210, 120], [330, 48], [470, 96], [590, 40], [720, 130], [860, 70], [980, 30],
  [1100, 110], [1230, 56], [1350, 140], [1480, 64], [1560, 150], [150, 200], [400, 180],
  [650, 210], [900, 190], [1180, 220], [1420, 230],
]; // prettier-ignore

function Wheel({ x }: { x: number }) {
  return (
    <g>
      <circle cx={x} cy={648} r={27} fill="#0d121b" />
      <circle cx={x} cy={648} r={12} fill="#8e9aab" />
      <circle cx={x} cy={648} r={4} fill="#3a4556" />
    </g>
  );
}

// A driver in a red flannel, checking the route on a tablet.
function DriverWithTablet() {
  const skin = "#c98d66";
  const flannel = RED;
  return (
    <g>
      <ellipse cx={0} cy={2} rx={42} ry={7} fill="#000" opacity={0.35} />
      <rect x={-22} y={-94} width={18} height={90} rx={7} fill="#2f4f7f" />
      <rect x={4} y={-94} width={18} height={90} rx={7} fill="#2a4673" />
      <rect x={-26} y={-12} width={25} height={13} rx={5} fill="#3a2a20" />
      <rect x={2} y={-12} width={25} height={13} rx={5} fill="#3a2a20" />
      <rect x={-25} y={-100} width={50} height={8} rx={2} fill="#2a1d16" />
      <path d="M-28,-98 L-31,-160 Q-31,-177 -14,-181 L14,-181 Q31,-177 31,-160 L28,-98 Z" fill={flannel} />
      <g stroke="#7d1424" strokeWidth={2} opacity={0.55}>
        <path d="M-15,-178 V-100 M0,-170 V-100 M15,-178 V-100 M-29,-150 H29 M-28,-124 H28" />
      </g>
      <path d="M-12,-181 L0,-166 L12,-181 Z" fill="#ebe4d8" />
      <rect x={-6} y={-190} width={12} height={11} fill={skin} />
      <circle cx={0} cy={-204} r={16} fill={skin} />
      {/* trucker cap, bill facing the truck */}
      <path d="M-17,-207 Q-16,-226 0,-226 Q16,-226 17,-207 Z" fill={NAVY} />
      <path d="M-11,-210 Q-9,-222 0,-223 Q8,-222 10,-213 Z" fill="#fff" />
      <path d="M-18,-208 L-35,-203 Q-31,-210 -16,-211 Z" fill={NAVY} />
      {/* raised arm with tablet */}
      <path d="M-27,-173 L-58,-141 L-49,-132 L-19,-163 Z" fill={flannel} />
      <circle cx={-55} cy={-137} r={6} fill={skin} />
      <rect x={-88} y={-163} width={32} height={23} rx={3} fill="#0f1a2e" stroke="#9aa5b5" strokeWidth={1.5} />
      <rect x={-85} y={-160} width={26} height={17} rx={1.5} fill="#9fd3ff" opacity={0.95} />
      <path d="M-82,-147 C-77,-156 -70,-150 -63,-157" stroke={RED} strokeWidth={2} fill="none" />
      {/* other arm down */}
      <path d="M26,-173 L34,-112 L24,-110 L18,-166 Z" fill={flannel} />
      <circle cx={29} cy={-107} r={6} fill={skin} />
    </g>
  );
}

// A driver in a hi-vis vest with a coffee.
function DriverWithCoffee() {
  const skin = "#8a5a3c";
  const hoodie = "#1b3a66";
  return (
    <g>
      <ellipse cx={0} cy={2} rx={44} ry={7} fill="#000" opacity={0.35} />
      <rect x={-23} y={-98} width={19} height={94} rx={7} fill="#22324f" />
      <rect x={4} y={-98} width={19} height={94} rx={7} fill="#1e2d48" />
      <rect x={-27} y={-12} width={26} height={13} rx={5} fill="#2b2018" />
      <rect x={1} y={-12} width={26} height={13} rx={5} fill="#2b2018" />
      <path d="M-30,-100 L-33,-166 Q-33,-184 -15,-188 L15,-188 Q33,-184 33,-166 L30,-100 Z" fill={hoodie} />
      <path d="M-29,-104 L-29,-172 L-10,-186 L-6,-132 L6,-132 L10,-186 L29,-172 L29,-104 Z" fill={GOLD} />
      <rect x={-29} y={-140} width={23} height={6} fill="#eef2f7" opacity={0.9} />
      <rect x={6} y={-140} width={23} height={6} fill="#eef2f7" opacity={0.9} />
      <rect x={-29} y={-121} width={58} height={6} fill="#eef2f7" opacity={0.9} />
      <rect x={-6} y={-197} width={12} height={11} fill={skin} />
      <circle cx={0} cy={-211} r={17} fill={skin} />
      <path d="M-18,-214 Q-17,-234 0,-234 Q17,-234 18,-214 Z" fill={RED} />
      <circle cx={2} cy={-224} r={3.5} fill="#fff" />
      <path d="M-19,-215 L-36,-210 Q-32,-217 -17,-218 Z" fill={RED} />
      {/* arm down */}
      <path d="M-25,-180 L-35,-178 L-37,-114 L-27,-112 Z" fill={hoodie} />
      <circle cx={-32} cy={-108} r={6} fill={skin} />
      {/* arm bent, holding a coffee */}
      <path d="M25,-180 L35,-178 L37,-138 L27,-136 Z" fill={hoodie} />
      <path d="M33,-144 L8,-150 L8,-140 L33,-134 Z" fill={hoodie} />
      <circle cx={7} cy={-145} r={6} fill={skin} />
      <rect x={-3} y={-163} width={13} height={17} rx={2} fill="#f4f1ea" />
      <rect x={-4} y={-166} width={15} height={4} rx={1} fill="#c9c2b4" />
      <path d="M2,-172 q-4,-6 0,-11 q4,-5 0,-10" stroke="#fff" strokeWidth={1.5} fill="none" opacity={0.5} />
    </g>
  );
}

export function HeroScene() {
  return (
    <svg
      className="hero-scene"
      viewBox="0 0 1600 760"
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081a33" />
          <stop offset="0.45" stopColor="#173462" />
          <stop offset="0.72" stopColor="#5a5f86" />
          <stop offset="0.86" stopColor="#d98f5a" />
          <stop offset="1" stopColor="#f2c48a" />
        </linearGradient>
        <radialGradient id="hs-sun" cx="1080" cy="545" r="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#f0a868" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f0a868" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hs-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2a45" />
          <stop offset="1" stopColor="#0b1527" />
        </linearGradient>
        <linearGradient id="hs-trailer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f5f8" />
          <stop offset="1" stopColor="#c7ced8" />
        </linearGradient>
        <linearGradient id="hs-beam" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe7a8" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ffe7a8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1600" height="760" fill="url(#hs-sky)" />
      {STARS.map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={1.6} fill="#fff" opacity={0.5} />
      ))}
      <rect width="1600" height="760" fill="url(#hs-sun)" />
      <circle cx={1080} cy={548} r={56} fill="#ffe2b0" opacity={0.9} />

      {/* far mountains, nearer mesas */}
      <path
        d="M0,520 L120,470 L210,500 L330,430 L450,495 L560,455 L700,505 L820,440 L930,490 L1040,470 L1160,505 L1290,440 L1420,492 L1520,462 L1600,488 V560 H0 Z"
        fill="#3a4c74"
        opacity={0.75}
      />
      <path
        d="M0,560 L90,540 L180,548 L240,520 L360,520 L400,546 L560,552 L640,528 L760,530 L800,552 L1000,556 L1060,534 L1200,534 L1250,556 L1600,550 V600 H0 Z"
        fill="#24395e"
      />
      <rect y={580} width="1600" height="180" fill="url(#hs-ground)" />

      {/* Interstate sign on a tall post behind the road */}
      <g transform="translate(1235 352)">
        <rect x={-3} y={30} width={6} height={130} fill="#5d6b80" />
        <path d="M-34,-6 H34 L36,8 Q36,44 0,62 Q-36,44 -36,8 Z" fill="#fff" />
        <path d="M-30,-2 H30 L31,10 H-31 Z" fill={RED} />
        <path d="M-31,13 H31 Q30,42 0,57 Q-30,42 -31,13 Z" fill="#1f4e8c" />
        <text x={0} y={7} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily="Inter, sans-serif">
          INTERSTATE
        </text>
        <text
          x={0}
          y={44}
          textAnchor="middle"
          fontSize={24}
          fontWeight={800}
          fill="#fff"
          fontFamily="Inter, sans-serif"
        >
          40
        </text>
      </g>

      {/* highway */}
      <rect y={606} width="1600" height="76" fill="#252e41" />
      <rect y={606} width="1600" height="4" fill="#3b465d" />
      <rect y={676} width="1600" height="3" fill="#d9dee6" opacity={0.7} />
      <path d="M0,643 H1600" stroke={GOLD} strokeWidth={4} strokeDasharray="44 34" opacity={0.85} />
      <rect y={682} width="1600" height="78" fill="#0f1a2e" />

      {/* headlight beam */}
      <path d="M760,558 L610,536 L610,604 L760,582 Z" fill="url(#hs-beam)" />

      {/* semi: trailer */}
      <rect x={930} y={468} width={505} height={152} rx={6} fill="url(#hs-trailer)" />
      <rect x={930} y={584} width={505} height={10} fill={RED} />
      <rect x={930} y={596} width={505} height={8} fill="#1f4e8c" />
      <rect x={930} y={620} width={505} height={10} fill="#1b2230" />
      <rect x={1415} y={480} width={14} height={130} rx={2} fill="#aeb7c4" />
      <Wheel x={1330} />
      <Wheel x={1388} />

      {/* semi: tractor */}
      <rect x={916} y={420} width={10} height={190} rx={4} fill={CHROME} />
      <path d="M822,470 Q822,458 836,458 H912 V622 H822 Z" fill="#1b3a66" />
      <path d="M760,548 Q760,536 774,534 L828,530 V622 H760 Z" fill="#163157" />
      <rect x={838} y={478} width={52} height={50} rx={6} fill="#f6c27a" opacity={0.9} />
      <rect x={838} y={478} width={52} height={50} rx={6} fill="none" stroke="#0b1a30" strokeWidth={3} />
      <rect x={758} y={548} width={12} height={66} rx={3} fill={CHROME} />
      <rect x={758} y={556} width={8} height={10} rx={2} fill="#ffe7a8" />
      <rect x={748} y={612} width={34} height={14} rx={4} fill={CHROME} />
      <rect x={858} y={598} width={46} height={26} rx={10} fill={CHROME} />
      <rect x={822} y={536} width={90} height={5} fill={RED} opacity={0.9} />
      <Wheel x={798} />
      <Wheel x={958} />
      <Wheel x={1014} />

      {/* drivers, on the shoulder */}
      <g transform="translate(1480 744)">
        <DriverWithTablet />
      </g>
      <g transform="translate(1555 748) scale(1.03)">
        <DriverWithCoffee />
      </g>
    </svg>
  );
}
