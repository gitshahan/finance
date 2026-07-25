import type { FileUIPart } from "ai";
import {
  getForcedUploadContentType,
  getReceiptUploadSizeLimitError,
  isSupportedReceiptUpload,
} from "@/lib/receipt-image-url";

export function uploadReceiptImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileUIPart> {
  if (!isSupportedReceiptUpload(file)) {
    return Promise.reject(
      new Error(
        "Only image files (JPEG, PNG, WebP, etc.) and CSV files are supported.",
      ),
    );
  }

  const sizeLimitError = getReceiptUploadSizeLimitError(file);
  if (sizeLimitError) {
    return Promise.reject(new Error(sizeLimitError));
  }

  const mediaType = getForcedUploadContentType(file.name);
  if (!mediaType) {
    return Promise.reject(
      new Error(
        "Only image files (JPEG, PNG, WebP, etc.) and CSV files are supported.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = xhr.responseText.trim();
        reject(new Error(message || "Could not upload receipt file."));
        return;
      }

      try {
        const payload = JSON.parse(xhr.responseText) as { url?: string };

        if (!payload.url) {
          reject(new Error("Receipt upload did not return a URL."));
          return;
        }

        resolve({
          type: "file",
          mediaType,
          filename: file.name,
          url: payload.url,
        });
      } catch {
        reject(new Error("Could not parse receipt upload response."));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Unable to upload the receipt file right now."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Receipt upload was cancelled."));
    });

    xhr.open("POST", "/api/receipt-image/upload");
    xhr.send(formData);
  });
}
