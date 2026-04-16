const input = document.getElementById("streetInput");
const result = document.getElementById("result");
const empty = document.getElementById("empty");
const suggestions = document.getElementById("suggestions");
const mapModal = document.getElementById("mapModal");
const mapModalFrame = document.getElementById("mapModalFrame");
const mapModalImage = document.getElementById("mapModalImage");
const mapModalClose = document.getElementById("mapModalClose");
const mapModalTitle = document.getElementById("mapModalTitle");
const adminToggle = document.getElementById("adminToggle");
const consultToggle = document.getElementById("consultToggle");
const reviewToggle = document.getElementById("reviewToggle");
const adminTools = document.getElementById("adminTools");
const pendingToggle = document.getElementById("pendingToggle");
const feedbackToggle = document.getElementById("feedbackToggle");
const feedbackRefresh = document.getElementById("feedbackRefresh");
const adminPanelTitle = document.getElementById("adminPanelTitle");
const adminPanel = document.getElementById("adminPanel");
const adminList = document.getElementById("adminList");
const truckBanner = document.getElementById("truckBanner");
const mapsAnnex = document.getElementById("mapsAnnex");
const mapsFrame = document.getElementById("mapsFrame");
const streetViewFrame = document.getElementById("streetViewFrame");
const mapsOpen = document.getElementById("mapsOpen");
const mapsTitle = document.getElementById("mapsTitle");
const mapsAlt = document.getElementById("mapsAlt");
const mapsAltList = document.getElementById("mapsAltList");
const mapsSteps = document.getElementById("mapsSteps");
const mapsStepsList = document.getElementById("mapsStepsList");
const mapsStepsMeta = document.getElementById("mapsStepsMeta");
const destinationPhotoWrap = document.getElementById("destinationPhotoWrap");
const destinationPhotoFrame = document.getElementById("destinationPhotoFrame");
const destinationPhotoMeta = document.getElementById("destinationPhotoMeta");
const widthEstimate = document.getElementById("widthEstimate");
const widthEstimateValue = document.getElementById("widthEstimateValue");
const widthEstimateNote = document.getElementById("widthEstimateNote");
const stepOverlay = document.getElementById("stepOverlay");
const stepKicker = document.getElementById("stepKicker");
const stepText = document.getElementById("stepText");
const stepDistance = document.getElementById("stepDistance");
const stepStartBtn = document.getElementById("stepStartBtn");
const stepPrevBtn = document.getElementById("stepPrevBtn");
const stepNextBtn = document.getElementById("stepNextBtn");
const stepEndBtn = document.getElementById("stepEndBtn");
const feedbackBox = document.getElementById("feedbackBox");
const feedbackText = document.getElementById("feedbackText");
const feedbackSend = document.getElementById("feedbackSend");
const feedbackMeta = document.getElementById("feedbackMeta");
const reviewPanel = document.getElementById("reviewPanel");
const reviewStart = document.getElementById("reviewStart");
const reviewStreet = document.getElementById("reviewStreet");
const reviewTruckInput = document.getElementById("reviewTruckInput");
const reviewItineraryLines = document.getElementById("reviewItineraryLines");
const reviewAddLine = document.getElementById("reviewAddLine");
const reviewCheck = document.getElementById("reviewCheck");
const reviewFeedback = document.getElementById("reviewFeedback");
const loadingTop = document.getElementById("loadingTop");
const loadingTopBar = document.getElementById("loadingTopBar");
const loadingTopPct = document.getElementById("loadingTopPct");
const streetFieldWrap = document.getElementById("streetFieldWrap");

const OVERRIDES_KEY = "callejeroRouteOverridesV1";
const ADMIN_SESSION_KEY = "callejeroAdminSessionV1";
const LEGACY_ADMIN_PASSWORD = "L30p0ldit0";

let routes = [];
let baseRoutes = [];
let localStreetIndex = [];
let suggestionMatches = [];
let routeByStreet = new Map();
let searchDebounce = null;
let searchSeq = 0;
let activeSuggestionIndex = -1;
let editingSourcePdf = null;
let overrides = {};
let isAdmin = false;
let apiAvailable = false;
let adminPanelMode = "pending";
let currentEntry = null;
let loadingProgress = 0;
let reviewCurrentStreet = "";
let reviewCurrentEntry = null;
let activeMode = "consult";
let routeStepsSeq = 0;
let routeStepDetails = [];
let activeRouteStepIndex = 0;
let routeStepDisplayOffset = 0;
const FIRE_STATION_ORIGIN = "37.778523,-3.811482";
const INVERTED_ROAD_SUFFIX =
  /(calle|avenida|avda\.?|av\.?|plaza|paseo|carretera|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)/i;
const INVERTED_ARTICLE_SUFFIX = /(del|de la|de los|de las|de|la|el|los|las)/i;
const ROAD_PREFIX_RE =
  /^(calle|avenida|plaza|paseo|carretera|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)\s+(del|de la|de los|de las|de|la|el|los|las\s+)?/i;

function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toRoadTypeLabel(value = "") {
  const v = normalizeText(value).replace(/\./g, "");
  if (v === "av" || v === "avda" || v === "avenida") return "Avenida";
  if (v === "calle") return "Calle";
  if (v === "plaza") return "Plaza";
  if (v === "paseo") return "Paseo";
  if (v === "carretera") return "Carretera";
  if (v === "camino") return "Camino";
  if (v === "ronda") return "Ronda";
  if (v === "travesia") return "Travesía";
  if (v === "cuesta") return "Cuesta";
  if (v === "glorieta") return "Glorieta";
  if (v === "bulevar") return "Bulevar";
  return value.trim();
}

function normalizeArticle(value = "") {
  const v = normalizeText(value);
  if (v === "del") return "del";
  if (v === "de la") return "de la";
  if (v === "de los") return "de los";
  if (v === "de las") return "de las";
  if (v === "de") return "de";
  if (v === "la") return "la";
  if (v === "el") return "el";
  if (v === "los") return "los";
  if (v === "las") return "las";
  return value.trim();
}

function canonicalStreetName(value = "") {
  const raw = String(value || "")
    .replace(/\b(BUP|BUL|BUP\/BUL|BUL\/BUP)\b/gi, " ")
    .trim()
    .replace(/\s{2,}/g, " ");
  if (!raw) return "";

  const zoneMatches = [...raw.matchAll(/\(([^)]*)\)/g)];
  const zone = zoneMatches.length ? `(${zoneMatches[zoneMatches.length - 1][1].trim()})` : "";
  const base = raw.replace(/\s*\([^)]*\)\s*/g, " ").trim();

  let out = base;

  const mRoad = base.match(
    new RegExp(`^(.+?),\\s*${INVERTED_ROAD_SUFFIX.source}\\s*${INVERTED_ARTICLE_SUFFIX.source}?$`, "i")
  );
  if (mRoad) {
    const name = mRoad[1].trim();
    const roadType = toRoadTypeLabel(mRoad[2] || "");
    const article = normalizeArticle(mRoad[3] || "");
    out = `${roadType}${article ? ` ${article}` : ""} ${name}`.replace(/\s{2,}/g, " ").trim();
  } else {
    const mRoadNoComma = base.match(
      new RegExp(`^(.+)\\s+${INVERTED_ROAD_SUFFIX.source}\\s+${INVERTED_ARTICLE_SUFFIX.source}$`, "i")
    );
    if (mRoadNoComma) {
      const name = mRoadNoComma[1].trim();
      const roadType = toRoadTypeLabel(mRoadNoComma[2] || "");
      const article = normalizeArticle(mRoadNoComma[3] || "");
      out = `${roadType}${article ? ` ${article}` : ""} ${name}`.replace(/\s{2,}/g, " ").trim();
    } else {
    const mArticle = base.match(new RegExp(`^(.+?),\\s*${INVERTED_ARTICLE_SUFFIX.source}$`, "i"));
    if (mArticle) {
      const name = mArticle[1].trim();
      const article = normalizeArticle(mArticle[2] || "");
      out = `${article ? `${article} ` : ""}${name}`.replace(/\s{2,}/g, " ").trim();
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
      else {
        const mArticleNoComma = base.match(new RegExp(`^(.+)\\s+${INVERTED_ARTICLE_SUFFIX.source}$`, "i"));
        if (mArticleNoComma) {
          const name = mArticleNoComma[1].trim();
          const article = normalizeArticle(mArticleNoComma[2] || "");
          out = `${article ? `${article} ` : ""}${name}`.replace(/\s{2,}/g, " ").trim();
          out = out.charAt(0).toUpperCase() + out.slice(1);
        }
      }
    }
  }

  let cleaned = zone ? `${out} ${zone}`.replace(/\s{2,}/g, " ").trim() : out;
  // BUP/BUL son tipo de camión, no parte del nombre de la calle.
  cleaned = cleaned.replace(/\s+\b(BUP|BUL|BUP\/BUL|BUL\/BUP)\b\s*$/i, "").trim();
  return cleaned;
}

