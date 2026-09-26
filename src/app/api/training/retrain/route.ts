import { spawn } from "node:child_process";
import { readTrainStatus, writeTrainStatus } from "@/lib/training/train-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kick off a background `npm run train` (fee-aware walk-forward).
 * Poll GET /api/training for status + refreshed policy.
 */
export async function POST() {
  const current = await readTrainStatus();
  if (current.status === "running" && current.pid) {
    try {
      process.kill(current.pid, 0);
      return NextResponse.json(
        {
          ok: false,
          error: "A retrain is already running.",
          trainStatus: current,
        },
        { status: 409 },
      );
    } catch {
      // stale pid
    }
  }

  await writeTrainStatus({
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Retrain started — rebuilding v3 day caches and searching policy…",
    pid: null,
    lastError: null,
  });

  const child = spawn("npm", ["run", "train"], {
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "0" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  await writeTrainStatus({
    status: "running",
    pid: child.pid ?? null,
    message: `Retrain running (pid ${child.pid ?? "?"})`,
  });

  child.on("exit", async (code) => {
    if (code === 0) {
      await writeTrainStatus({
        status: "done",
        finishedAt: new Date().toISOString(),
        message: "Retrain finished. Refresh Training tab for new holdout metrics.",
        pid: null,
        lastError: null,
      });
    } else {
      await writeTrainStatus({
        status: "error",
        finishedAt: new Date().toISOString(),
        message: `Retrain failed with exit code ${code}.`,
        pid: null,
        lastError: `exit ${code}`,
      });
    }
  });

  return NextResponse.json({
    ok: true,
    trainStatus: await readTrainStatus(),
  });
}

export async function GET() {
  return NextResponse.json({ trainStatus: await readTrainStatus() });
}
