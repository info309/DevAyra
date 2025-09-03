import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Mail, Calendar, FileText, Receipt, FolderOpen, Shield, Zap, Clock, Lock } from 'lucide-react';

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
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

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
      features: ['Gmail Integration', 'Smart Threading', 'AI Organization']
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'Sync with Google Calendar to never miss important events. Smart scheduling, reminders, and meeting management all in one place.',
      features: ['Google Calendar Sync', 'Smart Reminders', 'Meeting Management']
    },
    {
      icon: FileText,
      title: 'Notes',
      description: 'Capture thoughts with rich text editing, password protection, and smart organization. Lock sensitive notes with built-in security.',
      features: ['Rich Text Editor', 'Password Lock', 'Smart Organization']
    },
    {
      icon: Receipt,
      title: 'Invoices',
      description: 'Create professional invoices with Stripe integration. Send, track, and manage payments with automated follow-ups and reporting.',
      features: ['Stripe Integration', 'Payment Tracking', 'Automated Follow-ups']
    },
    {
      icon: FolderOpen,
      title: 'Documents',
      description: 'Store and organize files with drag-and-drop simplicity. Version control, sharing, and secure storage for all your important documents.',
      features: ['Drag & Drop Upload', 'Version Control', 'Secure Storage']
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-heading font-bold text-primary">Ayra</h1>
        </div>
      </header>

      {/* Hero Section - Full Screen Split */}
      <section className="min-h-screen pt-20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full h-full">
          <div className="grid md:grid-cols-[1fr_2fr] gap-8 md:gap-12 min-h-[70vh] md:min-h-[80vh]">
            {/* Left Side - Content matching Canva design */}
            <div className="flex flex-col justify-start space-y-8 md:space-y-12 pt-2 md:pt-8">
              <div className="space-y-4">
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-heading font-normal text-foreground" style={{ lineHeight: 1.2 }}>
                  One login,<br />
                  One AI,<br />
                  <span className="text-red-400">Unlimited<br />productivity.</span>
                </h1>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => navigate('/auth')}
                    className="text-red-400 text-lg md:text-xl font-medium hover:text-red-300 transition-colors cursor-pointer"
                  >
                    Join today
                  </button>
                  <span className="text-red-400 text-lg md:text-xl">→</span>
                </div>
                <p className="text-foreground text-base md:text-lg">
                  First 10,000 users free for life.
                </p>
              </div>
            </div>

            {/* Right Side - Video Container (Desktop/Tablet) */}
            <div className="hidden md:block relative">
              <div className="relative md:translate-x-[5%] lg:translate-x-[10%] md:w-[120%] lg:w-[130%]">
                <div className="aspect-[16/10] bg-muted rounded-lg flex items-center justify-center shadow-2xl">
                  <div className="text-center space-y-4">
                    <Zap className="w-16 md:w-20 h-16 md:h-20 text-primary mx-auto animate-pulse" />
                    <p className="text-muted-foreground text-base md:text-lg">Hero Demo Video</p>
                    <p className="text-sm md:text-base text-muted-foreground">Upload your screen recording here</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile iPhone Container - Positioned below text */}
        <div className="md:hidden absolute left-1/2 transform -translate-x-1/2" style={{ top: '50%' }}>
          <div className="w-80 bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
            <div className="aspect-[9/19.5] bg-black rounded-[2rem] flex items-center justify-center overflow-hidden relative">
              {/* iPhone notch */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full"></div>
              <div className="text-center space-y-4 mt-8">
                <Zap className="w-12 h-12 text-primary mx-auto animate-pulse" />
                <p className="text-white text-lg">Demo Video</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meet Ayra Section */}
      <section className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">
              Meet Ayra, your personal AI assistant
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Watch how Ayra seamlessly integrates all your productivity tools into one intelligent workspace
            </p>
          </div>

          {/* Video Container - Responsive */}
          <div className="flex justify-center">
            {/* Desktop/Tablet - Landscape */}
            <div className="hidden md:block">
              <div className="relative bg-card border border-border rounded-2xl p-8 shadow-2xl max-w-4xl">
                <div className="aspect-[16/10] bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Zap className="w-16 h-16 text-primary mx-auto animate-pulse" />
                    <p className="text-muted-foreground">Desktop/Tablet Demo Video</p>
                    <p className="text-sm text-muted-foreground">Upload your screen recording here</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile - Portrait */}
            <div className="md:hidden">
              <div className="relative bg-card border border-border rounded-2xl p-6 shadow-2xl max-w-sm mx-auto">
                <div className="aspect-[9/16] bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Zap className="w-12 h-12 text-primary mx-auto animate-pulse" />
                    <p className="text-muted-foreground text-sm">Mobile Demo Video</p>
                    <p className="text-xs text-muted-foreground">Upload your mobile recording here</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Productivity Tools Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">
              Your productivity tools
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Everything you need to stay organized, productive, and in control
            </p>
          </div>

          <div className="space-y-24">
            {productivityTools.map((tool, index) => {
              const Icon = tool.icon;
              const isEven = index % 2 === 0;
              
              return (
                <div key={tool.title} className={`grid lg:grid-cols-2 gap-12 items-center ${!isEven ? 'lg:grid-flow-col-dense' : ''}`}>
                  {/* Content */}
                  <div className={`space-y-6 ${!isEven ? 'lg:col-start-2' : ''}`}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 rounded-xl bg-primary/10">
                        <Icon className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-3xl font-heading font-bold text-foreground">{tool.title}</h3>
                    </div>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      {tool.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tool.features.map((feature) => (
                        <span key={feature} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Screenshot Placeholder */}
                  <div className={`${!isEven ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                    <div className="relative bg-card border border-border rounded-2xl p-6 shadow-xl">
                      <div className="aspect-[4/3] bg-muted rounded-lg flex items-center justify-center">
                        <div className="text-center space-y-4">
                          <Icon className="w-16 h-16 text-primary/50 mx-auto" />
                          <p className="text-muted-foreground font-medium">{tool.title} Screenshot</p>
                          <p className="text-sm text-muted-foreground">Upload screenshot here</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">
              Choose your plan
            </h2>
            <p className="text-xl text-muted-foreground">
              Simple pricing for individuals and teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Personal Plan */}
            <Card className="relative border-2 border-border hover:border-primary/50 transition-colors">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-heading text-card-foreground">Personal</CardTitle>
                <CardDescription className="text-lg">Perfect for individuals</CardDescription>
                <div className="mt-4">
                  <div className="text-4xl font-heading font-bold text-primary">$--</div>
                  <div className="text-muted-foreground">/month</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center">
                  <p className="text-muted-foreground">Coming soon - features and pricing to be announced</p>
                </div>
              </CardContent>
            </Card>

            {/* Business Plan */}
            <Card className="relative border-2 border-primary shadow-xl">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-heading text-card-foreground">Business</CardTitle>
                <CardDescription className="text-lg">For teams and organizations</CardDescription>
                <div className="mt-4">
                  <div className="text-4xl font-heading font-bold text-primary">$--</div>
                  <div className="text-muted-foreground">/month per user</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center">
                  <p className="text-muted-foreground">Coming soon - features and pricing to be announced</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-2xl font-heading font-bold text-primary">
              Ayra
            </div>
            <div className="flex space-x-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary transition-colors">Anti-Slavery Policy</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Ayra. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;