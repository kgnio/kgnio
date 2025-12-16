import fs from "node:fs";
import path from "node:path";

const token = process.env.GH_TOKEN;
const username = process.env.GH_USERNAME;

if (!token || !username) {
  console.error("Missing GH_TOKEN or GH_USERNAME");
  process.exit(1);
}

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);

  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

function streakFromDailyCounts(dailyCounts) {
  let total = 0;
  let current = 0;
  let longest = 0;

  for (const x of dailyCounts) total += x.count;

  let run = 0;
  for (const x of dailyCounts) {
    if (x.count > 0) run++;
    else run = 0;
    if (run > longest) longest = run;
  }

  let i = dailyCounts.length - 1;
  while (i >= 0 && dailyCounts[i].count > 0) {
    current++;
    i--;
  }

  let lastActive = null;
  for (let j = dailyCounts.length - 1; j >= 0; j--) {
    if (dailyCounts[j].count > 0) {
      lastActive = dailyCounts[j].date;
      break;
    }
  }

  return { total, current, longest, lastActive };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtISO(dateStr) {
  return dateStr || "-";
}

function areaPath(values, width, height, pad = 10) {
  const max = Math.max(1, ...values);
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = values.map((v, idx) => {
    const x = pad + (w * idx) / (values.length - 1);
    const y = pad + h - (h * v) / max;
    return [x, y];
  });

  const lineD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");

  const baselineY = pad + h;
  const areaD =
    `${lineD} ` +
    `L ${pts[pts.length - 1][0].toFixed(2)} ${baselineY.toFixed(2)} ` +
    `L ${pts[0][0].toFixed(2)} ${baselineY.toFixed(2)} Z`;

  return { lineD, areaD, max };
}

function flamePath() {
  return "M12.2 2.2c.5 2.5-.6 4-2 5.4C8.7 9.2 7.3 10.6 7.3 13c0 3 2.3 5.1 5 5.1 2.8 0 5-2.2 5-5.3 0-2.1-1.1-3.6-2.3-5.1-.9-1.1-1.8-2.2-1.8-3.9 0-.6 0-1.1 0-1.6z";
}

function svgCard({
  total,
  current,
  longest,
  lastActive,
  series30,
  max30,
}) {
  const W = 960;
  const H = 240;
  const pad = 14;
  const r = 20;

  const leftX = 52;
  const midX = 356;
  const rightX = 660;

  const topY = 64;

  const ringR = 46;
  const ringStroke = 10;
  const ringCirc = 2 * Math.PI * ringR;
  const denom = Math.max(1, longest, current);
  const ratio = clamp(current / denom, 0, 1);
  const dash = `${(ratio * ringCirc).toFixed(2)} ${ringCirc.toFixed(2)}`;

  const chartW = 250;
  const chartH = 86;
  const { lineD, areaD } = areaPath(series30, chartW, chartH, 12);

  const gridLines = 4;
  const grid = [];
  for (let i = 0; i <= gridLines; i++) {
    const y = 12 + ((chartH - 24) * i) / gridLines;
    grid.push(y);
  }
  const lastActiveText = lastActive ? fmtISO(lastActive) : "-";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub pro stats card">
  <defs>
    <!-- dark -->
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#070B14"/>
      <stop offset="1" stop-color="#0B1220"/>
    </linearGradient>

    <!-- accent -->
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#60A5FA"/>
      <stop offset="0.55" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#34D399"/>
    </linearGradient>

    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#60A5FA" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#FDE047"/>
      <stop offset="0.55" stop-color="#FB923C"/>
      <stop offset="1" stop-color="#F43F5E"/>
    </linearGradient>

    <!-- shadow -->
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>

    <!-- subtle highlight -->
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Card -->
  <rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}"
        rx="${r}" fill="url(#bg)" stroke="#1F2937" filter="url(#softShadow)"/>

  <!-- top-right -->
  <path d="M${W - 320} ${pad} L${W - 120} ${pad} L${W - 40} ${H - pad} L${W - 240} ${H - pad} Z"
        fill="url(#accent)" opacity="0.08"/>

  <!-- Dividers -->
  <line x1="320" y1="52" x2="320" y2="188" stroke="#1F2937"/>
  <line x1="640" y1="52" x2="640" y2="188" stroke="#1F2937"/>

  <!-- LEFT -->
  <g transform="translate(${leftX},${topY})">
    <text x="0" y="0" fill="#E5E7EB" font-size="38" font-weight="800"
          font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${total.toLocaleString("en-US")}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14"
          font-family="ui-sans-serif, system-ui">Total Contributions</text>

    <!-- chip: last active -->
    <g transform="translate(0,64)">
      <rect x="0" y="0" width="248" height="34" rx="999" fill="#0A0F1A" stroke="#1F2937"/>
      <text x="14" y="22" fill="#9CA3AF" font-size="12" font-family="ui-sans-serif, system-ui">Last active</text>
      <text x="96" y="22" fill="#E5E7EB" font-size="12" font-weight="700" font-family="ui-sans-serif, system-ui">${lastActiveText}</text>

      <!-- flame icon -->
      <g transform="translate(210,6)" filter="url(#glow)">
        <path d="${flamePath()}" fill="url(#flame)">
          <animate attributeName="opacity" values="0.85;1;0.9;1;0.85" dur="1.6s" repeatCount="indefinite"/>
        </path>
        <g>
          <animateTransform attributeName="transform" type="scale"
            values="1;1.08;1" dur="1.6s" repeatCount="indefinite" additive="sum"/>
        </g>
      </g>
    </g>

    <!-- small footer note -->
    <text x="0" y="136" fill="#6B7280" font-size="12" font-family="ui-sans-serif, system-ui">
      Auto-updated via GitHub Actions
    </text>
  </g>

  <!-- MIDDLE -->
  <g transform="translate(${midX},52)">
    <!-- ring base -->
    <circle cx="70" cy="64" r="${ringR}" stroke="#1F2937" stroke-width="${ringStroke}"/>
    <!-- ring progress -->
    <circle cx="70" cy="64" r="${ringR}" stroke="url(#accent)" stroke-width="${ringStroke}"
      stroke-linecap="round" stroke-dasharray="${dash}"
      transform="rotate(-90 70 64)"/>

    <!-- pulse effect -->
    <circle cx="70" cy="64" r="${ringR + 10}" stroke="url(#accent)" stroke-width="2" opacity="0.18">
      <animate attributeName="opacity" values="0.00;0.18;0.00" dur="2.2s" repeatCount="indefinite"/>
      <animate attributeName="r" values="${ringR + 6};${ringR + 14};${ringR + 6}" dur="2.2s" repeatCount="indefinite"/>
    </circle>

    <text x="70" y="72" text-anchor="middle" fill="#E5E7EB" font-size="34" font-weight="900"
          font-family="ui-sans-serif, system-ui">${current}</text>

    <text x="70" y="124" text-anchor="middle" fill="#9CA3AF" font-size="14"
          font-family="ui-sans-serif, system-ui">Current Streak</text>

    <!-- streak “flame” label -->
    <g transform="translate(146,38)">
      <rect x="0" y="0" width="118" height="30" rx="999" fill="#0A0F1A" stroke="#1F2937"/>
      <path d="${flamePath()}" fill="url(#flame)" transform="translate(12,6) scale(0.8)">
        <animate attributeName="opacity" values="0.8;1;0.85;1;0.8" dur="1.6s" repeatCount="indefinite"/>
      </path>
      <text x="40" y="20" fill="#E5E7EB" font-size="12" font-weight="700"
            font-family="ui-sans-serif, system-ui">Streak</text>
    </g>
  </g>

  <!-- RIGHT -->
  <g transform="translate(${rightX},${topY})">
    <text x="0" y="0" fill="#E5E7EB" font-size="38" font-weight="800"
          font-family="ui-sans-serif, system-ui">${longest.toLocaleString("en-US")}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14"
          font-family="ui-sans-serif, system-ui">Longest Streak</text>

    <!-- chart card -->
    <g transform="translate(0,50)">
      <rect x="0" y="0" width="${chartW}" height="${chartH}" rx="14" fill="#0A0F1A" stroke="#1F2937"/>

      <!-- grid -->
      ${grid
        .map(
          (y) =>
            `<line x1="12" y1="${y.toFixed(
              2
            )}" x2="${(chartW - 12).toFixed(
              2
            )}" y2="${y.toFixed(2)}" stroke="#1F2937" opacity="0.55"/>`
        )
        .join("\n")}

      <!-- area -->
      <path d="${areaD}" fill="url(#chartFill)"/>
      <!-- line -->
      <path d="${lineD}" stroke="url(#accent)" stroke-width="2.6" fill="none"/>

      <!-- labels -->
      <text x="14" y="${chartH - 10}" fill="#6B7280" font-size="11" font-family="ui-sans-serif, system-ui">Last 30 days</text>
      <text x="${chartW - 14}" y="18" text-anchor="end" fill="#6B7280" font-size="11" font-family="ui-sans-serif, system-ui">max ${max30}</text>
    </g>
  </g>
</svg>`;
}

async function main() {
  const q = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const data = await graphql(q, { login: username });
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;

  const daily = weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { total, current, longest, lastActive } = streakFromDailyCounts(daily);

  const series30 = daily.slice(-30).map((d) => d.count);
  const max30 = Math.max(1, ...series30);

  const svg = svgCard({
    total,
    current,
    longest,
    lastActive,
    series30,
    max30,
  });

  const outDir = path.join(process.cwd(), "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats-card.svg"), svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
