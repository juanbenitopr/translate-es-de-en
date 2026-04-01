const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const VIEWS = {
  HISTORY: "history",
  GLOSSARY: "glossary"
};

const savedStatusMessageElement = document.getElementById("savedStatusMessage");
const savedEntriesRootElement = document.getElementById("savedEntriesRoot");
const backToTranslatorButton = document.getElementById("backToTranslatorButton");
const historyTabButton = document.getElementById("historyTabButton");
const glossaryTabButton = document.getElementById("glossaryTabButton");
const savedSearchInput = document.getElementById("savedSearchInput");
const itemTypeFilter = document.getElementById("itemTypeFilter");
const glossaryOnlyFiltersElement = document.getElementById("glossaryOnlyFilters");
const glossaryStatusFilter = document.getElementById("glossaryStatusFilter");
const favoritesOnlyCheckbox = document.getElementById("favoritesOnlyCheckbox");

const state = {
  activeView: VIEWS.HISTORY,
  query: "",
  itemType: "all",
  glossaryStatus: "all",
  favoritesOnly: false,
  editingEntryId: "",
  historyEntries: [],
  glossaryEntries: []
};

function createElement(
  tagName,
  { className = "", textContent = null, attrs = null, dataset = null } = {}
) {
  const element = document.createElement(tagName);

  if (Array.isArray(className)) {
    element.className = className.filter(Boolean).join(" ");
  } else if (className) {
    element.className = className;
  }

  if (textContent !== null) {
    element.textContent = String(textContent);
  }

  if (attrs && typeof attrs === "object") {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }

      if (value === true) {
        element.setAttribute(key, "");
        continue;
      }

      element.setAttribute(key, String(value));
    }
  }

  if (dataset && typeof dataset === "object") {
    Object.assign(element.dataset, dataset);
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

function appendChildren(parent, ...renderables) {
  for (const renderable of renderables) {
    appendRenderable(parent, renderable);
  }
}

function setSavedStatus(message) {
  savedStatusMessageElement.textContent = message;
}

function formatDate(isoDate) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(isoDate));
  } catch (error) {
    return isoDate ?? "";
  }
}

function normalizeSearchValue(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es-ES");
}

function formatItemType(itemType) {
  return itemType === "word" ? "Palabra" : "Frase";
}

function formatGlossaryStatus(status) {
  switch (status) {
    case "review":
      return "Repasar";
    case "mastered":
      return "Dominada";
    default:
      return "Nueva";
  }
}

function getPrimaryTranslation(entry) {
  return Array.isArray(entry?.translations) ? entry.translations[0] ?? null : null;
}

function buildSearchHaystack(entry) {
  return [
    entry.text,
    entry.note,
    entry.contextText,
    entry.pageTitle,
    entry.pageUrl,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.translations) ? entry.translations.map((item) => item.text) : [])
  ]
    .filter(Boolean)
    .join(" \n")
    .toLocaleLowerCase("es-ES");
}

function matchesCommonFilters(entry) {
  if (state.itemType !== "all" && entry.itemType !== state.itemType) {
    return false;
  }

  if (state.query && !buildSearchHaystack(entry).includes(state.query)) {
    return false;
  }

  return true;
}

function getVisibleEntries() {
  const baseEntries =
    state.activeView === VIEWS.HISTORY ? state.historyEntries : state.glossaryEntries;
  let entries = baseEntries.filter(matchesCommonFilters);

  if (state.activeView === VIEWS.GLOSSARY) {
    if (state.glossaryStatus !== "all") {
      entries = entries.filter((entry) => entry.status === state.glossaryStatus);
    }

    if (state.favoritesOnly) {
      entries = entries.filter((entry) => entry.favorite === true);
    }
  }

  return entries;
}

function createMetaLine(label, value) {
  if (!value) {
    return null;
  }

  return createElement("p", {
    className: "meta-line",
    textContent: `${label}: ${value}`
  });
}

function createBadge(text, modifier = "") {
  return createElement("span", {
    className: ["saved-badge", modifier].filter(Boolean),
    textContent: text
  });
}

