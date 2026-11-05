/**
 * HeroIllustration — Spendify
 * Pixel-accurate vector replica of the reference image:
 * - Centered MacBook laptop with a charcoal dashboard preview
 * - Left floating cards: Expense Tracking, Remaining Balance ($420.00), Spending Analytics
 * - Right floating cards: Budget Tracking (52%, 30%, 20%), Smart Savings (85% Done), Saving Goal Achieved! (3D Gold Star)
 * - Cosmic atmosphere: upper-left orbital halo, upper-right orange comet streak, concentric ground orbit rings, glowing particles
 */
export default function HeroIllustration({ className = '' }) {
  return (
    <div className={`hero-illustration-wrapper ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 1100 540"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="hero-svg"
        aria-label="Spendify student finance mockup with floating cards"
        role="img"
      >
        <defs>
          {/* Ambient floor glow */}
          <radialGradient id="floorGlow" cx="50%" cy="84%" r="44%">
            <stop offset="0%" stopColor="#FF6026" stopOpacity="0.25" />
            <stop offset="60%" stopColor="#FF6B35" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#FF6026" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="coreGlow" cx="50%" cy="84%" r="22%">
            <stop offset="0%" stopColor="#FF8151" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF6026" stopOpacity="0" />
          </radialGradient>

          {/* Upper left halo glow */}
          <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF8151" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FF6026" stopOpacity="0" />
          </radialGradient>

          {/* Comet streak gradient */}
          <linearGradient id="cometStreak" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFAA7D" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#FF6B35" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FF6026" stopOpacity="0" />
          </linearGradient>

          {/* Laptop screen charcoal background */}
          <linearGradient id="laptopScreenBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18120E" />
            <stop offset="50%" stopColor="#241913" />
            <stop offset="100%" stopColor="#100B08" />
          </linearGradient>

          {/* Card shadow filter */}
          <filter id="softCardShadow" x="-15%" y="-15%" width="130%" height="135%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#E98713" floodOpacity="0.12" />
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.06" />
          </filter>

          {/* Orange glowing progress bar gradient */}
          <linearGradient id="glowRedBar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E98713" />
            <stop offset="70%" stopColor="#FF6B35" />
            <stop offset="100%" stopColor="#FF8A4C" />
          </linearGradient>

          {/* 3D Red Star Gradients */}
          <linearGradient id="starFacetLight" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF8A4C" />
            <stop offset="100%" stopColor="#FF6B35" />
          </linearGradient>
          <linearGradient id="starFacetDark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6026" />
            <stop offset="100%" stopColor="#E98713" />
          </linearGradient>

          {/* Glossy vertical bar gradient for Spending Analytics */}
          <linearGradient id="glossyBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF8A4C" />
            <stop offset="35%" stopColor="#FF6B35" />
            <stop offset="100%" stopColor="#E98713" />
          </linearGradient>
        </defs>

        {/* ═══════════════ UPPER-LEFT PLANETARY HALO ═══════════════ */}
        <g transform="translate(145, 145) rotate(-22)">
          <ellipse cx="0" cy="0" rx="135" ry="32" fill="url(#haloGlow)" />
          <ellipse cx="0" cy="0" rx="140" ry="34" stroke="#FF8A4C" strokeWidth="1.2" strokeOpacity="0.45" fill="none" />
          <ellipse cx="0" cy="0" rx="122" ry="28" stroke="#FF6B35" strokeWidth="0.8" strokeOpacity="0.3" fill="none" />
          <circle cx="-135" cy="0" r="3" fill="#FF8A4C" opacity="0.8" />
          <circle cx="138" cy="0" r="2.5" fill="#FFAA7D" opacity="0.8" />
        </g>

        {/* ═══════════════ UPPER-RIGHT COMET STREAK ═══════════════ */}
        <g>
          <line x1="1040" y1="95" x2="955" y2="175" stroke="url(#cometStreak)" strokeWidth="3" strokeLinecap="round" />
          <line x1="1025" y1="110" x2="960" y2="170" stroke="#FFFFFF" strokeWidth="1" strokeOpacity="0.75" strokeLinecap="round" />
          <circle cx="955" cy="175" r="4.5" fill="#FFFFFF" />
          <circle cx="955" cy="175" r="7" fill="#FF8A4C" opacity="0.5" />
        </g>

        {/* ═══════════════ GROUND CONCENTRIC ORBIT RINGS ═══════════════ */}
        <ellipse cx="550" cy="492" rx="420" ry="46" fill="url(#floorGlow)" />
        <ellipse cx="550" cy="492" rx="220" ry="26" fill="url(#coreGlow)" />

        <ellipse cx="550" cy="494" rx="440" ry="50" stroke="#FF6026" strokeWidth="1" strokeOpacity="0.22" fill="none" />
        <ellipse cx="550" cy="494" rx="350" ry="39" stroke="#FF6B35" strokeWidth="1.2" strokeOpacity="0.28" fill="none" />
        <ellipse cx="550" cy="494" rx="260" ry="29" stroke="#FF8A4C" strokeWidth="1.2" strokeOpacity="0.36" fill="none" />

        {/* Floating red dust / sparkles / embers */}
        {[
          [65,  130, 3,   "#FF8A4C", 0.7],
          [90,  180, 2,   "#FF6B35", 0.6],
          [110, 280, 2.5, "#FF8A4C", 0.5],
          [40,  340, 2,   "#FF6026", 0.6],
          [75,  410, 3.5, "#FF6B35", 0.7],
          [135, 460, 2,   "#FF8A4C", 0.5],
          [180, 500, 3,   "#FF6B35", 0.6],
          [960, 50,  3,   "#FFAA7D", 0.7],
          [1020,240, 2,   "#FF8A4C", 0.6],
          [1060,330, 3.5, "#FF6B35", 0.65],
          [980, 420, 2.5, "#FF6026", 0.55],
          [1040,460, 3,   "#FF8A4C", 0.7],
          [890, 505, 2.5, "#FF6B35", 0.6],
          [410, 22,  2,   "#FFAA7D", 0.5],
          [690, 18,  2,   "#FF8A4C", 0.5],
        ].map(([cx, cy, r, fill, op], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={fill} opacity={op} />
        ))}

        {/* ═══════════════ LAPTOP BODY ═══════════════ */}
        {/* Screen lid outer frame (silver) */}
        <rect x="254" y="44" width="592" height="364" rx="14" fill="#D8DEE4" stroke="#BCC5CF" strokeWidth="1" />
        {/* Screen inner black bezel */}
        <rect x="262" y="51" width="576" height="350" rx="10" fill="#0C0D11" />
        {/* Screen display area with dark red UI */}
        <rect x="272" y="61" width="556" height="332" rx="7" fill="url(#laptopScreenBg)" />
        {/* Notch / Camera dot */}
        <rect x="532" y="52" width="36" height="9" rx="4" fill="#0C0D11" />
        <circle cx="550" cy="56" r="2.5" fill="#2E3440" />

        {/* ─── Dark Red Dashboard on Laptop Display ─── */}
        {/* Mini sidebar strip */}
        <rect x="272" y="61" width="68" height="332" fill="#18120E" />
        <circle cx="306" cy="84" r="11" fill="#FF6B35" />
        <text x="306" y="88.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#FFFFFF" fontFamily="Poppins, sans-serif">₹</text>

        {[112, 134, 156, 178, 200, 222, 244].map((y, idx) => (
          <g key={idx}>
            <rect x="282" y={y - 8} width="48" height="16" rx="4" fill={idx === 0 ? "#FF6B35" : "transparent"} opacity={idx === 0 ? 0.35 : 1} />
            <circle cx="292" cy={y} r="3" fill={idx === 0 ? "#FF8A4C" : "#8C7970"} />
            <rect x="300" y={y - 2.5} width={idx === 0 ? 22 : 16} height="5" rx="2.5" fill={idx === 0 ? "#FFFFFF" : "#8C7970"} />
          </g>
        ))}

        {/* Top search & header */}
        <rect x="340" y="61" width="488" height="36" fill="#18120E" opacity="0.6" />
        <text x="354" y="83" fontSize="11" fontWeight="700" fill="#FFFFFF" fontFamily="Poppins, sans-serif">Student Dashboard</text>
        <rect x="475" y="71" width="130" height="16" rx="8" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <circle cx="488" cy="79" r="3" fill="#FF8A4C" />
        <rect x="734" y="70" width="44" height="18" rx="9" fill="#FF6B35" />
        <text x="756" y="82.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFFFFF" fontFamily="Inter, sans-serif">+ Add</text>
        <circle cx="796" cy="79" r="8" fill="#382820" stroke="#FF6B35" strokeWidth="1" />

        {/* ── Dashboard Stats ── */}
        {/* Stat 1: $3,199.00 */}
        <rect x="352" y="105" width="132" height="52" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="362" y="119" fontSize="7.5" fill="#E599A8" fontFamily="Inter, sans-serif">Total Balance</text>
        <text x="362" y="140" fontSize="15" fontWeight="700" fill="#FFFFFF" fontFamily="Poppins, sans-serif">$3,199.00</text>
        <polyline points="432,138 442,130 452,134 462,124 472,128" fill="none" stroke="#FF6B35" strokeWidth="1.8" strokeLinecap="round" />

        {/* Stat 2: $420.00 */}
        <rect x="494" y="105" width="132" height="52" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="504" y="119" fontSize="7.5" fill="#E599A8" fontFamily="Inter, sans-serif">Spent this month</text>
        <text x="504" y="140" fontSize="15" fontWeight="700" fill="#FFFFFF" fontFamily="Poppins, sans-serif">$420.00</text>
        <polyline points="574,136 584,138 594,128 604,132 614,122" fill="none" stroke="#FF8A4C" strokeWidth="1.8" strokeLinecap="round" />

        {/* Stat 3: 100% Donut */}
        <rect x="636" y="105" width="180" height="52" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="646" y="123" fontSize="8" fill="#E599A8" fontFamily="Inter, sans-serif">Savings Goal</text>
        <text x="646" y="142" fontSize="11" fontWeight="700" fill="#FF6B35" fontFamily="Poppins, sans-serif">100% Safe</text>
        <circle cx="780" cy="131" r="18" fill="none" stroke="#382820" strokeWidth="7" />
        <circle cx="780" cy="131" r="18" fill="none" stroke="#FF6B35" strokeWidth="7" strokeDasharray="90 30" strokeDashoffset="20" strokeLinecap="round" />
        <text x="780" y="134" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#FFFFFF" fontFamily="Poppins, sans-serif">100%</text>

        {/* ── Dashboard Bar Chart: Glowing Red Bars ── */}
        <rect x="352" y="167" width="274" height="110" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="362" y="183" fontSize="8.5" fontWeight="600" fill="#FFFFFF" fontFamily="Inter, sans-serif">Cash Flow Overview</text>
        {[
          { x: 366, h: 42 },
          { x: 382, h: 58 },
          { x: 398, h: 32 },
          { x: 414, h: 68 },
          { x: 430, h: 48 },
          { x: 446, h: 62 },
          { x: 462, h: 74 },
          { x: 478, h: 38 },
          { x: 494, h: 54 },
          { x: 510, h: 68 },
          { x: 526, h: 46 },
          { x: 542, h: 60 },
          { x: 558, h: 32 },
          { x: 574, h: 50 },
          { x: 590, h: 42 },
          { x: 606, h: 64 },
        ].map((b, i) => (
          <rect key={i} x={b.x} y={268 - b.h} width="10" height={b.h} rx="3" fill={i % 2 === 0 ? "#FF6B35" : "#E98713"} />
        ))}
        <line x1="360" y1="268" x2="618" y2="268" stroke="#382820" strokeWidth="1" />

        {/* ── Dashboard Category List ── */}
        <rect x="636" y="167" width="180" height="110" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="646" y="183" fontSize="8.5" fontWeight="600" fill="#FFFFFF" fontFamily="Inter, sans-serif">Top Budgets</text>
        {[
          { name: "Food & Drinks", amt: "$190", pct: 60 },
          { name: "Public Transit", amt: "$85",  pct: 35 },
          { name: "Course Books",  amt: "$145", pct: 70 },
          { name: "Entertainment", amt: "$50",  pct: 25 },
        ].map((item, idx) => (
          <g key={idx}>
            <text x="646" y={202 + idx * 20} fontSize="7.5" fill="#E599A8" fontFamily="Inter, sans-serif">{item.name}</text>
            <text x="806" y={202 + idx * 20} textAnchor="end" fontSize="7.5" fontWeight="600" fill="#FFFFFF" fontFamily="Inter, sans-serif">{item.amt}</text>
            <rect x="646" y={206 + idx * 20} width="160" height="4" rx="2" fill="#382820" />
            <rect x="646" y={206 + idx * 20} width={160 * item.pct / 100} height="4" rx="2" fill="#FF6B35" />
          </g>
        ))}

        {/* ── Dashboard Bottom Table ── */}
        <rect x="352" y="287" width="464" height="96" rx="7" fill="#241913" stroke="#382820" strokeWidth="0.8" />
        <text x="364" y="303" fontSize="8.5" fontWeight="600" fill="#FFFFFF" fontFamily="Inter, sans-serif">Activity Log</text>
        {[
          { name: "Campus Canteen Meal", date: "Today, 1:20 PM", amt: "-$8.50" },
          { name: "University Book Store", date: "Yesterday", amt: "-$42.00" },
          { name: "Freelance Design Stipend", date: "24 Oct", amt: "+$350.00" },
        ].map((row, i) => (
          <g key={i}>
            <circle cx="368" cy={321 + i * 20} r="4" fill={row.amt.startsWith("+") ? "#22C55E" : "#FF6B35"} />
            <text x="380" y={324 + i * 20} fontSize="8" fill="#FCE7EC" fontFamily="Inter, sans-serif">{row.name}</text>
            <text x="560" y={324 + i * 20} fontSize="7" fill="#8C7970" fontFamily="Inter, sans-serif">{row.date}</text>
            <text x="804" y={324 + i * 20} textAnchor="end" fontSize="8" fontWeight="600" fill={row.amt.startsWith("+") ? "#22C55E" : "#FF8A4C"} fontFamily="Inter, sans-serif">{row.amt}</text>
          </g>
        ))}

        {/* ═══════════════ LAPTOP BASE & TRACKPAD ═══════════════ */}
        {/* Silver keyboard base */}
        <path d="M214 408 Q216 400 256 400 L844 400 Q884 400 886 408 L914 456 Q920 466 908 466 L192 466 Q180 466 186 456 Z" fill="#D2D7DF" />
        {/* Keyboard upper deck */}
        <path d="M228 408 Q230 402 266 402 L834 402 Q870 402 872 408 L896 450 Q900 458 890 458 L210 458 Q200 458 204 450 Z" fill="#E5E9EE" />
        {/* Trackpad */}
        <rect x="490" y="420" width="120" height="28" rx="5" fill="#D2D7DF" stroke="#BCC5CF" strokeWidth="0.8" />
        {/* Front edge lip notch */}
        <rect x="526" y="462" width="48" height="3" rx="1.5" fill="#9CA3AF" />

        {/* ═══════════════ LEFT FLOATING CARDS ═══════════════ */}

        {/* 1. Expense Tracking */}
        <g filter="url(#softCardShadow)">
          <rect x="12" y="52" width="234" height="152" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />
          {/* Header */}
          <text x="26" y="78" fontSize="12" fontWeight="700" fill="#1F2937" fontFamily="Poppins, sans-serif">Expense Tracking</text>
          <text x="232" y="77" textAnchor="end" fontSize="12" fill="#9CA3AF" fontFamily="Inter, sans-serif">⌵</text>

          {/* 4 category squares with Soft Peach (#FFF0E8) background */}
          {[
            { icon: "🍴", label: "Food",          bg: "#FFF0E8", col: "#FF6026" },
            { icon: "🚗", label: "Transit",       bg: "#FFF0E8", col: "#FF6026" },
            { icon: "🎬", label: "Entertainment", bg: "#FFF0E8", col: "#FF6026" },
            { icon: "⊕",  label: "Other",         bg: "#FFF0E8", col: "#FF6026" },
          ].map((cat, idx) => {
            const x = 32 + idx * 48;
            return (
              <g key={cat.label}>
                <rect x={x - 12} y="88" width="38" height="38" rx="10" fill={cat.bg} stroke="#FFD2BD" strokeWidth="0.8" />
                <text x={x + 7} y="112" textAnchor="middle" fontSize="16">{cat.icon}</text>
                <text x={x + 7} y="136" textAnchor="middle" fontSize="7" fontWeight="500" fill="#6B7280" fontFamily="Inter, sans-serif">{cat.label}</text>
              </g>
            );
          })}

          <line x1="26" y1="146" x2="232" y2="146" stroke="#F3F4F6" strokeWidth="1" />
          <text x="26"  y="162" fontSize="9.5" fill="#6B7280" fontFamily="Inter, sans-serif">Category</text>
          <text x="232" y="162" textAnchor="end" fontSize="9.5" fontWeight="700" fill="#1F2937" fontFamily="Inter, sans-serif">$190.00</text>
          <text x="26"  y="178" fontSize="9.5" fill="#6B7280" fontFamily="Inter, sans-serif">Total Count</text>
          <text x="232" y="178" textAnchor="end" fontSize="9.5" fontWeight="700" fill="#1F2937" fontFamily="Inter, sans-serif">$30.00</text>
        </g>

        {/* 2. Remaining Balance */}
        <g filter="url(#softCardShadow)">
          <rect x="22" y="232" width="216" height="92" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />
          <text x="36" y="254" fontSize="10.5" fontWeight="600" fill="#6B7280" fontFamily="Inter, sans-serif">Remaining Balance</text>
          <text x="224" y="254" textAnchor="end" fontSize="11" fill="#9CA3AF" fontFamily="Inter, sans-serif">›</text>
          <text x="36" y="284" fontSize="26" fontWeight="800" fill="#1F2937" fontFamily="Poppins, sans-serif">$420.00</text>
          {/* Orange sine sparkline */}
          <polyline
            points="148,278 162,272 174,282 188,266 202,274 216,264 226,268"
            fill="none"
            stroke="#FF6B35"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* 3. Spending Analytics */}
        <g filter="url(#softCardShadow)">
          <rect x="14" y="356" width="230" height="136" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />
          <text x="28" y="378" fontSize="11.5" fontWeight="700" fill="#1F2937" fontFamily="Poppins, sans-serif">Spending Analytics</text>
          <text x="230" y="378" textAnchor="end" fontSize="11" fill="#9CA3AF" fontFamily="Inter, sans-serif">›</text>
          {/* Glossy 3D red bar chart */}
          {[
            { x: 30,  h: 35 },
            { x: 52,  h: 55 },
            { x: 74,  h: 40 },
            { x: 96,  h: 75 },
            { x: 118, h: 58 },
            { x: 140, h: 84 },
            { x: 162, h: 68 },
            { x: 184, h: 50 },
            { x: 206, h: 62 },
          ].map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={472 - b.h} width="16" height={b.h} rx="4" fill="url(#glossyBar)" />
              <rect x={b.x + 2} y={472 - b.h + 2} width="12" height="4" rx="2" fill="#FFFFFF" opacity="0.45" />
            </g>
          ))}
          <line x1="26" y1="473" x2="232" y2="473" stroke="#F3F4F6" strokeWidth="1" />
        </g>

        {/* ═══════════════ RIGHT FLOATING CARDS ═══════════════ */}

        {/* 4. Budget Tracking */}
        <g filter="url(#softCardShadow)">
          <rect x="850" y="44" width="238" height="152" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />
          <text x="864" y="68" fontSize="11.5" fontWeight="700" fill="#1F2937" fontFamily="Poppins, sans-serif">Budget Tracking</text>
          <text x="1074" y="68" textAnchor="end" fontSize="11" fill="#9CA3AF" fontFamily="Inter, sans-serif">›</text>
          {[
            { label: "Food & Drink",  pct: 52 },
            { label: "Travel",        pct: 30 },
            { label: "Entertainment", pct: 20 },
          ].map((row, i) => (
            <g key={i}>
              <text x="864" y={98 + i * 32} fontSize="9.5" fill="#4B5563" fontFamily="Inter, sans-serif">{row.label}</text>
              <text x="1074" y={98 + i * 32} textAnchor="end" fontSize="10" fontWeight="700" fill="#1F2937" fontFamily="Inter, sans-serif">{row.pct}%</text>
              <rect x="864" y={104 + i * 32} width="210" height="9" rx="4.5" fill="#FEE2E2" />
              <rect x="864" y={104 + i * 32} width={210 * row.pct / 100} height="9" rx="4.5" fill="url(#glowRedBar)" />
            </g>
          ))}
        </g>

        {/* 5. Smart Savings */}
        <g filter="url(#softCardShadow)">
          <rect x="856" y="224" width="224" height="118" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />
          <text x="870" y="246" fontSize="11.5" fontWeight="700" fill="#1F2937" fontFamily="Poppins, sans-serif">Smart Savings</text>
          <text x="1066" y="246" textAnchor="end" fontSize="11" fill="#9CA3AF" fontFamily="Inter, sans-serif">›</text>
          <text x="886" y="270" fontSize="9.5" fill="#6B7280" fontFamily="Inter, sans-serif">Spring Break</text>

          {/* Glowing Red Circular Ring: 85% Done */}
          <circle cx="980" cy="288" r="36" fill="none" stroke="#FEE2E2" strokeWidth="10" />
          <circle
            cx="980"
            cy="288"
            r="36"
            fill="none"
            stroke="#FF6026"
            strokeWidth="10"
            strokeDasharray="192 226"
            strokeDashoffset="54"
            strokeLinecap="round"
            transform="rotate(-90 980 288)"
          />
          <text x="980" y="286" textAnchor="middle" fontSize="15" fontWeight="800" fill="#1F2937" fontFamily="Poppins, sans-serif">85%</text>
          <text x="980" y="300" textAnchor="middle" fontSize="8" fill="#6B7280" fontFamily="Inter, sans-serif">Done</text>
        </g>

        {/* 6. Saving Goal Achieved! (3D Red Star) */}
        <g filter="url(#softCardShadow)">
          <rect x="860" y="366" width="220" height="126" rx="16" fill="#FFFFFF" fillOpacity="0.94" stroke="#FFD2BD" strokeWidth="1.2" />

          {/* Floating confetti dots & droplets */}
          {[
            [878, 384, 3,   "#FF8A4C"],
            [900, 396, 2,   "#FF6B35"],
            [1048,382, 3.5, "#FF6B35"],
            [1064,402, 2.5, "#FF8A4C"],
            [874, 464, 2.5, "#FFAA7D"],
            [892, 478, 3,   "#FF6B35"],
            [1050,466, 3,   "#FF8A4C"],
            [1032,480, 2,   "#FF6B35"],
          ].map(([cx, cy, r, col], idx) => (
            <circle key={idx} cx={cx} cy={cy} r={r} fill={col} opacity="0.8" />
          ))}

          {/* Beveled 3D Red Star */}
          <g transform="translate(970, 408) scale(1.15)">
            {/* Center: (0, 0) */}
            {/* 5 Outer Points: (0, -22), (21, -7), (13, 18), (-13, 18), (-21, -7) */}
            {/* 5 Inner Points: (0, -7), (6, -2), (4, 7), (-4, 7), (-6, -2) */}
            {/* Star shadow */}
            <polygon points="0,-22 6,-6 21,-7 11,3 13,18 0,10 -13,18 -11,3 -21,-7 -6,-6" fill="#E98713" opacity="0.25" transform="translate(0, 3)" />
            {/* Star facets with lighting */}
            <polygon points="0,0 0,-22 6,-6" fill="url(#starFacetLight)" />
            <polygon points="0,0 6,-6 21,-7" fill="url(#starFacetDark)" />
            <polygon points="0,0 21,-7 11,3" fill="url(#starFacetLight)" />
            <polygon points="0,0 11,3 13,18" fill="url(#starFacetDark)" />
            <polygon points="0,0 13,18 0,10" fill="url(#starFacetLight)" />
            <polygon points="0,0 0,10 -13,18" fill="url(#starFacetDark)" />
            <polygon points="0,0 -13,18 -11,3" fill="url(#starFacetLight)" />
            <polygon points="0,0 -11,3 -21,-7" fill="url(#starFacetDark)" />
            <polygon points="0,0 -21,-7 -6,-6" fill="url(#starFacetLight)" />
            <polygon points="0,0 -6,-6 0,-22" fill="url(#starFacetDark)" />
          </g>

          <text x="970" y="456" textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#1F2937" fontFamily="Poppins, sans-serif">Saving Goal</text>
          <text x="970" y="473" textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#FF6B35" fontFamily="Poppins, sans-serif">Achieved!</text>
        </g>
      </svg>
    </div>
  );
}
