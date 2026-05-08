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
import { useMemo, useState, type ReactNode } from "react";

type TicketConversationEntry = {
  role?: string;
  text?: string;
};

type DashboardTicket = Omit<Ticket, "conversationHistory"> & {
  conversationHistory: TicketConversationEntry[];
  requesterName: string;
};

const mockTickets: DashboardTicket[] = [
  {
    id: "7b14b4b7-3f56-4cf7-8b89-46cc0a7e6a11",
    chatId: "52f52d73-4c4b-4d5b-8f3f-2f776aa4c777",
    userId: "a51b861a-bd66-4fbf-88e4-6e2d7f1edaf3",
    title: "Printer on Level 4 not printing",
    description:
      "User confirmed the printer is online but jobs are stuck in the queue. Restarted the print spooler and checked the cable with no change.",
    issue: "Printer Not Working",
    status: "open",
    priority: "high",
    conversationHistory: [
      { role: "user", text: "My printer stopped working this morning." },
      { role: "assistant", text: "Try checking the queue and restarting the printer." },
    ],
    escalationReason: "User asked for escalation after trying troubleshooting steps.",
    createdAt: new Date("2026-05-08T02:15:00.000Z"),
    updatedAt: new Date("2026-05-08T02:27:00.000Z"),
    resolvedAt: null,
    requesterName: "Alicia Tan",
  },
  {
    id: "f0d0e8c5-1b96-4ee2-9d87-09d4f93dd229",
    chatId: "03ad2a8d-7cd4-49e2-a72a-f47a1a7281f4",
    userId: "28ed4b5d-8e83-4d4a-8f1e-f4d5f2d872e0",
    title: "External monitor flickering at docking station",
    description:
      "Cable reseated and display driver checked. Team is testing a replacement dock before replacing the monitor itself.",
    issue: "Monitor Display Issue",
    status: "in_progress",
    priority: "medium",
    conversationHistory: [
      { role: "user", text: "My second monitor keeps flickering." },
      { role: "assistant", text: "Please reseat the cable and confirm the display adapter." },
    ],
    escalationReason: "Still unresolved after troubleshooting.",
    createdAt: new Date("2026-05-08T01:40:00.000Z"),
    updatedAt: new Date("2026-05-08T02:05:00.000Z"),
    resolvedAt: null,
    requesterName: "Daniel Lim",
  },
  {
    id: "e2f45c49-3f2e-4f8a-8bb0-1d6e6df5f9f8",
    chatId: "af10f20a-1261-4b9a-b1b6-3aa7d6a21339",
    userId: "bc5e2c90-32ae-4dd0-a0c2-9c761eb9b2ff",
    title: "VPN disconnecting after 5 minutes",
    description:
      "Expired profile token caused repeated disconnects. Profile was refreshed and the connection re-tested successfully.",
    issue: "Connectivity Issue",
    status: "resolved",
    priority: "critical",
    conversationHistory: [
      { role: "user", text: "VPN drops every few minutes." },
      { role: "assistant", text: "Let's check the profile token and connection logs." },
    ],
    escalationReason: "Resolved after refresh and verification.",
    createdAt: new Date("2026-05-07T23:20:00.000Z"),
    updatedAt: new Date("2026-05-08T00:50:00.000Z"),
    resolvedAt: new Date("2026-05-08T00:45:00.000Z"),
    requesterName: "Maya Reddy",
  },
  {
    id: "91eab4fe-11fa-4f0a-936d-2c63da10c55a",
    chatId: "d34f8f28-8c0b-44b2-a2f8-2b8d0fd4d6c1",
    userId: "0f25f2cb-6b1a-4f75-8380-e6d1ad1157d0",
    title: "Laptop battery not charging",
    description:
      "Replacement adapter issued and case closed after a successful re-test with the new charger.",
    issue: "Power Issue",
    status: "closed",
    priority: "low",
    conversationHistory: [
      { role: "user", text: "My laptop battery is not charging." },
      { role: "assistant", text: "Please try a known-good adapter." },
    ],
    escalationReason: "Closed after replacement adapter was confirmed working.",
    createdAt: new Date("2026-05-07T09:10:00.000Z"),
    updatedAt: new Date("2026-05-07T11:00:00.000Z"),
    resolvedAt: new Date("2026-05-07T10:40:00.000Z"),
    requesterName: "Hafiz Noor",
  },
];

const statusStyles: Record<Ticket["status"], string> = {
  open: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  in_progress: "bg-sky-500/15 text-sky-500 border-sky-500/20",
  resolved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  closed: "bg-zinc-500/15 text-zinc-500 border-zinc-500/20",
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState(mockTickets);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

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
    () => tickets.filter((ticket) => ticket.status === "resolved"),
    [tickets]
  );

  const updateSelectedTicket = (status: Ticket["status"]) => {
    if (!selectedTicket) return;

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedTicket.id
          ? {
              ...ticket,
              status,
              updatedAt: new Date(),
              resolvedAt: status === "resolved" ? new Date() : ticket.resolvedAt,
            }
          : ticket
      )
    );
    setSelectedTicketId(null);
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
                  Mock data only for now. Click any ticket to inspect the full record and update its status locally.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard icon={<ClipboardList className="size-4" />} label="Open tickets" value={openTickets.length} />
            <MetricCard icon={<Clock3 className="size-4" />} label="Active tickets" value={activeTickets.length} />
            <MetricCard icon={<ShieldAlert className="size-4" />} label="Resolved tickets" value={resolvedTickets.length} />
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
            {tickets.map((ticket) => (
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
                    <Badge variant="secondary">{ticket.priority}</Badge>
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
            ))}
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
                  <Badge variant="secondary">{selectedTicket.priority}</Badge>
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
                <InfoBlock label="Priority" value={selectedTicket.priority} />
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
                  onClick={() => updateSelectedTicket("resolved")}
                  variant="default"
                >
                  <CircleCheck className="size-4" />
                  Resolve ticket
                </Button>
                <Button
                  className="rounded-full"
                  onClick={() => updateSelectedTicket("closed")}
                  variant="outline"
                >
                  <CircleX className="size-4" />
                  Close ticket
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