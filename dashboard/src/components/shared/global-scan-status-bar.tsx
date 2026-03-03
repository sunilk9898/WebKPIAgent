"use client";

import { Loader2, Clock } from "lucide-react";
import { useQueueStore, useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function GlobalScanStatusBar() {
  const { activeScans, queuedScans, activeCount, queueLength, maxConcurrent } =
    useQueueStore();
  const currentUser = useAuthStore((s) => s.user);

  // Only show if there are active or queued scans
  if (activeCount === 0 && queueLength === 0) return null;

  // Check if the current user has any queued scans
  const myQueuePosition =
    currentUser?.email
      ? queuedScans.findIndex((s) => s.userEmail === currentUser.email) + 1
      : 0;

  return (
    <div className="border-b border-white/[0.06] bg-surface-1/60 px-6 py-2">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Active scans */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                activeCount > 0
                  ? "bg-brand-500 animate-pulse"
                  : "bg-gray-600",
              )}
            />
            <span className="font-medium">
              {activeCount}/{maxConcurrent} slots active
            </span>
          </div>

          {/* Show who is scanning what */}
          <div className="flex items-center gap-3 min-w-0 overflow-x-auto">
            {activeScans.map((scan) => {
              let hostname = scan.url;
              try {
                hostname = new URL(scan.url).hostname.replace("www.", "");
              } catch {}
              const firstName = scan.userName?.split(" ")[0] || "User";

              return (
                <div
                  key={scan.scanId}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-600/10 border border-brand-500/20 shrink-0"
                >
                  <Loader2 className="w-3 h-3 text-brand-400 animate-spin" />
                  <span className="text-[10px] text-brand-400 font-medium truncate max-w-[120px]">
                    {hostname}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    by {firstName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Queue info */}
        <div className="flex items-center gap-3 shrink-0">
          {queueLength > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>
                {queueLength} in queue
              </span>
            </div>
          )}
          {myQueuePosition > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] text-amber-400 font-medium">
                Your scan: #{myQueuePosition} in queue
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
