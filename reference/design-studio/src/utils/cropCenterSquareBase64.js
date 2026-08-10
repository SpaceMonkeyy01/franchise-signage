export function cropCenterSquareBase64(base64, size = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;

    img.onload = () => {
      const minSide = Math.min(img.width, img.height, size);
      const startX = (img.width - minSide) / 2;
      const startY = (img.height - minSide) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = minSide;
      canvas.height = minSide;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        startX,
        startY,
        minSide,
        minSide, // crop region
        0,
        0,
        minSide,
        minSide // destination
      );

      const croppedBase64 = canvas.toDataURL("image/png");
      resolve(croppedBase64);
    };

    img.onerror = (err) => reject(err);
  });
}


export function cropBase64Image(base64, { top, left, size = 400 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;

    img.onload = () => {
      const cropSize = Math.min(img.width, img.height, size);

      // Default to center if top/left are not provided
      const startX =
        typeof left === "number" ? left : (img.width - cropSize) / 2;
      const startY =
        typeof top === "number" ? top : (img.height - cropSize) / 2;

      // Prevent out-of-bounds
      const safeX = Math.max(0, Math.min(startX, img.width - cropSize));
      const safeY = Math.max(0, Math.min(startY, img.height - cropSize));

      const canvas = document.createElement("canvas");
      canvas.width = cropSize;
      canvas.height = cropSize;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        safeX,
        safeY,
        cropSize,
        cropSize, // source rect
        0,
        0,
        cropSize,
        cropSize // destination rect
      );

      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = (err) => reject(err);
  });
}