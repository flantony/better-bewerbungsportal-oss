import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { adminDb } from '@/lib/firebase/admin';
import { istPinstGuid } from '@/lib/pinst-guid';
import type { JobDetail } from '@/features/jobs/api/types';
import { abrufbareUrl } from '@/features/jobs/lib/abrufbare-url';
import { bewerbungsschlussFuerStelle } from '@/features/jobs/lib/bewerbungsschluss';
import { bereiteStellenHtmlAuf } from '@/features/jobs/lib/stellen-html';
import { beschaeftigungsumfangLabel, bewerbungMoeglich, fristAbgelaufen } from '@/features/jobs/lib/stellen-status';
import { TaetigkeitsbereichBadge } from '@/features/jobs/components/taetigkeitsbereich-badge';
import { GlossaryAnnotatedHtml } from '@/features/glossary/components/glossary-annotated-html';
import { BewerbungsWege } from '@/features/bewerben/components/bewerbungs-wege';
import { WasDuEinreichenMusst } from '@/features/jobs/components/was-du-einreichen-musst';
import { checklisteFuerStelle } from '@/features/jobs/lib/einreichliste';

type Params = { params: Promise<{ pinstGuid: string }> };

/** Für den Link in der Checkliste - dieselbe Basis wie `metadataBase` (app/layout.tsx). */
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://better-bewerbungsportal.de';

// Volltext liegt getrennt vom schlanken Listendokument unter
// `jobs/{pinstGuid}/content/detail` (s. functions/src/types.ts
// JobContentRecord) - Firestore rechnet Reads pro Dokument ab, unabhängig
// von dessen Größe; die Trennung spart also nur Bandbreite/Ladezeit für die
// Stellenliste, die diese Felder nie anzeigt, nicht das Read-Kontingent
// selbst. Die Detailseite hier braucht beides und liest entsprechend zwei
// Dokumente statt eines. `cache`: Metadaten und Seite teilen sich einen Abruf.
const getJobDetail = cache(async (pinstGuid: string): Promise<JobDetail | null> => {
  if (!istPinstGuid(pinstGuid)) return null;
  const jobRef = adminDb.collection('jobsV2').doc(pinstGuid);
  const [snap, contentSnap] = await Promise.all([jobRef.get(), jobRef.collection('content').doc('detail').get()]);
  if (!snap.exists || !contentSnap.exists) return null;
  const data = snap.data()!;
  // Schema `jobsV2`: Rohwerte der API unter `api.*`, unsere Ableitungen daneben.
  const api = data.api ?? {};
  const content = contentSnap.data()!;
  // Anhänge liegen dedupliziert in `jobDocuments`; die
  // Stelle hält nur noch Verweise (s. functions/src/jobDocumentStore.ts). Das
  // spart nicht nur Speicher: die Links zeigen auf unsere Kopie und bleiben
  // gültig, wenn die Bundeswehr-URL nach Bewerbungsschluss stirbt.
  const refs: { docId: string; attHeader: string }[] = data.dokumente ?? [];
  const documents = refs.length
    ? (await adminDb.getAll(...refs.map((ref) => adminDb.collection('jobDocuments').doc(ref.docId))))
        .filter((docSnap) => docSnap.exists)
        .map((docSnap) => {
          const doc = docSnap.data()!;
          return {
            attHeader: doc.attHeader ?? '',
            contentType: doc.contentType ?? '',
            sizeBytes: doc.sizeBytes ?? 0,
            downloadUrl: abrufbareUrl(doc.url ?? '')
          };
        })
    : [];

  const unterlagen: unknown = data.jobAttributes?.unterlagen;
  const unterlagenHinweise: unknown = data.jobAttributes?.unterlagenHinweise;

  return {
    pinstGuid: snap.id,
    refCode: typeof api.RefCode === 'string' ? api.RefCode : '',
    title: api.Title,
    besOrt: api.BesOrt,
    contractTypeLabel: data.contractTypeLabel ?? null,
    applicationEnd: api.ApplicationEnd ?? '',
    arbeitszeit: api.Arbeitszeit,
    companyDesc: content.companyDesc ?? '',
    jobDesc: content.jobDesc ?? '',
    requireDesc: content.requireDesc ?? '',
    remarcDesc: content.remarcDesc ?? '',
    contactDesc: content.contactDesc ?? '',
    documents,
    unterlagen: Array.isArray(unterlagen) ? unterlagen.filter((u): u is string => typeof u === 'string') : [],
    unterlagenHinweise: typeof unterlagenHinweise === 'string' ? unterlagenHinweise : '',
    hotJob: Boolean(api.HotJob),
    active: data.active === true,
    reqIndustry: api.ReqIndustry ?? 0
  };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pinstGuid } = await params;
  const job = await getJobDetail(pinstGuid);
  if (!job) return { title: 'Stelle nicht gefunden' };
  return { title: job.title, description: job.besOrt ? `Bundeswehr-Ausschreibung in ${job.besOrt}` : undefined };
}

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function HtmlSection({ title, html }: { title: string; html: string }) {
  if (!html.trim()) return null;
  // Bereinigt mit DOMPurify (`data-glossary-term` fuer GlossaryAnnotatedHtml
  // ausdruecklich erlaubt) und macht Adressen im Text klickbar.
  const aufbereitet = bereiteStellenHtmlAuf(html);
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>
          <h2 className='text-base'>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className='text-sm break-words [&_a]:underline [&_a]:underline-offset-4 [&_a]:[overflow-wrap:anywhere] [&_li]:ml-4 [&_p]:mb-2 [&_ul]:list-disc'>
        <GlossaryAnnotatedHtml html={aufbereitet} />
      </CardContent>
    </Card>
  );
}

