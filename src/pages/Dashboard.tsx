import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  Mail, 
  Calendar, 
  StickyNote, 
  FileText, 
  Shield, 
  Users, 
  LogOut 
} from 'lucide-react';

const Dashboard = () => {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const tools = [
    {
      name: 'Mailbox',
      description: 'Connect and manage your Gmail account',
      icon: Mail,
      path: '/mailbox',
      color: 'text-blue-600'
    },
    {
      name: 'Calendar',
      description: 'Schedule events and set reminders',
      icon: Calendar,
      path: '/calendar',
      color: 'text-green-600'
    },
    {
      name: 'Notes',
      description: 'Create and organize your notes',
      icon: StickyNote,
      path: '/notes',
      color: 'text-yellow-600'
    },
    {
      name: 'Documents',
      description: 'Store and manage all your files',
      icon: FileText,
      path: '/documents',
      color: 'text-purple-600'
    },
    {
      name: 'Passwords',
      description: 'Securely store your passwords',
      icon: Shield,
      path: '/passwords',
      color: 'text-red-600'
    },
    {
      name: 'Contacts',
      description: 'Manage your contact list',
      icon: Users,
      path: '/contacts',
      color: 'text-indigo-600'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-recoleta text-foreground">Ayra</h1>
          <div className="flex items-center gap-4">
            <span className="font-opensauce text-muted-foreground">
              {user.email}
            </span>
            <Button
              onClick={signOut}
              variant="outline"
              size="sm"
              className="font-opensauce"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-recoleta text-foreground mb-2">
            Welcome to Your Productivity Suite
          </h2>
          <p className="text-lg font-opensauce text-muted-foreground">
            Choose a tool to get started
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.name}
                className="group cursor-pointer bg-card border rounded-lg p-6 hover:shadow-lg transition-all duration-200 hover:scale-105"
              >
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className={`p-4 rounded-full bg-background ${tool.color}`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-recoleta text-foreground mb-2">
                      {tool.name}
                    </h3>
                    <p className="font-opensauce text-muted-foreground text-sm">
                      {tool.description}
                    </p>
                  </div>
                  <Button 
                    className="w-full font-opensauce"
                    onClick={() => window.location.href = tool.path}
                  >
                    Open {tool.name}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;