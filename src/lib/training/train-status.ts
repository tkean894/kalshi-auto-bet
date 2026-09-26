import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DATA_ROOT, TRAIN_STATUS_PATH } from "./paths";

export type TrainStatus = {
  status: "idle" | "running" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  pid: number | null;
  lastError: string | null;
};

const IDLE: TrainStatus = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  message: "No retrain in progress.",
  pid: null,
  lastError: null,
};

export async function readTrainStatus(): Promise<TrainStatus> {
  try {
    const raw = await readFile(TRAIN_STATUS_PATH, "utf8");
    return { ...IDLE, ...(JSON.parse(raw) as Partial<TrainStatus>) };
  } catch {
    return { ...IDLE };
  }
}

export async function writeTrainStatus(
  patch: Partial<TrainStatus>,
): Promise<TrainStatus> {
  const current = await readTrainStatus();
  const next: TrainStatus = { ...current, ...patch };
  await mkdir(DATA_ROOT, { recursive: true });
  await writeFile(TRAIN_STATUS_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}
