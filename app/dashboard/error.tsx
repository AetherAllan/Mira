"use client";

export default function DashboardError() {
  return (
    <div className="rounded-md border border-rose-400/20 bg-rose-400/[0.06] p-6">
      <h2 className="text-base font-medium text-rose-200">Dashboard unavailable</h2>
      <p className="mt-2 text-sm text-rose-100/60">
        数据库未配置或查询失败。请检查 DATABASE_URL 和数据库状态后重试。
      </p>
    </div>
  );
}
