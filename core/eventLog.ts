import { createEvent } from "@/db/repo";

export interface RuntimeEventInput {
  userId?: string | null;
  companionId: string;
  type: string;
  source: string;
  payloadJson?: unknown;
}

export async function logRuntimeEvent(input: RuntimeEventInput) {
  return createEvent({
    ...input,
    userId: input.userId ?? null,
    payloadJson: input.payloadJson ?? {},
  });
}
