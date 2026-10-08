'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { clientAuth } from '@/lib/firebase/client';

const AuthUserContext = createContext<User | null | undefined>(undefined);

/** `undefined` solange Firebase den Anmeldezustand noch nicht aufgeloest hat. */
export function useAuthUser() {
  return useContext(AuthUserContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(
    () =>
      onAuthStateChanged(clientAuth(), setUser, (fehler) => {
        // Nur der Name - die Meldung kann Kontodetails enthalten.
        console.error('Anmeldestatus nicht lesbar', fehler.name);
        setUser(null);
      }),
    []
  );
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}
