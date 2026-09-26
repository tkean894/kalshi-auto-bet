import path from "node:path";

export const DATA_ROOT = path.join(process.cwd(), "data");
export const DAY_CACHE_DIR = path.join(DATA_ROOT, "day-cache");
export const TRAINED_POLICY_PATH = path.join(DATA_ROOT, "trained-policy.json");
export const TRAIN_REPORT_PATH = path.join(DATA_ROOT, "train-report.json");
export const TRAIN_STATUS_PATH = path.join(DATA_ROOT, "train-status.json");
