import { z } from "zod";

/**
 * Normalized opportunity schema.
 * This is the canonical structure after transformation from raw API data.
 */
export const Opportunity = z.object({
  id: z.string(),
  opportunityNumber: z.string().optional(),
  title: z.string().min(1),
  agency: z.string().optional().default(""),
  category: z.array(z.string()).default([]),
  postedDate: z.string(), // ISO date string
  closeDate: z.string().nullable(), // ISO date string or null
  awardCeiling: z.number().nullable(),
  awardFloor: z.number().nullable(),
  eligibility: z.array(z.string()).default([]),
  synopsisUrl: z.string().url().nullable(),
  fullTextUrl: z.string().url().nullable(),
  raw: z.unknown(), // Store full raw object for reference
});

export type Opportunity = z.infer<typeof Opportunity>;

