/** Test helpers: extract the visible text of an HTML email and list its links. */

export function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&zwnj;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

export function textUrls(text) {
  return [...text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
}

/** Decode a quoted-printable body (CRLF line endings) back to a UTF-8 string. */
export function decodeQuotedPrintable(qp) {
  const joined = qp.replace(/=\r\n/g, '');
  const bytes = [];
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    if (c === '=' && /^[0-9A-F]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** Split a .eml produced by toEml into its header block and the decoded text and HTML parts. */
export function parseEml(eml) {
  const idx = eml.indexOf('\r\n\r\n');
  const head = eml.slice(0, idx);
  const body = eml.slice(idx + 4);
  const parts = {};
  const walk = (block, boundary) => {
    const pieces = block.split(`--${boundary}`).slice(1);
    for (const piece of pieces) {
      if (piece.startsWith('--')) break;
      const sep = piece.indexOf('\r\n\r\n');
      const ph = piece.slice(0, sep);
      const pb = piece.slice(sep + 4).replace(/\r\n$/, '');
      const inner = ph.match(/boundary="([^"]+)"/);
      if (inner) walk(pb, inner[1]);
      else if (/Content-Type: text\/plain/.test(ph)) parts.text = decodeQuotedPrintable(pb);
      else if (/Content-Type: text\/html/.test(ph)) parts.html = decodeQuotedPrintable(pb);
    }
  };
  walk(body, head.match(/boundary="([^"]+)"/)[1]);
  return { head, text: parts.text ?? null, html: parts.html ?? null };
}