function createTranslationList(entry) {
  if (!Array.isArray(entry.translations) || !entry.translations.length) {
    return null;
  }

  const wrapper = createElement("div", { className: "saved-translations" });

  for (const translation of entry.translations) {
    const paragraph = createElement("p", { className: "saved-translation" });
    const strong = createElement("strong", {
      textContent: `${translation.label || "Traducción"}:`
    });
    paragraph.append(strong, document.createTextNode(` ${translation.text}`));
    wrapper.append(paragraph);
  }

  return wrapper;
}

function createPageMeta(entry) {
  if (!entry.pageTitle && !entry.pageUrl) {
    return null;
  }

  const wrapper = createElement("div", { className: "saved-source" });

  if (entry.pageTitle) {
    wrapper.append(createMetaLine("Fuente", entry.pageTitle));
  }

  if (entry.pageUrl) {
    const line = createElement("p", { className: "meta-line" });
    const link = createElement("a", {
      className: "saved-source-link",
      textContent: "Abrir página",
      attrs: {
        href: entry.pageUrl,
        target: "_blank",
        rel: "noreferrer"
      }
    });
    line.append("URL: ", link);
    wrapper.append(line);
  }

  return wrapper;
}

function createTagsList(tags) {
  if (!Array.isArray(tags) || !tags.length) {
    return null;
  }

  const wrapper = createElement("div", { className: "tag-list saved-tag-list" });

  for (const tag of tags) {
    wrapper.append(
      createElement("span", {
        className: "tag-pill",
        textContent: tag
      })
    );
  }

  return wrapper;
}

function createHistoryCard(entry) {
  const article = createElement("article", { className: "saved-card" });
  const header = createElement("div", { className: "saved-card-header" });
  const titleBlock = createElement("div", { className: "saved-card-title-block" });
  const title = createElement("p", {
    className: "saved-text",
    textContent: entry.text ?? ""
  });
  const badges = createElement("div", { className: "saved-badge-row" });
  badges.append(
    createBadge(formatItemType(entry.itemType)),
    createBadge(entry.translationMode === "word-wise" ? "Word Wise" : "Traducción")
  );
  titleBlock.append(title, badges);

  const actions = createElement("div", { className: "saved-card-actions" });
  const promoteButton = createElement("button", {
    className: "text-action history-promote-button",
    textContent: "Añadir al glosario",
    dataset: { entryId: String(entry.id ?? "") }
  });
  promoteButton.type = "button";

  const deleteButton = createElement("button", {
    className: "icon-button saved-delete-button",
    textContent: "Borrar",
    dataset: {
      entryId: String(entry.id ?? ""),
      kind: VIEWS.HISTORY
    }
  });
  deleteButton.type = "button";

  actions.append(promoteButton, deleteButton);
  header.append(titleBlock, actions);

  const fragment = document.createDocumentFragment();
  appendChildren(
    fragment,
    header,
    createMetaLine("Guardado", formatDate(entry.createdAt)),
    createMetaLine("Origen", entry.sourceLanguage?.label)
  );

  const primaryTranslation = getPrimaryTranslation(entry);
  if (primaryTranslation && entry.targetLanguage?.label) {
    appendChildren(fragment, createMetaLine("Destino", entry.targetLanguage.label));
  }

  appendChildren(fragment, createTranslationList(entry), createPageMeta(entry));
  article.append(fragment);
  return article;
}

function createGlossaryEditForm(entry) {
  const form = createElement("form", {
    className: "glossary-edit-form",
    dataset: { entryId: String(entry.id ?? "") }
  });

  const contextField = createElement("label", { className: "saved-form-field" });
  contextField.append(
    createElement("span", {
      className: "mini-label",
      textContent: "Contexto"
    })
  );
  const contextTextarea = createElement("textarea", {
    className: "saved-textarea",
    attrs: {
      name: "contextText",
      rows: "3",
      placeholder: "Frase completa o contexto donde apareció"
    }
  });
  contextTextarea.value = entry.contextText ?? "";
  contextField.append(contextTextarea);

  const noteField = createElement("label", { className: "saved-form-field" });
  noteField.append(
    createElement("span", {
      className: "mini-label",
      textContent: "Nota"
    })
  );
  const noteTextarea = createElement("textarea", {
    className: "saved-textarea",
    attrs: {
      name: "note",
      rows: "3",
      placeholder: "Apunte útil, matiz o recordatorio"
    }
  });
  noteTextarea.value = entry.note ?? "";
  noteField.append(noteTextarea);

  const tagsField = createElement("label", { className: "saved-form-field" });
  tagsField.append(
    createElement("span", {
      className: "mini-label",
      textContent: "Etiquetas"
    })
  );
  const tagsInput = createElement("input", {
    className: "header-select saved-search-input",
    attrs: {
      type: "text",
      name: "tags",
      placeholder: "trabajo, viajes, verbos"
    }
  });
  tagsInput.value = Array.isArray(entry.tags) ? entry.tags.join(", ") : "";
  tagsField.append(tagsInput);

  const actionRow = createElement("div", { className: "saved-form-actions" });
  const saveButton = createElement("button", {
    className: "primary-button compact-button",
    textContent: "Guardar"
  });
  saveButton.type = "submit";

  const cancelButton = createElement("button", {
    className: "secondary-button compact-button glossary-cancel-button",
    textContent: "Cancelar",
    dataset: { entryId: String(entry.id ?? "") }
  });
  cancelButton.type = "button";

  actionRow.append(saveButton, cancelButton);
  form.append(contextField, noteField, tagsField, actionRow);
  return form;
}

function createGlossaryCard(entry) {
  const article = createElement("article", { className: "saved-card" });
  const header = createElement("div", { className: "saved-card-header" });
  const titleBlock = createElement("div", { className: "saved-card-title-block" });
  const title = createElement("p", {
    className: "saved-text",
    textContent: entry.text ?? ""
  });
  const badges = createElement("div", { className: "saved-badge-row" });
  badges.append(
    createBadge(formatItemType(entry.itemType)),
    createBadge(formatGlossaryStatus(entry.status), `saved-badge-status-${entry.status}`)
  );
  titleBlock.append(title, badges);

  const actions = createElement("div", { className: "saved-card-actions" });
  const favoriteButton = createElement("button", {
    className: ["icon-button", "glossary-favorite-button", entry.favorite ? "is-active" : ""],
    textContent: entry.favorite ? "★ Favorita" : "☆ Favorita",
    dataset: { entryId: String(entry.id ?? "") },
    attrs: { "aria-pressed": entry.favorite === true ? "true" : "false" }
  });
  favoriteButton.type = "button";

  const editButton = createElement("button", {
    className: "text-action glossary-edit-button",
    textContent: state.editingEntryId === entry.id ? "Ocultar edición" : "Editar",
    dataset: { entryId: String(entry.id ?? "") }
  });
  editButton.type = "button";

  const deleteButton = createElement("button", {
    className: "icon-button saved-delete-button",
    textContent: "Borrar",
    dataset: {
      entryId: String(entry.id ?? ""),
      kind: VIEWS.GLOSSARY
    }
  });
  deleteButton.type = "button";

  actions.append(favoriteButton, editButton, deleteButton);
  header.append(titleBlock, actions);

  const controls = createElement("div", { className: "saved-inline-row" });
  appendChildren(
    controls,
    createMetaLine("Guardado", formatDate(entry.createdAt)),
    createMetaLine("Origen", entry.sourceLanguage?.label)
  );

  const statusField = createElement("label", { className: "inline-control-group" });
  statusField.append(
    createElement("span", {
      className: "mini-label",
      textContent: "Estado"
    })
  );
  const statusSelect = createElement("select", {
    className: "header-select compact-select glossary-status-select",
    dataset: { entryId: String(entry.id ?? "") }
  });
  statusSelect.append(
    createElement("option", { textContent: "Nueva", attrs: { value: "new" } }),
    createElement("option", { textContent: "Repasar", attrs: { value: "review" } }),
    createElement("option", { textContent: "Dominada", attrs: { value: "mastered" } })
  );
  statusSelect.value = entry.status ?? "new";
  statusField.append(statusSelect);
  controls.append(statusField);

  const articleBody = createElement("div", { className: "saved-card-body" });
  const primaryTranslation = getPrimaryTranslation(entry);
  if (primaryTranslation && entry.targetLanguage?.label) {
    appendChildren(articleBody, createMetaLine("Destino", entry.targetLanguage.label));
  }

  appendChildren(articleBody, createTranslationList(entry));

  if (entry.contextText) {
    articleBody.append(
      createElement("p", {
        className: "saved-note-block",
        textContent: `Contexto: ${entry.contextText}`
      })
    );
  }

  if (entry.note) {
    articleBody.append(
      createElement("p", {
        className: "saved-note-block saved-note-muted",
        textContent: `Nota: ${entry.note}`
      })
    );
  }

  appendChildren(articleBody, createTagsList(entry.tags), createPageMeta(entry));

  article.append(header, controls, articleBody);

  if (state.editingEntryId === entry.id) {
    article.append(createGlossaryEditForm(entry));
  }

  return article;
}

