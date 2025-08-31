import { useState, useEffect, useRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save, Edit2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Note } from '@/pages/Notes'
import { useToast } from '@/hooks/use-toast'

interface NoteEditorProps {
  note: Note
  onUpdateNote: (noteId: string, updates: Partial<Note>) => void
}

export function NoteEditor({ note, onUpdateNote }: NoteEditorProps) {
  const { toast } = useToast()
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  // Update local state when note changes
  useEffect(() => {
    setTitle(note.title)
    setContent(note.content)
    setHasUnsavedChanges(false)
    setIsEditingTitle(false)
  }, [note.id, note.title, note.content])

  // Track unsaved changes
  useEffect(() => {
    const hasChanges = title !== note.title || content !== note.content
    setHasUnsavedChanges(hasChanges)
  }, [title, content, note.title, note.content])

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (!hasUnsavedChanges) return

    const timeoutId = setTimeout(() => {
      handleSave()
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [title, content, hasUnsavedChanges])

  const handleSave = async () => {
    if (!hasUnsavedChanges || isSaving) return

    setIsSaving(true)
    try {
      await onUpdateNote(note.id, {
        title: title.trim() || 'Untitled Note',
        content: content
      })
      setHasUnsavedChanges(false)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTitleEdit = () => {
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  const handleTitleSave = () => {
    setIsEditingTitle(false)
    if (title.trim() !== note.title) {
      handleSave()
    }
  }

  const handleTitleCancel = () => {
    setTitle(note.title)
    setIsEditingTitle(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave()
    } else if (e.key === 'Escape') {
      handleTitleCancel()
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 space-y-4 p-6 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={titleInputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleTitleSave}
                  className="text-xl font-semibold border-none p-0 h-auto shadow-none focus-visible:ring-0"
                  placeholder="Note title..."
                />
                <Button size="sm" variant="ghost" onClick={handleTitleSave} className="h-8 w-8 p-0">
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleTitleCancel} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-xl font-semibold truncate cursor-pointer" onClick={handleTitleEdit}>
                  {title || 'Untitled Note'}
                </h1>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleTitleEdit}
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                size="sm"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Created: {formatDate(note.created_at)}</span>
          {note.updated_at !== note.created_at && (
            <span>Modified: {formatDate(note.updated_at)}</span>
          )}
          {hasUnsavedChanges && (
            <span className="text-amber-600 font-medium">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 pb-6">
        <Textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing your note..."
          className="flex-1 resize-none border-none p-0 shadow-none focus-visible:ring-0 focus:ring-0 focus:outline-none focus:border-none text-base leading-relaxed bg-transparent rounded-none focus:rounded-none"
          style={{ minHeight: '200px', boxShadow: 'none', outline: 'none' }}
        />
      </div>
    </div>
  )
}