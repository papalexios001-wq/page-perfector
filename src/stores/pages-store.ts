import { create } from 'zustand';

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

// Demo data
const demoPages: PageRecord[] = [
  {
    id: generateId(),
    url: '/ultimate-guide-to-seo',
    slug: 'ultimate-guide-to-seo',
    title: 'Ultimate Guide to SEO in 2024',
    wordCount: 1234,
    status: 'pending',
    scoreBefore: { overall: 34, components: { contentDepth: 30, readability: 45, structure: 35, seoOnPage: 28, internalLinks: 20, schemaMarkup: 15, engagement: 40, eeat: 25 } },
    postType: 'post',
    categories: ['SEO', 'Marketing'],
    tags: ['seo', 'guide'],
    retryCount: 0,
  },
  {
    id: generateId(),
    url: '/best-wordpress-plugins-2024',
    slug: 'best-wordpress-plugins-2024',
    title: 'Best WordPress Plugins 2024',
    wordCount: 2100,
    status: 'pending',
    scoreBefore: { overall: 67, components: { contentDepth: 70, readability: 65, structure: 72, seoOnPage: 60, internalLinks: 55, schemaMarkup: 50, engagement: 75, eeat: 60 } },
    postType: 'post',
    categories: ['WordPress'],
    tags: ['plugins', 'wordpress'],
    retryCount: 0,
  },
  {
    id: generateId(),
    url: '/how-to-speed-up-wordpress',
    slug: 'how-to-speed-up-wordpress',
    title: 'How to Speed Up WordPress',
    wordCount: 2847,
    status: 'completed',
    scoreBefore: { overall: 42, components: { contentDepth: 40, readability: 50, structure: 45, seoOnPage: 35, internalLinks: 30, schemaMarkup: 25, engagement: 50, eeat: 35 } },
    scoreAfter: { overall: 91, components: { contentDepth: 92, readability: 88, structure: 95, seoOnPage: 90, internalLinks: 85, schemaMarkup: 95, engagement: 92, eeat: 88 } },
    postType: 'post',
    categories: ['Performance'],
    tags: ['speed', 'optimization'],
    optimizedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    retryCount: 0,
  },
  {
    id: generateId(),
    url: '/content-marketing-strategy',
    slug: 'content-marketing-strategy',
    title: 'Content Marketing Strategy Guide',
    wordCount: 1890,
    status: 'optimizing',
    scoreBefore: { overall: 42, components: { contentDepth: 45, readability: 40, structure: 48, seoOnPage: 38, internalLinks: 35, schemaMarkup: 30, engagement: 45, eeat: 40 } },
    postType: 'post',
    categories: ['Marketing'],
    tags: ['content', 'strategy'],
    retryCount: 0,
  },
  {
    id: generateId(),
    url: '/ecommerce-seo-tips',
    slug: 'ecommerce-seo-tips',
    title: 'E-commerce SEO Tips',
    wordCount: 1456,
    status: 'failed',
    scoreBefore: { overall: 58, components: { contentDepth: 55, readability: 60, structure: 58, seoOnPage: 52, internalLinks: 48, schemaMarkup: 45, engagement: 62, eeat: 50 } },
    postType: 'post',
    categories: ['E-commerce', 'SEO'],
    tags: ['ecommerce', 'tips'],
    error: 'Rate limited - retry scheduled',
    retryCount: 1,
  },
];

const demoActivityLog: ActivityLogEntry[] = [
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    type: 'success',
    pageUrl: '/how-to-speed-up-wordpress',
    message: 'Optimization completed successfully',
    scoreChange: { before: 42, after: 91 },
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    type: 'info',
    pageUrl: '/content-marketing-strategy',
    message: 'Step 3/7: Generating FAQs',
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    type: 'error',
    pageUrl: '/ecommerce-seo-tips',
    message: 'Rate limited - retry scheduled for 14:35:12',
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    type: 'success',
    pageUrl: '/wordpress-security-guide',
    message: 'Added: 5 FAQs, Schema, ToC, 8 internal links',
    scoreChange: { before: 55, after: 88 },
  },
];

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: demoPages,
  activityLog: demoActivityLog,
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
}));
