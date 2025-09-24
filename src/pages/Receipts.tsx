import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, MoreHorizontal, Eye, Download, Trash2, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ReceiptUploadDialog from '@/components/ReceiptUploadDialog';
import type { Database } from '@/integrations/supabase/types';

type ReceiptRecord = Database['public']['Tables']['invoices']['Row'];

const Receipts = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchReceipts();
    }
  }, [user]);

  const fetchReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user?.id)
        .eq('type', 'receipt')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Receipt deleted successfully",
      });
      
      fetchReceipts();
    } catch (error) {
      console.error('Failed to delete receipt:', error);
      toast({
        title: "Error",
        description: "Failed to delete receipt",
        variant: "destructive"
      });
    }
  };

  const handleViewReceipt = (receipt: ReceiptRecord) => {
    if (receipt.pdf_path) {
      // If it's a document stored in storage
      if (receipt.pdf_path.startsWith('documents/')) {
        const documentUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
        window.open(documentUrl, '_blank');
      } else {
        // If it's a PDF path in invoices bucket
        const pdfUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
        window.open(pdfUrl, '_blank');
      }
    } else {
      toast({
        title: "No document",
        description: "No document is associated with this receipt",
        variant: "destructive"
      });
    }
  };

  const handleDownloadReceipt = async (receipt: ReceiptRecord) => {
    if (!receipt.pdf_path) {
      toast({
        title: "No document",
        description: "No document is associated with this receipt",
        variant: "destructive"
      });
      return;
    }

    try {
      let downloadUrl: string;
      
      if (receipt.pdf_path.startsWith('documents/')) {
        downloadUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
      } else {
        downloadUrl = `https://lmkpmnndrygjatnipfgd.supabase.co/storage/v1/object/public/${receipt.pdf_path}`;
      }

      // Create a temporary link element to trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `receipt_${receipt.customer_name}_${format(new Date(receipt.created_at), 'yyyy-MM-dd')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Success",
        description: "Receipt download started",
      });
    } catch (error) {
      console.error('Failed to download receipt:', error);
      toast({
        title: "Error",
        description: "Failed to download receipt",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Receipts</h1>
        </div>
        <div className="text-center py-8">Loading receipts...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Receipts</h1>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="text-sm text-muted-foreground">
          {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
        </div>
        <ReceiptUploadDialog onReceiptUploaded={fetchReceipts} />
      </div>

      {receipts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="w-12 h-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No receipts yet</CardTitle>
            <CardDescription className="text-center mb-4">
              Upload your first receipt to get started with expense tracking
            </CardDescription>
            <ReceiptUploadDialog onReceiptUploaded={fetchReceipts} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your Receipts</CardTitle>
            <CardDescription>
              Manage and track your uploaded receipts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="font-medium">
                        {receipt.customer_name}
                      </TableCell>
                      <TableCell>
                        {format(new Date(receipt.created_at), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(receipt.total_cents, receipt.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          Paid
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewReceipt(receipt)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadReceipt(receipt)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(receipt.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Receipts;