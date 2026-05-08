# IT Helpdesk Escalation Implementation Guide

This document is a comprehensive implementation guide for the IT helpdesk escalation feature. It describes the current architecture, the two dummy tools that need real implementations, and exactly which files to edit when finalizing each feature.

## Architecture Overview

The helpdesk escalation system is split into two independent MCP tools that work together:

1. **`troubleshoot`** — Searches the IT helpdesk knowledge base to find solutions to common issues (currently a no-op placeholder).
2. **`create_escalation_ticket`** — Creates a support ticket when troubleshooting fails or the user explicitly requests escalation (currently returns a mock ticket ID).

Both tools are called from the chat route and the tickets API, and both persist data to the local database for audit/history purposes.

### Current Data Flow

```
User asks IT question
  ↓
Chat route calls AI model with troubleshoot/create_escalation_ticket tools available
  ↓
Model chooses troubleshoot → Searches knowledge base → Returns solutions
  ↓
If no solution helps → Model chooses create_escalation_ticket → Creates ticket
  ↓
Ticket stored in local DB AND sent to MCP server
  ↓
User can view ticket in /tickets dashboard
```

---

## Current Ticket Schema

Tickets conform to this schema in `lib/db/schema.ts`:

```typescript
{
  chatId: uuid,              // Which chat this ticket came from
  userId: uuid,              // Who opened it
  title: string,             // e.g., "Printer Not Working"
  description: string,       // Full issue description
  issue: string,             // Issue category (e.g., "Printer Not Working", "WiFi Connection")
  status: "open" | "in_progress" | "resolved" | "closed",
  priority: "low" | "medium" | "high" | "critical",
  conversationHistory: json, // Full chat messages array
  escalationReason: string,  // Why it was escalated (e.g., "User requested", "Unresolved after 4 attempts")
  createdAt: timestamp,
  updatedAt: timestamp,
  resolvedAt: timestamp | null
}
```

---

## Feature 1: Implementing `troubleshoot`

### Current State

**File:** `app/(chat)/api/chat/route.ts` (lines ~273-280)

Currently a no-op that calls MCP and returns a static response:

```typescript
const troubleshootViaMCP = async (): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "troubleshoot",
      arguments: {},
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error searching troubleshooting database: ${...}`;
  }
};
```

Tool registration in `streamText`:

```typescript
troubleshoot: tool({
  description: "Call the MCP troubleshooting endpoint to verify the backend connection...",
  inputSchema: z.object({}),
  execute: troubleshootViaMCP,
}),
```

### What to Change

When you finalize the troubleshoot feature, update this workflow:

#### 1. **MCP Server Side** (`your-mcp-server` repo)

Add the real troubleshoot tool implementation:

```python
@mcp.tool()
def troubleshoot() -> dict:
    """
    Search the IT helpdesk knowledge base for troubleshooting steps.
    Returns a list of common IT issues and their solutions.
    """
    # TODO: Implement real knowledge base search
    # For now, this returns mock data
    return {
        "status": "ok",
        "solutions": [
            {
                "category": "Printer Issues",
                "steps": ["Check physical connections", "Restart printer", "Update drivers"],
                "resolution_rate": "85%"
            }
        ]
    }
