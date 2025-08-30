import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Calendar, FileText, FolderOpen, Lock, Users, LogOut, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const tools = [
    {
      icon: Mail,
      title: 'Mailbox',
      description: 'Connect and manage your Gmail account',
      route: '/mailbox',
      color: 'text-blue-600'
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'Schedule events and set reminders',
      route: '/calendar',
      color: 'text-green-600'
    },
    {
      icon: FileText,
      title: 'Notes',
      description: 'Save and edit your notes',
      route: '/notes',
      color: 'text-purple-600'
    },
    {
      icon: FolderOpen,
      title: 'Documents',
      description: 'Store and organize your files',
      route: '/documents',
      color: 'text-orange-600'
    },
    {
      icon: Lock,
      title: 'Passwords',
      description: 'Securely store your passwords',
      route: '/passwords',
      color: 'text-red-600'
    },
        {
          icon: Bot,
          title: 'AI Assistant',
          description: 'Chat with AI about your emails and documents',
          route: '/assistant',
          color: 'text-violet-600'
        },
        {
          icon: Users,
          title: 'Account',
          description: 'Manage account settings and connections',
          route: '/account',
          color: 'text-indigo-600'
        }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-heading font-bold">Ayra</h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-heading font-bold mb-2">
            {user?.email?.split('@')[0]}, welcome to a new era of productivity!
          </h2>
          <p className="text-muted-foreground">
            Access all your essential tools in one place. Choose a tool to get started.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Card 
                key={tool.title} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(tool.route)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-secondary ${tool.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{tool.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {tool.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;