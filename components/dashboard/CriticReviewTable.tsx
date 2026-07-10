import type { DashboardCriticReview } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { JsonInspector } from "@/components/dashboard/JsonInspector";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ValueBar } from "@/components/dashboard/ui";

export function CriticReviewTable({ reviews }: { reviews: DashboardCriticReview[] }) {
  if (!reviews.length) return <EmptyState />;
  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-md border border-white/[0.07] bg-black/15 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={review.approved ? "border-emerald-400/20 text-emerald-300" : "border-rose-400/20 text-rose-300"}>{review.approved ? "approved" : "rewrite"}</Badge>
            <span className="font-mono text-[9px] text-zinc-700">message {review.messageId ?? "not sent"}</span>
            <time className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(review.createdAt)}</time>
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-400">{review.reason}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ValueBar label="too repetitive" value={review.tooRepetitive} tone="amber" />
            <ValueBar label="too customer service" value={review.tooCustomerService} tone="amber" />
            <ValueBar label="too intimate" value={review.tooIntimate} tone="rose" />
            <ValueBar label="too random" value={review.tooRandom} tone="violet" />
            <ValueBar label="too user fitted" value={review.tooUserFitted} tone="cyan" />
            <ValueBar label="boundary risk" value={review.boundaryRisk} tone="rose" />
          </div>
          {review.rewriteInstruction ? <div className="mt-4 rounded border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2"><p className="metric-label text-amber-400/60">rewrite instruction</p><p className="mt-1 text-xs text-amber-100/70">{review.rewriteInstruction}</p></div> : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2"><div><p className="metric-label mb-1.5">original draft</p><p className="rounded border border-white/[0.06] bg-black/20 p-3 text-xs leading-5 text-zinc-500">{review.draftText ?? "—"}</p></div><div><p className="metric-label mb-1.5">final text</p><p className="rounded border border-white/[0.06] bg-black/20 p-3 text-xs leading-5 text-zinc-300">{review.finalText ?? "—"}</p></div></div>
          <div className="mt-3"><JsonInspector data={review.rawJson} /></div>
        </article>
      ))}
    </div>
  );
}

