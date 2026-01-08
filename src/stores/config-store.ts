import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AIProvider = 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter';
export type BrandVoice = 'professional' | 'casual' | 'technical' | 'friendly' | 'authoritative';
export type OptimizationMode = 'surgical' | 'full_rewrite';

interface WordPressConfig {
  siteId?: string;
  siteUrl: string;
  username: string;
  applicationPassword: string;
  isConnected: boolean;
  lastConnectedAt?: string;
}

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  serperApiKey?: string;
}

interface NeuronWriterConfig {
  enabled: boolean;
  apiKey: string;
  isValidated: boolean;
  selectedProjectId?: string;
  selectedProjectName?: string;
}

interface SiteContext {
  organizationName: string;
  authorName: string;
  industry: string;
  targetAudience: string;
  brandVoice: BrandVoice;
  contentGuidelinesUrl?: string;
}

interface OptimizationSettings {
  mode: OptimizationMode;
  preserveImages: boolean;
  optimizeAltText: boolean;
  preserveFeaturedImage: boolean;
  preserveCategories: boolean;
  preserveTags: boolean;
  preserveSlug: boolean;
}

interface AdvancedSettings {
  targetScore: number;
  minWordCount: number;
  maxWordCount: number;
  enableFaqs: boolean;
  enableSchema: boolean;
  enableInternalLinks: boolean;
  enableToc: boolean;
  enableKeyTakeaways: boolean;
  enableCtas: boolean;
  concurrentJobs: number;
  delayBetweenJobs: number;
}

interface ConfigState {
  wordpress: WordPressConfig;
  ai: AIConfig;
  neuronWriter: NeuronWriterConfig;
  siteContext: SiteContext;
  optimization: OptimizationSettings;
  advanced: AdvancedSettings;
  
  // Actions
  setWordPress: (config: Partial<WordPressConfig>) => void;
  setAI: (config: Partial<AIConfig>) => void;
  setNeuronWriter: (config: Partial<NeuronWriterConfig>) => void;
  setSiteContext: (context: Partial<SiteContext>) => void;
  setOptimization: (settings: Partial<OptimizationSettings>) => void;
  setAdvanced: (settings: Partial<AdvancedSettings>) => void;
  testConnection: () => Promise<boolean>;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      wordpress: {
        siteId: undefined,
        siteUrl: '',
        username: '',
        applicationPassword: '',
        isConnected: false,
      },
      ai: {
        provider: 'google',
        apiKey: '',
        model: 'gemini-2.5-flash-preview-05-20',
      },
      neuronWriter: {
        enabled: false,
        apiKey: '',
        isValidated: false,
      },
      siteContext: {
        organizationName: '',
        authorName: '',
        industry: '',
        targetAudience: '',
        brandVoice: 'professional',
      },
      optimization: {
        mode: 'surgical',
        preserveImages: true,
        optimizeAltText: true,
        preserveFeaturedImage: true,
        preserveCategories: true,
        preserveTags: true,
        preserveSlug: true,
      },
      advanced: {
        targetScore: 85,
        minWordCount: 2000,
        maxWordCount: 3000,
        enableFaqs: true,
        enableSchema: true,
        enableInternalLinks: true,
        enableToc: true,
        enableKeyTakeaways: true,
        enableCtas: true,
        concurrentJobs: 3,
        delayBetweenJobs: 2000,
      },

      setWordPress: (config) =>
        set((state) => ({ wordpress: { ...state.wordpress, ...config } })),
      
      setAI: (config) =>
        set((state) => ({ ai: { ...state.ai, ...config } })),
      
      setNeuronWriter: (config) =>
        set((state) => ({ neuronWriter: { ...state.neuronWriter, ...config } })),
      
      setSiteContext: (context) =>
        set((state) => ({ siteContext: { ...state.siteContext, ...context } })),
      
      setOptimization: (settings) =>
        set((state) => ({ optimization: { ...state.optimization, ...settings } })),
      
      setAdvanced: (settings) =>
        set((state) => ({ advanced: { ...state.advanced, ...settings } })),

      testConnection: async () => {
        // This method is deprecated - use the WordPressConnection component
        // which calls the validate-wordpress edge function directly
        return false;
      },
    }),
    {
      name: 'wp-optimizer-config',
    }
  )
);
