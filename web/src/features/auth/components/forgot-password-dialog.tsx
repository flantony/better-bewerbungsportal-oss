'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sendPasswordResetEmail } from 'firebase/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientAuth } from '@/lib/firebase/client';

/**
 * Bewusst KEINE Bestätigung/Ablehnung, ob zu der E-Mail ein Konto existiert
 * (Standard-Sicherheitspraxis gegen E-Mail-Enumeration) - dieselbe Meldung
 * erscheint unabhängig vom tatsächlichen Ergebnis.
 */
export function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');

  const resetMutation = useMutation({
    mutationFn: () => sendPasswordResetEmail(clientAuth(), email),
    onSuccess: () => {
      toast.success('Falls es zu dieser Adresse ein Konto gibt, haben wir dir eine Mail zum Zurücksetzen geschickt.');
      setOpen(false);
      setEmail('');
    },
    onError: () => {
      toast.success('Falls es zu dieser Adresse ein Konto gibt, haben wir dir eine Mail zum Zurücksetzen geschickt.');
      setOpen(false);
      setEmail('');
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type='button' className='text-muted-foreground text-sm underline-offset-4 hover:underline'>
            Passwort vergessen?
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Passwort zurücksetzen</DialogTitle>
          <DialogDescription>
            Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-1.5'>
          <Label htmlFor='forgot-password-email'>E-Mail</Label>
          <Input
            id='forgot-password-email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='name@beispiel.de'
            autoComplete='email'
          />
        </div>
        <DialogFooter>
          <Button
            type='button'
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending || !email.trim()}
          >
            {resetMutation.isPending ? 'Wird gesendet…' : 'Link senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
