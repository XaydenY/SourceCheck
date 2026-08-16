// src/routes/api/extract/+server.js
//
// Server-side endpoint that fetches an article URL and extracts
// readable text content. This avoids CORS issues since the fetch
// happens on the server.
//
// POST { url: string }
// → { text: string, title: string | null, error?: string }

import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format and normalize (auto-prepend https:// if missing)
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      return json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return json({ error: 'Only http and https URLs are supported' }, { status: 400 });
    }

    // Fetch the page
    const response = await fetch(normalized, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SourceCheck/1.0; +https://sourcecheck.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch article: HTTP ${response.status}` }, { status: 502 });
    }

    // Only attempt to parse HTML/XML/text responses — skip PDFs, images, etc.
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml|text\/xml|text\/plain/i.test(contentType)) {
      return json({ error: `This URL is not a readable web page (content type: ${contentType || 'unknown'})` }, { status: 422 });
    }

    const html = await response.text();
    const { text, title } = extractText(html);

    if (!text || text.replace(/\s+/g, '').length < 40) {
      return json({ error: 'Could not extract article text from this page. Try pasting the text directly.' }, { status: 422 });
    }

    return json({ text, title });
  } catch (err) {
    if (/** @type {Error} */ (err).name === 'TimeoutError' || /** @type {Error} */ (err).name === 'AbortError') {
      return json({ error: 'Request timed out while fetching the article' }, { status: 504 });
    }
    console.error('Extract error:', err);
    return json({ error: 'Failed to extract article text' }, { status: 500 });
  }
}

/**
 * Removes elements that never contain article text (globally, before we try
 * to locate the article region).
 * @param {string} html
 * @returns {string}
 */
function stripGlobals(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, ' ')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, ' ')
    .replace(/<canvas\b[\s\S]*?<\/canvas\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/**
 * Extracts a `<tag>...</tag>` element, correctly handling nested tags of the
 * same name by tracking depth (regex's `.*?` would stop at the first close).
 * @param {string} html
 * @param {string} tag
 * @returns {string | null}
 */
function extractTag(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(html);
  if (!open) return null;
  const start = open.index;
  const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = start + open[0].length;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return html.slice(start, m.index + m[0].length);
    } else {
      depth++;
    }
  }
  return null;
}

/**
 * Given the index of an opening `<div ...>`, returns that div and everything
 * up to its matching close tag (depth-aware).
 * @param {string} html
 * @param {number} startIndex
 * @returns {string | null}
 */
function extractMatchingDiv(html, startIndex) {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = startIndex;
  const first = tagRe.exec(html);
  if (!first || first[0][1] === '/') return null;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    if (m[0][1] === '/') {
      depth--;
      if (depth === 0) return html.slice(startIndex, m.index + m[0].length);
    } else {
      depth++;
    }
  }
  return null;
}

/**
 * Finds the largest `<div>` whose class/id suggests it holds article content.
 * @param {string} html
 * @returns {string | null}
 */
function findKeywordDiv(html) {
  const re = /<div\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:article|post|story|content|entry|body|main|text|articlebody)[^"']*["'][^>]*>/gi;
  let best = null;
  let bestLen = -1;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = extractMatchingDiv(html, m.index);
    if (block) {
      const len = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
      if (len > bestLen) {
        bestLen = len;
        best = block;
      }
    }
  }
  return best;
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
  middot: '·', bull: '•', deg: '°', laquo: '«', raquo: '»',
};

/**
 * Decodes HTML entities (named + numeric decimal/hex).
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(code) || code < 0 || code > 0x10ffff) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return (/** @type {Record<string, string>} */ (NAMED_ENTITIES))[body.toLowerCase()] ?? full;
  });
}

/**
 * Extracts readable text and title from HTML.
 * 1. Strip non-content elements
 * 2. Locate the article region (<article> → <main> → keyword <div> → <body>)
 * 3. Strip remaining boilerplate inside that region
 * 4. Convert block tags to newlines, strip inline tags, decode entities
 *
 * @param {string} html
 * @returns {{ text: string, title: string | null }}
 */
