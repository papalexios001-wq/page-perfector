import { motion } from 'framer-motion';
import { Bot, Sparkles, Brain, Zap, Network } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { useConfigStore, AIProvider } from '@/stores/config-store';
import { cn } from '@/lib/utils';

const providers: { id: AIProvider; name: string; icon: typeof Bot; color: string }[] = [
  { id: 'google', name: 'Google', icon: Sparkles, color: 'text-blue-400' },
  { id: 'openrouter', name: 'OpenRouter', icon: Network, color: 'text-purple-400' },
  { id: 'openai', name: 'OpenAI', icon: Bot, color: 'text-green-400' },
  { id: 'anthropic', name: 'Anthropic', icon: Brain, color: 'text-orange-400' },
  { id: 'groq', name: 'Groq', icon: Zap, color: 'text-yellow-400' },
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
  ],
  openrouter: [
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'google/gemini-pro', label: 'Gemini Pro' },
  ],
};

export function AIProviderConfig() {
  const { ai, setAI } = useConfigStore();

  const handleProviderChange = (provider: AIProvider) => {
    const defaultModel = modelsByProvider[provider][0].value;
    setAI({ provider, model: defaultModel });
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
                      'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
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
                onChange={(e) => setAI({ apiKey: e.target.value })}
                className="bg-muted/50 font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-medium">
                Model Selection
              </Label>
              <Select value={ai.model} onValueChange={(value) => setAI({ model: value })}>
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
            </div>
          </div>

          <div className="space-y-2">
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
