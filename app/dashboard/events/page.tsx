import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, PageIntro, Panel } from "@/components/dashboard/ui";
import { EventLogTable } from "@/components/dashboard/EventLogTable";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const data = await loadDashboardData();
  return <><PageIntro title="Complete runtime event log" description="user.message、assistant.message、system.tick、world.event、memory.write、state.change、tool.call、proactive.sent 与 critic.review。" /><DataStatus source={data.source} error={data.connectionError} /><Panel title="Event stream" description="按 type、source、date 过滤；展开 payload 查看原始证据。"><EventLogTable events={data.recentEvents} /></Panel></>;
}

