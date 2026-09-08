// Reconnaissance de texte sur une image, dans le navigateur.
//
// Tesseract.js est chargé à la demande depuis un CDN : le site reste statique,
// la capture ne quitte jamais l'appareil, et les 5 Mo du moteur ne sont
// téléchargés que si l'utilisateur se sert de l'import.

const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';

interface TesseractWorker {
  recognize: (image: Blob | string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}

interface TesseractGlobal {
  createWorker: (
    lang: string,
    oem?: number,
    options?: { logger?: (message: { status: string; progress: number }) => void },
  ) => Promise<TesseractWorker>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

let loading: Promise<TesseractGlobal> | null = null;

function loadTesseract(): Promise<TesseractGlobal> {
  if (window.Tesseract !== undefined) return Promise.resolve(window.Tesseract);
  if (loading !== null) return loading;
  loading = new Promise<TesseractGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CDN;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract === undefined) reject(new Error('moteur de lecture introuvable'));
      else resolve(window.Tesseract);
    };
    script.onerror = () => reject(new Error('téléchargement du moteur de lecture impossible'));
    document.head.appendChild(script);
  });
  // un échec ne doit pas condamner les tentatives suivantes
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export interface OcrProgress {
  /** libellé lisible de l'étape en cours */
  readonly label: string;
  /** avancement de 0 à 1 */
  readonly value: number;
}

const STEP_LABELS: Record<string, string> = {
  'loading tesseract core': 'téléchargement du moteur',
  'initializing tesseract': 'préparation',
  'loading language traineddata': 'téléchargement du français',
  'initializing api': 'préparation',
  'recognizing text': 'lecture de la capture',
};

/** Lit le texte d'une image. Le fichier ne quitte jamais le navigateur. */
export async function readImageText(
  image: Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<string> {
  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker('fra', 1, {
    logger: message => {
      onProgress?.({
        label: STEP_LABELS[message.status] ?? message.status,
        value: message.progress,
      });
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