/**
 * Statt der Bewerbungswege, wenn die Frist vorbei oder die Stelle archiviert
 * ist - eine abgelaufene Stelle bietet kein "Bewerben" mehr an.
 */
function BewerbungVorbei({ job }: { job: JobDetail }) {
  const abgelaufen = fristAbgelaufen(job.applicationEnd);
  return (
    <section
      aria-labelledby='bewerbung-vorbei'
      className='space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm'
    >
      <h2 id='bewerbung-vorbei' className='flex items-center gap-2 text-base font-semibold'>
        <Icons.clock className='h-4 w-4 shrink-0' aria-hidden='true' />
        {abgelaufen ? 'Bewerbungsfrist abgelaufen' : 'Nicht mehr ausgeschrieben'}
      </h2>
      <p>
        {abgelaufen
          ? `Der Bewerbungsschluss war am ${job.applicationEnd}. Eine Bewerbung auf diese Stelle ist nicht mehr möglich.`
          : 'Diese Ausschreibung ist beendet oder wurde zurückgezogen. Eine Bewerbung ist nicht mehr möglich.'}{' '}
        Die Angaben stehen nur noch zum Nachlesen hier, später entfernen wir sie.
      </p>
      <Link href='/dashboard/jobs' className={buttonVariants({ variant: 'outline' })}>
        <Icons.search className='h-4 w-4' aria-hidden='true' />
        Aktuelle Stellen durchsuchen
      </Link>
    </section>
  );
}

/**
 * „Was du einreichen musst" mit Checkliste - für alle, ohne KI und ohne Konto.
 * `checklisteFuerStelle` nimmt nur Titel, Kennung, Unterlagenliste und
 * Anhänge: `contactDesc` (Namen der Ansprechpersonen) geht nie hinein.
 */
function Einreichen({ job }: { job: JobDetail }) {
  const { liste, text, dateiname } = checklisteFuerStelle(job, SITE_URL);
  return <WasDuEinreichenMusst liste={liste} checkliste={text} dateiname={dateiname} />;
}

export default async function JobDetailPage({ params }: Params) {
  const { pinstGuid } = await params;
  const job = await getJobDetail(pinstGuid);

  if (!job) {
    notFound();
  }

  const beschaeftigungsumfang = beschaeftigungsumfangLabel(job.arbeitszeit);

  return (
    <PageContainer pageTitle={job.title} pageDescription={job.besOrt} pageTitleAs='h1'>
      <div className='max-w-3xl min-w-0 space-y-6'>
        <div className='flex flex-wrap items-center gap-2'>
          {job.hotJob && <Badge variant='destructive'>Hot</Badge>}
          <TaetigkeitsbereichBadge reqIndustry={job.reqIndustry} />
          {job.contractTypeLabel && <Badge variant='outline'>{job.contractTypeLabel}</Badge>}
          {beschaeftigungsumfang && <Badge variant='outline'>{beschaeftigungsumfang}</Badge>}
          <span className='text-muted-foreground text-sm'>Bewerbungsschluss: {bewerbungsschlussFuerStelle(job)}</span>
        </div>

        {bewerbungMoeglich(job) ? (
          <>
            <BewerbungsWege pinstGuid={job.pinstGuid} />
            <Einreichen job={job} />
          </>
        ) : (
          <BewerbungVorbei job={job} />
        )}

        <HtmlSection title='Über den Arbeitgeber' html={job.companyDesc} />
        <HtmlSection title='Aufgaben' html={job.jobDesc} />
        <HtmlSection title='Anforderungen' html={job.requireDesc} />
        <HtmlSection title='Sonstiges' html={job.remarcDesc} />
        <HtmlSection title='Kontakt' html={job.contactDesc} />

        {job.documents.length > 0 && (
          <Card id='dokumente' className='min-w-0'>
            <CardHeader>
              <CardTitle>
                <h2 className='text-base'>Dokumente</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {job.documents.map((doc, i) => (
                <a
                  key={i}
                  href={doc.downloadUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent'
                >
                  <Icons.fileTypePdf className='h-4 w-4 shrink-0' />
                  <span className='min-w-0 flex-1 break-words'>{doc.attHeader}</span>
                  {doc.sizeBytes > 0 && (
                    <span className='text-muted-foreground text-xs'>{formatSize(doc.sizeBytes)}</span>
                  )}
                </a>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
