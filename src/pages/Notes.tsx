import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarHeader, SidebarTrigger } from '@/components/ui/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useIsDrawerView } from '@/hooks/use-drawer-view'
import { NoteSidebar } from '@/components/NoteSidebar'
import { NoteEditor } from '@/components/NoteEditor'
import { Plus, ArrowLeft } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'

export interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  user_id: string
}

export default function Notes() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isDrawerView = useIsDrawerView()
  
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
          user_id: user.id
        })
        .select()
        .single()

      if (error) throw error

      const newNote = data as Note
      setNotes(prev => [newNote, ...prev])
      setSelectedNote(newNote)

      toast({
        title: "Success",
        description: "New note created"
      })
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

      toast({
        title: "Success",
        description: "Note deleted"
      })
    } catch (error) {
      console.error('Error deleting note:', error)
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive"
      })
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

  if (isDrawerView) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <Sidebar className="hidden" />
          
          <main className="flex-1 flex flex-col">
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
              <div className="flex items-center gap-2">
                <SidebarTrigger />
                <Button onClick={createNote} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Note
                </Button>
              </div>
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
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first note
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>

          <NoteSidebar
            notes={notes}
            selectedNote={selectedNote}
            onSelectNote={setSelectedNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onCreateNote={createNote}
            isLoading={isLoading}
          />
        </div>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <NoteSidebar
          notes={notes}
          selectedNote={selectedNote}
          onSelectNote={setSelectedNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onCreateNote={createNote}
          isLoading={isLoading}
        />
        
        <main className="flex-1 flex flex-col">
          <header className="flex items-center justify-between p-4 border-b bg-background">
            <h1 className="text-xl font-semibold">Notes</h1>
            <Button onClick={createNote} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Note
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
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first note
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}