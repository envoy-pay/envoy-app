/**
 * Centered radial funding visual — agent core at the middle, asset nodes
 * orbiting on dotted rings, iridescent pulses traveling inward.
 */
export function FundingOrbit() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <svg
        viewBox="0 0 600 600"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full overflow-visible"
        aria-label="Assets orbiting an autonomous agent, funds flowing inward"
        role="img"
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#D4FF3F" stopOpacity="0.4" />
            <stop offset="55%" stopColor="#4FE9E0" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#9B8CFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="iris" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D4FF3F" />
            <stop offset="50%" stopColor="#4FE9E0" />
            <stop offset="100%" stopColor="#9B8CFF" />
          </linearGradient>
          <path id="flow-1" d="M 300 130 L 300 230" />
          <path id="flow-2" d="M 132 396 L 268 318" />
          <path id="flow-3" d="M 468 396 L 332 318" />
        </defs>

        <circle cx="300" cy="300" r="190" fill="url(#coreGlow)" />

        <g style={{ transformOrigin: "300px 300px" }} className="animate-soft-spin">
          <circle cx="300" cy="300" r="200" fill="none" stroke="#F5F5F7" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="1 7" />
        </g>
        <g style={{ transformOrigin: "300px 300px" }} className="animate-soft-spin-rev">
          <circle cx="300" cy="300" r="150" fill="none" stroke="#4FE9E0" strokeOpacity="0.16" strokeWidth="0.75" strokeDasharray="1 6" />
        </g>
        <circle cx="300" cy="300" r="110" fill="none" stroke="#F5F5F7" strokeOpacity="0.05" strokeWidth="0.5" />

        <use href="#flow-1" stroke="#F5F5F7" strokeOpacity="0.15" strokeWidth="1" />
        <use href="#flow-2" stroke="#F5F5F7" strokeOpacity="0.15" strokeWidth="1" />
        <use href="#flow-3" stroke="#F5F5F7" strokeOpacity="0.15" strokeWidth="1" />

        <circle r="4.5" fill="#D4FF3F">
          <animateMotion dur="2.4s" repeatCount="indefinite" begin="0.2s">
            <mpath href="#flow-1" />
          </animateMotion>
        </circle>
        <circle r="4.5" fill="#4FE9E0">
          <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.0s">
            <mpath href="#flow-2" />
          </animateMotion>
        </circle>
        <circle r="4.5" fill="#9B8CFF">
          <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.7s">
            <mpath href="#flow-3" />
          </animateMotion>
        </circle>

        <AssetNode cx={300} cy={108} label="$" caption="cUSD" />
        <AssetNode cx={120} cy={408} label="€" caption="cEUR" />
        <AssetNode cx={480} cy={408} label="$" caption="USDC" />

        <g style={{ transformOrigin: "300px 300px" }} className="animate-beat">
          <circle cx="300" cy="300" r="64" fill="#070810" />
          <circle cx="300" cy="300" r="64" fill="none" stroke="url(#iris)" strokeWidth="1.6" />
          <circle cx="300" cy="300" r="58" fill="none" stroke="#4FE9E0" strokeOpacity="0.25" strokeWidth="0.5" />
          <text x="300" y="292" textAnchor="middle" fill="#D4FF3F" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="2">
            ERC-8004
          </text>
          <text x="300" y="320" textAnchor="middle" fill="#F5F5F7" fontFamily="var(--font-display)" fontSize="20" fontWeight="600">
            agent
          </text>
        </g>
      </svg>
    </div>
  );
}

function AssetNode({
  cx,
  cy,
  label,
  caption,
}: {
  cx: number;
  cy: number;
  label: string;
  caption: string;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="22" fill="#070810" stroke="url(#iris)" strokeOpacity="0.7" />
      <circle cx={cx} cy={cy} r="22" fill="none" stroke="#F5F5F7" strokeOpacity="0.1" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="#F5F5F7" fontFamily="var(--font-mono)" fontSize="13" fontWeight="600">
        {label}
      </text>
      <text x={cx} y={cy + 40} textAnchor="middle" fill="#9CA0B8" fontFamily="var(--font-mono)" fontSize="9" letterSpacing="1.5">
        {caption}
      </text>
    </g>
  );
}
