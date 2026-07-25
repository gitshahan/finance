const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
  "heif",
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

export function getFileExtension(filename: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension || extension === filename.toLowerCase()) {
    return null;
  }

  // Reject path separators / traversal in the extension segment.
  if (/[^a-z0-9]/.test(extension)) {
    return null;
  }

  return extension;
}

/** Allowlisted extension for blob storage keys, or null if unsupported. */
export function getAllowedUploadExtension(filename: string): string | null {
  const extension = getFileExtension(filename);
  if (!extension) {
    return null;
  }

  if (extension === "csv") {
    return "csv";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  return null;
}

export function guessImageContentType(filename: string) {
  const extension = getFileExtension(filename);

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
  const extension = getFileExtension(file.name);
  if (extension && IMAGE_EXTENSIONS.has(extension)) {
    return true;
  }

  // Never trust image/svg+xml or other non-allowlisted image MIME types.
  return ALLOWED_IMAGE_MIME_TYPES.has(file.type);
}

export function isCsvFile(file: File) {
  if (ALLOWED_CSV_MIME_TYPES.has(file.type)) {
    return true;
  }

  return getFileExtension(file.name) === "csv";
}

export function isSupportedReceiptUpload(file: File) {
  return getAllowedUploadExtension(file.name) !== null && (isImageFile(file) || isCsvFile(file));
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
  return getFileExtension(filename) === "csv";
}

export function guessReceiptUploadContentType(filename: string) {
  if (isCsvFilename(filename)) {
    return "text/csv";
  }

  return guessImageContentType(filename);
}

/**
 * Content-Type derived only from allowlisted extension — never from client MIME.
 */
export function getForcedUploadContentType(filename: string): string | null {
  const extension = getAllowedUploadExtension(filename);
  if (!extension) {
    return null;
  }

  if (extension === "csv") {
    return "text/csv";
  }

  return guessImageContentType(`.${extension}`);
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
