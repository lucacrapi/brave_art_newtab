const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Taille des lots d'hydratation Commons (limite de l'API "titles=" hors acces
// bot) : purement technique, independante du nombre d'images par recherche
// choisi par l'utilisateur (poolSize), qui peut depasser cette valeur.
const COMMONS_BATCH_SIZE = 50;
const COMMONS_MAX_ATTEMPTS = 3;
// 3840 px pese ~2 Mo et met 4 a 5 s a etre genere : on plafonne a 1920 px.
const COMMONS_THUMB_WIDTH = 1920;
const COMMONS_TIMEOUT_MS = 45000;
const COMMONS_MIN_RATIO = 1.3;
const COMMONS_MIN_SIZE = "filetype:bitmap filew:>1919 fileh:>1079";
const IMAGE_HISTORY_SIZE = 100;

// Listes purement consultatives (menu "Historique & favoris") : pas de
// plafond, et elles n'influencent plus le tirage des images.
const HISTORY_VIEWS = {
  history: { key: "imageHistory", empty: "Aucune image affichee pour l'instant." },
  liked: { key: "likedWorks", empty: "Aucune oeuvre appreciee pour l'instant." },
  artists: { key: "favoriteArtists", empty: "Aucun artiste prefere pour l'instant." }
};

const WIKIDATA_SPARQL_API = "https://query.wikidata.org/sparql";
// Latence tres variable sur ce service public (mesuree de <1s a plus de 40s).
const WIKIDATA_TIMEOUT_MS = 45000;
// Randomisation par hachage plutot que ORDER BY RAND()/OFFSET : les deux sont
// mesures a 15-40s sur ce endpoint contre <2s pour un simple FILTER(STRSTARTS(...)).
const WIKIDATA_HEX_BUCKETS = "0123456789abcdef";

// Chaque musee est identifie par sa propriete Wikidata dediee (comme P9394
// pour le Louvre) : verifie en direct, bien plus fiable que le champ generique
// "collection" (P195), qui s'est revele contenir des attributions erronees
// (0% de recoupement avec les vraies oeuvres du Louvre dans nos tests).
const MUSEUMS = [
  { id: "louvre", label: "Louvre", idProperty: "wdt:P9394" },
  { id: "met", label: "Metropolitan Museum of Art", idProperty: "wdt:P3634" },
  { id: "rijksmuseum", label: "Rijksmuseum", idProperty: "wdt:P13234" },
  { id: "prado", label: "Musee du Prado", idProperty: "wdt:P8905" },
  { id: "aic", label: "Art Institute of Chicago", idProperty: "wdt:P4610" },
  { id: "hermitage", label: "Musee de l'Ermitage", idProperty: "wdt:P10270" },
  { id: "nga", label: "National Gallery of Art (Washington)", idProperty: "wdt:P4683" },
  { id: "uffizi", label: "Galerie des Offices (Florence)", idProperty: "wdt:P8335" }
];

// Style/medium de l'oeuvre (P31/P279*, meme mecanisme que les collections
// Louvre d'origine, desormais partage par tous les musees).
const STYLES = [
  { id: "peinture", label: "Peinture", wikidataClass: "wd:Q3305213" },
  { id: "dessin", label: "Dessin", wikidataClass: "wd:Q93184" },
  { id: "sculpture", label: "Sculpture", wikidataClass: "wd:Q860861" },
  { id: "photographie", label: "Photographie", wikidataClass: "wd:Q125191" },
  { id: "fresque", label: "Fresque", wikidataClass: "wd:Q22669139" }
];

// Theme/genre (P136). "Indifferent" n'est pas dans cette liste : c'est
// l'absence de filtre de genre, pas une valeur de genre particuliere.
const THEMES = [
  { id: "paysage", label: "Paysage", genreClasses: ["wd:Q191163"] },
  { id: "portrait", label: "Portrait", genreClasses: ["wd:Q134307"] },
  { id: "nature-morte", label: "Nature morte", genreClasses: ["wd:Q170571"] },
  {
    id: "scene-narrative",
    label: "Scene de genre / religieuse / mythologique",
    genreClasses: ["wd:Q1047337", "wd:Q214127", "wd:Q2864737", "wd:Q3374376", "wd:Q742333"]
  }
];
const INDIFFERENT_THEME = { id: "indifferent", label: "Indifferent", genreClasses: null };

// Les 5 sources "hors musee" d'origine : des categories Commons fixes, sans
// identifiant d'oeuvre fiable, donc non decomposables en style/theme.
const LEGACY_COMMONS_SOURCES = [
  { id: "paintings", label: "Peintures - monde", query: 'deepcategory:"Featured pictures of paintings"' },
  { id: "landscapes", label: "Paysages", query: 'deepcategory:"Featured pictures of landscapes"' },
  { id: "architecture", label: "Architecture", query: 'deepcategory:"Featured pictures of architecture"' },
  { id: "nature", label: "Nature", query: 'deepcategory:"Featured pictures of nature"' },
  { id: "astronomy", label: "Espace", query: 'deepcategory:"Featured pictures of astronomy"' }
];

