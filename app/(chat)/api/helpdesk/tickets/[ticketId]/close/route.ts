import { ChatbotError } from "@/lib/errors";

const BACKEND_SERVER_URL = process.env.BACKEND_SERVER_URL;

function getBackendTicketActionUrl(ticketId: string, action: "resolve" | "close") {
  if (!BACKEND_SERVER_URL) {
    throw new Error("Missing BACKEND_SERVER_URL environment variable.");
  }

  return new URL(`tickets/${ticketId}/${action}`, BACKEND_SERVER_URL).toString();
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;

    const response = await fetch(getBackendTicketActionUrl(ticketId, "close"), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
      },
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return new ChatbotError(
      "bad_request:api",
      error instanceof Error ? error.message : "Unable to close ticket."
    ).toResponse();
  }
}