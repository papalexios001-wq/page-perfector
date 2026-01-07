import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Rocket, BarChart3, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Config components
import { WordPressConnection } from '@/components/config/WordPressConnection';
import { AIProviderConfig } from '@/components/config/AIProviderConfig';
import { SiteContext } from '@/components/config/SiteContext';
import { OptimizationModeConfig } from '@/components/config/OptimizationModeConfig';
import { AdvancedSettings } from '@/components/config/AdvancedSettings';

// Strategy components
import { DashboardMetrics } from '@/components/strategy/DashboardMetrics';
import { SitemapCrawler } from '@/components/strategy/SitemapCrawler';
import { QuickOptimize } from '@/components/strategy/QuickOptimize';
import { BulkMode } from '@/components/strategy/BulkMode';
import { PageQueue } from '@/components/strategy/PageQueue';
import { ActivityLog } from '@/components/strategy/ActivityLog';

// Analytics components
import { SessionStats } from '@/components/analytics/SessionStats';
import { ScoreDistribution } from '@/components/analytics/ScoreDistribution';
import { EnhancementBreakdown } from '@/components/analytics/EnhancementBreakdown';
import { RecentJobs } from '@/components/analytics/RecentJobs';

const Index = () => {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-info/20 border border-primary/30">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  WP Optimizer <span className="text-gradient">Pro Ultra</span>
                </h1>
                <p className="text-xs text-muted-foreground">Enterprise AI Content Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/30">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">Connected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="config" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Rocket className="w-4 h-4" />
              Content Strategy
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <WordPressConnection />
              <AIProviderConfig />
              <SiteContext />
              <OptimizationModeConfig />
              <AdvancedSettings />
            </motion.div>
          </TabsContent>

          {/* Content Strategy Tab */}
          <TabsContent value="strategy" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <DashboardMetrics />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SitemapCrawler />
                <QuickOptimize />
                <BulkMode />
              </div>

              <PageQueue />
              <ActivityLog />
            </motion.div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <SessionStats />
              <ScoreDistribution />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EnhancementBreakdown />
                <RecentJobs />
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