const COLLECTION_WEIGHT_MAX = 10;
const DEFAULT_COLLECTION_WEIGHT = 5;
const DEFAULT_POOL_SIZE = 50;

const defaultSettings = {
  // Les musees demarrent actifs (c'est la demande), les sources Commons
  // d'origine restent desactivees par defaut comme avant cette fonctionnalite.
  sourceWeights: Object.fromEntries([
    ...MUSEUMS.map((museum) => [museum.id, DEFAULT_COLLECTION_WEIGHT]),
    ...LEGACY_COMMONS_SOURCES.map((source) => [source.id, 0])
  ]),
  styleWeights: Object.fromEntries(STYLES.map((style) => [style.id, DEFAULT_COLLECTION_WEIGHT])),
  // Aucun theme coche par defaut : "indifferent" au maximum reproduit le
  // comportement d'avant cette fonctionnalite (pas de filtre de genre).
  themeWeights: { indifferent: COLLECTION_WEIGHT_MAX, ...Object.fromEntries(THEMES.map((theme) => [theme.id, 0])) },
  poolSize: DEFAULT_POOL_SIZE,
  dim: 8,
  blur: 0,
  fit: "cover",
  position: "center",
  showSeconds: false
};

renderWeightInputs("#museumSources", MUSEUMS);
renderWeightInputs("#legacySources", LEGACY_COMMONS_SOURCES);
renderWeightInputs("#styles", STYLES);
renderWeightInputs("#themes", [...THEMES, INDIFFERENT_THEME]);

