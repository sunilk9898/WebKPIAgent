"use client";

import { useEffect, useCallback } from "react";
import { useReportStore, useScanStore, useToastStore } from "@/lib/store";
import { getLatestReport, triggerScan, type ScanRequest } from "@/lib/api";
import { onScanComplete, onScanError, onScanProgress } from "@/lib/websocket";
import type { ScanReport, AgentResult } from "@/types/api";

/** Central hook for consuming scan report data */
export function useScanReport() {
  const { report, target, loading, error, setReport, setTarget, setLoading, setError } = useReportStore();
  const { activeScan, setActiveScan, completeScan, updateAgentProgress } = useScanStore();

  // Reload report — reads target from store at call-time so the callback
  // identity stays stable and WebSocket listeners don't churn on target change.
  const refresh = useCallback(async () => {
    const currentTarget = useReportStore.getState().target;
    if (!currentTarget) return;
    setLoading(true);
    try {
      const r = await getLatestReport(currentTarget);
      setReport(r);
    } catch (e: any) {
      setError(e.message);
    }
  }, [setReport, setLoading, setError]);

  // Trigger a new scan
  const startScan = useCallback(async (req: ScanRequest) => {
    // Always set the target so refresh() works after completion
    const t = req.url || req.repoPath || "";
    if (t) setTarget(t);

    setLoading(true);
    try {
      const res = await triggerScan(req);

      // Show queued notification if not started immediately
      if (res.queuePosition && res.queuePosition > 0 && res.status === 'queued') {
        useToastStore.getState().addToast({
          type: "warning",
          title: "Scan Queued",
          message: `All scan slots are busy. Your scan is #${res.queuePosition} in the queue.`,
          duration: 6000,
        });
      }

      setActiveScan({
        scanId: res.scanId,
        status: res.status === 'queued' ? 'queued' : "running",
        agents: {
          security: { progress: 0, status: "queued" },
          performance: { progress: 0, status: "queued" },
          "code-quality": { progress: 0, status: "queued" },
          "report-generator": { progress: 0, status: "queued" },
        },
        startedAt: new Date().toISOString(),
      });
      return res;
    } catch (e: any) {
      setLoading(false);
      setError(e.message);
      throw e;
    }
  }, [setActiveScan, setTarget, setLoading, setError]);

  // Listen for scan progress + completion via WebSocket
  useEffect(() => {
    const unsubProgress = onScanProgress((data) => {
      updateAgentProgress(data.scanId, data.agent, data.progress, data.status);
    });
    const unsubComplete = onScanComplete((data) => {
      completeScan(data.scanId, data.score, data.status);
      setLoading(false); // Always clear loading on completion
      refresh();
    });
    const unsubError = onScanError(() => {
      setActiveScan(null);
      setLoading(false);
    });
    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [completeScan, setActiveScan, updateAgentProgress, refresh, setLoading]);

  // Derived data helpers
  const securityResult = report?.agentResults.find((r) => r.agentType === "security") || null;
  const performanceResult = report?.agentResults.find((r) => r.agentType === "performance") || null;
  const codeQualityResult = report?.agentResults.find((r) => r.agentType === "code-quality") || null;

  const findingsBySeverity = (report?.agentResults.flatMap((r) => r.findings) || []).reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    report,
    target,
    loading,
    error,
    activeScan,
    securityResult,
    performanceResult,
    codeQualityResult,
    findingsBySeverity,
    setTarget,
    startScan,
    refresh,
  };
}
