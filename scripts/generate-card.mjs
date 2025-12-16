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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtISO(dateStr) {
  return dateStr || "-";
}

function compact(n) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
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

async function sumStars() {
  let stars = 0;
  let cursor = null;

  while (true) {
    const q = `
      query($login: String!, $cursor: String) {
        user(login: $login) {
          repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false) {
            nodes { stargazerCount }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    `;
    const data = await graphql(q, { login: username, cursor });
    const conn = data.user.repositories;
    for (const r of conn.nodes) stars += r.stargazerCount || 0;
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return stars;
}

function iconPath(kind) {
  if (kind === "star") return "M12 2.2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7 6.1 20.2l1.2-6.5-4.8-4.6 6.6-.9L12 2.2z";
  if (kind === "commit") return "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm-7 0h4m8 0h8";
  if (kind === "pr") return "M6 4v16m0-13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm6-14h6a2 2 0 0 1 2 2v7m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z";
  if (kind === "issue") return "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6v6m0 4h.01";
  return "M4 6h16M4 10h16M4 14h16M4 18h16";
}

function svgCard({
  total,
  current,
  longest,
  lastActive,
  series30,
  stars,
  commits,
  prs,
  issues,
  contributedTo,
}) {
  const W = 1080;
  const H = 260;
  const pad = 14;
  const r = 20;

  const leftDivider = 430;
  const rightDivider = 750;

  const leftColX = 48;
  const leftTopY = 58;

  const chartW = 340;
  const chartH = 96;
  const chartPad = 12;
  const { lineD, areaD, max: max30 } = areaPath(series30, chartW, chartH, chartPad);

  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = chartPad + ((chartH - chartPad * 2) * i) / gridLines;
    return y;
  });

  const ringR = 52;
  const ringStroke = 10;
  const ringCirc = 2 * Math.PI * ringR;
  const denom = Math.max(1, longest, current);
  const ratio = clamp(current / denom, 0, 1);
  const dash = `${(ratio * ringCirc).toFixed(2)} ${ringCirc.toFixed(2)}`;

  const midCenterX = (leftDivider + rightDivider) / 2;
  const midCenterY = 118;

  const streakTitle = `${current}-day commit streak`;
  const streakDesc = `Coding consistently for ${current} days in a row.`;

  const lastActiveText = lastActive ? fmtISO(lastActive) : "-";

  const listX = rightDivider + 26;
  const listY = 58;
  const rowH = 36;

  const rows = [
    { icon: "star", label: "Total Stars:", value: compact(stars) },
    { icon: "commit", label: "Total Commits:", value: compact(commits) },
    { icon: "pr", label: "Total PRs:", value: compact(prs) },
    { icon: "issue", label: "Total Issues:", value: compact(issues) },
    { icon: "list", label: "Contributed to:", value: compact(contributedTo) },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats card">
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

  <path d="M${W - 360} ${pad} L${W - 140} ${pad} L${W - 40} ${H - pad} L${W - 260} ${H - pad} Z"
        fill="url(#accent)" opacity="0.06"/>

  <line x1="${leftDivider}" y1="52" x2="${leftDivider}" y2="${H - 52}" stroke="#1F2937"/>
  <line x1="${rightDivider}" y1="52" x2="${rightDivider}" y2="${H - 52}" stroke="#1F2937"/>

  <g transform="translate(${leftColX},${leftTopY})">
    <g>
      <rect x="0" y="0" width="${chartW}" height="${chartH}" rx="14" fill="#0A0F1A" stroke="#1F2937"/>
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

    <g transform="translate(0,134)">
      <text x="0" y="0" fill="#E5E7EB" font-size="30" font-weight="800"
            font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto">${total.toLocaleString("en-US")}</text>

      <text x="112" y="0" fill="#9CA3AF" font-size="14" font-weight="600"
            font-family="ui-sans-serif, system-ui">Total contributions</text>

      <text x="0" y="30" fill="#6B7280" font-size="12" font-family="ui-sans-serif, system-ui">Last active</text>
      <text x="74" y="30" fill="#E5E7EB" font-size="12" font-weight="650" font-family="ui-sans-serif, system-ui">${lastActiveText}</text>
    </g>
  </g>

  <g>
    <circle cx="${midCenterX}" cy="${midCenterY - 10}" r="${ringR}" stroke="#1F2937" stroke-width="${ringStroke}"/>
    <circle cx="${midCenterX}" cy="${midCenterY - 10}" r="${ringR}" stroke="url(#accent)" stroke-width="${ringStroke}"
      stroke-linecap="round" stroke-dasharray="${dash}"
      transform="rotate(-90 ${midCenterX} ${midCenterY - 10})"/>

    <text x="${midCenterX}" y="${midCenterY + 6}" text-anchor="middle" fill="#E5E7EB"
      font-size="40" font-weight="850" font-family="ui-sans-serif, system-ui">${current}</text>

    <text x="${midCenterX}" y="${midCenterY + 64}" text-anchor="middle" fill="#9CA3AF"
      font-size="14" font-family="ui-sans-serif, system-ui">${streakTitle}</text>

    <text x="${midCenterX}" y="${midCenterY + 84}" text-anchor="middle" fill="#6B7280"
      font-size="12" font-family="ui-sans-serif, system-ui">${streakDesc}</text>
  </g>

  <g transform="translate(${listX},${listY})">
    ${rows
      .map((row, idx) => {
        const y = idx * rowH;
        const isStar = row.icon === "star";
        const icon = row.icon === "list" ? "list" : row.icon;
        const p = iconPath(icon);
        const iconSvg =
          isStar
            ? `<path d="${p}" fill="#22C55E" opacity="0.95"/>`
            : `<path d="${p}" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;

        return `
        <g transform="translate(0,${y})">
          <g transform="translate(0,-16)">
            <svg x="0" y="0" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${iconSvg}
            </svg>
          </g>
          <text x="32" y="0" fill="#22C55E" font-size="15.5" font-weight="650" font-family="ui-sans-serif, system-ui">${row.label}</text>
          <text x="196" y="0" fill="#86EFAC" font-size="15.5" font-weight="850" font-family="ui-sans-serif, system-ui">${row.value}</text>
        </g>`;
      })
      .join("\n")}
  </g>
</svg>`;
}

async function main() {
  const q = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalRepositoriesWithContributedCommits
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

  const calWeeks = data.user.contributionsCollection.contributionCalendar.weeks;
  const daily = calWeeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { total, current, longest, lastActive } = streakFromDailyCounts(daily);

  const series30 = daily.slice(-30).map((d) => d.count);

  const commits = data.user.contributionsCollection.totalCommitContributions || 0;
  const prs = data.user.contributionsCollection.totalPullRequestContributions || 0;
  const issues = data.user.contributionsCollection.totalIssueContributions || 0;
  const contributedTo = data.user.contributionsCollection.totalRepositoriesWithContributedCommits || 0;

  const stars = await sumStars();

  const svg = svgCard({
    total,
    current,
    longest,
    lastActive,
    series30,
    stars,
    commits,
    prs,
    issues,
    contributedTo,
  });

  const outDir = path.join(process.cwd(), "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stats-card.svg"), svg, "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
