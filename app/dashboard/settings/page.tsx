import { loadDashboardData } from "@/components/dashboard/data";
import { PageIntro } from "@/components/dashboard/ui";
import { SettingsForm } from "@/components/dashboard/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await loadDashboardData();
  return (
    <>
      <PageIntro title="Runtime settings" description="编辑 character、policy、style 与 boundaries。Secret 和 OpenRouter BASE_URL 不会进入表单或页面 HTML。" />
      <SettingsForm config={data.companion.configJson} />
    </>
  );
}
