import { verifyCronSecret } from "@/telegram/verify";

export async function runCron<T extends object>(
  request: Request,
  label: string,
  task: () => Promise<T>,
) {
  if (!verifyCronSecret(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await task()) });
  } catch (error) {
    console.error(`${label} cron failed`, error);
    return Response.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}