const elements = {
  clock: document.querySelector("#clock"),
  period: document.querySelector("#period"),
  date: document.querySelector("#date"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  photoCredit: document.querySelector("#photoCredit"),
  likeButton: document.querySelector("#likeButton"),
  favoriteArtistButton: document.querySelector("#favoriteArtistButton"),
  freezeButton: document.querySelector("#freezeButton"),
  reloadButton: document.querySelector("#reloadButton"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  closeSettings: document.querySelector("#closeSettings"),
  sourceInputs: document.querySelectorAll("#museumSources input[data-id], #legacySources input[data-id]"),
  styleInputs: document.querySelectorAll("#styles input[data-id]"),
  themeInputs: document.querySelectorAll("#themes input[data-id]"),
  refreshSource: document.querySelector("#refreshSource"),
  rebuildPool: document.querySelector("#rebuildPool"),
  poolSizeInput: document.querySelector("#poolSizeInput"),
  historyToggle: document.querySelector("#historyToggle"),
  historyPanel: document.querySelector("#historyPanel"),
  closeHistory: document.querySelector("#closeHistory"),
  historyTabs: document.querySelector("#historyTabs"),
  historyList: document.querySelector("#historyList"),
  adminStatus: document.querySelector("#adminStatus"),
  dimInput: document.querySelector("#dimInput"),
  blurInput: document.querySelector("#blurInput"),
  fitModeInputs: document.querySelectorAll('input[name="fitMode"]'),
  positionInput: document.querySelector("#positionInput"),
  showSecondsInput: document.querySelector("#showSecondsInput")
};

// L'image actuellement affichee, mise a jour par showImage(). Sert de cible
// aux boutons j'aime/je n'aime pas.
let currentImage = null;

// Lu par startClock() a chaque tick ; mis a jour par applySettings().
let showSeconds = false;

// Tant que c'est vrai, aucun chargement (automatique ou via un bouton) ne
// change le fond : voir toggleFreeze().
let isFrozen = false;
let isSourceLoading = false;

// Onglet actif du menu "Historique & favoris".
let activeHistoryView = "history";

init();

async function init() {
  startClock();
  wireSearch();
  wireSettings();
  await migrateCollectionWeights();
  await migrateFacetedWeights();
  await migrateLikedWorks();
  await loadSettings();

  const { frozenImage } = await chrome.storage.local.get("frozenImage");
  if (frozenImage) {
    isFrozen = true;
    showImage(frozenImage);
    setAdminStatus("Image figee.");
    updateFreezeButtonState();
  } else {
    await showLastImage();
    await loadSourceWallpaper();
  }
}

// Avant cette fonctionnalite, une "collection" melangeait musee et style
// (ex. "louvre-paintings"). Desormais source/style/theme sont des poids
// independants : on deduit un reglage initial raisonnable de l'ancien choix.
async function migrateFacetedWeights() {
  const { collectionWeights, sourceWeights } = await chrome.storage.local.get(["collectionWeights", "sourceWeights"]);
  if (!collectionWeights || sourceWeights) return;

  const oldLouvreWeights = {
    peinture: collectionWeights["louvre-paintings"] ?? 0,
    sculpture: collectionWeights["louvre-sculptures"] ?? 0,
    dessin: collectionWeights["louvre-drawings"] ?? 0
  };
  const louvreWasEnabled = Object.values(oldLouvreWeights).some((weight) => weight > 0);

  const migratedSources = {
    louvre: louvreWasEnabled ? DEFAULT_COLLECTION_WEIGHT : 0,
    // Les musees qui viennent d'etre ajoutes demarrent actifs, comme demande.
    ...Object.fromEntries(MUSEUMS.filter((m) => m.id !== "louvre").map((m) => [m.id, DEFAULT_COLLECTION_WEIGHT])),
    ...Object.fromEntries(LEGACY_COMMONS_SOURCES.map((source) => [source.id, collectionWeights[source.id] ?? 0]))
  };

  const migratedStyles = Object.fromEntries(
    STYLES.map((style) => [
      style.id,
      louvreWasEnabled ? (oldLouvreWeights[style.id] ?? DEFAULT_COLLECTION_WEIGHT) : DEFAULT_COLLECTION_WEIGHT
    ])
  );

  const migratedThemes = { indifferent: COLLECTION_WEIGHT_MAX, ...Object.fromEntries(THEMES.map((theme) => [theme.id, 0])) };

  await chrome.storage.local.set({ sourceWeights: migratedSources, styleWeights: migratedStyles, themeWeights: migratedThemes });
  await chrome.storage.local.remove("collectionWeights");
}

// Ancien nom de la liste de favoris, avant l'ajout des artistes preferes.
async function migrateLikedWorks() {
  const { favoriteImages, likedWorks } = await chrome.storage.local.get(["favoriteImages", "likedWorks"]);
  if (!favoriteImages || likedWorks) return;

  await chrome.storage.local.set({ likedWorks: favoriteImages });
  await chrome.storage.local.remove("favoriteImages");
}

// Toute premiere version : "collections" etait un tableau de categories
// cochees ([] = toutes), avec ces 8 identifiants (la liste COLLECTIONS de
// l'epoque, remplacee depuis par MUSEUMS/STYLES/THEMES/LEGACY_COMMONS_SOURCES).
// Convertie une fois vers collectionWeights, puis supprimee.
const OLD_COLLECTION_IDS = [
  "louvre-paintings", "louvre-sculptures", "louvre-drawings",
  "paintings", "landscapes", "architecture", "nature", "astronomy"
];

async function migrateCollectionWeights() {
  const { collections, collectionWeights } = await chrome.storage.local.get(["collections", "collectionWeights"]);
  if (!collections || collectionWeights) return;

  const enabled = collections.length > 0 ? collections : OLD_COLLECTION_IDS;
  const migrated = Object.fromEntries(
    OLD_COLLECTION_IDS.map((id) => [id, enabled.includes(id) ? DEFAULT_COLLECTION_WEIGHT : 0])
  );

  await chrome.storage.local.set({ collectionWeights: migrated });
  await chrome.storage.local.remove("collections");
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const timeOptions = { hour: "numeric", minute: "2-digit", hour12: true };
    if (showSeconds) timeOptions.second = "2-digit";

    const parts = new Intl.DateTimeFormat("en-US", timeOptions).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
    const second = parts.find((part) => part.type === "second")?.value;
    const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";

    elements.clock.textContent = second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
    elements.period.textContent = dayPeriod;
    elements.date.textContent = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(now);
  };

  tick();
  setInterval(tick, 1000);
}

function wireSearch() {
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = elements.searchInput.value.trim();
    if (!value) return;

    const target = resolveSearchTarget(value);
    if (target) {
      window.location.href = target;
      return;
    }

    // Texte libre (pas une URL/un domaine) : recherche via le moteur par
    // defaut configure dans le navigateur (brave://settings/search), au lieu
    // de forcer un moteur particulier.
    if (chrome.search?.query) {
      chrome.search.query({ text: value, disposition: "CURRENT_TAB" });
    } else {
      // Secours si l'API n'est pas disponible sur ce navigateur.
      window.location.href = `https://search.brave.com/search?q=${encodeURIComponent(value)}`;
    }
  });
}

// Renvoie une URL a ouvrir directement (schema explicite ou domaine), ou null
// si c'est du texte libre a confier au moteur de recherche par defaut.
function resolveSearchTarget(value) {
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const looksLikeHost = /^[^\s]+\.[^\s]{2,}(\/.*)?$/i.test(value);

  if (hasScheme) return value;
  if (looksLikeHost) return `https://${value}`;

  return null;
}

