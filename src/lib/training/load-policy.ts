import { readFile } from "node:fs/promises";
import { TRAINED_POLICY_PATH } from "./paths";
import { isTrainedPolicy } from "./policy";
import type { TrainedPolicy } from "./types";

export async function loadTrainedPolicy(): Promise<TrainedPolicy | null> {
  try {
    const raw = await readFile(TRAINED_POLICY_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isTrainedPolicy(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
