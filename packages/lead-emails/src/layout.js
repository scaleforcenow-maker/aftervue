/**
 * Shared layout. A template produces a small content model (heading, blocks,
 * "why you received this" line) and this module turns it into:
 *
 *   - table-based HTML with every style inlined, 600 px max width, with a
 *     dark-mode override block in <head> for clients that honour
 *     prefers-color-scheme (Apple Mail, iOS Mail, Outlook for Mac/iOS);
 *   - a plain-text part built from the same content model, so the two parts
 *     never drift.
 *
 * Brand: plum #1B0F2E, gold #C9A24B, porcelain #F8F4EF, white cards.
 * Cormorant Garamond (fallback Georgia) for headings, Inter (fallback system
 * sans) for body. Gold is used for rules, borders and the eyebrow only, never
 * for small text on white, because the contrast ratio is too low.
 */

import { escapeHtml } from './util.js';

export const BRAND = {
  plum: '#1B0F2E',
  plumSoft: '#4A3D5E',
  gold: '#C9A24B',
  goldDark: '#8A6A22',
  porcelain: '#F8F4EF',
  white: '#FFFFFF',
  rule: '#E8E0D6',
  // Dark-mode palette (used by the media query only).
  darkPage: '#120A1F',
  darkCard: '#241737',
  darkText: '#F3EDE4',
  darkMuted: '#C9BFB3',
  darkRule: '#3B2C52'
};

export const FONT_HEADING = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
export const FONT_BODY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const SUPPORT_ALIAS = 'support@getaftervue.com';
export const HELLO_ALIAS = 'hello@getaftervue.com';
export const DEFAULT_LOGO_SRC = 'cid:aftervue-mark';

const WIDTH = 600;

const bodyText = `font-family:${FONT_BODY};font-size:16px;line-height:24px;color:${BRAND.plum};`;
const mutedText = `font-family:${FONT_BODY};font-size:13px;line-height:20px;color:${BRAND.plumSoft};`;

function headCss() {
  return `
    body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { color:${BRAND.plum}; }
    @media only screen and (max-width: 620px) {
      .av-container { width:100% !important; max-width:100% !important; }
      .av-card { padding:24px 20px !important; }
      .av-outer { padding:16px 8px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .av-page { background-color:${BRAND.darkPage} !important; }
      .av-card { background-color:${BRAND.darkCard} !important; }
      .av-text, .av-text a, .av-h1, .av-cell, .av-logo { color:${BRAND.darkText} !important; }
      .av-muted, .av-muted a { color:${BRAND.darkMuted} !important; }
      .av-eyebrow { color:${BRAND.gold} !important; }
      .av-rule { border-color:${BRAND.darkRule} !important; }
      .av-btn { background-color:${BRAND.gold} !important; border-color:${BRAND.gold} !important; }
      .av-btn a { color:${BRAND.plum} !important; }
    }
    [data-ogsb] body, [data-ogsb] .av-page { background-color:${BRAND.darkPage} !important; }
    [data-ogsb] .av-card { background-color:${BRAND.darkCard} !important; }
    [data-ogsb] .av-btn { background-color:${BRAND.gold} !important; border-color:${BRAND.gold} !important; }
    [data-ogsc] .av-text, [data-ogsc] .av-text a, [data-ogsc] .av-h1, [data-ogsc] .av-cell, [data-ogsc] .av-logo { color:${BRAND.darkText} !important; }
    [data-ogsc] .av-muted, [data-ogsc] .av-muted a { color:${BRAND.darkMuted} !important; }
    [data-ogsc] .av-eyebrow { color:${BRAND.gold} !important; }
    [data-ogsc] .av-btn a { color:${BRAND.plum} !important; }
  `.replace(/\n\s+/g, '\n');
}

function preheaderHtml(preheader) {
  // Zero-width padding keeps clients from pulling body copy into the preview line.
  const pad = '&nbsp;&zwnj;'.repeat(40);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${BRAND.porcelain};">${escapeHtml(preheader)}${pad}</div>`;
}

function paragraph(text, { muted = false } = {}) {
  const style = muted ? mutedText : bodyText;
  const cls = muted ? 'av-muted' : 'av-text';
  return `<p class="${cls}" style="margin:0 0 16px 0;${style}">${escapeHtml(text)}</p>`;
}

