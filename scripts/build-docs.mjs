#!/usr/bin/env node
/**
 * Build the documentation site into site/:
 *   site/index.html        → the Kolam Harness app (copied from app/)
 *   site/docs/<page>.html  → rendered markdown documentation
 * Dev-only (uses marked). Zero runtime deps for the app itself.
 */
import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');

// ---------- collect pages ----------
const pages = [
  { file: 'README.md', slug: 'overview', title: 'Overview', blurb: 'What Kolam-JSON is, quick start, the model in one paragraph.' },
  { file: 'SPEC.md', title: 'Specification 1.0', blurb: 'The full normative Kolam-JSON spec: grids, gates, curves, invariants, conformance.' },
  { file: 'docs/api.md', title: 'API Reference', blurb: 'Every public module, function and option of the TypeScript implementation.' },
  { file: 'docs/verification.md', title: 'Verification', blurb: 'What is proven (P1–P8), how, and at what bounds — exhaustive + Z3.' },
  { file: 'docs/research.md', title: 'Research Notes', blurb: 'Annotated bibliography: formal models, traditional practice, prior art.' },
];

const md = (p) => readFileSync(join(ROOT, p), 'utf8');

marked.setOptions({ gfm: true, breaks: false });

// fix relative links/images inside docs for the flat site (docs/foo.md → foo.html etc.)
function relativize(html, sourceFile) {
  return html
    .replaceAll(/href="docs\/([^"#]+?)\.md"/g, 'href="$1.html"')
    .replaceAll(/href="\.\.\/SPEC\.md"/g, 'href="spec.html"')
    .replaceAll(/href="\.\.\/docs\/verification\.md"/g, 'href="verification.html"')
    .replaceAll(/href="\.\.\/docs\/research\.md"/g, 'href="research.html"')
    .replaceAll(/href="(?:\.\/)?docs\/verification\.md"/g, 'href="verification.html"')
    .replaceAll(/href="(?:\.\/)?docs\/research\.md"/g, 'href="research.html"')
    .replaceAll(/href="(?:\.\/)?docs\/api\.md"/g, 'href="api.html"');
}

function renderMarkdown(src) {
  const tokens = marked.lexer(src);
  // drop the first H1 (the shell provides the page title)
  if (tokens[0]?.type === 'heading' && tokens[0].depth === 1) tokens.shift();
  return marked.parser(tokens);
}

function shell(title, active, bodyHtml, extraHead = '') {
  const nav = pages
    .map(
      (p) =>
        `<a class="${p.file === active ? 'active' : ''}" href="${slug(p.file)}.html">${p.title}</a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — Kolam-JSON</title>
<link rel="stylesheet" href="${active ? '../style.css' : 'style.css'}"/>
${extraHead}
</head>
<body>
<header>
  <div class="brand"><a href="${active ? '../' : './'}"><span class="dot"></span>Kolam-JSON</a>
    <span class="sub">sikku kolam · spec, tools &amp; infinite canvas</span></div>
  <nav>${nav}</nav>
</header>
<main>${bodyHtml}</main>
<footer>Kolam-JSON 1.0 · MIT (code) / CC-BY-4.0 (docs) · <a href="https://github.com/LogicIncZo/kolam-json">GitHub</a></footer>
</body>
</html>`;
}

const slug = (file) => basename(file, '.md').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pageSlug = (p) => p.slug ?? slug(p.file);

// ---------- build ----------
mkdirSync(join(SITE, 'docs'), { recursive: true });

// copy the app to the site root (bundle must be built first)
for (const f of ['index.html', 'style.css', 'bundle.js']) {
  copyFileSync(join(ROOT, 'app', f), join(SITE, f));
}

// shared stylesheet
writeFileSync(
  join(SITE, 'docs-style.css'),
  `:root{--bg:#17110c;--panel:#221a12;--line:#3d2f21;--ink:#f0e7d8;--dim:#b9a88f;--accent:#e8b04b;--accent2:#7ec8a9}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:15px/1.65 Georgia,'Iowan Old Style',serif}
header{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:baseline;padding:18px 28px;border-bottom:1px solid var(--line);background:var(--panel)}
.brand{font-size:18px;font-weight:700}.brand a{color:var(--ink);text-decoration:none}
.brand .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:8px}
.brand .sub{color:var(--dim);font-size:13px;font-weight:400;margin-left:10px}
nav a{color:var(--dim);text-decoration:none;margin-right:16px;font-size:14px}
nav a.active,nav a:hover{color:var(--accent)}
main{max-width:880px;margin:0 auto;padding:28px 28px 60px}
h1{font-size:30px;margin:10px 0 4px}h2{border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:36px}
p.blurb{color:var(--dim);margin-top:0}
pre{background:#100c08;border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;font:12.5px/1.5 ui-monospace,Menlo,monospace}
code{font:12.5px ui-monospace,Menlo,monospace;background:#100c08;border-radius:4px;padding:1px 5px}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;font-size:14px}
th{background:var(--panel)}blockquote{border-left:3px solid var(--accent);margin:0;padding:2px 16px;color:var(--dim)}
a{color:var(--accent2)}footer{max-width:880px;margin:0 auto;padding:16px 28px;color:var(--dim);font-size:13px}
hr{border:0;border-top:1px solid var(--line)}`,
);

for (const p of pages) {
  const html = relativize(renderMarkdown(md(p.file)), p.file);
  const slugName = pageSlug(p);
  const out = join(SITE, 'docs', `${slugName}.html`);
  writeFileSync(
    out,
    shell(p.title, p.file, `<h1>${p.title}</h1><p class="blurb">${p.blurb}</p>\n${html}`),
  );
}

// docs index = Overview page at site/docs/index.html
copyFileSync(join(SITE, 'docs', 'overview.html'), join(SITE, 'docs', 'index.html'));

// pretty slugs for stable links
for (const [file, name] of [
  ['SPEC.md', 'spec'],
  ['docs/api.md', 'api'],
  ['docs/verification.md', 'verification'],
  ['docs/research.md', 'research'],
]) {
  copyFileSync(join(SITE, 'docs', `${slug(file)}.html`), join(SITE, 'docs', `${name}.html`));
}

console.log(`docs site → ${SITE} (${pages.length} pages + app)`);
