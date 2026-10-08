'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { clientAuth } from '@/lib/firebase/client';
import { isUserCancelledAuthError, mapAuthError } from '../lib/auth-error';
import { sicheresZiel } from '../lib/sicheres-ziel';

const googleProvider = new GoogleAuthProvider();

/**
 * Deckt sowohl Anmeldung als auch Registrierung ab - `signInWithPopup` legt
 * bei einer neuen Google-Adresse automatisch ein Konto an, es braucht also
 * keinen separaten "Google-Registrieren"-Fluss.
 */
export function GoogleSignInButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleClick = async () => {
    setIsPending(true);
    try {
      await signInWithPopup(clientAuth(), googleProvider);
      const weiter = new URLSearchParams(window.location.search).get('weiter');
      router.push(sicheresZiel(weiter, window.location.origin));
    } catch (err) {
      if (!isUserCancelledAuthError(err)) {
        toast.error(mapAuthError(err));
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button type='button' variant='outline' className='w-full' onClick={handleClick} disabled={isPending}>
      <Icons.google className='mr-2 h-4 w-4' />
      {isPending ? 'Wird angemeldet…' : 'Mit Google fortfahren'}
    </Button>
  );
}
