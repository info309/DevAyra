import React, { useState, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Receipt, Upload, Camera, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';

interface ReceiptUploadDialogProps {
  onReceiptUploaded: () => void;
}

interface ReceiptData {
  merchant_name: string;
  total_amount: string;
  currency: string;
  date: string;
  subtotal_amount?: string;
  vat_amount?: string;
  vat_rate?: string;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: string;
    amount: string;
  }>;
}

const ReceiptUploadDialog: React.FC<ReceiptUploadDialogProps> = ({ onReceiptUploaded }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  
  const [formData, setFormData] = useState({
    merchant_name: '',
    total_amount: '',
    subtotal_amount: '',
    vat_amount: '',
    vat_rate: '',
    currency: 'gbp',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      merchant_name: '',
      total_amount: '',
      subtotal_amount: '',
      vat_amount: '',
      vat_rate: '',
      currency: 'gbp',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setReceiptImage(null);
    setImagePreview(null);
    setAnalysisComplete(false);
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove the data URL prefix to get just the base64 data
        resolve(base64.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const analyzeReceipt = async (imageFile: File) => {
    setIsAnalyzing(true);
    try {
      const base64Image = await fileToBase64(imageFile);
      
      const { data, error } = await supabase.functions.invoke('analyze-receipt', {
        body: { image_base64: base64Image }
      });

      if (error) throw error;

      if (data.success && data.receipt_data) {
        const receiptData: ReceiptData = data.receipt_data;
        
        // Auto-populate form fields
        setFormData({
          merchant_name: receiptData.merchant_name || '',
          total_amount: receiptData.total_amount || '',
          subtotal_amount: receiptData.subtotal_amount || '',
          vat_amount: receiptData.vat_amount || '',
          vat_rate: receiptData.vat_rate || '',
          currency: receiptData.currency || 'gbp',
          date: receiptData.date || new Date().toISOString().split('T')[0],
          notes: receiptData.line_items ? 
            receiptData.line_items.map(item => 
              `${item.description} x${item.quantity} - ${item.amount}`
            ).join('\n') : ''
        });

        setAnalysisComplete(true);
        
        toast({
          title: "Receipt Analyzed",
          description: "Receipt information has been automatically extracted and populated.",
        });
      } else {
        throw new Error(data.error || 'Failed to analyze receipt');
      }
    } catch (error) {
      console.error('Error analyzing receipt:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze the receipt automatically. Please fill in the details manually.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setReceiptImage(file);
      
      // Create image preview
      const imageUrl = URL.createObjectURL(file);
      setImagePreview(imageUrl);
      
      // Automatically analyze the receipt
      await analyzeReceipt(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxFiles: 1,
    disabled: isAnalyzing || isUploading
  });

  const handleSaveReceipt = async () => {
    if (!user || !receiptImage) return;

    setIsUploading(true);
    
    try {
      // Upload file to storage
      const fileExt = receiptImage.name.split('.').pop();
      const fileName = `receipt_${Date.now()}.${fileExt}`;
      const filePath = `receipts/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, receiptImage);

      if (uploadError) throw uploadError;

      // Create receipt record in invoices table
      const totalCents = Math.round(parseFloat(formData.total_amount || '0') * 100);
      const subtotalCents = Math.round(parseFloat(formData.subtotal_amount || formData.total_amount || '0') * 100);
      const vatCents = Math.round(parseFloat(formData.vat_amount || '0') * 100);
      
      const { error: insertError } = await supabase
        .from('invoices')
        .insert({
          user_id: user.id,
          type: 'receipt',
          status: 'paid',
          customer_name: formData.merchant_name,
          customer_email: '', // Not required for receipts
          total_cents: totalCents,
          subtotal_cents: subtotalCents,
          tax_cents: vatCents,
          currency: formData.currency,
          issue_date: formData.date,
          notes: formData.notes,
          line_items: [
            {
              description: `Receipt from ${formData.merchant_name}`,
              quantity: 1,
              unit_price_cents: subtotalCents,
              tax_rate_percent: formData.vat_rate ? parseFloat(formData.vat_rate) : 0,
              amount_cents: subtotalCents
            }
          ],
          paid_at: formData.date,
          // Store file path for future reference
          pdf_path: `documents/${filePath}`
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Receipt saved successfully with AI-extracted data!",
      });

      setOpen(false);
      resetForm();
      onReceiptUploaded();
      
    } catch (error) {
      console.error('Error saving receipt:', error);
      toast({
        title: "Error",
        description: "Failed to save receipt",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
      }
    }}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full sm:w-auto">
          Upload Receipt
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-center sm:text-left">
          <DrawerTitle>
            Upload & Analyze Receipt
          </DrawerTitle>
          <DrawerDescription>
            Upload a photo of your receipt and let AI automatically extract the details.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Image Upload Section */}
          <div className="space-y-4">
            <Label>Receipt Image *</Label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              } ${(isAnalyzing || isUploading) ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input {...getInputProps()} />
              
              {imagePreview ? (
                <div className="space-y-3">
                  <img 
                    src={imagePreview} 
                    alt="Receipt preview" 
                    className="max-h-48 mx-auto rounded-lg shadow-md"
                  />
                  {isAnalyzing && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing receipt with AI...
                    </div>
                  )}
                  {analysisComplete && (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                      <Check className="w-4 h-4" />
                      Receipt analyzed successfully!
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Camera className="w-12 h-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {isDragActive ? 'Drop your receipt here' : 'Click or drag to upload receipt'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports PNG, JPG, JPEG, WEBP
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="merchant">Merchant/Vendor *</Label>
              <Input
                id="merchant"
                value={formData.merchant_name}
                onChange={(e) => setFormData({ ...formData, merchant_name: e.target.value })}
                placeholder="e.g., Office Depot, Amazon"
                required
                disabled={isAnalyzing || isUploading}
              />
            </div>

            <div>
              <Label htmlFor="date">Receipt Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                disabled={isAnalyzing || isUploading}
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="currency">Currency *</Label>
              <select 
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
                disabled={isAnalyzing || isUploading}
              >
                <option value="gbp">GBP (£)</option>
                <option value="usd">USD ($)</option>
                <option value="eur">EUR (€)</option>
              </select>
            </div>
          </div>

          {/* Financial Details */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Financial Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subtotal">Subtotal (Before VAT)</Label>
                <Input
                  id="subtotal"
                  type="number"
                  step="0.01"
                  value={formData.subtotal_amount}
                  onChange={(e) => setFormData({ ...formData, subtotal_amount: e.target.value })}
                  placeholder="0.00"
                  disabled={isAnalyzing || isUploading}
                />
              </div>

              <div>
                <Label htmlFor="vat-rate">VAT Rate (%)</Label>
                <Input
                  id="vat-rate"
                  type="number"
                  step="0.1"
                  value={formData.vat_rate}
                  onChange={(e) => setFormData({ ...formData, vat_rate: e.target.value })}
                  placeholder="e.g., 20"
                  disabled={isAnalyzing || isUploading}
                />
              </div>

              <div>
                <Label htmlFor="vat-amount">VAT Amount</Label>
                <Input
                  id="vat-amount"
                  type="number"
                  step="0.01"
                  value={formData.vat_amount}
                  onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
                  placeholder="0.00"
                  disabled={isAnalyzing || isUploading}
                />
              </div>

              <div>
                <Label htmlFor="total-amount">Total Amount *</Label>
                <Input
                  id="total-amount"
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                  required
                  disabled={isAnalyzing || isUploading}
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes / Line Items</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes or extracted line items..."
              rows={4}
              disabled={isAnalyzing || isUploading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={isAnalyzing || isUploading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveReceipt}
              disabled={isAnalyzing || isUploading || !receiptImage || !formData.merchant_name || !formData.total_amount}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Save Receipt
                </>
              )}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ReceiptUploadDialog;