function renderEmptyState() {
  const isHistory = state.activeView === VIEWS.HISTORY;
  const message = isHistory
    ? "Todavía no hay traducciones en el historial."
    : "Todavía no has añadido nada al glosario.";
  const helper = isHistory
    ? "Cada traducción correcta aparecerá aquí automáticamente."
    : "Guarda términos desde el popup o promuévelos desde el historial.";

  setChildren(
    savedEntriesRootElement,
    createElement("div", {
      className: "empty-card",
      textContent: `${message} ${helper}`
    })
  );
}

function syncToolbar() {
  const isGlossaryView = state.activeView === VIEWS.GLOSSARY;
  glossaryOnlyFiltersElement.hidden = !isGlossaryView;
  historyTabButton.classList.toggle("saved-tab-button-active", !isGlossaryView);
  glossaryTabButton.classList.toggle("saved-tab-button-active", isGlossaryView);
}

function renderEntries(statusOverride = "") {
  syncToolbar();
  const visibleEntries = getVisibleEntries();
  const totalEntries =
    state.activeView === VIEWS.HISTORY ? state.historyEntries.length : state.glossaryEntries.length;

  if (!visibleEntries.length) {
    renderEmptyState();
    setSavedStatus(
      statusOverride ||
        (state.query || state.itemType !== "all" || state.glossaryStatus !== "all" || state.favoritesOnly
          ? "No hay resultados para los filtros actuales."
          : state.activeView === VIEWS.HISTORY
            ? "Historial vacío."
            : "Glosario vacío.")
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of visibleEntries) {
    fragment.append(
      state.activeView === VIEWS.HISTORY ? createHistoryCard(entry) : createGlossaryCard(entry)
    );
  }

  savedEntriesRootElement.replaceChildren(fragment);
  setSavedStatus(
    statusOverride ||
      `${visibleEntries.length} de ${totalEntries} elemento(s) en ${
        state.activeView === VIEWS.HISTORY ? "historial" : "glosario"
      }.`
  );
}

async function refreshEntries(statusOverride = "") {
  const [historyEntries, glossaryEntries] = await Promise.all([
    browserApi.runtime.sendMessage({ type: "get-history-entries" }),
    browserApi.runtime.sendMessage({ type: "get-glossary-entries" })
  ]);

  state.historyEntries = Array.isArray(historyEntries) ? historyEntries : [];
  state.glossaryEntries = Array.isArray(glossaryEntries) ? glossaryEntries : [];
  renderEntries(statusOverride);
}

async function handleDeleteEntry(entryId, kind) {
  await browserApi.runtime.sendMessage({
    type: kind === VIEWS.HISTORY ? "delete-history-entry" : "delete-glossary-entry",
    entryId
  });
  if (state.editingEntryId === entryId) {
    state.editingEntryId = "";
  }
  await refreshEntries(kind === VIEWS.HISTORY ? "Entrada borrada del historial." : "Entrada borrada del glosario.");
}

async function handlePromoteHistoryEntry(entryId) {
  const result = await browserApi.runtime.sendMessage({
    type: "promote-history-entry",
    entryId
  });
  await refreshEntries(result?.duplicate ? "La entrada ya estaba en el glosario." : "Entrada añadida al glosario.");
}

async function handleFavoriteToggle(entryId) {
  const entry = state.glossaryEntries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  await browserApi.runtime.sendMessage({
    type: "update-glossary-entry",
    entryId,
    updates: {
      favorite: entry.favorite !== true
    }
  });
  await refreshEntries(entry.favorite ? "Entrada marcada como no favorita." : "Entrada marcada como favorita.");
}

async function handleStatusChange(entryId, status) {
  await browserApi.runtime.sendMessage({
    type: "update-glossary-entry",
    entryId,
    updates: { status }
  });
  await refreshEntries("Estado actualizado.");
}

async function handleGlossaryFormSubmit(form) {
  const entryId = form.dataset.entryId ?? "";
  const formData = new FormData(form);
  await browserApi.runtime.sendMessage({
    type: "update-glossary-entry",
    entryId,
    updates: {
      contextText: formData.get("contextText"),
      note: formData.get("note"),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    }
  });
  state.editingEntryId = "";
  await refreshEntries("Ficha del glosario actualizada.");
}

historyTabButton.addEventListener("click", () => {
  state.activeView = VIEWS.HISTORY;
  state.editingEntryId = "";
  renderEntries();
});

glossaryTabButton.addEventListener("click", () => {
  state.activeView = VIEWS.GLOSSARY;
  renderEntries();
});

savedSearchInput.addEventListener("input", () => {
  state.query = normalizeSearchValue(savedSearchInput.value);
  renderEntries();
});

itemTypeFilter.addEventListener("change", () => {
  state.itemType = itemTypeFilter.value;
  renderEntries();
});

glossaryStatusFilter.addEventListener("change", () => {
  state.glossaryStatus = glossaryStatusFilter.value;
  renderEntries();
});

favoritesOnlyCheckbox.addEventListener("change", () => {
  state.favoritesOnly = favoritesOnlyCheckbox.checked;
  renderEntries();
});

savedEntriesRootElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const deleteButton = target.closest(".saved-delete-button");
  if (deleteButton instanceof HTMLElement) {
    handleDeleteEntry(deleteButton.dataset.entryId ?? "", deleteButton.dataset.kind ?? "").catch(
      (error) => {
        setSavedStatus(error.message || "No se pudo borrar la entrada.");
      }
    );
    return;
  }

  const promoteButton = target.closest(".history-promote-button");
  if (promoteButton instanceof HTMLElement) {
    handlePromoteHistoryEntry(promoteButton.dataset.entryId ?? "").catch((error) => {
      setSavedStatus(error.message || "No se pudo añadir la entrada al glosario.");
    });
    return;
  }

  const favoriteButton = target.closest(".glossary-favorite-button");
  if (favoriteButton instanceof HTMLElement) {
    handleFavoriteToggle(favoriteButton.dataset.entryId ?? "").catch((error) => {
      setSavedStatus(error.message || "No se pudo actualizar la favorita.");
    });
    return;
  }

  const editButton = target.closest(".glossary-edit-button");
  if (editButton instanceof HTMLElement) {
    const entryId = editButton.dataset.entryId ?? "";
    state.editingEntryId = state.editingEntryId === entryId ? "" : entryId;
    renderEntries();
    return;
  }

  const cancelButton = target.closest(".glossary-cancel-button");
  if (cancelButton instanceof HTMLElement) {
    state.editingEntryId = "";
    renderEntries();
  }
});

savedEntriesRootElement.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.classList.contains("glossary-status-select")) {
    handleStatusChange(target.dataset.entryId ?? "", target.value).catch((error) => {
      setSavedStatus(error.message || "No se pudo actualizar el estado.");
    });
  }
});

savedEntriesRootElement.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.classList.contains("glossary-edit-form")) {
    return;
  }

  event.preventDefault();
  handleGlossaryFormSubmit(form).catch((error) => {
    setSavedStatus(error.message || "No se pudo actualizar la ficha.");
  });
});

backToTranslatorButton.addEventListener("click", () => {
  browserApi.runtime.sendMessage({ type: "open-results-tab" });
});

refreshEntries().catch((error) => {
  setSavedStatus(error.message || "No se pudieron cargar el historial y el glosario.");
});
