export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, maxBytes = 700 * 1024) {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await loadBitmap(file);
  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  let quality = 0.86;
  let blob = file;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    blob = await renderJpeg(bitmap, scale, quality);
    if (blob.size <= maxBytes) break;
    if (quality > 0.55) quality -= 0.1;
    else scale *= 0.8;
  }

  if (blob.size > maxBytes) {
    throw new Error("That image is still too large after compression. Try a smaller photo.");
  }
  return new File([blob], replaceExt(file.name, "jpg"), { type: "image/jpeg" });
}

function replaceExt(name, ext) {
  const base = String(name || "image").replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

function renderJpeg(image, scale, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}
