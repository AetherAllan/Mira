import { loadDashboardData } from "@/components/dashboard/data";
import { ConversationTimeline } from "@/components/dashboard/ConversationTimeline";
import { PageIntro } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const data = await loadDashboardData();
  return <><PageIntro title="Telegram conversation timeline" description="消息正文、Analyzer annotation、memory candidate、tool trace 和原始 JSON 在同一条因果线上。" /><ConversationTimeline messages={data.recentMessages} /></>;
}
