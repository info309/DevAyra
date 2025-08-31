import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, MoreVertical, Edit2, Trash2, Check, X, PenTool, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Note } from '@/pages/Notes'

interface NoteSidebarProps {
  notes: Note[]
  selectedNote: Note | null
  onSelectNote: (note: Note) => void
  onUpdateNote: (noteId: string, updates: Partial<Note>) => void
  onDeleteNote: (noteId: string) => void
  onCreateNote: () => void
  isLoading: boolean
}

export function NoteSidebar({
  notes,
  selectedNote,
  onSelectNote,
  onUpdateNote,
  onDeleteNote,
  onCreateNote,
  isLoading
}: NoteSidebarProps) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null)

  const handleEditStart = (note: Note) => {
    setEditingNoteId(note.id)
    setEditingTitle(note.title)
  }

  const handleEditSave = () => {
    if (editingNoteId && editingTitle.trim()) {
      onUpdateNote(editingNoteId, { title: editingTitle.trim() })
    }
    setEditingNoteId(null)
    setEditingTitle('')
  }

  const handleEditCancel = () => {
    setEditingNoteId(null)
    setEditingTitle('')
  }

  const handleDeleteClick = (note: Note) => {
    setNoteToDelete(note)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (noteToDelete) {
      onDeleteNote(noteToDelete.id)
    }
    setDeleteDialogOpen(false)
    setNoteToDelete(null)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <>
      <div className="w-full h-full border-r bg-muted/10 flex flex-col">
        <div className="p-4 border-b md:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Notes</h2>
            <Button onClick={onCreateNote} size="sm">
              <PenTool className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-2 space-y-1">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))
            ) : notes.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <p className="text-sm mb-2">No notes yet</p>
                <Button onClick={onCreateNote} size="sm" variant="outline">
                  <PenTool className="h-4 w-4 mr-2" />
                  Create your first note
                </Button>
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id}>
                  <button
                    className={cn(
                      "w-full flex items-start justify-between p-3 h-auto group rounded-lg text-left transition-all duration-200 relative",
                      selectedNote?.id === note.id 
                        ? "bg-primary/10 border border-primary/20 shadow-sm" 
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                    onClick={() => onSelectNote(note)}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      {editingNoteId === note.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleEditSave()
                              if (e.key === 'Escape') handleEditCancel()
                            }}
                            className="h-6 text-sm"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" onClick={handleEditSave} className="h-6 w-6 p-0">
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleEditCancel} className="h-6 w-6 p-0">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <h3 className="font-medium text-sm truncate leading-tight">
                              {note.title}
                            </h3>
                            {note.is_locked && <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {note.content ? note.content.slice(0, 60) + (note.content.length > 60 ? '...' : '') : 'No content'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Last edit on: {formatDate(note.updated_at)}
                          </p>
                        </>
                      )}
                    </div>

                    {editingNoteId !== note.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditStart(note)}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => onUpdateNote(note.id, { is_locked: !note.is_locked })}
                          >
                            {note.is_locked ? (
                              <>
                                <Unlock className="h-4 w-4 mr-2" />
                                Unlock Note
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-2" />
                                Lock Note
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteClick(note)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{noteToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}