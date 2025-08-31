import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useIsDrawerView } from '@/hooks/use-drawer-view'
import { NoteSidebar } from '@/components/NoteSidebar'
import { NoteEditor } from '@/components/NoteEditor'
import { PasswordLockDialog } from '@/components/PasswordLockDialog'
import { Plus, ArrowLeft, PanelLeft, PenTool } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'

export interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  user_id: string
  is_locked: boolean
}

export default function Notes() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isDrawerView = useIsDrawerView()
  
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lockedNote, setLockedNote] = useState<Note | null>(null)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)

  useEffect(() => {
    if (user) {
      loadNotes()
    }
  }, [user])

  const loadNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      setNotes(data || [])
      
      // Select first note if none selected
      if (!selectedNote && data && data.length > 0) {
        setSelectedNote(data[0])
      }
    } catch (error) {
      console.error('Error loading notes:', error)
      toast({
        title: "Error",
        description: "Failed to load notes",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const createNote = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          title: 'Untitled Note',
          content: '',
          user_id: user.id,
          is_locked: false
        })
        .select()
        .single()

      if (error) throw error

      const newNote = data as Note
      setNotes(prev => [newNote, ...prev])
      setSelectedNote(newNote)
    } catch (error) {
      console.error('Error creating note:', error)
      toast({
        title: "Error",
        description: "Failed to create note",
        variant: "destructive"
      })
    }
  }

  const updateNote = async (noteId: string, updates: Partial<Note>) => {
    try {
      const { error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', noteId)

      if (error) throw error

      setNotes(prev => prev.map(note => 
        note.id === noteId ? { ...note, ...updates } : note
      ))

      if (selectedNote?.id === noteId) {
        setSelectedNote(prev => prev ? { ...prev, ...updates } : null)
      }
    } catch (error) {
      console.error('Error updating note:', error)
      toast({
        title: "Error",
        description: "Failed to update note",
        variant: "destructive"
      })
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', noteId)

      if (error) throw error

      setNotes(prev => prev.filter(note => note.id !== noteId))
      
      if (selectedNote?.id === noteId) {
        const remainingNotes = notes.filter(note => note.id !== noteId)
        setSelectedNote(remainingNotes[0] || null)
      }

    } catch (error) {
      console.error('Error deleting note:', error)
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive"
      })
    }
  }

  const handleNoteSelection = (note: Note) => {
    if (note.is_locked) {
      setLockedNote(note)
      setPasswordDialogOpen(true)
    } else {
      setSelectedNote(note)
    }
  }

  const handlePasswordVerified = () => {
    if (lockedNote) {
      setSelectedNote(lockedNote)
      setLockedNote(null)
    }
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Notes</h1>
          <p className="text-muted-foreground">Please sign in to access your notes</p>
        </div>
      </div>
    )
  }

  // Mobile/tablet view with drawer-style sidebar
  if (isDrawerView) {
    return (
      <div className="flex h-screen w-full flex-col">
        <header className="flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">Notes</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 p-4">
          {selectedNote ? (
            <NoteEditor
              note={selectedNote}
              onUpdateNote={updateNote}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-lg font-medium text-muted-foreground mb-2">
                  {notes.length === 0 ? "No notes yet" : "Select a note"}
                </h2>
                {notes.length === 0 && (
                  <Button onClick={createNote}>
                    <PenTool className="h-4 w-4 mr-2" />
                    Create your first note
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar menu on mobile - slides from left */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-80 p-0 [&>button]:hidden">
            <NoteSidebar
              notes={notes}
              selectedNote={selectedNote}
              onSelectNote={(note) => {
                handleNoteSelection(note);
                setSidebarOpen(false);
              }}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              onCreateNote={createNote}
              isLoading={isLoading}
              showCreateButton={true}
            />
          </SheetContent>
        </Sheet>

        <PasswordLockDialog
          open={passwordDialogOpen}
          onOpenChange={setPasswordDialogOpen}
          onPasswordVerified={handlePasswordVerified}
          noteTitle={lockedNote?.title || ''}
        />
      </div>
    )
  }

  // Desktop view with permanent sidebar
  return (
    <div className="flex h-screen w-full flex-col">
      {/* Header for tablet and desktop */}
      <header className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-semibold">Notes</h1>
        </div>
        <Button onClick={createNote} size="sm">
          <PenTool className="h-4 w-4 mr-2" />
          New Note
        </Button>
      </header>

      <div className="flex flex-1">
        <div className="w-[40%]">
          <NoteSidebar
            notes={notes}
            selectedNote={selectedNote}
            onSelectNote={handleNoteSelection}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onCreateNote={createNote}
            isLoading={isLoading}
          />
        </div>
        
        <main className="w-[60%] flex flex-col">
          <div className="flex-1 p-6">
            {selectedNote ? (
              <NoteEditor
                note={selectedNote}
                onUpdateNote={updateNote}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <h2 className="text-lg font-medium text-muted-foreground mb-2">
                    {notes.length === 0 ? "No notes yet" : "Select a note"}
                  </h2>
                  {notes.length === 0 && (
                    <Button onClick={createNote}>
                      <PenTool className="h-4 w-4 mr-2" />
                      Create your first note
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <PasswordLockDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onPasswordVerified={handlePasswordVerified}
        noteTitle={lockedNote?.title || ''}
      />
    </div>
  )
}