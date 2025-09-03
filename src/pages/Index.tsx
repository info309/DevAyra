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
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-gray-800 dark:text-gray-200">/Ayra</h1>
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
      <section className="min-h-screen pt-20 pb-12 flex items-start">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16 h-full">
            {/* Title Section */}
            <div className="text-center lg:text-left lg:flex-1 mb-8 lg:mb-0">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-4" style={{ lineHeight: 1.1 }}>
                <span className="text-4xl md:text-5xl lg:text-6xl">One login. One AI.</span><br />
                <span className="text-compose">Unlimited productivity.</span>
              </h1>
              <p className="text-base text-foreground mb-4 font-body font-medium">
                Your personal AI assistant
              </p>
              <div className="mt-6 mb-6">
                <img 
                  src="/lovable-uploads/81fcbe09-eea5-49d4-8d19-09cd6d5dbf7a.png" 
                  alt="AI Assistant Illustration" 
                  className="w-full max-w-xs mx-auto rounded-lg"
                />
              </div>
            </div>

            {/* Login Section */}
            <div className="w-full max-w-sm mx-auto lg:mx-0 lg:flex-1 lg:max-w-md mt-6 lg:mt-0">
              <div className="space-y-4">
                {/* Continue with Google */}
                <Button 
                  onClick={() => navigate('/auth')}
                  variant="outline"
                  className="w-full flex items-center justify-center gap-3 py-2.5 h-auto text-base bg-background hover:bg-muted font-body font-medium"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
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
                  className="w-full py-2.5 h-auto text-base font-body font-medium focus-visible:ring-0 focus-visible:ring-offset-0"
                />

                {/* Continue with Email Button */}
                <Button 
                  onClick={() => navigate('/auth')}
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
      <section className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-6">
              Meet Ayra, your personal AI assistant
            </h2>
            <p className="text-base text-muted-foreground max-w-3xl mx-auto mb-8 font-body font-medium">
              Watch how Ayra seamlessly integrates all your productivity tools into one intelligent workspace
            </p>
            
            {/* iPhone Container - Centered under subtitle showing full screen */}
            <div className="flex justify-center">
              <div className="w-80 md:w-96 bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
                <div className="aspect-[9/19.5] bg-black rounded-[2rem] flex items-center justify-center overflow-hidden relative">
                  {/* iPhone notch */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-full"></div>
                  <div className="text-center space-y-4 mt-8">
                    <Zap className="w-12 h-12 text-primary mx-auto animate-pulse" />
                    <p className="text-base font-body font-medium">Ayra Demo Video</p>
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
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-6">
              Your productivity tools
            </h2>
            <p className="text-base text-muted-foreground max-w-3xl mx-auto font-body font-medium">
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
                      <h3 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground">{tool.title}</h3>
                    </div>
                    <p className="text-base text-muted-foreground leading-relaxed font-body font-medium">
                      {tool.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tool.features.map((feature) => (
                        <span key={feature} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-base font-body font-medium">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* iPhone Screenshot Placeholder with 10% overhang */}
                  <div className={`${!isEven ? 'lg:col-start-1 lg:row-start-1' : ''} flex justify-center relative`}>
                    <div className="w-72 bg-gray-900 rounded-[2.5rem] p-2.5 shadow-2xl translate-y-[10%]">
                      <div className="aspect-[9/19.5] bg-black rounded-[2rem] flex items-center justify-center overflow-hidden relative">
                        {/* iPhone notch */}
                        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-full"></div>
                        <div className="text-center space-y-3 mt-6">
                          <Icon className="w-10 h-10 text-primary mx-auto" />
                          <p className="text-base font-body font-medium">{tool.title}</p>
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
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-6">
              Choose your plan
            </h2>
            <p className="text-base text-muted-foreground font-body font-medium">
              Simple pricing for individuals and teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Personal Plan */}
            <Card className="relative border-2 border-border hover:border-primary/50 transition-colors">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-card-foreground">Personal</CardTitle>
                <CardDescription className="text-base font-body font-medium">Perfect for individuals</CardDescription>
                <div className="mt-4">
                  <div className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-primary">$--</div>
                  <div className="text-base text-muted-foreground font-body font-medium">/month</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center">
                  <p className="text-base text-muted-foreground font-body font-medium">Coming soon - features and pricing to be announced</p>
                </div>
              </CardContent>
            </Card>

            {/* Business Plan */}
            <Card className="relative border-2 border-primary shadow-xl">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-base font-body font-medium">
                  Most Popular
                </span>
              </div>
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-card-foreground">Business</CardTitle>
                <CardDescription className="text-base font-body font-medium">For teams and organizations</CardDescription>
                <div className="mt-4">
                  <div className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-primary">$--</div>
                  <div className="text-base text-muted-foreground font-body font-medium">/month per user</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center">
                  <p className="text-base text-muted-foreground font-body font-medium">Coming soon - features and pricing to be announced</p>
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
            <div className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-primary">
              Ayra
            </div>
            <div className="flex space-x-8 text-base text-muted-foreground font-body font-medium">
              <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-primary transition-colors">Anti-Slavery Policy</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-base text-muted-foreground font-body font-medium">
            <p>&copy; 2025 Ayra. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;