function wireSettings() {
  elements.settingsToggle.addEventListener("click", () => {
    const wasOpen = !elements.settingsPanel.hidden;
    elements.historyPanel.hidden = true;
    elements.settingsPanel.hidden = wasOpen;
  });

  elements.closeSettings.addEventListener("click", () => {
    elements.settingsPanel.hidden = true;
  });

  elements.historyToggle.addEventListener("click", () => {
    const wasOpen = !elements.historyPanel.hidden;
    elements.settingsPanel.hidden = true;
    elements.historyPanel.hidden = wasOpen;
    if (!wasOpen) renderHistoryList();
  });

  elements.closeHistory.addEventListener("click", () => {
    elements.historyPanel.hidden = true;
  });

  elements.historyTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (button) setActiveHistoryView(button.dataset.view);
  });

  elements.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-value]");
    if (!button) return;

    if (activeHistoryView === "liked") removeLikedWork(button.dataset.removeValue);
    else if (activeHistoryView === "artists") removeFavoriteArtist(button.dataset.removeValue);
  });

  elements.dimInput.addEventListener("input", () => updateSettings({ dim: Number(elements.dimInput.value) }));
  elements.blurInput.addEventListener("input", () => updateSettings({ blur: Number(elements.blurInput.value) }));
  elements.positionInput.addEventListener("change", () => updateSettings({ position: elements.positionInput.value }));
  elements.showSecondsInput.addEventListener("change", () => {
    updateSettings({ showSeconds: elements.showSecondsInput.checked });
  });

  for (const input of elements.fitModeInputs) {
    input.addEventListener("change", () => {
      if (input.checked) updateSettings({ fit: input.value });
    });
  }

  wireWeightGroup(elements.sourceInputs, "sourceWeights");
  wireWeightGroup(elements.styleInputs, "styleWeights");
  wireWeightGroup(elements.themeInputs, "themeWeights");

  // Change un poids ou la taille de la liste n'applique rien tout de suite :
  // il faut cliquer sur "Actualiser la liste d'images" (ou "Nouvelle image")
  // pour declencher une recherche, qui peut prendre jusqu'a ~40s.
  elements.poolSizeInput.addEventListener("change", () => {
    updateSettings({ poolSize: Number(elements.poolSizeInput.value) });
  });

  elements.refreshSource.addEventListener("click", loadSourceWallpaper);
  elements.rebuildPool.addEventListener("click", rebuildImagePool);

  elements.likeButton.addEventListener("click", likeCurrentImage);
  elements.favoriteArtistButton.addEventListener("click", likeCurrentArtist);
  elements.freezeButton.addEventListener("click", toggleFreeze);
  elements.reloadButton.addEventListener("click", loadSourceWallpaper);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(defaultSettings);
  applySettings(stored);
}

async function updateSettings(patch) {
  const current = await chrome.storage.local.get(defaultSettings);
  const next = { ...current, ...patch };
  await chrome.storage.local.set(next);
  applySettings(next);
}

function applySettings(settings) {
  applyWeights(elements.sourceInputs, settings.sourceWeights);
  applyWeights(elements.styleInputs, settings.styleWeights);
  applyWeights(elements.themeInputs, settings.themeWeights);
  elements.poolSizeInput.value = settings.poolSize;

  elements.dimInput.value = settings.dim;
  elements.blurInput.value = settings.blur;
  elements.positionInput.value = settings.position;
  elements.showSecondsInput.checked = settings.showSeconds;
  showSeconds = settings.showSeconds;

  for (const input of elements.fitModeInputs) {
    input.checked = input.value === settings.fit;
  }

  document.documentElement.style.setProperty("--dim", `${settings.dim}%`);
  document.documentElement.style.setProperty("--blur", `${settings.blur}px`);
  document.documentElement.style.setProperty("--fit", settings.fit);
  document.documentElement.style.setProperty("--position", settings.position);
}

async function loadSourceWallpaper() {
  // Garde-fou en plus des boutons desactives : aucun appel ne doit changer le
  // fond tant que l'image est figee, meme indirect (ex. rebuildImagePool).
  if (isFrozen) return;

  setSourceLoading(true);
  setAdminStatus("Recherche sur Wikimedia Commons...");

  try {
    const image = await fetchRandomCommonsImage();

    showImage(image);
    setAdminStatus(`Image chargee : ${describeSource(image)}.`);
    await rememberImage(image);

    // En arriere-plan : l'image suivante sera deja en cache au prochain onglet.
    prefetchNextImage();
  } catch (error) {
    console.warn(error);
    // Pas de secours local : l'image precedente (s'il y en a une) reste affichee.
    setAdminStatus("Impossible de charger une nouvelle image.");
  } finally {
    setSourceLoading(false);
  }
}

// Oublie les lots d'images deja recherches (imagePool/nextImage) pour que le
// prochain tirage reflete les poids et la taille de liste actuels, au lieu de
// piocher dans d'anciens lots construits avec d'anciens reglages.
async function rebuildImagePool() {
  await chrome.storage.local.remove(["imagePool", "nextImage"]);
  await loadSourceWallpaper();
}

function showImage(image) {
  currentImage = image;
  document.documentElement.style.setProperty("--wallpaper", `url("${image.url}")`);
  setCredit(formatCommonsCredit(image), image.pageUrl);
  updateFeedbackVisibility();
}

