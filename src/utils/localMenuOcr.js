const OCR_ASSETS = {
  script: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js",
  worker: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
  core: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
  lang: "https://tessdata.projectnaptha.com/4.0.0_fast",
};

let enginePromise = null;

export function loadLocalOcrEngine() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OCR local só está disponível no navegador."));
  }

  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);

  if (!enginePromise) {
    enginePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-cutinapp-local-ocr="true"]');
      const script = existing || document.createElement("script");

      const onLoad = () => {
        if (window.Tesseract?.createWorker) {
          resolve(window.Tesseract);
          return;
        }
        enginePromise = null;
        reject(new Error("O motor de leitura local não foi carregado corretamente."));
      };
      const onError = () => {
        enginePromise = null;
        reject(new Error("Não foi possível carregar o motor de leitura local."));
      };

      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });

      if (!existing) {
        script.src = OCR_ASSETS.script;
        script.async = true;
        script.dataset.cutinappLocalOcr = "true";
        document.head.appendChild(script);
      }
    });
  }

  return enginePromise;
}

const clamp = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export async function recognizeMenuImages(files, onProgress = () => {}) {
  const images = Array.from(files || []);
  if (!images.length) return [];

  const Tesseract = await loadLocalOcrEngine();
  let worker = null;
  let currentIndex = 0;

  const publish = (payload) => {
    try {
      onProgress({ imageIndex: currentIndex, totalImages: images.length, ...payload });
    } catch (_) {
      // UI progress callbacks must never interrupt OCR execution.
    }
  };

  try {
    publish({ stage: "loading", status: "loading", progress: 0 });
    worker = await Tesseract.createWorker(
      "por",
      Tesseract.OEM?.LSTM_ONLY ?? 1,
      {
        workerPath: OCR_ASSETS.worker,
        corePath: OCR_ASSETS.core,
        langPath: OCR_ASSETS.lang,
        logger: (message) => publish({
          stage: message?.status === "recognizing text" ? "recognizing" : "loading",
          status: String(message?.status || ""),
          progress: clamp(message?.progress),
        }),
      }
    );

    await worker.setParameters({ preserve_interword_spaces: "1" });

    const documents = [];
    for (let index = 0; index < images.length; index += 1) {
      currentIndex = index;
      publish({ stage: "recognizing", status: "recognizing text", progress: 0 });
      const result = await worker.recognize(images[index]);
      documents.push({
        name: images[index]?.name || `Imagem ${index + 1}`,
        text: String(result?.data?.text || ""),
        confidence: Number(result?.data?.confidence || 0),
      });
      publish({ stage: "recognizing", status: "recognizing text", progress: 1 });
    }

    publish({ stage: "done", status: "done", progress: 1 });
    return documents;
  } finally {
    if (worker) await worker.terminate().catch(() => undefined);
  }
}
