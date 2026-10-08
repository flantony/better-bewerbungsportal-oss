import { z } from "zod/v3";
import { formatJobForMcp, type McpJob } from "../lib/formatJobForMcp";
import { loadJobRecord, JobNotFoundError } from "../lib/loadJobRecord";

export const getJobInputSchema = {
  pinstGuid: z.string().min(1).describe("The pinstGuid identifier returned by list_jobs."),
};

const getJobInput = z.object(getJobInputSchema);
export type GetJobInput = z.infer<typeof getJobInput>;

export { JobNotFoundError };

export async function getJob(input: GetJobInput): Promise<McpJob> {
  const job = await loadJobRecord(input.pinstGuid);
  return formatJobForMcp(job);
}
