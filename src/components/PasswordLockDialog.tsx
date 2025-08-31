import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

interface PasswordLockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPasswordVerified: () => void
  noteTitle: string
}

export function PasswordLockDialog({ 
  open, 
  onOpenChange, 
  onPasswordVerified, 
  noteTitle 
}: PasswordLockDialogProps) {
  const [password, setPassword] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const { user } = useAuth()
  const { toast } = useToast()

  const verifyPassword = async () => {
    if (!user?.email || !password.trim()) return

    setIsVerifying(true)
    try {
      // Attempt to sign in with the provided password to verify it
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password
      })

      if (error) {
        toast({
          title: "Incorrect Password",
          description: "The password you entered is incorrect.",
          variant: "destructive"
        })
      } else {
        onPasswordVerified()
        onOpenChange(false)
        setPassword('')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify password. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      verifyPassword()
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setPassword('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Unlock Note
          </DialogTitle>
          <DialogDescription>
            This note is password protected. Please enter your account password to access "{noteTitle}".
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="password">Account Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your password"
              disabled={isVerifying}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={verifyPassword} 
            disabled={!password.trim() || isVerifying}
          >
            {isVerifying ? "Verifying..." : "Unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}