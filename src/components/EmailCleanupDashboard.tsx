import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnalysisRecord {
  id: string;
  sender_email: string;
  sender_name: string;
  sender_domain: string;
  email_count: number;
  unread_count: number;
  has_unsubscribe_header: boolean;
  user_opened_count: number;
  user_replied_count: number;
  contains_important_keywords: boolean;
  important_keywords: string[];
  recommended_action: string;
  first_email_date: string;
  last_email_date: string;
}

const EmailCleanupDashboard = () => {
  const { toast } = useToast();
  const [processingEmails, setProcessingEmails] = useState<Set<string>>(new Set());

  const { data: analysisData, isLoading, refetch } = useQuery({
    queryKey: ['email-cleanup-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_cleanup_analysis')
        .select('*')
        .order('email_count', { ascending: false });

      if (error) throw error;
      return data as AnalysisRecord[];
    },
  });

  const handleAction = async (senderEmail: string, action: string) => {
    setProcessingEmails(prev => new Set(prev).add(senderEmail));

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('bulk-email-actions', {
        body: {
          senderEmail,
          action,
          labelName: action === 'organize' ? 'Subscriptions' : undefined,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Action completed",
        description: `${action} applied to ${response.data.emailsProcessed} emails from ${senderEmail}`,
      });

      // Refresh the analysis
      refetch();

    } catch (error: any) {
      console.error('Action error:', error);
      toast({
        title: "Action failed",
        description: error.message || "Failed to perform action",
        variant: "destructive",
      });
    } finally {
      setProcessingEmails(prev => {
        const next = new Set(prev);
        next.delete(senderEmail);
        return next;
      });
    }
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, any> = {
      unsubscribe: { variant: "destructive", icon: AlertCircle },
      organize: { variant: "secondary", icon: TrendingUp },
      keep: { variant: "default", icon: CheckCircle },
      review: { variant: "outline", icon: Mail },
    };

    const config = variants[action] || variants.review;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {action}
      </Badge>
    );
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

  if (!analysisData || analysisData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Analysis Data</CardTitle>
          <CardDescription>
            Click "Analyze Emails" to start analyzing your inbox
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stats = {
    totalSenders: analysisData.length,
    totalEmails: analysisData.reduce((sum, r) => sum + r.email_count, 0),
    unsubscribeRecommended: analysisData.filter(r => r.recommended_action === 'unsubscribe').length,
    organizeRecommended: analysisData.filter(r => r.recommended_action === 'organize').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Senders</CardDescription>
            <CardTitle className="text-3xl">{stats.totalSenders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Emails</CardDescription>
            <CardTitle className="text-3xl">{stats.totalEmails}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unsubscribe</CardDescription>
            <CardTitle className="text-3xl">{stats.unsubscribeRecommended}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>To Organize</CardDescription>
            <CardTitle className="text-3xl">{stats.organizeRecommended}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Email Analysis Table */}
      <Card>
        <CardHeader>
          <CardTitle>Email Analysis by Sender</CardTitle>
          <CardDescription>
            Review and take action on emails grouped by sender
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sender</TableHead>
                  <TableHead className="text-right">Emails</TableHead>
                  <TableHead className="text-right">Unread</TableHead>
                  <TableHead>Interaction</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysisData.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{record.sender_name || record.sender_email}</span>
                        <span className="text-sm text-muted-foreground">{record.sender_email}</span>
                        {record.contains_important_keywords && (
                          <div className="flex gap-1 mt-1">
                            {record.important_keywords.slice(0, 3).map(kw => (
                              <Badge key={kw} variant="outline" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{record.email_count}</TableCell>
                    <TableCell className="text-right">{record.unread_count}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>Opened: {record.user_opened_count}</div>
                        <div>Replied: {record.user_replied_count}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getActionBadge(record.recommended_action)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        disabled={processingEmails.has(record.sender_email)}
                        onValueChange={(value) => handleAction(record.sender_email, value)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Take action" />
                        </SelectTrigger>
                        <SelectContent>
                          {record.has_unsubscribe_header && (
                            <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                          )}
                          <SelectItem value="organize">Move to folder</SelectItem>
                          <SelectItem value="trash">Move to trash</SelectItem>
                          <SelectItem value="delete">Delete permanently</SelectItem>
                        </SelectContent>
                      </Select>
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
