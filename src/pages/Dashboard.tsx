import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, FileText, FolderOpen, LogOut, Bot, StickyNote, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
// Icon imports - force refresh
import mailIcon from '@/assets/mail-icon.png';
import calendarIcon from '@/assets/calendar-icon.png';
import notesIcon from '@/assets/notes-icon.png';
import invoicesIcon from '@/assets/invoices-icon.png';
import documentsIcon from '@/assets/documents-icon.png';
import financesIcon from '@/assets/finances-icon.png';
import accountIcon from '@/assets/account-icon.png';
import aiAssistantIcon from '@/assets/ai-assistant-icon.png';
import emailCleanupIcon from '@/assets/email-cleanup-icon.png';
import contactsIcon from '@/assets/contacts-icon.png';
import meetingsIcon from '@/assets/meetings-icon.png';

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

  const personalTools = [
    {
      title: 'AI Assistant',
      description: 'Chat with AI about your emails and documents',
      route: '/assistant',
      image: aiAssistantIcon
    },
    {
      title: 'Mailbox',
      description: 'Connect and manage your Gmail account',
      route: '/mailbox',
      image: mailIcon
    },
    {
      title: 'Email Cleanup',
      description: 'Analyze, unsubscribe, and organize your emails',
      route: '/email-cleanup',
      image: emailCleanupIcon
    },
    {
      title: 'Calendar',
      description: 'Schedule events and set reminders',
      route: '/calendar',
      image: calendarIcon
    },
    {
      title: 'Notes',
      description: 'Save and edit your notes',
      route: '/notes',
      image: notesIcon
    },
    {
      title: 'Account',
      description: 'Manage account settings and connections',
      route: '/account',
      image: accountIcon
    }
  ];

  const proTools = [
    {
      title: 'Invoices',
      description: 'Generate quotes and invoices',
      route: '/invoices',
      image: invoicesIcon
    },
    {
      title: 'Finances',
      description: 'View financial data and upload receipts',
      route: '/finances',
      image: financesIcon
    },
    {
      title: 'Documents',
      description: 'Store and organize your files',
      route: '/documents',
      image: documentsIcon
    },
    {
      title: 'Contacts',
      description: 'Manage your contacts and clients',
      route: '/contacts',
      image: contactsIcon
    },
    {
      title: 'Meetings',
      description: 'Schedule online meetings with clients',
      route: '/meetings',
      image: meetingsIcon
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

        {/* Personal Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {personalTools.map((tool) => {
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
                    <div className="w-[40%] h-[120px] relative flex items-center justify-center">
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

        {/* Pro Tools Section */}
        <div className="mb-4">
          <h3 className="text-2xl font-heading font-bold text-foreground">Pro Tools</h3>
          <p className="text-muted-foreground mt-1">Professional tools for business management</p>
        </div>

        {/* Pro Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proTools.map((tool) => {
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
                    <div className="w-[40%] h-[120px] relative flex items-center justify-center">
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