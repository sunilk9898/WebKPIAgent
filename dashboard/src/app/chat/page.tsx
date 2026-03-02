"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare, Send, Trash2, Code2, Briefcase, Loader2,
  Bot, User, Copy, Check, Download, FileText, FileDown,
  ChevronDown, ChevronUp, Search, Sparkles, ArrowRight, Zap,
  Shield, Gauge, AlertTriangle, Plus, Lightbulb,
} from "lucide-react";
import { useChatStore, useReportStore } from "@/lib/store";
import { sendChatMessage, getChatReports } from "@/lib/api";
import { cn, getScoreColor, timeAgo } from "@/lib/utils";
import type { ChatMessage, ChatReportOption } from "@/lib/store";
import jsPDF from "jspdf";

// ── Suggestion Chips ──
const SUGGESTIONS = {
  developer: [
    "What are the top 3 critical security vulnerabilities?",
    "Explain the XSS finding and how to fix it",
    "Which performance issues need immediate attention?",
    "Show me all OWASP findings with remediation steps",
    "What code quality improvements will have the most impact?",
    "Analyze the DRM protection status",
    "List all dependency vulnerabilities with fix versions",
    "What are the Core Web Vitals issues?",
  ],
  management: [
    "Give me an executive risk summary",
    "What is the business impact of current security issues?",
    "How does our performance compare to industry standards?",
    "What is the compliance status for OWASP and PCI-DSS?",
    "Estimate the financial exposure from security findings",
    "What should be the 30/60/90 day remediation roadmap?",
    "Which issues pose the greatest customer-facing risk?",
    "Summarize the overall platform health for the board",
  ],
};

