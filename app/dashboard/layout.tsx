import { DashboardShell } from "@/components/layout/DashboardShell";
import { requireAdminPage } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <DashboardShell>{children}</DashboardShell>;
}
