import { ChatbotError } from "@/lib/errors";

const BACKEND_SERVER_URL = process.env.BACKEND_SERVER_URL;

function getBackendTicketsUrl() {
  if (!BACKEND_SERVER_URL) {
    throw new Error("Missing BACKEND_SERVER_URL environment variable.");
  }

  return new URL("tickets", BACKEND_SERVER_URL).toString();
}

export async function GET() {
  try {
    const response = await fetch(getBackendTicketsUrl(), {
      method: "GET",
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
      error instanceof Error ? error.message : "Unable to load tickets."
    ).toResponse();
  }
}