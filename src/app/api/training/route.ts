import { loadTrainedPolicy } from "@/lib/training/load-policy";
import { baselinePolicy } from "@/lib/training/policy";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Return the persisted trained policy + baseline rules for before/after UI. */
export async function GET() {
  const policy = await loadTrainedPolicy();
  return NextResponse.json({
    baselineRules: baselinePolicy(),
    policy,
  });
}
