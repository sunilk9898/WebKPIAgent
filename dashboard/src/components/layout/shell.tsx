"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useUIStore, useReportStore, useScanStore } from "@/lib/store";
import { getLatestReport } from "@/lib/api";
import { connect, disconnect, onScanComplete, onScanError } from "@/lib/websocket";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore();
  const { target, setReport, setLoading, setError } = useReportStore();

  // Load latest report when target changes
  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    setLoading(true);
    getLatestReport(target)
      .then((report) => {
        if (!cancelled) setReport(report);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => { cancelled = true; };
  }, [target, setReport, setLoading, setError]);

  const { completeScan, setActiveScan } = useScanStore();

  // Connect WebSocket ONCE on mount — never disconnect during batch scans.
  // Read `target` from the store inside the callback to avoid putting it in
  // the dependency array, which would disconnect/reconnect the socket every
  // time target changes and cause batch progress events to be lost.
  useEffect(() => {
    const socket = connect();
    const unsubComplete = onScanComplete((data) => {
      completeScan(data.scanId, data.score, data.status);
      const currentTarget = useReportStore.getState().target;
      if (currentTarget) {
        getLatestReport(currentTarget)
          .then((r) => useReportStore.getState().setReport(r))
          .catch(() => {});
      }
    });
    const unsubError = onScanError(() => {
      setActiveScan(null);
    });

    return () => {
      unsubComplete();
      unsubError();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeScan, setActiveScan]);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "ml-[68px]" : "ml-[240px]",
        )}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
