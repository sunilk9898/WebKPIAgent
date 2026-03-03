"use client";

import { X, CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";
import { useToastStore, type Toast } from "@/lib/store";
import { cn } from "@/lib/utils";

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const COLORS = {
  info: "border-brand-500/30 bg-brand-600/10",
  success: "border-green-500/30 bg-green-600/10",
  warning: "border-amber-500/30 bg-amber-600/10",
  error: "border-red-500/30 bg-red-600/10",
};

const ICON_COLORS = {
  info: "text-brand-400",
  success: "text-green-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore();
  const Icon = ICONS[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm",
        "animate-in slide-in-from-right duration-300",
        COLORS[toast.type],
      )}
    >
      <Icon
        className={cn("w-4 h-4 mt-0.5 shrink-0", ICON_COLORS[toast.type])}
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-200">{toast.title}</div>
        {toast.message && (
          <div className="text-[10px] text-gray-400 mt-0.5 truncate">
            {toast.message}
          </div>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 rounded hover:bg-white/[0.06] text-gray-500 hover:text-gray-300 transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.slice(-5).map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