// Pas de retroaction possible sur une image locale (pas de pageUrl a memoriser),
// ni sur l'artiste quand Commons ne le renseigne pas.
function updateFeedbackVisibility() {
  const isOnline = Boolean(currentImage?.pageUrl);
  elements.likeButton.hidden = !isOnline;
  elements.favoriteArtistButton.hidden = !isOnline || !currentImage?.artist;
  elements.freezeButton.hidden = !isOnline;
  elements.reloadButton.hidden = !isOnline;
}

// Fige le fond actuel (plus aucun chargement, automatique ou manuel, ne le
// change) jusqu'a ce que l'utilisateur la liberise ; persiste meme en fermant
// l'onglet, puisque stockee dans chrome.storage.local.
async function toggleFreeze() {
  if (isFrozen) {
    await chrome.storage.local.remove("frozenImage");
    isFrozen = false;
    updateFreezeButtonState();
    setAdminStatus("Image liberee.");
    await loadSourceWallpaper();
    return;
  }

  if (!currentImage?.pageUrl) return;

  await chrome.storage.local.set({ frozenImage: currentImage });
  isFrozen = true;
  updateFreezeButtonState();
  setAdminStatus("Image figee comme fond d'ecran.");
}

function updateFreezeButtonState() {
  elements.freezeButton.setAttribute("aria-pressed", String(isFrozen));
  elements.freezeButton.setAttribute(
    "aria-label",
    isFrozen ? "Liberer l'image figee" : "Figer cette image comme fond d'ecran"
  );
  setSourceLoading(isSourceLoading);
}

// Si une image est deja prechargee, elle s'affiche aussitot : inutile de montrer l'ancienne.
async function showLastImage() {
  const { imageHistory = [], nextImage } = await chrome.storage.local.get(["imageHistory", "nextImage"]);
  if (!nextImage && imageHistory.length > 0) showImage(imageHistory[0]);
}

async function rememberImage({ url, title, artist, license, pageUrl, source }) {
  const { imageHistory = [] } = await chrome.storage.local.get("imageHistory");
  const others = imageHistory.filter((item) => item.url !== url);

  await chrome.storage.local.set({
    imageHistory: [{ url, title, artist, license, pageUrl, source }, ...others].slice(0, IMAGE_HISTORY_SIZE)
  });
  renderHistoryList();
}

// "Louvre - peinture - paysage", ou juste "Louvre" si le theme est indifferent
// (les sources Commons d'origine n'ont ni style ni theme).
function describeSource(image) {
  const parts = [image.source.label];
  if (image.style) parts.push(image.style.label.toLowerCase());
  if (image.theme && image.theme.id !== INDIFFERENT_THEME.id) parts.push(image.theme.label.toLowerCase());
  return parts.join(" - ");
}

async function likeCurrentImage() {
  if (!currentImage?.pageUrl) return;

  const { likedWorks = [] } = await chrome.storage.local.get("likedWorks");
  const others = likedWorks.filter((image) => image.pageUrl !== currentImage.pageUrl);

  await chrome.storage.local.set({ likedWorks: [currentImage, ...others] });
  setAdminStatus("Oeuvre ajoutee aux oeuvres appreciees.");
  renderHistoryList();
}

async function likeCurrentArtist() {
  if (!currentImage?.artist) return;

  const { favoriteArtists = [] } = await chrome.storage.local.get("favoriteArtists");
  if (!favoriteArtists.includes(currentImage.artist)) {
    await chrome.storage.local.set({ favoriteArtists: [currentImage.artist, ...favoriteArtists] });
  }

  setAdminStatus(`${currentImage.artist} ajoute aux artistes preferes.`);
  renderHistoryList();
}

async function fetchRandomCommonsImage() {
  const pool = await getWeightedSources();
  return (await takePrefetchedImage(pool)) ?? pickCommonsImage(pool);
}

// Trois poids independants : quelle source (musee ou categorie Commons),
// quel style et quel theme. Si tout un groupe est a 0, il retombe sur un
// tirage uniforme dans ce groupe (meme logique qu'avant cette fonctionnalite).
async function getWeightedSources() {
  const { sourceWeights } = await chrome.storage.local.get(defaultSettings);
  const all = [...MUSEUMS, ...LEGACY_COMMONS_SOURCES];
  const weighted = all
    .map((source) => ({ source, weight: sourceWeights[source.id] ?? 0 }))
    .filter((entry) => entry.weight > 0);

  return weighted.length > 0 ? weighted : all.map((source) => ({ source, weight: 1 }));
}

async function getWeightedStyles() {
  const { styleWeights } = await chrome.storage.local.get(defaultSettings);
  const weighted = STYLES
    .map((style) => ({ style, weight: styleWeights[style.id] ?? 0 }))
    .filter((entry) => entry.weight > 0);

  return weighted.length > 0 ? weighted : STYLES.map((style) => ({ style, weight: 1 }));
}

