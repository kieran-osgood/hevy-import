import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildHalfMarathonPlan } from "./programs/half-marathon.js";
import { buildPowerliftingPlan, POWERLIFTING_CONFIGS } from "./programs/powerlifting.js";
import {
  buildDryRunExerciseMapping,
  writeDryRunHtmlReport,
} from "./programs/sync.js";
import type { RoutinePlan } from "./types.js";

const SITE_DIR = "dist/site";

interface SiteProgram {
  slug: string;
  title: string;
  description: string;
  buildPlan: () => Promise<RoutinePlan>;
}

const programs: SiteProgram[] = [
  {
    slug: "powerlifting",
    title: "Powerlifting Program",
    description: "Current powerlifting phase, rendered as planned Hevy routines.",
    buildPlan: () => buildPowerliftingPlan(null, POWERLIFTING_CONFIGS.powerlifting),
  },
  {
    slug: "half-marathon",
    title: "Half Marathon Program",
    description: "40-week half marathon running plan with warmup and cooldown protocols.",
    buildPlan: () => buildHalfMarathonPlan(null),
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildIndexHtml(items: Array<SiteProgram & { href: string }>): string {
  const generatedAt = new Date().toLocaleString();
  const cards = items
    .map(
      (item) => `<a class="card" href="${escapeHtml(item.href)}">
        <span>Open plan</span>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.description)}</p>
      </a>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Training Plans</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7fb; --panel:#ffffff; --text:#172033; --muted:#64748b; --border:#d9e1ee; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    header { padding: 44px 28px 36px; background: linear-gradient(135deg, #0f172a, #1e3a8a); color: white; }
    header div, main { max-width: 980px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: clamp(32px, 6vw, 56px); }
    header p { margin: 0; opacity: .86; }
    main { padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
    .card { display: block; padding: 22px; color: inherit; text-decoration: none; background: var(--panel); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06); }
    .card:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.10); }
    .card span { color: #3730a3; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; }
    .card h2 { margin: 10px 0 8px; }
    .card p, footer { color: var(--muted); }
    footer { text-align: center; padding: 18px; }
  </style>
</head>
<body>
  <header><div>
    <h1>Training Plans</h1>
    <p>Static previews of the current active routines. Generated ${escapeHtml(generatedAt)}.</p>
  </div></header>
  <main><div class="grid">${cards}</div></main>
  <footer>Static preview only — no writes to Hevy.</footer>
</body>
</html>`;
}

async function main() {
  const outputDir = resolve(SITE_DIR);
  await mkdir(outputDir, { recursive: true });

  const indexItems: Array<SiteProgram & { href: string }> = [];

  for (const program of programs) {
    console.log(`Building ${program.title}...`);
    const plan = await program.buildPlan();
    const mapping = await buildDryRunExerciseMapping(plan);
    await writeDryRunHtmlReport(plan, mapping, {
      outputDir,
      fileName: `${program.slug}.html`,
      titlePrefix: "Training Plan",
      footerHtml: `Static preview generated for GitHub Pages. <a href="./">Back to all plans</a>.`,
    });
    indexItems.push({ ...program, href: `${program.slug}.html` });
  }

  await writeFile(resolve(outputDir, "index.html"), buildIndexHtml(indexItems), "utf8");
  console.log(`Built GitHub Pages site in ${outputDir}`);
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
