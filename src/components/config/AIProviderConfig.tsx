import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Sparkles, Brain, Zap, Network, Loader2, CheckCircle2, AlertCircle, Shield, CloudOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { useConfigStore, AIProvider } from '@/stores/config-store';
import { invokeEdgeFunction, isSupabaseConfigured } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const providers: { id: AIProvider; name: string; icon: typeof Bot; color: string; allowCustomModel: boolean }[] = [
  { id: 'google', name: 'Google', icon: Sparkles, color: 'text-blue-400', allowCustomModel: false },
  { id: 'openrouter', name: 'OpenRouter', icon: Network, color: 'text-purple-400', allowCustomModel: true },
  { id: 'openai', name: 'OpenAI', icon: Bot, color: 'text-green-400', allowCustomModel: false },
  { id: 'anthropic', name: 'Anthropic', icon: Brain, color: 'text-orange-400', allowCustomModel: false },
  { id: 'groq', name: 'Groq', icon: Zap, color: 'text-yellow-400', allowCustomModel: true },
];

const modelsByProvider: Record<AIProvider, { value: string; label: string }[]> = {
  google: [
    { value: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash Preview' },
    { value: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro Preview' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
  ],
  openrouter: [
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'google/gemini-pro', label: 'Gemini Pro' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  ],
};

interface ValidationResult {
  success: boolean;
  message: string;
  provider: string;
  model: string;
  modelInfo?: {
    id: string;
    name?: string;
  };
  error?: string;
  errorCode?: string;
}

export function AIProviderConfig() {
  const { ai, setAI } = useConfigStore();
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [customModel, setCustomModel] = useState('');

  const backendConfigured = isSupabaseConfigured();
  const currentProvider = providers.find(p => p.id === ai.provider);
  const allowsCustomModel = currentProvider?.allowCustomModel || false;

  const handleProviderChange = (provider: AIProvider) => {
    const defaultModel = modelsByProvider[provider][0].value;
    setAI({ provider, model: defaultModel });
    setValidationResult(null);
    setCustomModel('');
  };

  const handleModelChange = (model: string) => {
    setAI({ model });
    setValidationResult(null);
  };

  const handleCustomModelChange = (value: string) => {
    setCustomModel(value);
    if (value) {
      setAI({ model: value });
    }
    setValidationResult(null);
  };

  const handleValidateAPI = async () => {
    if (!ai.apiKey) {
      toast.error('Please enter your API key');
      return;
    }
    if (!ai.model) {
      toast.error('Please select or enter a model');
      return;
    }

    // CRITICAL: Do NOT allow fake validation - backend is required
    if (!backendConfigured) {
      toast.error('Backend runtime not configured', {
        description: 'Please connect Lovable Cloud to validate API keys securely.',
      });
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    const { data, error } = await invokeEdgeFunction<ValidationResult>('validate-ai-provider', {
      provider: ai.provider,
      apiKey: ai.apiKey,
      model: ai.model,
    });

    if (error) {
      console.error('AI validation error:', error);
      setValidationResult({
        success: false,
        message: 'Validation failed',
        provider: ai.provider,
        model: ai.model,
        error: error.message,
        errorCode: error.code,
      });
      toast.error('Validation failed', {
        description: error.message,
      });
      setIsValidating(false);
      return;
    }

    const result = data!;
    setValidationResult(result);

    if (result.success) {
      toast.success('API key validated!', {
        description: `Successfully connected to ${result.provider}`,
      });
    } else {
      toast.error('Validation failed', {
        description: result.error || result.message,
      });
    }

    setIsValidating(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Provider Configuration</CardTitle>
              <CardDescription>
                Select your AI provider and model for content optimization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Backend not configured warning */}
          {!backendConfigured && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3"
            >
              <CloudOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Backend Runtime Not Configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect Lovable Cloud to enable secure API key validation. Without backend, validation is disabled.
                </p>
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">Select Provider</Label>
            <div className="grid grid-cols-5 gap-2">
              {providers.map((provider) => {
                const Icon = provider.icon;
                const isSelected = ai.provider === provider.id;
                
                return (
                  <button
                    key={provider.id}
                    onClick={() => handleProviderChange(provider.id)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 bg-muted/30 hover:border-primary/50 hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn('w-6 h-6', isSelected ? 'text-primary' : provider.color)} />
                    <span className={cn('text-xs font-medium', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                      {provider.name}
                    </span>
                    {isSelected && (
                      <motion.div
                        layoutId="provider-check"
                        className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"
                      >
                        <span className="text-[10px] text-primary-foreground">✓</span>
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-sm font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <PasswordInput
                id="apiKey"
                placeholder="Enter your API key..."
                value={ai.apiKey}
                onChange={(e) => {
                  setAI({ apiKey: e.target.value });
                  setValidationResult(null);
                }}
                className="bg-muted/50 font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-medium">
                Model Selection {allowsCustomModel && <span className="text-muted-foreground">(or custom)</span>}
              </Label>
              {allowsCustomModel ? (
                <div className="space-y-2">
                  <Select 
                    value={customModel ? '' : ai.model} 
                    onValueChange={(value) => {
                      setCustomModel('');
                      handleModelChange(value);
                    }}
                  >
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Select a preset model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelsByProvider[ai.provider].map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Or enter custom model ID..."
                    value={customModel}
                    onChange={(e) => handleCustomModelChange(e.target.value)}
                    className="bg-muted/50 font-mono text-sm"
                  />
                  {ai.provider === 'openrouter' && (
                    <p className="text-xs text-muted-foreground">
                      Browse models at{' '}
                      <a 
                        href="https://openrouter.ai/models" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        openrouter.ai/models
                      </a>
                    </p>
                  )}
                  {ai.provider === 'groq' && (
                    <p className="text-xs text-muted-foreground">
                      Browse models at{' '}
                      <a 
                        href="https://console.groq.com/docs/models" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        console.groq.com/docs/models
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <Select value={ai.model} onValueChange={handleModelChange}>
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsByProvider[ai.provider].map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Validate Button */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleValidateAPI}
              disabled={isValidating || !ai.apiKey || !ai.model || !backendConfigured}
              variant="outline"
              className="gap-2"
            >
              {isValidating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {isValidating ? 'Validating...' : 'Validate API Key'}
            </Button>

            {validationResult && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                  validationResult.success
                    ? 'bg-success/20 text-success'
                    : 'bg-destructive/20 text-destructive'
                )}
              >
                {validationResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Valid
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    {validationResult.errorCode === 'INVALID_API_KEY' 
                      ? 'Invalid Key' 
                      : validationResult.errorCode === 'MODEL_NOT_FOUND'
                      ? 'Model Not Found'
                      : 'Failed'}
                  </>
                )}
              </motion.div>
            )}
          </div>

          {/* Validation Result Details */}
          {validationResult?.success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-success/10 border border-success/30"
            >
              <p className="text-sm text-success">
                ✓ {validationResult.provider} API key is valid. Model: {validationResult.model}
              </p>
            </motion.div>
          )}

          {validationResult && !validationResult.success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/30"
            >
              <p className="text-sm text-destructive">{validationResult.error}</p>
            </motion.div>
          )}

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label htmlFor="serperKey" className="text-sm font-medium">
              Serper API Key <span className="text-muted-foreground">(Optional)</span>
            </Label>
            <PasswordInput
              id="serperKey"
              placeholder="For SERP analysis & entity gap detection..."
              value={ai.serperApiKey || ''}
              onChange={(e) => setAI({ serperApiKey: e.target.value })}
              className="bg-muted/50 font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Enables competitor analysis, entity gaps, and PAA coverage
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
