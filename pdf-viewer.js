import * as pdfjsLib from "./vendor/pdfjs/legacy/build/pdf.mjs";

const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const viewerContainerElement = document.getElementById("viewerContainer");
const viewerElement = document.getElementById("pdfViewer");
const viewerTitleElement = document.getElementById("viewerTitle");
const viewerSubtitleElement = document.getElementById("viewerSubtitle");
const viewerStatusElement = document.getElementById("viewerStatus");
const emptyStateElement = document.getElementById("emptyState");
const emptyStateTitleElement = document.getElementById("emptyStateTitle");
const emptyStateCopyElement = document.getElementById("emptyStateCopy");
const pageNumberInputElement = document.getElementById("pageNumberInput");
const pageCountLabelElement = document.getElementById("pageCountLabel");
const openLocalPdfButtonElement = document.getElementById("openLocalPdfButton");
const emptyStateOpenButtonElement = document.getElementById("emptyStateOpenButton");
const localPdfInputElement = document.getElementById("localPdfInput");
const prevPageButtonElement = document.getElementById("prevPageButton");
const nextPageButtonElement = document.getElementById("nextPageButton");
const zoomOutButtonElement = document.getElementById("zoomOutButton");
const zoomInButtonElement = document.getElementById("zoomInButton");
const fitWidthButtonElement = document.getElementById("fitWidthButton");
const selectionToolbarElement = document.getElementById("selectionToolbar");
const translateSelectionButtonElement = document.getElementById("translateSelectionButton");
const saveSelectionButtonElement = document.getElementById("saveSelectionButton");

const ZOOM_STEP = 1.15;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.5;
const TOOLBAR_MARGIN = 12;
const PDF_FETCH_TIMEOUT_MS = 20000;
let pdfViewerModulePromise = null;

const state = {
  pdfUrl: "",
  pageContext: null,
  pdfDocument: null,
  pdfViewer: null,
  eventBus: null,
  documentSourceLabel: "",
  selectedText: "",
  selectionRect: null,
  dragDepth: 0,
  isBusy: true
};

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdfjs/legacy/build/pdf.worker.mjs",
  import.meta.url
).toString();
globalThis.pdfjsLib = pdfjsLib;

function loadPdfViewerModule() {
  if (!pdfViewerModulePromise) {
    pdfViewerModulePromise = import("./vendor/pdfjs/legacy/web/pdf_viewer.mjs");
  }

  return pdfViewerModulePromise;
}

function setStatus(message, stateName = "info") {
  viewerStatusElement.textContent = message;
  viewerStatusElement.dataset.state = stateName;
}

function setBusyState(isBusy) {
  state.isBusy = isBusy;
  const hasDocument = Boolean(state.pdfViewer);
  prevPageButtonElement.disabled = isBusy || !hasDocument;
  nextPageButtonElement.disabled = isBusy || !hasDocument;
  zoomOutButtonElement.disabled = isBusy || !hasDocument;
  zoomInButtonElement.disabled = isBusy || !hasDocument;
  fitWidthButtonElement.disabled = isBusy || !hasDocument;
  pageNumberInputElement.disabled = isBusy || !hasDocument;
  openLocalPdfButtonElement.disabled = isBusy;
  emptyStateOpenButtonElement.disabled = isBusy;
  translateSelectionButtonElement.disabled = isBusy;
  saveSelectionButtonElement.disabled = isBusy;
}

function normalizeSelectionText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function deriveTitleFromPdfUrl(pdfUrl) {
  try {
    const parsedUrl = new URL(pdfUrl);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(fileName || parsedUrl.hostname || "Documento PDF");
  } catch (error) {
    return "Documento PDF";
  }
}

function readPdfSignature(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 5));
  return String.fromCharCode(...bytes);
}

function isLikelyPdfResponse(response, buffer) {
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/pdf")) {
    return true;
  }

  return readPdfSignature(buffer) === "%PDF-";
}

function isLikelyPdfFile(file) {
  const fileName = String(file?.name ?? "").trim().toLowerCase();
  const fileType = String(file?.type ?? "").trim().toLowerCase();
  return fileType === "application/pdf" || fileName.endsWith(".pdf");
}

