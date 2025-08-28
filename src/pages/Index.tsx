import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-2xl mx-auto px-4">
        <h1 className="text-5xl md:text-6xl font-recoleta text-foreground mb-4">
          Ayra
        </h1>
        <p className="text-xl md:text-2xl font-opensauce text-muted-foreground mb-8">
          Your unified productivity suite with mail, calendar, notes, documents, passwords, and contacts
        </p>
        <Button 
          onClick={() => window.location.href = '/auth'}
          size="lg"
          className="font-opensauce text-lg px-8 py-3"
        >
          Get Started
          <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );
};

export default Index;
