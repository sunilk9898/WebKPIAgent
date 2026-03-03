// ============================================================================
// Zustand Store - Global client state for dashboard
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ScanReport,
  User,
  UserRole,
  ScanStatus,
  AgentType,
  ComparisonResult,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Auth Store
// ---------------------------------------------------------------------------
interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        set({ user, token });
        if (typeof window !== "undefined") {
          localStorage.setItem("vzy_token", token);
          // Set cookie so Next.js middleware can read it server-side
          document.cookie = `vzy_token=${token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
        }
      },
      logout: () => {
        set({ user: null, token: null });
        if (typeof window !== "undefined") {
          localStorage.removeItem("vzy_token");
          // Clear the cookie
          document.cookie = "vzy_token=; path=/; max-age=0";
        }
      },
      hasRole: (roles) => {
        const user = get().user;
        return user ? roles.includes(user.role) : false;
      },
    }),
    { name: "vzy-auth" },
  ),
);

// ---------------------------------------------------------------------------
// Report Store
// ---------------------------------------------------------------------------
interface ReportStore {
  report: ScanReport | null;
  target: string;
  loading: boolean;
  error: string | null;
  setReport: (report: ScanReport) => void;
  setTarget: (target: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  report: null,
  target: "",
  loading: false,
  error: null,
  setReport: (report) => set({ report, error: null, loading: false }),
  setTarget: (target) => set({ target }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));

// ---------------------------------------------------------------------------
// Scan Activity Store (real-time)
// ---------------------------------------------------------------------------
interface ScanActivity {
  scanId: string;
  status: ScanStatus;
  agents: Record<AgentType, { progress: number; status: ScanStatus }>;
  startedAt: string;
  score?: number;
}

interface ScanStore {
  activeScan: ScanActivity | null;
  scanHistory: { scanId: string; score: number; status: string; timestamp: string }[];
  setActiveScan: (scan: ScanActivity | null) => void;
  updateAgentProgress: (scanId: string, agent: AgentType | string, progress: number, status: ScanStatus) => void;
  completeScan: (scanId: string, score: number, status: string) => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  activeScan: null,
  scanHistory: [],
  setActiveScan: (scan) => set({ activeScan: scan }),
  updateAgentProgress: (scanId, agent, progress, status) => {
    const current = get().activeScan;
    if (!current || current.scanId !== scanId) return;

    // "all" is an overall progress marker — update overall status but skip agents map
    if (agent === "all") {
      set({
        activeScan: {
          ...current,
          status: status === "completed" ? "completed" : current.status,
        },
      });
      return;
    }

    // Only update known agent types
    const knownAgents: AgentType[] = ["security", "performance", "code-quality", "report-generator"];
    if (!knownAgents.includes(agent as AgentType)) return;

    set({
      activeScan: {
        ...current,
        agents: { ...current.agents, [agent]: { progress, status } },
      },
    });
  },
  completeScan: (scanId, score, status) => {
    set((state) => ({
      activeScan: null,
      scanHistory: [
        { scanId, score, status, timestamp: new Date().toISOString() },
        ...state.scanHistory.slice(0, 49),
      ],
    }));
  },
}));

// ---------------------------------------------------------------------------
// Batch Scan Store (multi-URL)
// ---------------------------------------------------------------------------
export interface BatchScanEntry {
  url: string;
  scanId: string;
  status: "queued" | "running" | "completed" | "error";
  score?: number;
  error?: string;
  progress?: number; // 0-100 from scan:progress events
}

interface BatchStore {
  batchId: string | null;
  batchScans: BatchScanEntry[];
  batchRunning: boolean;
  startBatch: (batchId: string, scans: { url: string; scanId: string }[]) => void;
  updateBatchEntry: (scanId: string, updates: Partial<BatchScanEntry>) => void;
  restartBatchEntry: (oldScanId: string, newScanId: string) => void;
  clearBatch: () => void;
}

export const useBatchStore = create<BatchStore>((set) => ({
  batchId: null,
  batchScans: [],
  batchRunning: false,
  startBatch: (batchId, scans) =>
    set({
      batchId,
      batchScans: scans.map((s) => ({ ...s, status: "queued" as const })),
      batchRunning: true,
    }),
  updateBatchEntry: (scanId, updates) =>
    set((state) => ({
      batchScans: state.batchScans.map((s) =>
        s.scanId === scanId ? { ...s, ...updates } : s,
      ),
    })),
  restartBatchEntry: (oldScanId, newScanId) =>
    set((state) => ({
      batchScans: state.batchScans.map((s) =>
        s.scanId === oldScanId
          ? { ...s, scanId: newScanId, status: "queued" as const, score: undefined, error: undefined, progress: undefined }
          : s,
      ),
    })),
  clearBatch: () => set({ batchId: null, batchScans: [], batchRunning: false }),
}));

// ---------------------------------------------------------------------------
// Scan Queue Store (system-wide real-time queue)
// ---------------------------------------------------------------------------
export interface ActiveScanInfo {
  scanId: string;
  url: string;
  userEmail: string;
  userName: string;
  startedAt: string;
  batchId?: string;
}

export interface QueuedScanInfo {
  jobId: string;
  scanId: string;
  url: string;
  userEmail: string;
  userName: string;
  queuedAt: string;
  batchId?: string;
}

interface QueueStore {
  activeScans: ActiveScanInfo[];
  queuedScans: QueuedScanInfo[];
  maxConcurrent: number;
  activeCount: number;
  queueLength: number;
  setQueueStatus: (status: {
    activeScans: ActiveScanInfo[];
    queuedScans: QueuedScanInfo[];
    maxConcurrent: number;
    activeCount: number;
    queueLength: number;
  }) => void;
}

export const useQueueStore = create<QueueStore>((set) => ({
  activeScans: [],
  queuedScans: [],
  maxConcurrent: 2,
  activeCount: 0,
  queueLength: 0,
  setQueueStatus: (status) => set(status),
}));

// ---------------------------------------------------------------------------
// Toast Notification Store
// ---------------------------------------------------------------------------
export interface Toast {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  duration?: number;
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newToast: Toast = { ...toast, id, createdAt: Date.now() };
    set((state) => ({ toasts: [...state.toasts, newToast] }));
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, toast.duration || 5000);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// ---------------------------------------------------------------------------
// Notification Store (bell dropdown history)
// ---------------------------------------------------------------------------
export interface Notification {
  id: string;
  type: "scan_complete" | "scan_error" | "scan_started" | "queue_update";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  url?: string;
  score?: number;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  addNotification: (n) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const notification: Notification = { ...n, id, timestamp: new Date().toISOString(), read: false };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    }));
  },
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),
  clearAll: () => set({ notifications: [] }),
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));

// ---------------------------------------------------------------------------
// Chat Store (AI Chatbot - Full Page)
// ---------------------------------------------------------------------------
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatReportOption {
  scanId: string;
  target: string;
  score: number | null;
  platform: string | null;
  createdAt: string;
}

interface ChatStore {
  messages: ChatMessage[];
  mode: "developer" | "management";
  loading: boolean;
  selectedScanId: string | null;
  availableReports: ChatReportOption[];
  setMode: (mode: "developer" | "management") => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  setSelectedScanId: (scanId: string | null) => void;
  setAvailableReports: (reports: ChatReportOption[]) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  mode: "developer",
  loading: false,
  selectedScanId: null,
  availableReports: [],
  setMode: (mode) => set({ mode }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
  setSelectedScanId: (selectedScanId) => set({ selectedScanId }),
  setAvailableReports: (availableReports) => set({ availableReports }),
}));

// ---------------------------------------------------------------------------
// UI Preferences
// ---------------------------------------------------------------------------
interface UIStore {
  sidebarCollapsed: boolean;
  trendRange: 7 | 30 | 90;
  toggleSidebar: () => void;
  setTrendRange: (range: 7 | 30 | 90) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      trendRange: 30,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTrendRange: (trendRange) => set({ trendRange }),
    }),
    { name: "vzy-ui" },
  ),
);

// ---------------------------------------------------------------------------
// Competition Analysis Store
// ---------------------------------------------------------------------------
export type CompareViewMode = "summary" | "technical" | "management";

interface ComparisonStore {
  result: ComparisonResult | null;
  primaryUrl: string;
  competitorUrls: string[];
  viewMode: CompareViewMode;
  loading: boolean;
  error: string | null;
  scanProgress: Record<string, string>;
  setResult: (result: ComparisonResult) => void;
  setPrimaryUrl: (url: string) => void;
  setCompetitorUrls: (urls: string[]) => void;
  setViewMode: (mode: CompareViewMode) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateScanProgress: (url: string, status: string) => void;
  reset: () => void;
}

export const useComparisonStore = create<ComparisonStore>((set) => ({
  result: null,
  primaryUrl: "https://www.vzy.one/",
  competitorUrls: [],
  viewMode: "summary",
  loading: false,
  error: null,
  scanProgress: {},
  setResult: (result) => set({ result, error: null, loading: false }),
  setPrimaryUrl: (primaryUrl) => set({ primaryUrl }),
  setCompetitorUrls: (competitorUrls) => set({ competitorUrls }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  updateScanProgress: (url, status) =>
    set((state) => ({
      scanProgress: { ...state.scanProgress, [url]: status },
    })),
  reset: () => set({ result: null, error: null, loading: false, scanProgress: {}, competitorUrls: [] }),
}));
