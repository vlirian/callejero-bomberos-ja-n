const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const ROUTES_PATH = path.join(ROOT, 'data', 'routes.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'overrides.json');
const FEEDBACK_PATH = path.join(ROOT, 'data', 'feedback.json');
const STREET_INDEX_PATH = path.join(ROOT, 'data', 'street_index.json');
const ADMIN_UPLOADS_DIR = path.join(ROOT, 'calles', 'admin_uploads');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

const ADMIN_HASH = {
  salt: '6385adab1f650d4f4eafaac1d2b89ad0',
  hash: 'f857a08f93eb842ca04b3622bf917aa1797f6133d0a0e0f42fe9e4252c6615f3e2bdf317665a609ee30588461dc8feaa9b0d0c7449ca5f99b94230f2265688c2'
};

const sessions = new Map();
const streetIndexCache = new Map();
const geocodeCache = new Map();
const FIRE_STATION_COORDS = { lat: 37.7700861, lon: -3.7909584 };

function stripRoadPrefix(value = '') {
  return String(value)
    .replace(
      /^(calle|avenida|plaza|paseo|carretera|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)\s+(del|de la|de los|de las|de|la|el|los|las\s+)?/i,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function levenshtein(a = '', b = '') {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function canonicalStreetName(value = '') {
  const raw = String(value || '')
    .replace(/\b(BUP|BUL|BUP\/BUL|BUL\/BUP)\b/gi, ' ')
    .trim()
    .replace(/\s{2,}/g, ' ');
  if (!raw) return '';
  const zoneMatches = [...raw.matchAll(/\(([^)]*)\)/g)];
  const zone = zoneMatches.length ? `(${zoneMatches[zoneMatches.length - 1][1].trim()})` : '';
  const core = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const mRoad = core.match(
    /^(.+?),\s*(calle|avenida|avda\.?|av\.?|plaza|paseo|carretera|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)\s*(del|de la|de los|de las|de|la|el|los|las)?$/i
  );
  if (mRoad) {
    const name = mRoad[1].trim();
    const roadTypeRaw = normalizeText(mRoad[2]).replace(/\./g, '');
    const roadType =
      roadTypeRaw === 'av' || roadTypeRaw === 'avda' || roadTypeRaw === 'avenida'
        ? 'Avenida'
        : roadTypeRaw.charAt(0).toUpperCase() + roadTypeRaw.slice(1);
    const article = normalizeText(mRoad[3] || '');
    return `${roadType}${article ? ` ${article}` : ''} ${name}${zone ? ` ${zone}` : ''}`.replace(/\s{2,}/g, ' ').trim();
  }
  const mRoadNoComma = core.match(
    /^(.+)\s+(calle|avenida|avda\.?|av\.?|plaza|paseo|carretera|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)\s+(del|de la|de los|de las|de|la|el|los|las)$/i
  );
  if (mRoadNoComma) {
    const name = mRoadNoComma[1].trim();
    const roadTypeRaw = normalizeText(mRoadNoComma[2]).replace(/\./g, '');
    const roadType =
      roadTypeRaw === 'av' || roadTypeRaw === 'avda' || roadTypeRaw === 'avenida'
        ? 'Avenida'
        : roadTypeRaw.charAt(0).toUpperCase() + roadTypeRaw.slice(1);
    const article = normalizeText(mRoadNoComma[3] || '');
    return `${roadType}${article ? ` ${article}` : ''} ${name}${zone ? ` ${zone}` : ''}`.replace(/\s{2,}/g, ' ').trim();
  }
  const mArticle = core.match(/^(.+?),\s*(del|de la|de los|de las|de|la|el|los|las)$/i);
  if (mArticle) {
    const name = mArticle[1].trim();
    const article = normalizeText(mArticle[2] || '');
    const joined = `${article ? `${article} ` : ''}${name}`.replace(/\s{2,}/g, ' ').trim();
    const out = joined.charAt(0).toUpperCase() + joined.slice(1);
    return `${out}${zone ? ` ${zone}` : ''}`.replace(/\s{2,}/g, ' ').trim();
  }
  const mArticleNoComma = core.match(/^(.+)\s+(del|de la|de los|de las|de|la|el|los|las)$/i);
  if (mArticleNoComma) {
    const name = mArticleNoComma[1].trim();
    const article = normalizeText(mArticleNoComma[2] || '');
    const joined = `${article ? `${article} ` : ''}${name}`.replace(/\s{2,}/g, ' ').trim();
    const out = joined.charAt(0).toUpperCase() + joined.slice(1);
    return `${out}${zone ? ` ${zone}` : ''}`.replace(/\s{2,}/g, ' ').trim();
  }
  return `${core}${zone ? ` ${zone}` : ''}`.replace(/\s{2,}/g, ' ').trim();
}

function fetchJaenStreetCandidates(query) {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return Promise.resolve([]);
  const cacheKey = normalizeText(q);
  const cached = streetIndexCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
    return Promise.resolve(cached.value);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=30&countrycodes=es&q=${encodeURIComponent(
    `${q}, Jaén, España`
  )}`;

  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'CallejeroBomberosJaen/2.0 (local app)',
          Accept: 'application/json'
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          resolve([]);
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 2_000_000) req.destroy();
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const out = [];
            const seen = new Set();
            for (const row of Array.isArray(parsed) ? parsed : []) {
              const address = row.address || {};
              const cityRaw =
                address.city || address.town || address.village || address.municipality || address.county || '';
              const city = normalizeText(cityRaw);
              if (city && city !== 'jaen') continue;

              const name =
                address.road ||
                address.pedestrian ||
                address.footway ||
                address.cycleway ||
                address.path ||
                address.square ||
                address.neighbourhood ||
                (String(row.display_name || '').split(',')[0] || '');
              const clean = canonicalStreetName(String(name || '').trim());
              const key = normalizeText(clean);
              if (!clean || !key || seen.has(key)) continue;
              seen.add(key);
              out.push(clean);
              if (out.length >= 18) break;
            }
            streetIndexCache.set(cacheKey, { ts: Date.now(), value: out });
            resolve(out);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve([]);
    });
  });
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'CallejeroBomberosJaen/2.0 (local app)',
          Accept: 'application/json',
          ...headers
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 4_000_000) req.destroy();
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(7000, () => req.destroy(new Error('timeout')));
  });
}

async function geocodeOne(place) {
  const coordMatch = String(place || '')
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    return { lat: Number(coordMatch[1]), lon: Number(coordMatch[2]) };
  }
  const key = normalizeText(place);
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) return cached.value;

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=es&q=${encodeURIComponent(
    place
  )}`;
  const rows = await getJson(url);
  const list = Array.isArray(rows) ? rows : [];
  const row =
    list.find((item) => {
      const a = item.address || {};
      const city = normalizeText(a.city || a.town || a.village || a.municipality || '');
      const county = normalizeText(a.county || '');
      return city === 'jaen' || county.includes('jaen');
    }) || list[0] || null;
  if (!row || !row.lat || !row.lon) throw new Error('geocode_not_found');
  const value = { lat: Number(row.lat), lon: Number(row.lon) };
  geocodeCache.set(key, { ts: Date.now(), value });
  return value;
}

async function geocodeWithFallback(queries) {
  for (const q of queries) {
    try {
      return await geocodeOne(q);
    } catch {
      // probamos siguiente variante
    }
  }
  throw new Error('geocode_not_found');
}

async function computeRouteStreetSteps(originQueries, destinationQueries) {
  const destination = await geocodeWithFallback(destinationQueries);
  const origin = await geocodeWithFallback(originQueries);
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?steps=true&overview=false&alternatives=false`;
  const data = await getJson(url);
  const route = Array.isArray(data.routes) ? data.routes[0] : null;
  const legs = route && Array.isArray(route.legs) ? route.legs : [];
  const rawSteps = legs.flatMap((leg) => (Array.isArray(leg.steps) ? leg.steps : []));
  const names = [];
  const seen = new Set();
  const stepsDetailed = [];
  for (const step of rawSteps) {
    const name = canonicalStreetName(String(step.name || '').trim());
    const key = normalizeText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    const distanceMeters = Number(step && step.distance ? step.distance : 0);
    stepsDetailed.push({
      instruction: name ? `Continúa por ${name}` : 'Continúa recto',
      distanceText: distanceMeters ? `${Math.round(distanceMeters)} m` : '',
      street: name || '',
      lat: step && step.maneuver && Array.isArray(step.maneuver.location) ? Number(step.maneuver.location[1]) : null,
      lng: step && step.maneuver && Array.isArray(step.maneuver.location) ? Number(step.maneuver.location[0]) : null,
      endLat: null,
      endLng: null,
      maneuver: String(step && step.maneuver && step.maneuver.type ? step.maneuver.type : ''),
    });
  }
  const trimmed = trimOperationalPrefix(names);
  const instructions = trimmed.map((name) => `Continúa por ${name}`);
  return { streets: trimmed, instructions, stepsDetailed };
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function trimOperationalPrefix(streets) {
  const list = Array.isArray(streets) ? streets.filter(Boolean) : [];
  if (!list.length) return list;
  const keys = list.map((s) => normalizeText(s));
  const startIdx = keys.findIndex(
    (k) =>
      k.includes('avenida de andalucia') ||
      k.includes('av de andalucia') ||
      k.includes('avda de andalucia') ||
      k.includes('carretera de cordoba') ||
      k.includes('ctra de cordoba')
  );
  return startIdx > 0 ? list.slice(startIdx) : list;
}

function extractRoadNamesFromGoogleStep(step) {
  const directName = canonicalStreetName(String(step && step.name ? step.name : '').trim());
  const html = String(step && step.html_instructions ? step.html_instructions : '');
  const boldParts = [...html.matchAll(/<b>(.*?)<\/b>/gi)].map((m) => stripHtml(m[1]));
  const parts = [directName, ...(boldParts.length ? boldParts : [stripHtml(html)])].filter(Boolean);
  const roadLike =
    /^(c\.|calle|av\.|avda\.|avenida|plaza|paseo|carretera|camino|ronda|traves[ií]a|cuesta|glorieta|autov[ií]a|n-|a-)/i;
  const banned =
    /^(izquierda|derecha|recto|norte|sur|este|oeste|giro|contin[uú]a|mant[eé]n|sal|incorp[oó]rate|hacia)$/i;
  return parts
    .map((p) => canonicalStreetName(p))
    .filter((p) => p && normalizeText(p).length > 2)
    .filter((p) => roadLike.test(p) && !banned.test(normalizeText(p)));
}

async function computeGoogleRouteStreetSteps(originQuery, destinationQuery) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('google_api_key_missing');
  }
  const origin = originQuery;
  const url =
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destinationQuery)}&alternatives=true&departure_time=now&mode=driving&language=es&region=es&key=${encodeURIComponent(
      GOOGLE_MAPS_API_KEY
    )}`;
  const data = await getJson(url);
  if (data.status !== 'OK') {
    throw new Error(`google_directions_${String(data.status || 'error').toLowerCase()}`);
  }
  const routes = Array.isArray(data.routes) ? data.routes : [];
  const bestRoute =
    routes
      .map((route) => {
        const legs = Array.isArray(route.legs) ? route.legs : [];
        const total = legs.reduce(
          (acc, leg) => acc + Number((leg && leg.duration_in_traffic && leg.duration_in_traffic.value) || (leg && leg.duration && leg.duration.value) || 0),
          0
        );
        return { route, total };
      })
      .sort((a, b) => a.total - b.total)[0]?.route || routes[0] || null;
  const legs = bestRoute && Array.isArray(bestRoute.legs) ? bestRoute.legs : [];
  const steps = legs.flatMap((leg) => (Array.isArray(leg.steps) ? leg.steps : []));
  const out = [];
  const seen = new Set();
  const instructions = [];
  const stepsDetailed = [];
  for (const step of steps) {
    const stepInstruction = stripHtml(step && step.html_instructions ? step.html_instructions : '');
    if (stepInstruction) instructions.push(stepInstruction);
    const stepStreet = canonicalStreetName(String(step && step.name ? step.name : '').trim());
    stepsDetailed.push({
      instruction: stepInstruction || (stepStreet ? `Continúa por ${stepStreet}` : 'Continúa'),
      distanceText: String((step && step.distance && step.distance.text) || ''),
      street: stepStreet,
      lat: step && step.start_location ? Number(step.start_location.lat) : null,
      lng: step && step.start_location ? Number(step.start_location.lng) : null,
      endLat: step && step.end_location ? Number(step.end_location.lat) : null,
      endLng: step && step.end_location ? Number(step.end_location.lng) : null,
      maneuver: String(step && step.maneuver ? step.maneuver : ''),
    });
    for (const name of extractRoadNamesFromGoogleStep(step)) {
      const key = normalizeText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  const trimmed = trimOperationalPrefix(out);
  return { streets: trimmed, instructions, stepsDetailed };
}

function localStreetIndexCandidates(query) {
  const q = normalizeText(String(query || '').replace(/\bcajen\b/gi, 'jaen'));
  if (!q || q.length < 2) return [];
  const db = readJson(STREET_INDEX_PATH, { streets: [] });
  const streets = Array.isArray(db.streets) ? db.streets : [];
  const scored = [];
  for (const street of streets) {
    const raw = String(street || '').trim();
    if (!raw) continue;
    const s = normalizeText(raw);
    const ss = normalizeText(stripRoadPrefix(raw));
    let score = -1;
    if (s.startsWith(q)) score = 120 - (s.length - q.length);
    else if (s.includes(q)) score = 100 - s.indexOf(q);
    else if (ss.startsWith(q)) score = 95 - (ss.length - q.length);
    else if (ss.includes(q)) score = 80 - ss.indexOf(q);
    else {
      const target = (ss || s).slice(0, Math.max(q.length + 4, 14));
      const dist = levenshtein(q, target);
      const ratio = dist / Math.max(q.length, 1);
      if (ratio <= 0.34) score = Math.round(65 - ratio * 30);
    }
    if (score >= 0) scored.push({ street: canonicalStreetName(raw), score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const row of scored) {
    const key = normalizeText(row.street);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.street);
    if (out.length >= 20) break;
  }
  return out;
}

function localRouteStreetCandidates(query) {
  const q = normalizeText(String(query || '').replace(/\bcajen\b/gi, 'jaen'));
  if (!q || q.length < 2) return [];
  const routes = withOverrides();
  const scored = [];
  for (const row of routes) {
    const raw = canonicalStreetName(String(row.street || row.fullDestination || '').trim());
    if (!raw) continue;
    const s = normalizeText(raw);
    const ss = normalizeText(stripRoadPrefix(raw));
    let score = -1;
    if (s.startsWith(q)) score = 120 - (s.length - q.length);
    else if (s.includes(q)) score = 100 - s.indexOf(q);
    else if (ss.startsWith(q)) score = 95 - (ss.length - q.length);
    else if (ss.includes(q)) score = 80 - ss.indexOf(q);
    else {
      const target = (ss || s).slice(0, Math.max(q.length + 4, 14));
      const dist = levenshtein(q, target);
      const ratio = dist / Math.max(q.length, 1);
      if (ratio <= 0.34) score = Math.round(65 - ratio * 30);
    }
    if (score >= 0) scored.push({ street: raw, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const row of scored) {
    const key = normalizeText(row.street);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.street);
    if (out.length >= 20) break;
  }
  return out;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw
      .split(';')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf('=');
        return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))];
      })
  );
}

function verifyPassword(password) {
  const computed = crypto.scryptSync(password, ADMIN_HASH.salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(ADMIN_HASH.hash, 'hex'));
}

function json(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

function proxyBinary(url, res) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (upstream) => {
      const status = upstream.statusCode || 502;
      if (status < 200 || status >= 300) {
        upstream.resume();
        reject(new Error(`upstream_${status}`));
        return;
      }
      const contentType = upstream.headers['content-type'] || 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });
      upstream.pipe(res);
      upstream.on('end', resolve);
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
  });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getAdmin(req) {
  const token = parseCookies(req).admin_session;
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function bodyOf(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function zoneOf(entry) {
  const m = String(entry.fullDestination || '').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : 'Sin zona';
}

function withOverrides() {
  const routes = readJson(ROUTES_PATH, []);
  const overrides = readJson(OVERRIDES_PATH, {});
  return routes.map((entry) => (overrides[entry.sourcePdf] ? { ...entry, ...overrides[entry.sourcePdf] } : entry));
}

function ensureFeedbackFile() {
  if (!fs.existsSync(FEEDBACK_PATH)) {
    writeJson(FEEDBACK_PATH, []);
  }
}

function ensureAdminUploadsDir() {
  if (!fs.existsSync(ADMIN_UPLOADS_DIR)) {
    fs.mkdirSync(ADMIN_UPLOADS_DIR, { recursive: true });
  }
}

function isPdfLikeFile(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile()) return false;
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.toString('utf8') === '%PDF';
  } catch {
    return false;
  }
}

