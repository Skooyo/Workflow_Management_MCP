import { useCallback, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

export type EscalationState = {
  turnCount: number;
  shouldEscalate: boolean;
  escalationReason: string | null;
  userIssue: string | null;
};

const ESCALATION_KEYWORDS = [
  'escalate',
  "can't fix",
  "cannot fix",
  'need help',
  'need support',
  'stuck',
  'still broken',
  'not working',
  'still not working',
  'help me',
  'call it',
  'give up',
  'beyond my skills',
  'professional help',
  'technician',
];

const MAX_TURNS_BEFORE_ESCALATION = 4;

export function useEscalationDetection() {
  const [escalationState, setEscalationState] = useState<EscalationState>({
    turnCount: 0,
    shouldEscalate: false,
    escalationReason: null,
    userIssue: null,
  });

  const detectEscalation = useCallback((messages: ChatMessage[]) => {
    // Get the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!lastUserMessage) return escalationState;

    const messageText = lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .toLowerCase() || '';

    // Check for escalation keywords
    const hasEscalationKeyword = ESCALATION_KEYWORDS.some((keyword) =>
      messageText.includes(keyword)
    );

    // Count user turns (every 2 assistant responses = 1 turn)
    const userMessageCount = messages.filter(
      (msg) => msg.role === 'user'
    ).length;

    // Extract issue from first user message
    const firstUserMessage = messages.find((msg) => msg.role === 'user');
    const userIssue = firstUserMessage?.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join(' ') || 'Issue not specified';

    const turnsSinceStart = userMessageCount;
    const exceedsMaxTurns = turnsSinceStart >= MAX_TURNS_BEFORE_ESCALATION;

    let escalationReason: string | null = null;
    if (hasEscalationKeyword) {
      escalationReason = 'User requested escalation';
    } else if (exceedsMaxTurns) {
      escalationReason = `Issue unresolved after ${MAX_TURNS_BEFORE_ESCALATION} attempts`;
    }

    const shouldEscalate = escalationReason !== null;

    const newState: EscalationState = {
      turnCount: turnsSinceStart,
      shouldEscalate,
      escalationReason,
      userIssue,
    };

    setEscalationState(newState);
    return newState;
  }, [escalationState]);

  return { escalationState, detectEscalation };
}
