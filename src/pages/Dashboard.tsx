import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Calendar, FileText, FolderOpen, Users, LogOut, Bot, StickyNote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const Dashboard = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (profile?.display_name) {
          setDisplayName(profile.display_name);
        } else {
          // Fallback to email username if no display name
          setDisplayName(user.email?.split('@')[0] || 'User');
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        // Fallback to email username
        setDisplayName(user.email?.split('@')[0] || 'User');
      }
    };

    fetchUserProfile();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const tools = [
    {
      title: 'Mailbox',
      description: 'Connect and manage your Gmail account',
      route: '/mailbox'
    },
    {
      title: 'Calendar',
      description: 'Schedule events and set reminders',
      route: '/calendar'
    },
    {
      title: 'Notes',
      description: 'Save and edit your notes',
      route: '/notes'
    },
    {
      title: 'Documents',
      description: 'Store and organize your files',
      route: '/documents'
    },
    {
      title: 'AI Assistant',
      description: 'Chat with AI about your emails and documents',
      route: '/assistant'
    },
    {
      title: 'Account',
      description: 'Manage account settings and connections',
      route: '/account'
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
            {displayName}, welcome to a new era of productivity!
          </h2>
          <p className="text-muted-foreground">
            Access all your essential tools in one place. Choose a tool to get started.
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => {
            return (
              <Card 
                key={tool.title} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(tool.route)}
              >
                <CardHeader>
                  <CardTitle className="text-lg">{tool.title}</CardTitle>
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