(function () {
  if (globalThis.browserApi) {
    return;
  }

  if (globalThis.browser) {
    globalThis.browserApi = globalThis.browser;
    return;
  }

  const chromeApi = globalThis.chrome;
  if (!chromeApi) {
    throw new Error("No se ha encontrado ninguna API de extensiones compatible.");
  }

  const messageListenerMap = new WeakMap();

  function toErrorMessage(error) {
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }

    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }

    return "Error inesperado de la extensión.";
  }

  function unwrapResponseEnvelope(response) {
    if (!response || response.__browserApiEnvelope !== true) {
      return response;
    }

    if (response.error) {
      throw new Error(response.error);
    }

    return response.value;
  }

  function promisify(namespace, methodName, options = {}) {
    const method = namespace?.[methodName];
    if (typeof method !== "function") {
      return undefined;
    }

    return (...args) =>
      new Promise((resolve, reject) => {
        try {
          method.call(namespace, ...args, (result) => {
            const runtimeError = chromeApi.runtime?.lastError;
            if (runtimeError) {
              reject(new Error(runtimeError.message || "La API de Chrome devolvió un error."));
              return;
            }

            try {
              resolve(options.unwrap ? unwrapResponseEnvelope(result) : result);
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          reject(error);
        }
      });
  }

  function createPromiseAwareEvent(rawEvent) {
    return {
      addListener(listener) {
        if (typeof listener !== "function") {
          return;
        }

        const wrappedListener = (message, sender, sendResponse) => {
          Promise.resolve()
            .then(() => listener(message, sender))
            .then((value) => {
              sendResponse({
                __browserApiEnvelope: true,
                value
              });
            })
            .catch((error) => {
              sendResponse({
                __browserApiEnvelope: true,
                error: toErrorMessage(error)
              });
            });

          return true;
        };

        messageListenerMap.set(listener, wrappedListener);
        rawEvent.addListener(wrappedListener);
      },

      removeListener(listener) {
        const wrappedListener = messageListenerMap.get(listener);
        rawEvent.removeListener(wrappedListener ?? listener);
        messageListenerMap.delete(listener);
      },

      hasListener(listener) {
        const wrappedListener = messageListenerMap.get(listener);
        return rawEvent.hasListener?.(wrappedListener ?? listener) ?? false;
      }
    };
  }

  globalThis.browserApi = {
    ...chromeApi,
    runtime: {
      ...chromeApi.runtime,
      getURL: chromeApi.runtime.getURL.bind(chromeApi.runtime),
      id: chromeApi.runtime.id,
      onInstalled: chromeApi.runtime.onInstalled,
      onMessage: createPromiseAwareEvent(chromeApi.runtime.onMessage),
      onStartup: chromeApi.runtime.onStartup,
      openOptionsPage: promisify(chromeApi.runtime, "openOptionsPage"),
      sendMessage: promisify(chromeApi.runtime, "sendMessage", { unwrap: true })
    },
    storage: {
      ...chromeApi.storage,
      local: {
        ...chromeApi.storage.local,
        get: promisify(chromeApi.storage.local, "get"),
        remove: promisify(chromeApi.storage.local, "remove"),
        set: promisify(chromeApi.storage.local, "set")
      }
    },
    tabs: {
      ...chromeApi.tabs,
      create: promisify(chromeApi.tabs, "create"),
      query: promisify(chromeApi.tabs, "query"),
      sendMessage: promisify(chromeApi.tabs, "sendMessage", { unwrap: true }),
      update: promisify(chromeApi.tabs, "update")
    },
    windows: {
      ...chromeApi.windows,
      create: promisify(chromeApi.windows, "create"),
      onRemoved: chromeApi.windows?.onRemoved,
      update: promisify(chromeApi.windows, "update")
    },
    contextMenus: {
      ...chromeApi.contextMenus,
      create: promisify(chromeApi.contextMenus, "create"),
      onClicked: chromeApi.contextMenus.onClicked,
      removeAll: promisify(chromeApi.contextMenus, "removeAll")
    },
    commands: chromeApi.commands,
    i18n: {
      ...chromeApi.i18n,
      detectLanguage: promisify(chromeApi.i18n, "detectLanguage")
    }
  };
})();
