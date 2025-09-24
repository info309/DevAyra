import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Receipt, Upload } from 'lucide-react';
import FileUpload from './FileUpload';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ReceiptUploadDialogProps {
  onReceiptUploaded: () => void;
}

const ReceiptUploadDialog: React.FC<ReceiptUploadDialogProps> = ({ onReceiptUploaded }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  const [formData, setFormData] = useState({
    merchant_name: '',
    total_amount: '',
    currency: 'gbp',
    date: new Date().toISOString().split('T')[0],
    category: '',
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      merchant_name: '',
      total_amount: '',
      currency: 'gbp',
      date: new Date().toISOString().split('T')[0],
      category: '',
      notes: ''
    });
    setSelectedFiles([]);
  };

  const handleUpload = async (files: File[], metadata: { category?: string; description?: string }) => {
    if (!user || files.length === 0) return;

    setIsUploading(true);
    
    try {
      // Upload file to storage
      const file = files[0]; // For receipts, we typically handle one file at a time
      const fileExt = file.name.split('.').pop();
      const fileName = `receipt_${Date.now()}.${fileExt}`;
      const filePath = `receipts/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create receipt record in invoices table
      const totalCents = Math.round(parseFloat(formData.total_amount || '0') * 100);
      
      const { error: insertError } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          type: 'receipt',
          status: 'paid',
          customer_name: formData.merchant_name,
          customer_email: '', // Not required for receipts
          total_cents: totalCents,
          currency: formData.currency,
          issue_date: formData.date,
          notes: formData.notes,
          line_items: [
            {
              description: `Receipt from ${formData.merchant_name}`,
              quantity: 1,
              unit_price_cents: totalCents,
              tax_rate_percent: 0,
              amount_cents: totalCents
            }
          ],
          subtotal_cents: totalCents,
          tax_cents: 0,
          paid_at: formData.date,
          // Store file path for future reference
          pdf_path: `documents/${filePath}`
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Receipt uploaded successfully",
      });

      setOpen(false);
      resetForm();
      onReceiptUploaded();
      
    } catch (error) {
      console.error('Error uploading receipt:', error);
      toast({
        title: "Error",
        description: "Failed to upload receipt",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full sm:w-auto">
          <Receipt className="w-4 h-4 mr-2" />
          Upload Receipt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Upload Receipt
          </DialogTitle>
          <DialogDescription>
            Upload a receipt image or PDF and add details for your records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Receipt Details Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="merchant">Merchant/Vendor *</Label>
              <Input
                id="merchant"
                value={formData.merchant_name}
                onChange={(e) => setFormData({ ...formData, merchant_name: e.target.value })}
                placeholder="e.g., Office Depot, Amazon"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="amount">Total Amount *</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                  required
                  className="flex-1"
                />
                <select 
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="px-3 py-2 border border-input rounded-md bg-background text-sm"
                >
                  <option value="gbp">GBP</option>
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="date">Receipt Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Office Supplies, Travel"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this receipt..."
              rows={3}
            />
          </div>

          {/* File Upload */}
          <div>
            <Label>Receipt File *</Label>
            <FileUpload
              onFileSelect={setSelectedFiles}
              onUpload={handleUpload}
              isUploading={isUploading}
              maxFiles={1}
              acceptedFileTypes={['image/*', 'application/pdf']}
              className="mt-2"
            />
          </div>

          {/* Submit Button */}
          {selectedFiles.length > 0 && (
            <Button 
              onClick={() => handleUpload(selectedFiles, { category: formData.category, description: formData.notes })}
              disabled={isUploading || !formData.merchant_name || !formData.total_amount}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Uploading...' : 'Upload Receipt'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptUploadDialog;