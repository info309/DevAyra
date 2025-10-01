import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface SubscriptionRecord {
  id: string;
  sender_email: string;
  sender_name: string;
  sender_domain: string;
  email_count: number;
  has_unsubscribe_header: boolean;
  unsubscribe_url: string;
  ai_summary: string;
}

const EmailCleanupDashboard = () => {
  const { toast } = useToast();
  const [unsubscribing, setUnsubscribing] = useState<Set<string>>(new Set());

  const { data: subscriptions, isLoading, refetch } = useQuery({
    queryKey: ['email-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_cleanup_analysis')
        .select('*')
        .eq('has_unsubscribe_header', true)
        .order('email_count', { ascending: false });

      if (error) throw error;
      return data as SubscriptionRecord[];
    },
  });

  const handleUnsubscribe = async (subscription: SubscriptionRecord) => {
    setUnsubscribing(prev => new Set(prev).add(subscription.sender_email));

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call the bulk-email-actions function to handle unsubscribe
      const response = await supabase.functions.invoke('bulk-email-actions', {
        body: {
          senderEmail: subscription.sender_email,
          action: 'unsubscribe',
          unsubscribeUrl: subscription.unsubscribe_url,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Unsubscribed successfully",
        description: `You've been unsubscribed from ${subscription.sender_name || subscription.sender_email}`,
      });

      // Refresh the list
      refetch();

    } catch (error: any) {
      console.error('Unsubscribe error:', error);
      toast({
        title: "Unsubscribe failed",
        description: error.message || "Failed to unsubscribe. You may need to unsubscribe manually.",
        variant: "destructive",
      });
    } finally {
      setUnsubscribing(prev => {
        const next = new Set(prev);
        next.delete(subscription.sender_email);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!subscriptions || subscriptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Subscriptions Found</CardTitle>
          <CardDescription>
            Click "Analyze Emails" to find subscriptions in your inbox
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalEmails = subscriptions.reduce((sum, s) => sum + s.email_count, 0);

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Subscriptions Found</CardDescription>
          <CardTitle className="text-3xl">{subscriptions.length}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {totalEmails} total emails from these subscriptions
          </p>
        </CardHeader>
      </Card>

      {/* Subscriptions - Mobile Card Layout */}
      <div className="block lg:hidden space-y-4">
        {subscriptions.map((subscription) => (
          <Card key={subscription.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base line-clamp-1">
                    {subscription.sender_name || subscription.sender_email}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1 line-clamp-1">
                    {subscription.sender_email}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {subscription.email_count} emails
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span>Summary</span>
                </div>
                <p className="text-sm">{subscription.ai_summary}</p>
              </div>
              <Button
                onClick={() => handleUnsubscribe(subscription)}
                disabled={unsubscribing.has(subscription.sender_email)}
                variant="destructive"
                className="w-full h-12"
                size="lg"
              >
                {unsubscribing.has(subscription.sender_email) ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Unsubscribing...
                  </>
                ) : (
                  <>
                    <Mail className="h-5 w-5 mr-2" />
                    Unsubscribe
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscriptions - Desktop Table Layout */}
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle>Your Email Subscriptions</CardTitle>
          <CardDescription>
            Review AI-generated summaries and unsubscribe with one click
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Emails</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {subscription.sender_name || subscription.sender_email}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {subscription.sender_email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm max-w-md">{subscription.ai_summary}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      {subscription.email_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleUnsubscribe(subscription)}
                        disabled={unsubscribing.has(subscription.sender_email)}
                        variant="destructive"
                        size="sm"
                      >
                        {unsubscribing.has(subscription.sender_email) ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Unsubscribing...
                          </>
                        ) : (
                          <>
                            <Mail className="h-4 w-4 mr-2" />
                            Unsubscribe
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailCleanupDashboard;