function listPdfLikeFilesFromCalles() {
  const mainDir = path.join(ROOT, 'calles');
  if (!fs.existsSync(mainDir)) return [];
  return fs
    .readdirSync(mainDir)
    .filter((name) => isPdfLikeFile(path.join(mainDir, name)))
    .sort((a, b) => normalizeText(a).localeCompare(normalizeText(b), 'es'));
}

function tryFindPdfByName(name = '') {
  const needleRaw = String(name || '').trim();
  if (!needleRaw) return null;
  const needle = normalizeText(needleRaw);
  const candidates = [];
  const mainDir = path.join(ROOT, 'calles');
  for (const f of listPdfLikeFilesFromCalles()) {
    candidates.push(path.join(mainDir, f));
  }
  if (fs.existsSync(ADMIN_UPLOADS_DIR)) {
    for (const f of fs.readdirSync(ADMIN_UPLOADS_DIR)) {
      if (String(f).toLowerCase().endsWith('.pdf')) candidates.push(path.join(ADMIN_UPLOADS_DIR, f));
    }
  }
  for (const abs of candidates) {
    const base = path.basename(abs);
    if (base === needleRaw) return abs;
  }
  for (const abs of candidates) {
    const base = path.basename(abs);
    if (normalizeText(base) === needle) return abs;
  }
  return null;
}