async function fetchPdfBytes(pdfUrl) {
  const abortController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    abortController.abort();
  }, PDF_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(pdfUrl, {
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      signal: abortController.signal
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "El servidor ha rechazado el acceso al PDF. Parece que requiere autenticacion o una sesion valida."
        );
      }

      throw new Error(`No se pudo descargar el PDF (${response.status}).`);
    }

    const pdfData = await response.arrayBuffer();
    if (!isLikelyPdfResponse(response, pdfData)) {
      const finalUrl = String(response.url ?? "").trim();
      const contentType = String(response.headers.get("content-type") ?? "").trim();

      throw new Error(
        [
          "La URL no ha devuelto un PDF valido.",
          finalUrl && finalUrl !== pdfUrl ? `La respuesta final apunta a ${finalUrl}.` : "",
          contentType ? `Content-Type recibido: ${contentType}.` : "",
          "Es probable que el servidor este devolviendo una pagina de login o requiera autenticacion adicional."
        ]
          .filter(Boolean)
          .join(" ")
      );
    }

    return {
      pdfData,
      finalUrl: String(response.url ?? pdfUrl).trim() || pdfUrl
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "La descarga del PDF ha tardado demasiado. Puede requerir autenticacion o estar bloqueada por la sesion."
      );
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function dataTransferHasFiles(dataTransfer) {
  const types = dataTransfer?.types;
  if (!types) {
    return false;
  }

  if (typeof types.includes === "function") {
    return types.includes("Files");
  }

  if (typeof types.contains === "function") {
    return types.contains("Files");
  }

  return Array.from(types).includes("Files");
}

function resetDragState() {
  state.dragDepth = 0;
  delete viewerContainerElement.dataset.dragover;
}

function showEmptyState({
  title = "Abre un PDF desde tu equipo",
  copy = "Selecciona un archivo PDF local o arrastralo a esta ventana para abrirlo en el visor."
} = {}) {
  emptyStateTitleElement.textContent = title;
  emptyStateCopyElement.textContent = copy;
  emptyStateElement.hidden = false;
  viewerElement.hidden = true;
}

function hideEmptyState() {
  emptyStateElement.hidden = true;
  viewerElement.hidden = false;
}

function clearViewerSurface() {
  hideSelectionToolbar();
  viewerElement.replaceChildren();
  state.pdfDocument = null;
  state.pdfViewer = null;
  state.eventBus = null;
  state.selectedText = "";
  state.selectionRect = null;
  pageCountLabelElement.textContent = "/ 0";
  pageNumberInputElement.value = "1";
  pageNumberInputElement.max = "1";
}

function getViewerSelection() {
  const selection = globalThis.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (
    !anchorNode ||
    !focusNode ||
    !viewerContainerElement.contains(anchorNode) ||
    !viewerContainerElement.contains(focusNode)
  ) {
    return null;
  }

  const text = normalizeSelectionText(selection.toString());
  if (!text) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const fallbackRect = range.getClientRects()[0] ?? null;
  const effectiveRect =
    rect && (rect.width > 0 || rect.height > 0) ? rect : fallbackRect;

  if (!effectiveRect) {
    return null;
  }

  return {
    text,
    rect: effectiveRect
  };
}

function hideSelectionToolbar() {
  state.selectedText = "";
  state.selectionRect = null;
  selectionToolbarElement.hidden = true;
}

function positionSelectionToolbar(rect) {
  if (!rect) {
    hideSelectionToolbar();
    return;
  }

  selectionToolbarElement.hidden = false;
  const toolbarWidth = selectionToolbarElement.offsetWidth;
  const toolbarHeight = selectionToolbarElement.offsetHeight;
  const idealLeft = rect.left + rect.width / 2 - toolbarWidth / 2;
  const idealTop = rect.top - toolbarHeight - TOOLBAR_MARGIN;
  const left = clamp(idealLeft, TOOLBAR_MARGIN, window.innerWidth - toolbarWidth - TOOLBAR_MARGIN);
  const top =
    idealTop > TOOLBAR_MARGIN
      ? idealTop
      : clamp(rect.bottom + TOOLBAR_MARGIN, TOOLBAR_MARGIN, window.innerHeight - toolbarHeight - TOOLBAR_MARGIN);

  selectionToolbarElement.style.left = `${left}px`;
  selectionToolbarElement.style.top = `${top}px`;
}

function syncSelectionToolbar() {
  const selectionState = getViewerSelection();
  if (!selectionState) {
    hideSelectionToolbar();
    return;
  }

  state.selectedText = selectionState.text;
  state.selectionRect = selectionState.rect;
  positionSelectionToolbar(selectionState.rect);
}

