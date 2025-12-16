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

function svgCard({ total, current, longest, lastActive, series30 }) {
  const W = 960;
  const H = 240;
  const pad = 14;
  const r = 20;

  const dividerLeft = 320;
  const dividerRight = 640;

  const leftX = 52;
  const rightX = 668;

  const ringGroupX = 360;
  const ringGroupY = 52;

  const ringCX = 90;
  const ringCY = 74;
  const ringR = 48;
  const ringStroke = 10;

  const ringCirc = 2 * Math.PI * ringR;
  const denom = Math.max(1, longest, current);
  const ratio = clamp(current / denom, 0, 1);
  const dash = `${(ratio * ringCirc).toFixed(2)} ${ringCirc.toFixed(2)}`;

  const chipR = 14;
  const chartR = 14;

  const chartW = 262;
  const chartH = 92;
  const chartPad = 12;

  const { lineD, areaD, max: max30 } = areaPath(series30, chartW, chartH, chartPad);

  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = chartPad + ((chartH - chartPad * 2) * i) / gridLines;
    return y;
  });

  const lastActiveText = lastActive ? fmtISO(lastActive) : "-";

  const streakTitle = `${current}-day commit streak`;
  const streakDesc = `Coding consistently for ${current} days in a row.`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub pro stats card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#070B14"/>
      <stop offset="1" stop-color="#0B1220"/>
    </linearGradient>

    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#60A5FA"/>
      <stop offset="0.55" stop-color="#A78BFA"/>
      <stop offset="1" stop-color="#34D399"/>
    </linearGradient>

    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#60A5FA" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
    </linearGradient>

    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.22"/>
    </filter>
  </defs>

  <rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}"
        rx="${r}" fill="url(#bg)" stroke="#1F2937" filter="url(#softShadow)"/>

  <path d="M${W - 320} ${pad} L${W - 120} ${pad} L${W - 40} ${H - pad} L${W - 240} ${H - pad} Z"
        fill="url(#accent)" opacity="0.06"/>

  <line x1="${dividerLeft}" y1="52" x2="${dividerLeft}" y2="188" stroke="#1F2937"/>
  <line x1="${dividerRight}" y1="52" x2="${dividerRight}" y2="188" stroke="#1F2937"/>

  <g transform="translate(${leftX},64)">
    <text x="0" y="0" fill="#E5E7EB" font-size="38" font-weight="750"
          font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${total.toLocaleString("en-US")}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14"
          font-family="ui-sans-serif, system-ui">Total contributions</text>

    <g transform="translate(0,68)">
      <rect x="0" y="0" width="268" height="36" rx="${chipR}" fill="#0A0F1A" stroke="#1F2937"/>
      <text x="14" y="23" fill="#9CA3AF" font-size="12" font-family="ui-sans-serif, system-ui">Last active</text>
      <text x="98" y="23" fill="#E5E7EB" font-size="12" font-weight="650" font-family="ui-sans-serif, system-ui">${lastActiveText}</text>
    </g>

    <text x="0" y="150" fill="#6B7280" font-size="12" font-family="ui-sans-serif, system-ui">
      Auto-updated via GitHub Actions
    </text>
  </g>

  <g transform="translate(${ringGroupX},${ringGroupY})">
    <circle cx="${ringCX}" cy="${ringCY}" r="${ringR}" stroke="#1F2937" stroke-width="${ringStroke}"/>
    <circle cx="${ringCX}" cy="${ringCY}" r="${ringR}" stroke="url(#accent)" stroke-width="${ringStroke}"
      stroke-linecap="round" stroke-dasharray="${dash}"
      transform="rotate(-90 ${ringCX} ${ringCY})"/>

    <text x="${ringCX}" y="${ringCY + 10}" text-anchor="middle" fill="#E5E7EB"
      font-size="36" font-weight="800" font-family="ui-sans-serif, system-ui">${current}</text>

    <text x="${ringCX}" y="${ringCY + 58}" text-anchor="middle" fill="#9CA3AF"
      font-size="14" font-family="ui-sans-serif, system-ui">${streakTitle}</text>

    <text x="${ringCX}" y="${ringCY + 78}" text-anchor="middle" fill="#6B7280"
      font-size="12" font-family="ui-sans-serif, system-ui">${streakDesc}</text>
  </g>

  <g transform="translate(${rightX},64)">
    <text x="0" y="0" fill="#E5E7EB" font-size="38" font-weight="750"
          font-family="ui-sans-serif, system-ui">${longest.toLocaleString("en-US")}</text>
    <text x="0" y="28" fill="#9CA3AF" font-size="14"
          font-family="ui-sans-serif, system-ui">Longest streak</text>

    <g transform="translate(0,56)">
      <rect x="0" y="0" width="${chartW}" height="${chartH}" rx="${chartR}" fill="#0A0F1A" stroke="#1F2937"/>

      ${gridYs
        .map(
          (y) =>
            `<line x1="${chartPad}" y1="${y.toFixed(
              2
            )}" x2="${(chartW - chartPad).toFixed(
              2
            )}" y2="${y.toFixed(2)}" stroke="#1F2937" opacity="0.55"/>`
        )
        .join("\n")}

      <path d="${areaD}" fill="url(#chartFill)"/>
      <path d="${lineD}" stroke="url(#accent)" stroke-width="2.6" fill="none"/>

      <text x="${chartPad}" y="${chartH - 10}" fill="#6B7280" font-size="11" font-family="ui-sans-serif, system-ui">Last 30 days</text>
      <text x="${chartW - chartPad}" y="18" text-anchor="end" fill="#6B7280" font-size="11" font-family="ui-sans-serif, system-ui">max ${max30}</text>
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

  const svg = svgCard({ total, current, longest, lastActive, series30 });

  const outDir = path.join(process.cwd(), "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats-card.svg"), svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