async function getWeightedThemes() {
  const { themeWeights } = await chrome.storage.local.get(defaultSettings);
  const all = [...THEMES, INDIFFERENT_THEME];
  const weighted = all
    .map((theme) => ({ theme, weight: themeWeights[theme.id] ?? 0 }))
    .filter((entry) => entry.weight > 0);

  return weighted.length > 0 ? weighted : [{ theme: INDIFFERENT_THEME, weight: 1 }];
}

function pickWeighted(weightedList) {
  const total = weightedList.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of weightedList) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }

  return weightedList[weightedList.length - 1];
}

async function pickCommonsImage(pool) {
  for (let attempt = 0; attempt < COMMONS_MAX_ATTEMPTS; attempt += 1) {
    const { source } = pickWeighted(pool);

    // Un essai peut echouer sur un simple ralentissement reseau (la latence de
    // Wikidata est tres variable, mesuree jusqu'a plus de 40s) : on continue
    // sur les tentatives suivantes plutot que d'abandonner tout le tirage.
    try {
      const image = await takeSourceImage(source);
      if (image && (await canLoadImage(image.url))) return image;
    } catch (error) {
      console.warn(error);
    }
  }

  throw new Error("Aucune image n'a pu etre chargee.");
}

async function takePrefetchedImage(pool) {
  const { nextImage } = await chrome.storage.local.get("nextImage");
  if (!nextImage) return null;

  await chrome.storage.local.remove("nextImage");
  if (!pool.some((entry) => entry.source.id === nextImage.source.id)) return null;

  // Un musee combine un style et un theme tires a part : un prefetch dont le
  // style/theme ne correspond plus aux poids actuels ne doit pas s'afficher
  // silencieusement comme s'il les respectait encore.
  if (nextImage.style || nextImage.theme) {
    const styleStillValid = (await getWeightedStyles()).some((entry) => entry.style.id === nextImage.style?.id);
    const themeStillValid = (await getWeightedThemes()).some((entry) => entry.theme.id === nextImage.theme?.id);
    if (!styleStillValid || !themeStillValid) return null;
  }

  return (await canLoadImage(nextImage.url)) ? nextImage : null;
}

// pickCommonsImage telecharge l'image pour la verifier : le cache du navigateur
// la resservira instantanement quand elle sera affichee.
async function prefetchNextImage() {
  try {
    const image = await pickCommonsImage(await getWeightedSources());
    await chrome.storage.local.set({ nextImage: image });
  } catch (error) {
    console.warn(error);
  }
}

// Une source Commons (sans idProperty) reste une categorie fixe. Une source
// musee se combine avec un style et un theme tires independamment : c'est ce
// qui permet, par exemple, de piocher "Met + dessin + portrait".
async function takeSourceImage(source) {
  if (!source.idProperty) {
    const image = await takeFromPool(`commons:${source.id}`, () => searchCommonsImages(source));
    return image && { ...image, source };
  }

  const { style } = pickWeighted(await getWeightedStyles());
  const { theme } = pickWeighted(await getWeightedThemes());
  const image = await takeFromPool(
    `museum:${source.id}:${style.id}:${theme.id}`,
    () => searchMuseumImages(source, style, theme)
  );
  return image && { ...image, source, style, theme };
}

// La recherche est lente sur les grosses combinaisons (jusqu'a ~10-40 s) :
// on la fait une fois pour un lot d'images, puis on pioche dans le lot.
async function takeFromPool(poolKey, refill) {
  const { imagePool = {} } = await chrome.storage.local.get("imagePool");
  // Les entrees sans lien Commons viennent d'une ancienne version : on les ignore.
  const isUsable = (image) => Boolean(image.pageUrl);

  const stored = (imagePool[poolKey] ?? []).filter(isUsable);
  const [image, ...rest] = stored.length > 0 ? stored : (await refill()).filter(isUsable);

  await chrome.storage.local.set({ imagePool: { ...imagePool, [poolKey]: rest } });
  return image;
}

