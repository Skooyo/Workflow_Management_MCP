"use client";

import { usePathname } from "next/navigation";
import { ActiveChatProvider } from "@/hooks/use-active-chat";
import { ChatShell } from "./shell";

function isChatRoute(pathname: string) {
  return pathname === "/" || /^\/chat\/[^/]+$/.test(pathname);
}

export function WorkspaceContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (isChatRoute(pathname)) {
    return (
      <ActiveChatProvider>
        <ChatShell />
      </ActiveChatProvider>
    );
  }

  return <>{children}</>;
}