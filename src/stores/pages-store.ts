import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PageStatus = 'pending' | 'analyzing' | 'optimizing' | 'completed' | 'failed' | 'skipped';

export interface QualityScore {
  overall: number;
  components: {
    contentDepth: number;
    readability: number;
    structure: number;
    seoOnPage: number;
    internalLinks: number;
    schemaMarkup: number;
    engagement: number;
    eeat: number;
  };
}

export interface PageRecord {
  id: string;
  url: string;
  slug: string;
  title: string;
  wordCount: number;
  status: PageStatus;
  scoreBefore?: QualityScore;
  scoreAfter?: QualityScore;
  postId?: number;
  postType: string;
  categories: string[];
  tags: string[];
  featuredImage?: string;
  analyzedAt?: string;
  optimizedAt?: string;
  publishedAt?: string;
  error?: string;
  retryCount: number;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  pageUrl: string;
  message: string;
  details?: Record<string, unknown>;
  scoreChange?: {
    before: number;
    after: number;
  };
}

interface PagesState {
  pages: PageRecord[];
  activityLog: ActivityLogEntry[];
  selectedPages: string[];
  
  // Actions
  addPages: (pages: PageRecord[]) => void;
  updatePage: (id: string, updates: Partial<PageRecord>) => void;
  removePage: (id: string) => void;
  clearPages: () => void;
  setSelectedPages: (ids: string[]) => void;
  togglePageSelection: (id: string) => void;
  selectAllPages: () => void;
  clearSelection: () => void;
  addActivityLog: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void;
  clearActivityLog: () => void;
}

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 15);

export const usePagesStore = create<PagesState>()(
  persist(
    (set, get) => ({
      pages: [],
      activityLog: [],
      selectedPages: [],

      addPages: (pages) =>
        set((state) => ({ pages: [...state.pages, ...pages] })),

      updatePage: (id, updates) =>
        set((state) => ({
          pages: state.pages.map((page) =>
            page.id === id ? { ...page, ...updates } : page
          ),
        })),

      removePage: (id) =>
        set((state) => ({
          pages: state.pages.filter((page) => page.id !== id),
          selectedPages: state.selectedPages.filter((pageId) => pageId !== id),
        })),

      clearPages: () => set({ pages: [], selectedPages: [] }),

      setSelectedPages: (ids) => set({ selectedPages: ids }),

      togglePageSelection: (id) =>
        set((state) => ({
          selectedPages: state.selectedPages.includes(id)
            ? state.selectedPages.filter((pageId) => pageId !== id)
            : [...state.selectedPages, id],
        })),

      selectAllPages: () =>
        set((state) => ({
          selectedPages: state.pages.map((page) => page.id),
        })),

      clearSelection: () => set({ selectedPages: [] }),

      addActivityLog: (entry) =>
        set((state) => ({
          activityLog: [
            {
              ...entry,
              id: generateId(),
              timestamp: new Date().toISOString(),
            },
            ...state.activityLog,
          ].slice(0, 100), // Keep last 100 entries
        })),

      clearActivityLog: () => set({ activityLog: [] }),
    }),
    {
      name: 'wp-optimizer-pages',
    }
  )
);
