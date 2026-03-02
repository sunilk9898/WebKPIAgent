"use client";

import { useState, useRef, useEffect } from "react";
import {
  Globe, FolderGit2, Play, Loader2, Monitor, Smartphone,
  List, Plus, X, Link2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform, AgentType } from "@/types/api";

// ── OTT Platform Presets ──
const OTT_PRESETS = [
  { url: "https://www.vzy.one/", label: "VZY One" },
  { url: "https://www.watcho.com", label: "Watcho" },
  { url: "https://www.tataplaybinge.com/", label: "Tata Play Binge" },
  { url: "https://www.airtelxstream.in/", label: "Airtel Xstream" },
  { url: "https://www.ottplay.com/", label: "OTTplay" },
  { url: "https://www.zee5.com/", label: "Zee5" },
  { url: "https://www.hotstar.com/in/home", label: "Hotstar" },
];

// Single scan callback
interface SingleScanConfig {
  url?: string;
  repoPath?: string;
  platform: Platform;
  agents: AgentType[];
}

// Batch scan callback
interface BatchScanConfig {
  urls: string[];
  platform: Platform;
  agents: AgentType[];
}

interface ScanInputProps {
  onSubmit: (config: SingleScanConfig) => void;
  onBatchSubmit?: (config: BatchScanConfig) => void;
  loading?: boolean;
  defaultMode?: "url" | "multi" | "repo";
  submitLabel?: string;
  batchSubmitLabel?: string;
}

