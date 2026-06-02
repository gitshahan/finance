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

export function isCsvFile(file: File) {
  if (
    file.type === "text/csv" ||
    file.type === "application/csv" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return true;
  }

  return file.name.split(".").pop()?.toLowerCase() === "csv";
}

export function isSupportedReceiptUpload(file: File) {
  return isImageFile(file) || isCsvFile(file);
}

export const MAX_RECEIPT_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_RECEIPT_CSV_UPLOAD_BYTES = 1 * 1024 * 1024;

export function getReceiptUploadMaxBytes(file: File) {
  return isImageFile(file)
    ? MAX_RECEIPT_IMAGE_UPLOAD_BYTES
    : MAX_RECEIPT_CSV_UPLOAD_BYTES;
}

export function getReceiptUploadSizeLimitError(file: File): string | null {
  if (file.size <= getReceiptUploadMaxBytes(file)) {
    return null;
  }

  return isImageFile(file)
    ? "File exceeds 5MB limit."
    : "File exceeds 1MB limit.";
}

export function isCsvFilename(filename: string) {
  return filename.split(".").pop()?.toLowerCase() === "csv";
}

export function guessReceiptUploadContentType(filename: string) {
  if (isCsvFilename(filename)) {
    return "text/csv";
  }

  return guessImageContentType(filename);
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
