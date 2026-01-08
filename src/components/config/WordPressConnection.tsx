import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Loader2, CheckCircle2, AlertCircle, Link, Shield, User, Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { useConfigStore } from '@/stores/config-store';
import { getEdgeFunctionUrl } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ValidationResult {
  success: boolean;
  message: string;
  siteInfo?: {
    name: string;
    description: string;
    url: string;
    version?: string;
  };
  userInfo?: {
    id: number;
    name: string;
    email: string;
    roles: string[];
    capabilities: string[];
  };
  capabilities?: {
    canEdit: boolean;
    canPublish: boolean;
    canManageOptions: boolean;
  };
  error?: string;
  errorCode?: string;
}

export function WordPressConnection() {
  const { wordpress, setWordPress } = useConfigStore();
  const [isTesting, setIsTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const handleTestConnection = async () => {
    // Validate inputs before making request
    if (!wordpress.siteUrl) {
      toast.error('Please enter your WordPress site URL');
      return;
    }
    if (!wordpress.username) {
      toast.error('Please enter your WordPress username');
      return;
    }
    if (!wordpress.applicationPassword) {
      toast.error('Please enter your Application Password');
      return;
    }

    setIsTesting(true);
    setValidationResult(null);

    try {
      const response = await fetch(getEdgeFunctionUrl('validate-wordpress'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: wordpress.siteUrl,
          username: wordpress.username,
          applicationPassword: wordpress.applicationPassword,
        }),
      });

      const result: ValidationResult = await response.json();
      setValidationResult(result);

      if (result.success) {
        setWordPress({
          isConnected: true,
          lastConnectedAt: new Date().toISOString(),
        });
        toast.success('WordPress connected successfully!', {
          description: `Connected to ${result.siteInfo?.name || wordpress.siteUrl}`,
        });
      } else {
        setWordPress({ isConnected: false });
        toast.error('Connection failed', {
          description: result.error || result.message,
        });
      }
    } catch (error) {
      console.error('WordPress validation error:', error);
      setValidationResult({
        success: false,
        message: 'Connection failed',
        error: error instanceof Error ? error.message : 'Network error - please check your connection',
        errorCode: 'NETWORK_ERROR',
      });
      setWordPress({ isConnected: false });
      toast.error('Connection failed', {
        description: 'Network error - please check your connection',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isFormValid = wordpress.siteUrl && wordpress.username && wordpress.applicationPassword;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">WordPress Connection</CardTitle>
              <CardDescription>
                Connect to your WordPress site using the REST API
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="siteUrl" className="text-sm font-medium">
                Site URL <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="siteUrl"
                  placeholder="https://yoursite.com"
                  value={wordpress.siteUrl}
                  onChange={(e) => {
                    setWordPress({ siteUrl: e.target.value, isConnected: false });
                    setValidationResult(null);
                  }}
                  className="pl-10 bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="username"
                placeholder="admin"
                value={wordpress.username}
                onChange={(e) => {
                  setWordPress({ username: e.target.value, isConnected: false });
                  setValidationResult(null);
                }}
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appPassword" className="text-sm font-medium">
              Application Password <span className="text-destructive">*</span>
            </Label>
            <PasswordInput
              id="appPassword"
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              value={wordpress.applicationPassword}
              onChange={(e) => {
                setWordPress({ applicationPassword: e.target.value, isConnected: false });
                setValidationResult(null);
              }}
              className="bg-muted/50 font-mono"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              Generate in WordPress → Users → Profile → Application Passwords
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting || !isFormValid}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {isTesting ? 'Validating...' : 'Test Connection'}
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
                    Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    {validationResult.errorCode === 'INVALID_CREDENTIALS'
                      ? 'Invalid Credentials'
                      : validationResult.errorCode === 'API_NOT_ACCESSIBLE'
                      ? 'API Not Accessible'
                      : 'Connection Failed'}
                  </>
                )}
              </motion.div>
            )}
          </div>

          {/* Success Details */}
          {validationResult?.success && validationResult.siteInfo && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-lg bg-success/10 border border-success/30 space-y-3"
            >
              <div className="flex items-center gap-2 text-success">
                <Server className="w-4 h-4" />
                <span className="font-medium">{validationResult.siteInfo.name}</span>
              </div>
              {validationResult.userInfo && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>
                    Logged in as <strong>{validationResult.userInfo.name}</strong>
                    {validationResult.userInfo.roles?.length > 0 && (
                      <> ({validationResult.userInfo.roles.join(', ')})</>
                    )}
                  </span>
                </div>
              )}
              {validationResult.capabilities && (
                <div className="flex gap-2 flex-wrap">
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    validationResult.capabilities.canEdit 
                      ? 'bg-success/20 text-success' 
                      : 'bg-muted text-muted-foreground'
                  )}>
                    ✓ Can Edit Posts
                  </span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    validationResult.capabilities.canPublish 
                      ? 'bg-success/20 text-success' 
                      : 'bg-muted text-muted-foreground'
                  )}>
                    ✓ Can Publish
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* Error Details */}
          {validationResult && !validationResult.success && validationResult.error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30"
            >
              <p className="text-sm text-destructive">{validationResult.error}</p>
              {validationResult.errorCode && (
                <p className="text-xs text-muted-foreground mt-1">
                  Error code: {validationResult.errorCode}
                </p>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