function updatePagination() {
  const currentPage = state.pdfViewer?.currentPageNumber ?? 1;
  const totalPages = state.pdfViewer?.pagesCount ?? 0;
  pageNumberInputElement.value = String(currentPage);
  pageNumberInputElement.max = String(Math.max(totalPages, 1));
  pageCountLabelElement.textContent = `/ ${totalPages}`;
  const hasDocument = Boolean(state.pdfViewer);
  prevPageButtonElement.disabled = state.isBusy || !hasDocument || currentPage <= 1;
  nextPageButtonElement.disabled = state.isBusy || !hasDocument || currentPage >= totalPages;
  zoomOutButtonElement.disabled = state.isBusy || !hasDocument;
  zoomInButtonElement.disabled = state.isBusy || !hasDocument;
  fitWidthButtonElement.disabled = state.isBusy || !hasDocument;
  pageNumberInputElement.disabled = state.isBusy || !hasDocument;
}

function setScaleValue(scaleValue) {
  if (!state.pdfViewer) {
    return;
  }

  state.pdfViewer.currentScaleValue = scaleValue;
  const statusLabel =
    scaleValue === "page-width"
      ? "Ajustado al ancho de la ventana."
      : `Zoom al ${Math.round(state.pdfViewer.currentScale * 100)}%.`;
  setStatus(statusLabel);
}

function changeZoom(direction) {
  if (!state.pdfViewer) {
    return;
  }

  const currentScale = state.pdfViewer.currentScale || 1;
  const nextScale =
    direction > 0 ? currentScale * ZOOM_STEP : currentScale / ZOOM_STEP;
  setScaleValue(String(clamp(nextScale, MIN_SCALE, MAX_SCALE)));
}

function getPageContext() {
  return {
    pageTitle: viewerTitleElement.textContent.trim(),
    pageUrl: state.pdfUrl
  };
}

async function loadViewerMetadata(pdfDocument) {
  try {
    const metadata = await pdfDocument.getMetadata();
    const infoTitle = String(metadata?.info?.Title ?? "").trim();
    if (infoTitle) {
      viewerTitleElement.textContent = infoTitle;
      state.pageContext = getPageContext();
    }
  } catch (error) {
    console.warn("No se pudieron cargar los metadatos del PDF.", error);
  }
}

async function loadPdfDocumentFromData({ pdfData, title, subtitle = "", pageUrl = "" }) {
  clearViewerSurface();
  hideEmptyState();
  setBusyState(true);
  viewerTitleElement.textContent = title || "Documento PDF";
  viewerSubtitleElement.textContent = subtitle;
  state.pdfUrl = pageUrl;
  state.documentSourceLabel = subtitle;
  state.pageContext = getPageContext();

  const loadingTask = pdfjsLib.getDocument({
    data: pdfData,
    standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).toString(),
    wasmUrl: new URL("./vendor/pdfjs/wasm/", import.meta.url).toString()
  });
  const pdfDocument = await loadingTask.promise;
  state.pdfDocument = pdfDocument;
  const { EventBus, PDFViewer, SimpleLinkService } = await loadPdfViewerModule();

  const eventBus = new EventBus();
  const linkService = new SimpleLinkService();
  const pdfViewer = new PDFViewer({
    container: viewerContainerElement,
    viewer: viewerElement,
    eventBus,
    linkService,
    textLayerMode: 1,
    removePageBorders: false
  });

  linkService.setViewer(pdfViewer);
  linkService.setDocument(pdfDocument);
  pdfViewer.setDocument(pdfDocument);

  state.eventBus = eventBus;
  state.pdfViewer = pdfViewer;

  eventBus.on("pagesinit", () => {
    setBusyState(false);
    setScaleValue("page-width");
    updatePagination();
    setStatus("PDF listo. Selecciona texto para traducirlo o guardarlo.");
  });

  eventBus.on("pagechanging", () => {
    updatePagination();
    syncSelectionToolbar();
  });

  eventBus.on("scalechanging", () => {
    setStatus(`Zoom al ${Math.round((state.pdfViewer?.currentScale ?? 1) * 100)}%.`);
  });

  await loadViewerMetadata(pdfDocument);
  updatePagination();
}

