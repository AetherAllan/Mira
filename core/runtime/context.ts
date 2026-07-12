import { ensureCompanionContext, getRuntimeContext } from "@/db/repo";

export type PrimaryRuntimeContext = NonNullable<
  Awaited<ReturnType<typeof getRuntimeContext>>
>;

export async function getPrimaryRuntimeContext(): Promise<PrimaryRuntimeContext> {
  const telegramUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!telegramUserId) throw new Error("TELEGRAM_ALLOWED_USER_ID is not configured");
  return (
    (await getRuntimeContext(telegramUserId)) ??
    (await ensureCompanionContext({ telegramUserId, displayName: "Telegram User" }))
  );
}
