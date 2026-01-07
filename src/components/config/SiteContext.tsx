import { motion } from 'framer-motion';
import { Building2, User, Factory, Users, MessageSquare, Link } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfigStore, BrandVoice } from '@/stores/config-store';

const industries = [
  'Technology',
  'Healthcare',
  'Finance',
  'E-commerce',
  'Education',
  'Marketing',
  'Real Estate',
  'Travel',
  'Food & Beverage',
  'Other',
];

const voiceOptions: { value: BrandVoice; label: string; description: string }[] = [
  { value: 'professional', label: 'Professional', description: 'Formal and business-focused' },
  { value: 'casual', label: 'Casual', description: 'Friendly and conversational' },
  { value: 'technical', label: 'Technical', description: 'Detailed and precise' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'authoritative', label: 'Authoritative', description: 'Expert and commanding' },
];

export function SiteContext() {
  const { siteContext, setSiteContext } = useConfigStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Site Context</CardTitle>
              <CardDescription>
                Help AI understand your brand and target audience
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orgName" className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Organization Name
              </Label>
              <Input
                id="orgName"
                placeholder="Acme Corporation"
                value={siteContext.organizationName}
                onChange={(e) => setSiteContext({ organizationName: e.target.value })}
                className="bg-muted/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="author" className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Author/Byline
              </Label>
              <Input
                id="author"
                placeholder="Editorial Team"
                value={siteContext.authorName}
                onChange={(e) => setSiteContext({ authorName: e.target.value })}
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry" className="text-sm font-medium flex items-center gap-2">
                <Factory className="w-4 h-4 text-muted-foreground" />
                Industry
              </Label>
              <Select
                value={siteContext.industry}
                onValueChange={(value) => setSiteContext({ industry: value })}
              >
                <SelectTrigger className="bg-muted/50">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((industry) => (
                    <SelectItem key={industry} value={industry.toLowerCase()}>
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience" className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Target Audience
              </Label>
              <Input
                id="audience"
                placeholder="B2B Decision Makers"
                value={siteContext.targetAudience}
                onChange={(e) => setSiteContext({ targetAudience: e.target.value })}
                className="bg-muted/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="voice" className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                Brand Voice
              </Label>
              <Select
                value={siteContext.brandVoice}
                onValueChange={(value) => setSiteContext({ brandVoice: value as BrandVoice })}
              >
                <SelectTrigger className="bg-muted/50">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {voiceOptions.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      <div className="flex flex-col">
                        <span>{voice.label}</span>
                        <span className="text-xs text-muted-foreground">{voice.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guidelines" className="text-sm font-medium flex items-center gap-2">
                <Link className="w-4 h-4 text-muted-foreground" />
                Content Guidelines URL
              </Label>
              <Input
                id="guidelines"
                placeholder="/style-guide"
                value={siteContext.contentGuidelinesUrl || ''}
                onChange={(e) => setSiteContext({ contentGuidelinesUrl: e.target.value })}
                className="bg-muted/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