async function loadPdfDocumentFromRemoteUrl(rawPdfUrl, rawTitle = "") {
  state.pdfUrl = rawPdfUrl;
  viewerTitleElement.textContent = rawTitle || deriveTitleFromPdfUrl(rawPdfUrl);
  viewerSubtitleElement.textContent = rawPdfUrl;
  state.pageContext = getPageContext();

  setBusyState(true);
  showEmptyState({
    title: "Cargando PDF remoto…",
    copy: "Estamos intentando descargar el PDF. Si falla por autenticacion, puedes abrir una copia local o arrastrar el archivo aqui."
  });
  setStatus("Descargando PDF y preparando el visor…");

  const { pdfData, finalUrl } = await fetchPdfBytes(rawPdfUrl);
  await loadPdfDocumentFromData({
    pdfData,
    title: rawTitle || deriveTitleFromPdfUrl(finalUrl),
    subtitle: finalUrl,
    pageUrl: finalUrl
  });
}

async function loadPdfDocumentFromFile(file) {
  if (!file) {
    return;
  }

  if (!isLikelyPdfFile(file)) {
    throw new Error("El archivo seleccionado no parece ser un PDF.");
  }

  const fileName = String(file.name ?? "").trim() || "Documento local.pdf";
  showEmptyState({
    title: "Abriendo archivo local…",
    copy: `Preparando ${fileName} para mostrarlo dentro del visor.`
  });
  setStatus("Leyendo PDF local…");

  const pdfData = await file.arrayBuffer();
  if (readPdfSignature(pdfData) !== "%PDF-") {
    throw new Error("El archivo seleccionado no contiene un PDF valido.");
  }

  await loadPdfDocumentFromData({
    pdfData,
    title: fileName,
    subtitle: `Archivo local: ${fileName}`,
    pageUrl: ""
  });
}

function applyInitialViewerState() {
  const searchParams = new URLSearchParams(window.location.search);
  const rawPdfUrl = String(searchParams.get("file") ?? "").trim();
  const rawTitle = String(searchParams.get("title") ?? "").trim();

  if (!rawPdfUrl) {
    clearViewerSurface();
    setBusyState(false);
    viewerTitleElement.textContent = rawTitle || "Visor PDF interactivo";
    viewerSubtitleElement.textContent = "Carga un PDF local con selector o drag and drop.";
    showEmptyState({
      title: rawTitle
        ? `No se puede leer directamente "${rawTitle}" desde la pestaña actual`
        : "Abre un PDF desde tu equipo",
      copy: rawTitle
        ? "Selecciona el archivo PDF desde tu equipo o arrastralo aqui para abrirlo en el visor."
        : "Selecciona un archivo PDF local o arrastralo a esta ventana para abrirlo en el visor."
    });
    setStatus("Esperando un PDF local o remoto.");
    return Promise.resolve();
  }

  return loadPdfDocumentFromRemoteUrl(rawPdfUrl, rawTitle);
}

async function handleTranslateSelection() {
  const selectedText = state.selectedText || normalizeSelectionText(globalThis.getSelection?.()?.toString());
  if (!selectedText) {
    setStatus("Selecciona un fragmento del PDF antes de traducir.", "error");
    return;
  }

  setBusyState(true);
  setStatus("Enviando la selección al traductor…");

  try {
    await browserApi.runtime.sendMessage({
      type: "translate-pdf-viewer-selection",
      text: selectedText,
      sourceLanguage: "auto",
      pageContext: state.pageContext ?? getPageContext()
    });
    setStatus("Traducción enviada. Abriendo la vista ampliada…");
    hideSelectionToolbar();
  } catch (error) {
    setStatus(error.message || "No se pudo traducir la selección.", "error");
  } finally {
    setBusyState(false);
    updatePagination();
  }
}

async function handleSaveSelection() {
  const selectedText = state.selectedText || normalizeSelectionText(globalThis.getSelection?.()?.toString());
  if (!selectedText) {
    setStatus("Selecciona un fragmento del PDF antes de guardarlo.", "error");
    return;
  }

  setBusyState(true);
  setStatus("Guardando la selección en el glosario…");

  try {
    const response = await browserApi.runtime.sendMessage({
      type: "save-pdf-viewer-selection",
      text: selectedText,
      pageContext: state.pageContext ?? getPageContext()
    });
    setStatus(
      response?.duplicate
        ? "La selección ya estaba guardada. Abriendo la vista ampliada…"
        : "Selección guardada. Abriendo la vista ampliada…"
    );
    hideSelectionToolbar();
  } catch (error) {
    setStatus(error.message || "No se pudo guardar la selección.", "error");
  } finally {
    setBusyState(false);
    updatePagination();
  }
}

document.addEventListener("selectionchange", () => {
  syncSelectionToolbar();
});

viewerContainerElement.addEventListener("scroll", () => {
  if (state.selectionRect) {
    syncSelectionToolbar();
  }
});

