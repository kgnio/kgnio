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

  return { total, current, longest };
}

function sparklinePath(values, width, height, pad = 8) {
  const max = Math.max(1, ...values);
  const min = 0;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = values.map((v, idx) => {
    const x = pad + (w * idx) / (values.length - 1);
    const y = pad + h - (h * (v - min)) / (max - min);
    return [x, y];
  });

  return pts
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
    )
    .join(" ");
}

function svgCard({ total, current, longest, series }) {
  const W = 900;
  const H = 220;

  const pad = 10;
  const radius = 18;

  const colLeftX = 48;
  const colMidX = 340; 
  const colRightX = 640;

  const topY = 62;

  const ringR = 44;
  const ringStroke = 10;

  const sparkW = 220; 
  const sparkH = 52;
  const sparkD = sparklinePath(series, sparkW, sparkH, 6);

  const ringCirc = 2 * Math.PI * ringR;
  const ratio =
    Math.min(1, current / Math.max(1, longest || current || 1)) || 0;
  const dash = `${(ratio * ringCirc).toFixed(2)} ${ringCirc.toFixed(2)}`;

  const divTop = 44;
  const divBottom = 176;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1220"/>
      <stop offset="1" stop-color="#0A0F1A"/>
    </linearGradient>

    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#60A5FA"/>
      <stop offset="1" stop-color="#A78BFA"/>
    </linearGradient>

    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${
    H - pad * 2
  }" rx="${radius}" fill="url(#bg)" stroke="#1F2937" filter="url(#shadow)"/>

  <!-- Left: Total -->
  <g transform="translate(${colLeftX},${topY})">
    <text x="0" y="0" fill="#93C5FD" font-size="32" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${total.toLocaleString(
      "en-US"
    )}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14" font-family="ui-sans-serif, system-ui">Total Contributions</text>
  </g>

  <!-- Middle: Ring -->
  <g transform="translate(${colMidX},50)">
    <circle cx="56" cy="56" r="${ringR}" stroke="#1F2937" stroke-width="${ringStroke}"/>
    <circle cx="56" cy="56" r="${ringR}" stroke="url(#accent)" stroke-width="${ringStroke}" stroke-linecap="round"
      stroke-dasharray="${dash}"
      transform="rotate(-90 56 56)"/>
    <text x="56" y="62" text-anchor="middle" fill="#E5E7EB" font-size="28" font-weight="700"
      font-family="ui-sans-serif, system-ui">${current}</text>
    <text x="56" y="94" text-anchor="middle" fill="#9CA3AF" font-size="14"
      font-family="ui-sans-serif, system-ui">Current Streak</text>
  </g>

  <!-- Dividers -->
  <line x1="300" y1="${divTop}" x2="300" y2="${divBottom}" stroke="#1F2937"/>
  <line x1="600" y1="${divTop}" x2="600" y2="${divBottom}" stroke="#1F2937"/>

  <!-- Right: Longest + Sparkline -->
  <g transform="translate(${colRightX},${topY})">
    <text x="0" y="0" fill="#93C5FD" font-size="32" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${longest.toLocaleString(
      "en-US"
    )}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14" font-family="ui-sans-serif, system-ui">Longest Streak</text>

    <g transform="translate(0,52)">
      <rect x="0" y="0" width="${sparkW}" height="${sparkH}" rx="12" fill="#0B1220" stroke="#1F2937"/>
      <path d="${sparkD}" stroke="url(#accent)" stroke-width="2.6" fill="none"/>
    </g>
  </g>

  <!-- Footer badge -->
  <g transform="translate(48,178)">
    <rect x="0" y="0" rx="999" ry="999" width="220" height="30" fill="#0B1220" stroke="#1F2937"/>
    <text x="14" y="20" fill="#9CA3AF" font-size="12" font-family="ui-sans-serif, system-ui">Auto-updated via GitHub Actions</text>
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

  const { total, current, longest } = streakFromDailyCounts(daily);
  const last30 = daily.slice(-30).map((d) => d.count);

  const svg = svgCard({ total, current, longest, series: last30 });

  const outDir = path.join(process.cwd(), "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats-card.svg"), svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
