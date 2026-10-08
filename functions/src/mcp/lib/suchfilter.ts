// Eine einzige Umwandlung von Sucheingaben (list_jobs-Parameter, Suchprofil) in
// den Abfragefilter fuer queryJobs. Ein Suchprofil ist strukturell ein Partial<ListJobsInput> (s.
// konto/kontoTypen.ts), deshalb ist diese Funktion fuer beide die Quelle der
// Wahrheit.
import type { ListJobsInput } from "../tools/listJobs";
import type { JobQueryFilter } from "./queryJobs";
import { toBundeslandCodes, toLaufbahngruppeCodes, toOrganisationsbereichCodes } from "./filterOptions";

export function listJobsFilterAus(input: Partial<ListJobsInput>): JobQueryFilter {
  return {
    taetigkeitsbereich: input.taetigkeitsbereich,
    organisationsbereich: toOrganisationsbereichCodes(input.organisationsbereich),
    bundesland: toBundeslandCodes(input.bundesland),
    laufbahngruppe: toLaufbahngruppeCodes(input.laufbahngruppe),
    vertragsarten: input.vertragsarten,
    beschaeftigungsumfang: input.beschaeftigungsumfang,
    wunschort: input.wunschort,
    alter: input.alter,
    suchbegriff: input.suchbegriff,
    seiteneinstieg: input.seiteneinstieg,
    einstiegswege: input.einstiegswege,
    mindestbesoldung: input.mindestbesoldung,
    besoldungstabelle: input.besoldungstabelle,
    limit: input.limit,
    sortierung: input.sortierung,
    cursor: input.cursor,
  };
}
