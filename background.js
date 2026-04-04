const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const CONTEXT_MENU_ID = "translate-selected-text";
const SAVE_CONTEXT_MENU_ID = "save-selected-text";
const TRANSLATE_SELECTION_COMMAND = "translate-selection";
const TRANSLATE_PDF_SELECTION_COMMAND = "translate-pdf-selection";
const START_BLOCK_PICKER_COMMAND = "start-block-picker";
const SUPPORTED_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" }
];
const SUPPORTED_LANGUAGE_CODES = new Set(
  SUPPORTED_LANGUAGES.map((language) => language.code)
);
const LEGACY_DEFAULT_SETTINGS = {
  apiBaseUrl: "https://translate.argosopentech.com",
  apiPath: "/translate",
  apiKey: "",
  requestTimeoutMs: 15000
};
const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://www.fairtranslate.eu",
  apiPath: "/translate",
  apiKey: "",
  requestTimeoutMs: 15000,
  defaultTranslationMode: "full",
  defaultWordWiseLevel: "B1",
  defaultTargetLanguage: "en",
  defaultIncludeSynonyms: true,
  defaultIncludeExamples: true
};
const MAX_TEXT_LENGTH = 1500;
const MAX_DOM_BLOCK_TEXT_LENGTH = 5000;
const MYMEMORY_MAX_TEXT_BYTES = 500;
const MYMEMORY_SAFE_CHUNK_BYTES = 450;
const DEEPL_SOURCE_LANGUAGE_CODES = {
  es: "ES",
  en: "EN",
  de: "DE"
};
const DEEPL_TARGET_LANGUAGE_CODES = {
  es: "ES",
  en: "EN-GB",
  de: "DE"
};
const LEGACY_SAVED_ENTRIES_KEY = "savedEntries";
const TRANSLATION_HISTORY_KEY = "translationHistory";
const GLOSSARY_ENTRIES_KEY = "glossaryEntries";
const ACTIVE_TRANSLATION_PREFERENCES_KEY = "activeTranslationPreferences";
const HISTORY_ENTRY_LIMIT = 300;
const GLOSSARY_STATUS_VALUES = new Set(["new", "review", "mastered"]);
const EXAMPLES_API_BASE_URL = "https://api.tatoeba.org";
const WIKTAPI_API_BASE_URL = "https://api.wiktapi.dev";
const TATOEBA_LANGUAGE_CODES = {
  es: "spa",
  en: "eng",
  de: "deu"
};
const MAX_SYNONYMS = 8;
const MAX_EXAMPLES = 4;
const MAX_PHONETICS = 3;
const SINGLE_WORD_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u;
const POPUP_DRAFT_KEY = "popupDraft";
const PINNED_POPUP_DIMENSIONS = {
  width: 620,
  height: 860
};
const TRANSLATION_MODES = {
  FULL: "full",
  WORD_WISE: "word-wise"
};
const WORD_WISE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const WORD_WISE_LEVEL_THRESHOLDS = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6
};
const GERMAN_COMMON_WORDS = new Set(
  `
  aber ach acht alles also alt am an andere anderen auch auf aus bei bald bevor bin bis bist bitte da dann das dass dein deine dem den der des dich die dies diese dieser dieses doch dort du durch ein eine einem einen einer eines er es etwas euch euer eure für gegen gehabt gehen geht gerade gut habe haben hast hat hatte hatten hier hin hinter ich ihr ihre im in ist ja jede jedem jeden jeder jedes jetzt kann kein keine keinen kleiner komm kommen könnte machen mein meine mit musste nach nicht noch nun nur ob oder ohne sehr sein seine sich sie sind so soll sondern sonst und unser unsere unter vom von vor warum was weil weiter welche welchem welchen welcher welches wenn wer werde werden wie wieder wir wird willst wo zu zum zur zwischen
  heute morgen gestern jetzt immer oft manchmal nie dort hier oben unten links rechts zuerst zuletzt sofort langsam schnell schon noch einmal nochmal danke hallo bitte tschüss guten tag guten morgen guten abend gute nacht
  haus wohnung stadt land schule universität arbeit büro zug bahn auto bus straße wasser brot kaffee tee milch zeit tag woche monat jahr uhr minute familie mutter vater kind kinder freund freundin leute mensch menschen name nummer hand auge kopf buch wort frage antwort bild geld preis laden essen trinken leben weg
  sein haben werden können müssen sollen wollen dürfen mögen sagen sprechen lesen schreiben lernen sehen hören denken wissen kennen finden geben nehmen bleiben heißen machen arbeiten wohnen fahren laufen kommen gehen fragen antworten kaufen bezahlen öffnen schließen anfangen brauchen spielen essen trinken schlafen helfen zeigen erklären verstehen
  `.trim().split(/\s+/u)
);
let pinnedPopupWindowId = null;
let didEnsureSavedCollectionsMigration = false;
let extensionInitializationPromise = null;

function normalizeLanguageCode(languageCode) {
  return String(languageCode || "")
    .trim()
    .toLowerCase()
    .split("-")[0];
}

function normalizeOptionalSourceLanguagePreference(languageCode) {
  const rawValue = String(languageCode ?? "").trim().toLowerCase();
  if (!rawValue) {
    return null;
  }

  if (rawValue === "auto") {
    return "auto";
  }

  const normalizedLanguageCode = normalizeLanguageCode(rawValue);
  return SUPPORTED_LANGUAGE_CODES.has(normalizedLanguageCode) ? normalizedLanguageCode : null;
}

function normalizeOptionalTargetLanguagePreference(languageCode) {
  const normalizedLanguageCode = normalizeLanguageCode(languageCode);
  return SUPPORTED_LANGUAGE_CODES.has(normalizedLanguageCode) ? normalizedLanguageCode : null;
}

function getLanguageLabel(languageCode) {
  const language = SUPPORTED_LANGUAGES.find(
    (item) => item.code === normalizeLanguageCode(languageCode)
  );
  return language?.label ?? languageCode ?? "Auto";
}

function normalizeTranslationMode(translationMode) {
  return translationMode === TRANSLATION_MODES.WORD_WISE
    ? TRANSLATION_MODES.WORD_WISE
    : TRANSLATION_MODES.FULL;
}

function normalizeWordWiseLevel(level) {
  const normalizedLevel = String(level ?? "").trim().toUpperCase();
  return WORD_WISE_LEVELS.includes(normalizedLevel) ? normalizedLevel : "B1";
}

function normalizeBooleanPreference(value, fallback = true) {
  if (value === undefined) {
    return fallback;
  }

  return value !== false;
}

function normalizeUrlForComparison(url) {
  return String(url ?? "").trim().replace(/\/+$/, "");
}

function normalizeApiPath(path) {
  const cleanPath = String(path ?? "").trim();
  if (!cleanPath) {
    return "/translate";
  }
  return cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
}

function getTranslationBackend(settings) {
  const apiBaseUrl = normalizeUrlForComparison(settings?.apiBaseUrl);
  const apiPath = normalizeApiPath(settings?.apiPath);

  if (
    apiBaseUrl.includes("api.mymemory.translated.net") ||
    (apiBaseUrl.includes("translated.net") && apiPath === "/get")
  ) {
    return "mymemory";
  }

  if (apiBaseUrl.includes("api-free.deepl.com") || apiBaseUrl.includes("api.deepl.com")) {
    return "deepl";
  }

  return "libretranslate";
}

function normalizeInlineText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function isSingleWord(text) {
  const cleanText = normalizeInlineText(text);
  const parts = cleanText.split(/\s+/).filter(Boolean);
  return parts.length === 1 && SINGLE_WORD_PATTERN.test(parts[0]);
}

function uniqueByNormalizedValue(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleanValue = normalizeInlineText(value);
    if (!cleanValue) {
      continue;
    }

    const dedupeKey = cleanValue.toLocaleLowerCase("es-ES");
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    result.push(cleanValue);
  }

  return result;
}

function sanitizeSynonymCandidate(value) {
  return normalizeInlineText(value)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[!?.,;:]+$/g, "")
    .trim();
}

