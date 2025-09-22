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
import { Mail, Calendar, FileText, Receipt, FolderOpen, Shield, Zap, Clock, Lock, Play, Pause } from 'lucide-react';


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
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

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
      <section className="pt-20 pb-16 min-h-[80vh] flex items-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16 h-full min-h-[60vh]">
            {/* Left Half - Title, Subtitle, Image */}
            <div className="text-center lg:text-left lg:flex-1 mb-8 lg:mb-0">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-normal text-foreground mb-4" style={{ lineHeight: 1.1 }}>
                <span className="text-compose">One login. One AI.</span><br />
                <span>Unlimited productivity.</span>
              </h1>
              <p className="text-base text-foreground mb-8 font-body font-medium">
                Your personal AI assistant
              </p>

              {/* Image - Under title on desktop */}
              <div className="hidden lg:block mb-8">
                <img 
                  src="/lovable-uploads/81fcbe09-eea5-49d4-8d19-09cd6d5dbf7a.png" 
                  alt="AI Assistant Illustration" 
                  className="w-full max-w-md h-auto rounded-lg"
                />
              </div>
            </div>

            {/* Right Half - Sign Up Module (Desktop) / Mobile sections */}
            <div className="lg:flex-1 lg:flex lg:justify-center lg:items-center lg:bg-muted/20 lg:rounded-lg">
              {/* Sign Up Module - Shown on desktop in right column */}
              <div className="hidden lg:flex lg:flex-col lg:justify-center w-full max-w-sm h-full">
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
                  <p className="text-xs text-muted-foreground text-center lg:text-left mt-4 font-body font-medium">
                    By continuing, you acknowledge Ayra's Privacy Policy.
                  </p>
                </div>
              </div>

              {/* Mobile Layout - Image and Login */}
              <div className="lg:hidden text-center">
                <div className="mt-6 mb-8">
                  <img 
                    src="/lovable-uploads/81fcbe09-eea5-49d4-8d19-09cd6d5dbf7a.png" 
                    alt="AI Assistant Illustration" 
                    className="w-40 mx-auto rounded-lg"
                  />
                </div>

                {/* Mobile Login Section */}
                <div className="w-full max-w-xs mx-auto">
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
            <Card className="relative border-2 border-border hover:border-primary/50 transition-colors">
              <CardHeader className="text-center pb-6">
                <CardTitle className="text-2xl font-heading font-normal text-card-foreground">Personal</CardTitle>
                <div className="mt-4">
                  <div className="text-4xl font-heading font-normal text-primary">Free</div>
                  <div className="text-sm text-muted-foreground font-body font-medium">Free for everyone</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-left">
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
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="relative border-2 border-primary shadow-xl">
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
              <CardContent className="space-y-4">
                <ul className="space-y-3 text-left">
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
              </CardContent>
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