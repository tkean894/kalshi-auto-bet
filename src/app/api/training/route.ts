import { buildPolicyAlerts } from "@/lib/training/alerts";
import { loadTrainedPolicy } from "@/lib/training/load-policy";
import { baselinePolicy } from "@/lib/training/policy";
import { readTrainStatus } from "@/lib/training/train-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Return the persisted trained policy + baseline rules for before/after UI. */
export async function GET() {
  const policy = await loadTrainedPolicy();
  const trainStatus = await readTrainStatus();
  return NextResponse.json({
    baselineRules: baselinePolicy(),
    policy,
    alerts: buildPolicyAlerts(policy),
    trainStatus,
  });
}
