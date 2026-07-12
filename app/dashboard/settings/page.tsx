import { loadDashboardData } from "@/components/dashboard/data";
import { PageIntro, Panel } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { SeedCardBrowser } from "@/components/dashboard/SeedCardBrowser";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await loadDashboardData();
  return (
    <>
      <PageIntro title="Runtime settings" description="编辑 character、policy、style 与 boundaries。Secret 和 OpenRouter BASE_URL 不会进入表单或页面 HTML。" />
      <SettingsForm config={data.companion.configJson} />
      <div className="mt-4"><Panel title="Seed cards" description="与 World 页面共享同一组可编辑 novelty seeds。"><SeedCardBrowser seeds={data.seeds} /></Panel></div>
    </>
  );
}