function extractText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : null;

  let region = extractTag(html, 'article')
    || extractTag(html, 'main')
    || findKeywordDiv(html);

  if (!region) {
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    region = bodyMatch ? bodyMatch[1] : html;
  }

  // Strip boilerplate that can appear inside the article region
  region = region
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav\s*>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside\s*>/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form\s*>/gi, ' ')
    .replace(/<button\b[\s\S]*?<\/button\s*>/gi, ' ')
    .replace(/<figure\b[\s\S]*?<\/figure\s*>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header\s*>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer\s*>/gi, ' ')
    // Strip data-* attributes (CNN leaks JSON blobs in these)
    .replace(/\s+data-[a-z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');

  // Convert block-level boundaries to newlines so paragraphs don't run together
  let text = region
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|section|article|tr|table)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|li|blockquote|section|article)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  text = decodeEntities(text);

  // Clean up leftover wiki/markup artifacts (Wikipedia-style):
  //  - {{Template|...}} → remove the whole template call
  //  - [[Page|label]] → keep "label" (or "Page" if no label)
  //  - [url label] → keep "label"
  //  - <ref>...</ref> citations → remove
  text = text
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\] ]*\s([^\]]*)\]/g, '$1')
    .replace(/<ref\b[^>]*\/>/gi, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, ' ')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup\s*>/gi, ' ');

  // Normalize whitespace while preserving paragraph breaks
  text = text
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  text = cleanText(text);

  return { text, title };
}

/**
 * Post-processing: removes news-site UI chrome, leaked data-* attributes,
 * timestamps, share buttons, and other non-article cruft that survives
 * tag-stripping.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
  // Split into lines, filter out junk, rejoin
  const lines = text.split('\n');
  const cleaned = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false; // drop blank lines (will re-add paragraph breaks)

    // UI chrome / share buttons / nav labels
    if (/^(Email|Share|Link Copied!|Copy Link|See all topics|Video Ad Feedback|Ad Feedback|Close|Skip|Play|Pause|Mute|Unmute|Fullscreen|Live TV|Follow|Subscribe|Sign in|Log in|Register|Menu|Search|Back to top|Scroll back up|Read more|Show more|Show less|Load more|Next|Previous|More|Less)$/i.test(trimmed)) return false;
    // Site section labels (nav breadcrumbs) — "Shows & Films", "Politics", "Business", etc.
    if (/^(Shows & Films|Showbiz|Entertainment|World|US Politics|Politics|Business|Markets|Tech|Media|Sport|Travel|Style|Opinion|Health|Science|Climate|Weather|Video|Audio|Live|More|Trending|Popular|Latest|Top Stories|Featured)$/i.test(trimmed)) return false;

    // Timestamps / publish dates
    if (/^(Updated|Published|Posted|PUBLISHED|UPDATED)\s/i.test(trimmed)) return false;
    if (/^\d{1,2}:\d{2}\s*(AM|PM|ET|CT|MT|PT)?$/i.test(trimmed)) return false;
    if (/^\d{1,2}:\d{2}\s*(AM|PM)\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST|ET|CT|MT|PT)\s*,?\s*\w+/i.test(trimmed)) return false; // e.g. "9:32 PM EDT, Mon August 3, 2026"
    if (/^\d{1,2}\s+(min|sec|hour|day|week|month|year)s?\s+ago$/i.test(trimmed)) return false;
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i.test(trimmed)) return false;

    // App promotion / download prompts
    if (/Scan the QR code|download the .+ app/i.test(trimmed)) return false;
    if (/^(Download|Get) the .+ app/i.test(trimmed)) return false;

    // Source attribution lines
    if (/^•\s*Source:\s*/i.test(trimmed)) return false;
    if (/^Source:\s*/i.test(trimmed) && trimmed.length < 40) return false;

    // Leaked data-* attribute values (JSON fragments, URLs, etc.)
    if (/^\s*data-[a-z-]+=["'][\s\S]*["']\s*$/i.test(trimmed)) return false;
    if (/^\s*data-[a-z-]+=/.test(trimmed)) return false;
    if (/^\s*"[a-z-]+"\s*:\s*/.test(trimmed) && /[{}\[\]]/.test(trimmed)) return false; // JSON fragments

    // Bare URLs (not inside prose)
    if (/^https?:\/\/[^\s]+$/.test(trimmed)) return false;

    // Very short lines that are likely nav/UI (1-2 words, no sentence structure)
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount <= 2 && !/[.!?]$/.test(trimmed) && trimmed.length < 30) return false;

    return true;
  });

  // Rejoin with single newlines, then collapse multiple blank lines
  let result = cleaned.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  // Remove duplicate lines (headlines/metadata often repeat across DOM nodes).
  // Keep the first occurrence of each exact line, drop later ones.
  const seen = new Set();
  result = result.split('\n').filter(line => {
    const key = line.trim();
    if (!key) return true; // keep paragraph breaks
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('\n');

  return result;
}