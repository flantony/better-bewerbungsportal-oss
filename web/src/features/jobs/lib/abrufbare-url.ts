// Spiegel von `abrufbareUrl` in functions/src/jobDocumentStore.ts (eigenes
// Paket, darum kein gemeinsamer Import). Die direkte GCS-Adresse liefert anonym
// 403; nur die Firebase-Download-URL greift auf die Storage-Rules zurück, die
// `jobDocuments/` öffentlich freigeben. Gespeicherte Datensätze tragen noch die
// alte Adresse und werden beim Lesen umgesetzt.
const GCS_DIREKT = /^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/;

export function abrufbareUrl(url: string): string {
  const treffer = GCS_DIREKT.exec(url);
  if (!treffer) return url;
  const [, bucket, pfad] = treffer;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(decodeURI(pfad))}?alt=media`;
}
