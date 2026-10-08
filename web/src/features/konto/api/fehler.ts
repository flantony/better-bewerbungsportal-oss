/**
 * Bewusst ohne Firebase-Import: `service.test.ts` prueft nur die reine
 * Fehler-Uebersetzung und soll dafuer nie `@/lib/firebase/client` beruehren
 * (das wuerde in Tests/CI ohne `.env.local` scheitern).
 */
export class KontoFehler extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'KontoFehler';
  }
}

export function fehlerAusAntwort(status: number, body: unknown): KontoFehler {
  const satz =
    typeof body === 'object' && body !== null && typeof (body as { fehler?: unknown }).fehler === 'string'
      ? (body as { fehler: string }).fehler
      : 'Das hat gerade nicht geklappt. Bitte versuch es später erneut.';
  return new KontoFehler(satz, status);
}
