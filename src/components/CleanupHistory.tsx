import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

interface HistoryRecord {
  id: string;
  action_type: string;
  sender_email: string;
  sender_domain: string;
  emails_affected: number;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const CleanupHistory = () => {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['cleanup-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleanup_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as HistoryRecord[];
    },
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      completed: { variant: "default", icon: CheckCircle, label: "Completed" },
      failed: { variant: "destructive", icon: XCircle, label: "Failed" },
      processing: { variant: "secondary", icon: Clock, label: "Processing" },
      pending: { variant: "outline", icon: Clock, label: "Pending" },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
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

  if (!historyData || historyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No History</CardTitle>
          <CardDescription>
            Your cleanup actions will appear here
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cleanup History</CardTitle>
        <CardDescription>
          Track your email cleanup actions and their results
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyData.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium capitalize">
                    {record.action_type}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{record.sender_email}</span>
                      <span className="text-xs text-muted-foreground">
                        {record.sender_domain}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {record.emails_affected}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(record.status)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {record.error_message || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CleanupHistory;
