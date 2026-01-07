import { create } from 'zustand';

export interface SessionStats {
  sessionId: string;
  startedAt: string;
  pagesProcessed: number;
  pagesSuccessful: number;
  pagesFailed: number;
  pagesAtTarget: number;
  totalScoreImprovement: number;
  averageScoreImprovement: number;
  totalWordsGenerated: number;
  totalFaqsAdded: number;
  totalInternalLinksAdded: number;
  totalSchemaAdded: number;
  totalAiTokens: number;
  totalAiCostUsd: number;
  averageJobDuration: number;
  successRate: number;
}

export interface ScoreDistribution {
  bucket: string;
  countBefore: number;
  countAfter: number;
}

export interface EnhancementBreakdown {
  type: string;
  count: number;
  avgImpact: number;
  percentage: number;
}

export interface RecentJob {
  id: string;
  timestamp: string;
  pageUrl: string;
  pageTitle: string;
  scoreBefore: number;
  scoreAfter?: number;
  status: 'completed' | 'running' | 'failed';
  improvement?: number;
}

interface AnalyticsState {
  sessionStats: SessionStats;
  scoreDistribution: ScoreDistribution[];
  enhancementBreakdown: EnhancementBreakdown[];
  recentJobs: RecentJob[];
  
  // Actions
  updateSessionStats: (stats: Partial<SessionStats>) => void;
  addRecentJob: (job: RecentJob) => void;
  resetSession: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

const initialSessionStats: SessionStats = {
  sessionId: generateId(),
  startedAt: new Date(Date.now() - 1000 * 60 * 154).toISOString(), // 2h 34m ago
  pagesProcessed: 47,
  pagesSuccessful: 44,
  pagesFailed: 3,
  pagesAtTarget: 42,
  totalScoreImprovement: 1467,
  averageScoreImprovement: 31.2,
  totalWordsGenerated: 89234,
  totalFaqsAdded: 156,
  totalInternalLinksAdded: 186,
  totalSchemaAdded: 45,
  totalAiTokens: 2847000,
  totalAiCostUsd: 4.82,
  averageJobDuration: 154000, // 2:34 in ms
  successRate: 0.936,
};

const initialScoreDistribution: ScoreDistribution[] = [
  { bucket: '90-100', countBefore: 2, countAfter: 20 },
  { bucket: '80-89', countBefore: 4, countAfter: 12 },
  { bucket: '70-79', countBefore: 8, countAfter: 4 },
  { bucket: '60-69', countBefore: 14, countAfter: 2 },
  { bucket: '50-59', countBefore: 12, countAfter: 1 },
  { bucket: '40-49', countBefore: 8, countAfter: 0 },
  { bucket: '<40', countBefore: 6, countAfter: 0 },
];

const initialEnhancementBreakdown: EnhancementBreakdown[] = [
  { type: 'Content Expansion', count: 47, avgImpact: 12.4, percentage: 38 },
  { type: 'FAQ Sections', count: 43, avgImpact: 8.2, percentage: 24 },
  { type: 'Internal Links', count: 186, avgImpact: 6.1, percentage: 18 },
  { type: 'Schema Markup', count: 45, avgImpact: 4.3, percentage: 12 },
  { type: 'Table of Contents', count: 31, avgImpact: 2.8, percentage: 8 },
];

const initialRecentJobs: RecentJob[] = [
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    pageUrl: '/ultimate-seo-guide',
    pageTitle: 'Ultimate SEO Guide',
    scoreBefore: 34,
    scoreAfter: 91,
    status: 'completed',
    improvement: 57,
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    pageUrl: '/wordpress-plugins-2024',
    pageTitle: 'WordPress Plugins 2024',
    scoreBefore: 67,
    scoreAfter: 89,
    status: 'completed',
    improvement: 22,
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    pageUrl: '/page-speed-optimization',
    pageTitle: 'Page Speed Optimization',
    scoreBefore: 42,
    scoreAfter: 87,
    status: 'completed',
    improvement: 45,
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    pageUrl: '/content-strategy',
    pageTitle: 'Content Strategy',
    scoreBefore: 58,
    status: 'running',
  },
  {
    id: generateId(),
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    pageUrl: '/ecommerce-tips',
    pageTitle: 'E-commerce Tips',
    scoreBefore: 45,
    status: 'failed',
  },
];

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  sessionStats: initialSessionStats,
  scoreDistribution: initialScoreDistribution,
  enhancementBreakdown: initialEnhancementBreakdown,
  recentJobs: initialRecentJobs,

  updateSessionStats: (stats) =>
    set((state) => ({
      sessionStats: { ...state.sessionStats, ...stats },
    })),

  addRecentJob: (job) =>
    set((state) => ({
      recentJobs: [job, ...state.recentJobs].slice(0, 20),
    })),

  resetSession: () =>
    set({
      sessionStats: {
        ...initialSessionStats,
        sessionId: generateId(),
        startedAt: new Date().toISOString(),
        pagesProcessed: 0,
        pagesSuccessful: 0,
        pagesFailed: 0,
        pagesAtTarget: 0,
        totalScoreImprovement: 0,
        averageScoreImprovement: 0,
        totalWordsGenerated: 0,
        totalFaqsAdded: 0,
        totalInternalLinksAdded: 0,
        totalSchemaAdded: 0,
        totalAiTokens: 0,
        totalAiCostUsd: 0,
        averageJobDuration: 0,
        successRate: 0,
      },
      recentJobs: [],
    }),
}));
