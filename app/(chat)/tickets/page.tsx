"use client";

import type { Ticket } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Clock3,
  ShieldAlert,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type TicketConversationEntry = {
  role?: string;
  text?: string;
};

type DashboardTicket = Omit<Ticket, "conversationHistory"> & {
  conversationHistory: TicketConversationEntry[];
  requesterName: string;
};

const getTicketsEndpoint = () => "/api/helpdesk/tickets";

const getTicketActionEndpoint = (ticketId: string, action: "resolve" | "close") =>
  `/api/helpdesk/tickets/${ticketId}/${action}`;

const toDate = (value: unknown, fallback = new Date()) => {
  if (!value) return fallback;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const normalizeConversation = (history: unknown): TicketConversationEntry[] => {
  if (!Array.isArray(history)) return [];

  return history.map((entry) => {
    if (typeof entry === "object" && entry !== null) {
      const candidate = entry as { role?: unknown; text?: unknown; content?: unknown };

      return {
        role: typeof candidate.role === "string" ? candidate.role : "message",
        text:
          typeof candidate.text === "string"
            ? candidate.text
            : typeof candidate.content === "string"
              ? candidate.content
              : JSON.stringify(entry),
      };
    }

    return { role: "message", text: String(entry) };
  });
};

const normalizeTicket = (raw: unknown): DashboardTicket | null => {
  if (!raw || typeof raw !== "object") return null;

  const ticket = raw as Record<string, unknown>;

  if (
    typeof ticket.id !== "string" ||
    typeof ticket.chatId !== "string" ||
    typeof ticket.userId !== "string" ||
    typeof ticket.title !== "string" ||
    typeof ticket.description !== "string" ||
    typeof ticket.issue !== "string"
  ) {
    return null;
  }

  const status =
    ticket.status === "open" ||
    ticket.status === "in_progress" ||
    ticket.status === "resolved" ||
    ticket.status === "closed"
      ? ticket.status
      : "open";

  return {
    id: ticket.id,
    chatId: ticket.chatId,
    userId: ticket.userId,
    title: ticket.title,
    description: ticket.description,
    issue: ticket.issue,
    status,
    conversationHistory: normalizeConversation(ticket.conversationHistory),
    escalationReason:
      typeof ticket.escalationReason === "string" ? ticket.escalationReason : null,
    createdAt: toDate(ticket.createdAt),
    updatedAt: toDate(ticket.updatedAt),
    resolvedAt: ticket.resolvedAt ? toDate(ticket.resolvedAt) : null,
    requesterName:
      typeof ticket.requesterName === "string"
        ? ticket.requesterName
        : typeof ticket.requester_name === "string"
          ? ticket.requester_name
          : "Unknown requester",
  };
};

const statusStyles: Record<Ticket["status"], string> = {
  open: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  in_progress: "bg-sky-500/15 text-sky-500 border-sky-500/20",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  closed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<DashboardTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadTickets = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const response = await fetch(getTicketsEndpoint(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      });

      if (!response.ok) {
        let details = "";

        try {
          const errorPayload = await response.json();
          if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) {
            details = `: ${String(errorPayload.message)}`;
          }
        } catch {
          // Ignore JSON parsing errors for non-JSON responses.
        }

        throw new Error(`Failed to load tickets (${response.status})${details}`);
      }

      const payload = (await response.json()) as { tickets?: unknown[] } | unknown[];
      const rawTickets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.tickets)
          ? payload.tickets
          : [];

      const normalized = rawTickets
        .map((ticket) => normalizeTicket(ticket))
        .filter((ticket): ticket is DashboardTicket => ticket !== null);

      setTickets(normalized);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") {
        setFetchError(
          error instanceof Error ? error.message : "Unable to fetch tickets from the server."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    void loadTickets(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const openTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "open"),
    [tickets]
  );
  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "in_progress"),
    [tickets]
  );
  const resolvedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed"),
    [tickets]
  );

  const updateSelectedTicket = async (action: "resolve" | "close") => {
    if (!selectedTicket || updatingTicketId) return;

    try {
      setUpdatingTicketId(selectedTicket.id);
      setActionError(null);

      const response = await fetch(getTicketActionEndpoint(selectedTicket.id, action), {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let details = "";

        try {
          const errorPayload = await response.json();
          if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) {
            details = `: ${String(errorPayload.message)}`;
          }
        } catch {
          // Ignore JSON parsing errors for non-JSON responses.
        }

        throw new Error(`Failed to ${action} ticket (${response.status})${details}`);
      }

      await loadTickets();
      setSelectedTicketId(selectedTicket.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Unable to ${action} ticket.`);
    } finally {
      setUpdatingTicketId(null);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.18),transparent_25%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_35%)]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-6 md:py-8">
        <section className="rounded-3xl border border-border/60 bg-card/85 p-6 shadow-(--shadow-float) backdrop-blur-sm md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" />
                Helpdesk ticket dashboard
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Ticket overview
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                  Tickets are loaded from the helpdesk service. Click any ticket to inspect the full record and update its status locally.
                </p>
              </div>
            </div>
          </div>

          {fetchError ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {fetchError}
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
              {actionError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard icon={<ClipboardList className="size-4" />} label="Open tickets" value={openTickets.length} />
            <MetricCard icon={<Clock3 className="size-4" />} label="In progress" value={activeTickets.length} />
            <MetricCard icon={<ShieldAlert className="size-4" />} label="Closed tickets" value={resolvedTickets.length} />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/90 shadow-(--shadow-float)">
          <div className="border-b border-border/60 px-5 py-4 md:px-6">
            <h2 className="text-lg font-semibold">All tickets</h2>
            <p className="text-sm text-muted-foreground">
              This list is driven by the ticket schema in <span className="font-medium text-foreground">lib/db/schema.ts</span>.
            </p>
          </div>

          <div className="divide-y divide-border/60">
            {isLoading ? (
              <div className="px-5 py-10 text-sm text-muted-foreground md:px-6">
                Loading tickets...
              </div>
            ) : tickets.length === 0 ? (
              <div className="px-5 py-10 text-sm text-muted-foreground md:px-6">
                No tickets found.
              </div>
            ) : (
              tickets.map((ticket) => (
              <button
                key={ticket.id}
                className="grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/30 md:grid-cols-[1.4fr_0.8fr_0.8fr] md:px-6"
                onClick={() => setSelectedTicketId(ticket.id)}
                type="button"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {ticket.id.slice(0, 8)}
                    </span>
                    <Badge className={statusStyles[ticket.status]} variant="outline">
                      {ticket.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <h3 className="text-base font-semibold md:text-lg">{ticket.title}</h3>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {ticket.description}
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Issue
                  </p>
                  <p className="font-medium">{ticket.issue}</p>
                  <p className="pt-2 text-muted-foreground">Requester: {ticket.requesterName}</p>
                </div>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <p className="text-xs uppercase tracking-[0.18em]">Updated</p>
                  <p className="font-medium text-foreground">{formatDate(ticket.updatedAt)}</p>
                  <p className="pt-2">Chat ID: {ticket.chatId.slice(0, 8)}…</p>
                </div>
              </button>
              ))
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={selectedTicket !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTicketId(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border border-border/70 bg-card/95 shadow-xl sm:max-w-4xl">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusStyles[selectedTicket.status]} variant="outline">
                    {selectedTicket.status.replace("_", " ")}
                  </Badge>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Ticket {selectedTicket.id.slice(0, 8)}
                  </span>
                </div>
                <DialogTitle className="text-xl md:text-2xl">{selectedTicket.title}</DialogTitle>
                <DialogDescription className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {selectedTicket.issue} · {selectedTicket.requesterName} · Updated {formatDate(selectedTicket.updatedAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 text-sm md:grid-cols-2">
                <InfoBlock label="Status" value={selectedTicket.status.replace("_", " ")} />
                <InfoBlock label="Requester" value={selectedTicket.requesterName} />
                <InfoBlock label="Chat ID" value={selectedTicket.chatId} />
                <InfoBlock label="User ID" value={selectedTicket.userId} />
                <InfoBlock label="Created" value={formatDate(selectedTicket.createdAt)} />
                <InfoBlock label="Updated" value={formatDate(selectedTicket.updatedAt)} />
                <InfoBlock
                  label="Resolved"
                  value={selectedTicket.resolvedAt ? formatDate(selectedTicket.resolvedAt) : "Not resolved"}
                />
              </div>

              <div className="space-y-3">
                <SectionHeading>Conversation history</SectionHeading>
                <div className="space-y-2 rounded-2xl border border-border/60 bg-slate-950/3 p-4 text-sm dark:bg-white/3">
                  {selectedTicket.conversationHistory.map((entry, index) => (
                    <div key={`${selectedTicket.id}-conversation-${index}`} className="rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">
                        {typeof entry === "object" && entry !== null && "role" in entry
                          ? String((entry as { role?: string }).role)
                          : "message"}
                      </p>
                      <p className="mt-1 leading-6 text-foreground">
                        {typeof entry === "object" && entry !== null && "text" in entry
                          ? String((entry as { text?: string }).text)
                          : JSON.stringify(entry)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <SectionHeading>Description</SectionHeading>
                <p className="rounded-2xl border border-border/60 bg-amber-500/6 p-4 text-sm leading-6 text-foreground dark:bg-amber-400/8">
                  {selectedTicket.description}
                </p>
              </div>

              <div className="space-y-3">
                <SectionHeading>Escalation reason</SectionHeading>
                <p className="rounded-2xl border border-border/60 bg-emerald-500/6 p-4 text-sm leading-6 text-foreground dark:bg-emerald-400/8">
                  {selectedTicket.escalationReason ?? "No escalation reason recorded."}
                </p>
              </div>

              <DialogFooter className="gap-3">
                <Button
                  className="rounded-full"
                  disabled={updatingTicketId === selectedTicket.id}
                  onClick={() => void updateSelectedTicket("resolve")}
                  variant="default"
                >
                  <CircleCheck className="size-4" />
                  {updatingTicketId === selectedTicket.id ? "Updating..." : "Resolve ticket"}
                </Button>
                <Button
                  className="rounded-full"
                  disabled={updatingTicketId === selectedTicket.id}
                  onClick={() => void updateSelectedTicket("close")}
                  variant="outline"
                >
                  <CircleX className="size-4" />
                  {updatingTicketId === selectedTicket.id ? "Updating..." : "Close ticket"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-3 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 wrap-break-word text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{children}</h3>;
}

function formatDate(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}