// zod/v3 (nicht "zod") - s. Kommentar in listJobs.ts.
import { z } from "zod/v3";
import { ladeFormular, MAX_TOOL_BYTES, type FormularDaten } from "../lib/formularAusliefern";

export const holeFormularInputSchema = {
  docId: z
    .string()
    .min(1)
    .describe(
      "The `docId` of the document, taken from a get_document_requirements response. Do not guess it — call get_document_requirements for the posting first.",
    ),
};

const holeFormularInput = z.object(holeFormularInputSchema);
export type HoleFormularInput = z.infer<typeof holeFormularInput>;

export type HoleFormularResult = FormularDaten;

export async function holeFormular(input: HoleFormularInput): Promise<HoleFormularResult> {
  return ladeFormular(input.docId, MAX_TOOL_BYTES);
}
