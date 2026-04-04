const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const TRANSLATION_MODES = {
  FULL: "full",
  WORD_WISE: "word-wise"
};
const WORD_WISE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const sourceLanguageElement = document.getElementById("sourceLanguage");
const targetLanguageElement = document.getElementById("targetLanguage");
const swapLanguagesButton = document.getElementById("swapLanguagesButton");
const translationModeElement = document.getElementById("translationMode");
const wordWiseLevelGroupElement = document.getElementById("wordWiseLevelGroup");
const wordWiseLevelElement = document.getElementById("wordWiseLevel");
const inputTextElement = document.getElementById("inputText");
const outputTextElement = document.getElementById("outputText");
const translateButton = document.getElementById("translateButton");
const useSelectionButton = document.getElementById("useSelectionButton");
const pickBlockButton = document.getElementById("pickBlockButton");
const saveButton = document.getElementById("saveButton");
const openSavedButton = document.getElementById("openSavedButton");
const pinPopupButton = document.getElementById("pinPopupButton");
const openOptionsButton = document.getElementById("openOptionsButton");
const openStandaloneButton = document.getElementById("openStandaloneButton");
const statusMessageElement = document.getElementById("statusMessage");
const resultRootElement = document.getElementById("resultRoot");
const shellElement = document.querySelector(".translator-shell");
const extrasCopyElement = document.getElementById("extrasCopy");
const AUTO_TRANSLATE_DELAY_MS = 1000;
const MANUAL_LANGUAGE_CODES = ["es", "en", "de"];
const SPEECH_LANGUAGE_CODES = {
  es: "es-ES",
  en: "en-GB",
  de: "de-DE"
};

let popupSettings = null;
let autoTranslateTimerId = null;
let isTranslating = false;
let queuedAutoTranslate = false;
let lastTranslationRequestKey = "";
let lastDisplayedResult = null;
let activeTranslationRequestId = "";

function createTranslationRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createElement(tagName, { className = "", textContent = null } = {}) {
  const element = document.createElement(tagName);

  if (Array.isArray(className)) {
    element.className = className.filter(Boolean).join(" ");
  } else if (className) {
    element.className = className;
  }

  if (textContent !== null) {
    element.textContent = String(textContent);
  }

  return element;
}

function appendRenderable(parent, renderable) {
  if (renderable === null || renderable === undefined || renderable === false) {
    return;
  }

  if (Array.isArray(renderable)) {
    for (const item of renderable) {
      appendRenderable(parent, item);
    }
    return;
  }

  parent.append(renderable);
}

function setChildren(parent, ...renderables) {
  parent.replaceChildren();

  for (const renderable of renderables) {
    appendRenderable(parent, renderable);
  }
}

function createMetaLine(label, value) {
  return createElement("p", {
    className: "meta-line",
    textContent: `${label}: ${value}`
  });
}

function createTagCard(title, values, getText = (value) => value) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }

  const article = createElement("article", { className: "insight-card" });
  const heading = createElement("h3", { textContent: title });
  const tagList = createElement("div", { className: "tag-list" });

  for (const value of values) {
    tagList.append(
      createElement("span", {
        className: "tag-pill",
        textContent: getText(value)
      })
    );
  }

  article.append(heading, tagList);
  return article;
}

function createTextCard(
  title,
  values,
  {
    cardClassName = "insight-card",
    listClassName = "note-list",
    itemClassName = "note-item"
  } = {}
) {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }

  const article = createElement("article", { className: cardClassName });
  const heading = createElement("h3", { textContent: title });
  const list = createElement("div", { className: listClassName });

  for (const value of values) {
    list.append(
      createElement("p", {
        className: itemClassName,
        textContent: value
      })
    );
  }

  article.append(heading, list);
  return article;
}

function getSpeechLanguageCode(languageCode) {
  return SPEECH_LANGUAGE_CODES[normalizeSupportedLanguageCode(languageCode)] ?? "";
}

