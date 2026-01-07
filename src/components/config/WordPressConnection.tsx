import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Loader2, CheckCircle2, AlertCircle, Link } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { useConfigStore } from '@/stores/config-store';
import { cn } from '@/lib/utils';

export function WordPressConnection() {
  const { wordpress, setWordPress, testConnection } = useConfigStore();
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const success = await testConnection();
      setTestResult(success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

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
                  onChange={(e) => setWordPress({ siteUrl: e.target.value })}
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
                onChange={(e) => setWordPress({ username: e.target.value })}
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
              onChange={(e) => setWordPress({ applicationPassword: e.target.value })}
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
              disabled={isTesting || !wordpress.siteUrl || !wordpress.username || !wordpress.applicationPassword}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
              Test Connection
            </Button>

            {testResult && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                  testResult === 'success'
                    ? 'bg-success/20 text-success'
                    : 'bg-destructive/20 text-destructive'
                )}
              >
                {testResult === 'success' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Connected
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    Connection Failed
                  </>
                )}
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