function stripRoadPrefix(value = "") {
  return String(value).replace(ROAD_PREFIX_RE, "").replace(/\s{2,}/g, " ").trim();
}

function streetDedupKey(value = "") {
  const canonical = canonicalStreetName(String(value || ""));
  const plain = stripLeadingArticle(stripRoadPrefix(canonical));
  return normalizeText(plain || canonical);
}

function stripLeadingArticle(value = "") {
  return String(value)
    .replace(/^(del|de la|de los|de las|de|la|el|los|las)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findRouteEntryByStreetName(name = "") {
  const canonical = canonicalStreetName(name);
  const key = normalizeText(canonical);
  if (!key) return null;
  const exact = routeByStreet.get(key);
  if (exact) return exact;

  const stripped = normalizeText(stripLeadingArticle(stripRoadPrefix(canonical)));
  if (!stripped) return null;

  // Fallback: emparejar "Calle X" con "X" en nuestras fichas.
  for (const entry of routes) {
    const entryCanon = canonicalStreetName(entry.street);
    const entryStripped = normalizeText(stripLeadingArticle(stripRoadPrefix(entryCanon)));
    if (entryStripped === stripped) return entry;
  }
  return null;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setLoadingProgress(value, label = "") {
  if (!loadingTop || !loadingTopBar || !loadingTopPct) return;
  loadingProgress = Math.max(0, Math.min(100, Math.round(value)));
  loadingTopBar.style.width = `${loadingProgress}%`;
  loadingTopPct.textContent = `${loadingProgress}%${label ? ` · ${label}` : ""}`;
}

function finishLoadingProgress() {
  if (!loadingTop || !loadingTopBar || !loadingTopPct) return;
  setLoadingProgress(100, "Listo");
  window.setTimeout(() => {
    loadingTop.classList.add("done");
  }, 260);
}

function buildReviewPool() {
  const seen = new Set();
  const out = [];
  for (const entry of routes) {
    const street = canonicalStreetName(entry.street || entry.fullDestination || "");
    const key = normalizeText(street);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ street, entry });
  }
  for (const street of localStreetIndex) {
    const canonical = canonicalStreetName(street);
    const key = normalizeText(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ street: canonical, entry: findRouteEntryByStreetName(canonical) });
  }
  return out;
}

function startReviewModeRound() {
  const pool = buildReviewPool();
  if (!pool.length) {
    reviewFeedback.textContent = "No hay calles cargadas para repaso.";
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  reviewCurrentStreet = pick.street;
  reviewCurrentEntry = pick.entry || null;
  reviewStreet.textContent = `Calle: ${reviewCurrentStreet}`;
  reviewTruckInput.value = "";
  getReviewLineInputs().forEach((input) => {
    input.value = "";
  });
  reviewFeedback.textContent = "Escribe camión e itinerario y pulsa comprobar.";
  getReviewLineInputs()[0]?.focus();
}

function normalizeTruckGuess(value = "") {
  return normalizeText(value).replace(/\s+/g, "").replace("bul/bup", "bup/bul");
}

function parseItineraryLines(value = "") {
  return String(value)
    .split("\n")
    .map((x) => canonicalStreetName(x.replace(/^\d+\.\s*/, "").trim()))
    .filter(Boolean);
}

function getReviewItineraryGuess() {
  const joined = getReviewLineInputs().map((input) => input.value.trim()).filter(Boolean).join("\n");
  return parseItineraryLines(joined);
}

function getReviewLineInputs() {
  return [...document.querySelectorAll(".review-line-input")];
}

function renumberReviewLines() {
  const rows = [...document.querySelectorAll(".review-line-row")];
  rows.forEach((row, idx) => {
    const no = row.querySelector(".review-line-no");
    const input = row.querySelector(".review-line-input");
    if (no) no.textContent = String(idx + 1);
    if (input) {
      input.setAttribute("data-line-index", String(idx));
      input.setAttribute("placeholder", `Calle ${idx + 1}`);
    }
  });
}

function addReviewLine() {
  if (!reviewItineraryLines) return;
  const row = document.createElement("div");
  row.className = "review-line-row";
  row.innerHTML = '<span class="review-line-no"></span><input class="review-line-input" type="text" />';
  reviewItineraryLines.appendChild(row);
  renumberReviewLines();
  const input = row.querySelector(".review-line-input");
  if (input) input.focus();
}

function scoreItinerary(guess, real) {
  if (!real.length) return 0;
  const remainingGuess = [...guess];
  let hit = 0;
  for (const realStreet of real) {
    const idx = remainingGuess.findIndex((g) => streetsRoughlyMatch(g, realStreet));
    if (idx >= 0) {
      hit += 1;
      remainingGuess.splice(idx, 1);
    }
  }
  return Math.round((hit / real.length) * 100);
}

function comparableStreet(value = "") {
  let text = canonicalStreetName(String(value || ""));
  text = text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(avda\.?|av\.?|avenida|calle|c\/|plaza|pza\.?|paseo|carretera|ctra\.?|camino|ronda|travesia|travesía|cuesta|glorieta|bulevar)\b/gi, " ")
    .replace(/\b(del|de la|de los|de las|de|la|el|los|las)\b/gi, " ");
  return normalizeText(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function streetsRoughlyMatch(guess = "", real = "") {
  const g = comparableStreet(guess);
  const r = comparableStreet(real);
  if (!g || !r) return false;
  if (g === r) return true;

  if ((g.length >= 4 && r.includes(g)) || (r.length >= 4 && g.includes(r))) return true;

  const gTokens = g.split(" ").filter(Boolean);
  const rTokens = r.split(" ").filter(Boolean);
  if (gTokens.length && gTokens.every((t) => rTokens.includes(t))) return true;

  const dist = levenshtein(g, r);
  const ratio = dist / Math.max(g.length, r.length, 1);
  if (dist <= 2 || ratio <= 0.25) return true;

  return false;
}

function zoneOf(entry) {
  const m = String(entry.fullDestination || "").match(/\(([^)]+)\)/);
  return m ? m[1].trim() : "Sin zona";
}

function loadOverridesLocal() {
  try {
    overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
  } catch {
    overrides = {};
  }
}

function saveOverridesLocal() {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return res.json();
}

async function detectApi() {
  try {
    const data = await fetchJson("/api/admin/me", { credentials: "include" });
    apiAvailable = true;
    isAdmin = Boolean(data.admin);
  } catch {
    apiAvailable = false;
    isAdmin = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  }
}

function applyOverrides(data) {
  const patched = data.map((entry) => {
    const patch = overrides[entry.sourcePdf];
    return patch ? { ...entry, ...patch } : entry;
  });
  const extras = Array.isArray(overrides.__extra) ? overrides.__extra : [];
  return [...patched, ...extras];
}

function rebuildRouteIndex() {
  routeByStreet = new Map();
  for (const entry of routes) {
    const key = normalizeText(canonicalStreetName(entry.street));
    if (!key) continue;
    if (!routeByStreet.has(key)) {
      routeByStreet.set(key, entry);
      continue;
    }
    routeByStreet.set(key, preferredEntry(routeByStreet.get(key), entry));
  }
}

function setAdminUi() {
  if (isAdmin) {
    adminToggle.textContent = "Salir admin";
    adminTools.classList.add("open");
    feedbackBox.style.display = "none";
  } else {
    adminToggle.textContent = "Acceso admin";
    adminTools.classList.remove("open");
    adminPanel.classList.remove("open");
    feedbackBox.style.display = "block";
  }
}

function setActiveMode(mode) {
  activeMode = mode === "review" ? "review" : "consult";
  const reviewOn = activeMode === "review";
  reviewPanel.classList.toggle("open", reviewOn);
  consultToggle.classList.toggle("is-active", !reviewOn);
  reviewToggle.classList.toggle("is-active", reviewOn);
  if (streetFieldWrap) {
    streetFieldWrap.style.display = reviewOn ? "none" : "";
  }
  if (suggestions) {
    suggestions.style.display = reviewOn ? "none" : "";
  }
  if (reviewOn) hideSuggestions();
}

function levenshtein(a, b) {
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

function scoreMatch(queryNorm, entry, queryAlt = queryNorm) {
  const s = normalizeText(canonicalStreetName(entry.street));
  const d = normalizeText(canonicalStreetName(entry.fullDestination));
  const sAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(canonicalStreetName(entry.street))));
  const q1 = queryNorm;
  const q2 = queryAlt || queryNorm;

  if (s === q1 || s === q2 || sAlt === q1 || sAlt === q2) return 1000;

  if (s.startsWith(q1)) return 900 - (s.length - q1.length);
  if (q2 !== q1 && s.startsWith(q2)) return 890 - (s.length - q2.length);
  if (sAlt.startsWith(q1)) return 880 - (sAlt.length - q1.length);
  if (q2 !== q1 && sAlt.startsWith(q2)) return 870 - (sAlt.length - q2.length);

  if (s.includes(q1)) return 800 - s.indexOf(q1);
  if (q2 !== q1 && s.includes(q2)) return 790 - s.indexOf(q2);
  if (sAlt.includes(q1)) return 780 - sAlt.indexOf(q1);
  if (q2 !== q1 && sAlt.includes(q2)) return 770 - sAlt.indexOf(q2);
  if (d.includes(q1)) return 700 - d.indexOf(q1);
  if (q2 !== q1 && d.includes(q2)) return 690 - d.indexOf(q2);

  // Para consultas cortas evitamos coincidencias difusas demasiado agresivas.
  if (q1.length < 3 && q2.length < 3) return -1;

  const target = sAlt || s;
  const probe = q2.length > q1.length ? q2 : q1;
  const dist = levenshtein(probe, target.slice(0, Math.max(probe.length, 20)));
  const norm = dist / Math.max(probe.length, 1);
  if (norm <= 0.3) return Math.round(500 - norm * 200);
  return -1;
}