export default function ChatPage() {
  const {
    messages, mode, loading, selectedScanId, availableReports,
    setMode, addMessage, setLoading, clearMessages,
    setSelectedScanId, setAvailableReports,
  } = useChatStore();
  const { report } = useReportStore();
  const [input, setInput] = useState("");
  const [showReportPicker, setShowReportPicker] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleNewChat = useCallback(() => {
    clearMessages();
    setInput("");
    setSuggestionsOpen(true);
    inputRef.current?.focus();
  }, [clearMessages]);

  // Auto-select current report's scanId if available
  useEffect(() => {
    if (!selectedScanId && report?.scanId) {
      setSelectedScanId(report.scanId);
    }
  }, [report, selectedScanId, setSelectedScanId]);

  // Fetch available reports for picker
  useEffect(() => {
    getChatReports()
      .then((data) => setAvailableReports(data.reports))
      .catch(() => {});
  }, [setAvailableReports]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInput("");
    setLoading(true);

    try {
      // Build history for multi-turn context
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { reply } = await sendChatMessage(
        msg,
        mode,
        selectedScanId || undefined,
        history,
      );

      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err.message || "Failed to get response"}`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, mode, selectedScanId, messages, addMessage, setLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedReport = availableReports.find((r) => r.scanId === selectedScanId);
  const filteredReports = availableReports.filter((r) =>
    !reportSearch || r.target?.toLowerCase().includes(reportSearch.toLowerCase()) ||
    r.scanId.toLowerCase().includes(reportSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-surface-1/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-600/20">
            <MessageSquare className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-100">AI Analysis Assistant</h1>
            <p className="text-[10px] text-gray-500">Report-aware intelligence powered by GPT-4o</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-2 border border-white/[0.06]">
            <button
              onClick={() => setMode("developer")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                mode === "developer"
                  ? "bg-blue-500/20 text-blue-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-300",
              )}
            >
              <Code2 className="w-3.5 h-3.5" /> Developer
            </button>
            <button
              onClick={() => setMode("management")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                mode === "management"
                  ? "bg-amber-500/20 text-amber-400 shadow-sm"
                  : "text-gray-500 hover:text-gray-300",
              )}
            >
              <Briefcase className="w-3.5 h-3.5" /> Management
            </button>
          </div>

          {/* Report Selector */}
          <div className="relative">
            <button
              onClick={() => setShowReportPicker(!showReportPicker)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-white/[0.06] text-xs text-gray-300 hover:bg-white/[0.04] transition-colors max-w-[240px]"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="truncate">
                {selectedReport
                  ? `${selectedReport.target?.substring(0, 25)}... (${selectedReport.score ?? "?"})`
                  : "Select Report Context"}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
            </button>

            {showReportPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowReportPicker(false)} />
                <div className="absolute right-0 top-full mt-1 w-[340px] bg-surface-2 border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-white/[0.06]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Search reports..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="input pl-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {filteredReports.map((r) => (
                      <button
                        key={r.scanId}
                        onClick={() => {
                          setSelectedScanId(r.scanId);
                          setShowReportPicker(false);
                          setReportSearch("");
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors border-b border-white/[0.03]",
                          selectedScanId === r.scanId && "bg-brand-600/10",
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                          r.score && r.score >= 90 ? "bg-green-500/15 text-green-400" :
                          r.score && r.score >= 70 ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400",
                        )}>
                          {r.score?.toFixed(0) ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-gray-200 truncate">{r.target}</div>
                          <div className="text-[10px] text-gray-500">
                            {r.platform} &middot; {timeAgo(r.createdAt)}
                          </div>
                        </div>
                        {selectedScanId === r.scanId && (
                          <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {filteredReports.length === 0 && (
                      <div className="px-4 py-6 text-center text-xs text-gray-500">No reports found</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* New Chat */}
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-2 border border-white/[0.06] text-xs text-gray-300 hover:bg-white/[0.06] hover:border-brand-500/30 hover:text-brand-400 transition-all"
            title="Start new chat"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* ── Messages Area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <EmptyState mode={mode} onSuggestionClick={(s) => handleSend(s)} selectedScanId={selectedScanId} />
        ) : (
          <div className="max-w-[900px] mx-auto space-y-6">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {loading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-brand-400" />
                </div>
                <div className="card p-4 max-w-[700px]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs text-gray-500">Analyzing report data...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Persistent Suggestions Strip ── */}
      {messages.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/[0.06] bg-surface-1/30">
          <div className="max-w-[900px] mx-auto px-6">
            <button
              onClick={() => setSuggestionsOpen(!suggestionsOpen)}
              className="flex items-center gap-2 w-full py-2 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Lightbulb className="w-3 h-3 text-brand-400" />
              <span>Try asking</span>
              {suggestionsOpen
                ? <ChevronDown className="w-3 h-3 ml-auto" />
                : <ChevronUp className="w-3 h-3 ml-auto" />
              }
            </button>
            {suggestionsOpen && (
              <div className="flex flex-wrap gap-1.5 pb-2.5">
                {SUGGESTIONS[mode].slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-white/[0.04] text-[11px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] hover:border-brand-500/20 transition-all disabled:opacity-40"
                  >
                    <ArrowRight className="w-2.5 h-2.5 text-brand-400 flex-shrink-0" />
                    <span className="truncate max-w-[250px]">{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Input Area ── */}
      <div className="flex-shrink-0 border-t border-white/[0.06] bg-surface-1/50 backdrop-blur-sm px-6 py-4">
        <div className="max-w-[900px] mx-auto">
          {/* Context indicator */}
          {selectedScanId && (
            <div className="flex items-center gap-2 mb-2 text-[10px] text-gray-500">
              <Sparkles className="w-3 h-3 text-brand-400" />
              <span>Context: {selectedReport?.target?.substring(0, 40)} (Score: {selectedReport?.score?.toFixed(0) ?? "?"})</span>
              <span className="text-gray-600">&middot;</span>
              <span className={cn(mode === "developer" ? "text-blue-400" : "text-amber-400")}>
                {mode === "developer" ? "Developer" : "Management"} Mode
              </span>
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === "developer"
                  ? "Ask about vulnerabilities, performance, code fixes..."
                  : "Ask about risk posture, compliance, business impact..."
                }
                rows={1}
                className="input min-h-[44px] max-h-[120px] pr-12 resize-none"
                style={{ height: "auto", minHeight: "44px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="btn-primary p-3 rounded-xl disabled:opacity-30"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-gray-600">Shift+Enter for new line</span>
            <span className="text-[10px] text-gray-600">Responses are AI-generated and based on scan data</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty State with Suggestions ──
function EmptyState({
  mode,
  onSuggestionClick,
  selectedScanId,
}: {
  mode: "developer" | "management";
  onSuggestionClick: (s: string) => void;
  selectedScanId: string | null;
}) {
  const suggestions = SUGGESTIONS[mode];

  return (
    <div className="max-w-[700px] mx-auto flex flex-col items-center justify-center h-full py-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-cyan-500/20 flex items-center justify-center mb-6">
        <Bot className="w-8 h-8 text-brand-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-100 mb-2">AI Analysis Assistant</h2>
      <p className="text-sm text-gray-500 text-center max-w-md mb-2">
        {mode === "developer"
          ? "Ask technical questions about security vulnerabilities, performance bottlenecks, and code quality issues."
          : "Get executive briefings on risk posture, compliance status, and strategic recommendations."
        }
      </p>

      {!selectedScanId && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-300">Select a report from the top bar for contextual analysis</span>
        </div>
      )}

      <div className="w-full mt-4">
        <div className="text-xs text-gray-500 mb-3 text-center">Try asking:</div>
        <div className="grid grid-cols-2 gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick(s)}
              className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface-1 border border-white/[0.04] text-xs text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] hover:border-white/[0.08] transition-all text-left"
            >
              <ArrowRight className="w-3 h-3 text-brand-400 flex-shrink-0" />
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble with Copy/Download ──
function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([message.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vzy-chat-${message.role}-${new Date(message.timestamp).toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pw, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("VZY AI Analysis - Chat Response", pw / 2, 12, { align: "center" });

    // Meta
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Role: ${message.role} | Date: ${new Date(message.timestamp).toLocaleString()}`, 15, 26);

    // Content
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    const content = message.content.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
    const lines = doc.splitTextToSize(content, pw - 30);
    let y = 34;
    for (const line of lines) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(line, 15, y);
      y += 4.2;
    }

    doc.save(`vzy-chat-response-${new Date(message.timestamp).toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
        isUser ? "bg-brand-600/30" : "bg-brand-600/20",
      )}>
        {isUser ? <User className="w-4 h-4 text-brand-300" /> : <Bot className="w-4 h-4 text-brand-400" />}
      </div>

      {/* Bubble */}
      <div className={cn("group max-w-[700px]", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-4 py-3",
          isUser
            ? "bg-brand-600/20 border border-brand-500/20 rounded-tr-sm"
            : "bg-surface-2 border border-white/[0.06] rounded-tl-sm",
        )}>
          {isUser ? (
            <div className="text-sm text-gray-200 whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div
              className="prose-chat text-sm text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          )}
        </div>

        {/* Actions bar */}
        <div className={cn(
          "flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
          isUser ? "justify-end" : "justify-start",
        )}>
          <span className="text-[10px] text-gray-600 mr-2">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && (
            <>
              <button
                onClick={handleCopy}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleDownloadTxt}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
                title="Download as .txt"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDownloadPdf}
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
                title="Download as .pdf"
              >
                <FileDown className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Markdown renderer ──
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Code blocks (must be before inline code)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="my-2 p-3 rounded-lg bg-surface-0 border border-white/[0.06] overflow-x-auto"><code class="text-[11px] font-mono text-brand-300">${code.trim()}</code></pre>`)
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-xs font-semibold text-gray-200 mt-3 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-gray-200 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-gray-100 mt-5 mb-2 pb-1 border-b border-white/[0.06]">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-gray-100 mt-5 mb-2">$1</h1>')
    // Bold + inline code
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-3 text-brand-300 text-[11px] font-mono">$1</code>')
    // Priority tags
    .replace(/\[CRITICAL\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">CRITICAL</span>')
    .replace(/\[HIGH\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20">HIGH</span>')
    .replace(/\[MEDIUM\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">MEDIUM</span>')
    .replace(/\[LOW\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20">LOW</span>')
    .replace(/\[CRITICAL RISK\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">CRITICAL RISK</span>')
    .replace(/\[HIGH RISK\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20">HIGH RISK</span>')
    .replace(/\[MEDIUM RISK\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">MEDIUM RISK</span>')
    .replace(/\[LOW RISK\]/g, '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20">LOW RISK</span>')
    // Lists
    .replace(/^- (.+)$/gm, '<div class="flex items-start gap-2 ml-1 my-0.5"><span class="text-brand-400 mt-1.5 text-[6px]">●</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex items-start gap-2 ml-1 my-0.5"><span class="text-brand-400 text-xs font-bold min-w-[16px]">$1.</span><span>$2</span></div>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-white/[0.06]" />')
    // Tables (basic)
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split("|").filter(Boolean).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) return ""; // separator row
      const isHeader = false;
      const tag = isHeader ? "th" : "td";
      return `<tr>${cells.map((c) => `<${tag} class="px-2 py-1 text-xs border border-white/[0.06]">${c}</${tag}>`).join("")}</tr>`;
    });
}