window.addEventListener("resize", () => {
  if (state.selectionRect) {
    syncSelectionToolbar();
  }
});

for (const target of [window, document, viewerContainerElement, emptyStateElement]) {
  target.addEventListener("dragenter", (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    state.dragDepth += 1;
    viewerContainerElement.dataset.dragover = "true";
  });

  target.addEventListener("dragover", (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    viewerContainerElement.dataset.dragover = "true";
  });

  target.addEventListener("dragleave", (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) {
      resetDragState();
    }
  });

  target.addEventListener("dragend", () => {
    resetDragState();
  });
}

document.addEventListener("drop", (event) => {
  if (!dataTransferHasFiles(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  resetDragState();

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  loadPdfDocumentFromFile(file).catch((error) => {
    setBusyState(false);
    showEmptyState({
      title: "No se pudo abrir el archivo",
      copy: "Intenta con otro PDF local o vuelve a arrastrar el archivo a esta ventana."
    });
    setStatus(error.message || "No se pudo abrir el PDF local.", "error");
    viewerTitleElement.textContent = "Error al abrir el PDF";
    viewerSubtitleElement.textContent = "El archivo local no se ha podido procesar.";
  });
});

pageNumberInputElement.addEventListener("change", () => {
  if (!state.pdfViewer) {
    return;
  }

  const totalPages = state.pdfViewer.pagesCount || 1;
  const nextPage = clamp(Number(pageNumberInputElement.value || 1), 1, totalPages);
  state.pdfViewer.currentPageNumber = nextPage;
  updatePagination();
});

pageNumberInputElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  pageNumberInputElement.dispatchEvent(new Event("change"));
});

prevPageButtonElement.addEventListener("click", () => {
  if (!state.pdfViewer) {
    return;
  }

  state.pdfViewer.currentPageNumber = Math.max(1, state.pdfViewer.currentPageNumber - 1);
  updatePagination();
});

nextPageButtonElement.addEventListener("click", () => {
  if (!state.pdfViewer) {
    return;
  }

  state.pdfViewer.currentPageNumber = Math.min(
    state.pdfViewer.pagesCount,
    state.pdfViewer.currentPageNumber + 1
  );
  updatePagination();
});

zoomOutButtonElement.addEventListener("click", () => {
  changeZoom(-1);
});

zoomInButtonElement.addEventListener("click", () => {
  changeZoom(1);
});

fitWidthButtonElement.addEventListener("click", () => {
  setScaleValue("page-width");
});

function openLocalFilePicker() {
  localPdfInputElement.value = "";

  if (typeof localPdfInputElement.showPicker === "function") {
    try {
      localPdfInputElement.showPicker();
      return;
    } catch (error) {
      console.warn("showPicker no esta disponible para este input.", error);
    }
  }

  localPdfInputElement.click();
}

openLocalPdfButtonElement.addEventListener("click", () => {
  openLocalFilePicker();
});

emptyStateOpenButtonElement.addEventListener("click", () => {
  openLocalFilePicker();
});

localPdfInputElement.addEventListener("change", () => {
  const file = localPdfInputElement.files?.[0];
  if (!file) {
    return;
  }

  loadPdfDocumentFromFile(file).catch((error) => {
    setBusyState(false);
    showEmptyState({
      title: "No se pudo abrir el archivo",
      copy: "Intenta con otro PDF local o vuelve a seleccionar el archivo."
    });
    setStatus(error.message || "No se pudo abrir el PDF local.", "error");
    viewerTitleElement.textContent = "Error al abrir el PDF";
    viewerSubtitleElement.textContent = "El archivo local no se ha podido procesar.";
  });
});

for (const buttonElement of [
  translateSelectionButtonElement,
  saveSelectionButtonElement
]) {
  buttonElement.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
}

translateSelectionButtonElement.addEventListener("click", () => {
  handleTranslateSelection();
});

saveSelectionButtonElement.addEventListener("click", () => {
  handleSaveSelection();
});

applyInitialViewerState().catch((error) => {
  setBusyState(false);
  showEmptyState({
    title: "No se pudo abrir el PDF remoto",
    copy: "Si el servidor exige autenticacion o no entrega el PDF, puedes seleccionar una copia local o arrastrarla a esta ventana."
  });
  setStatus(error.message || "No se pudo abrir el PDF en el visor.", "error");
  viewerTitleElement.textContent = "Error al abrir el PDF";
  viewerSubtitleElement.textContent = "Puedes reintentar con un archivo local o revisar el acceso remoto.";
});
