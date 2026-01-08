import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ChevronDown, 
  Sparkles,
  Target,
  FileText,
  HelpCircle,
  Users,
  CloudOff,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useConfigStore } from '@/stores/config-store';
import { invokeEdgeFunction, isSupabaseConfigured } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NeuronProject {
  project: string;
  name: string;
  language: string;
  engine: string;
}

interface NeuronQuery {
  query: string;
  keyword: string;
  language: string;
  engine: string;
  created: string;
  status: string;
}

export function NeuronWriterConfig() {
  const { neuronWriter, setNeuronWriter } = useConfigStore();
  const [isValidating, setIsValidating] = useState(false);
  const [isFetchingProjects, setIsFetchingProjects] = useState(false);
  const [isFetchingQueries, setIsFetchingQueries] = useState(false);
  const [projects, setProjects] = useState<NeuronProject[]>([]);
  const [queries, setQueries] = useState<NeuronQuery[]>([]);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isQueriesOpen, setIsQueriesOpen] = useState(false);
  
  const backendConfigured = isSupabaseConfigured();

  // Fetch projects when API key changes and is valid
  useEffect(() => {
    if (neuronWriter.isValidated && neuronWriter.apiKey) {
      fetchProjects();
    }
  }, [neuronWriter.isValidated]);

  // Fetch queries when project changes
  useEffect(() => {
    if (neuronWriter.selectedProjectId && neuronWriter.apiKey) {
      fetchQueries();
    }
  }, [neuronWriter.selectedProjectId]);

  const handleValidateKey = async () => {
    if (!neuronWriter.apiKey) {
      toast.error('Please enter your NeuronWriter API key');
      return;
    }

    if (!backendConfigured) {
      toast.error('Backend runtime not configured');
      return;
    }

    setIsValidating(true);

    const { data, error } = await invokeEdgeFunction<{ success: boolean; projects?: NeuronProject[]; error?: string }>(
      'neuronwriter',
      {
        action: 'list-projects',
        apiKey: neuronWriter.apiKey,
      }
    );

    if (error || !data?.success) {
      toast.error('Invalid API key', {
        description: error?.message || data?.error || 'Failed to validate NeuronWriter API key',
      });
      setNeuronWriter({ isValidated: false });
      setIsValidating(false);
      return;
    }

    setProjects(data.projects || []);
    setNeuronWriter({ isValidated: true });
    toast.success('NeuronWriter connected!', {
      description: `Found ${data.projects?.length || 0} projects`,
    });
    setIsValidating(false);
    setIsProjectsOpen(true);
  };

  const fetchProjects = async () => {
    if (!neuronWriter.apiKey) return;
    
    setIsFetchingProjects(true);
    
    const { data, error } = await invokeEdgeFunction<{ success: boolean; projects?: NeuronProject[]; error?: string }>(
      'neuronwriter',
      {
        action: 'list-projects',
        apiKey: neuronWriter.apiKey,
      }
    );

    if (error || !data?.success) {
      console.error('Failed to fetch projects:', error?.message || data?.error);
      setIsFetchingProjects(false);
      return;
    }

    setProjects(data.projects || []);
    setIsFetchingProjects(false);
  };

  const fetchQueries = async () => {
    if (!neuronWriter.apiKey || !neuronWriter.selectedProjectId) return;
    
    setIsFetchingQueries(true);
    
    const { data, error } = await invokeEdgeFunction<{ success: boolean; queries?: NeuronQuery[]; error?: string }>(
      'neuronwriter',
      {
        action: 'list-queries',
        apiKey: neuronWriter.apiKey,
        projectId: neuronWriter.selectedProjectId,
      }
    );

    if (error || !data?.success) {
      console.error('Failed to fetch queries:', error?.message || data?.error);
      setIsFetchingQueries(false);
      return;
    }

    setQueries(data.queries || []);
    setIsFetchingQueries(false);
    setIsQueriesOpen(true);
  };

  const handleProjectSelect = (projectId: string) => {
    const project = projects.find(p => p.project === projectId);
    setNeuronWriter({ 
      selectedProjectId: projectId,
      selectedProjectName: project?.name || '',
    });
    setQueries([]);
  };

  const selectedProject = projects.find(p => p.project === neuronWriter.selectedProjectId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <Card className="glass-panel border-border/50 overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
              <Brain className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">NeuronWriter Integration</CardTitle>
                <Badge variant="outline" className="text-[10px] font-medium bg-purple-500/10 text-purple-400 border-purple-500/30">
                  PREMIUM
                </Badge>
              </div>
              <CardDescription>
                Leverage NeuronWriter's AI-powered SEO recommendations for superior content optimization
              </CardDescription>
            </div>
            <Switch
              checked={neuronWriter.enabled}
              onCheckedChange={(enabled) => setNeuronWriter({ enabled })}
            />
          </div>
        </CardHeader>

        <AnimatePresence>
          {neuronWriter.enabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="space-y-5 pt-0">
                {/* Backend not configured warning */}
                {!backendConfigured && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3"
                  >
                    <CloudOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-warning">Backend Runtime Required</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connect Lovable Cloud to enable NeuronWriter integration.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* API Key Input */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    NeuronWriter API Key
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <PasswordInput
                      placeholder="n-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={neuronWriter.apiKey}
                      onChange={(e) => {
                        setNeuronWriter({ 
                          apiKey: e.target.value, 
                          isValidated: false,
                          selectedProjectId: undefined,
                          selectedProjectName: undefined,
                        });
                        setProjects([]);
                        setQueries([]);
                      }}
                      className="flex-1 bg-muted/50 font-mono"
                    />
                    <Button
                      onClick={handleValidateKey}
                      disabled={isValidating || !neuronWriter.apiKey || !backendConfigured}
                      variant={neuronWriter.isValidated ? 'outline' : 'default'}
                      className="gap-2 min-w-[120px]"
                    >
                      {isValidating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : neuronWriter.isValidated ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      {isValidating ? 'Validating...' : neuronWriter.isValidated ? 'Connected' : 'Connect'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{' '}
                    <a 
                      href="https://app.neuronwriter.com/profile" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      NeuronWriter Profile → Neuron API access
                    </a>
                  </p>
                </div>

                {/* Validation Status */}
                {neuronWriter.isValidated && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-success/10 border border-success/30 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-success" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-success">NeuronWriter Connected</p>
                      <p className="text-xs text-muted-foreground">
                        {projects.length} project{projects.length !== 1 ? 's' : ''} available
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Project Selection */}
                {neuronWriter.isValidated && projects.length > 0 && (
                  <Collapsible open={isProjectsOpen} onOpenChange={setIsProjectsOpen}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between p-3 h-auto bg-muted/30 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Target className="w-4 h-4 text-primary" />
                          <div className="text-left">
                            <p className="text-sm font-medium">Select Project</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedProject ? selectedProject.name : 'Choose a NeuronWriter project'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedProject && (
                            <Badge variant="secondary" className="text-xs">
                              {selectedProject.language}
                            </Badge>
                          )}
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            isProjectsOpen && "rotate-180"
                          )} />
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Available Projects</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={fetchProjects}
                            disabled={isFetchingProjects}
                            className="h-7 text-xs gap-1"
                          >
                            <RefreshCw className={cn("w-3 h-3", isFetchingProjects && "animate-spin")} />
                            Refresh
                          </Button>
                        </div>
                        <Select
                          value={neuronWriter.selectedProjectId || ''}
                          onValueChange={handleProjectSelect}
                        >
                          <SelectTrigger className="bg-muted/50">
                            <SelectValue placeholder="Select a project..." />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.project} value={project.project}>
                                <div className="flex items-center gap-2">
                                  <span>{project.name}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {project.language}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    ({project.engine})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Queries List (informational) */}
                {neuronWriter.selectedProjectId && queries.length > 0 && (
                  <Collapsible open={isQueriesOpen} onOpenChange={setIsQueriesOpen}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-between p-3 h-auto bg-muted/30 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-info" />
                          <div className="text-left">
                            <p className="text-sm font-medium">Available Queries</p>
                            <p className="text-xs text-muted-foreground">
                              {queries.length} analyzed keyword{queries.length !== 1 ? 's' : ''} ready
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {queries.length}
                          </Badge>
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            isQueriesOpen && "rotate-180"
                          )} />
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-muted/20 rounded-lg">
                        {queries.slice(0, 20).map((query) => (
                          <div 
                            key={query.query}
                            className="flex items-center justify-between p-2 rounded-md bg-background/50 border border-border/30"
                          >
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {query.keyword}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {query.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        {queries.length > 20 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            +{queries.length - 20} more queries
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* NeuronWriter Features Info */}
                {neuronWriter.isValidated && neuronWriter.selectedProjectId && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-2 gap-3 pt-2"
                  >
                    <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-medium">SEO Terms</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Title, H1, H2 & content terms with usage recommendations
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Target className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-medium">Entity Coverage</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Important entities with relevance & confidence scores
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <HelpCircle className="w-4 h-4 text-green-400" />
                        <span className="text-xs font-medium">PAA & Questions</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        People Also Ask & related questions for FAQ sections
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-medium">Competitor Intel</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Top-ranking content scores & structure analysis
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