function sanitizePdfFileName(value = '') {
  const base = path.basename(String(value || '').trim() || 'plano.pdf');
  const cleaned = base.replace(/[^\w .()-]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned || 'plano'}.pdf`;
}

function cleanStreetFromPdfName(name = '') {
  const stem = path.basename(String(name || ''));
  return String(stem)
    .replace(/\.pdf\b/gi, ' ')
    .replace(/\s*\d+[\w().-]*\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function rebuildRoutesFromCallesDir() {
  const files = listPdfLikeFilesFromCalles();
  const entries = files.map((file) => {
    const street = cleanStreetFromPdfName(file) || file;
    return {
      street,
      fullDestination: street,
      truck: 'No indicado',
      itinerary: ['Sin itinerario extraído automáticamente'],
      notes: 'Sin nota operativa detectada automáticamente.',
      sourcePdf: file,
      mapPdf: `./calles/${file}`,
    };
  });
  writeJson(ROUTES_PATH, entries);
  return entries;
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const abs = path.join(ROOT, reqPath);
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const ct = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.pdf': 'application/pdf',
      '.md': 'text/plain; charset=utf-8'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const url = parsedUrl.pathname;
  ensureFeedbackFile();
  ensureAdminUploadsDir();

  if (url === '/api/routes' && req.method === 'GET') {
    return json(res, 200, withOverrides());
  }

  if (url === '/api/meta' && req.method === 'GET') {
    const routes = withOverrides();
    const zones = [...new Set(routes.map(zoneOf))].sort((a, b) => a.localeCompare(b, 'es'));
    return json(res, 200, { zones, trucks: ['BUL', 'BUP', 'BUL/BUP', 'No indicado'] });
  }

  if (url === '/api/street-index' && req.method === 'GET') {
    const q = parsedUrl.searchParams.get('q') || '';
    const localIndex = localStreetIndexCandidates(q);
    const localRoutes = localRouteStreetCandidates(q);
    const local = [];
    const localSeen = new Set();
    for (const s of [...localRoutes, ...localIndex]) {
      const key = normalizeText(s);
      if (!key || localSeen.has(key)) continue;
      localSeen.add(key);
      local.push(s);
      if (local.length >= 20) break;
    }
    if (local.length >= 8) {
      return json(res, 200, { streets: local, source: 'local_routes+street_index' });
    }
    const remote = await fetchJaenStreetCandidates(q);
    const merged = [];
    const seen = new Set();
    for (const s of [...local, ...remote]) {
      const key = normalizeText(s);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
      if (merged.length >= 20) break;
    }
    return json(res, 200, { streets: merged, source: local.length ? 'local_routes+street_index+osm' : 'osm' });
  }

  if (url === '/api/route-steps' && req.method === 'GET') {
    const to = String(parsedUrl.searchParams.get('to') || '').trim();
    const originRaw = String(parsedUrl.searchParams.get('origin') || '').trim();
    if (!to || to.length < 2) {
      return json(res, 400, { ok: false, error: 'Destino inválido' });
    }
    const originQueries = originRaw
      ? [originRaw, `${originRaw}, Jaén capital, 23000, España`, `${originRaw}, Jaén, España`]
      : ['37.778523,-3.811482'];
    const destinationQueries = [`${to}, Jaén capital, 23000, España`, `${to}, Jaén, España`, `${to}`];
    try {
      // Preferimos Google Directions si hay API key; fallback a OSRM.
      const routeInfo = await computeGoogleRouteStreetSteps(originQueries[0], destinationQueries[0]);
      if (routeInfo.streets.length || routeInfo.instructions.length) {
        return json(res, 200, {
          ok: true,
          streets: routeInfo.streets,
          instructions: routeInfo.instructions,
          stepsDetailed: routeInfo.stepsDetailed || [],
          source: 'google',
        });
      }
      throw new Error('google_empty_steps');
    } catch (googleErr) {
      try {
        const routeInfo = await computeRouteStreetSteps(originQueries, destinationQueries);
        return json(res, 200, {
          ok: true,
          streets: routeInfo.streets,
          instructions: routeInfo.instructions,
          stepsDetailed: routeInfo.stepsDetailed || [],
          source: 'osrm',
        });
      } catch (err) {
        return json(res, 200, {
          ok: false,
          streets: [],
          instructions: [],
          stepsDetailed: [],
          error: String(err && err.message ? err.message : err),
          googleError: String(googleErr && googleErr.message ? googleErr.message : googleErr),
        });
      }
    }
  }

  if (url === '/api/pdf' && req.method === 'GET') {
    const name = String(parsedUrl.searchParams.get('name') || '').trim();
    const found = tryFindPdfByName(name);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, max-age=86400',
    });
    fs.createReadStream(found).pipe(res);
    return;
  }

  if (url === '/api/streetview-photo' && req.method === 'GET') {
    const lat = Number(parsedUrl.searchParams.get('lat'));
    const lng = Number(parsedUrl.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json(res, 400, { ok: false, error: 'coordenadas_invalidas' });
    }
    if (!GOOGLE_MAPS_API_KEY) {
      return json(res, 503, { ok: false, error: 'google_api_key_missing' });
    }
    const photoUrl =
      `https://maps.googleapis.com/maps/api/streetview?size=1200x700&location=${encodeURIComponent(`${lat},${lng}`)}` +
      `&fov=80&heading=0&pitch=0&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
    try {
      await proxyBinary(photoUrl, res);
      return;
    } catch (err) {
      return json(res, 502, { ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  if (url === '/api/admin/me' && req.method === 'GET') {
    return json(res, 200, { admin: getAdmin(req) });
  }

  if (url === '/api/admin/login' && req.method === 'POST') {
    try {
      const body = await bodyOf(req);
      if (!verifyPassword(String(body.password || ''))) {
        return json(res, 401, { ok: false, error: 'Credenciales inválidas' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
      return json(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax` }
      );
    } catch {
      return json(res, 400, { ok: false, error: 'Solicitud inválida' });
    }
  }

  if (url === '/api/admin/logout' && req.method === 'POST') {
    const token = parseCookies(req).admin_session;
    if (token) sessions.delete(token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
  }

  if (url === '/api/overrides' && req.method === 'GET') {
    return json(res, 200, readJson(OVERRIDES_PATH, {}));
  }

  if (url === '/api/overrides' && req.method === 'PUT') {
    if (!getAdmin(req)) {
      return json(res, 403, { ok: false, error: 'No autorizado' });
    }
    try {
      const body = await bodyOf(req);
      if (typeof body !== 'object' || Array.isArray(body) || body === null) {
        return json(res, 400, { ok: false, error: 'Formato inválido' });
      }
      writeJson(OVERRIDES_PATH, body);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { ok: false, error: 'Solicitud inválida' });
    }
  }

  if (url === '/api/admin/upload-pdf' && req.method === 'POST') {
    if (!getAdmin(req)) {
      return json(res, 403, { ok: false, error: 'No autorizado' });
    }
    try {
      const body = await bodyOf(req, 40 * 1024 * 1024);
      const filename = sanitizePdfFileName(body.filename || '');
      const contentBase64 = String(body.contentBase64 || '').trim();
      if (!contentBase64) {
        return json(res, 400, { ok: false, error: 'Contenido vacío' });
      }
      const bytes = Buffer.from(contentBase64, 'base64');
      if (!bytes.length) {
        return json(res, 400, { ok: false, error: 'PDF inválido' });
      }
      if (bytes.length > 25 * 1024 * 1024) {
        return json(res, 400, { ok: false, error: 'PDF demasiado grande (máx 25MB)' });
      }
      const signature = bytes.slice(0, 4).toString('utf8');
      if (!signature.startsWith('%PDF')) {
        return json(res, 400, { ok: false, error: 'El archivo no parece un PDF' });
      }

      const stamp = Date.now();
      const safeName = `${stamp}-${filename}`;
      const abs = path.join(ADMIN_UPLOADS_DIR, safeName);
      fs.writeFileSync(abs, bytes);
      return json(res, 200, { ok: true, mapPdf: `./calles/admin_uploads/${safeName}` });
    } catch {
      return json(res, 400, { ok: false, error: 'Solicitud inválida' });
    }
  }

  if (url === '/api/admin/reindex' && req.method === 'POST') {
    if (!getAdmin(req)) {
      return json(res, 403, { ok: false, error: 'No autorizado' });
    }
    try {
      const entries = rebuildRoutesFromCallesDir();
      return json(res, 200, { ok: true, count: entries.length });
    } catch (err) {
      return json(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  if (url === '/api/feedback' && req.method === 'POST') {
    try {
      const body = await bodyOf(req);
      const message = String(body.message || '').trim();
      const street = String(body.street || '').trim();
      const sourcePdf = String(body.sourcePdf || '').trim();
      if (!message || message.length < 3) {
        return json(res, 400, { ok: false, error: 'Comentario demasiado corto' });
      }
      const feedback = readJson(FEEDBACK_PATH, []);
      feedback.unshift({
        id: crypto.randomBytes(8).toString('hex'),
        createdAt: new Date().toISOString(),
        status: 'new',
        message,
        street,
        sourcePdf
      });
      writeJson(FEEDBACK_PATH, feedback.slice(0, 1000));
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 400, { ok: false, error: 'Solicitud inválida' });
    }
  }

  if (url === '/api/feedback' && req.method === 'GET') {
    if (!getAdmin(req)) {
      return json(res, 403, { ok: false, error: 'No autorizado' });
    }
    return json(res, 200, readJson(FEEDBACK_PATH, []));
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Callejero server running on http://localhost:${PORT}`);
});
