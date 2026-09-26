import { readFile } from "node:fs/promises";
import { TRAINED_POLICY_PATH } from "./paths";
import { hydratePolicy, isTrainedPolicy } from "./policy";
import type { TrainedPolicy } from "./types";

export async function loadTrainedPolicy(): Promise<TrainedPolicy | null> {
  try {
    const raw = await readFile(TRAINED_POLICY_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isTrainedPolicy(parsed)) return null;
    return hydratePolicy(parsed);
  } catch {
    return null;
  }
}