// L'identifiant d'oeuvre dedie du musee (ex. P9394 pour le Louvre) donne un
// ciblage bien plus fiable qu'un texte de categorie Commons ou que le champ
// generique "collection" (P195, teste et ecarte : attributions erronees).
// Wikidata n'a pas de licence fiable pour ces oeuvres : on ne s'en sert que
// pour trouver les fichiers, et on recupere licence/auteur/vignette via
// l'API Commons comme pour les autres sources (toCommonsImage() est donc
// reutilisee telle quelle).
async function searchMuseumImages(source, style, theme) {
  const { poolSize } = await chrome.storage.local.get(defaultSettings);
  const hexPrefix = WIKIDATA_HEX_BUCKETS[Math.floor(Math.random() * WIKIDATA_HEX_BUCKETS.length)];
  const url = new URL(WIKIDATA_SPARQL_API);
  url.search = new URLSearchParams({
    query: buildMuseumQuery(source, style, theme, hexPrefix, poolSize),
    format: "json"
  });

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(WIKIDATA_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);

  const data = await response.json();
  // L'ObjectName Commons n'est le plus souvent que le nom de fichier (ex.
  // "Sphinx of king Siamon-E 3914-IMG 0604-gradient") : le libelle Wikidata
  // de l'oeuvre (verifie en direct, francais present sur tous les echantillons
  // testes, anglais en repli) donne un titre bien plus lisible. Un item sans
  // libelle garde son titre par defaut (deduit du nom de fichier) au lieu
  // d'etre ecarte : le libelle est un bonus, pas une condition.
  const titles = new Set();
  const labelByTitle = new Map();
  for (const row of data.results?.bindings ?? []) {
    const title = filePathToTitle(row.image?.value);
    if (!title) continue;

    titles.add(title);
    const label = row.labelFr?.value || row.labelEn?.value;
    if (label && !labelByTitle.has(title)) labelByTitle.set(title, label);
  }

  return titles.size > 0 ? fetchCommonsImageInfoByTitles([...titles], labelByTitle) : [];
}

function buildMuseumQuery(source, style, theme, hexPrefix, poolSize) {
  // "Indifferent" n'impose aucun filtre de genre : les oeuvres sans theme
  // renseigne restent donc tirables, comme avant l'ajout de ce filtre.
  const genreFilter = theme.genreClasses
    ? `?item wdt:P136 ?genre . FILTER(?genre IN (${theme.genreClasses.join(", ")}))`
    : "";

  return `SELECT DISTINCT ?item ?image ?labelFr ?labelEn WHERE {
    ?item ${source.idProperty} ?id .
    ?item wdt:P31/wdt:P279* ${style.wikidataClass} .
    ?item wdt:P18 ?image .
    ${genreFilter}
    OPTIONAL { ?item rdfs:label ?labelFr . FILTER(LANG(?labelFr) = "fr") }
    OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
    BIND(MD5(STR(?item)) AS ?h)
    FILTER(STRSTARTS(?h, "${hexPrefix}"))
  } LIMIT ${poolSize}`;
}

// P18 renvoie une URL Special:FilePath : on en extrait le nom de fichier Commons.
function filePathToTitle(specialFilePathUrl) {
  const marker = "Special:FilePath/";
  const index = specialFilePathUrl?.indexOf(marker) ?? -1;
  return index === -1 ? null : `File:${decodeURIComponent(specialFilePathUrl.slice(index + marker.length))}`;
}

