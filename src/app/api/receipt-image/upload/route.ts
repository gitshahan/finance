import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getReceiptBlobPathPrefix } from "@/lib/receipt-blob";
import {
  getReceiptUploadSizeLimitError,
  guessReceiptUploadContentType,
  isSupportedReceiptUpload,
} from "@/lib/receipt-image-url";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return new Response(
        "Blob storage is not configured (missing BLOB_READ_WRITE_TOKEN).",
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return new Response("No file provided.", { status: 400 });
    }

    if (!isSupportedReceiptUpload(file)) {
      return new Response(
        "Only image files (JPEG, PNG, WebP, etc.) and CSV files are supported.",
        { status: 400 },
      );
    }

    const sizeLimitError = getReceiptUploadSizeLimitError(file);
    if (sizeLimitError) {
      return new Response(sizeLimitError, { status: 400 });
    }

    const contentType = file.type || guessReceiptUploadContentType(file.name);
    const fileExtension = file.name.split(".").pop() || "bin";
    const blobPath = `${getReceiptBlobPathPrefix(userId)}${crypto.randomUUID()}.${fileExtension}`;

    const uploaded = await put(blobPath, file, {
      access: "private",
      contentType,
      addRandomSuffix: false,
    });

    return Response.json({
      url: uploaded.url,
      pathname: uploaded.pathname,
    });
  } catch (error) {
    console.error("Receipt upload failed:", error);
    return new Response("Unable to upload file right now.", { status: 500 });
  }
}
