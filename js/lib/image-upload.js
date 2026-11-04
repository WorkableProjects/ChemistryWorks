// Turns a picture the teacher uploads, pastes or drops into a small inline data URL, so it can live inside the test
// JSON (published tests are stored in one Google Sheet cell, 49,000 characters max for the whole test).
// The picture is drawn on a canvas, scaled down and re-encoded (WebP, falling back to JPEG) until it fits the budget.

export const IMAGE_BUDGET_CHARS = 30000;
const MAX_SIDE = 1200;
const MIN_SIDE = 240;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a picture this browser can open.'));
    img.src = src;
  });
}

/**
 * @param {File|Blob} file an image file
 * @returns {Promise<{ url: string, width: number, height: number, chars: number }>}
 */
export async function compressImageFile(file, { budget = IMAGE_BUDGET_CHARS } = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Choose a picture file (PNG, JPG, GIF, WebP or SVG).');
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const w0 = img.naturalWidth || 800;
    const h0 = img.naturalHeight || 600;
    let scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    for (let pass = 0; pass < 8; pass++) {
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      canvas.width = w; canvas.height = h;
      ctx.fillStyle = '#ffffff'; // transparent areas become white (JPEG has no alpha)
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.82, 0.7, 0.58, 0.46]) {
        let url = canvas.toDataURL('image/webp', q);
        if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q);
        if (url.length <= budget) return { url, width: w, height: h, chars: url.length };
      }
      if (Math.max(w, h) <= MIN_SIDE) break;
      scale *= 0.75;
    }
    throw new Error('This picture is too detailed to store in the test. Use a smaller picture, or paste a link to it instead.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const isDataImage = (url) => /^data:image\//i.test(String(url || ''));