// Meme forme de reponse que searchCommonsImages (data.query.pages[]), donc
// toCommonsImage() s'applique sans changement, avec le libelle Wikidata en
// remplacement du titre par defaut (nom de fichier) quand il est disponible.
// Les titres sont hydrates par lots pour respecter la limite de l'API Commons.
async function fetchCommonsImageInfoByTitles(titles, labelByTitle = new Map()) {
  const images = [];

  for (let i = 0; i < titles.length; i += COMMONS_BATCH_SIZE) {
    const chunk = titles.slice(i, i + COMMONS_BATCH_SIZE);
    const url = new URL(COMMONS_API);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      titles: chunk.join("|"),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: String(COMMONS_THUMB_WIDTH),
      iiextmetadatafilter: "ObjectName|Artist|LicenseShortName"
    });

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(COMMONS_TIMEOUT_MS)
    });

    if (!response.ok) throw new Error(`Commons HTTP ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(`Commons ${data.error.code}`);

    images.push(
      ...(data.query?.pages ?? [])
        .map((page) => {
          const image = toCommonsImage(page);
          return image && labelByTitle.has(page.title) ? { ...image, title: labelByTitle.get(page.title) } : image;
        })
        .filter(Boolean)
    );
  }

  return images.sort(() => Math.random() - 0.5);
}

async function searchCommonsImages(source) {
  const { poolSize } = await chrome.storage.local.get(defaultSettings);
  const url = new URL(COMMONS_API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${source.query} ${COMMONS_MIN_SIZE}`,
    gsrnamespace: "6",
    gsrlimit: String(poolSize),
    gsrsort: "random",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(COMMONS_THUMB_WIDTH),
    iiextmetadatafilter: "ObjectName|Artist|LicenseShortName"
  });

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(COMMONS_TIMEOUT_MS)
  });

  if (!response.ok) throw new Error(`Commons HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(`Commons ${data.error.code}`);

  return (data.query?.pages ?? [])
    .map(toCommonsImage)
    .filter(Boolean)
    .sort(() => Math.random() - 0.5);
}

function toCommonsImage(page) {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl || !info.descriptionurl || info.width / info.height < COMMONS_MIN_RATIO) return null;

  const metadata = info.extmetadata ?? {};
  return {
    url: info.thumburl,
    pageUrl: info.descriptionurl,
    title: stripHtml(metadata.ObjectName?.value) || page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""),
    artist: stripHtml(metadata.Artist?.value),
    license: stripHtml(metadata.LicenseShortName?.value)
  };
}

function stripHtml(html) {
  if (!html) return "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
}

function canLoadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

function formatCommonsCredit(image) {
  const artist = image.artist ? ` - ${image.artist}` : "";
  const license = image.license ? ` (${image.license})` : "";
  return `${image.title}${artist}${license}`;
}

function setCredit(text, url) {
  elements.photoCredit.textContent = text;

  if (url) {
    elements.photoCredit.href = url;
  } else {
    elements.photoCredit.removeAttribute("href");
  }
}

function setAdminStatus(message) {
  elements.adminStatus.textContent = message;
}

function setSourceLoading(isLoading) {
  isSourceLoading = isLoading;
  // Figee, l'image ne doit changer par aucun de ces boutons, meme une fois le
  // chargement en cours termine.
  elements.refreshSource.disabled = isLoading || isFrozen;
  elements.rebuildPool.disabled = isLoading || isFrozen;
  elements.reloadButton.disabled = isLoading || isFrozen;
  for (const input of [...elements.sourceInputs, ...elements.styleInputs, ...elements.themeInputs, elements.poolSizeInput]) {
    input.disabled = isLoading;
  }
}

function wireWeightGroup(inputs, settingsKey) {
  for (const input of inputs) {
    input.addEventListener("change", () => {
      updateSettings({ [settingsKey]: readWeights(inputs) });
    });
  }
}

function readWeights(inputs) {
  return Object.fromEntries([...inputs].map((input) => [input.dataset.id, Number(input.value)]));
}

function applyWeights(inputs, weights) {
  for (const input of inputs) input.value = weights[input.dataset.id] ?? 0;
}

function setActiveHistoryView(view) {
  activeHistoryView = view;

  for (const button of elements.historyTabs.querySelectorAll("button[data-view]")) {
    button.setAttribute("aria-selected", String(button.dataset.view === view));
  }

  renderHistoryList();
}

// Inutile de reconstruire la liste pendant que le panneau est cache : cette
// fonction est appelee apres chaque ecriture de imageHistory/likedWorks/
// favoriteArtists, qu'il soit ouvert ou non.
async function renderHistoryList() {
  if (elements.historyPanel.hidden) return;

  const { key, empty } = HISTORY_VIEWS[activeHistoryView];
  const { [key]: items = [] } = await chrome.storage.local.get(key);

  elements.historyList.replaceChildren();

  if (items.length === 0) {
    const empty_ = document.createElement("li");
    empty_.className = "history-empty";
    empty_.textContent = empty;
    elements.historyList.append(empty_);
    return;
  }

  // L'historique est un journal automatique, non modifiable ; les deux autres
  // listes sont choisies par l'utilisateur et peuvent en retirer une entree.
  const removable = activeHistoryView !== "history";
  const renderItem = activeHistoryView === "artists" ? renderArtistItem : renderWorkItem;
  for (const item of items) elements.historyList.append(renderItem(item, removable));
}

function renderWorkItem(image, removable) {
  const item = document.createElement("li");
  const main = document.createElement("div");
  const link = document.createElement("a");
  const artist = document.createElement("span");

  link.href = image.pageUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = image.title;
  artist.className = "history-artist";
  artist.textContent = image.artist || "";

  main.className = "history-main";
  main.append(link, artist);
  item.append(main);
  if (removable) item.append(createRemoveButton(image.pageUrl));
  return item;
}

function renderArtistItem(name, removable) {
  const item = document.createElement("li");
  const main = document.createElement("span");

  main.className = "history-main";
  main.textContent = name;
  item.append(main);
  if (removable) item.append(createRemoveButton(name));
  return item;
}

function createRemoveButton(value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-remove";
  button.dataset.removeValue = value;
  button.setAttribute("aria-label", "Retirer de la liste");
  button.textContent = "✕";
  return button;
}

async function removeLikedWork(pageUrl) {
  const { likedWorks = [] } = await chrome.storage.local.get("likedWorks");
  await chrome.storage.local.set({ likedWorks: likedWorks.filter((image) => image.pageUrl !== pageUrl) });
  renderHistoryList();
}

async function removeFavoriteArtist(name) {
  const { favoriteArtists = [] } = await chrome.storage.local.get("favoriteArtists");
  await chrome.storage.local.set({ favoriteArtists: favoriteArtists.filter((artist) => artist !== name) });
  renderHistoryList();
}

function renderWeightInputs(containerId, items) {
  const list = document.querySelector(containerId);

  for (const item of items) {
    const row = document.createElement("label");
    const text = document.createElement("span");
    const input = document.createElement("input");

    input.type = "range";
    input.min = "0";
    input.max = String(COLLECTION_WEIGHT_MAX);
    input.step = "1";
    input.dataset.id = item.id;
    text.textContent = item.label;

    row.append(text, input);
    list.append(row);
  }
}

