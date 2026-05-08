import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createTicket,
  getChatById,
  getTicketsByChatId,
  getTicketsByUserId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:8001/mcp";

let mcpClient: import("@modelcontextprotocol/sdk/client/index.js").Client | null = null;

async function getMcpClient() {
  if (!mcpClient) {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import(
      "@modelcontextprotocol/sdk/client/streamableHttp.js"
    );

    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    mcpClient = new Client({
      name: "nextjs-chatbot-helpdesk",
      version: "1.0.0",
    });
    await mcpClient.connect(transport);
  }

  return mcpClient;
}

const escalateViaMCP = async ({
  issue_description,
}: {
  issue_description: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "create_escalation_ticket",
      arguments: {
        issue_description,
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error creating ticket via MCP: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
};

const ticketCreateSchema = z.object({
  chatId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  issue: z.string().min(1).max(200),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  escalationReason: z.string().min(1).max(500).optional(),
  conversationHistory: z.array(z.any()).min(1),
});

const ticketsQuerySchema = z.object({
  chatId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = ticketsQuerySchema.safeParse({
    chatId: searchParams.get("chatId") ?? undefined,
  });

  if (!parsedQuery.success) {
    return new ChatbotError(
      "bad_request:api",
      "If provided, chatId must be a valid UUID."
    ).toResponse();
  }

  if (parsedQuery.data.chatId) {
    const chat = await getChatById({ id: parsedQuery.data.chatId });

    if (!chat) {
      return new ChatbotError("not_found:chat").toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    const tickets = await getTicketsByChatId({ chatId: parsedQuery.data.chatId });
    return Response.json({ tickets }, { status: 200 });
  }

  const tickets = await getTicketsByUserId({ userId: session.user.id });
  return Response.json({ tickets }, { status: 200 });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let payload: z.infer<typeof ticketCreateSchema>;

  try {
    payload = ticketCreateSchema.parse(await request.json());
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Parameters chatId, title, description, issue, and conversationHistory are required."
    ).toResponse();
  }

  const chat = await getChatById({ id: payload.chatId });

  if (!chat) {
    return new ChatbotError("not_found:chat").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const mcpResponse = await escalateViaMCP({
    issue_description: payload.description,
  });

  const ticket = await createTicket({
    chatId: payload.chatId,
    userId: session.user.id,
    title: payload.title,
    description: payload.description,
    issue: payload.issue,
    escalationReason: payload.escalationReason,
    conversationHistory: payload.conversationHistory,
    priority: payload.priority,
  });

  return Response.json(
    {
      ticket,
      mcpResponse,
    },
    { status: 201 }
  );
}