function canSpeakText(text, languageCode) {
  return Boolean(
    String(text ?? "").trim() &&
      getSpeechLanguageCode(languageCode) &&
      globalThis.speechSynthesis &&
      globalThis.SpeechSynthesisUtterance
  );
}

function pickSpeechVoice(languageCode) {
  const speechLanguageCode = getSpeechLanguageCode(languageCode);
  if (!speechLanguageCode || !globalThis.speechSynthesis?.getVoices) {
    return null;
  }

  const normalizedLanguage = speechLanguageCode.toLowerCase();
  const languagePrefix = normalizedLanguage.split("-")[0];
  const voices = globalThis.speechSynthesis.getVoices();

  return (
    voices.find((voice) => String(voice?.lang ?? "").toLowerCase() === normalizedLanguage) ??
    voices.find((voice) =>
      String(voice?.lang ?? "").toLowerCase().startsWith(`${languagePrefix}-`)
    ) ??
    voices.find((voice) => String(voice?.lang ?? "").toLowerCase() === languagePrefix) ??
    null
  );
}

function speakText(text, languageCode) {
  if (!canSpeakText(text, languageCode)) {
    return false;
  }

  const utterance = new SpeechSynthesisUtterance(String(text ?? "").trim());
  utterance.lang = getSpeechLanguageCode(languageCode);

  const voice = pickSpeechVoice(languageCode);
  if (voice) {
    utterance.voice = voice;
  }

  globalThis.speechSynthesis.cancel();
  globalThis.speechSynthesis.speak(utterance);
  return true;
}

function createPronunciationButton(label, text, languageCode) {
  if (!canSpeakText(text, languageCode)) {
    return null;
  }

  const button = createElement("button", {
    className: "secondary-button pronunciation-button",
    textContent: label
  });
  button.type = "button";
  button.addEventListener("click", () => {
    if (!speakText(text, languageCode)) {
      setStatus("No se pudo reproducir la pronunciación con la voz disponible.");
      return;
    }

    setStatus(`Reproduciendo ${label.toLocaleLowerCase("es-ES")}.`);
  });
  return button;
}

function createPronunciationCard({ sourceText, sourceLanguageCode, targetText, targetLanguageCode }) {
  const actions = createElement("div", { className: "pronunciation-actions" });

  appendRenderable(
    actions,
    createPronunciationButton("Escuchar original", sourceText, sourceLanguageCode)
  );
  appendRenderable(
    actions,
    createPronunciationButton("Escuchar traducción", targetText, targetLanguageCode)
  );

  if (!actions.childNodes.length) {
    return null;
  }

  const article = createElement("article", { className: "insight-card pronunciation-card" });
  article.append(
    createElement("h3", { textContent: "Pronunciación" }),
    actions
  );
  return article;
}

function createErrorBox(message) {
  return createElement("div", {
    className: "error-box",
    textContent: message
  });
}