function preferredEntry(a, b) {
  // Preferimos entradas con camión indicado y con nota/itinerario más útiles.
  const aNoTruck = normalizeText(a.truck || "") === "no indicado";
  const bNoTruck = normalizeText(b.truck || "") === "no indicado";
  if (aNoTruck !== bNoTruck) return aNoTruck ? b : a;

  const aRouteScore = (a.itinerary || []).filter((x) => normalizeText(x).length > 4).length;
  const bRouteScore = (b.itinerary || []).filter((x) => normalizeText(x).length > 4).length;
  if (aRouteScore !== bRouteScore) return aRouteScore > bRouteScore ? a : b;

  return a;
}

function getMatches(query) {
  const qCanonical = canonicalStreetName(String(query || "").trim());
  const q = normalizeText(qCanonical);
  const qAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(qCanonical)));
  if (!q) return [];
  const ranked = routes
    .map((entry) => ({ entry, score: scoreMatch(q, entry, qAlt) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.entry);

  // Evitar calles repetidas en sugerencias (mismo nombre normalizado).
  const uniqueByStreet = new Map();
  for (const entry of ranked) {
    const key = streetDedupKey(entry.street);
    if (!uniqueByStreet.has(key)) {
      uniqueByStreet.set(key, entry);
      continue;
    }
    uniqueByStreet.set(key, preferredEntry(uniqueByStreet.get(key), entry));
  }

  return [...uniqueByStreet.values()].slice(0, 8);
}

function renderNotFound(query) {
  truckBanner.classList.add("hidden");
  result.classList.add("hidden");
  empty.textContent = `No encuentro resultados exactos para "${query}". Revisa las alternativas sugeridas en Jaén.`;
  empty.classList.remove("hidden");
  renderGoogleMapsRoute(query, "Ruta aproximada sin ficha");
  renderMapsAlternatives(query);
}

function renderEmpty() {
  truckBanner.classList.add("hidden");
  result.classList.add("hidden");
  empty.textContent = "Empieza a escribir para buscar una calle.";
  empty.classList.remove("hidden");
  mapsAnnex.classList.add("hidden");
  mapsAlt.classList.add("hidden");
  mapsAltList.innerHTML = "";
  mapsSteps.classList.add("hidden");
  mapsStepsList.innerHTML = "";
  if (mapsStepsMeta) mapsStepsMeta.textContent = "Ruta activa (más rápida ahora)";
  hideStepOverlay();
}

function renderPickFromListHint(query) {
  truckBanner.classList.add("hidden");
  result.classList.add("hidden");
  mapsAnnex.classList.add("hidden");
  mapsAlt.classList.add("hidden");
  mapsAltList.innerHTML = "";
  mapsSteps.classList.add("hidden");
  mapsStepsList.innerHTML = "";
  if (mapsStepsMeta) mapsStepsMeta.textContent = "Ruta activa (más rápida ahora)";
  hideStepOverlay();
  empty.textContent = query
    ? `Selecciona una calle del listado para abrir ficha o mapa: "${query}".`
    : "Empieza a escribir para buscar una calle.";
  empty.classList.remove("hidden");
}

function hideStepOverlay() {
  routeStepDetails = [];
  activeRouteStepIndex = 0;
  routeStepDisplayOffset = 0;
  if (stepOverlay) stepOverlay.classList.add("hidden");
  if (streetViewFrame) streetViewFrame.src = "";
  if (destinationPhotoWrap) destinationPhotoWrap.classList.add("hidden");
  if (destinationPhotoFrame) destinationPhotoFrame.src = "";
  if (destinationPhotoMeta) destinationPhotoMeta.textContent = "";
  if (widthEstimate) widthEstimate.classList.add("hidden");
  if (widthEstimateValue) widthEstimateValue.textContent = "Ancho estimado de vía: -";
  if (widthEstimateNote) widthEstimateNote.textContent = "Estimación orientativa, no medición oficial.";
}

function streetViewUrlForStep(step) {
  const lat = Number(step && step.lat);
  const lng = Number(step && step.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const ll = `${lat},${lng}`;
  return `https://maps.google.com/maps?q=&layer=c&cbll=${encodeURIComponent(ll)}&cbp=12,0,0,0,0&output=svembed`;
}

function bearingDegrees(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(brng);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStepInstructionHtml(step) {
  const instruction = String((step && step.instruction) || "Continúa")
    .replace(/^\s*\d+\.\s*/, "")
    .trim();
  const street = String((step && step.street) || "").trim();
  const toStreetPatterns = [
    /\bhacia\s+(.+)$/i,
    /\ben\s+direcci[oó]n\s+a\s+(.+)$/i,
    /\bdirecci[oó]n\s+a\s+(.+)$/i,
  ];
  for (const re of toStreetPatterns) {
    const match = instruction.match(re);
    if (!match || !match[1]) continue;
    const whole = String(match[0]);
    const streetPart = String(match[1]);
    const start = (match.index ?? 0) + whole.indexOf(streetPart);
    const end = start + streetPart.length;
    return `${escapeHtml(instruction.slice(0, start))}<span class="street-step-name">${escapeHtml(streetPart.trim())}</span>${escapeHtml(instruction.slice(end))}`;
  }
  const roadSegmentRe =
    /\b(?:C\/|C\.|Calle|Av\.|Avda\.|Avenida|Pl\.|Pza\.|Plaza|Paseo|Carretera|Ctra\.|Rda\.|Ronda)\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.\- ]+/i;
  const seg = instruction.match(roadSegmentRe);
  if (seg && seg[0]) {
    const match = seg[0].trim();
    const start = seg.index ?? instruction.indexOf(match);
    const end = start + match.length;
    return `${escapeHtml(instruction.slice(0, start))}<span class="street-step-name">${escapeHtml(match)}</span>${escapeHtml(instruction.slice(end))}`;
  }
  if (!street) return escapeHtml(instruction);
  const re = new RegExp(escapeRegExp(street), "i");
  const match = instruction.match(re);
  if (match && match.index !== undefined) {
    const start = match.index;
    const end = start + match[0].length;
    return `${escapeHtml(instruction.slice(0, start))}<span class="street-step-name">${escapeHtml(match[0])}</span>${escapeHtml(instruction.slice(end))}`;
  }
  return `${escapeHtml(instruction)} hacia <span class="street-step-name">${escapeHtml(street)}</span>`;
}

function normalizeInstructionKey(value = "") {
  return normalizeText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStreetKey(value = "") {
  return normalizeText(
    String(value || "")
      .replace(/\b(c\/|c\.|calle|av\.|avda\.|avenida|pl\.|pza\.|plaza|paseo|carretera|ctra\.|rda\.|ronda)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function dedupeConsecutiveSteps(steps = []) {
  const out = [];
  let prev = null;
  for (const step of steps) {
    const instruction = String(step && step.instruction ? step.instruction : "").trim();
    const street = String(step && step.street ? step.street : "").trim();
    if (!instruction) continue;
    const current = {
      ...step,
      __instrKey: normalizeInstructionKey(instruction),
      __streetKey: normalizeStreetKey(street),
    };
    if (!prev) {
      out.push(current);
      prev = current;
      continue;
    }
    const sameInstruction = current.__instrKey && current.__instrKey === prev.__instrKey;
    const sameStreet = current.__streetKey && current.__streetKey === prev.__streetKey;
    if (sameInstruction || sameStreet) {
      continue;
    }
    out.push(current);
    prev = current;
  }
  return out.map(({ __instrKey, __streetKey, ...step }) => step);
}

function renderActiveStepCard() {
  if (!stepOverlay || !stepKicker || !stepText || !stepDistance || !streetViewFrame) return;
  if (!routeStepDetails.length) {
    stepOverlay.classList.add("hidden");
    streetViewFrame.src = "";
    return;
  }
  const idx = Math.max(0, Math.min(activeRouteStepIndex, routeStepDetails.length - 1));
  activeRouteStepIndex = idx;
  const step = routeStepDetails[idx];
  const totalSteps = routeStepDetails.length + routeStepDisplayOffset;
  stepKicker.textContent = `Paso ${idx + 1 + routeStepDisplayOffset} de ${totalSteps}`;
  stepText.innerHTML = buildStepInstructionHtml(step);
  stepDistance.textContent = String(step && step.distanceText ? step.distanceText : "");
  const sv = streetViewUrlForStep(step);
  if (sv) streetViewFrame.src = sv;
  stepOverlay.classList.remove("hidden");
}

function renderDestinationPhotoFromSteps() {
  if (!destinationPhotoWrap || !destinationPhotoFrame) return;
  if (!routeStepDetails.length) {
    destinationPhotoWrap.classList.add("hidden");
    destinationPhotoFrame.src = "";
    if (destinationPhotoMeta) destinationPhotoMeta.textContent = "";
    return;
  }
  const destinationHint = canonicalStreetName(
    (currentEntry && (currentEntry.fullDestination || currentEntry.street)) || input.value || ""
  );
  const destinationStep = findBestDestinationStep(routeStepDetails, destinationHint);
  const lat = Number(destinationStep && destinationStep.lat);
  const lng = Number(destinationStep && destinationStep.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    destinationPhotoWrap.classList.add("hidden");
    destinationPhotoFrame.src = "";
    if (destinationPhotoMeta) destinationPhotoMeta.textContent = "";
    return;
  }
  const street = String(destinationStep && destinationStep.street ? destinationStep.street : "").trim();
  const endLat = Number(destinationStep && destinationStep.endLat);
  const endLng = Number(destinationStep && destinationStep.endLng);
  const hasSegment = Number.isFinite(endLat) && Number.isFinite(endLng);
  // Punto aproximado "dentro" de la calle: centro del último tramo, ligeramente hacia el final.
  const centerBias = 0.62;
  const viewLat = hasSegment ? lat + (endLat - lat) * centerBias : lat;
  const viewLng = hasSegment ? lng + (endLng - lng) * centerBias : lng;
  const prev = routeStepDetails.length > 1 ? routeStepDetails[routeStepDetails.length - 2] : null;
  let heading = 0;
  if (hasSegment) {
    heading = bearingDegrees(viewLat, viewLng, endLat, endLng);
  } else if (prev) {
    const pLat = Number(prev.lat);
    const pLng = Number(prev.lng);
    if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
      heading = bearingDegrees(pLat, pLng, lat, lng);
    }
  }
  const ll = `${viewLat},${viewLng}`;
  destinationPhotoFrame.src = `https://maps.google.com/maps?q=&layer=c&cbll=${encodeURIComponent(ll)}&cbp=12,${heading},0,0,0&output=svembed`;
  renderWidthEstimate(destinationStep);
  if (destinationPhotoMeta) {
    destinationPhotoMeta.textContent = street
      ? `Destino aproximado (centro de tramo): ${street}`
      : "Destino aproximado (centro de tramo)";
  }
  destinationPhotoWrap.classList.remove("hidden");
}

function destinationTokens(text = "") {
  const cleaned = normalizeText(text).replace(/[.,;:()/-]/g, " ");
  const stop = new Set([
    "calle",
    "c",
    "av",
    "avda",
    "avenida",
    "plaza",
    "paseo",
    "carretera",
    "camino",
    "ronda",
    "travesia",
    "cuesta",
    "glorieta",
    "bulevar",
    "del",
    "de",
    "la",
    "los",
    "las",
    "el"
  ]);
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t));
}

function findBestDestinationStep(steps = [], destination = "") {
  if (!Array.isArray(steps) || !steps.length) return null;
  const target = normalizeText(destination);
  const tokens = destinationTokens(destination);
  let best = null;
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] || {};
    const street = normalizeText(canonicalStreetName(String(step.street || "")));
    if (!street) continue;
    let score = 0;
    if (target && (street.includes(target) || target.includes(street))) score += 8;
    for (const token of tokens) {
      if (street.includes(token)) score += 2;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { step, score, index: i };
    }
  }
  return best ? best.step : steps[steps.length - 1];
}

function estimateStreetWidth(step) {
  const street = normalizeText(String(step && step.street ? step.street : ""));
  const instruction = normalizeText(String(step && step.instruction ? step.instruction : ""));
  const combined = `${street} ${instruction}`.trim();
  // Rangos orientativos operativos para apoyo rápido.
  if (/autovia|autopista|ronda|circunvalacion|carretera|ctra|avenida|avda|av\./i.test(combined)) {
    return { range: "10.0-16.0 m", label: "ancha" };
  }
  if (/plaza|paseo|bulevar|boulevard/i.test(combined)) {
    return { range: "8.0-12.0 m", label: "media-ancha" };
  }
  if (/travesia|tr\.|camino/i.test(combined)) {
    return { range: "6.0-9.0 m", label: "media" };
  }
  if (/callejon|callejon|pasaje|cuesta/i.test(combined)) {
    return { range: "3.5-5.5 m", label: "estrecha" };
  }
  return { range: "5.5-8.0 m", label: "media" };
}

function renderWidthEstimate(step) {
  if (!widthEstimate || !widthEstimateValue || !widthEstimateNote) return;
  const estimate = estimateStreetWidth(step);
  widthEstimateValue.textContent = `Ancho estimado de vía: ${estimate.range} (${estimate.label})`;
  widthEstimateNote.textContent = "Estimación orientativa basada en tipo de vía y contexto de ruta; no es medición oficial.";
  widthEstimate.classList.remove("hidden");
}

function inferArrivalZoom(destination = "") {
  const text = normalizeText(destination);
  if (!text) return 13;
  if (
    text.includes("magdalena") ||
    text.includes("san ildefonso") ||
    text.includes("penasmefecit") ||
    text.includes("penamefecit") ||
    text.includes("centro") ||
    text.includes("catedral")
  ) {
    return 15;
  }
  if (
    text.includes("carretera") ||
    text.includes("ctra") ||
    text.includes("circunvalacion") ||
    text.includes("poligono") ||
    text.includes("urbanizacion")
  ) {
    return 12;
  }
  return 14;
}

function renderGoogleMapsRoute(destination, title = "Ruta en Google Maps", zoomOverride = null) {
  const dest = formatDestinationForMaps(destination);
  if (!dest) {
    mapsAnnex.classList.add("hidden");
    return;
  }
  const saddr = encodeURIComponent(FIRE_STATION_ORIGIN);
  const daddr = encodeURIComponent(`${dest}, Jaén capital, 23000, España`);
  const inferred = inferArrivalZoom(destination);
  const safeZoom = Number.isFinite(zoomOverride)
    ? Math.max(10, Math.min(18, Math.round(zoomOverride)))
    : inferred;
  const embedUrl = `https://www.google.com/maps?output=embed&saddr=${saddr}&daddr=${daddr}&dirflg=d&layer=t&z=${safeZoom}`;
  const openUrl = `https://www.google.com/maps/dir/?api=1&origin=${saddr}&destination=${daddr}&travelmode=driving`;
  mapsFrame.src = embedUrl;
  mapsOpen.href = openUrl;
  mapsTitle.textContent = title;
  mapsAnnex.classList.remove("hidden");
  mapsSteps.classList.remove("hidden");
  mapsStepsList.innerHTML = "<li>Cargando indicaciones...</li>";
  if (mapsStepsMeta) mapsStepsMeta.textContent = "Ruta activa (más rápida ahora)";
  const seq = ++routeStepsSeq;
  fetchRouteSteps(dest, seq).catch(() => {});
}

async function fetchRouteSteps(destination, seq) {
  try {
    const data = await fetchJson(`/api/route-steps?to=${encodeURIComponent(destination)}`, {
      credentials: "include",
    });
    if (seq !== routeStepsSeq) return;
    const stepsDetailed = Array.isArray(data.stepsDetailed) ? data.stepsDetailed : [];
    const streets = Array.isArray(data.streets) ? data.streets.filter(Boolean) : [];
    const instructions = Array.isArray(data.instructions) ? data.instructions.filter(Boolean) : [];
    routeStepDetails = stepsDetailed.filter(
      (step) =>
        step &&
        Number.isFinite(Number(step.lat)) &&
        Number.isFinite(Number(step.lng)) &&
        String(step.instruction || "").trim()
    );
    if (routeStepDetails.length > 1) {
      routeStepDisplayOffset = 1;
      routeStepDetails = routeStepDetails.slice(1);
    } else {
      routeStepDisplayOffset = 0;
    }
    routeStepDetails = dedupeConsecutiveSteps(routeStepDetails);
    activeRouteStepIndex = 0;
    if (routeStepDetails.length) {
      renderActiveStepCard();
      renderDestinationPhotoFromSteps();
    } else {
      hideStepOverlay();
    }
    const listStart = routeStepDetails.length ? 1 + routeStepDisplayOffset : 1;
    mapsStepsList.setAttribute("start", String(listStart));
    const listHtml = routeStepDetails.length
      ? routeStepDetails
          .map((step) => {
            const dist = String(step.distanceText || "").trim();
            return `<li>${buildStepInstructionHtml(step)}${dist ? ` <span class="muted">(${escapeHtml(dist)})</span>` : ""}</li>`;
          })
          .join("")
      : streets.length
      ? streets.map((street) => `<li><span class="street-step-name">${escapeHtml(street)}</span></li>`).join("")
      : instructions
          .map((ins) => `<li>${escapeHtml(ins)}</li>`)
          .join("");
    if (!listHtml) {
      mapsSteps.classList.add("hidden");
      mapsStepsList.innerHTML = "";
      return;
    }
    mapsSteps.classList.remove("hidden");
    if (mapsStepsMeta) {
      mapsStepsMeta.textContent =
        data.source === "google" ? "Ruta activa (más rápida ahora)" : "Ruta estimada (fallback)";
    }
    mapsStepsList.innerHTML = listHtml;
  } catch {
    if (seq !== routeStepsSeq) return;
    mapsSteps.classList.remove("hidden");
    if (mapsStepsMeta) mapsStepsMeta.textContent = "Ruta activa (más rápida ahora)";
    mapsStepsList.innerHTML = "<li>No se pudieron cargar las indicaciones ahora mismo.</li>";
    hideStepOverlay();
  }
}

function getAlternativeStreetCandidates(query, limit = 6) {
  const q = normalizeText(query);
  if (!q || q.length < 2) return [];
  const scored = routes
    .map((entry) => {
      const s = normalizeText(canonicalStreetName(entry.street));
      let score = -1;
      if (s.includes(q)) score = 100 - s.indexOf(q);
      else {
        const d = levenshtein(q, s.slice(0, Math.max(12, q.length + 3)));
        const ratio = d / Math.max(q.length, 1);
        if (ratio <= 0.6) score = 60 - Math.round(ratio * 40);
      }
      return { entry, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const out = [];
  for (const { entry } of scored) {
    const k = normalizeText(canonicalStreetName(entry.street));
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function renderMapsAlternatives(query) {
  const alts = getAlternativeStreetCandidates(query);
  if (!alts.length) {
    mapsAlt.classList.add("hidden");
    mapsAltList.innerHTML = "";
    return;
  }
  mapsAltList.innerHTML = alts
    .map(
      (entry, index) => `
      <button class="maps-alt-btn" type="button" data-index="${index}">
        ${escapeHtml(entry.street)}
      </button>
    `
    )
    .join("");
  mapsAlt.classList.remove("hidden");
  mapsAltList.onclick = (event) => {
    const btn = event.target.closest(".maps-alt-btn");
    if (!btn) return;
    const picked = alts[Number(btn.dataset.index)];
    if (!picked) return;
    renderGoogleMapsRoute(picked.fullDestination || picked.street, "Ruta alternativa en Jaén");
    selectEntry(picked);
    mapsAlt.classList.add("hidden");
    mapsAltList.innerHTML = "";
  };
}

function formatDestinationForMaps(value = "") {
  let text = canonicalStreetName(String(value).trim());
  if (!text) return "";
  // Quitamos etiquetas de zona para no confundir la búsqueda.
  text = text.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  // Expandimos abreviaturas frecuentes del callejero.
  text = text
    .replace(/\bPza\.?\b/gi, "Plaza")
    .replace(/\bAvda\.?\b/gi, "Avenida")
    .replace(/\bAv\.?\b/gi, "Avenida")
    .replace(/\bCtra\.?\b/gi, "Carretera")
    .replace(/\bC\/\b/gi, "Calle ")
    .replace(/\bN[úu]m\.?\s*/gi, "");
  text = text.replace(/\s{2,}/g, " ").trim();

  // Si no trae tipo de vía, forzamos "Calle" para evitar que Google interprete
  // el texto como otro municipio.
  const hasRoadType = /^(calle|avenida|plaza|carretera|camino|paseo|ronda|traves[íi]a|cuesta|bulevar|glorieta|parque|urbanizaci[óo]n)\b/i.test(
    text
  );
  if (!hasRoadType) {
    text = `Calle ${text}`;
  }
  return text;
}

function renderMatch(entry) {
  currentEntry = entry;
  truckBanner.textContent = `Camión: ${entry.truck || "No indicado"}`;
  truckBanner.classList.remove("hidden");
  result.classList.remove("hidden");
  empty.classList.add("hidden");

  const routeItems = entry.itinerary.map((step) => `<li>${escapeHtml(canonicalStreetName(step))}</li>`).join("");
  const displayDestination = canonicalStreetName(entry.fullDestination || entry.street);
  const mapBlock = entry.mapImage
    ? `
      <strong>Plano completo:</strong>
      <figure class="map-card">
        <img src="${entry.mapImage}" alt="Plano de ${displayDestination}" loading="lazy" />
        <button class="map-overlay" type="button" data-map-image="${entry.mapImage}" data-map-pdf="${entry.mapPdf || ""}" data-map-title="${displayDestination}" aria-label="Ampliar plano"></button>
      </figure>
      <button class="map-open" type="button" data-map-image="${entry.mapImage}" data-map-pdf="${entry.mapPdf || ""}" data-map-title="${displayDestination}">Ampliar plano</button>
    `
    : entry.mapPdf
    ? `
      <strong>Plano completo (PDF):</strong>
      <figure class="map-card">
        <iframe class="route-pdf-frame" src="${entry.mapPdf}#page=1&view=FitH&navpanes=0" title="Plano de ${displayDestination}" loading="lazy"></iframe>
        <button class="map-overlay" type="button" data-map-pdf="${entry.mapPdf}" data-map-title="${displayDestination}" aria-label="Ampliar plano"></button>
      </figure>
      <button class="map-open" type="button" data-map-pdf="${entry.mapPdf}" data-map-title="${displayDestination}">Ampliar plano</button>
    `
    : "";

  result.innerHTML = `
    <h2>${escapeHtml(displayDestination)}</h2>
    <strong>Itinerario:</strong>
    <ol class="route">${routeItems}</ol>
    ${mapBlock}
    <p class="muted"><strong>Zona:</strong> ${escapeHtml(zoneOf(entry))}</p>
    <p class="muted"><strong>Nota:</strong> ${escapeHtml(entry.notes)}</p>
    <p class="muted"><strong>Origen:</strong> ${escapeHtml(entry.sourcePdf)}</p>
    ${
      isAdmin
        ? `<div class="result-actions">
      <button class="btn btn-primary edit-entry" type="button" data-source-pdf="${escapeHtml(entry.sourcePdf)}">Editar ficha</button>
      <button class="btn btn-ghost reset-entry" type="button" data-source-pdf="${escapeHtml(entry.sourcePdf)}">Restablecer cambios</button>
    </div>`
        : ""
    }
  `;
  renderGoogleMapsRoute(entry.fullDestination || entry.street, "Ruta desde Parque de Bomberos de Jaén");
  mapsAlt.classList.add("hidden");
  mapsAltList.innerHTML = "";
}

function renderEditForm(entry) {
  const itineraryText = (entry.itinerary || []).join("\n");
  result.innerHTML += `
    <form class="edit-form" data-source-pdf="${escapeHtml(entry.sourcePdf)}">
      <label>Destino
        <input name="fullDestination" value="${escapeHtml(entry.fullDestination)}" />
      </label>
      <label>Camión
        <input name="truck" value="${escapeHtml(entry.truck)}" />
      </label>
      <label>Itinerario (una calle por línea)
        <textarea name="itinerary">${escapeHtml(itineraryText)}</textarea>
      </label>
      <label>Notas
        <textarea name="notes">${escapeHtml(entry.notes || "")}</textarea>
      </label>
      <label>Plano PDF (ruta relativa)
        <input name="mapPdf" value="${escapeHtml(entry.mapPdf || "")}" placeholder="./calles/mi-plano.pdf" />
      </label>
      <label>Subir nuevo plano PDF
        <input name="mapPdfFile" type="file" accept="application/pdf,.pdf" />
      </label>
      <div class="muted upload-meta" data-upload-meta></div>
      <div class="result-actions">
        <button class="btn btn-primary" type="submit">Guardar cambios</button>
        <button class="btn btn-ghost cancel-edit" type="button">Cancelar</button>
      </div>
    </form>
  `;
}

function makeManualSourcePdf(street) {
  const base = normalizeText(street).replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
  return `manual::${base || "calle"}.pdf`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const out = String(reader.result || "");
      const comma = out.indexOf(",");
      resolve(comma >= 0 ? out.slice(comma + 1) : out);
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

async function uploadAdminPdf(file) {
  if (!apiAvailable) {
    throw new Error("upload_requires_backend");
  }
  const contentBase64 = await fileToBase64(file);
  const data = await fetchJson("/api/admin/upload-pdf", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name || "plano.pdf",
      contentBase64,
    }),
  });
  if (!data || !data.ok || !data.mapPdf) {
    throw new Error("upload_failed");
  }
  return data.mapPdf;
}

function hideSuggestions() {
  suggestions.classList.add("hidden");
  suggestions.innerHTML = "";
  suggestionMatches = [];
  activeSuggestionIndex = -1;
}

function renderSuggestions(matches) {
  if (!matches.length) {
    hideSuggestions();
    return;
  }
  suggestionMatches = matches;
  activeSuggestionIndex = -1;
  suggestions.classList.remove("hidden");
  suggestions.innerHTML = matches
    .map((item, index) => {
      const entry = item.entry;
      const street = canonicalStreetName(item.street || entry?.street || "");
      const truckText = entry ? `Camión: ${entry.truck}` : "Sin ficha";
      const zoneText = entry ? `Zona: ${zoneOf(entry)}` : "Google Maps Jaén";
      return `
      <li class="suggestion-item" data-index="${index}" role="button" tabindex="0">
        <div class="suggestion-row">
          <div class="suggestion-main">${escapeHtml(street)}</div>
          ${
            item.hasFicha
              ? '<span class="suggestion-map-icon" title="Con ficha/plano" aria-label="Con ficha/plano">🗺️</span>'
              : ""
          }
        </div>
        <div class="suggestion-sub">${escapeHtml(truckText)} · ${escapeHtml(zoneText)}</div>
      </li>
    `
    })
    .join("");
}

function selectEntry(entry) {
  input.value = canonicalStreetName(entry.street);
  editingSourcePdf = null;
  renderMatch(entry);
  hideSuggestions();
}

function renderMapOnlyStreet(street) {
  const clean = canonicalStreetName(String(street || "").trim());
  if (!clean) {
    renderEmpty();
    return;
  }
  const manualEntry = {
    street: clean,
    fullDestination: clean,
    truck: "No indicado",
    itinerary: [],
    notes: "",
    sourcePdf: makeManualSourcePdf(clean),
    mapPdf: "",
  };
  currentEntry = manualEntry;
  truckBanner.textContent = "Camión: No indicado";
  truckBanner.classList.remove("hidden");
  if (isAdmin) {
    result.classList.remove("hidden");
    empty.classList.add("hidden");
    result.innerHTML = `
      <h2>${escapeHtml(clean)}</h2>
      <p class="muted">Esta calle no tiene ficha aún. Puedes crearla ahora y subir su plano PDF.</p>
      <div class="result-actions">
        <button class="btn btn-primary create-entry" type="button" data-source-pdf="${escapeHtml(
          manualEntry.sourcePdf
        )}">Crear ficha</button>
      </div>
    `;
  } else {
    result.classList.add("hidden");
    empty.textContent = `La calle "${clean}" no tiene ficha PDF. Mostrando ruta en Google Maps (Jaén).`;
    empty.classList.remove("hidden");
  }
  renderGoogleMapsRoute(clean, "Ruta desde Parque de Bomberos de Jaén");
  mapsAlt.classList.add("hidden");
  mapsAltList.innerHTML = "";
}

function selectSuggestion(item) {
  if (!item) return;
  const street = item.street || item.entry?.street || "";
  input.value = street;
  editingSourcePdf = null;
  if (item.entry) {
    selectEntry(item.entry);
    return;
  }
  hideSuggestions();
  renderMapOnlyStreet(street);
}

function activateSuggestion(index) {
  const items = [...suggestions.querySelectorAll(".suggestion-item")];
  items.forEach((item) => item.classList.remove("active"));
  if (index >= 0 && index < items.length) {
    items[index].classList.add("active");
    items[index].scrollIntoView({ block: "nearest" });
  }
}

function needsReview(entry) {
  const notes = normalizeText(entry.notes || "");
  const itinerary = entry.itinerary || [];
  if (!itinerary.length) return true;
  if (itinerary.some((x) => normalizeText(x).includes("sin itinerario extraido automaticamente"))) return true;
  if (notes.includes("sin nota operativa detectada automaticamente")) return true;
  if (itinerary.some((x) => normalizeText(x).length <= 4)) return true;
  return false;
}

function renderPendingList() {
  adminPanelTitle.textContent = "Pendientes de revisión";
  const pending = routes.filter(needsReview).slice(0, 400);
  if (!pending.length) {
    adminList.innerHTML = '<div class="admin-item"><div class="admin-item-title">Sin pendientes detectados</div></div>';
    return;
  }
  adminList.innerHTML = pending
    .map(
      (entry) => `
      <div class="admin-item">
        <div>
          <div class="admin-item-title">${escapeHtml(entry.street)}</div>
          <div class="admin-item-sub">${escapeHtml(entry.sourcePdf)} · Camión: ${escapeHtml(entry.truck)}</div>
        </div>
        <button class="btn btn-primary review-entry" type="button" data-source-pdf="${escapeHtml(entry.sourcePdf)}">Revisar</button>
      </div>
    `
    )
    .join("");
}

async function renderFeedbackList() {
  adminPanelTitle.textContent = "Comentarios recibidos";
  if (!apiAvailable) {
    adminList.innerHTML = '<div class="admin-item"><div class="admin-item-title">No disponible sin backend</div></div>';
    return;
  }
  try {
    const rows = await fetchJson("/api/feedback", { credentials: "include" });
    if (!rows.length) {
      adminList.innerHTML = '<div class="admin-item"><div class="admin-item-title">No hay comentarios</div></div>';
      return;
    }
    adminList.innerHTML = rows
      .slice(0, 300)
      .map((row) => {
        const when = new Date(row.createdAt).toLocaleString("es-ES");
        return `
        <div class="admin-item">
          <div>
            <div class="admin-item-title">${escapeHtml(row.street || "Sin calle")}</div>
            <div class="admin-item-sub">${escapeHtml(row.sourcePdf || "-")} · ${escapeHtml(when)}</div>
            <div style="margin-top:6px;">${escapeHtml(row.message)}</div>
          </div>
        </div>
      `;
      })
      .join("");
  } catch {
    adminList.innerHTML = '<div class="admin-item"><div class="admin-item-title">Error cargando comentarios</div></div>';
  }
}

async function persistOverrides() {
  if (apiAvailable) {
    await fetchJson("/api/overrides", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    });
  } else {
    saveOverridesLocal();
  }
}

async function refreshQueryRender() {
  const q = input.value.trim();
  if (!q) {
    renderEmpty();
    hideSuggestions();
    return;
  }
  await handleSearchInput(q);
}

const streetIndexCache = new Map();

function localIndexSearch(query) {
  const qCanonical = canonicalStreetName(String(query || "").trim());
  const q = normalizeText(qCanonical);
  const qAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(qCanonical)));
  if (!q) return [];
  const scored = [];
  for (const name of localStreetIndex) {
    const canon = canonicalStreetName(name);
    const s = normalizeText(canon);
    const sAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(canon)));
    let score = -1;
    if (s.startsWith(q) || sAlt.startsWith(q)) score = 120 - (s.length - q.length);
    else if (qAlt && (s.startsWith(qAlt) || sAlt.startsWith(qAlt))) score = 110 - (sAlt.length - qAlt.length);
    else if (s.includes(q) || sAlt.includes(q)) score = 100 - Math.min(s.indexOf(q), sAlt.indexOf(q));
    else if (qAlt && (s.includes(qAlt) || sAlt.includes(qAlt))) score = 90 - Math.min(s.indexOf(qAlt), sAlt.indexOf(qAlt));
    if (score >= 0) scored.push({ name: canon, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const row of scored) {
    const key = streetDedupKey(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row.name);
    if (out.length >= 20) break;
  }
  return out;
}

async function fetchStreetIndex(query) {
  const q = String(query || "").trim().replace(/\bcajen\b/gi, "jaen");
  if (!q || q.length < 2) return [];
  const key = normalizeText(q);
  if (streetIndexCache.has(key)) return streetIndexCache.get(key);

  if (apiAvailable) {
    try {
      const data = await fetchJson(`/api/street-index?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const out = Array.isArray(data.streets) ? data.streets : [];
      streetIndexCache.set(key, out);
      return out;
    } catch {
      // Fallback local si no hay backend/servicio.
    }
  }

  const local = localIndexSearch(q);
  streetIndexCache.set(key, local);
  return local;
}

async function buildSuggestions(query) {
  const routeMatches = getMatches(query);
  const fromRoutes = routeMatches.map((entry) => ({
    street: canonicalStreetName(entry.street),
    entry,
    hasFicha: true,
  }));

  const indexNames = await fetchStreetIndex(query);
  const seen = new Set(fromRoutes.map((x) => streetDedupKey(x.street)));
  const merged = [...fromRoutes];
  for (const name of indexNames) {
    const canonicalName = canonicalStreetName(name);
    const key = streetDedupKey(canonicalName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const routeEntry = findRouteEntryByStreetName(canonicalName);
    merged.push({
      street: canonicalName,
      entry: routeEntry,
      hasFicha: Boolean(routeEntry),
    });
  }
  return merged.slice(0, 12);
}

async function handleSearchInput(query) {
  const q = String(query || "").trim();
  const canonicalQuery = canonicalStreetName(q);
  const normalizedQuery = normalizeText(canonicalQuery);
  const normalizedQueryAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(canonicalQuery)));
  if (!normalizedQuery) {
    renderEmpty();
    hideSuggestions();
    return;
  }

  const seq = ++searchSeq;
  const merged = await buildSuggestions(q);
  if (seq !== searchSeq) return;

  renderSuggestions(merged);
  if (!merged.length) {
    renderNotFound(q);
    return;
  }

  const exact = merged.find((x) => {
    const sx = normalizeText(canonicalStreetName(x.street));
    const sxAlt = normalizeText(stripLeadingArticle(stripRoadPrefix(canonicalStreetName(x.street))));
    return sx === normalizedQuery || sxAlt === normalizedQueryAlt || sx === normalizedQueryAlt || sxAlt === normalizedQuery;
  });
  if (exact) {
    const entry = exact.entry || findRouteEntryByStreetName(exact.street);
    if (entry) {
      renderMatch(entry);
      return;
    }
    renderMapOnlyStreet(exact.street);
    return;
  }
  renderPickFromListHint(q);
}

async function init() {
  setLoadingProgress(8, "Iniciando");
  await detectApi();
  setLoadingProgress(18, "Conectando");

  try {
    const idx = await fetchJson("./data/street_index.json");
    localStreetIndex = Array.isArray(idx.streets) ? idx.streets : [];
  } catch {
    localStreetIndex = [];
  }
  setLoadingProgress(42, "Cargando índice de calles");

  if (apiAvailable) {
    try {
      baseRoutes = await fetchJson("/api/routes", { credentials: "include" });
      overrides = await fetchJson("/api/overrides", { credentials: "include" });
    } catch {
      baseRoutes = await fetchJson("./data/routes.json");
      loadOverridesLocal();
    }
  } else {
    baseRoutes = await fetchJson("./data/routes.json");
    loadOverridesLocal();
  }
  setLoadingProgress(76, "Procesando fichas");

  routes = applyOverrides(baseRoutes);
  rebuildRouteIndex();
  setLoadingProgress(92, "Preparando interfaz");
  setAdminUi();
  setActiveMode("consult");
  finishLoadingProgress();

  consultToggle.addEventListener("click", () => {
    setActiveMode("consult");
  });

  reviewToggle.addEventListener("click", () => {
    setActiveMode("review");
  });

  reviewStart.addEventListener("click", () => {
    startReviewModeRound();
  });

  if (reviewAddLine) {
    reviewAddLine.addEventListener("click", () => {
      addReviewLine();
    });
  }

  if (reviewItineraryLines) {
    reviewItineraryLines.addEventListener("keydown", (event) => {
      const target = event.target;
      if (!target || !target.classList || !target.classList.contains("review-line-input")) return;
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      const idx = Number(target.getAttribute("data-line-index") || "-1");
      const currentInputs = getReviewLineInputs();
      const next = Number.isFinite(idx) ? currentInputs[idx + 1] : null;
      if (next) next.focus();
    });
  }

  reviewCheck.addEventListener("click", () => {
    if (!reviewCurrentStreet) {
      reviewFeedback.textContent = "Genera una calle para comenzar el repaso.";
      return;
    }
    const guessedTruck = normalizeTruckGuess(reviewTruckInput.value);
    const guessedItin = getReviewItineraryGuess();
    if (reviewCurrentEntry) {
      const realTruck = normalizeTruckGuess(reviewCurrentEntry.truck || "No indicado");
      const realItin = (reviewCurrentEntry.itinerary || []).map((x) => canonicalStreetName(x));
      const truckOk = guessedTruck && guessedTruck === realTruck;
      const itinScore = scoreItinerary(guessedItin, realItin);
      reviewFeedback.textContent = `Camión: ${truckOk ? "correcto" : "revisar"} · Itinerario: ${itinScore}% de acierto. Mostrando ficha real.`;
      renderMatch(reviewCurrentEntry);
      return;
    }
    reviewFeedback.textContent = "No hay ficha para esta calle. Mostrando ruta en Google Maps.";
    renderMapOnlyStreet(reviewCurrentStreet);
  });

  if (stepStartBtn) {
    stepStartBtn.addEventListener("click", () => {
      if (!routeStepDetails.length) return;
      activeRouteStepIndex = 0;
      renderActiveStepCard();
    });
  }

  if (stepPrevBtn) {
    stepPrevBtn.addEventListener("click", () => {
      if (!routeStepDetails.length) return;
      activeRouteStepIndex = Math.max(0, activeRouteStepIndex - 1);
      renderActiveStepCard();
    });
  }

  if (stepNextBtn) {
    stepNextBtn.addEventListener("click", () => {
      if (!routeStepDetails.length) return;
      activeRouteStepIndex = Math.min(routeStepDetails.length - 1, activeRouteStepIndex + 1);
      renderActiveStepCard();
    });
  }

  if (stepEndBtn) {
    stepEndBtn.addEventListener("click", () => {
      if (!routeStepDetails.length) return;
      activeRouteStepIndex = routeStepDetails.length - 1;
      renderActiveStepCard();
    });
  }

  adminToggle.addEventListener("click", async () => {
    if (isAdmin) {
      if (apiAvailable) {
        await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      }
      isAdmin = false;
      editingSourcePdf = null;
      setAdminUi();
      await refreshQueryRender();
      return;
    }

    const pwd = window.prompt("Introduce la clave de administrador:");
    if (!pwd) return;

    if (apiAvailable) {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (!res.ok) {
        window.alert("Clave incorrecta.");
        return;
      }
      isAdmin = true;
    } else {
      if (pwd !== LEGACY_ADMIN_PASSWORD) {
        window.alert("Clave incorrecta.");
        return;
      }
      isAdmin = true;
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    }

    setAdminUi();
    renderPendingList();
    await refreshQueryRender();
  });

  pendingToggle.addEventListener("click", () => {
    if (!isAdmin) return;
    adminPanelMode = "pending";
    adminPanel.classList.toggle("open");
    if (adminPanel.classList.contains("open")) {
      renderPendingList();
    }
  });

  feedbackToggle.addEventListener("click", async () => {
    if (!isAdmin) return;
    adminPanelMode = "feedback";
    adminPanel.classList.add("open");
    await renderFeedbackList();
  });

  feedbackRefresh.addEventListener("click", async () => {
    if (!isAdmin) return;
    if (adminPanelMode === "feedback") {
      await renderFeedbackList();
      return;
    }
    renderPendingList();
  });

  const onSearchInput = () => {
    const query = input.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      handleSearchInput(query).catch(() => {});
    }, 140);
  };

  input.addEventListener("input", onSearchInput);

  feedbackSend.addEventListener("click", async () => {
    if (isAdmin) {
      return;
    }
    const message = feedbackText.value.trim();
    if (message.length < 3) {
      feedbackMeta.textContent = "Escribe al menos 3 caracteres.";
      return;
    }
    const payload = {
      message,
      street: currentEntry?.street || input.value.trim() || "",
      sourcePdf: currentEntry?.sourcePdf || "",
    };
    try {
      if (apiAvailable) {
        await fetchJson("/api/feedback", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const cache = JSON.parse(localStorage.getItem("callejeroOfflineFeedback") || "[]");
        cache.unshift({ ...payload, createdAt: new Date().toISOString() });
        localStorage.setItem("callejeroOfflineFeedback", JSON.stringify(cache.slice(0, 200)));
      }
      feedbackText.value = "";
      feedbackMeta.textContent = "Comentario enviado al administrador.";
    } catch {
      feedbackMeta.textContent = "No se pudo enviar el comentario.";
    }
  });

  input.addEventListener("keydown", (event) => {
    if (suggestions.classList.contains("hidden")) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestionMatches.length - 1);
      activateSuggestion(activeSuggestionIndex);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      activateSuggestion(activeSuggestionIndex);
      return;
    }
    if (event.key === "Enter" && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestionMatches[activeSuggestionIndex]);
    }
  });

  suggestions.addEventListener("click", (event) => {
    const item = event.target.closest(".suggestion-item");
    if (!item) return;
    const entry = suggestionMatches[Number(item.dataset.index)];
    if (entry) selectSuggestion(entry);
  });

  document.addEventListener("click", (event) => {
    if (event.target === input || suggestions.contains(event.target)) return;
    hideSuggestions();
  });

  result.addEventListener("click", async (event) => {
    const btn = event.target.closest(".map-open, .map-overlay");
    if (!btn) return;
    const pdf = btn.getAttribute("data-map-pdf");
    const image = btn.getAttribute("data-map-image");
    const title = btn.getAttribute("data-map-title") || "Plano ampliado";
    if (!pdf && !image) return;

    if (image) {
      mapModalImage.src = image;
      mapModalImage.style.display = "block";
      mapModalFrame.style.display = "none";
      mapModalFrame.src = "";
    } else {
      mapModalFrame.src = `${pdf}#page=1&view=FitH&navpanes=0`;
      mapModalFrame.style.display = "block";
      mapModalImage.style.display = "none";
      mapModalImage.src = "";
    }

    mapModalTitle.textContent = title;
    mapModal.classList.add("open");
    mapModal.setAttribute("aria-hidden", "false");
  });

  result.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".edit-entry");
    if (editBtn) {
      if (!isAdmin) return;
      const sourcePdf = editBtn.getAttribute("data-source-pdf");
      const entry = routes.find((x) => x.sourcePdf === sourcePdf);
      if (!entry) return;
      editingSourcePdf = sourcePdf;
      renderMatch(entry);
      renderEditForm(entry);
      return;
    }

    const cancelBtn = event.target.closest(".cancel-edit");
    if (cancelBtn && editingSourcePdf) {
      const entry = routes.find((x) => x.sourcePdf === editingSourcePdf);
      editingSourcePdf = null;
      if (entry) renderMatch(entry);
      return;
    }

    const resetBtn = event.target.closest(".reset-entry");
    if (resetBtn) {
      if (!isAdmin) return;
      const sourcePdf = resetBtn.getAttribute("data-source-pdf");
      if (sourcePdf && overrides[sourcePdf]) {
        delete overrides[sourcePdf];
        persistOverrides().catch(() => {});
        routes = applyOverrides(baseRoutes);
        rebuildRouteIndex();
      }
      const fresh = routes.find((x) => x.sourcePdf === sourcePdf);
      if (fresh) renderMatch(fresh);
      if (isAdmin && adminPanel.classList.contains("open")) {
        if (adminPanelMode === "feedback") {
          await renderFeedbackList();
        } else {
          renderPendingList();
        }
      }
    }

    const createBtn = event.target.closest(".create-entry");
    if (createBtn) {
      if (!isAdmin) return;
      const street = input.value.trim() || currentEntry?.street || "";
      const clean = canonicalStreetName(street);
      const manualEntry = {
        street: clean,
        fullDestination: clean,
        truck: "No indicado",
        itinerary: [],
        notes: "",
        sourcePdf: createBtn.getAttribute("data-source-pdf") || makeManualSourcePdf(clean),
        mapPdf: "",
      };
      editingSourcePdf = manualEntry.sourcePdf;
      renderMapOnlyStreet(clean);
      renderEditForm(manualEntry);
    }
  });

  adminList.addEventListener("click", (event) => {
    const btn = event.target.closest(".review-entry");
    if (!btn || !isAdmin) return;
    const sourcePdf = btn.getAttribute("data-source-pdf");
    const entry = routes.find((x) => x.sourcePdf === sourcePdf);
    if (!entry) return;
    selectEntry(entry);
    editingSourcePdf = sourcePdf;
    renderMatch(entry);
    renderEditForm(entry);
  });

  result.addEventListener("submit", async (event) => {
    const form = event.target.closest(".edit-form");
    if (!form) return;
    event.preventDefault();
    if (!isAdmin) return;

    const sourcePdf = form.getAttribute("data-source-pdf");
    if (!sourcePdf) return;

    const fullDestination = form.elements.fullDestination.value.trim();
    const truck = form.elements.truck.value.trim();
    const notes = form.elements.notes.value.trim();
    let mapPdf = form.elements.mapPdf.value.trim();
    const fileInput = form.elements.mapPdfFile;
    const uploadMeta = form.querySelector("[data-upload-meta]");
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    const itinerary = form.elements.itinerary.value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (file) {
      if (uploadMeta) uploadMeta.textContent = "Subiendo PDF...";
      try {
        mapPdf = await uploadAdminPdf(file);
        if (uploadMeta) uploadMeta.textContent = "PDF subido correctamente.";
      } catch (err) {
        if (uploadMeta) uploadMeta.textContent = "No se pudo subir el PDF.";
        window.alert("No se pudo subir el PDF del plano.");
        return;
      }
    }

    const patch = {
      fullDestination: fullDestination || "Sin destino",
      truck: truck || "No indicado",
      notes: notes || "Sin nota",
      itinerary: itinerary.length ? itinerary : ["Sin itinerario"],
      street: canonicalStreetName(fullDestination || input.value.trim() || "Sin calle"),
    };
    if (mapPdf) {
      patch.mapPdf = mapPdf;
      patch.mapImage = "";
    }
    if (String(sourcePdf).startsWith("manual::")) {
      const extra = {
        street: patch.street,
        fullDestination: patch.fullDestination,
        truck: patch.truck,
        itinerary: patch.itinerary,
        notes: patch.notes,
        sourcePdf,
        mapPdf: patch.mapPdf || mapPdf || "",
        mapImage: "",
      };
      const extras = Array.isArray(overrides.__extra) ? overrides.__extra : [];
      const idx = extras.findIndex((x) => x.sourcePdf === sourcePdf);
      if (idx >= 0) extras[idx] = { ...extras[idx], ...extra };
      else extras.push(extra);
      overrides.__extra = extras;
    } else {
      overrides[sourcePdf] = patch;
    }

    await persistOverrides();
    routes = applyOverrides(baseRoutes);
    rebuildRouteIndex();

    editingSourcePdf = null;
    const updated = routes.find((x) => x.sourcePdf === sourcePdf);
    if (updated) renderMatch(updated);
    if (isAdmin && adminPanel.classList.contains("open")) {
      if (adminPanelMode === "feedback") {
        await renderFeedbackList();
      } else {
        renderPendingList();
      }
    }
  });

  mapModalClose.addEventListener("click", () => {
    mapModal.classList.remove("open");
    mapModal.setAttribute("aria-hidden", "true");
    mapModalFrame.src = "";
    mapModalImage.src = "";
  });

  mapModal.addEventListener("click", (event) => {
    if (event.target === mapModal) mapModalClose.click();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mapModal.classList.contains("open")) {
      mapModalClose.click();
    }
  });
}

init().catch(() => {
  result.classList.add("hidden");
  empty.textContent = "No se pudieron cargar las rutas.";
  setLoadingProgress(100, "Error de carga");
});
