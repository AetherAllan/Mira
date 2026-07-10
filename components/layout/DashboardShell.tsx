"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#0b0d10] text-zinc-200">
      <div className="flex min-h-dvh">
        <Sidebar />
        {menuOpen ? (
          <>
            <button
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              aria-label="关闭导航遮罩"
              onClick={() => setMenuOpen(false)}
            />
            <Sidebar mobile onClose={() => setMenuOpen(false)} />
          </>
        ) : null}
        <div className="min-w-0 flex-1">
          <Header onMenu={() => setMenuOpen(true)} />
          <main className="mx-auto w-full max-w-[1680px] p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

