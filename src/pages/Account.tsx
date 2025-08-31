import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, User, LogOut, Clock } from 'lucide-react';
import { useIsDrawerView } from '@/hooks/use-drawer-view';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import GmailConnection from '@/components/GmailConnection';

const Account: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isDrawerView = useIsDrawerView();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [timezone, setTimezone] = useState<string>('GMT');
  const [loading, setLoading] = useState(false);

  const timezones = [
    { value: 'GMT', label: 'GMT (Greenwich Mean Time)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'EST', label: 'EST (Eastern Standard Time)' },
    { value: 'PST', label: 'PST (Pacific Standard Time)' },
    { value: 'CET', label: 'CET (Central European Time)' },
    { value: 'JST', label: 'JST (Japan Standard Time)' },
    { value: 'AEST', label: 'AEST (Australian Eastern Standard Time)' },
  ];

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('user_id', user.id)
        .single();
      
      if (data?.timezone) {
        setTimezone(data.timezone);
      }
    };

    fetchProfile();
  }, [user?.id]);

  const updateTimezone = async (newTimezone: string) => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ timezone: newTimezone })
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setTimezone(newTimezone);
      toast({
        title: 'Timezone updated',
        description: `Your timezone has been set to ${newTimezone}`,
      });
    } catch (error) {
      console.error('Error updating timezone:', error);
      toast({
        title: 'Error',
        description: 'Failed to update timezone. Please try again.',
        variant: 'destructive',
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
          <div className="text-sm text-muted-foreground">
            Current system time: {new Date().toLocaleString('en-US', { 
              timeZone: timezone === 'GMT' ? 'GMT' : timezone,
              timeZoneName: 'short'
            })}
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
          <GmailConnection />
        </div>
      </div>
    </div>
  );
};

export default Account;