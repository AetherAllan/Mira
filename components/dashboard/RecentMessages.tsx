import { Bot, UserRound, Wrench } from "lucide-react";
import type { DashboardMessage } from "@/components/dashboard/data";
import { formatDate } from "@/components/dashboard/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Panel } from "@/components/dashboard/ui";

export function RecentMessages({ messages, limit = 10 }: { messages: DashboardMessage[]; limit?: number }) {
  const rows = messages.slice(0, limit);
  return (
    <Panel title="Recent messages" description="Telegram 对话与 runtime 产出的最近消息。">
      {rows.length ? (
        <div className="divide-y divide-white/[0.05]">
          {rows.map((message) => {
            const Icon = message.role === "user" ? UserRound : message.role === "tool" ? Wrench : Bot;
            return (
              <div key={message.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded border border-white/[0.07] bg-white/[0.025] text-zinc-500">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge className={message.role === "assistant" ? "text-violet-300" : message.role === "user" ? "text-sky-300" : ""}>{message.role}</Badge>
                    <span className="ml-auto font-mono text-[9px] text-zinc-700">{formatDate(message.createdAt, true)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-zinc-300">{message.text}</p>
                  {message.annotation?.topics?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {message.annotation.topics.slice(0, 3).map((topic) => <span key={topic.name} className="text-[9px] text-cyan-400/50">#{topic.name}</span>)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : <EmptyState />}
    </Panel>
  );
}

