import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Loader2, Play, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePagesStore } from '@/stores/pages-store';
import { toast } from 'sonner';

export function BulkMode() {
  const { pages, selectedPages, selectAllPages, clearSelection, setSelectedPages } = usePagesStore();
  const [filter, setFilter] = useState('pending');
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredPages = pages.filter((page) => {
    if (filter === 'all') return true;
    return page.status === filter;
  });

  const selectedCount = selectedPages.length;
  const estimatedTime = Math.ceil(selectedCount * 2.5); // ~2.5 min per page

  const handleSelectAll = () => {
    if (selectedCount === filteredPages.length) {
      clearSelection();
    } else {
      setSelectedPages(filteredPages.map((p) => p.id));
    }
  };

  const handleStartBatch = async () => {
    if (selectedCount === 0) {
      toast.error('Please select pages to optimize');
      return;
    }

    setIsProcessing(true);
    toast.success('Batch optimization started!', {
      description: `Processing ${selectedCount} pages`,
    });

    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsProcessing(false);
    clearSelection();
  };

  return (
    <Card className="glass-panel border-border/50 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          Bulk Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="selectAll"
            checked={selectedCount === filteredPages.length && filteredPages.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <Label htmlFor="selectAll" className="text-sm cursor-pointer">
            Select All
          </Label>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Filter Queue</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="bg-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pages</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Selected</span>
            <span className="text-lg font-mono font-bold text-primary">{selectedCount}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Est: ~{estimatedTime} min
          </div>
        </div>

        <Button
          onClick={handleStartBatch}
          disabled={isProcessing || selectedCount === 0}
          className="w-full gap-2"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isProcessing ? 'Processing...' : 'Start Batch'}
        </Button>
      </CardContent>
    </Card>
  );
}
