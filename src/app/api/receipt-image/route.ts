import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { userOwnsReceiptBlobUrl } from "@/lib/receipt-blob";
import { guessImageContentType } from "@/lib/receipt-image-url";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const blobUrl = new URL(request.url).searchParams.get("url");

    if (!blobUrl || !userOwnsReceiptBlobUrl(blobUrl, userId)) {
      return new Response("Not found", { status: 404 });
    }

    const result = await get(blobUrl, { access: "private" });

    if (!result || result.statusCode !== 200 || !result.stream) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type":
          result.blob.contentType ?? guessImageContentType(blobUrl),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Receipt image fetch failed:", error);
    return new Response("Unable to load receipt image.", { status: 500 });
  }
}
