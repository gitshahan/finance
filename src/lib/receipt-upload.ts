import type { FileUIPart } from "ai";
import { guessImageContentType } from "@/lib/receipt-image-url";

export function uploadReceiptImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileUIPart> {
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
        reject(new Error(message || "Could not upload receipt image."));
        return;
      }

      try {
        const payload = JSON.parse(xhr.responseText) as { url?: string };

        if (!payload.url) {
          reject(new Error("Receipt image upload did not return a URL."));
          return;
        }

        resolve({
          type: "file",
          mediaType: file.type || guessImageContentType(file.name),
          filename: file.name,
          url: payload.url,
        });
      } catch {
        reject(new Error("Could not parse receipt image upload response."));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Unable to upload the receipt image right now."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Receipt image upload was cancelled."));
    });

    xhr.open("POST", "/api/receipt-image/upload");
    xhr.send(formData);
  });
}
