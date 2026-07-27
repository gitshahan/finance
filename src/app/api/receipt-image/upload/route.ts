import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getReceiptBlobPathPrefix } from "@/lib/receipt-blob";
import {
  getAllowedUploadExtension,
  getForcedUploadContentType,
  getReceiptUploadSizeLimitError,
  isSupportedReceiptUpload,
} from "@/lib/receipt-image-url";
import { resolveReadyOpenAiApiKey } from "@/lib/llm-unlock-session";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const ready = await resolveReadyOpenAiApiKey(userId);
    if (!ready.ok) {
      return new Response(
        ready.reason === "locked"
          ? "Unlock your API key before uploading."
          : "Add your OpenAI API key before uploading.",
        { status: 403 },
      );
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
      return new Response("Only CSV files under 1MB are supported.", {
        status: 400,
      });
    }

    const sizeLimitError = getReceiptUploadSizeLimitError(file);
    if (sizeLimitError) {
      return new Response(sizeLimitError, { status: 400 });
    }

    const fileExtension = getAllowedUploadExtension(file.name);
    const contentType = getForcedUploadContentType(file.name);

    if (!fileExtension || !contentType) {
      return new Response("Only CSV files under 1MB are supported.", {
        status: 400,
      });
    }

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
