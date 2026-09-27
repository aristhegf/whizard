import { z } from "zod";

/** Why a player reported a question. No free text, so there's nothing to moderate. */
export const REPORT_REASONS = [
  { id: "wrong", label: "The answer is wrong" },
  { id: "unclear", label: "It’s unclear or has a typo" },
  { id: "outdated", label: "It’s out of date" },
  { id: "offensive", label: "It’s offensive" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const reportRequestSchema = z.object({
  reason: z.enum(REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]]),
  /** A guest's browser ID, so one person counts once. Signed-in players use their account. */
  guestId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,64}$/)
    .optional(),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;