```

#### 2. **Frontend Side** — Update `app/(chat)/api/chat/route.ts`

Change the tool definition to accept query parameters:

```typescript
const troubleshootViaMCP = async ({
  query,
  category,
}: {
  query?: string;
  category?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "troubleshoot",
      arguments: {
        ...(query && { query }),
        ...(category && { category }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error searching troubleshooting database: ${...}`;
  }
};
```

Update the tool schema:

```typescript
troubleshoot: tool({
  description:
    "Search the IT helpdesk knowledge base for solutions to common IT issues. " +
    "Returns troubleshooting steps, known solutions, and resolution rates.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("The IT issue to search for (e.g., 'printer not printing', 'wifi not connecting')"),
    category: z
      .enum(["printer", "network", "hardware", "software", "access", "other"])
      .optional()
      .describe("Issue category to filter results"),
  }),
  execute: troubleshootViaMCP,
}),
```

#### 3. **Update the Model Prompt** — `lib/ai/prompts.ts`

Change the tool description:

```typescript
6. troubleshoot — search the IT helpdesk knowledge base for solutions to common IT issues
```

Add guidance to the prompt on when to use it:

```typescript
When to use troubleshoot:
- User reports an IT issue (printer, network, software, etc.)
- Ask clarifying questions first, then search
- Present solutions in order of likelihood
- If the first 1-2 solutions don't work after user attempts them, suggest escalation
```

---

## Feature 2: Implementing `create_escalation_ticket`

### Current State

**File:** `app/(chat)/api/chat/route.ts` (lines ~624-664)

Currently a no-op that calls MCP and creates a local DB record:

```typescript
create_escalation_ticket: tool({
  description: "Call the MCP escalation endpoint to verify ticket creation connectivity...",
  inputSchema: z.object({
    issue_description: z.string().describe("A brief description of the issue to escalate"),
  }),
  execute: async (input) => escalateViaMCP(input),
}),
```

The underlying `escalateViaMCP` function (lines ~277-292):

```typescript
const escalateViaMCP = async ({
  issue_description,
}: {
  issue_description: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "create_escalation_ticket",
      arguments: { issue_description },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error creating ticket via MCP: ${...}`;
  }
};
```

But the `createEscalatedTicket` handler in the `streamText` function (line ~669 onwards) does real work — it calls `createTicket` to persist to the DB.

### What to Change

#### 1. **MCP Server Side** (your-mcp-server repo)

Implement the real ticket creation endpoint:

```python
from pydantic import BaseModel

class EscalationRequest(BaseModel):
    issue_description: str
    title: str
    priority: str = "medium"
    category: str = "general"
    user_id: str = None
    conversation_context: list = []

@mcp.tool()
def create_escalation_ticket(
    issue_description: str,
    title: str = None,
    priority: str = "medium",
    category: str = "general",
) -> dict:
    """
    Create an IT helpdesk escalation ticket.
    Returns ticket ID and status.
    """
    # TODO: Implement real ticket creation
    # 1. Validate inputs
    # 2. Send to ticketing system (Jira, ServiceNow, etc.)
    # 3. Store ticket metadata for audit
    # 4. Return ticket ID and confirmation
    
    mock_ticket_id = f"TICKET-{int(time.time())}"
    return {
        "ticket_id": mock_ticket_id,
        "status": "created",
        "issue_description": issue_description,
        "title": title or issue_description[:50],
        "priority": priority,
        "estimated_response_time": "2 hours"
    }
```

#### 2. **Frontend Side** — Update `app/(chat)/api/chat/route.ts`

The tool is already correctly structured, but you need to enhance the handler to:
- Extract more context from the conversation
- Build a better title if not provided
- Determine priority based on escalation reason

Replace the `execute` function (lines ~669-693):

```typescript
create_escalation_ticket: tool({
  description:
    "Create a support ticket to escalate an IT issue to the helpdesk team. " +
    "Use this when: (1) The user explicitly asks to escalate, " +
    "(2) Troubleshooting has failed (typically after 3-4 exchanges), " +
    "(3) The issue requires professional IT support.",
  inputSchema: z.object({
    issue_description: z
      .string()
      .describe("Full description of the issue and what was already tried"),
    title: z
      .string()
      .optional()
      .describe("Brief title for the ticket (auto-generated if omitted)"),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .default("medium")
      .describe("Priority level based on urgency"),
    category: z
      .enum(["printer", "network", "hardware", "software", "access", "other"])
      .optional()
      .describe("Issue category to route to correct team"),
  }),
  execute: async (input) => {
    try {
      // Extract context from the conversation
      const lastUserMessage = uiMessages
        .reverse()
        .find((m) => m.role === "user");
      
      const userContext = lastUserMessage?.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join(" ") || "";
      
      // Build ticket details
      const ticketTitle = input.title || 
        input.issue_description.split("\n")[0].slice(0, 50);
      
      // Call MCP to create ticket
      const mcpResponse = await escalateViaMCP({
        issue_description: input.issue_description,
      });
      
      // Persist to local database
      if (session?.user?.id) {
        const ticketData = await createTicket({
          chatId: id,
          userId: session.user.id,
          title: ticketTitle,
          description: input.issue_description,
          issue: input.category || "General IT Issue",
          priority: input.priority as "low" | "medium" | "high" | "critical",
          escalationReason: "User requested escalation or troubleshooting failed",
          conversationHistory: uiMessages,
        });

        return JSON.stringify({
          success: true,
          ticketId: ticketData.id,
          message: `Ticket #${ticketData.id} created successfully. The IT helpdesk team will contact you within 2 hours.`,
          mcpResponse: JSON.parse(mcpResponse),
        }, null, 2);
      }

      return mcpResponse;
    } catch (error) {
      return `Error creating ticket: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  },
}),
```

#### 3. **Update the Tickets Route** — `app/(chat)/api/tickets/route.ts`

The `escalateViaMCP` function here (lines ~33-50) should mirror the chat route's implementation:

```typescript
const escalateViaMCP = async ({
  issue_description,
  title,
  priority,
  category,
}: {
  issue_description: string;
  title?: string;
  priority?: string;
  category?: string;
}): Promise<string> => {
  try {
    const client = await getMcpClient();
    const response = await client.callTool({
      name: "create_escalation_ticket",
      arguments: {
        issue_description,
        ...(title && { title }),
        ...(priority && { priority }),
        ...(category && { category }),
      },
    });
    return JSON.stringify(response, null, 2);
  } catch (error) {
    return `Error creating ticket via MCP: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
};
```

Update the POST endpoint to pass all fields (lines ~150-160):

```typescript
const mcpResponse = await escalateViaMCP({
  issue_description: payload.description,
  title: payload.title,
  priority: payload.priority,
  category: payload.issue,  // issue field is category
});
```

#### 4. **Update the Model Prompt** — `lib/ai/prompts.ts`

Change the tool description:

```typescript
7. create_escalation_ticket — create a support ticket when troubleshooting fails or user requests escalation
```

Add escalation guidance:

```typescript
When to use create_escalation_ticket:
- User explicitly says "escalate", "create a ticket", "I need support", etc.
- After troubleshooting attempts have failed 3+ times
- When the issue is beyond automated troubleshooting scope
- Always provide context about what was already tried
```

---

## Feature 3: Automatic Escalation Flow

To automatically escalate when troubleshooting fails, integrate the `use-escalation-detection` hook.

### Current Implementation Location

**File:** `hooks/use-escalation-detection.ts`

This hook tracks conversation turns and detects escalation keywords. It's referenced in `components/chat/message.tsx` but not actively used for auto-escalation yet.

### How to Implement Auto-Escalation

#### 1. **Update the Hook** — `hooks/use-escalation-detection.ts`

The hook already detects when escalation should happen (lines ~34-80). Enhance it to return a suggestion object:

```typescript
export type EscalationSuggestion = {
  shouldEscalate: boolean;
  reason: "user_requested" | "max_turns_exceeded" | "none";
  suggestedPriority: "low" | "medium" | "high";
  suggestedTitle: string;
};

// In the detectEscalation function, return:
const suggestion: EscalationSuggestion = {
  shouldEscalate,
  reason: hasEscalationKeyword ? "user_requested" : 
          exceedsMaxTurns ? "max_turns_exceeded" : "none",
  suggestedPriority: exceedsMaxTurns ? "high" : "medium",
  suggestedTitle: `${userIssue.slice(0, 50)}...`,
};
```

#### 2. **Update the Chat Component** — `components/chat/message.tsx`

When the model is about to respond, check if escalation is suggested:

```typescript
import { useEscalationDetection } from "@/hooks/use-escalation-detection";

// Inside your component:
const { escalationState, detectEscalation } = useEscalationDetection();

// After each user message:
const escalation = detectEscalation(messages);

// If escalation is suggested, show an inline button or banner:
if (escalation.shouldEscalate && !alreadyEscalated) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
      <p>Would you like to escalate this issue to the helpdesk?</p>
      <button onClick={() => triggerEscalation()}>
        Create Support Ticket
      </button>
    </div>
  );
}
```

#### 3. **Update the Prompt** — `lib/ai/prompts.ts`

Add guidance for when the model should suggest escalation:

```typescript
## When to Suggest Escalation (Without Calling the Tool)

If troubleshooting has been attempted 3+ times and the issue persists:
1. Tell the user: "It looks like this issue needs professional support."
2. Ask: "Would you like me to create a support ticket?"
3. Wait for user confirmation before calling create_escalation_ticket

This ensures the user is in control of escalation, not the model.
```

---

## Testing the Features

### Test Troubleshoot

```bash
# From chat, type:
"I can't print to the network printer. What should I try?"

# Expected: Model calls troubleshoot → returns solutions
# Check: MCP server receives call with correct query
```

### Test Escalation

```bash
# From chat, type:
"My laptop won't connect to WiFi. I've tried rebooting and resetting network settings, but it still doesn't work."

# Expected: After 2-3 exchanges, model detects multiple failures
# Expected: Model suggests or automatically creates escalation ticket
# Check: Ticket appears in /tickets dashboard with correct metadata
```

---

## Files to Update Summary

### When Implementing `troubleshoot`

1. `app/(chat)/api/chat/route.ts` — Update `troubleshootViaMCP` and tool schema (lines ~273-280, ~624-638)
2. `lib/ai/prompts.ts` — Update tool description and add usage guidance
3. Your MCP server — Implement real knowledge base search

### When Implementing `create_escalation_ticket`

1. `app/(chat)/api/chat/route.ts` — Enhance the `execute` handler (lines ~669-693)
2. `app/(chat)/api/tickets/route.ts` — Update `escalateViaMCP` to pass full fields (lines ~33-50, ~150-160)
3. `lib/db/schema.ts` — Already correct, no changes needed (reference only)
4. `lib/db/queries.ts` — Already correct, no changes needed (reference only)
5. `lib/ai/prompts.ts` — Update tool description and escalation guidance
6. Your MCP server — Implement real ticket creation in your ticketing system

### For Auto-Escalation Flow

1. `hooks/use-escalation-detection.ts` — Enhance to return escalation suggestions
2. `components/chat/message.tsx` — Add escalation UI banner when suggested
3. `lib/ai/prompts.ts` — Add guidance for model-assisted escalation

---

## Database & Environment

### Current Local Database

- Already initialized with `ticket` table in `lib/db/schema.ts`
- Query helpers in `lib/db/queries.ts` handle all CRUD operations
- No migrations needed unless you change the schema

### Environment Configuration

Set in `.env.local`:

```
MCP_SERVER_URL=http://127.0.0.1:8001/mcp  # During development
MCP_SERVER_URL=https://your-mcp-endpoint.com/mcp  # In production
```

---

## Common Patterns

### Pattern 1: Extract Issue Category from User Message

```typescript
function detectIssueCategory(message: string): string {
  const categories: Record<string, string[]> = {
    printer: ["printer", "print", "printing"],
    network: ["wifi", "internet", "network", "connection", "ethernet"],
    hardware: ["monitor", "mouse", "keyboard", "hardware", "laptop", "desktop"],
    software: ["app", "software", "crash", "error", "windows", "mac"],
    access: ["password", "login", "access", "permission", "cannot access"],
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(k => message.toLowerCase().includes(k))) {
      return category;
    }
  }
  return "other";
}
```

### Pattern 2: Build Ticket Title from Conversation

```typescript
function generateTicketTitle(messages: ChatMessage[], maxLength: number = 60): string {
  const firstUserMsg = messages.find(m => m.role === "user");
  if (!firstUserMsg) return "Untitled Issue";
  
  const text = firstUserMsg.parts
    ?.filter(p => p.type === "text")
    .map(p => p.text)
    .join(" ")
    .slice(0, maxLength) || "";
    
  return text.endsWith(".") ? text : text + "...";
}
```

---

## Notes

- The ticket endpoint requires authentication; all operations are user-scoped.
- Tickets are stored locally for audit/history and also sent to the MCP server for real-time support.
- The escalation detection hook tracks conversation turns independently of the model; tune `MAX_TURNS_BEFORE_ESCALATION` in `hooks/use-escalation-detection.ts` based on support metrics.
- If the MCP server is unavailable, the chat will still work, but escalation won't route to the external system (local DB persistence remains intact).