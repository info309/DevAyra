import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import EmailCleanupDashboard from "@/components/EmailCleanupDashboard";
import CleanupHistory from "@/components/CleanupHistory";

const EmailCleanup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please sign in to analyze your emails",
          variant: "destructive",
        });
        return;
      }

      const response = await supabase.functions.invoke('analyze-emails-cleanup', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Analysis complete",
        description: `Analyzed emails from ${response.data.senderGroups} senders`,
      });

      // Trigger refresh
      setRefreshKey(prev => prev + 1);

    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze emails",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Email Cleanup</h1>
              <p className="text-muted-foreground mt-1">
                Analyze, unsubscribe, and organize your emails
              </p>
            </div>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing ? 'Analyzing...' : 'Analyze Emails'}
          </Button>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-6">
            <EmailCleanupDashboard key={refreshKey} />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <CleanupHistory key={refreshKey} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EmailCleanup;
