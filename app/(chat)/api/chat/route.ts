import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  createTicket,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:8001/mcp";

let mcpClient: Client | null = null;

async function getMcpClient(): Promise<Client> {
  if (!mcpClient) {
    const transport = new StreamableHTTPClientTransport(
      new URL(MCP_SERVER_URL)
    );
    mcpClient = new Client({
      name: "nextjs-chatbot",
      version: "1.0.0",
    });
    await mcpClient.connect(transport);
  }
  return mcpClient;
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

// RAG tools that call the MCP server tools directly
// Phase 1
// const searchRmit = async ({
//   question,
//   top_k = 5,
// }: {
//   question: string;
//   top_k?: number;
// }): Promise<string> => {
//   try {
//     const client = await getMcpClient();
//     const response = await client.callTool({
//       name: "search_rmit",
//       arguments: {
//         question,
//         top_k,
//       },
//     });
//     return JSON.stringify(response, null, 2);
//   } catch (error) {
//     return `Error searching RAG: ${error instanceof Error ? error.message : String(error)}`;
//   }
// };

// // Phase 1
// const searchRmitFiltered = async ({
//   question,
//   req_type,
//   top_k = 5,
// }: {
//   question: string;
//   req_type: "S" | "G";
//   top_k?: number;
// }): Promise<string> => {
//   try {
//     const client = await getMcpClient();
//     const response = await client.callTool({
//       name: "search_rmit_filtered",
//       arguments: {
//         question,
//         req_type,
//         top_k,
//       },
//     });
//     return JSON.stringify(response, null, 2);
//   } catch (error) {
//     return `Error searching RAG: ${error instanceof Error ? error.message : String(error)}`;
//   }
// };

// Phase 2
const searchDocuments = async ({
  question,
  top_k = 5,
  req_type,
  doc_type,
  use_case_tag,
  chunk_type,
}: {
  question: string;
  top_k?: number;
  req_type?: string;
  doc_type?: string;
  use_case_tag?: string;
  chunk_type?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "search_documents",
      arguments: {
        question,
        top_k,
        ...(req_type     && { req_type }),
        ...(doc_type     && { doc_type }),
        ...(use_case_tag && { use_case_tag }),
        ...(chunk_type   && { chunk_type }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error searching documents: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const searchDocumentsHybrid = async ({
  question,
  top_k = 5,
  req_type,
  doc_type,
  use_case_tag,
  chunk_type,
}: {
  question: string;
  top_k?: number;
  req_type?: string;
  doc_type?: string;
  use_case_tag?: string;
  chunk_type?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "search_documents_hybrid",
      arguments: {
        question,
        top_k,
        ...(req_type     && { req_type }),
        ...(doc_type     && { doc_type }),
        ...(use_case_tag && { use_case_tag }),
        ...(chunk_type   && { chunk_type }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error in hybrid search: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const getChunk = async ({
  paragraph_id,
  doc_type,
}: {
  paragraph_id: string;
  doc_type?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "get_chunk",
      arguments: {
        paragraph_id,
        ...(doc_type && { doc_type }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error fetching chunk: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const getDocuments = async (): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "get_documents",
      arguments: {},
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error fetching documents: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const getSections = async ({
  doc_code,
}: {
  doc_code?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "get_sections",
      arguments: {
        ...(doc_code && { doc_code }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error fetching sections: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const troubleshootViaMCP = async (): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "troubleshoot",
      arguments: {},
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error searching troubleshooting database: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
};

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

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(chatModel),
          system: systemPrompt({ requestHints, supportsTools }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: [
            "searchDocuments",
            "searchDocumentsHybrid",
            "getChunk",
            "getDocuments",
            "getSections",
            "troubleshoot",
            "create_escalation_ticket",
          ],
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          tools: {
            getWeather,
            createDocument: createDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            editDocument: editDocument({ dataStream, session }),
            updateDocument: updateDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
              modelId: chatModel,
            }),
            // phase 1 RAG tools
            // searchRmit: tool({
            //   description: "Search RMiT document semantically using a natural language question.",
            //   inputSchema: z.object({
            //     question: z
            //       .string()
            //       .describe("The question to search for in the RMiT document"),
            //     top_k: z
            //       .number()
            //       .describe("Number of results to return (default: 5)")
            //       .default(5),
            //   }),
            //   execute: searchRmit,
            // }),
            // searchRmitFiltered: tool({
            //   description: "Search RMiT document filtered by requirement type (S for mandatory, G for guidance).",
            //   inputSchema: z.object({
            //     question: z
            //       .string()
            //       .describe("The question to search for"),
            //     req_type: z
            //       .enum(["S", "G"])
            //       .describe("Requirement type: 'S' for mandatory, 'G' for guidance"),
            //     top_k: z
            //       .number()
            //       .describe("Number of results to return (default: 5)")
            //       .default(5),
            //   }),
            //   execute: searchRmitFiltered,
            // }),
            
            // phase 2 RAG tools with enhanced filtering and hybrid search start ---
            searchDocuments: tool({
            description:
              "Semantic search over BNM regulatory documents using natural language. " +
              "Best for conceptual questions about DR, BCM, compliance, and operational risk. " +
              "Apply filters to scope results: " +
              "doc_type ('rmit','bcm','op_risk'), " +
              "use_case_tag ('dr','compliance'), " +
              "req_type ('S' mandatory, 'G' guidance), " +
              "chunk_type ('policy','notification_rule','scenario').",
            inputSchema: z.object({
              question: z
                .string()
                .describe("Natural language question to search for"),
              top_k: z
                .number()
                .default(5)
                .describe("Number of results to return (default 5)"),
              req_type: z
                .enum(["S", "G"])
                .optional()
                .describe("S = mandatory standard, G = guidance"),
              doc_type: z
                .enum(["rmit", "bcm", "op_risk", "dr_handbook"])
                .optional()
                .describe("Scope to one document"),
              use_case_tag: z
                .enum(["dr", "compliance"])
                .optional()
                .describe("dr = disaster recovery, compliance = regulatory"),
              chunk_type: z
                .enum(["policy", "notification_rule", "scenario", "procedure", "reference", "overview"])
                .optional()
                .describe("Type of chunk to search"),
            }),
            execute: searchDocuments,
          }),

          searchDocumentsHybrid: tool({
            description:
              "Hybrid search combining semantic + BM25 keyword matching. " +
              "Use ONLY when query contains exact regulatory codes or acronyms: " +
              "paragraph IDs (S 10.32, G 9.4), LoD codes (LOD-3, LOD-CYBER), " +
              "or acronyms (RTO, MTD, BCP, DRP, CMT). " +
              "For general natural language questions use searchDocuments instead.",
            inputSchema: z.object({
              question: z
                .string()
                .describe("Query containing exact codes or regulatory terms"),
              top_k: z
                .number()
                .default(5)
                .describe("Number of results to return (default 5)"),
              req_type: z
                .enum(["S", "G"])
                .optional()
                .describe("S = mandatory standard, G = guidance"),
              doc_type: z
                .enum(["rmit", "bcm", "op_risk", "dr_handbook"])
                .optional()
                .describe("Scope to one document"),
              use_case_tag: z
                .enum(["dr", "compliance"])
                .optional()
                .describe("dr = disaster recovery, compliance = regulatory"),
              chunk_type: z
                .enum(["policy", "notification_rule", "scenario", "procedure", "reference", "overview"])
                .optional()
                .describe("Type of chunk to search"),
            }),
            execute: searchDocumentsHybrid,
          }),

          getChunk: tool({
            description:
              "Fetch the full text of a specific paragraph by its exact ID. " +
              "Use when user references a specific paragraph e.g. 'what does S 10.32 say' " +
              "or 'show me LOD-3'. Faster and more precise than search for exact lookups.",
            inputSchema: z.object({
              paragraph_id: z
                .string()
                .describe(
                  "Exact paragraph ID e.g. 'S 10.32', 'G 9.4', 'LOD-3', 'BCM-SCENARIO-1'"
                ),
              doc_type: z
                .enum(["rmit", "bcm", "op_risk", "dr_handbook"])
                .optional()
                .describe("Scope to one document to avoid cross-doc conflicts"),
            }),
            execute: getChunk,
          }),

          getDocuments: tool({
            description:
              "List all ingested BNM documents with metadata and chunk counts. " +
              "Call this when user asks what documents are available, " +
              "or when you are unsure which document covers a topic.",
            inputSchema: z.object({}),
            execute: getDocuments,
          }),

          getSections: tool({
            description:
              "List all sections within a document or across all documents. " +
              "Useful for helping user navigate available content " +
              "or when a broad topic query needs to be scoped to a specific section.",
            inputSchema: z.object({
              doc_code: z
                .enum(["rmit_nov25", "bcm_dec22", "op_risk_may16", "dr_handbook_v1"])
                .optional()
                .describe(
                  "Filter by document: rmit_nov25, bcm_dec22, op_risk_may16. " +
                  "Omit to list all sections across all documents."
                ),
            }),
            execute: getSections,
          }), // phase 2 RAG tools with enhanced filtering and hybrid search end ---

          // IT Helpdesk escalation tools
          troubleshoot: tool({
            description:
              "Call the MCP troubleshooting endpoint to verify the backend connection. " +
              "Use this for a quick test of the helpdesk troubleshooting integration.",
            inputSchema: z.object({}),
            execute: troubleshootViaMCP,
          }),

          create_escalation_ticket: tool({
            description:
              "Call the MCP escalation endpoint to verify ticket creation connectivity. " +
              "Use this for a quick test of the helpdesk escalation integration.",
            inputSchema: z.object({
              issue_description: z
                .string()
                .describe("A brief description of the issue to escalate"),
            }),
            execute: async (input) => escalateViaMCP(input),
          }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}