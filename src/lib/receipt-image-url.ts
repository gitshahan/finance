const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
]);

export function guessImageContentType(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

export function isImageFile(file: File) {
  if (file.type.startsWith("image/")) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? IMAGE_EXTENSIONS.has(extension) : false;
}

export function isLikelyReceiptBlobUrl(url: string) {
  if (url.startsWith("/api/receipt-image")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.pathname.includes("/receipts/") &&
      parsed.hostname.includes("blob")
    );
  } catch {
    return url.startsWith("blob:");
  }
}

export function getReceiptImageProxyUrl(blobUrl: string) {
  if (blobUrl.startsWith("/api/receipt-image")) {
    return blobUrl;
  }

  return `/api/receipt-image?url=${encodeURIComponent(blobUrl)}`;
}
