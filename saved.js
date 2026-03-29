const browserApi = globalThis.browserApi ?? globalThis.browser ?? globalThis.chrome;

const savedStatusMessageElement = document.getElementById("savedStatusMessage");
const savedEntriesRootElement = document.getElementById("savedEntriesRoot");
const backToTranslatorButton = document.getElementById("backToTranslatorButton");

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

function renderSavedEntries(entries, statusOverride = "") {
  savedEntriesRootElement.replaceChildren();

  if (!entries.length) {
    setSavedStatus(statusOverride || "Todavía no has guardado palabras o frases.");
    savedEntriesRootElement.append(
      createElement("div", {
        className: "empty-card",
        textContent: "Guarda términos desde el popup o desde el menú contextual del navegador."
      })
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const article = createElement("article", { className: "saved-card" });
    const header = createElement("div", { className: "saved-card-header" });
    const text = createElement("p", {
      className: "saved-text",
      textContent: entry.text ?? ""
    });
    const deleteButton = createElement("button", {
      className: "icon-button saved-delete-button",
      textContent: "Borrar"
    });
    deleteButton.type = "button";
    deleteButton.dataset.entryId = String(entry.id ?? "");
    header.append(text, deleteButton);

    article.append(
      header,
      createElement("p", {
        className: "meta-line",
        textContent: `Guardado: ${formatDate(entry.createdAt)}`
      })
    );

    if (entry.sourceLanguage?.label) {
      article.append(
        createElement("p", {
          className: "meta-line",
          textContent: `Origen: ${entry.sourceLanguage.label}`
        })
      );
    }

    if (Array.isArray(entry.translations)) {
      for (const translation of entry.translations) {
        const paragraph = createElement("p", { className: "saved-translation" });
        const strong = createElement("strong", {
          textContent: `${translation.label}:`
        });
        paragraph.append(strong, document.createTextNode(` ${translation.text}`));
        article.append(paragraph);
      }
    }

    fragment.append(article);
  }

  savedEntriesRootElement.append(fragment);
  setSavedStatus(statusOverride || `${entries.length} elemento(s) guardado(s).`);

  for (const button of savedEntriesRootElement.querySelectorAll(".saved-delete-button")) {
    button.addEventListener("click", () => {
      deleteSavedEntry(button.dataset.entryId).catch((error) => {
        setSavedStatus(error.message || "No se pudo borrar la entrada.");
      });
    });
  }
}

async function refreshSavedEntries(statusOverride = "") {
  const entries = await browserApi.runtime.sendMessage({
    type: "get-saved-entries"
  });
  renderSavedEntries(entries, statusOverride);
}

async function deleteSavedEntry(entryId) {
  await browserApi.runtime.sendMessage({
    type: "delete-saved-entry",
    entryId
  });
  await refreshSavedEntries("Entrada borrada.");
}

backToTranslatorButton.addEventListener("click", () => {
  browserApi.runtime.sendMessage({ type: "open-results-tab" });
});

refreshSavedEntries().catch((error) => {
  setSavedStatus(error.message || "No se pudieron cargar los elementos guardados.");
});
