import { featureVector, type SignalFeatures } from "@/lib/trading/features";

export type LogisticModel = {
  weights: number[];
  trainedOn: number;
  trainAccuracy: number;
  learningRate: number;
  epochs: number;
};

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function predictProba(model: LogisticModel, x: number[]): number {
  let z = 0;
  const n = Math.min(model.weights.length, x.length);
  for (let i = 0; i < n; i += 1) z += model.weights[i] * x[i];
  return sigmoid(z);
}

export function trainLogistic(
  rows: {
    edgeScore: number;
    side: "yes" | "no";
    features: SignalFeatures;
    hit: boolean;
  }[],
  opts?: { epochs?: number; learningRate?: number },
): LogisticModel | null {
  if (rows.length < 40) return null;
  const epochs = opts?.epochs ?? 250;
  const learningRate = opts?.learningRate ?? 0.15;
  const dim = featureVector(50, "yes", rows[0].features).length;
  const weights = new Array(dim).fill(0);

  const X = rows.map((r) =>
    featureVector(r.edgeScore, r.side, r.features),
  );
  const y = rows.map((r) => (r.hit ? 1 : 0));

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grad = new Array(dim).fill(0);
    for (let i = 0; i < X.length; i += 1) {
      let z = 0;
      for (let j = 0; j < dim; j += 1) z += weights[j] * X[i][j];
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < dim; j += 1) grad[j] += err * X[i][j];
    }
    for (let j = 0; j < dim; j += 1) {
      weights[j] -= (learningRate * grad[j]) / X.length;
    }
  }

  let correct = 0;
  for (let i = 0; i < X.length; i += 1) {
    let z = 0;
    for (let j = 0; j < dim; j += 1) z += weights[j] * X[i][j];
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct += 1;
  }

  return {
    weights,
    trainedOn: rows.length,
    trainAccuracy: correct / rows.length,
    learningRate,
    epochs,
  };
}

/** Convert model probability into a rank boost in edge-score points. */
export function logisticRankBoost(
  model: LogisticModel | null | undefined,
  edgeScore: number,
  side: "yes" | "no",
  features: SignalFeatures,
): number {
  if (!model) return 0;
  const p = predictProba(
    model,
    featureVector(edgeScore, side, features),
  );
  // Map 0.35–0.75 → roughly -10..+15 boost
  return Math.round((p - 0.5) * 40);
}
