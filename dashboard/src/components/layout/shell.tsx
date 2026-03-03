"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { GlobalScanStatusBar } from "@/components/shared/global-scan-status-bar";
import { ToastContainer } from "@/components/shared/toast-container";
import { useUIStore, useReportStore, useScanStore, useQueueStore, useToastStore, useNotificationStore } from "@/lib/store";
import { getLatestReport, getQueueStatus } from "@/lib/api";
import { connect, disconnect, onScanComplete, onScanError, onQueueStatus, onScanStarted } from "@/lib/websocket";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore();
  const { target, setReport, setLoading, setError } = useReportStore();
  const setQueueStatus = useQueueStore((s) => s.setQueueStatus);
  const addToast = useToastStore((s) => s.addToast);

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

  // Fetch initial queue status via REST on mount
  useEffect(() => {
    getQueueStatus().then(setQueueStatus).catch(() => {});
  }, [setQueueStatus]);

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
      // Toast for scan completion
      const url = (data as any).url;
      addToast({
        type: "success",
        title: "Scan Complete",
        message: url ? `${url} scored ${data.score}/100` : `Scan scored ${data.score}/100`,
        duration: 6000,
      });
      // Notification bell entry
      useNotificationStore.getState().addNotification({
        type: "scan_complete",
        title: "Scan Complete",
        message: url ? `${url} scored ${data.score}/100` : `Scan finished with score ${data.score}`,
        url,
        score: data.score,
      });
    });

    const unsubError = onScanError((data) => {
      setActiveScan(null);
      // Notification bell entry for errors
      useNotificationStore.getState().addNotification({
        type: "scan_error",
        title: "Scan Failed",
        message: (data as any).error || "An error occurred during the scan",
        url: (data as any).url,
      });
    });

    // Queue status broadcasts (all users see this)
    const unsubQueue = onQueueStatus((data) => {
      setQueueStatus(data);
    });

    // Personal notification when your scan starts
    const unsubStarted = onScanStarted((data) => {
      addToast({
        type: "info",
        title: "Scan Started",
        message: `Your scan for ${data.url} has started.`,
        duration: 4000,
      });
      // Notification bell entry
      useNotificationStore.getState().addNotification({
        type: "scan_started",
        title: "Scan Started",
        message: `Scan for ${data.url} has started processing.`,
        url: data.url,
      });
    });

    return () => {
      unsubComplete();
      unsubError();
      unsubQueue();
      unsubStarted();
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completeScan, setActiveScan, setQueueStatus, addToast]);

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
        <GlobalScanStatusBar />
        <main className="p-6">{children}</main>
      </div>
      <ToastContainer />
    </div>
  );
}
