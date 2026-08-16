// outletLookup.js
//
// Parses the AllSides bias CSV at build time and provides a fast
// domain → outlet lookup. The CSV is imported as a raw string via
// Vite's ?raw import, so it's bundled at build time with zero
// runtime fetch overhead.
//
// Usage:
//   import { lookupOutlet } from '$lib/outletLookup.js';
//   const info = lookupOutlet('https://www.foxnews.com/politics/...');
//   // { name: 'Fox Online News', rating: 'right-center', ratingNum: 4, ... }
//   // or { name: null, rating: null, ... } if no match

import biasCsv from './bias.csv?raw';

/** @typedef {{ name: string, rating: string, ratingNum: number | null, percAgree: number | null, url: string }} OutletInfo */

/** @type {Map<string, OutletInfo> | null} */
let outletMap = null;

/**
 * Parses the CSV once and builds a domain → outlet map.
 * Safe to call multiple times — only parses on first call.
 */
function getOutletMap() {
  if (outletMap) return outletMap;

  outletMap = new Map();
  const lines = biasCsv.split('\n');
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parse — handles quoted fields with commas
    const fields = parseCSVLine(line);
    if (fields.length < 18) continue;

    const newsSource = fields[0];
    const rating = fields[1];
    const ratingNumRaw = fields[2];
    const percAgreeRaw = fields[6];
    const baseUrl = fields[17]?.trim();

    if (!baseUrl) continue;

    const ratingNum = ratingNumRaw && ratingNumRaw !== 'NA' ? parseInt(ratingNumRaw, 10) : null;
    const percAgree = percAgreeRaw && percAgreeRaw !== 'NaN' ? parseFloat(percAgreeRaw) : null;

    outletMap.set(baseUrl.toLowerCase(), {
      name: newsSource,
      rating,
      ratingNum,
      percAgree,
      url: baseUrl,
    });
  }

  return outletMap;
}

/**
 * Parses a single CSV line, respecting quoted fields that may contain commas.
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

/**
 * Extracts the domain from a URL string.
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

/**
 * Maps a rating string to a human-readable leaning label.
 * @param {string} rating
 * @returns {string}
 */
function ratingToLeaning(rating) {
  switch (rating) {
    case 'left': return 'Left';
    case 'left-center': return 'Left-leaning';
    case 'center': return 'Center';
    case 'right-center': return 'Right-leaning';
    case 'right': return 'Right';
    case 'allsides': return 'AllSides';
    default: return rating;
  }
}

/**
 * Looks up an outlet by URL.
 * @param {string} url - The full URL or domain to look up
 * @returns {{ name: string | null, rating: string | null, leaning: string | null, ratingNum: number | null, percAgree: number | null, found: boolean }}
 */
export function lookupOutlet(url) {
  const domain = extractDomain(url);
  const map = getOutletMap();

  // Try exact match first
  const exact = map.get(domain.toLowerCase());
  if (exact) {
    return {
      name: exact.name,
      rating: exact.rating,
      leaning: ratingToLeaning(exact.rating),
      ratingNum: exact.ratingNum,
      percAgree: exact.percAgree,
      found: true,
    };
  }

  // Try matching by stripping subdomains (e.g. "www.blog.example.com" → "example.com")
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    const match = map.get(candidate);
    if (match) {
      return {
        name: match.name,
        rating: match.rating,
        leaning: ratingToLeaning(match.rating),
        ratingNum: match.ratingNum,
        percAgree: match.percAgree,
        found: true,
      };
    }
  }

  // No match found
  return {
    name: null,
    rating: null,
    leaning: null,
    ratingNum: null,
    percAgree: null,
    found: false,
  };
}