function createWordWiseTextElement(segments = []) {
  const paragraph = createElement("p", { className: "word-wise-text" });

  for (const segment of segments) {
    if (segment?.type === "annotation") {
      paragraph.append(
        createElement("span", {
          className: "word-wise-annotation",
          textContent: segment.text ?? ""
        })
      );
      continue;
    }

    paragraph.append(document.createTextNode(String(segment?.text ?? "")));
  }

  return paragraph;
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

function normalizeSupportedLanguageCode(languageCode) {
  const normalizedLanguageCode = String(languageCode ?? "").trim().toLowerCase();
  return MANUAL_LANGUAGE_CODES.includes(normalizedLanguageCode) ? normalizedLanguageCode : null;
}

function setStatus(message) {
  statusMessageElement.textContent = message;
}

function isWordWiseMode() {
  return normalizeTranslationMode(translationModeElement.value) === TRANSLATION_MODES.WORD_WISE;
}

function shouldIncludeSynonyms() {
  return popupSettings?.defaultIncludeSynonyms !== false;
}

function shouldIncludeExamples() {
  return popupSettings?.defaultIncludeExamples !== false;
}

function syncWordWiseControls(isBusy = false) {
  const wordWiseEnabled = isWordWiseMode();

  if (wordWiseEnabled && targetLanguageElement.value === "de") {
    targetLanguageElement.value = popupSettings?.defaultTargetLanguage === "es" ? "es" : "en";
  }

  for (const option of targetLanguageElement.options) {
    if (wordWiseEnabled && option.value === "de") {
      option.disabled = true;
      continue;
    }

    option.disabled =
      sourceLanguageElement.value !== "auto" && option.value === sourceLanguageElement.value;
  }

  for (const option of sourceLanguageElement.options) {
    option.disabled = option.value !== "auto" && option.value === targetLanguageElement.value;
  }

  if (
    sourceLanguageElement.value !== "auto" &&
    sourceLanguageElement.value === targetLanguageElement.value
  ) {
    sourceLanguageElement.value = wordWiseEnabled ? "de" : "auto";
  }

  wordWiseLevelGroupElement.hidden = !wordWiseEnabled;
  wordWiseLevelElement.disabled = isBusy || !wordWiseEnabled;
  pickBlockButton.disabled = isBusy || wordWiseEnabled;
  swapLanguagesButton.disabled = isBusy;

  extrasCopyElement.textContent = wordWiseEnabled
    ? "Word Wise solo funciona con texto en alemán y anota palabras difíciles según el nivel CEFR."
    : "Los sinónimos y ejemplos se configuran en Opciones. La pronunciación se reproduce desde el resultado.";
}

function setBusyState(isBusy) {
  isTranslating = Boolean(isBusy);
  translateButton.disabled = isBusy;
  useSelectionButton.disabled = isBusy;
  saveButton.disabled = isBusy;
  translationModeElement.disabled = isBusy;
  targetLanguageElement.disabled = isBusy;
  sourceLanguageElement.disabled = isBusy;
  if (shellElement.dataset.mode !== "pinned") {
    pinPopupButton.disabled = isBusy;
  }

  syncWordWiseControls(isBusy);
  translateButton.textContent = isBusy ? "Traduciendo..." : "Traducir";
}

function clearAutoTranslateTimer() {
  if (autoTranslateTimerId) {
    window.clearTimeout(autoTranslateTimerId);
    autoTranslateTimerId = null;
  }
}

function getCurrentTranslationRequestKey() {
  const inputText = inputTextElement.value.trim();
  if (!inputText) {
    return "";
  }

  const translationMode = normalizeTranslationMode(translationModeElement.value);
  return JSON.stringify({
    inputText,
    sourceLanguage: sourceLanguageElement.value,
    targetLanguage: targetLanguageElement.value,
    translationMode,
    wordWiseLevel: normalizeWordWiseLevel(wordWiseLevelElement.value),
    includeSynonyms: translationMode === TRANSLATION_MODES.FULL && shouldIncludeSynonyms(),
    includeExamples: translationMode === TRANSLATION_MODES.FULL && shouldIncludeExamples()
  });
}

function handleTranslateError(error) {
  setBusyState(false);
  renderResult({
    input: inputTextElement.value.trim(),
    error: error.message || "No se pudo completar la traducción."
  });
}

function runQueuedAutoTranslateIfNeeded() {
  const requestKey = getCurrentTranslationRequestKey();
  if (!queuedAutoTranslate || !requestKey || requestKey === lastTranslationRequestKey) {
    queuedAutoTranslate = false;
    return;
  }

  queuedAutoTranslate = false;
  translateCurrentInput({ source: "auto" }).catch(handleTranslateError);
}

function scheduleAutoTranslate() {
  clearAutoTranslateTimer();

  const requestKey = getCurrentTranslationRequestKey();
  if (!requestKey || requestKey === lastTranslationRequestKey) {
    queuedAutoTranslate = false;
    return;
  }

  setStatus("Cambio detectado. Traduciendo en 1 segundo...");
  autoTranslateTimerId = window.setTimeout(() => {
    autoTranslateTimerId = null;
    translateCurrentInput({ source: "auto" }).catch(handleTranslateError);
  }, AUTO_TRANSLATE_DELAY_MS);
}

function getPopupDraft() {
  return {
    inputText: inputTextElement.value,
    sourceLanguage: sourceLanguageElement.value,
    targetLanguage: targetLanguageElement.value,
    translationMode: normalizeTranslationMode(translationModeElement.value),
    wordWiseLevel: normalizeWordWiseLevel(wordWiseLevelElement.value)
  };
}

function getActiveTranslationPreferences() {
  const sourceLanguage =
    sourceLanguageElement.value === "auto"
      ? "auto"
      : normalizeSupportedLanguageCode(sourceLanguageElement.value) ?? "auto";
  const targetLanguage =
    normalizeSupportedLanguageCode(targetLanguageElement.value) ||
    popupSettings?.defaultTargetLanguage ||
    "en";

  return {
    sourceLanguage,
    targetLanguage,
    translationMode: normalizeTranslationMode(translationModeElement.value),
    wordWiseLevel: normalizeWordWiseLevel(wordWiseLevelElement.value),
    includeSynonyms: shouldIncludeSynonyms(),
    includeExamples: shouldIncludeExamples()
  };
}

async function persistActiveTranslationPreferences() {
  await browserApi.runtime.sendMessage({
    type: "save-active-translation-preferences",
    preferences: getActiveTranslationPreferences()
  });
}

function getSwapSourceLanguage() {
  const selectedSourceLanguage = normalizeSupportedLanguageCode(sourceLanguageElement.value);
  if (selectedSourceLanguage) {
    return selectedSourceLanguage;
  }

  if (lastDisplayedResult?.input !== inputTextElement.value.trim()) {
    return null;
  }

  return normalizeSupportedLanguageCode(lastDisplayedResult?.sourceLanguage?.code);
}

function resetResultPreview(message) {
  outputTextElement.value = "";
  setChildren(
    resultRootElement,
    createElement("div", {
      className: "empty-card",
      textContent: message
    })
  );
}

function swapTranslationDirection() {
  const currentTargetLanguage = normalizeSupportedLanguageCode(targetLanguageElement.value);
  const currentSourceLanguage = getSwapSourceLanguage();

  if (!currentTargetLanguage || !currentSourceLanguage) {
    setStatus(
      "Para invertir la dirección con origen automático, primero traduce el texto o selecciona el idioma origen manualmente."
    );
    return;
  }

  const currentInputText = inputTextElement.value;
  const currentOutputText = outputTextElement.value.trim();

  clearAutoTranslateTimer();
  queuedAutoTranslate = false;

  if (isWordWiseMode()) {
    translationModeElement.value = TRANSLATION_MODES.FULL;
  }

  sourceLanguageElement.value = currentTargetLanguage;
  targetLanguageElement.value = currentSourceLanguage;

  if (currentOutputText) {
    inputTextElement.value = currentOutputText;
    outputTextElement.value = currentInputText.trim() ? currentInputText : "";
  } else {
    outputTextElement.value = "";
  }

  lastDisplayedResult = null;
  syncWordWiseControls();
  resetResultPreview(
    "Dirección invertida. Ajusta el texto si quieres y la traducción se actualizará automáticamente."
  );

  if (inputTextElement.value.trim()) {
    scheduleAutoTranslate();
    return;
  }

  setStatus("Dirección invertida.");
}

function applySettingsDefaults(settings) {
  popupSettings = settings;
  sourceLanguageElement.value = "auto";
  targetLanguageElement.value = settings.defaultTargetLanguage || "en";
  translationModeElement.value = normalizeTranslationMode(settings.defaultTranslationMode);
  wordWiseLevelElement.value = normalizeWordWiseLevel(settings.defaultWordWiseLevel);
  syncWordWiseControls();
}

function applyPopupDraft(draft) {
  if (!draft) {
    return false;
  }

  const inputText = String(draft.inputText ?? "").trim();
  if (!inputText) {
    return false;
  }

  inputTextElement.value = draft.inputText;
  sourceLanguageElement.value = draft.sourceLanguage || "auto";
  targetLanguageElement.value = draft.targetLanguage || popupSettings?.defaultTargetLanguage || "en";
  translationModeElement.value = normalizeTranslationMode(draft.translationMode);
  wordWiseLevelElement.value = normalizeWordWiseLevel(draft.wordWiseLevel);
  syncWordWiseControls();
  setStatus("Se ha recuperado el borrador de la ventana fija.");
  return true;
}

function applyResultPreferences(result) {
  if (result?.sourceLanguage?.code) {
    sourceLanguageElement.value = result.sourceLanguage.code;
  }

  if (result?.targetLanguage?.code) {
    targetLanguageElement.value = result.targetLanguage.code;
  } else if (result?.translations?.[0]?.code) {
    targetLanguageElement.value = result.translations[0].code;
  }

  translationModeElement.value = normalizeTranslationMode(result?.translationMode);
  wordWiseLevelElement.value = normalizeWordWiseLevel(result?.wordWise?.level);
  syncWordWiseControls();
}

function renderEmptyState() {
  outputTextElement.value = "";
  setChildren(
    resultRootElement,
    createElement("div", {
      className: "empty-card",
      textContent: "Escribe o pega un texto a la izquierda y verás la traducción aquí, en el lateral derecho."
    })
  );
}

function renderFullTranslationResult(result) {
  const primaryTranslation = result.translations?.[0] ?? null;
  outputTextElement.value = primaryTranslation?.text ?? "";

  setChildren(
    resultRootElement,
    createMetaLine("Origen", result.sourceLanguage.label),
    createMetaLine("Destino", result.targetLanguage?.label || primaryTranslation?.label || ""),
    createTextCard("Fonética", result.lexical?.phonetics, {
      cardClassName: "insight-card pronunciation-card"
    }),
    createPronunciationCard({
      sourceText: result.input,
      sourceLanguageCode: result.sourceLanguage?.code,
      targetText: primaryTranslation?.text,
      targetLanguageCode: primaryTranslation?.code ?? result.targetLanguage?.code
    }),
    createTagCard("Sinónimos", result.lexical?.synonyms),
    createTextCard("Ejemplos", result.lexical?.examples, {
      cardClassName: "insight-card",
      listClassName: "example-list",
      itemClassName: "example-item"
    }),
    createTextCard("Notas", result.lexical?.notes, {
      cardClassName: "insight-card insight-card-muted"
    }),
    createTextCard("Aviso", result.lexical?.warnings, {
      cardClassName: "insight-card insight-card-warning"
    })
  );
  setStatus(
    result.pendingLexical
      ? "Traducción completada. Cargando fonética y extras..."
      : "Traducción completada."
  );
}

function renderWordWiseResult(result) {
  const wordWise = result.wordWise ?? null;
  outputTextElement.value = wordWise?.annotatedText ?? "";

  if (!wordWise) {
    setChildren(
      resultRootElement,
      createErrorBox("No se pudo construir el resultado de Word Wise.")
    );
    setStatus("No se pudo completar Word Wise.");
    return;
  }

  const noteSections = [];
  if (wordWise.reason) {
    noteSections.push(
      createTextCard(wordWise.supported ? "Nota" : "Aviso", [wordWise.reason], {
        cardClassName: wordWise.supported
          ? "insight-card insight-card-muted"
          : "insight-card insight-card-warning"
      })
    );
  }

  if (!wordWise.supported) {
    setChildren(
      resultRootElement,
      createMetaLine("Origen", result.sourceLanguage.label),
      createMetaLine(
        "Destino",
        wordWise.targetLanguage?.label || result.targetLanguage?.label || ""
      ),
      createMetaLine("Nivel Word Wise", wordWise.level),
      noteSections
    );
    setStatus("Word Wise no está disponible para este texto.");
    return;
  }

  const resultCard = createElement("article", { className: "result-card" });
  resultCard.append(
    createElement("h3", { textContent: "Texto anotado" }),
    createWordWiseTextElement(wordWise.segments)
  );

  setChildren(
    resultRootElement,
    createMetaLine("Origen", result.sourceLanguage.label),
    createMetaLine(
      "Destino",
      wordWise.targetLanguage?.label || result.targetLanguage?.label || ""
    ),
    createMetaLine("Nivel Word Wise", wordWise.level),
    createTextCard("Fonética", result.lexical?.phonetics, {
      cardClassName: "insight-card pronunciation-card"
    }),
    createPronunciationCard({
      sourceText: result.input,
      sourceLanguageCode: result.sourceLanguage?.code
    }),
    resultCard,
    createTagCard("Palabras anotadas", wordWise.entries, (entry) => {
      return `${entry.sourceText} → ${entry.translatedText}`;
    }),
    noteSections
  );
  setStatus(
    result.pendingLexical
      ? "Word Wise completado. Cargando fonética..."
      : "Word Wise completado."
  );
}

function renderResult(result) {
  resultRootElement.replaceChildren();
  lastDisplayedResult = null;

  if (!result) {
    setStatus("Esperando texto para traducir.");
    renderEmptyState();
    return;
  }

  if (result.error) {
    setStatus("No se pudo completar la traducción.");
    outputTextElement.value = "";
    setChildren(resultRootElement, createErrorBox(result.error));
    return;
  }

  lastDisplayedResult = result;
  applyResultPreferences(result);

  if (normalizeTranslationMode(result.translationMode) === TRANSLATION_MODES.WORD_WISE) {
    renderWordWiseResult(result);
    return;
  }

  renderFullTranslationResult(result);
}

async function fillFromActiveSelection({ scheduleTranslation = false } = {}) {
  const response = await browserApi.runtime.sendMessage({
    type: "get-active-selection"
  });

  const selectedText = String(response?.text ?? "").trim();
  if (selectedText) {
    inputTextElement.value = selectedText;
    setStatus("Se ha cargado la selección actual.");
    if (scheduleTranslation) {
      scheduleAutoTranslate();
    }
    return true;
  }

  const lastSelection = await browserApi.runtime.sendMessage({
    type: "get-last-selection"
  });

  if (lastSelection) {
    inputTextElement.value = lastSelection;
    setStatus("Se ha recuperado la última selección recordada.");
    if (scheduleTranslation) {
      scheduleAutoTranslate();
    }
    return true;
  }

  setStatus(
    "No se ha podido leer una selección activa. En PDFs usa el menú contextual o pega el texto manualmente."
  );
  return false;
}

async function translateCurrentInput(options = {}) {
  const { force = false, source = "manual" } = options;
  const inputText = inputTextElement.value.trim();
  if (!inputText) {
    clearAutoTranslateTimer();
    queuedAutoTranslate = false;
    setStatus("Introduce o selecciona un texto antes de traducir.");
    return;
  }

  const translationMode = normalizeTranslationMode(translationModeElement.value);
  const requestKey = getCurrentTranslationRequestKey();
  clearAutoTranslateTimer();

  if (!force && requestKey === lastTranslationRequestKey) {
    return;
  }

  if (isTranslating) {
    if (source === "auto") {
      queuedAutoTranslate = true;
    }
    return;
  }

  lastTranslationRequestKey = requestKey;
  const requestId = createTranslationRequestId();
  activeTranslationRequestId = requestId;
  setBusyState(true);
  setStatus(
    translationMode === TRANSLATION_MODES.WORD_WISE
      ? source === "auto"
        ? "Actualizando Word Wise automáticamente..."
        : "Construyendo anotaciones Word Wise..."
      : source === "auto"
        ? "Actualizando traducción automáticamente..."
        : "Consultando el servicio de traducción..."
  );

  try {
    const result = await browserApi.runtime.sendMessage({
      type: "translate-text",
      requestId,
      deferLexical: true,
      text: inputText,
      sourceLanguage: sourceLanguageElement.value,
      targetLanguage: targetLanguageElement.value,
      translationMode,
      wordWiseLevel: normalizeWordWiseLevel(wordWiseLevelElement.value),
      includeSynonyms: translationMode === TRANSLATION_MODES.FULL && shouldIncludeSynonyms(),
      includeExamples: translationMode === TRANSLATION_MODES.FULL && shouldIncludeExamples()
    });
    if (requestId !== activeTranslationRequestId) {
      return;
    }
    renderResult(result);
  } catch (error) {
    if (requestId === activeTranslationRequestId) {
      renderResult({
        input: inputText,
        error: error.message || "Error inesperado en la traducción."
      });
    }
  } finally {
    setBusyState(false);
    runQueuedAutoTranslateIfNeeded();
  }
}

async function startBlockTranslation() {
  if (isWordWiseMode()) {
    setStatus("Word Wise todavía no está disponible para el selector de bloques.");
    return;
  }

  setBusyState(true);

  try {
    await browserApi.runtime.sendMessage({
      type: "start-dom-block-picker",
      translationOptions: {
        sourceLanguage: sourceLanguageElement.value,
        targetLanguage: targetLanguageElement.value
      }
    });

    setStatus("Haz clic en un bloque visible de la página para traducirlo.");

    if ((shellElement.dataset.mode || "popup") === "popup") {
      window.close();
    }
  } finally {
    setBusyState(false);
    runQueuedAutoTranslateIfNeeded();
  }
}

async function saveCurrentInput() {
  const inputText = inputTextElement.value.trim();
  if (!inputText) {
    setStatus("Introduce o selecciona un texto antes de añadirlo al glosario.");
    return;
  }

  const result = await browserApi.runtime.sendMessage({
    type: "save-entry",
    text: inputText
  });

  setStatus(
    result.duplicate
      ? "Ese texto ya estaba en el glosario."
      : "Texto añadido al glosario."
  );
}

async function initializePopup() {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode");
  if (mode === "tab" || mode === "pinned") {
    shellElement.dataset.mode = mode;
  }

  if (mode === "pinned") {
    pinPopupButton.textContent = "📌 Fijada";
    pinPopupButton.disabled = true;
  }

  popupSettings = await browserApi.runtime.sendMessage({
    type: "get-settings"
  });
  applySettingsDefaults(popupSettings);

  const lastResult = await browserApi.runtime.sendMessage({
    type: "get-last-result"
  });
  const popupDraft = await browserApi.runtime.sendMessage({
    type: "get-popup-draft"
  });

  if (mode === "pinned" && applyPopupDraft(popupDraft)) {
    if (lastResult?.input === inputTextElement.value.trim()) {
      renderResult(lastResult);
    } else {
      renderEmptyState();
    }
  } else if (lastResult?.input || lastResult?.error) {
    inputTextElement.value = lastResult.input || "";
    applyResultPreferences(lastResult);
    renderResult(lastResult);
  } else {
    renderEmptyState();
    await fillFromActiveSelection();
  }

  const saveFeedback = await browserApi.runtime.sendMessage({
    type: "get-save-feedback"
  });

  if (saveFeedback?.text) {
    setStatus(
      saveFeedback.duplicate
        ? `La selección "${saveFeedback.text}" ya estaba en el glosario.`
        : `Se ha añadido "${saveFeedback.text}" al glosario.`
    );
  }

  await persistActiveTranslationPreferences();
}

browserApi.runtime.onMessage.addListener((message) => {
  if (message?.type !== "translation-update") {
    return undefined;
  }

  if (!message.requestId || message.requestId !== activeTranslationRequestId) {
    return Promise.resolve({ handled: false });
  }

  renderResult(message.result ?? null);
  return Promise.resolve({ handled: true });
});

translateButton.addEventListener("click", () => {
  translateCurrentInput({ force: true }).catch(handleTranslateError);
});

useSelectionButton.addEventListener("click", () => {
  fillFromActiveSelection({ scheduleTranslation: true }).catch((error) => {
    setStatus(error.message || "No se pudo obtener la selección.");
  });
});

pickBlockButton.addEventListener("click", () => {
  startBlockTranslation().catch((error) => {
    setBusyState(false);
    setStatus(error.message || "No se pudo activar la selección de bloques.");
  });
});

swapLanguagesButton.addEventListener("click", () => {
  swapTranslationDirection();
});

inputTextElement.addEventListener("input", () => {
  const hasText = Boolean(inputTextElement.value.trim());
  if (!hasText) {
    clearAutoTranslateTimer();
    queuedAutoTranslate = false;
    return;
  }

  scheduleAutoTranslate();
});

inputTextElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
    return;
  }

  event.preventDefault();
  clearAutoTranslateTimer();
  queuedAutoTranslate = false;
  translateCurrentInput({ force: true }).catch(handleTranslateError);
});

