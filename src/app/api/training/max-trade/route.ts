import { NextResponse } from "next/server";
import {
  loadMaxTradeSweep,
  saveMaxTradeSweep,
  scaleSuggestedMaxTrade,
  sweepMaxTrade,
  type MaxTradeSweepReport,
} from "@/lib/training/max-trade-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function responsePayload(report: MaxTradeSweepReport, bankroll: number) {
  const scaled = scaleSuggestedMaxTrade(report, bankroll);
  const bankrollMatches = Math.abs(report.bankroll - bankroll) < 0.01;
  return {
    bankroll,
    suggestedMaxTrade: bankrollMatches
      ? report.suggested.maxTrade
      : scaled,
    scaledFromFraction: !bankrollMatches,
    sweepBankroll: report.bankroll,
    report,
  };
}

/** Return the latest max-trade sweep; optionally scale suggestion to ?bankroll=. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bankroll = Math.max(
    1,
    Number(url.searchParams.get("bankroll") ?? 1000) || 1000,
  );
  const report = await loadMaxTradeSweep();
  if (!report) {
    return NextResponse.json(
      {
        bankroll,
        suggestedMaxTrade: null,
        report: null,
        error: "No sweep yet. POST to run one, or npm run sweep:max-trade.",
      },
      { status: 404 },
    );
  }
  return NextResponse.json(responsePayload(report, bankroll));
}

/** Run a fresh sweep for the requested bankroll and persist it. */
export async function POST(req: Request) {
  let bankroll = 1000;
  try {
    const body = (await req.json()) as { bankroll?: number };
    if (Number.isFinite(body.bankroll) && (body.bankroll as number) > 0) {
      bankroll = Math.min(1_000_000, body.bankroll as number);
    }
  } catch {
    // empty body ok
  }

  const report = await sweepMaxTrade({ bankroll });
  await saveMaxTradeSweep(report);
  return NextResponse.json({ ok: true, ...responsePayload(report, bankroll) });
}
