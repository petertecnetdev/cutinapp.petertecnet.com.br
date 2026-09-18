export const EVENT_POSTER_WIDTH = 1024;
export const EVENT_POSTER_HEIGHT = 1536;
export const EVENT_POSTER_RATIO = EVENT_POSTER_WIDTH / EVENT_POSTER_HEIGHT;
export const EVENT_POSTER_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_POSTER_HINT = "Arte vertical 2:3. Padrão final: 1024 × 1536 px.";

const ratioIsValid = (width, height) => {
  if (!width || !height) return false;
  return Math.abs((width / height) - EVENT_POSTER_RATIO) <= 0.005;
};

export const validateEventPosterFile = (file) => new Promise((resolve) => {
  if (!file) {
    resolve({ ok: true, width: 0, height: 0 });
    return;
  }

  if (file.size > EVENT_POSTER_MAX_BYTES) {
    resolve({ ok: false, message: "A imagem do evento deve ter no máximo 5 MB." });
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  const finish = (result) => {
    URL.revokeObjectURL(objectUrl);
    resolve(result);
  };

  image.onload = () => {
    const width = Number(image.naturalWidth || 0);
    const height = Number(image.naturalHeight || 0);

    if (!ratioIsValid(width, height)) {
      finish({
        ok: false,
        width,
        height,
        message: `Use uma arte vertical 2:3. O padrão do evento é ${EVENT_POSTER_WIDTH} × ${EVENT_POSTER_HEIGHT} px.`,
      });
      return;
    }

    finish({
      ok: true,
      width,
      height,
      normalized: width !== EVENT_POSTER_WIDTH || height !== EVENT_POSTER_HEIGHT,
    });
  };

  image.onerror = () => finish({
    ok: false,
    message: "Não foi possível ler esta imagem. Envie um JPG, PNG ou WebP válido.",
  });

  image.src = objectUrl;
});