sourceLanguageElement.addEventListener("change", () => {
  syncWordWiseControls();
  persistActiveTranslationPreferences().catch((error) => {
    console.warn("No se pudieron guardar las preferencias activas.", error);
  });
  if (inputTextElement.value.trim()) {
    scheduleAutoTranslate();
  }
});

targetLanguageElement.addEventListener("change", () => {
  syncWordWiseControls();
  persistActiveTranslationPreferences().catch((error) => {
    console.warn("No se pudieron guardar las preferencias activas.", error);
  });
  if (inputTextElement.value.trim()) {
    scheduleAutoTranslate();
  }
});

translationModeElement.addEventListener("change", () => {
  syncWordWiseControls();
  persistActiveTranslationPreferences().catch((error) => {
    console.warn("No se pudieron guardar las preferencias activas.", error);
  });
  if (inputTextElement.value.trim()) {
    scheduleAutoTranslate();
  }
});

wordWiseLevelElement.addEventListener("change", () => {
  wordWiseLevelElement.value = normalizeWordWiseLevel(wordWiseLevelElement.value);
  persistActiveTranslationPreferences().catch((error) => {
    console.warn("No se pudieron guardar las preferencias activas.", error);
  });
  if (inputTextElement.value.trim()) {
    scheduleAutoTranslate();
  }
});

saveButton.addEventListener("click", () => {
  saveCurrentInput().catch((error) => {
    setStatus(error.message || "No se pudo guardar el texto.");
  });
});

openSavedButton.addEventListener("click", () => {
  browserApi.runtime.sendMessage({ type: "open-saved-tab" });
});

pinPopupButton.addEventListener("click", () => {
  const mode = shellElement.dataset.mode || "popup";
  browserApi.runtime
    .sendMessage({
      type: "open-pinned-popup",
      draft: getPopupDraft()
    })
    .then(() => {
      if (mode === "popup") {
        window.close();
      }
    })
    .catch((error) => {
      setStatus(error.message || "No se pudo abrir la ventana fija.");
    });
});

openOptionsButton.addEventListener("click", () => {
  browserApi.runtime.openOptionsPage();
});

openStandaloneButton.addEventListener("click", () => {
  browserApi.runtime.sendMessage({ type: "open-results-tab" });
});

initializePopup().catch((error) => {
  renderResult({
    input: "",
    error: error.message || "No se pudo inicializar el popup."
  });
});
