(() => {
  const DEFAULT_OPTIONS = {
    workerBlobURL: true,
    logger: () => {}
  };

  const OEM = {
    TESSERACT_ONLY: 0,
    LSTM_ONLY: 1,
    TESSERACT_LSTM_COMBINED: 2,
    DEFAULT: 3
  };

  let jobCounter = 0;
  let workerCounter = 0;

  function getId(prefix, count) {
    return `${prefix}-${count}-${Math.random().toString(16).slice(3, 8)}`;
  }

  function createJob({ id, action, payload = {} }) {
    const nextId = typeof id === "undefined" ? getId("Job", jobCounter++) : id;
    return {
      id: nextId,
      action,
      payload
    };
  }

  function resolveOptionUrls(options = {}) {
    const resolvedOptions = { ...options };
    for (const key of ["corePath", "workerPath", "langPath"]) {
      if (resolvedOptions[key]) {
        resolvedOptions[key] = new URL(resolvedOptions[key], window.location.href).href;
      }
    }
    return resolvedOptions;
  }

  function spawnWorker({ workerPath, workerBlobURL }) {
    if (typeof Blob !== "undefined" && typeof URL !== "undefined" && workerBlobURL) {
      const blob = new Blob([`importScripts("${workerPath}");`], {
        type: "application/javascript"
      });
      return new Worker(URL.createObjectURL(blob));
    }

    return new Worker(workerPath);
  }

  function readFromBlobOrFile(blob) {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        resolve(fileReader.result);
      };
      fileReader.onerror = ({ target: { error } }) => {
        reject(new Error(`File could not be read! Code=${error?.code ?? "unknown"}`));
      };
      fileReader.readAsArrayBuffer(blob);
    });
  }

  async function loadImage(image) {
    let data = image;

    if (typeof image === "undefined") {
      return "undefined";
    }

    if (typeof image === "string") {
      if (/data:image\/([a-zA-Z]*);base64,([^"]*)/.test(image)) {
        data = atob(image.split(",")[1])
          .split("")
          .map((char) => char.charCodeAt(0));
      } else {
        const response = await fetch(image);
        data = await response.arrayBuffer();
      }
    } else if (typeof HTMLElement !== "undefined" && image instanceof HTMLElement) {
      if (image.tagName === "IMG") {
        data = await loadImage(image.src);
      }

      if (image.tagName === "VIDEO") {
        data = await loadImage(image.poster);
      }

      if (image.tagName === "CANVAS") {
        await new Promise((resolve) => {
          image.toBlob(async (blob) => {
            data = await readFromBlobOrFile(blob);
            resolve();
          });
        });
      }
    } else if (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) {
      const blob = await image.convertToBlob();
      data = await readFromBlobOrFile(blob);
    } else if (image instanceof File || image instanceof Blob) {
      data = await readFromBlobOrFile(image);
    }

    return new Uint8Array(data);
  }

  async function createWorker(langs = "eng", oem = OEM.LSTM_ONLY, rawOptions = {}, config = {}) {
    const id = getId("Worker", workerCounter++);
    const options = resolveOptionUrls({
      ...DEFAULT_OPTIONS,
      ...rawOptions
    });
    const currentLangs = typeof langs === "string" ? langs.split("+") : [...langs];
    let currentOem = oem;
    let currentConfig = config;
    const lstmOnlyCore =
      [OEM.DEFAULT, OEM.LSTM_ONLY].includes(oem) && !options.legacyCore;
    const promises = {};

    let worker = spawnWorker(options);
    const workerReady = new Promise((resolve, reject) => {
      worker.onerror = (event) => {
        reject(new Error(event?.message || "No se pudo inicializar el worker OCR."));
      };

      worker.onmessage = ({ data }) => {
        const { workerId, jobId, status, action, data: payload } = data;
        const promiseId = `${action}-${jobId}`;

        if (status === "resolve") {
          const promise = promises[promiseId];
          if (promise) {
            promise.resolve({ jobId, data: payload });
            delete promises[promiseId];
          }
          return;
        }

        if (status === "reject") {
          const promise = promises[promiseId];
          if (promise) {
            promise.reject(payload);
            delete promises[promiseId];
          }
          return;
        }

        if (status === "progress") {
          options.logger?.({ ...payload, workerId, userJobId: jobId });
        }
      };

      function startJob({ id: jobId, action, payload }) {
        return new Promise((jobResolve, jobReject) => {
          promises[`${action}-${jobId}`] = {
            resolve: jobResolve,
            reject: jobReject
          };

          worker.postMessage({
            workerId: id,
            jobId,
            action,
            payload
          });
        });
      }

      function loadInternal(jobId) {
        return startJob(
          createJob({
            id: jobId,
            action: "load",
            payload: {
              options: {
                lstmOnly: lstmOnlyCore,
                corePath: options.corePath,
                logging: options.logging
              }
            }
          })
        );
      }

      function loadLanguageInternal(languageList, jobId) {
        return startJob(
          createJob({
            id: jobId,
            action: "loadLanguage",
            payload: {
              langs: languageList,
              options: {
                langPath: options.langPath,
                dataPath: options.dataPath,
                cachePath: options.cachePath,
                cacheMethod: options.cacheMethod,
                gzip: options.gzip,
                lstmOnly:
                  [OEM.DEFAULT, OEM.LSTM_ONLY].includes(currentOem) && !options.legacyLang
              }
            }
          })
        );
      }

      function initializeInternal(languageList, nextOem, nextConfig, jobId) {
        return startJob(
          createJob({
            id: jobId,
            action: "initialize",
            payload: {
              langs: languageList,
              oem: nextOem,
              config: nextConfig
            }
          })
        );
      }

      async function recognize(image, recognizeOptions = {}, output = { text: true }, jobId) {
        return startJob(
          createJob({
            id: jobId,
            action: "recognize",
            payload: {
              image: await loadImage(image),
              options: recognizeOptions,
              output
            }
          })
        );
      }

      function setParameters(params = {}, jobId) {
        return startJob(
          createJob({
            id: jobId,
            action: "setParameters",
            payload: { params }
          })
        );
      }

      function reinitialize(nextLangs = "eng", nextOem, nextConfig, jobId) {
        if (
          lstmOnlyCore &&
          [OEM.TESSERACT_ONLY, OEM.TESSERACT_LSTM_COMBINED].includes(nextOem)
        ) {
          throw new Error("Legacy model requested but code missing.");
        }

        const resolvedOem = nextOem || currentOem;
        currentOem = resolvedOem;
        const resolvedConfig = nextConfig || currentConfig;
        currentConfig = resolvedConfig;

        const nextLangsArray =
          typeof nextLangs === "string" ? nextLangs.split("+") : [...nextLangs];
        const missingLangs = nextLangsArray.filter((lang) => !currentLangs.includes(lang));
        currentLangs.push(...missingLangs);

        if (missingLangs.length > 0) {
          return loadLanguageInternal(missingLangs, jobId).then(() =>
            initializeInternal(nextLangs, resolvedOem, resolvedConfig, jobId)
          );
        }

        return initializeInternal(nextLangs, resolvedOem, resolvedConfig, jobId);
      }

      async function terminate() {
        if (worker !== null) {
          worker.terminate();
          worker = null;
        }
      }

      loadInternal()
        .then(() => loadLanguageInternal(currentLangs))
        .then(() => initializeInternal(langs, oem, config))
        .then(() => {
          resolve({
            id,
            recognize,
            reinitialize,
            setParameters,
            terminate
          });
        })
        .catch((error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });

    return workerReady;
  }

  globalThis.Tesseract = {
    OEM,
    createWorker
  };
})();
