import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, User, LogOut, Clock } from 'lucide-react';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import GmailConnection from '@/components/GmailConnection';
import StripeConnectionCard from '@/components/StripeConnectionCard';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Account: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isDrawerView = useIsDrawerView();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [timezone, setTimezone] = useState('GMT');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const timezones = [
    { value: 'GMT', label: 'GMT (Greenwich Mean Time)', iana: 'GMT' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)', iana: 'UTC' },
    { value: 'EST', label: 'EST (Eastern Standard Time)', iana: 'America/New_York' },
    { value: 'PST', label: 'PST (Pacific Standard Time)', iana: 'America/Los_Angeles' },
    { value: 'CET', label: 'CET (Central European Time)', iana: 'Europe/Paris' },
    { value: 'JST', label: 'JST (Japan Standard Time)', iana: 'Asia/Tokyo' },
    { value: 'AEST', label: 'AEST (Australian Eastern Standard Time)', iana: 'Australia/Sydney' },
    { value: 'IST', label: 'IST (India Standard Time)', iana: 'Asia/Kolkata' },
  ];

  useEffect(() => {
    fetchUserTimezone();
  }, [user]);

  const fetchUserTimezone = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('user_id', user.id)
      .single();
    
    if (data?.timezone) {
      setTimezone(data.timezone);
    }
  };

  const updateTimezone = async (newTimezone: string) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: newTimezone })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      setTimezone(newTimezone);
      toast({
        title: "Timezone Updated",
        description: `Your timezone has been set to ${timezones.find(tz => tz.value === newTimezone)?.label}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update timezone preference.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const ProfileCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5" />
          Profile Information
        </CardTitle>
        <CardDescription>
          Your account details and basic information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-base">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">User ID</label>
            <p className="text-sm text-muted-foreground font-mono break-all">{user?.id}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Account Created</label>
            <p className="text-base">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const TimezoneCard = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Timezone Settings
        </CardTitle>
        <CardDescription>
          Set your preferred timezone for calendar events and scheduling
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Current Timezone</label>
            <Select value={timezone} onValueChange={updateTimezone} disabled={loading}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <strong>System Time in {timezone}:</strong>
            </div>
            <div className="text-base font-mono bg-muted/50 p-2 rounded border">
              {new Date().toLocaleString('en-US', { 
                timeZone: timezones.find(tz => tz.value === timezone)?.iana || 'GMT',
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isDrawerView) {
    return (
      <div className="min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="sticky top-0 z-50 bg-background border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToDashboard}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-2xl font-bold">Account</h1>
            </div>
            
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Mobile Content */}
        <div className="p-4 space-y-4 pb-safe">
          <div className="mb-4">
            <p className="text-muted-foreground text-sm">
              Manage your account and connected services
            </p>
          </div>

          <ProfileCard />
          <TimezoneCard />
          <StripeConnectionCard />
          <GmailConnection />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile/Tablet Back Arrow and Logo - Left side */}
              <div className="flex lg:hidden items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBackToDashboard}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <h1 className="text-2xl font-bold">Account</h1>
              </div>
              
              {/* Desktop Header */}
              <div className="hidden lg:flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToDashboard}
                  className="gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Dashboard
                </Button>
                <h1 className="text-2xl font-bold">Account</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <p className="text-muted-foreground">
            Manage your account and connected services
          </p>
        </div>

        <div className="grid gap-6">
          <ProfileCard />
          <TimezoneCard />
          <StripeConnectionCard />
          <GmailConnection />
        </div>
      </div>
    </div>
  );
};

export default Account;
