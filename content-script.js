(function () {
  const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;
  const BUTTON_ID = "translator-es-en-de-button";
  const PANEL_ID = "translator-es-en-de-panel";
  const STYLE_ID = "translator-es-en-de-styles";
  const HIGHLIGHT_ID = "translator-es-en-de-highlight";
  const PICKER_ATTRIBUTE = "data-translator-picker";
  const DOM_BLOCK_PREVIEW_LENGTH = 280;

  let currentSelectionText = "";
  let anchorRect = null;
  let pickerState = null;
  let hoveredBlockElement = null;
  let activeBubbleState = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[${PICKER_ATTRIBUTE}="block"],
      html[${PICKER_ATTRIBUTE}="block"] * {
        cursor: crosshair !important;
      }

      #${BUTTON_ID} {
        position: fixed;
        z-index: 2147483647;
        border: 0;
        border-radius: 999px;
        padding: 8px 12px;
        font: 600 12px/1.2 system-ui, sans-serif;
        color: #fff;
        background: linear-gradient(135deg, #1d4ed8, #0f766e);
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.28);
        cursor: pointer;
      }

      #${PANEL_ID} {
        position: fixed;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 24px));
        max-height: min(70vh, 560px);
        overflow: auto;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 16px;
        padding: 14px;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
        backdrop-filter: blur(12px);
      }

      #${PANEL_ID}.translator-panel-wide {
        width: min(520px, calc(100vw - 24px));
        max-height: min(72vh, 640px);
      }

      #${PANEL_ID}.translator-panel-wide[data-expanded="true"] {
        width: min(620px, calc(100vw - 24px));
        max-height: min(80vh, 760px);
      }

      #${PANEL_ID} h3,
      #${PANEL_ID} h4,
      #${PANEL_ID} p {
        margin: 0;
      }

      #${PANEL_ID} .translator-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .translator-header-main {
        display: grid;
        gap: 4px;
      }

      #${PANEL_ID} .translator-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      #${PANEL_ID} .translator-kicker {
        font-size: 11px;
        color: #64748b;
      }

      #${PANEL_ID} .translator-close,
      #${PANEL_ID} .translator-toggle,
      #${PANEL_ID} .translator-copy {
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
      }

      #${PANEL_ID} .translator-close {
        border: 0;
        min-width: 28px;
        min-height: 28px;
        background: transparent;
        color: #475569;
        font-size: 18px;
      }

      #${PANEL_ID} .translator-toggle,
      #${PANEL_ID} .translator-copy {
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 7px 10px;
        background: rgba(248, 250, 252, 0.92);
        color: #0f172a;
      }

      #${PANEL_ID} .translator-section {
        margin-bottom: 12px;
      }

      #${PANEL_ID} .translator-label {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
      }

      #${PANEL_ID} .translator-input {
        font-size: 13px;
        line-height: 1.45;
        color: #334155;
        padding: 10px;
        border-radius: 12px;
        background: #f8fafc;
        margin-bottom: 12px;
        white-space: pre-wrap;
      }

      #${PANEL_ID} .translator-input-compact {
        margin-bottom: 0;
      }

      #${PANEL_ID} .translator-status {
        font-size: 12px;
        color: #475569;
        margin-bottom: 10px;
      }

      #${PANEL_ID} .translator-card {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 12px;
        padding: 10px;
        margin-top: 10px;
        background: #ffffff;
      }

      #${PANEL_ID} .translator-card h4 {
        margin-bottom: 6px;
        font-size: 13px;
      }

      #${PANEL_ID} .translator-card p {
        font-size: 14px;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      #${PANEL_ID} .word-wise-text {
        line-height: 1.6;
      }

      #${PANEL_ID} .word-wise-annotation {
        display: inline;
        padding: 1px 4px;
        border-radius: 8px;
        background: rgba(29, 78, 216, 0.10);
        color: #1d4ed8;
      }

      #${PANEL_ID} .translator-error {
        border-radius: 12px;
        padding: 10px;
        font-size: 13px;
        color: #991b1b;
        background: #fef2f2;
      }

      #${HIGHLIGHT_ID} {
        position: fixed;
        z-index: 2147483646;
        pointer-events: none;
        border: 2px solid rgba(29, 78, 216, 0.92);
        border-radius: 14px;
        background: rgba(29, 78, 216, 0.10);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
      }
    `;

    document.documentElement.appendChild(style);
  }

  function createRectSnapshot(rect) {
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  }

  function removeNodeById(nodeId) {
    document.getElementById(nodeId)?.remove();
  }

  function clearPanel() {
    activeBubbleState = null;
    removeNodeById(PANEL_ID);
  }

  function clearSelectionButton() {
    removeNodeById(BUTTON_ID);
  }

  function hideUi() {
    clearSelectionButton();
    clearPanel();
  }

  function isInsideExtensionUi(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest(`#${BUTTON_ID}, #${PANEL_ID}, #${HIGHLIGHT_ID}`));
  }

  function getSelectionText() {
    return String(window.getSelection()?.toString() ?? "").trim();
  }

  function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      return null;
    }

    return createRectSnapshot(rect);
  }

  function rememberSelection(text) {
    browserApi.runtime
      .sendMessage({
        type: "remember-selection",
        text
      })
      .catch(() => {});
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function positionElement(node, rect, yOffset) {
    const top = Math.max(8, rect.top + yOffset);
    const left = Math.min(
      window.innerWidth - node.offsetWidth - 8,
      Math.max(8, rect.left + rect.width / 2 - node.offsetWidth / 2)
    );

    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
  }

  function positionPanel(node, rect, { allowCenter = false } = {}) {
    const margin = 8;
    const panelWidth = node.offsetWidth;
    const panelHeight = node.offsetHeight;
    const left = clamp(
      rect.left + rect.width / 2 - panelWidth / 2,
      margin,
      window.innerWidth - panelWidth - margin
    );
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let top;

    if (allowCenter && spaceBelow < 160 && spaceAbove < 160) {
      top = clamp(
        window.innerHeight / 2 - panelHeight / 2,
        margin,
        window.innerHeight - panelHeight - margin
      );
    } else if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
      top = clamp(rect.bottom + 12, margin, window.innerHeight - panelHeight - margin);
    } else {
      top = clamp(rect.top - panelHeight - 12, margin, window.innerHeight - panelHeight - margin);
    }

    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
  }

  function renderButton(rect, selectedText) {
    clearSelectionButton();

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Traducir";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await translateSelectionInline(selectedText, rect);
    });

    document.documentElement.appendChild(button);
    positionElement(button, rect, -42);
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

  function createCloseButton() {
    const button = createElement("button", {
      className: "translator-close",
      textContent: "x"
    });
    button.type = "button";
    button.setAttribute("aria-label", "Cerrar");
    return button;
  }

  function createSimpleHeader(title) {
    const header = createElement("div", { className: "translator-header" });
    header.append(createElement("h3", { textContent: title }), createCloseButton());
    return header;
  }

  function createTranslatorInput(text, compact = false) {
    return createElement("div", {
      className: compact ? "translator-input translator-input-compact" : "translator-input",
      textContent: text
    });
  }

  function createTranslatorStatus(text) {
    return createElement("div", {
      className: "translator-status",
      textContent: text
    });
  }

  function createTranslatorError(text) {
    return createElement("div", {
      className: "translator-error",
      textContent: text
    });
  }

  function getLanguageDisplayLabel(language, fallback = "") {
    return String(language?.label ?? language?.code ?? fallback);
  }

  function createTranslationCard(title, text, paragraphClassName = "") {
    const article = createElement("article", { className: "translator-card" });
    article.append(createElement("h4", { textContent: title }));
    article.append(
      createElement("p", {
        className: paragraphClassName,
        textContent: text
      })
    );
    return article;
  }

  function createTranslationCards(translations = []) {
    return translations.map((translation) =>
      createTranslationCard(translation.label ?? "", translation.text ?? "")
    );
  }

  function createTranslatorSection(label, text, compact = false) {
    const section = createElement("div", { className: "translator-section" });
    section.append(
      createElement("span", {
        className: "translator-label",
        textContent: label
      }),
      createTranslatorInput(text, compact)
    );
    return section;
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

  function renderPanel(rect, content, options = {}) {
    removeNodeById(PANEL_ID);

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    appendRenderable(panel, content);

    if (options.panelClassName) {
      panel.classList.add(options.panelClassName);
    }

    if (options.expanded) {
      panel.dataset.expanded = "true";
    }

    panel.querySelector(".translator-close")?.addEventListener("click", () => {
      hideUi();
    });

    document.documentElement.appendChild(panel);
    positionPanel(panel, rect, { allowCenter: options.allowCenter === true });
    return panel;
  }

  async function translateSelectionInline(selectedText, rect) {
    renderPanel(
      rect,
      [
        createSimpleHeader("Traduccion"),
        createTranslatorInput(selectedText),
        createTranslatorStatus("Consultando el servicio de traduccion...")
      ]
    );

    try {
      const result = await browserApi.runtime.sendMessage({
        type: "translate-text",
        text: selectedText,
        sourceLanguage: "auto"
      });

      const wordWise = result.wordWise ?? null;
      if (result.translationMode === "word-wise" && wordWise) {
        const wordWiseBody = wordWise.supported
          ? (() => {
              const annotatedCard = createElement("div", { className: "translator-card" });
              annotatedCard.append(
                createElement("h4", { textContent: "Texto anotado" }),
                createWordWiseTextElement(wordWise.segments)
              );

              return [
                createTranslatorStatus(
                  `Origen: ${getLanguageDisplayLabel(result.sourceLanguage, "Auto")} · Destino: ${
                    wordWise.targetLanguage?.label || result.targetLanguage?.label || ""
                  } · Nivel: ${wordWise.level}`
                ),
                annotatedCard,
                wordWise.reason ? createTranslatorStatus(wordWise.reason) : null
              ];
            })()
          : [
              createTranslatorStatus("Word Wise no está disponible para esta selección."),
              createTranslationCard("Texto original", result.input ?? ""),
              createTranslatorError(
                wordWise.reason || "Word Wise solo está disponible para texto en alemán."
              )
            ];

        renderPanel(
          rect,
          [createSimpleHeader("Word Wise"), wordWiseBody]
        );
        return;
      }

      renderPanel(
        rect,
        [
          createSimpleHeader("Traduccion rapida"),
          createTranslatorInput(result.input ?? ""),
          createTranslatorStatus(`Origen: ${getLanguageDisplayLabel(result.sourceLanguage, "Auto")}`),
          createTranslationCards(result.translations)
        ]
      );
    } catch (error) {
      renderPanel(
        rect,
        [
          createSimpleHeader("Traduccion rapida"),
          createTranslatorError(error.message || "No se pudo traducir el texto.")
        ]
      );
    }
  }

  function normalizeTextChunk(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
  }

  function isElementVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) {
      return false;
    }

    if (element.closest("[aria-hidden='true']")) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function isExcludedTagName(tagName) {
    return ["SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA"].includes(tagName);
  }

  function isBlockLikeElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const display = style.display;
    return !["inline", "contents", "inline-block", "inline-flex", "inline-grid"].includes(display);
  }

  function findSelectableBlock(target) {
    if (!(target instanceof Element) || isInsideExtensionUi(target)) {
      return null;
    }

    let element = target;
    while (element && element !== document.body && element !== document.documentElement) {
      if (!isExcludedTagName(element.tagName) && isElementVisible(element) && isBlockLikeElement(element)) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  }

  function getHighlightNode() {
    let highlight = document.getElementById(HIGHLIGHT_ID);
    if (highlight) {
      return highlight;
    }

    highlight = document.createElement("div");
    highlight.id = HIGHLIGHT_ID;
    document.documentElement.appendChild(highlight);
    return highlight;
  }

  function clearPickerHighlight() {
    hoveredBlockElement = null;
    removeNodeById(HIGHLIGHT_ID);
  }

  function updatePickerHighlight(element) {
    if (!(element instanceof Element) || !isElementVisible(element)) {
      clearPickerHighlight();
      return;
    }

    const rect = element.getBoundingClientRect();
    const highlight = getHighlightNode();
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function stopBlockPicker() {
    pickerState = null;
    document.documentElement.removeAttribute(PICKER_ATTRIBUTE);
    clearPickerHighlight();
  }

  function startBlockPicker(translationOptions) {
    stopBlockPicker();
    hideUi();
    currentSelectionText = "";
    anchorRect = null;
    pickerState = {
      mode: "block",
      translationOptions: {
        sourceLanguage: translationOptions?.sourceLanguage ?? "auto",
        targetLanguage: translationOptions?.targetLanguage ?? "en"
      }
    };
    document.documentElement.setAttribute(PICKER_ATTRIBUTE, "block");
  }

  function findTextGroupContainer(element, root) {
    let current = element;
    let fallback = root;

    while (current && current !== root) {
      if (isBlockLikeElement(current)) {
        fallback = current;
        break;
      }
      current = current.parentElement;
    }

    return fallback;
  }

  function shouldAcceptTextNode(node) {
    const parent = node.parentElement;
    if (!(parent instanceof Element)) {
      return false;
    }

    if (isInsideExtensionUi(parent)) {
      return false;
    }

    if (parent.closest("script, style, noscript, input, textarea")) {
      return false;
    }

    if (!isElementVisible(parent)) {
      return false;
    }

    return Boolean(normalizeTextChunk(node.textContent));
  }

  function appendTextChunk(output, chunk) {
    if (!output) {
      return chunk;
    }

    if (/[\s([{'"-]$/.test(output) || /^[,.;:!?)}\]'""]/.test(chunk)) {
      return output + chunk;
    }

    return `${output} ${chunk}`;
  }

  function extractVisibleBlockText(root) {
    if (!(root instanceof Element)) {
      return "";
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldAcceptTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let output = "";
    let previousGroup = null;
    let node = walker.nextNode();

    while (node) {
      const chunk = normalizeTextChunk(node.textContent);
      if (chunk) {
        const group = findTextGroupContainer(node.parentElement, root);
        if (!output) {
          output = chunk;
        } else if (group !== previousGroup) {
          output += `\n\n${chunk}`;
        } else {
          output = appendTextChunk(output, chunk);
        }
        previousGroup = group;
      }
      node = walker.nextNode();
    }

    return output.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function summarizeText(text, maxLength = DOM_BLOCK_PREVIEW_LENGTH) {
    const cleanText = String(text ?? "").trim();
    if (cleanText.length <= maxLength) {
      return cleanText;
    }

    return `${cleanText.slice(0, maxLength).trimEnd()}...`;
  }

  function getAnchorRectForElement(element) {
    if (!(element instanceof Element) || !element.isConnected) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return null;
    }

    return createRectSnapshot(rect);
  }

  function renderDomBlockBubble() {
    if (!activeBubbleState) {
      return;
    }

    const rect = getAnchorRectForElement(activeBubbleState.anchorElement) ?? activeBubbleState.anchorRect;
    if (!rect) {
      hideUi();
      return;
    }

    activeBubbleState.anchorRect = rect;

    const originalPreview = activeBubbleState.expanded
      ? activeBubbleState.originalText
      : summarizeText(activeBubbleState.originalText);
    const copyText =
      activeBubbleState.result?.translations?.[0]?.text ?? activeBubbleState.originalText ?? "";

    const body = activeBubbleState.error
      ? [
          createTranslatorStatus("No se pudo completar la traduccion del bloque."),
          createTranslatorSection("Texto detectado", originalPreview, true),
          createTranslatorError(activeBubbleState.error)
        ]
      : activeBubbleState.result
        ? [
            createTranslatorStatus(
              `Origen: ${getLanguageDisplayLabel(activeBubbleState.result.sourceLanguage, "Auto")}`
            ),
            createTranslatorSection("Texto original", originalPreview, true),
            createTranslationCards(activeBubbleState.result.translations)
          ]
        : [
            createTranslatorSection("Texto detectado", originalPreview, true),
            createTranslatorStatus("Consultando el servicio de traduccion...")
          ];

    const header = createElement("div", { className: "translator-header" });
    const headerMain = createElement("div", { className: "translator-header-main" });
    headerMain.append(
      createElement("h3", { textContent: "Bloque traducido" }),
      createElement("p", {
        className: "translator-kicker",
        textContent: "Haz clic fuera para cerrar."
      })
    );

    const actions = createElement("div", { className: "translator-actions" });
    const toggleButton = createElement("button", {
      className: "translator-toggle",
      textContent: activeBubbleState.expanded ? "Compactar" : "Expandir"
    });
    toggleButton.type = "button";
    toggleButton.dataset.action = "toggle";

    const copyButton = createElement("button", {
      className: "translator-copy",
      textContent: "Copiar"
    });
    copyButton.type = "button";
    copyButton.dataset.action = "copy";

    actions.append(toggleButton, copyButton, createCloseButton());
    header.append(headerMain, actions);

    const panel = renderPanel(
      rect,
      [header, body],
      {
        panelClassName: "translator-panel-wide",
        expanded: activeBubbleState.expanded,
        allowCenter: true
      }
    );

    panel.querySelector('[data-action="toggle"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeBubbleState.expanded = !activeBubbleState.expanded;
      renderDomBlockBubble();
    });

    panel.querySelector('[data-action="copy"]')?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await copyTextToClipboard(copyText);
    });
  }

  function repositionActiveBubble() {
    if (activeBubbleState?.kind !== "dom-block") {
      return;
    }

    const panel = document.getElementById(PANEL_ID);
    const rect = getAnchorRectForElement(activeBubbleState.anchorElement);
    if (!panel || !rect) {
      return;
    }

    activeBubbleState.anchorRect = rect;
    positionPanel(panel, rect, { allowCenter: true });
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.documentElement.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  async function translateBlockElement(element, translationOptions) {
    const text = extractVisibleBlockText(element);
    const rect = getAnchorRectForElement(element);

    if (!rect) {
      hideUi();
      return;
    }

    if (!text) {
      activeBubbleState = {
        kind: "dom-block",
        anchorElement: element,
        anchorRect: rect,
        originalText: "",
        error: "El bloque seleccionado no contiene texto visible para traducir.",
        result: null,
        expanded: false
      };
      renderDomBlockBubble();
      return;
    }

    activeBubbleState = {
      kind: "dom-block",
      anchorElement: element,
      anchorRect: rect,
      originalText: text,
      error: null,
      result: null,
      expanded: false
    };
    renderDomBlockBubble();

    try {
      const result = await browserApi.runtime.sendMessage({
        type: "translate-text",
        text,
        sourceLanguage: translationOptions?.sourceLanguage ?? "auto",
        targetLanguage: translationOptions?.targetLanguage ?? "en",
        includeSynonyms: false,
        includeExamples: false,
        sourceType: "dom-block"
      });

      if (!activeBubbleState || activeBubbleState.anchorElement !== element) {
        return;
      }

      activeBubbleState.result = result;
      activeBubbleState.error = null;
      renderDomBlockBubble();
    } catch (error) {
      if (!activeBubbleState || activeBubbleState.anchorElement !== element) {
        return;
      }

      activeBubbleState.error = error.message || "No se pudo traducir el bloque.";
      renderDomBlockBubble();
    }
  }

  function refreshSelectionUi(eventTarget) {
    if (pickerState?.mode === "block" || isInsideExtensionUi(eventTarget)) {
      return;
    }

    const selectedText = getSelectionText();
    const rect = getSelectionRect();

    if (!selectedText || !rect) {
      currentSelectionText = "";
      anchorRect = null;
      clearSelectionButton();
      return;
    }

    currentSelectionText = selectedText;
    anchorRect = rect;
    rememberSelection(selectedText);

    if (activeBubbleState?.kind === "dom-block") {
      clearPanel();
    }

    renderButton(rect, selectedText);
  }

  function handlePickerMouseMove(event) {
    if (pickerState?.mode !== "block") {
      return;
    }

    const candidate = findSelectableBlock(event.target);
    if (candidate === hoveredBlockElement) {
      return;
    }

    hoveredBlockElement = candidate;
    updatePickerHighlight(candidate);
  }

  function handlePickerClick(event) {
    if (pickerState?.mode !== "block") {
      return;
    }

    if (isInsideExtensionUi(event.target)) {
      return;
    }

    const candidate = findSelectableBlock(event.target);
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    if (!candidate) {
      stopBlockPicker();
      return;
    }

    const translationOptions = pickerState.translationOptions;
    stopBlockPicker();
    translateBlockElement(candidate, translationOptions);
  }

  function handleKeyDown(event) {
    if (event.key !== "Escape") {
      return;
    }

    if (pickerState?.mode === "block") {
      stopBlockPicker();
      return;
    }

    hideUi();
  }

  ensureStyles();

  document.addEventListener("mouseup", (event) => {
    queueMicrotask(() => refreshSelectionUi(event.target));
  });

  document.addEventListener("keyup", (event) => {
    queueMicrotask(() => refreshSelectionUi(event.target));
  });

  document.addEventListener(
    "mousemove",
    (event) => {
      handlePickerMouseMove(event);
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      handlePickerClick(event);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      handleKeyDown(event);
    },
    true
  );

  document.addEventListener(
    "scroll",
    () => {
      if (pickerState?.mode === "block") {
        updatePickerHighlight(hoveredBlockElement);
      }

      if (activeBubbleState?.kind === "dom-block") {
        repositionActiveBubble();
      }

      if (currentSelectionText && anchorRect) {
        renderButton(getSelectionRect() ?? anchorRect, currentSelectionText);
      } else {
        clearSelectionButton();
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    if (pickerState?.mode === "block") {
      updatePickerHighlight(hoveredBlockElement);
    }

    if (activeBubbleState?.kind === "dom-block") {
      repositionActiveBubble();
    }
  });

  document.addEventListener("mousedown", (event) => {
    if (!isInsideExtensionUi(event.target)) {
      clearPanel();
    }
  });

  browserApi.runtime.onMessage.addListener((message) => {
    if (message?.type === "get-selection-text") {
      return Promise.resolve({ text: getSelectionText() });
    }

    if (message?.type === "start-dom-block-picker") {
      startBlockPicker(message.translationOptions ?? {});
      return Promise.resolve({ started: true });
    }

    return undefined;
  });
})();