function sanitizePhoneticCandidate(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePhoneticList(phonetics) {
  if (!Array.isArray(phonetics)) {
    return [];
  }

  return uniqueByNormalizedValue(
    phonetics
      .map((value) => sanitizePhoneticCandidate(value))
      .filter(Boolean)
  ).slice(0, MAX_PHONETICS);
}

function isSameEndpoint(leftSettings, rightSettings) {
  return (
    normalizeUrlForComparison(leftSettings.apiBaseUrl) ===
      normalizeUrlForComparison(rightSettings.apiBaseUrl) &&
    normalizeApiPath(leftSettings.apiPath) === normalizeApiPath(rightSettings.apiPath)
  );
}

function migrateLegacySettings(settings) {
  const baseSettings = isSameEndpoint(settings, LEGACY_DEFAULT_SETTINGS)
    ? {
        ...settings,
        apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
        apiPath: DEFAULT_SETTINGS.apiPath
      }
    : settings;

  return {
    ...baseSettings,
    defaultTranslationMode: normalizeTranslationMode(baseSettings.defaultTranslationMode),
    defaultWordWiseLevel: normalizeWordWiseLevel(baseSettings.defaultWordWiseLevel),
    defaultTargetLanguage:
      normalizeLanguageCode(baseSettings.defaultTargetLanguage) || DEFAULT_SETTINGS.defaultTargetLanguage,
    defaultIncludeSynonyms: normalizeBooleanPreference(
      baseSettings.defaultIncludeSynonyms,
      DEFAULT_SETTINGS.defaultIncludeSynonyms
    ),
    defaultIncludeExamples: normalizeBooleanPreference(
      baseSettings.defaultIncludeExamples,
      DEFAULT_SETTINGS.defaultIncludeExamples
    )
  };
}

async function getStoredSettings() {
  const stored = await browserApi.storage.local.get("settings");
  return migrateLegacySettings({
    ...DEFAULT_SETTINGS,
    ...(stored.settings ?? {})
  });
}

async function setStoredSettings(settings) {
  const nextSettings = migrateLegacySettings({
    ...DEFAULT_SETTINGS,
    ...(settings ?? {})
  });
  await browserApi.storage.local.set({ settings: nextSettings });
  return nextSettings;
}

async function ensureDefaultSettings() {
  const settings = await getStoredSettings();
  await browserApi.storage.local.set({ settings });
}

function buildEmptyWordWiseResult({ level, targetLanguage }) {
  return {
    enabled: false,
    supported: false,
    level,
    targetLanguage: targetLanguage
      ? {
          code: targetLanguage,
          label: getLanguageLabel(targetLanguage)
        }
      : null,
    annotatedText: "",
    segments: [],
    entries: [],
    reason: ""
  };
}

function normalizeActiveTranslationPreferences(preferences) {
  if (!preferences || typeof preferences !== "object") {
    return null;
  }

  return {
    sourceLanguage: normalizeOptionalSourceLanguagePreference(preferences.sourceLanguage) ?? "auto",
    targetLanguage: normalizeOptionalTargetLanguagePreference(preferences.targetLanguage),
    translationMode: normalizeTranslationMode(preferences.translationMode),
    wordWiseLevel: normalizeWordWiseLevel(preferences.wordWiseLevel),
    includeSynonyms: normalizeBooleanPreference(
      preferences.includeSynonyms,
      DEFAULT_SETTINGS.defaultIncludeSynonyms
    ),
    includeExamples: normalizeBooleanPreference(
      preferences.includeExamples,
      DEFAULT_SETTINGS.defaultIncludeExamples
    ),
    updatedAt: String(preferences.updatedAt ?? "").trim() || null
  };
}

async function getActiveTranslationPreferences() {
  const stored = await browserApi.storage.local.get(ACTIVE_TRANSLATION_PREFERENCES_KEY);
  return normalizeActiveTranslationPreferences(stored[ACTIVE_TRANSLATION_PREFERENCES_KEY]);
}

async function setActiveTranslationPreferences(preferences) {
  const normalizedPreferences = normalizeActiveTranslationPreferences(preferences);
  const nextPreferences = {
    ...(normalizedPreferences ?? normalizeActiveTranslationPreferences({})),
    updatedAt: new Date().toISOString()
  };

  await browserApi.storage.local.set({
    [ACTIVE_TRANSLATION_PREFERENCES_KEY]: nextPreferences
  });

  return nextPreferences;
}

function resolveTranslationPreferences(settings, requestedSourceLanguage, options = {}, activePreferences = null) {
  const requestedSourcePreference =
    requestedSourceLanguage === undefined
      ? activePreferences?.sourceLanguage ?? "auto"
      : normalizeOptionalSourceLanguagePreference(requestedSourceLanguage) ?? "auto";
  const requestedTargetLanguage =
    options.targetLanguage === undefined
      ? activePreferences?.targetLanguage ?? null
      : normalizeOptionalTargetLanguagePreference(options.targetLanguage);

  return {
    requestedSourceLanguage: requestedSourcePreference,
    requestedTargetLanguage,
    translationMode: normalizeTranslationMode(
      options.translationMode ?? activePreferences?.translationMode ?? settings.defaultTranslationMode
    ),
    wordWiseLevel: normalizeWordWiseLevel(
      options.wordWiseLevel ?? activePreferences?.wordWiseLevel ?? settings.defaultWordWiseLevel
    ),
    includeSynonyms: normalizeBooleanPreference(
      options.includeSynonyms,
      activePreferences?.includeSynonyms ?? settings.defaultIncludeSynonyms
    ),
    includeExamples: normalizeBooleanPreference(
      options.includeExamples,
      activePreferences?.includeExamples ?? settings.defaultIncludeExamples
    )
  };
}

function tokenizeWordWiseText(text) {
  const rawTokens =
    String(text ?? "").match(/\s+|[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*|\d+(?:[.,:/-]\d+)*|[^\s\p{L}\p{M}\d]+/gu) ??
    [];

  return rawTokens.map((value) => {
    if (/^\s+$/u.test(value)) {
      return { type: "space", value };
    }

    if (/^[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*$/u.test(value)) {
      return { type: "word", value };
    }

    return { type: "punct", value };
  });
}

function normalizeGermanWord(word) {
  return String(word ?? "").trim().toLocaleLowerCase("de-DE");
}

function isGermanSentenceBoundary(token) {
  return token?.type === "punct" && /[.!?:;()[\]{}]/u.test(token.value);
}

function findPreviousMeaningfulToken(tokens, startIndex) {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (tokens[index].type !== "space") {
      return tokens[index];
    }
  }

  return null;
}

function isLikelyGermanProperNoun(word, tokens, index) {
  if (!/^\p{Lu}/u.test(word)) {
    return false;
  }

  const lowerWord = normalizeGermanWord(word);
  if (GERMAN_COMMON_WORDS.has(lowerWord)) {
    return false;
  }

  if (/[äöüß]/iu.test(word) || word.length >= 13 || word.includes("-")) {
    return false;
  }

  const previousToken = findPreviousMeaningfulToken(tokens, index);
  if (!previousToken || isGermanSentenceBoundary(previousToken)) {
    return false;
  }

  return true;
}

function scoreGermanWordDifficulty(word, tokens, index) {
  const normalizedWord = normalizeGermanWord(word);

  if (
    !normalizedWord ||
    normalizedWord.length <= 3 ||
    /^\d+$/u.test(normalizedWord) ||
    /^(https?|www)\b/u.test(normalizedWord) ||
    normalizedWord.includes("@")
  ) {
    return 0;
  }

  if (isLikelyGermanProperNoun(word, tokens, index)) {
    return 0;
  }

  let score = GERMAN_COMMON_WORDS.has(normalizedWord) ? 0 : 2;

  if (normalizedWord.length >= 8) {
    score += 1;
  }

  if (normalizedWord.length >= 12) {
    score += 1;
  }

  if (normalizedWord.length >= 16) {
    score += 1;
  }

  if (/[äöüß]/u.test(normalizedWord)) {
    score += 1;
  }

  if (normalizedWord.includes("-")) {
    score += 1;
  }

  if (/[a-zäöüß]{10,}(ung|keit|heit|schaft|ismus|tion|tät|erei|lich|weise|chen)$/u.test(normalizedWord)) {
    score += 1;
  }

  if (/[a-zäöüß]{14,}/u.test(normalizedWord)) {
    score += 1;
  }

  return score;
}

function pickWordWiseCandidates(text, level) {
  const tokens = tokenizeWordWiseText(text);
  const minimumScore = WORD_WISE_LEVEL_THRESHOLDS[level] ?? WORD_WISE_LEVEL_THRESHOLDS.B1;
  const candidates = [];
  const seen = new Set();

  tokens.forEach((token, index) => {
    if (token.type !== "word") {
      return;
    }

    const score = scoreGermanWordDifficulty(token.value, tokens, index);
    if (score < minimumScore) {
      return;
    }

    const normalizedWord = normalizeGermanWord(token.value);
    if (seen.has(normalizedWord)) {
      return;
    }

    seen.add(normalizedWord);
    candidates.push({
      normalizedWord,
      sourceText: token.value,
      score
    });
  });

  return candidates;
}

function mergeWordWiseSegments(segments) {
  const merged = [];

  for (const segment of segments) {
    const previousSegment = merged[merged.length - 1];
    if (segment.type === "plain" && previousSegment?.type === "plain") {
      previousSegment.text += segment.text;
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

function buildWordWiseAnnotatedResult(text, translationsByWord) {
  const tokens = tokenizeWordWiseText(text);
  const segments = [];
  const entries = [];
  const seenEntries = new Set();

  for (const token of tokens) {
    if (token.type !== "word") {
      segments.push({ type: "plain", text: token.value });
      continue;
    }

    const normalizedWord = normalizeGermanWord(token.value);
    const translatedText = translationsByWord.get(normalizedWord);
    if (!translatedText) {
      segments.push({ type: "plain", text: token.value });
      continue;
    }

    const annotationText = `${token.value} (${translatedText})`;
    segments.push({
      type: "annotation",
      text: annotationText,
      sourceText: token.value,
      translatedText
    });

    if (!seenEntries.has(normalizedWord)) {
      seenEntries.add(normalizedWord);
      entries.push({
        sourceText: token.value,
        translatedText
      });
    }
  }

  const mergedSegments = mergeWordWiseSegments(segments);
  return {
    annotatedText: mergedSegments.map((segment) => segment.text).join(""),
    segments: mergedSegments,
    entries
  };
}

async function buildWordWiseResult({
  text,
  sourceLanguage,
  targetLanguage,
  settings,
  level
}) {
  const result = buildEmptyWordWiseResult({ level, targetLanguage });
  result.enabled = true;

  if (sourceLanguage !== "de") {
    result.reason = "Word Wise solo está disponible para texto en alemán.";
    return result;
  }

  result.supported = true;

  const candidates = pickWordWiseCandidates(text, level);
  if (!candidates.length) {
    result.annotatedText = text;
    result.segments = [{ type: "plain", text }];
    result.reason = "No encontré palabras alemanas que superen el umbral de dificultad para este nivel.";
    return result;
  }

  const translatedEntries = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const translatedText = normalizeInlineText(
          await translateText({
            text: candidate.sourceText,
            sourceLanguage: "de",
            targetLanguage,
            settings
          })
        );

        return {
          ...candidate,
          translatedText
        };
      } catch (error) {
        console.warn("No se pudo traducir una entrada de Word Wise.", candidate.sourceText, error);
        return null;
      }
    })
  );

  const translationsByWord = new Map(
    translatedEntries
      .filter(Boolean)
      .filter(
        (entry) =>
          entry.translatedText &&
          entry.translatedText.toLocaleLowerCase("de-DE") !== entry.sourceText.toLocaleLowerCase("de-DE")
      )
      .map((entry) => [entry.normalizedWord, entry.translatedText])
  );

  if (!translationsByWord.size) {
    result.annotatedText = text;
    result.segments = [{ type: "plain", text }];
    result.reason = "No pude generar anotaciones útiles para las palabras detectadas.";
    return result;
  }

  const annotated = buildWordWiseAnnotatedResult(text, translationsByWord);
  result.annotatedText = annotated.annotatedText;
  result.segments = annotated.segments;
  result.entries = annotated.entries;
  return result;
}

function pickDefaultTargetLanguage(sourceLanguage, settings) {
  const configuredTargetLanguage = normalizeLanguageCode(settings?.defaultTargetLanguage);
  if (
    configuredTargetLanguage &&
    SUPPORTED_LANGUAGE_CODES.has(configuredTargetLanguage) &&
    configuredTargetLanguage !== sourceLanguage
  ) {
    return configuredTargetLanguage;
  }

  return (
    SUPPORTED_LANGUAGES.find((language) => language.code !== sourceLanguage)?.code ?? "en"
  );
}

function buildTranslateEndpoint(settings) {
  const apiPath = normalizeApiPath(settings.apiPath);
  return new URL(apiPath, settings.apiBaseUrl).toString();
}

function buildTranslationRequestError(error, endpoint, settings) {
  if (error?.name === "AbortError") {
    return new Error(
      `El servicio de traducción no respondió en ${settings.requestTimeoutMs} ms (${endpoint}).`
    );
  }

  if (error instanceof TypeError) {
    return new Error(
      `No se pudo conectar con el servicio de traducción (${endpoint}). Revisa la URL en Opciones o usa un endpoint LibreTranslate compatible.`
    );
  }

  return error;
}

function getByteLength(text) {
  return new TextEncoder().encode(String(text ?? "")).length;
}

function splitTextByByteLimit(text, maxBytes) {
  const cleanText = String(text ?? "");
  if (!cleanText) {
    return [];
  }

  if (getByteLength(cleanText) <= maxBytes) {
    return [cleanText];
  }

  const chunks = [];
  let currentChunk = "";
  const tokens = cleanText.match(/\S+\s*/gu) ?? [cleanText];

  for (const token of tokens) {
    if (!currentChunk) {
      if (getByteLength(token) <= maxBytes) {
        currentChunk = token;
        continue;
      }

      let partialChunk = "";
      for (const character of token) {
        const nextPartialChunk = partialChunk + character;
        if (getByteLength(nextPartialChunk) > maxBytes) {
          if (partialChunk) {
            chunks.push(partialChunk);
          }
          partialChunk = character;
        } else {
          partialChunk = nextPartialChunk;
        }
      }

      currentChunk = partialChunk;
      continue;
    }

    const nextChunk = currentChunk + token;
    if (getByteLength(nextChunk) <= maxBytes) {
      currentChunk = nextChunk;
      continue;
    }

    chunks.push(currentChunk);

    if (getByteLength(token) <= maxBytes) {
      currentChunk = token;
      continue;
    }

    let partialChunk = "";
    for (const character of token) {
      const nextPartialChunk = partialChunk + character;
      if (getByteLength(nextPartialChunk) > maxBytes) {
        if (partialChunk) {
          chunks.push(partialChunk);
        }
        partialChunk = character;
      } else {
        partialChunk = nextPartialChunk;
      }
    }

    currentChunk = partialChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildSupplementalRequestError(error, label, endpoint, timeoutMs) {
  if (error?.name === "AbortError") {
    return new Error(`${label} no respondió en ${timeoutMs} ms (${endpoint}).`);
  }

  if (error instanceof TypeError) {
    return new Error(`No se pudo conectar con ${label.toLowerCase()} (${endpoint}).`);
  }

  return error;
}

async function fetchJsonWithTimeout(url, { timeoutMs, headers = {} } = {}) {
  const endpoint = typeof url === "string" ? url : url.toString();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers
        },
        signal: controller.signal
      });
    } catch (error) {
      throw buildSupplementalRequestError(error, "el servicio auxiliar", endpoint, timeoutMs);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function heuristicLanguageDetection(text) {
  const normalized = text.toLowerCase();

  if (/[äöüß]/.test(normalized)) {
    return "de";
  }

  if (/[¿¡ñáéíóú]/.test(normalized)) {
    return "es";
  }

  if (/\b(und|ich|nicht|danke|bitte|hallo)\b/i.test(normalized)) {
    return "de";
  }

  if (/\b(el|la|que|gracias|hola|por|para)\b/i.test(normalized)) {
    return "es";
  }

  if (/\b(the|and|hello|thanks|please|with)\b/i.test(normalized)) {
    return "en";
  }

  return null;
}

async function detectSourceLanguage(text) {
  try {
    if (browserApi.i18n?.detectLanguage) {
      const result = await browserApi.i18n.detectLanguage(text);
      const supportedCandidate = (result.languages ?? [])
        .map((entry) => ({
          code: normalizeLanguageCode(entry.language),
          percentage: entry.percentage ?? 0
        }))
        .filter((entry) => SUPPORTED_LANGUAGE_CODES.has(entry.code))
        .sort((left, right) => right.percentage - left.percentage)[0];

      if (supportedCandidate && supportedCandidate.percentage >= 25) {
        return supportedCandidate.code;
      }
    }
  } catch (error) {
    console.warn("No se pudo detectar el idioma con i18n.detectLanguage", error);
  }

  return heuristicLanguageDetection(text);
}

async function translateWithLibreTranslate({ text, sourceLanguage, targetLanguage, settings }) {
  const endpoint = buildTranslateEndpoint(settings);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeoutMs);

  try {
    const payload = {
      q: text,
      source: sourceLanguage || "auto",
      target: targetLanguage,
      format: "text"
    };

    if (settings.apiKey) {
      payload.api_key = settings.apiKey;
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      throw buildTranslationRequestError(error, endpoint, settings);
    }

    if (!response.ok) {
      throw new Error(`El servicio de traducción respondió con HTTP ${response.status}.`);
    }

    const data = await response.json();
    const translatedText =
      typeof data.translatedText === "string" ? data.translatedText.trim() : "";

    if (!translatedText) {
      throw new Error("La respuesta del servicio no incluyó translatedText.");
    }

    return translatedText;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function translateWithMyMemory({ text, sourceLanguage, targetLanguage, settings }) {
  if (!sourceLanguage || sourceLanguage === "auto") {
    throw new Error(
      "MyMemory necesita un idioma origen claro. Prueba a seleccionarlo manualmente si la detección automática falla."
    );
  }

  const baseUrl = normalizeUrlForComparison(settings.apiBaseUrl) || "https://api.mymemory.translated.net";
  const endpoint = new URL(normalizeApiPath(settings.apiPath), `${baseUrl}/`);
  const chunks = splitTextByByteLimit(text, MYMEMORY_SAFE_CHUNK_BYTES);
  const translations = [];

  for (const chunk of chunks) {
    if (getByteLength(chunk) > MYMEMORY_MAX_TEXT_BYTES) {
      throw new Error("El texto es demasiado largo para enviarlo a MyMemory en una sola parte.");
    }

    const requestUrl = new URL(endpoint.toString());
    requestUrl.searchParams.set("q", chunk);
    requestUrl.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);

    const data = await fetchJsonWithTimeout(requestUrl, {
      timeoutMs: settings.requestTimeoutMs
    });

    const translatedText =
      typeof data?.responseData?.translatedText === "string"
        ? data.responseData.translatedText.trim()
        : "";

    if (!translatedText) {
      throw new Error("La respuesta de MyMemory no incluyó translatedText.");
    }

    translations.push(translatedText);
  }

  return translations.join(" ").replace(/\s+/g, " ").trim();
}

function buildDeepLRequestError(error, endpoint, settings) {
  if (error?.name === "AbortError") {
    return new Error(`DeepL no respondió en ${settings.requestTimeoutMs} ms (${endpoint}).`);
  }

  if (error instanceof TypeError) {
    return new Error(`No se pudo conectar con DeepL (${endpoint}). Revisa la URL y la API key.`);
  }

  return error;
}

async function translateWithDeepL({ text, sourceLanguage, targetLanguage, settings }) {
  const endpoint = buildTranslateEndpoint(settings);
  const apiKey = String(settings.apiKey ?? "").trim();

  if (!apiKey) {
    throw new Error("DeepL necesita una API key en Opciones.");
  }

  const targetLanguageCode = DEEPL_TARGET_LANGUAGE_CODES[targetLanguage];
  if (!targetLanguageCode) {
    throw new Error("El idioma destino no está soportado por la configuración actual de DeepL.");
  }

  const payload = {
    text: [text],
    target_lang: targetLanguageCode,
    model_type: "prefer_quality_optimized"
  };

  const sourceLanguageCode = DEEPL_SOURCE_LANGUAGE_CODES[sourceLanguage];
  if (sourceLanguageCode) {
    payload.source_lang = sourceLanguageCode;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), settings.requestTimeoutMs);

  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (error) {
      throw buildDeepLRequestError(error, endpoint, settings);
    }

    if (!response.ok) {
      let details = "";

      try {
        const errorData = await response.json();
        details = typeof errorData?.message === "string" ? errorData.message.trim() : "";
      } catch (error) {
        details = "";
      }

      if (response.status === 403) {
        throw new Error("DeepL rechazó la API key. Revisa la clave configurada en Opciones.");
      }

      if (response.status === 456) {
        throw new Error("DeepL indicó que has alcanzado el límite o la cuota disponible de la cuenta.");
      }

      throw new Error(
        details
          ? `DeepL respondió con HTTP ${response.status}: ${details}`
          : `DeepL respondió con HTTP ${response.status}.`
      );
    }

    const data = await response.json();
    const translatedText =
      typeof data?.translations?.[0]?.text === "string" ? data.translations[0].text.trim() : "";

    if (!translatedText) {
      throw new Error("La respuesta de DeepL no incluyó texto traducido.");
    }

    return translatedText;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function translateText({ text, sourceLanguage, targetLanguage, settings }) {
  const backend = getTranslationBackend(settings);

  if (backend === "mymemory") {
    return translateWithMyMemory({
      text,
      sourceLanguage,
      targetLanguage,
      settings
    });
  }

  if (backend === "deepl") {
    return translateWithDeepL({
      text,
      sourceLanguage,
      targetLanguage,
      settings
    });
  }

  return translateWithLibreTranslate({
    text,
    sourceLanguage,
    targetLanguage,
    settings
  });
}

function getSynonymProviderMessage(sourceLanguage) {
  if (!sourceLanguage) {
    return "Selecciona un idioma origen para poder buscar sinónimos.";
  }

  if (sourceLanguage === "es") {
    return "Los sinónimos automáticos todavía no están disponibles para español.";
  }

  return "";
}

async function fetchEnglishSynonyms(text, timeoutMs) {
  const endpoint = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`;
  const data = await fetchJsonWithTimeout(endpoint, { timeoutMs });
  const synonyms = [];

  for (const entry of Array.isArray(data) ? data : []) {
    for (const meaning of entry.meanings ?? []) {
      synonyms.push(...(meaning.synonyms ?? []));

      for (const definition of meaning.definitions ?? []) {
        synonyms.push(...(definition.synonyms ?? []));
      }
    }
  }

  return uniqueByNormalizedValue(
    synonyms
      .map((value) => sanitizeSynonymCandidate(value))
      .filter((value) => value && value.toLocaleLowerCase("es-ES") !== text.toLocaleLowerCase("es-ES"))
  ).slice(0, MAX_SYNONYMS);
}

async function fetchGermanSynonyms(text, timeoutMs) {
  const endpoint = `https://www.openthesaurus.de/synonyme/search?q=${encodeURIComponent(text)}&format=application/json`;
  const data = await fetchJsonWithTimeout(endpoint, {
    timeoutMs,
    headers: {
      "User-Agent": "plugin-german-translator/1.0"
    }
  });
  const synonyms = [];

  for (const synset of data.synsets ?? []) {
    for (const term of synset.terms ?? []) {
      synonyms.push(term.term);
    }
  }

  return uniqueByNormalizedValue(
    synonyms
      .map((value) => sanitizeSynonymCandidate(value))
      .filter((value) => value && value.toLocaleLowerCase("es-ES") !== text.toLocaleLowerCase("es-ES"))
  ).slice(0, MAX_SYNONYMS);
}

async function fetchSynonyms(text, sourceLanguage, timeoutMs) {
  switch (sourceLanguage) {
    case "en":
      return fetchEnglishSynonyms(text, timeoutMs);
    case "de":
      return fetchGermanSynonyms(text, timeoutMs);
    default:
      return [];
  }
}

async function fetchExampleSentences(text, sourceLanguage, timeoutMs) {
  const tatoebaLanguageCode = TATOEBA_LANGUAGE_CODES[sourceLanguage];
  if (!tatoebaLanguageCode) {
    return [];
  }

  const endpoint = new URL("/v1/sentences", EXAMPLES_API_BASE_URL);
  endpoint.searchParams.set("lang", tatoebaLanguageCode);
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set("sort", "random");
  endpoint.searchParams.set("limit", String(MAX_EXAMPLES));

  const data = await fetchJsonWithTimeout(endpoint, { timeoutMs });
  return uniqueByNormalizedValue((data.data ?? []).map((entry) => entry.text)).slice(0, MAX_EXAMPLES);
}

async function fetchEnglishPhonetics(text, timeoutMs) {
  const endpoint = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`;
  const data = await fetchJsonWithTimeout(endpoint, { timeoutMs });
  const phonetics = [];

  for (const entry of Array.isArray(data) ? data : []) {
    phonetics.push(entry?.phonetic);

    for (const item of entry.phonetics ?? []) {
      phonetics.push(item?.text);
    }
  }

  return normalizePhoneticList(phonetics);
}

async function fetchWiktionaryPhonetics(text, sourceLanguage, timeoutMs) {
  const endpoint = new URL(`/v1/en/word/${encodeURIComponent(text)}`, WIKTAPI_API_BASE_URL);
  endpoint.searchParams.set("lang", sourceLanguage);

  const data = await fetchJsonWithTimeout(endpoint, { timeoutMs });
  const phonetics = [];

  for (const entry of data.entries ?? []) {
    for (const sound of entry.sounds ?? []) {
      phonetics.push(sound?.ipa);
    }
  }

  return normalizePhoneticList(phonetics);
}

async function fetchPhonetics(text, sourceLanguage, timeoutMs) {
  switch (sourceLanguage) {
    case "en":
      return fetchEnglishPhonetics(text, timeoutMs);
    case "es":
    case "de":
      return fetchWiktionaryPhonetics(text, sourceLanguage, timeoutMs);
    default:
      return [];
  }
}

async function buildLexicalInsights(text, sourceLanguage, settings, options = {}) {
  const lexical = {
    phonetics: [],
    synonyms: [],
    examples: [],
    notes: [],
    warnings: []
  };

  if (!options.includeSynonyms && !options.includeExamples && !isSingleWord(text)) {
    return lexical;
  }

  if (!sourceLanguage) {
    lexical.notes.push("Selecciona el idioma origen manualmente para ver fonética, sinónimos o ejemplos.");
    return lexical;
  }

  const tasks = [];
  const isSingleSourceWord = isSingleWord(text);

  if (isSingleSourceWord) {
    tasks.push(
      fetchPhonetics(text, sourceLanguage, settings.requestTimeoutMs)
        .then((phonetics) => {
          lexical.phonetics = phonetics;
        })
        .catch((error) => {
          console.warn("No se pudo cargar la transcripción fonética.", error);
        })
    );
  }

  if (options.includeSynonyms) {
    if (!isSingleSourceWord) {
      lexical.notes.push("Los sinónimos solo se buscan para palabras sueltas.");
    } else {
      const providerMessage = getSynonymProviderMessage(sourceLanguage);
      if (providerMessage) {
        lexical.notes.push(providerMessage);
      } else {
        tasks.push(
          fetchSynonyms(text, sourceLanguage, settings.requestTimeoutMs)
            .then((synonyms) => {
              lexical.synonyms = synonyms;
            })
            .catch((error) => {
              console.warn("No se pudieron cargar los sinónimos.", error);
              lexical.warnings.push("No se pudieron cargar los sinónimos en este momento.");
            })
        );
      }
    }
  }

  if (options.includeExamples) {
    tasks.push(
      fetchExampleSentences(text, sourceLanguage, settings.requestTimeoutMs)
        .then((examples) => {
          lexical.examples = examples;
        })
        .catch((error) => {
          console.warn("No se pudieron cargar los ejemplos.", error);
          lexical.warnings.push("No se pudieron cargar ejemplos de uso en este momento.");
        })
    );
  }

  await Promise.all(tasks);

  if (options.includeSynonyms && !lexical.synonyms.length && !lexical.warnings.length) {
    const synonymProviderMessage = getSynonymProviderMessage(sourceLanguage);
    if (!synonymProviderMessage && isSingleWord(text)) {
      lexical.notes.push("No encontré sinónimos para esta palabra.");
    }
  }

  if (options.includeExamples && !lexical.examples.length && !lexical.warnings.length) {
    lexical.notes.push("No encontré ejemplos de uso para este texto.");
  }

  return lexical;
}

function buildEmptyLexicalInsights() {
  return {
    phonetics: [],
    synonyms: [],
    examples: [],
    notes: [],
    warnings: []
  };
}

function shouldDeferLexicalInsights(text, translationMode, options = {}) {
  if (translationMode !== TRANSLATION_MODES.FULL) {
    return false;
  }

  return isSingleWord(text) || options.includeSynonyms || options.includeExamples;
}

function normalizeTranslationRequestId(requestId) {
  const normalized = String(requestId ?? "").trim();
  return normalized || null;
}

async function buildTranslationResult(text, requestedSourceLanguage, options = {}) {
  const cleanText = String(text ?? "").trim();
  const maxTextLength = Number.isFinite(options.maxTextLength)
    ? options.maxTextLength
    : MAX_TEXT_LENGTH;

  if (!cleanText) {
    throw new Error("No hay texto para traducir.");
  }

  if (cleanText.length > maxTextLength) {
    throw new Error(
      `El texto es demasiado largo para una traducción rápida (${maxTextLength} caracteres máximo).`
    );
  }

  const settings = await getStoredSettings();
  const activePreferences = options.useActivePreferences
    ? await getActiveTranslationPreferences()
    : null;
  const resolvedPreferences = resolveTranslationPreferences(
    settings,
    requestedSourceLanguage,
    options,
    activePreferences
  );
  const {
    requestedSourceLanguage: effectiveRequestedSourceLanguage,
    requestedTargetLanguage,
    translationMode,
    wordWiseLevel,
    includeSynonyms,
    includeExamples
  } = resolvedPreferences;
  const requestId = normalizeTranslationRequestId(options.requestId);
  const resultId = createEntryId();
  const createdAt = new Date().toISOString();
  let sourceLanguage =
    effectiveRequestedSourceLanguage === "auto"
      ? await detectSourceLanguage(cleanText)
      : normalizeLanguageCode(effectiveRequestedSourceLanguage);

  if (!SUPPORTED_LANGUAGE_CODES.has(sourceLanguage)) {
    sourceLanguage = null;
  }

  let effectiveTargetLanguage =
    requestedTargetLanguage && SUPPORTED_LANGUAGE_CODES.has(requestedTargetLanguage)
      ? requestedTargetLanguage
      : translationMode === TRANSLATION_MODES.WORD_WISE
        ? pickDefaultTargetLanguage(sourceLanguage, settings)
        : null;

  if (translationMode === TRANSLATION_MODES.WORD_WISE && effectiveTargetLanguage === "de") {
    effectiveTargetLanguage = pickDefaultTargetLanguage("de", settings);
  }

  if (
    effectiveRequestedSourceLanguage !== "auto" &&
    effectiveTargetLanguage &&
    effectiveTargetLanguage === sourceLanguage
  ) {
    throw new Error("El idioma origen y el idioma destino no pueden ser iguales.");
  }

  const targetLanguages = effectiveTargetLanguage
    ? [effectiveTargetLanguage]
    : SUPPORTED_LANGUAGES.map((language) => language.code).filter(
        (languageCode) => languageCode !== sourceLanguage
      );

  const translationsPromise =
    translationMode === TRANSLATION_MODES.FULL
      ? Promise.all(
          targetLanguages.map(async (targetLanguage) => {
            const translatedText = await translateText({
              text: cleanText,
              sourceLanguage: sourceLanguage ?? "auto",
              targetLanguage,
              settings
            });

            return {
              code: targetLanguage,
              label: getLanguageLabel(targetLanguage),
              text: translatedText
            };
          })
        )
      : Promise.resolve([]);
  const lexicalPromise =
    translationMode === TRANSLATION_MODES.FULL
      ? buildLexicalInsights(cleanText, sourceLanguage, settings, {
          includeSynonyms,
          includeExamples
        })
      : Promise.resolve(buildEmptyLexicalInsights());
  const wordWisePromise =
    translationMode === TRANSLATION_MODES.WORD_WISE && targetLanguages[0]
      ? buildWordWiseResult({
          text: cleanText,
          sourceLanguage,
          targetLanguage: targetLanguages[0],
          settings,
          level: wordWiseLevel
        })
      : Promise.resolve(
          buildEmptyWordWiseResult({
            level: wordWiseLevel,
            targetLanguage: targetLanguages[0] ?? null
          })
        );
  const shouldDeferLexical =
    options.deferLexical === true &&
    shouldDeferLexicalInsights(cleanText, translationMode, {
      includeSynonyms,
      includeExamples
    });
  const [translations, wordWise] = await Promise.all([translationsPromise, wordWisePromise]);
  const baseResult = {
    id: resultId,
    requestId,
    input: cleanText,
    translationMode,
    sourceLanguage: {
      code: sourceLanguage ?? "auto",
      label: sourceLanguage ? getLanguageLabel(sourceLanguage) : "Auto",
      isAutoDetected: effectiveRequestedSourceLanguage === "auto"
    },
    targetLanguage: targetLanguages[0]
      ? {
          code: targetLanguages[0],
          label: getLanguageLabel(targetLanguages[0])
        }
      : null,
    translations,
    provider: {
      backend: getTranslationBackend(settings),
      apiBaseUrl: settings.apiBaseUrl,
      apiPath: settings.apiPath
    },
    settingsSnapshot: {
      defaultTranslationMode: normalizeTranslationMode(settings.defaultTranslationMode),
      defaultWordWiseLevel: normalizeWordWiseLevel(settings.defaultWordWiseLevel),
      defaultTargetLanguage: pickDefaultTargetLanguage(sourceLanguage, settings)
    },
    sourceType: options.sourceType ?? null,
    lexical: buildEmptyLexicalInsights(),
    wordWise,
    pendingLexical: shouldDeferLexical,
    createdAt
  };

  if (shouldDeferLexical) {
    void lexicalPromise
      .then((lexical) =>
        options.onDeferredLexicalResult?.({
          ...baseResult,
          lexical,
          pendingLexical: false
        })
      )
      .catch((error) => {
        console.warn("No se pudo completar la carga diferida de extras léxicos.", error);
      });

    return baseResult;
  }

  return {
    ...baseResult,
    lexical: await lexicalPromise,
    pendingLexical: false
  };
}

async function setLastSelection(text) {
  await browserApi.storage.local.set({
    lastSelection: String(text ?? "").trim()
  });
}

async function setPopupDraft(draft) {
  const normalizedDraft = {
    inputText: String(draft?.inputText ?? ""),
    sourceLanguage: normalizeLanguageCode(draft?.sourceLanguage) || "auto",
    targetLanguage: normalizeLanguageCode(draft?.targetLanguage) || "en",
    translationMode: normalizeTranslationMode(draft?.translationMode),
    wordWiseLevel: normalizeWordWiseLevel(draft?.wordWiseLevel),
    includeSynonyms: draft?.includeSynonyms !== false,
    includeExamples: draft?.includeExamples !== false,
    createdAt: new Date().toISOString()
  };

  await browserApi.storage.local.set({
    [POPUP_DRAFT_KEY]: normalizedDraft
  });

  return normalizedDraft;
}

async function getPopupDraft() {
  const stored = await browserApi.storage.local.get(POPUP_DRAFT_KEY);
  return stored[POPUP_DRAFT_KEY] ?? null;
}

async function setLastResult(result, pageContext = null) {
  const normalizedPageContext = normalizePageContext(pageContext);
  const nextResult =
    normalizedPageContext.pageTitle || normalizedPageContext.pageUrl
      ? {
          ...result,
          ...normalizedPageContext
        }
      : result;

  await browserApi.storage.local.set({
    lastResult: nextResult,
    lastSelection: result.input
  });
}

async function setLastError(text, errorMessage) {
  await browserApi.storage.local.set({
    lastResult: {
      input: String(text ?? "").trim(),
      error: errorMessage,
      createdAt: new Date().toISOString()
    }
  });
}

function normalizeEntryText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeEntryKey(text) {
  return normalizeEntryText(text).toLocaleLowerCase("es-ES");
}

function getEntryItemType(text) {
  return isSingleWord(text) ? "word" : "phrase";
}

function normalizeLanguageMetadata(language) {
  if (!language || typeof language !== "object") {
    return null;
  }

  const code = normalizeLanguageCode(language.code);
  const label = String(language.label ?? "").trim();

  if (!code && !label) {
    return null;
  }

  return {
    code: code || "",
    label: label || getLanguageLabel(code)
  };
}

function normalizeTranslations(translations) {
  if (!Array.isArray(translations)) {
    return [];
  }

  return translations
    .map((translation) => {
      const text = normalizeEntryText(translation?.text);
      if (!text) {
        return null;
      }

      const code = normalizeLanguageCode(translation?.code);
      return {
        code: code || "",
        label: String(translation?.label ?? "").trim() || getLanguageLabel(code),
        text
      };
    })
    .filter(Boolean);
}

function normalizePhonetics(phonetics) {
  return normalizePhoneticList(phonetics);
}

function normalizeGlossaryStatus(status) {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  return GLOSSARY_STATUS_VALUES.has(normalizedStatus) ? normalizedStatus : "new";
}

function normalizeTagList(tags) {
  const rawTags = Array.isArray(tags) ? tags : String(tags ?? "").split(",");
  return uniqueByNormalizedValue(
    rawTags
      .map((tag) => normalizeEntryText(tag))
      .filter(Boolean)
  );
}

function normalizePageContext(pageContext) {
  return {
    pageTitle: String(pageContext?.pageTitle ?? pageContext?.title ?? "").trim(),
    pageUrl: String(pageContext?.pageUrl ?? pageContext?.url ?? "").trim()
  };
}

function normalizeFreeformText(text) {
  return String(text ?? "").trim();
}

function sortEntriesByCreatedAt(entries) {
  return [...entries].sort((left, right) =>
    String(right?.createdAt ?? "").localeCompare(String(left?.createdAt ?? ""))
  );
}

function limitHistoryEntries(entries) {
  return sortEntriesByCreatedAt(entries).slice(0, HISTORY_ENTRY_LIMIT);
}

function dedupeGlossaryEntries(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of sortEntriesByCreatedAt(entries)) {
    const normalizedText = normalizeEntryKey(entry?.text);
    if (!normalizedText || seen.has(normalizedText)) {
      continue;
    }

    seen.add(normalizedText);
    result.push(entry);
  }

  return result;
}

function buildHistoryEntry(translationResult, pageContext = null) {
  const cleanText = normalizeEntryText(translationResult?.input ?? translationResult?.text);
  if (!cleanText || translationResult?.error) {
    return null;
  }

  const normalizedPageContext = normalizePageContext(pageContext ?? translationResult);
  return {
    id: String(translationResult?.id ?? createEntryId()),
    text: cleanText,
    normalizedText: normalizeEntryKey(cleanText),
    itemType: getEntryItemType(cleanText),
    translationMode: normalizeTranslationMode(translationResult?.translationMode),
    sourceLanguage: normalizeLanguageMetadata(translationResult?.sourceLanguage),
    targetLanguage: normalizeLanguageMetadata(translationResult?.targetLanguage),
    translations: normalizeTranslations(translationResult?.translations),
    phonetics: normalizePhonetics(
      translationResult?.phonetics ?? translationResult?.lexical?.phonetics
    ),
    createdAt: String(translationResult?.createdAt ?? new Date().toISOString()),
    sourceType: translationResult?.sourceType ?? null,
    pageTitle: normalizedPageContext.pageTitle,
    pageUrl: normalizedPageContext.pageUrl
  };
}

function buildGlossaryEntry(text, translationResult = null, pageContext = null, overrides = {}) {
  const cleanText = normalizeEntryText(text);
  if (!cleanText) {
    throw new Error("No hay texto para guardar.");
  }

  const matchesInput = normalizeEntryText(translationResult?.input) === cleanText;
  const normalizedPageContext = normalizePageContext({
    ...(matchesInput ? translationResult : null),
    ...pageContext,
    pageTitle: overrides.pageTitle ?? pageContext?.pageTitle ?? translationResult?.pageTitle,
    pageUrl: overrides.pageUrl ?? pageContext?.pageUrl ?? translationResult?.pageUrl
  });
  const createdAt = String(
    overrides.createdAt ?? translationResult?.createdAt ?? new Date().toISOString()
  );

  return {
    id: String(overrides.id ?? createEntryId()),
    text: cleanText,
    normalizedText: normalizeEntryKey(cleanText),
    itemType: overrides.itemType ?? getEntryItemType(cleanText),
    sourceLanguage: normalizeLanguageMetadata(
      overrides.sourceLanguage ?? (matchesInput ? translationResult?.sourceLanguage : null)
    ),
    targetLanguage: normalizeLanguageMetadata(
      overrides.targetLanguage ?? (matchesInput ? translationResult?.targetLanguage : null)
    ),
    translations: normalizeTranslations(
      overrides.translations ?? (matchesInput ? translationResult?.translations : [])
    ),
    phonetics: normalizePhonetics(
      overrides.phonetics ??
        (matchesInput
          ? translationResult?.phonetics ?? translationResult?.lexical?.phonetics
          : [])
    ),
    contextText: normalizeFreeformText(overrides.contextText),
    note: normalizeFreeformText(overrides.note),
    tags: normalizeTagList(overrides.tags),
    status: normalizeGlossaryStatus(overrides.status),
    favorite: overrides.favorite === true,
    createdAt,
    updatedAt: String(overrides.updatedAt ?? createdAt),
    pageTitle: normalizedPageContext.pageTitle,
    pageUrl: normalizedPageContext.pageUrl,
    originHistoryId: String(overrides.originHistoryId ?? "").trim() || null
  };
}

function normalizeStoredHistoryEntry(entry) {
  return buildHistoryEntry(entry, entry);
}

function normalizeStoredGlossaryEntry(entry) {
  const cleanText = normalizeEntryText(entry?.text);
  if (!cleanText) {
    return null;
  }

  return buildGlossaryEntry(cleanText, null, entry, {
    id: entry.id,
    itemType: entry.itemType ?? getEntryItemType(cleanText),
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    translations: entry.translations,
    phonetics: entry.phonetics,
    contextText: entry.contextText,
    note: entry.note,
    tags: entry.tags,
    status: entry.status,
    favorite: entry.favorite,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    pageTitle: entry.pageTitle,
    pageUrl: entry.pageUrl,
    originHistoryId: entry.originHistoryId
  });
}

function buildLegacyGlossaryEntry(entry) {
  const cleanText = normalizeEntryText(entry?.text);
  if (!cleanText) {
    return null;
  }

  return buildGlossaryEntry(cleanText, null, entry, {
    id: entry.id,
    sourceLanguage: entry.sourceLanguage,
    translations: entry.translations,
    phonetics: entry.phonetics,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt
  });
}

async function ensureSavedCollectionsMigrated() {
  if (didEnsureSavedCollectionsMigration) {
    return;
  }

  const stored = await browserApi.storage.local.get([
    TRANSLATION_HISTORY_KEY,
    GLOSSARY_ENTRIES_KEY,
    LEGACY_SAVED_ENTRIES_KEY
  ]);
  const historyEntries = limitHistoryEntries(
    (Array.isArray(stored[TRANSLATION_HISTORY_KEY]) ? stored[TRANSLATION_HISTORY_KEY] : [])
      .map(normalizeStoredHistoryEntry)
      .filter(Boolean)
  );
  const glossaryEntries = dedupeGlossaryEntries(
    (Array.isArray(stored[GLOSSARY_ENTRIES_KEY]) ? stored[GLOSSARY_ENTRIES_KEY] : [])
      .map(normalizeStoredGlossaryEntry)
      .filter(Boolean)
  );
  const migratedLegacyEntries = (
    Array.isArray(stored[LEGACY_SAVED_ENTRIES_KEY]) ? stored[LEGACY_SAVED_ENTRIES_KEY] : []
  )
    .map(buildLegacyGlossaryEntry)
    .filter(Boolean);
  const nextGlossaryEntries = dedupeGlossaryEntries([
    ...glossaryEntries,
    ...migratedLegacyEntries
  ]);

  await browserApi.storage.local.set({
    [TRANSLATION_HISTORY_KEY]: historyEntries,
    [GLOSSARY_ENTRIES_KEY]: nextGlossaryEntries
  });

  if (stored[LEGACY_SAVED_ENTRIES_KEY] !== undefined) {
    await browserApi.storage.local.remove(LEGACY_SAVED_ENTRIES_KEY);
  }

  didEnsureSavedCollectionsMigration = true;
}

async function getHistoryEntries() {
  await ensureSavedCollectionsMigrated();
  const stored = await browserApi.storage.local.get(TRANSLATION_HISTORY_KEY);
  const entries = Array.isArray(stored[TRANSLATION_HISTORY_KEY]) ? stored[TRANSLATION_HISTORY_KEY] : [];
  return limitHistoryEntries(entries.map(normalizeStoredHistoryEntry).filter(Boolean));
}

async function getGlossaryEntries() {
  await ensureSavedCollectionsMigrated();
  const stored = await browserApi.storage.local.get(GLOSSARY_ENTRIES_KEY);
  const entries = Array.isArray(stored[GLOSSARY_ENTRIES_KEY]) ? stored[GLOSSARY_ENTRIES_KEY] : [];
  return dedupeGlossaryEntries(entries.map(normalizeStoredGlossaryEntry).filter(Boolean));
}

async function appendHistoryEntry(translationResult, pageContext = null) {
  const entry = buildHistoryEntry(translationResult, pageContext);
  if (!entry) {
    return null;
  }

  const entries = await getHistoryEntries();
  const nextEntries = limitHistoryEntries([entry, ...entries]);
  await browserApi.storage.local.set({ [TRANSLATION_HISTORY_KEY]: nextEntries });
  return entry;
}

async function updateHistoryEntry(translationResult, pageContext = null) {
  const entry = buildHistoryEntry(translationResult, pageContext);
  if (!entry) {
    return null;
  }

  const entries = await getHistoryEntries();
  const hasExistingEntry = entries.some((storedEntry) => storedEntry.id === entry.id);
  const nextEntries = hasExistingEntry
    ? limitHistoryEntries(entries.map((storedEntry) => (storedEntry.id === entry.id ? entry : storedEntry)))
    : limitHistoryEntries([entry, ...entries]);
  await browserApi.storage.local.set({ [TRANSLATION_HISTORY_KEY]: nextEntries });
  return entry;
}

async function sendTranslationUpdate(sender, result) {
  if (sender?.tab?.id) {
    try {
      await browserApi.tabs.sendMessage(sender.tab.id, {
        type: "translation-update",
        requestId: result.requestId,
        result
      });
    } catch (error) {
      console.warn("No se pudo entregar la actualización de traducción a la pestaña activa.", error);
    }
    return;
  }

  try {
    await browserApi.runtime.sendMessage({
      type: "translation-update",
      requestId: result.requestId,
      result
    });
  } catch (error) {
    console.warn("No se pudo entregar la actualización de traducción al popup.", error);
  }
}

async function saveEntry(text, { pageContext = null, translationResult = null, originHistoryId = null } = {}) {
  const cleanText = normalizeEntryText(text);
  if (!cleanText) {
    throw new Error("No hay texto para guardar.");
  }

  await ensureSavedCollectionsMigrated();
  const stored = await browserApi.storage.local.get(["lastResult", GLOSSARY_ENTRIES_KEY]);
  const lastResult = stored.lastResult ?? null;
  const glossaryEntries = Array.isArray(stored[GLOSSARY_ENTRIES_KEY]) ? stored[GLOSSARY_ENTRIES_KEY] : [];
  const existingEntry = glossaryEntries.find(
    (entry) => normalizeEntryKey(entry.text) === normalizeEntryKey(cleanText)
  );

  if (existingEntry) {
    return {
      entry: normalizeStoredGlossaryEntry(existingEntry),
      duplicate: true
    };
  }

  const entry = buildGlossaryEntry(cleanText, translationResult ?? lastResult, pageContext, {
    originHistoryId
  });
  const nextEntries = dedupeGlossaryEntries([entry, ...glossaryEntries]);
  await browserApi.storage.local.set({ [GLOSSARY_ENTRIES_KEY]: nextEntries });

  return {
    entry,
    duplicate: false
  };
}

async function updateGlossaryEntry(entryId, updates = {}) {
  const entries = await getGlossaryEntries();
  const existingEntry = entries.find((entry) => entry.id === entryId);

  if (!existingEntry) {
    throw new Error("No se encontró la entrada del glosario.");
  }

  const nextEntry = buildGlossaryEntry(existingEntry.text, null, existingEntry, {
    ...existingEntry,
    contextText: updates.contextText ?? existingEntry.contextText,
    note: updates.note ?? existingEntry.note,
    tags: updates.tags ?? existingEntry.tags,
    status: updates.status ?? existingEntry.status,
    favorite: updates.favorite ?? existingEntry.favorite,
    updatedAt: new Date().toISOString()
  });
  const nextEntries = entries.map((entry) => (entry.id === entryId ? nextEntry : entry));
  await browserApi.storage.local.set({ [GLOSSARY_ENTRIES_KEY]: nextEntries });
  return nextEntry;
}

async function deleteHistoryEntry(entryId) {
  const entries = await getHistoryEntries();
  const nextEntries = entries.filter((entry) => entry.id !== entryId);
  await browserApi.storage.local.set({ [TRANSLATION_HISTORY_KEY]: nextEntries });
  return nextEntries;
}

async function deleteGlossaryEntry(entryId) {
  const entries = await getGlossaryEntries();
  const nextEntries = entries.filter((entry) => entry.id !== entryId);
  await browserApi.storage.local.set({ [GLOSSARY_ENTRIES_KEY]: nextEntries });
  return nextEntries;
}

async function promoteHistoryEntry(entryId) {
  const entries = await getHistoryEntries();
  const historyEntry = entries.find((entry) => entry.id === entryId);

  if (!historyEntry) {
    throw new Error("No se encontró la entrada del historial.");
  }

  return saveEntry(historyEntry.text, {
    pageContext: historyEntry,
    translationResult: {
      input: historyEntry.text,
      sourceLanguage: historyEntry.sourceLanguage,
      targetLanguage: historyEntry.targetLanguage,
      translations: historyEntry.translations,
      phonetics: historyEntry.phonetics,
      createdAt: historyEntry.createdAt
    },
    originHistoryId: historyEntry.id
  });
}

async function translateAndStore(text, sourceLanguage = "auto", pageContext = null) {
  const result = await buildTranslationResult(text, sourceLanguage);
  await setLastResult(result, pageContext);
  await appendHistoryEntry(result, pageContext);
  return result;
}

async function getActivePageContext() {
  const activeTab = await getActiveTab();
  return normalizePageContext(activeTab);
}

async function openResultsTab() {
  await browserApi.tabs.create({
    url: browserApi.runtime.getURL("popup.html?mode=tab")
  });
}

async function openPinnedPopupWindow(draft = null) {
  const pinnedPopupUrl = browserApi.runtime.getURL("popup.html?mode=pinned");

  if (draft) {
    await setPopupDraft(draft);
  }

  if (pinnedPopupWindowId) {
    try {
      const existingTabs = await browserApi.tabs.query({
        windowId: pinnedPopupWindowId
      });
      if (existingTabs[0]?.id) {
        await browserApi.tabs.update(existingTabs[0].id, {
          url: pinnedPopupUrl
        });
      }
      await browserApi.windows.update(pinnedPopupWindowId, {
        focused: true
      });
      return pinnedPopupWindowId;
    } catch (error) {
      pinnedPopupWindowId = null;
    }
  }

  const popupWindow = await browserApi.windows.create({
    url: pinnedPopupUrl,
    type: "popup",
    width: PINNED_POPUP_DIMENSIONS.width,
    height: PINNED_POPUP_DIMENSIONS.height
  });

  pinnedPopupWindowId = popupWindow?.id ?? null;
  return pinnedPopupWindowId;
}

async function openSavedTab() {
  await browserApi.tabs.create({
    url: browserApi.runtime.getURL("saved.html")
  });
}

async function getActiveTab() {
  const tabs = await browserApi.tabs.query({
    active: true,
    currentWindow: true
  });
  return tabs[0];
}

function isProbablyPdfTab(tab) {
  const url = String(tab?.url ?? "").trim().toLowerCase();
  const title = String(tab?.title ?? "").trim().toLowerCase();

  if (!url) {
    return false;
  }

  if (url.endsWith(".pdf") || /[?#].*\.pdf(?:[?#]|$)/i.test(url)) {
    return true;
  }

  if (
    url.includes("application/pdf") ||
    url.includes("/pdf.js/") ||
    (url.includes("viewer.html?file=") && (url.includes(".pdf") || url.includes("%2fpdf"))) ||
    title.endsWith(".pdf")
  ) {
    return true;
  }

  return false;
}

async function getSelectionFromActiveTab() {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    return "";
  }

  try {
    const response = await browserApi.tabs.sendMessage(activeTab.id, {
      type: "get-selection-text"
    });
    return String(response?.text ?? "").trim();
  } catch (error) {
    console.warn("No se pudo leer la selección de la pestaña activa.", error);
    return "";
  }
}

function buildStartPickerError(error) {
  const rawMessage = String(error?.message ?? "");
  if (
    /Receiving end does not exist/i.test(rawMessage) ||
    /Could not establish connection/i.test(rawMessage)
  ) {
    return new Error(
      "No se pudo activar la selección de bloques en esta pestaña. Asegúrate de estar en una página web normal."
    );
  }

  return new Error(
    rawMessage ||
      "No se pudo activar la selección de bloques en esta pestaña. Asegúrate de estar en una página web normal."
  );
}

async function startDomBlockPicker(translationOptions = {}) {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    throw new Error("No se encontró una pestaña activa para iniciar la selección de bloques.");
  }

  try {
    await browserApi.tabs.sendMessage(activeTab.id, {
      type: "start-dom-block-picker",
      translationOptions: {
        sourceLanguage: translationOptions.sourceLanguage ?? "auto",
        targetLanguage: translationOptions.targetLanguage ?? "en"
      }
    });
  } catch (error) {
    throw buildStartPickerError(error);
  }

  return { started: true };
}

async function createContextMenu() {
  try {
    await browserApi.contextMenus.removeAll();
  } catch (error) {
    console.warn("No se pudieron limpiar los menús previos.", error);
  }

  await browserApi.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Traducir selección ES/EN/DE",
    contexts: ["selection"]
  });

  await browserApi.contextMenus.create({
    id: SAVE_CONTEXT_MENU_ID,
    title: "Guardar palabra o frase",
    contexts: ["selection"]
  });
}

async function initializeExtension() {
  await ensureDefaultSettings();
  await ensureSavedCollectionsMigrated();
  await createContextMenu();
}

function ensureExtensionInitialized() {
  if (!extensionInitializationPromise) {
    extensionInitializationPromise = initializeExtension().catch((error) => {
      extensionInitializationPromise = null;
      throw error;
    });
  }

  return extensionInitializationPromise;
}

browserApi.runtime.onInstalled.addListener(() => {
  ensureExtensionInitialized().catch((error) => {
    console.error("Error al inicializar la extensión", error);
  });
});

browserApi.runtime.onStartup?.addListener(() => {
  ensureExtensionInitialized().catch((error) => {
    console.error("Error al recrear el menú de contexto", error);
  });
});

browserApi.windows?.onRemoved?.addListener((windowId) => {
  if (windowId === pinnedPopupWindowId) {
    pinnedPopupWindowId = null;
  }
});

browserApi.contextMenus.onClicked.addListener(async (info) => {
  const selectedText = String(info.selectionText ?? "").trim();
  const pageContext = await getActivePageContext();

  if (info.menuItemId === SAVE_CONTEXT_MENU_ID) {
    try {
      await setLastSelection(selectedText);
      if (!selectedText) {
        await setLastError("", "No se encontró una selección válida para guardar.");
      } else {
        const result = await saveEntry(selectedText, { pageContext });
        await browserApi.storage.local.set({
          saveFeedback: {
            text: selectedText,
            duplicate: result.duplicate,
            createdAt: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      await setLastError(selectedText, error.message);
    }
    await openResultsTab();
    return;
  }

  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  if (!selectedText) {
    await setLastError("", "No se encontró una selección válida.");
    await openResultsTab();
    return;
  }

  try {
    await setLastSelection(selectedText);
    await translateAndStore(selectedText, "auto", pageContext);
  } catch (error) {
    await setLastError(selectedText, error.message);
  }

  await openResultsTab();
});

browserApi.commands.onCommand.addListener(async (command) => {
  if (command === START_BLOCK_PICKER_COMMAND) {
    try {
      await startDomBlockPicker({
        sourceLanguage: "auto",
        targetLanguage: "en"
      });
    } catch (error) {
      await setLastError("", error.message);
    }
    return;
  }

  if (command === TRANSLATE_PDF_SELECTION_COMMAND) {
    const activeTab = await getActiveTab();

    if (!isProbablyPdfTab(activeTab)) {
      return;
    }

    const selectedText = await getSelectionFromActiveTab();
    if (!selectedText) {
      await setLastError(
        "",
        "No se pudo leer la selección del PDF desde el visor del navegador. Usa clic derecho sobre la selección o copia y pega el texto en el popup."
      );
      await openResultsTab();
      return;
    }

    try {
      await translateAndStore(selectedText, "auto", normalizePageContext(activeTab));
    } catch (error) {
      await setLastError(selectedText, error.message);
    }

    await openResultsTab();
    return;
  }

  if (command !== TRANSLATE_SELECTION_COMMAND) {
    return;
  }

  const selectedText = await getSelectionFromActiveTab();
  if (!selectedText) {
    await setLastError(
      "",
      "No se pudo leer la selección actual. En PDFs usa clic derecho sobre la selección o copia y pega el texto en el popup."
    );
    await openResultsTab();
    return;
  }

  try {
    await translateAndStore(selectedText, "auto", await getActivePageContext());
  } catch (error) {
    await setLastError(selectedText, error.message);
  }

  await openResultsTab();
});

browserApi.runtime.onMessage.addListener((message, sender) => {
  switch (message?.type) {
    case "translate-text":
      return (async () => {
        const pageContext = sender?.tab ? normalizePageContext(sender.tab) : null;
        const result = await buildTranslationResult(message.text, message.sourceLanguage, {
          targetLanguage: message.targetLanguage,
          translationMode: message.translationMode,
          wordWiseLevel: message.wordWiseLevel,
          includeSynonyms: message.includeSynonyms,
          includeExamples: message.includeExamples,
          useActivePreferences: message.useActivePreferences === true,
          sourceType: message.sourceType ?? null,
          maxTextLength:
            message.sourceType === "dom-block" ? MAX_DOM_BLOCK_TEXT_LENGTH : undefined,
          requestId: message.requestId,
          deferLexical: message.deferLexical === true,
          onDeferredLexicalResult: async (finalResult) => {
            await setLastResult(finalResult, pageContext);
            await updateHistoryEntry(finalResult, pageContext);
            await sendTranslationUpdate(sender, finalResult);
          }
        });
        await setLastResult(result, pageContext);
        await appendHistoryEntry(result, pageContext);
        return result;
      })();

    case "start-dom-block-picker":
      return startDomBlockPicker(message.translationOptions ?? {});

    case "remember-selection":
      return setLastSelection(message.text);

    case "get-last-result":
      return browserApi.storage.local
        .get("lastResult")
        .then((stored) => stored.lastResult ?? null);

    case "get-last-selection":
      return browserApi.storage.local
        .get("lastSelection")
        .then((stored) => stored.lastSelection ?? "");

    case "get-popup-draft":
      return getPopupDraft();

    case "save-entry":
      return saveEntry(message.text);

    case "get-history-entries":
      return getHistoryEntries();

    case "get-glossary-entries":
      return getGlossaryEntries();

    case "promote-history-entry":
      return promoteHistoryEntry(message.entryId);

    case "update-glossary-entry":
      return updateGlossaryEntry(message.entryId, message.updates ?? {});

    case "delete-history-entry":
      return deleteHistoryEntry(message.entryId);

    case "delete-glossary-entry":
      return deleteGlossaryEntry(message.entryId);

    case "get-save-feedback":
      return browserApi.storage.local.get("saveFeedback").then(async (stored) => {
        const feedback = stored.saveFeedback ?? null;
        await browserApi.storage.local.remove("saveFeedback");
        return feedback;
      });

    case "get-settings":
      return getStoredSettings();

    case "save-settings":
      return setStoredSettings(message.settings ?? {});

    case "get-active-translation-preferences":
      return getActiveTranslationPreferences();

    case "save-active-translation-preferences":
      return setActiveTranslationPreferences(message.preferences ?? {});

    case "open-results-tab":
      return openResultsTab();

    case "open-pinned-popup":
      return openPinnedPopupWindow(message.draft ?? null);

    case "open-saved-tab":
      return openSavedTab();

    case "get-active-selection":
      return getSelectionFromActiveTab().then((text) => ({ text }));

    default:
      return undefined;
  }
});

ensureExtensionInitialized().catch((error) => {
  console.error("Error al arrancar la extensión", error);
});
