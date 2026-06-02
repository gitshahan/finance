import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getReceiptBlobPathPrefix } from "@/lib/receipt-blob";
import { guessImageContentType, isImageFile } from "@/lib/receipt-image-url";

export const maxDuration = 30;

const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;

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
      return new Response("No image file provided.", { status: 400 });
    }

    if (!isImageFile(file)) {
      return new Response("Only image files are supported.", { status: 400 });
    }

    if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
      return new Response("Image exceeds 8MB limit.", { status: 400 });
    }

    const contentType = file.type || guessImageContentType(file.name);
    const fileExtension = file.name.split(".").pop() || "jpg";
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
    console.error("Receipt image upload failed:", error);
    return new Response("Unable to upload image right now.", { status: 500 });
  }
}
