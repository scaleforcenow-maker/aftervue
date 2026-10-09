#!/usr/bin/env node
/**
 * Renders every template with its fixture and writes:
 *   <dest>/index.html            one page showing all templates (iframes + text part)
 *   <dest>/<template>.html       the HTML part
 *   <dest>/<template>.txt        the plain-text part
 *   <dest>/assets/aftervue-mark.svg
 *
 * Default dest is out/ (gitignored). `--dest previews` refreshes the committed set.
 * `--utm` adds UTM parameters so reviewers can see decorated links.
 */

import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, listTemplates } from '../src/index.js';
import { fixtures } from '../fixtures/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = process.argv.slice(2);
const destArg = args.includes('--dest') ? args[args.indexOf('--dest') + 1] : 'out';
const utm = args.includes('--utm');
const dest = path.resolve(root, destArg);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

await mkdir(path.join(dest, 'assets'), { recursive: true });
await copyFile(path.join(root, 'assets', 'aftervue-mark.svg'), path.join(dest, 'assets', 'aftervue-mark.svg'));

const cards = [];
for (const { name, description, guardPii } of listTemplates()) {
  const out = render(name, fixtures[name], { utm, logoSrc: 'assets/aftervue-mark.svg' });
  await writeFile(path.join(dest, `${name}.html`), out.html, 'utf8');
  await writeFile(path.join(dest, `${name}.txt`), out.text, 'utf8');
  cards.push({ name, description, guardPii, subject: out.subject, preheader: out.preheader, text: out.text });
  console.log(`rendered ${name} (${out.subject.length}-char subject)`);
}

const nav = cards.map((c) => `<li><a href="#${c.name}">${esc(c.name)}</a></li>`).join('');
const sections = cards
  .map(
    (c) => `
<section id="${c.name}">
  <header>
    <h2>${esc(c.name)}</h2>
    <p class="desc">${esc(c.description)}${c.guardPii ? ' <span class="pill">PII guard</span>' : ''}</p>
    <dl>
      <dt>Subject</dt><dd>${esc(c.subject)} <span class="len">${c.subject.length} chars</span></dd>
      <dt>Preheader</dt><dd>${esc(c.preheader)} <span class="len">${c.preheader.length} chars</span></dd>
    </dl>
  </header>
  <div class="panes">
    <div class="pane">
      <div class="pane-title">HTML part <a href="${c.name}.html" target="_blank">open</a></div>
      <iframe src="${c.name}.html" title="${esc(c.name)} HTML preview" loading="lazy"></iframe>
    </div>
    <div class="pane">
      <div class="pane-title">Plain-text part <a href="${c.name}.txt" target="_blank">open</a></div>
      <pre>${esc(c.text)}</pre>
    </div>
  </div>
</section>`
  )
  .join('\n');

const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>AfterVue lead emails, preview</title>
<style>
  :root { color-scheme: light dark; --plum:#1B0F2E; --gold:#C9A24B; --porcelain:#F8F4EF; --card:#fff; --text:#1B0F2E; --muted:#4A3D5E; --rule:#E8E0D6; }
  @media (prefers-color-scheme: dark) { :root { --porcelain:#120A1F; --card:#241737; --text:#F3EDE4; --muted:#C9BFB3; --rule:#3B2C52; } }
  body { margin:0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background:var(--porcelain); color:var(--text); }
  .wrap { max-width:1400px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-family: "Cormorant Garamond", Georgia, serif; font-weight:600; font-size:34px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 16px; font-size:14px; }
  nav ul { list-style:none; padding:0; margin:0 0 24px; display:flex; flex-wrap:wrap; gap:8px; }
  nav a { display:inline-block; padding:6px 10px; border:1px solid var(--rule); border-radius:999px; font-size:13px; color:var(--text); text-decoration:none; background:var(--card); }
  section { background:var(--card); border-top:3px solid var(--gold); border-radius:10px; padding:20px; margin:0 0 24px; }
  h2 { font-family: "Cormorant Garamond", Georgia, serif; font-weight:600; font-size:26px; margin:0 0 4px; }
  .desc { margin:0 0 10px; color:var(--muted); font-size:14px; }
  .pill { font-size:11px; letter-spacing:.04em; text-transform:uppercase; background:var(--gold); color:var(--plum); padding:2px 8px; border-radius:999px; margin-left:6px; }
  dl { display:grid; grid-template-columns:max-content 1fr; gap:4px 12px; margin:0 0 16px; font-size:14px; }
  dt { color:var(--muted); } dd { margin:0; }
  .len { color:var(--muted); font-size:12px; margin-left:6px; }
  .panes { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width: 1000px) { .panes { grid-template-columns:1fr; } }
  .pane-title { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 6px; }
  .pane-title a { color:var(--muted); margin-left:8px; }
  iframe { width:100%; height:760px; border:1px solid var(--rule); border-radius:6px; background:#F8F4EF; }
  pre { margin:0; padding:16px; border:1px solid var(--rule); border-radius:6px; background:var(--porcelain); font-size:12.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; min-height:200px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>AfterVue lead emails</h1>
  <p class="sub">Rendered from fixtures${utm ? ' with UTM parameters' : ''}. Every name is a placeholder. See docs/email-client-checklist.md for the client matrix.</p>
  <nav><ul>${nav}</ul></nav>
  ${sections}
</div>
</body>
</html>
`;
await writeFile(path.join(dest, 'index.html'), index, 'utf8');
console.log(`wrote ${path.relative(root, path.join(dest, 'index.html'))}`);
