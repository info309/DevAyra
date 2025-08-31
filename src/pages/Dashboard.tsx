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
      route: '/mailbox',
      image: '/lovable-uploads/690a95aa-24fc-4792-aa90-f9cd1f512385.png'
    },
    {
      title: 'Calendar',
      description: 'Schedule events and set reminders',
      route: '/calendar',
      image: '/lovable-uploads/77033c20-8408-4764-a8de-03af915812c4.png'
    },
    {
      title: 'Notes',
      description: 'Save and edit your notes',
      route: '/notes',
      image: '/lovable-uploads/6d429c69-a608-4a98-bab2-24f0566fb90d.png'
    },
    {
      title: 'Documents',
      description: 'Store and organize your files',
      route: '/documents',
      image: '/lovable-uploads/3f43df0b-172f-41eb-900b-8e87884c3e13.png'
    },
    {
      title: 'AI Assistant',
      description: 'Chat with AI about your emails and documents',
      route: '/assistant',
      image: '/lovable-uploads/839337f2-f4b6-4401-abaf-a3a528fbb930.png'
    },
    {
      title: 'Account',
      description: 'Manage account settings and connections',
      route: '/account',
      image: '/lovable-uploads/f9af1339-8fe5-43b0-b36d-d146c3fa8c30.png'
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
                className="hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                onClick={() => navigate(tool.route)}
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
                      {/* Content area - can be used for future additions */}
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
      </main>
    </div>
  );
};

export default Dashboard;