export function ScanInput({ onSubmit, onBatchSubmit, loading, defaultMode = "url", submitLabel, batchSubmitLabel }: ScanInputProps) {
  const [mode, setMode] = useState<"url" | "multi" | "repo">(defaultMode);
  const [url, setUrl] = useState("https://www.vzy.one/");
  const [repoPath, setRepoPath] = useState("");
  const [platform, setPlatform] = useState<Platform>("both");
  const [agents, setAgents] = useState<AgentType[]>(["security", "performance", "code-quality"]);
  const [showPresets, setShowPresets] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  // Multi-URL state — pre-populated with all OTT presets
  const [urls, setUrls] = useState<string[]>(OTT_PRESETS.map((p) => p.url));
  const [bulkText, setBulkText] = useState("");
  const [bulkMode, setBulkMode] = useState(false);

  // Close presets dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-prepend https:// if user enters a bare domain like "vzy.com"
  const normalizeUrl = (u: string): string => {
    const trimmed = u.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const toggleAgent = (agent: AgentType) => {
    setAgents((prev) =>
      prev.includes(agent) ? prev.filter((a) => a !== agent) : [...prev, agent],
    );
  };

  const addUrl = () => {
    if (urls.length < 20) setUrls([...urls, ""]);
  };

  const removeUrl = (index: number) => {
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const updated = [...urls];
    updated[index] = value;
    setUrls(updated);
  };

  const parseBulkUrls = () => {
    const parsed = bulkText
      .split(/[\n,;]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && (u.startsWith("http") || u.includes(".")));
    if (parsed.length > 0) {
      setUrls(parsed.slice(0, 20));
      setBulkMode(false);
    }
  };

  const validUrls = urls.filter((u) => u.trim().length > 0);

  const handleSubmit = () => {
    if (mode === "url") {
      if (!url) return;
      onSubmit({ url: normalizeUrl(url), platform, agents });
    } else if (mode === "multi") {
      // If user is in bulk-paste mode, auto-parse the textarea first
      let submitUrls = validUrls.map(normalizeUrl);
      if (bulkMode && bulkText.trim()) {
        const parsed = bulkText
          .split(/[\n,;]+/)
          .map((u) => u.trim())
          .filter((u) => u.length > 0 && (u.startsWith("http") || u.includes(".")))
          .map(normalizeUrl);
        if (parsed.length > 0) {
          submitUrls = parsed.slice(0, 20);
          setUrls(submitUrls);
          setBulkMode(false);
        }
      }
      if (submitUrls.length === 0) return;
      if (submitUrls.length === 1) {
        onSubmit({ url: submitUrls[0], platform, agents });
      } else if (onBatchSubmit) {
        onBatchSubmit({ urls: submitUrls, platform, agents });
      }
    } else {
      if (!repoPath) return;
      onSubmit({ repoPath, platform, agents });
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="text-sm font-semibold text-gray-200">Scan Target</div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("url")}
          className={cn(
            "btn text-xs",
            mode === "url" ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" : "btn-ghost",
          )}
        >
          <Globe className="w-3.5 h-3.5" /> Single URL
        </button>
        <button
          onClick={() => setMode("multi")}
          className={cn(
            "btn text-xs",
            mode === "multi" ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" : "btn-ghost",
          )}
        >
          <List className="w-3.5 h-3.5" /> Multiple URLs
        </button>
        <button
          onClick={() => setMode("repo")}
          className={cn(
            "btn text-xs",
            mode === "repo" ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" : "btn-ghost",
          )}
        >
          <FolderGit2 className="w-3.5 h-3.5" /> Source Code
        </button>
      </div>

      {/* Input area */}
      {mode === "url" && (
        <div className="relative" ref={presetsRef}>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.watcho.com"
              className="input flex-1"
            />
            <button
              onClick={() => setShowPresets(!showPresets)}
              className={cn(
                "btn text-xs shrink-0 border transition-colors",
                showPresets
                  ? "bg-brand-600/20 text-brand-400 border-brand-500/30"
                  : "btn-ghost border-white/[0.06]",
              )}
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showPresets && "rotate-180")} />
              OTT Sites
            </button>
          </div>
          {showPresets && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg bg-surface-2 border border-white/[0.08] shadow-xl z-50 py-1 max-h-[260px] overflow-y-auto">
              {OTT_PRESETS.map((preset) => (
                <button
                  key={preset.url}
                  onClick={() => { setUrl(preset.url); setShowPresets(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-white/[0.06] transition-colors flex items-center justify-between gap-2",
                    url === preset.url && "bg-brand-600/10",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-200">{preset.label}</div>
                    <div className="text-[10px] text-gray-500 truncate">{preset.url}</div>
                  </div>
                  {url === preset.url && (
                    <span className="text-[9px] text-brand-400 font-medium shrink-0">Selected</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "multi" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {validUrls.length} URL{validUrls.length !== 1 ? "s" : ""} (max 20)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setBulkMode(!bulkMode)}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                {bulkMode ? "List view" : "Paste bulk"}
              </button>
            </div>
          </div>

          {bulkMode ? (
            <div className="space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Paste URLs — one per line, comma-separated, or semicolon-separated:\n\nhttps://www.watcho.com\nhttps://www.vzy.one\nhttps://www.dishtv.in"}
                className="input min-h-[120px] font-mono text-xs resize-y"
                rows={6}
              />
              <button
                onClick={parseBulkUrls}
                disabled={!bulkText.trim()}
                className="btn-primary text-xs py-1.5"
              >
                <Link2 className="w-3 h-3" /> Parse URLs
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 w-5 text-right">{i + 1}.</span>
                  <input
                    type="url"
                    value={u}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder={`https://example${i + 1}.com`}
                    className="input flex-1 text-sm py-1.5"
                  />
                  {urls.length > 1 && (
                    <button
                      onClick={() => removeUrl(i)}
                      className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {urls.length < 20 && (
                <button
                  onClick={addUrl}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors py-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add URL
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "repo" && (
        <input
          type="text"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="/path/to/repo or git@github.com:org/repo.git"
          className="input"
        />
      )}

      {/* Platform selector */}
      <div>
        <div className="text-xs text-gray-500 mb-2">Platform</div>
        <div className="flex gap-2">
          {[
            { value: "desktop" as Platform, label: "Desktop", icon: Monitor },
            { value: "mweb" as Platform, label: "mWeb", icon: Smartphone },
            { value: "both" as Platform, label: "Both", icon: Globe },
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => setPlatform(p.value)}
              className={cn(
                "btn text-xs",
                platform === p.value
                  ? "bg-brand-600/20 text-brand-400 border border-brand-500/30"
                  : "btn-ghost border border-white/[0.06]",
              )}
            >
              <p.icon className="w-3.5 h-3.5" /> {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent selector */}
      <div>
        <div className="text-xs text-gray-500 mb-2">Agents</div>
        <div className="flex gap-2 flex-wrap">
          {(["security", "performance", "code-quality"] as AgentType[]).map((agent) => (
            <button
              key={agent}
              onClick={() => toggleAgent(agent)}
              className={cn(
                "btn text-xs",
                agents.includes(agent)
                  ? "bg-white/[0.08] text-gray-200 border border-white/[0.12]"
                  : "btn-ghost border border-white/[0.06] opacity-50",
              )}
            >
              {agent === "security" ? "Security" : agent === "performance" ? "Performance" : "Code Quality"}
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={
          loading ||
          (mode === "url"
            ? !url
            : mode === "multi"
              ? validUrls.length === 0 && !bulkText.trim()
              : !repoPath) ||
          agents.length === 0
        }
        className="btn-primary w-full"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {loading
          ? "Scanning..."
          : mode === "multi" && (validUrls.length > 1 || (bulkMode && bulkText.trim()))
            ? batchSubmitLabel
              ? `${batchSubmitLabel}${validUrls.length > 1 ? ` (${validUrls.length} URLs)` : ""}`
              : `Run Batch Scan${validUrls.length > 1 ? ` (${validUrls.length} URLs)` : ""}`
            : submitLabel || "Run Scan"}
      </button>
    </div>
  );
}
