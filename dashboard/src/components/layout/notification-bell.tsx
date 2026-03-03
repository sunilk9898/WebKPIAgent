"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bell, CheckCircle2, XCircle, Loader2, Radio, Trash2, CheckCheck,
} from "lucide-react";
import { useNotificationStore, type Notification } from "@/lib/store";
import { cn } from "@/lib/utils";

function timeAgoShort(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const typeConfig: Record<Notification["type"], { icon: typeof CheckCircle2; color: string }> = {
  scan_complete: { icon: CheckCircle2, color: "text-green-400" },
  scan_error: { icon: XCircle, color: "text-red-400" },
  scan_started: { icon: Loader2, color: "text-brand-400" },
  queue_update: { icon: Radio, color: "text-amber-400" },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const unreadCount = useNotificationStore((s) => s.unreadCount());

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost p-2 relative"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg bg-surface-2 border border-white/[0.08] shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-xs font-semibold text-gray-200">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  title="Mark all read"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.type];
                const Icon = config.icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markAsRead(n.id)}
                    className={cn(
                      "px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer",
                      !n.read && "bg-brand-600/[0.06]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Unread indicator + icon */}
                      <div className="relative shrink-0 mt-0.5">
                        <Icon className={cn("w-4 h-4", config.color, n.type === "scan_started" && "animate-spin")} />
                        {!n.read && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-400" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-200 truncate">{n.title}</span>
                          <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">
                            {timeAgoShort(n.timestamp)}
                          </span>
                        </div>
                        {n.message && (
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                        )}
                        {n.type === "scan_complete" && n.score !== undefined && (
                          <span className={cn(
                            "inline-block mt-1 text-xs font-bold",
                            n.score >= 95 ? "text-green-400" : n.score >= 70 ? "text-amber-400" : "text-red-400",
                          )}>
                            Score: {n.score}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