function button(label, url) {
  const safeUrl = escapeHtml(url);
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;">
  <tr>
    <td class="av-btn" align="center" bgcolor="${BRAND.plum}" style="border-radius:6px;background-color:${BRAND.plum};border:1px solid ${BRAND.gold};">
      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT_BODY};font-size:15px;font-weight:600;line-height:20px;color:${BRAND.white};text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function linkLine(label, url) {
  const safeUrl = escapeHtml(url);
  return `<p class="av-muted" style="margin:0 0 16px 0;${mutedText}">${escapeHtml(label)}<br><a href="${safeUrl}" target="_blank" style="color:${BRAND.plumSoft};text-decoration:underline;word-break:break-all;">${safeUrl}</a></p>`;
}

function facts(rows) {
  const cells = rows
    .map(
      ([k, v]) => `
    <tr>
      <td class="av-muted av-rule" width="40%" valign="top" style="padding:8px 12px 8px 0;${mutedText}border-bottom:1px solid ${BRAND.rule};">${escapeHtml(k)}</td>
      <td class="av-cell av-rule" valign="top" style="padding:8px 0;${bodyText}font-size:15px;line-height:22px;border-bottom:1px solid ${BRAND.rule};">${escapeHtml(v)}</td>
    </tr>`
    )
    .join('');
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;">${cells}
</table>`;
}

function table(columns, rows, { align = [] } = {}) {
  const head = columns
    .map(
      (c, i) => `
      <th class="av-muted av-rule" align="${align[i] || 'left'}" style="padding:0 0 8px 0;${mutedText}font-weight:600;text-transform:uppercase;letter-spacing:0.04em;font-size:11px;border-bottom:1px solid ${BRAND.gold};">${escapeHtml(c)}</th>`
    )
    .join('');
  const body = rows
    .map(
      (r) => `
    <tr>${r
        .map(
          (cell, i) => `
      <td class="av-cell av-rule" align="${align[i] || 'left'}" style="padding:8px 0;${bodyText}font-size:15px;line-height:22px;border-bottom:1px solid ${BRAND.rule};">${escapeHtml(cell)}</td>`
        )
        .join('')}
    </tr>`
    )
    .join('');
  return `
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;">
  <thead>
    <tr>${head}
    </tr>
  </thead>
  <tbody>${body}
  </tbody>
</table>`;
}

function renderBlockHtml(block) {
  switch (block.type) {
    case 'p':
      return paragraph(block.text);
    case 'note':
      return paragraph(block.text, { muted: true });
    case 'button':
      return button(block.label, block.url);
    case 'link':
      return linkLine(block.label, block.url);
    case 'facts':
      return facts(block.rows);
    case 'table':
      return table(block.columns, block.rows, { align: block.align });
    default:
      throw new Error(`Unknown block type "${block.type}"`);
  }
}

function padEnd(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function renderBlockText(block) {
  switch (block.type) {
    case 'p':
    case 'note':
      return block.text;
    case 'button':
      return `${block.label}:\n${block.url}`;
    case 'link':
      return `${block.label}\n${block.url}`;
    case 'facts': {
      const w = Math.max(...block.rows.map(([k]) => k.length)) + 2;
      return block.rows.map(([k, v]) => `${padEnd(k + ':', w)}${v}`).join('\n');
    }
    case 'table': {
      const widths = block.columns.map((c, i) =>
        Math.max(c.length, ...block.rows.map((r) => String(r[i]).length))
      );
      const line = (cells) => cells.map((c, i) => padEnd(String(c), widths[i])).join('  ').trimEnd();
      const sep = widths.map((w) => '-'.repeat(w)).join('  ');
      return [line(block.columns), sep, ...block.rows.map(line)].join('\n');
    }
    default:
      throw new Error(`Unknown block type "${block.type}"`);
  }
}

/**
 * @param {object} content
 * @param {string} content.subject
 * @param {string} content.preheader
 * @param {string} [content.eyebrow]      small label above the heading
 * @param {string} content.heading
 * @param {Array}  content.blocks         see renderBlockHtml for block types
 * @param {string} content.why            "why you received this" line
 * @param {object} opts
 * @param {string} opts.logoSrc           cid: or https: reference to the AfterVue mark
 * @param {string} opts.manageNotificationsUrl
 * @param {string} [opts.supportAlias]
 */
export function renderHtml(content, opts) {
  const logoSrc = opts.logoSrc || DEFAULT_LOGO_SRC;
  const support = escapeHtml(opts.supportAlias || SUPPORT_ALIAS);
  const eyebrow = content.eyebrow
    ? `<p class="av-eyebrow" style="margin:0 0 12px 0;${mutedText}font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.goldDark};">${escapeHtml(content.eyebrow)}</p>`
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.subject)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table, td, p, a { font-family: Arial, Helvetica, sans-serif !important; } h1 { font-family: Georgia, 'Times New Roman', serif !important; }</style>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Inter:wght@400;600&display=swap" rel="stylesheet" type="text/css">
<!--<![endif]-->
<style type="text/css">${headCss()}</style>
</head>
<body class="av-page" style="margin:0;padding:0;background-color:${BRAND.porcelain};" bgcolor="${BRAND.porcelain}">
${preheaderHtml(content.preheader)}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="av-page" bgcolor="${BRAND.porcelain}" style="background-color:${BRAND.porcelain};">
  <tr>
    <td class="av-outer" align="center" valign="top" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${WIDTH}"><tr><td><![endif]-->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${WIDTH}" class="av-container" style="width:${WIDTH}px;max-width:${WIDTH}px;">
        <tr>
          <td align="left" style="padding:0 0 20px 4px;">
            <a class="av-logo" href="https://getaftervue.com" target="_blank" style="text-decoration:none;font-family:${FONT_HEADING};font-size:22px;font-weight:600;color:${BRAND.plum};">
              <img src="${escapeHtml(logoSrc)}" width="132" height="32" alt="AfterVue" style="display:block;width:132px;height:32px;font-family:${FONT_HEADING};font-size:22px;font-weight:600;color:${BRAND.plum};">
            </a>
          </td>
        </tr>
        <tr>
          <td class="av-card" bgcolor="${BRAND.white}" style="background-color:${BRAND.white};border-radius:10px;padding:36px 40px 20px 40px;border-top:3px solid ${BRAND.gold};">
            ${eyebrow}
            <h1 class="av-h1" style="margin:0 0 20px 0;font-family:${FONT_HEADING};font-size:30px;line-height:36px;font-weight:600;color:${BRAND.plum};">${escapeHtml(content.heading)}</h1>
            ${content.blocks.map(renderBlockHtml).join('\n')}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0 8px;">
            <p class="av-muted" style="margin:0 0 10px 0;${mutedText}font-size:12px;line-height:18px;">${escapeHtml(content.why)}</p>
            <p class="av-muted" style="margin:0 0 10px 0;${mutedText}font-size:12px;line-height:18px;">
              <a href="${escapeHtml(opts.manageNotificationsUrl)}" target="_blank" style="color:${BRAND.plumSoft};text-decoration:underline;">Manage notifications</a>
              &nbsp;&middot;&nbsp;
              Questions: <a href="mailto:${support}" style="color:${BRAND.plumSoft};text-decoration:underline;">${support}</a>
            </p>
            <p class="av-muted" style="margin:0;${mutedText}font-size:12px;line-height:18px;">This message was sent by AfterVue. It contains no patient details.</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>
`;
}

export function renderText(content, opts) {
  const support = opts.supportAlias || SUPPORT_ALIAS;
  const parts = [];
  parts.push('AfterVue');
  parts.push('');
  if (content.eyebrow) parts.push(content.eyebrow.toUpperCase());
  parts.push(content.heading);
  parts.push('='.repeat(Math.min(content.heading.length, 60)));
  parts.push('');
  for (const block of content.blocks) {
    parts.push(renderBlockText(block));
    parts.push('');
  }
  parts.push('--');
  parts.push(content.why);
  parts.push(`Manage notifications: ${opts.manageNotificationsUrl}`);
  parts.push(`Questions: ${support}`);
  parts.push('This message was sent by AfterVue. It contains no patient details.');
  return parts.join('\n') + '\n';
}
