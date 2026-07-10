import { Braces } from "lucide-react";

export function JsonInspector({ data, label = "Raw JSON" }: { data: unknown; label?: string }) {
  return (
    <details className="group rounded-md border border-white/[0.06] bg-black/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
        <Braces className="size-3" />
        {label}
        <span className="ml-auto text-zinc-700 transition-transform group-open:rotate-90">›</span>
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-white/[0.05] p-3 font-mono text-[10px] leading-5 text-cyan-100/65">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </details>
  );
}

