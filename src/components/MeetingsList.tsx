import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Video, Calendar, Clock, MapPin, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Meeting {
  id: string;
  title: string;
  description?: string;
  meeting_type?: 'virtual' | 'physical';
  meeting_platform: string;
  meeting_link?: string;
  start_time: string;
  end_time: string;
  location?: string;
  attendees: any;
  status: string;
  notes?: string;
}

interface MeetingsListProps {
  onEdit: (meeting: Meeting) => void;
}

const MeetingsList = ({ onEdit }: MeetingsListProps) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchMeetings = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setMeetings((data || []) as Meeting[]);
    } catch (error) {
      console.error('Error fetching meetings:', error);
      toast.error('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [user]);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Meeting deleted');
      fetchMeetings();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error('Failed to delete meeting');
    } finally {
      setDeleteId(null);
    }
  };

  const upcomingMeetings = meetings.filter(m => 
    new Date(m.start_time) >= new Date() && m.status === 'scheduled'
  );

  const pastMeetings = meetings.filter(m => 
    new Date(m.start_time) < new Date() || m.status !== 'scheduled'
  );

  const MeetingCard = ({ meeting }: { meeting: Meeting }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {meeting.meeting_type === 'physical' ? (
                <MapPin className="w-5 h-5 text-primary" />
              ) : (
                <Monitor className="w-5 h-5 text-primary" />
              )}
              <h3 className="font-semibold text-lg">{meeting.title}</h3>
              <Badge variant={meeting.status === 'scheduled' ? 'default' : 'secondary'}>
                {meeting.status}
              </Badge>
            </div>
            
            {meeting.description && (
              <p className="text-sm text-muted-foreground mb-3">{meeting.description}</p>
            )}
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(meeting.start_time), 'PPP')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>
                  {format(new Date(meeting.start_time), 'p')} - {format(new Date(meeting.end_time), 'p')}
                </span>
              </div>
              {meeting.meeting_type === 'virtual' && meeting.meeting_link && (
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  <a 
                    href={meeting.meeting_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Join {meeting.meeting_platform === 'google_meet' ? 'Google Meet' : 'Meeting'}
                  </a>
                </div>
              )}
              {meeting.meeting_type === 'physical' && meeting.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>{meeting.location}</span>
                </div>
              )}
              {meeting.attendees && meeting.attendees.length > 0 && (
                <div className="text-muted-foreground">
                  <span className="font-medium">Attendees:</span>{' '}
                  {meeting.attendees.map((a: any) => a.name).join(', ')}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(meeting)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteId(meeting.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <div className="text-center py-8">Loading meetings...</div>;
  }

  return (
    <>
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">
            Upcoming ({upcomingMeetings.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Past ({pastMeetings.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-6">
          {upcomingMeetings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No upcoming meetings. Schedule your first meeting!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {upcomingMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="past" className="mt-6">
          {pastMeetings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No past meetings yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pastMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this meeting? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MeetingsList;
