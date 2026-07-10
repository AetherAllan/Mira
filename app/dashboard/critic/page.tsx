import { CheckCircle2, RotateCcw, ShieldAlert } from "lucide-react";
import { loadDashboardData } from "@/components/dashboard/data";
import { DataStatus, PageIntro, Panel } from "@/components/dashboard/ui";
import { StatCard } from "@/components/layout/StatCard";
import { CriticReviewTable } from "@/components/dashboard/CriticReviewTable";

export const dynamic = "force-dynamic";

export default async function CriticPage() {
  const data = await loadDashboardData();
  const approved = data.criticReviews.filter((review) => review.approved).length;
  const boundaryFlags = data.criticReviews.filter((review) => review.boundaryRisk > 0.5).length;
  return (
    <>
      <PageIntro title="Superego review ledger" description="Critic 只审查和给出一次 rewrite instruction；它不能无限循环重写，也不能调用工具。" />
      <DataStatus source={data.source} error={data.connectionError} />
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Reviewed" value={data.criticReviews.length} description="当前快照内的审查数" icon={ShieldAlert} /><StatCard label="Approved" value={approved} description="初稿或重写后通过" icon={CheckCircle2} tone="emerald" /><StatCard label="Rewrites" value={data.criticReviews.length - approved} description={`boundary flags ${boundaryFlags}`} icon={RotateCcw} tone="amber" /></div>
      <div className="mt-4"><Panel title="Recent critic reviews" description="六个风险分数、原始 draft、rewrite instruction、最终文本和 raw JSON。"><CriticReviewTable reviews={data.criticReviews} /></Panel></div>
    </>
  );
}

