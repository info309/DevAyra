import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Mail, Calendar, FileText, Receipt, FolderOpen, Shield, Zap, Clock, Lock, Play, Pause, ShieldCheck, Key, ShieldEllipsis, Database, DollarSign, Brain } from 'lucide-react';
import heroImage from '@/assets/ai-assistant-hero.png';


const TypewriterText = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text]);

  return (
    <div className="relative">
      <span>{displayText}</span>
      {currentIndex >= text.length && (
        <span className="animate-cursor border-r-2 border-primary ml-1 animate-pulse"></span>
      )}
    </div>
  );
};

const AuthModule = ({ onSuccess }: { onSuccess: () => void }) => {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);
    
    if (error) {
      setError(error.message);
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message
      });
    } else {
      onSuccess();
    }
    
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signUp(email, password, firstName);
    
    if (error) {
      setError(error.message);
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message
      });
    } else {
      toast({
        title: "Account Created!",
        description: "Please check your email to confirm your account."
      });
    }
    
    setLoading(false);
  };

  return (
    <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border/50">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-heading text-card-foreground">Join Ayra</CardTitle>
        <CardDescription>Start your productivity journey</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-firstname">First Name</Label>
                <Input
                  id="signup-firstname"
                  type="text"
                  placeholder="Enter your first name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const Index = () => {
  const [heroEmail, setHeroEmail] = useState('');
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showGmailConsent, setShowGmailConsent] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);

  // Debug modal state changes
  useEffect(() => {
    console.log('Homepage: showGmailConsent state changed to:', showGmailConsent);
    if (showGmailConsent) {
      console.log('Homepage: Gmail consent popup should be visible now!');
    }
  }, [showGmailConsent]);

  const connectGmail = async () => {
    if (!user) return;
    
    try {
      setConnectingGmail(true);
      
      // Get auth URL from the edge function
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lmkpmnndrygjatnipfgd.supabase.co";
          const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxta3Btbm5kcnlnamF0bmlwZmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNzc3MTQsImV4cCI6MjA3MTk1MzcxNH0.lUFp3O--gVkDEyjcUgNXJY1JB8gQEgLzr8Rqqm8QZQA";
          const response = await fetch(`${SUPABASE_URL}/functions/v1/gmail-auth?userId=${user.id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            }
          });

      if (!response.ok) {
        throw new Error('Failed to get Gmail auth URL');
      }

      const { authUrl } = await response.json();
      
      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting Gmail:', error);
      toast({
        title: "Error",
        description: "Failed to initiate Gmail connection.",
        variant: "destructive"
      });
      setConnectingGmail(false);
    }
  };
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!loading && user) {
      console.log('Homepage: User loaded, checking for Gmail prompt');
      console.log('Homepage: Current URL =', window.location.href);
      
      // Check if we should prompt for Gmail connection
      const shouldPromptGmail = localStorage.getItem('prompt_gmail_connect') === '1';
      const promptDismissedThisSession = sessionStorage.getItem('gmail_prompt_dismissed') === '1';
      const isGoogleUser = (user.app_metadata as any)?.provider === 'google';
      
      console.log('Homepage: shouldPromptGmail =', shouldPromptGmail);
      console.log('Homepage: promptDismissedThisSession =', promptDismissedThisSession);
      console.log('Homepage: isGoogleUser =', isGoogleUser);
      console.log('Homepage: localStorage prompt_gmail_connect =', localStorage.getItem('prompt_gmail_connect'));
      console.log('Homepage: user.app_metadata =', user.app_metadata);
      
      // Only show Gmail prompt for Google users who need it and haven't dismissed it this session
      if (shouldPromptGmail && isGoogleUser && !promptDismissedThisSession) {
        console.log('Homepage: Showing Gmail consent popup for Google user without Gmail connection');
        setShowGmailConsent(true);
        localStorage.removeItem('prompt_gmail_connect');
      } else if (shouldPromptGmail) {
        console.log('Homepage: Clearing stale Gmail prompt flag for non-Google user or dismissed this session');
        localStorage.removeItem('prompt_gmail_connect');
        navigate('/dashboard');
      } else {
        console.log('Homepage: Redirecting to dashboard (no Gmail prompt needed)');
        navigate('/dashboard');
      }
    }
  }, [user, loading, navigate]);

  // Handle Gmail connection success/error messages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('gmail_auth') === 'success') {
      toast({
        title: "Gmail Connected Successfully!",
        description: "Your Gmail and Calendar have been successfully linked to Ayra.",
      });
      // Clean up URL and redirect to dashboard after success
      window.history.replaceState({}, document.title, window.location.pathname);
      // Clear any Gmail prompt flags since connection is now successful
      localStorage.removeItem('prompt_gmail_connect');
      // Redirect to dashboard after a short delay to let user see the toast
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } else if (urlParams.get('gmail_auth') === 'error') {
      const errorMessage = urlParams.get('error') || 'Failed to connect your Gmail account. Please try again.';
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive"
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [toast, navigate]);

  const handleVideoToggle = () => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const productivityTools = [
    {
      icon: Mail,
      title: 'Mailbox (Gmail)',
      description: 'Connect your Gmail account for seamless email management. Smart threading, search, and AI-powered organization keep your inbox under control.',
      features: ['Gmail Integration', 'Smart Threading', 'AI Organization'],
      image: '/lovable-uploads/690a95aa-24fc-4792-aa90-f9cd1f512385.png'
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'Sync with Google Calendar to never miss important events. Smart scheduling, reminders, and meeting management all in one place.',
      features: ['Google Calendar Sync', 'Smart Reminders', 'Meeting Management'],
      image: '/lovable-uploads/77033c20-8408-4764-a8de-03af915812c4.png'
    },
    {
      icon: FileText,
      title: 'Notes',
      description: 'Capture thoughts with rich text editing, password protection, and smart organization. Lock sensitive notes with built-in security.',
      features: ['Rich Text Editor', 'Password Lock', 'Smart Organization'],
      image: '/lovable-uploads/6d429c69-a608-4a98-bab2-24f0566fb90d.png'
    },
    {
      icon: Receipt,
      title: 'Invoices',
      description: 'Create professional invoices with Stripe integration. Send, track, and manage payments with automated follow-ups and reporting.',
      features: ['Stripe Integration', 'Payment Tracking', 'Automated Follow-ups'],
      image: '/lovable-uploads/01bfd4a7-1c5b-4479-bc09-927426a5ff7a.png'
    },
    {
      icon: FolderOpen,
      title: 'Documents',
      description: 'Store and organize files with drag-and-drop simplicity. Version control, sharing, and secure storage for all your important documents.',
      features: ['Drag & Drop Upload', 'Version Control', 'Secure Storage'],
      image: '/lovable-uploads/3f43df0b-172f-41eb-900b-8e87884c3e13.png'
    },
    {
      icon: DollarSign,
      title: 'Finances',
      description: 'Track your financial health with receipt uploads, expense categorization, and comprehensive reporting. View paid invoices and manage your money with ease.',
      features: ['Receipt Processing', 'Expense Tracking', 'Financial Reports'],
      image: '/lovable-uploads/5340884b-d242-4cd3-a6fd-5addecf0c05e.png'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-3xl font-heading font-normal text-gray-800 dark:text-gray-200">/Ayra</h1>
          <Button 
            onClick={() => navigate('/auth')}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section - Responsive Layout */}
      <section className="pt-32 pb-16 min-h-[80vh] flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          {/* Centered Title for Desktop */}
          <div className="text-center mb-12 lg:mb-16">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-4" style={{ lineHeight: 1.1 }}>
              <span className="text-compose">One login. One AI.</span><br />
              <span>Unlimited productivity.</span>
            </h1>
            <p className="text-base text-foreground mb-8 font-body font-medium">
              Your personal AI assistant
            </p>
          </div>

          <div className="hidden md:flex md:flex-row md:items-start md:justify-center lg:gap-16 h-full">
            {/* Left Half - Image */}
            <div className="md:flex-1 lg:flex-1 md:flex md:justify-center lg:justify-center mb-8 md:mb-0 lg:mb-0">
              <div className="max-w-md w-full">
                <img 
                  src={heroImage} 
                  alt="AI Assistant Illustration" 
                  className="w-full h-auto rounded-lg"
                />
              </div>
            </div>

            {/* Right Half - Sign Up Module */}
            <div className="md:flex-1 lg:flex-1 md:flex md:justify-center lg:justify-center md:items-start lg:items-start">
              <div className="w-full max-w-sm md:bg-muted/20 lg:bg-muted/20 md:rounded-lg lg:rounded-lg md:p-6 lg:p-8 md:border md:border-border/50 lg:border lg:border-border/50">
                <div className="space-y-4">
                  {/* Sign up with Google */}
                  <Button 
                    onClick={() => window.location.href = 'https://accounts.google.com/v3/signin/accountchooser?access_type=offline&client_id=727830807653-42ha4jskf1mjrsqb5t70hpe867191gm1.apps.googleusercontent.com&prompt=consent&redirect_to=https%3A%2F%2Fayra.app%2F&redirect_uri=https%3A%2F%2Flmkpmnndrygjatnipfgd.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&state=eyJhbGciOiJIUzI1NiIsImtpZCI6IlJGNWFxWk9LQjV6V0hxQVAiLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE3NTkwNTc3MDEsInNpdGVfdXJsIjoiaHR0cHM6Ly9heXJhLXVuaWZpZWQtc3VpdGUubG92YWJsZS5hcHAiLCJpZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsImZ1bmN0aW9uX2hvb2tzIjpudWxsLCJwcm92aWRlciI6Imdvb2dsZSIsInJlZmVycmVyIjoiaHR0cHM6Ly9heXJhLXVuaWZpZWQtc3VpdGUubG92YWJsZS5hcHAiLCJmbG93X3N0YXRlX2lkIjoiIn0.PU-uuohjozw6wBSSICNuJEPU2GlUQTl6_4J6AHYU-98&dsh=S-652114444%3A1759057401538172&o2v=2&service=lso&flowName=GeneralOAuthFlow&opparams=%253Fredirect_to%253Dhttps%25253A%25252F%25252Fayra.app%25252F&continue=https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Fconsent%3Fauthuser%3Dunknown%26part%3DAJi8hAPkalVyyONo0ugzoCJa0muakZafRWcoRDs5iE6mclf6Yh4NLpRIHVew0M3OPhyIeB1DD0c9MGI2poj-j5k2wt5M74zsuCAv6sc7zz2CppqripA_OROcQiWA85ubsKijc13UGz6KnsFIeqQM0TWWmT3KvdVYrWxqhf0TkgJ3XoRl8PUAeYRjvE_zAGSn1HOFOO0308MYtdQ4Nb5ruXnwOfVtVOFvDzcSX_9iacqAmnCqLcBKPrg7ik7HQjmkLbcODAkva-kvrlMtgF7YgsLHQx4oVhibP-xDZtcbZ3d-S2JABQkUkfudlBYj24ub3wmub97MK6mtg8HzEgLFDAylPo1eQDrK0VTpWdeM_QJdGt9JOd5u4iZlp1TbYZRZOOdX0wyPHSEypGtdfTQxQWQgx6BMBWQWHSEMIqLtdQdkzkGGlGq9LKRkexGEOeqpn5A17Lyvy4CRx7rKjZI9-FCQpwOi3HWqGHr28VBoeNLJtH6N94NzUmk%26flowName%3DGeneralOAuthFlow%26as%3DS-652114444%253A1759057401538172%26client_id%3D727830807653-42ha4jskf1mjrsqb5t70hpe867191gm1.apps.googleusercontent.com%23&app_domain=https%3A%2F%2Flmkpmnndrygjatnipfgd.supabase.co'}
                    variant="outline"
                    className="w-full flex items-center justify-center gap-3 py-2.5 h-auto text-base bg-background hover:bg-muted font-body font-medium"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign up with Google
                  </Button>

                  {/* OR Divider */}
                  <div className="flex items-center my-4">
                    <div className="flex-1 border-t border-border"></div>
                    <span className="px-3 text-base text-muted-foreground font-body">OR</span>
                    <div className="flex-1 border-t border-border"></div>
                  </div>

                  {/* Email Input */}
                  <Input
                    type="email"
                    placeholder="Enter your personal or work email"
                    value={heroEmail}
                    onChange={(e) => setHeroEmail(e.target.value)}
                    className="w-full py-2.5 h-auto text-base font-body font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
                  />

                  {/* Continue with Email Button */}
                  <Button 
                    onClick={() => navigate(`/signup${heroEmail ? `?email=${encodeURIComponent(heroEmail)}` : ''}`)}
                    className="w-full bg-foreground hover:bg-foreground/90 text-background text-base py-2.5 h-auto font-body font-medium"
                  >
                    Continue with email
                  </Button>

                  {/* Privacy Policy Text */}
                  <p className="text-xs text-muted-foreground text-center lg:text-left mt-4 font-body font-medium">
                    By continuing, you acknowledge Ayra's Privacy Policy.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Layout - Image and Login */}
          <div className="md:hidden text-center">
            <div className="mt-6 mb-8">
                <img 
                  src="/lovable-uploads/81fcbe09-eea5-49d4-8d19-09cd6d5dbf7a.png" 
                  alt="AI Assistant Illustration" 
                  className="w-64 mx-auto rounded-lg"
                />
            </div>

            {/* Mobile Login Section */}
            <div className="w-full max-w-xs mx-auto bg-muted/20 rounded-lg p-6 border border-border/50">
              <div className="space-y-4">
                {/* Sign up with Google */}
                <Button 
                  onClick={() => window.location.href = 'https://accounts.google.com/v3/signin/accountchooser?access_type=offline&client_id=727830807653-42ha4jskf1mjrsqb5t70hpe867191gm1.apps.googleusercontent.com&prompt=consent&redirect_to=https%3A%2F%2Fayra.app%2F&redirect_uri=https%3A%2F%2Flmkpmnndrygjatnipfgd.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&state=eyJhbGciOiJIUzI1NiIsImtpZCI6IlJGNWFxWk9LQjV6V0hxQVAiLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE3NTkwNTc3MDEsInNpdGVfdXJsIjoiaHR0cHM6Ly9heXJhLXVuaWZpZWQtc3VpdGUubG92YWJsZS5hcHAiLCJpZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsImZ1bmN0aW9uX2hvb2tzIjpudWxsLCJwcm92aWRlciI6Imdvb2dsZSIsInJlZmVycmVyIjoiaHR0cHM6Ly9heXJhLXVuaWZpZWQtc3VpdGUubG92YWJsZS5hcHAiLCJmbG93X3N0YXRlX2lkIjoiIn0.PU-uuohjozw6wBSSICNuJEPU2GlUQTl6_4J6AHYU-98&dsh=S-652114444%3A1759057401538172&o2v=2&service=lso&flowName=GeneralOAuthFlow&opparams=%253Fredirect_to%253Dhttps%25253A%25252F%25252Fayra.app%25252F&continue=https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Fconsent%3Fauthuser%3Dunknown%26part%3DAJi8hAPkalVyyONo0ugzoCJa0muakZafRWcoRDs5iE6mclf6Yh4NLpRIHVew0M3OPhyIeB1DD0c9MGI2poj-j5k2wt5M74zsuCAv6sc7zz2CppqripA_OROcQiWA85ubsKijc13UGz6KnsFIeqQM0TWWmT3KvdVYrWxqhf0TkgJ3XoRl8PUAeYRjvE_zAGSn1HOFOO0308MYtdQ4Nb5ruXnwOfVtVOFvDzcSX_9iacqAmnCqLcBKPrg7ik7HQjmkLbcODAkva-kvrlMtgF7YgsLHQx4oVhibP-xDZtcbZ3d-S2JABQkUkfudlBYj24ub3wmub97MK6mtg8HzEgLFDAylPo1eQDrK0VTpWdeM_QJdGt9JOd5u4iZlp1TbYZRZOOdX0wyPHSEypGtdfTQxQWQgx6BMBWQWHSEMIqLtdQdkzkGGlGq9LKRkexGEOeqpn5A17Lyvy4CRx7rKjZI9-FCQpwOi3HWqGHr28VBoeNLJtH6N94NzUmk%26flowName%3DGeneralOAuthFlow%26as%3DS-652114444%253A1759057401538172%26client_id%3D727830807653-42ha4jskf1mjrsqb5t70hpe867191gm1.apps.googleusercontent.com%23&app_domain=https%3A%2F%2Flmkpmnndrygjatnipfgd.supabase.co'}
                  variant="outline"
                  className="w-full flex items-center justify-center gap-3 py-2.5 h-auto text-base bg-background hover:bg-muted font-body font-medium"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign up with Google
                </Button>

                {/* OR Divider */}
                <div className="flex items-center my-4">
                  <div className="flex-1 border-t border-border"></div>
                  <span className="px-3 text-base text-muted-foreground font-body">OR</span>
                  <div className="flex-1 border-t border-border"></div>
                </div>

                {/* Email Input */}
                <Input
                  type="email"
                  placeholder="Enter your personal or work email"
                  value={heroEmail}
                  onChange={(e) => setHeroEmail(e.target.value)}
                  className="w-full py-2.5 h-auto text-base font-body font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {/* Continue with Email Button */}
                <Button 
                  onClick={() => navigate(`/signup${heroEmail ? `?email=${encodeURIComponent(heroEmail)}` : ''}`)}
                  className="w-full bg-foreground hover:bg-foreground/90 text-background text-base py-2.5 h-auto font-body font-medium"
                >
                  Continue with email
                </Button>

                {/* Privacy Policy Text */}
                <p className="text-xs text-muted-foreground text-center mt-4 font-body font-medium">
                  By continuing, you acknowledge Ayra's Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meet Ayra Section */}
      <section className="pt-20 pb-5 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-1.5">
              Meet Ayra, your personal AI assistant
            </h2>
            <p className="text-base text-muted-foreground max-w-3xl mx-auto mb-8 font-body font-medium">
              Watch how Ayra seamlessly integrates all your productivity tools into one intelligent workspace
            </p>
            
            {/* Ayra AI Assistant Explanation Box */}
            <div className="mb-8">
              <Card className="hover:shadow-lg transition-shadow overflow-hidden max-w-4xl mx-auto">
                <div className="flex h-full">
                  <div className="flex-1 flex flex-col pr-2">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3 mb-2">
                        <Brain className="w-6 h-6 text-primary" />
                        <CardTitle className="text-xl">Ayra - Your Personal AI Assistant</CardTitle>
                      </div>
                      <CardDescription className="text-sm mt-1">
                        Meet Ayra, your intelligent AI companion that learns your preferences and helps streamline your daily workflow. From managing emails to scheduling meetings, Ayra understands context and provides personalized assistance across all your productivity tools.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 flex-1">
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-body font-medium">
                          Natural Language Processing
                        </span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-body font-medium">
                          Context Awareness
                        </span>
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-body font-medium">
                          Cross-Platform Integration
                        </span>
                      </div>
                    </CardContent>
                  </div>
                  <div className="w-[40%] min-h-[120px] relative flex items-center justify-center">
                    <img 
                      src="/lovable-uploads/81fcbe09-eea5-49d4-8d19-09cd6d5dbf7a.png" 
                      alt="Ayra AI Assistant"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </div>
              </Card>
            </div>
            
            {/* iPad Container - Centered under subtitle showing full screen */}
            <div className="flex justify-center">
              {/* Mobile: Keep iPhone design */}
              <div className="md:hidden w-80 bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
                <div className="aspect-[9/19.5] bg-black rounded-[2rem] flex items-center justify-center overflow-hidden relative">
                  {/* iPhone notch */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full"></div>
                  <div className="text-center space-y-4 mt-8">
                    <Zap className="w-12 h-12 text-primary mx-auto animate-pulse" />
                    <p className="text-base font-body font-medium">Ayra Demo Video</p>
                  </div>
                </div>
              </div>
              
              {/* Tablet and Desktop: iPad Landscape */}
              <div className="hidden md:block w-full max-w-4xl bg-gray-900 rounded-[2rem] p-4 shadow-2xl">
                 <div className="aspect-[4/3] bg-black rounded-[1.5rem] overflow-hidden relative cursor-pointer" onClick={handleVideoToggle}>
                   {/* iPad home indicator */}
                   <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-600 rounded-full z-10"></div>
                   <video 
                     ref={videoRef}
                     className="w-full h-full object-cover rounded-[1.5rem]"
                     preload="metadata"
                     onPlay={() => setIsVideoPlaying(true)}
                     onPause={() => setIsVideoPlaying(false)}
                   >
                     <source src="/Ayra_in_action.mp4" type="video/mp4" />
                     Your browser does not support the video tag.
                   </video>
                   {/* Play/Pause Button Overlay */}
                   <div className="absolute inset-0 flex items-center justify-center">
                     <div className={`transition-opacity duration-300 ${isVideoPlaying ? 'opacity-0' : 'opacity-100'} bg-black/50 rounded-full p-4 hover:bg-black/70`}>
                       {isVideoPlaying ? (
                         <Pause className="w-12 h-12 text-white" />
                       ) : (
                         <Play className="w-12 h-12 text-white ml-1" />
                       )}
                     </div>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Productivity Tools Section */}
      <section className="pt-20 pb-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-1.5">
              Your productivity tools
            </h2>
            <p className="text-base text-muted-foreground max-w-3xl mx-auto font-body font-medium">
              Everything you need to stay organized, productive, and in control
            </p>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {productivityTools.map((tool) => {
              return (
                <Card 
                  key={tool.title} 
                  className="hover:shadow-lg transition-shadow overflow-hidden"
                >
                  <div className="flex h-full">
                    <div className={`flex-1 flex flex-col ${tool.image ? 'pr-2' : ''}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{tool.title}</CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {tool.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 flex-1">
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tool.features.map((feature) => (
                            <span key={feature} className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-body font-medium">
                              {feature}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </div>
                    {tool.image && (
                      <div className="w-[40%] min-h-[120px] relative flex items-center justify-center">
                        <img 
                          src={tool.image} 
                          alt={tool.title}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pt-20 pb-5 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-1.5">
              Choose your plan
            </h2>
            <p className="text-base text-muted-foreground font-body font-medium">
              Simple pricing for individuals and teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <Card className="relative border-2 border-border hover:border-primary/50 transition-colors flex flex-col">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-heading font-normal text-card-foreground">Personal</CardTitle>
                <div className="mt-4">
                  <div className="text-4xl font-heading font-normal text-primary">Free</div>
                  <div className="text-sm text-muted-foreground font-body font-medium">Free for everyone</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                <ul className="space-y-3 text-left flex-1">
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Your personal AI assistant Ayra on web, iOS, and Android.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    ChatGPT use inside Ayra.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Personal Tools: Mail, calendar, schedule, notes, documents.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Manage your daily personal life with Ayra
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    50GB of document storage.
                  </li>
                </ul>
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground font-body">
                    Add ons - Unlimited storage for £8 monthly.
                  </p>
                </div>
                <div className="pt-4">
                  <Button 
                    onClick={() => navigate('/auth')}
                    className="w-full"
                    variant="outline"
                  >
                    Get started for free
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="relative border-2 border-primary shadow-xl flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-body font-medium">
                  Most Popular
                </span>
              </div>
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-heading font-normal text-card-foreground">Pro</CardTitle>
                <CardDescription className="text-sm font-body font-medium">Try Ayra professional</CardDescription>
                <div className="mt-4">
                  <div className="text-4xl font-heading font-normal text-primary">£18</div>
                  <div className="text-sm text-muted-foreground font-body font-medium">Billed every 28 days</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                <ul className="space-y-3 text-left flex-1">
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Your personal AI assistant Ayra on web, iOS, and Android.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    ChatGPT use inside Ayra.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Personal tools: Mail, calendar, schedule, notes, documents.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Manage your daily personal life with Ayra
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Business tools: Invoices, quotes, card payments, bookkeeping, calculator.
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    Unlock Ayra Pro - AI business and tax advisor (trained on UK tax laws)
                  </li>
                  <li className="flex items-start gap-2 text-sm font-body">
                    <span className="text-primary mt-1">•</span>
                    1TB of document storage.
                  </li>
                </ul>
                <div className="pt-4">
                  <Button 
                    onClick={() => navigate('/auth')}
                    className="w-full"
                  >
                    Get started with Pro
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Privacy Features Section */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-4">
              Privacy is our priority
            </h2>
            <p className="text-base text-muted-foreground font-body font-medium max-w-2xl mx-auto">
              Your data security and privacy are our top priorities. Here's how we protect your information.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">User Data Isolation</h4>
              <p className="text-sm text-muted-foreground">Each user can only access their own emails</p>
            </Card>
            
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">Encrypted Storage</h4>
              <p className="text-sm text-muted-foreground">All data is encrypted at rest and in transit</p>
            </Card>
            
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">OAuth Security</h4>
              <p className="text-sm text-muted-foreground">Uses Google's secure authentication flow</p>
            </Card>
            
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <Key className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">Token Management</h4>
              <p className="text-sm text-muted-foreground">Secure token storage and automatic refresh</p>
            </Card>
            
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <ShieldEllipsis className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">API Authentication</h4>
              <p className="text-sm text-muted-foreground">All email operations require valid authentication</p>
            </Card>
            
            <Card className="text-center p-6 border border-border hover:border-primary/30 transition-colors">
              <div className="flex justify-center mb-4">
                <Database className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-semibold text-card-foreground mb-2">Database Security</h4>
              <p className="text-sm text-muted-foreground">Row-level security prevents unauthorized access</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-20 pb-2 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center">
              <img 
                src="/ayra-logo.png" 
                alt="Ayra" 
                className="h-8 md:h-10 lg:h-12 w-auto"
              />
            </div>
            <div className="flex space-x-8 text-base text-muted-foreground font-body font-medium">
              <a href="/signin-guide" className="hover:text-primary transition-colors">How to Sign In</a>
              <a href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-primary transition-colors">Terms of Service</a>
              <a href="/anti-slavery-policy" className="hover:text-primary transition-colors">Anti-Slavery Policy</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-base text-muted-foreground font-body font-medium">
            <p>&copy; 2025 Stargate Labs Inc UK. All rights reserved.</p>
          </div>
        </div>
      </footer>
      
      {/* Gmail Connection Consent Modal */}
      <Dialog open={showGmailConsent} onOpenChange={setShowGmailConsent}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Link Gmail & Calendar
            </DialogTitle>
            <DialogDescription>
              To fully integrate Ayra with your workflow, we need access to your Google Gmail and Calendar.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">This will allow Ayra to:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
                <li>Read and send emails on your behalf</li>
                <li>View and edit events on your calendars</li>
              </ul>
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                You will be redirected to Google to grant these permissions. You can revoke access anytime from your Google Account settings or Ayra's Account page.
              </p>
            </div>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowGmailConsent(false);
                // Set a session flag to prevent showing again in this session
                sessionStorage.setItem('gmail_prompt_dismissed', '1');
                navigate('/dashboard');
              }}
              disabled={connectingGmail}
            >
              Remind Me Later
            </Button>
            <Button 
              onClick={() => {
                setShowGmailConsent(false);
                localStorage.removeItem('prompt_gmail_connect');
                connectGmail();
              }} 
              disabled={connectingGmail}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {connectingGmail ? 'Connecting...' : 'Connect Gmail & Calendar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;