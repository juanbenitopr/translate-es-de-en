const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://www.fairtranslate.eu",
  apiPath: "/translate",
  apiKey: "",
  requestTimeoutMs: 15000,
  defaultTranslationMode: "full",
  defaultWordWiseLevel: "B1",
  defaultTargetLanguage: "en"
};
const MYMEMORY_PRESET = {
  apiBaseUrl: "https://api.mymemory.translated.net",
  apiPath: "/get",
  apiKey: "",
  requestTimeoutMs: 15000
};
const DEEPL_FREE_PRESET = {
  apiBaseUrl: "https://api-free.deepl.com",
  apiPath: "/v2/translate",
  apiKey: "",
  requestTimeoutMs: 15000
};
const DEEPL_PRO_PRESET = {
  apiBaseUrl: "https://api.deepl.com",
  apiPath: "/v2/translate",
  apiKey: "",
  requestTimeoutMs: 15000
};

const apiBaseUrlElement = document.getElementById("apiBaseUrl");
const apiPathElement = document.getElementById("apiPath");
const apiKeyElement = document.getElementById("apiKey");
const requestTimeoutMsElement = document.getElementById("requestTimeoutMs");
const defaultTranslationModeElement = document.getElementById("defaultTranslationMode");
const defaultWordWiseLevelElement = document.getElementById("defaultWordWiseLevel");
const defaultTargetLanguageElement = document.getElementById("defaultTargetLanguage");
const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");
const useFairTranslateButton = document.getElementById("useFairTranslateButton");
const useMyMemoryButton = document.getElementById("useMyMemoryButton");
const useDeepLFreeButton = document.getElementById("useDeepLFreeButton");
const useDeepLProButton = document.getElementById("useDeepLProButton");
const optionsStatusElement = document.getElementById("optionsStatus");

function setStatus(message) {
  optionsStatusElement.textContent = message;
}

function isDeepLPreset(settings) {
  return /api(?:-free)?\.deepl\.com$/i.test(String(settings?.apiBaseUrl ?? "").trim());
}

function fillForm(settings) {
  apiBaseUrlElement.value = settings.apiBaseUrl;
  apiPathElement.value = settings.apiPath;
  apiKeyElement.value = settings.apiKey;
  requestTimeoutMsElement.value = String(settings.requestTimeoutMs);
  defaultTranslationModeElement.value = settings.defaultTranslationMode || DEFAULT_SETTINGS.defaultTranslationMode;
  defaultWordWiseLevelElement.value = settings.defaultWordWiseLevel || DEFAULT_SETTINGS.defaultWordWiseLevel;
  defaultTargetLanguageElement.value = settings.defaultTargetLanguage || DEFAULT_SETTINGS.defaultTargetLanguage;
}

function applyTranslationPreset(preset) {
  apiBaseUrlElement.value = preset.apiBaseUrl;
  apiPathElement.value = preset.apiPath;
  apiKeyElement.value = preset.apiKey;
  requestTimeoutMsElement.value = String(preset.requestTimeoutMs);
}

async function loadSettings() {
  const settings = await browserApi.runtime.sendMessage({ type: "get-settings" });
  fillForm(settings);
  setStatus(`Configuración cargada. Endpoint actual: ${settings.apiBaseUrl}${settings.apiPath}`);
}

async function saveSettings() {
  const apiBaseUrl = apiBaseUrlElement.value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
  const apiPath = apiPathElement.value.trim() || DEFAULT_SETTINGS.apiPath;

  try {
    new URL(apiBaseUrl);
  } catch (error) {
    throw new Error("La Base URL no es válida.");
  }

  const settings = {
    apiBaseUrl,
    apiPath,
    apiKey: apiKeyElement.value,
    requestTimeoutMs: Number.parseInt(requestTimeoutMsElement.value, 10) || DEFAULT_SETTINGS.requestTimeoutMs,
    defaultTranslationMode: defaultTranslationModeElement.value || DEFAULT_SETTINGS.defaultTranslationMode,
    defaultWordWiseLevel: defaultWordWiseLevelElement.value || DEFAULT_SETTINGS.defaultWordWiseLevel,
    defaultTargetLanguage: defaultTargetLanguageElement.value || DEFAULT_SETTINGS.defaultTargetLanguage
  };

  const savedSettings = await browserApi.runtime.sendMessage({
    type: "save-settings",
    settings
  });
  if (isDeepLPreset(savedSettings) && !String(savedSettings.apiKey ?? "").trim()) {
    setStatus("Configuración guardada. DeepL está seleccionado, pero falta API key.");
    return;
  }

  setStatus(
    `Configuración guardada. Endpoint activo: ${savedSettings.apiBaseUrl}${savedSettings.apiPath}. Modo por defecto: ${
      savedSettings.defaultTranslationMode === "word-wise" ? "Word Wise" : "Traducir"
    }.`
  );
}

saveButton.addEventListener("click", () => {
  saveSettings().catch((error) => {
    setStatus(error.message || "No se pudo guardar la configuración.");
  });
});

resetButton.addEventListener("click", () => {
  fillForm(DEFAULT_SETTINGS);
  setStatus("Valores restablecidos en el formulario. Guarda para aplicar.");
});

useFairTranslateButton.addEventListener("click", () => {
  applyTranslationPreset(DEFAULT_SETTINGS);
  setStatus("Preset cargado: FairTranslate / LibreTranslate. Guarda para aplicar.");
});

useMyMemoryButton.addEventListener("click", () => {
  applyTranslationPreset(MYMEMORY_PRESET);
  setStatus("Preset cargado: MyMemory (prueba). Guarda para aplicar.");
});

useDeepLFreeButton.addEventListener("click", () => {
  applyTranslationPreset(DEEPL_FREE_PRESET);
  setStatus("Preset cargado: DeepL API Free. Añade tu API key y guarda para aplicar.");
});

useDeepLProButton.addEventListener("click", () => {
  applyTranslationPreset(DEEPL_PRO_PRESET);
  setStatus("Preset cargado: DeepL API Pro. Añade tu API key y guarda para aplicar.");
});

loadSettings().catch((error) => {
  setStatus(error.message || "No se pudo cargar la configuración.");
});
