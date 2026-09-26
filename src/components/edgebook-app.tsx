"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaperPortfolio } from "@/hooks/use-paper-portfolio";
import { formatCents, formatCompact, formatPct, formatUsd } from "@/lib/format";
import type { MarketQuote } from "@/lib/kalshi/types";
import {
  positionCost,
  unrealizedPnl,
} from "@/lib/paper/portfolio";
import type {
  StrategyId,
  StrategySignal,
} from "@/lib/strategies/types";
import {
  Activity,
  ArrowUpRight,
  LineChart,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StrategyMeta = {
  id: StrategyId;
  name: string;
  tagline: string;
  description: string;
};

type SignalsPayload = {
  strategy: {
    id: StrategyId | "all";
    name: string;
    tagline: string;
    description: string;
  };
  strategies: StrategyMeta[];
  signals: StrategySignal[];
  source: "live" | "mock";
  fetchedAt: string;
  error?: string;
};

type MarketsPayload = {
  markets: MarketQuote[];
  source: "live" | "mock";
  fetchedAt: string;
  error?: string;
};

type TradeDraft = {
  ticker: string;
  title: string;
  side: "yes" | "no";
  entryPrice: number;
  contracts: number;
  strategyId: StrategyId | "manual";
  rationale?: string;
};

const STRATEGY_ALL = "all";

export function EdgebookApp() {
  const [markets, setMarkets] = useState<MarketQuote[]>([]);
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [strategyId, setStrategyId] = useState<StrategyId | "all">(STRATEGY_ALL);
  const [strategyMeta, setStrategyMeta] = useState<SignalsPayload["strategy"] | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"live" | "mock">("live");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const [activeTab, setActiveTab] = useState("signals");

  const {
    portfolio,
    equity,
    pnl,
    hydrated,
    toast,
    placeTrade,
    exitPosition,
    reset,
  } = usePaperPortfolio(markets);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [marketsRes, signalsRes] = await Promise.all([
          fetch(`/api/markets?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`),
          fetch(`/api/signals?strategy=${strategyId}&limit=100`),
        ]);
        const marketsJson = (await marketsRes.json()) as MarketsPayload;
        const signalsJson = (await signalsRes.json()) as SignalsPayload;

        setMarkets(marketsJson.markets);
        setSignals(signalsJson.signals);
        setStrategies(signalsJson.strategies);
        setStrategyMeta(signalsJson.strategy);
        setSource(marketsJson.source);
        setError(marketsJson.error ?? signalsJson.error ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to refresh desk");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, strategyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMarkets = useMemo(() => {
    if (!query.trim()) return markets;
    const q = query.trim().toLowerCase();
    return markets.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.ticker.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q),
    );
  }, [markets, query]);

  const openFromSignal = (signal: StrategySignal) => {
    setDraft({
      ticker: signal.market.ticker,
      title: signal.market.title,
      side: signal.side,
      entryPrice: signal.entryPrice,
      contracts: signal.suggestedContracts,
      strategyId: signal.strategyId,
      rationale: signal.rationale,
    });
  };

  const openManual = (market: MarketQuote, side: "yes" | "no") => {
    const entry =
      side === "yes" ? market.yesAsk || market.mid : market.noAsk || 1 - market.yesBid;
    setDraft({
      ticker: market.ticker,
      title: market.title,
      side,
      entryPrice: entry,
      contracts: Math.max(1, Math.floor(25 / Math.max(entry, 0.01))),
      strategyId: "manual",
    });
  };

  const confirmTrade = () => {
    if (!draft) return;
    placeTrade({
      ticker: draft.ticker,
      title: draft.title,
      side: draft.side,
      contracts: draft.contracts,
      entryPrice: draft.entryPrice,
      strategyId: draft.strategyId,
    });
    setDraft(null);
    setActiveTab("paper");
  };

  const tickerTape = useMemo(() => {
    const items = (signals.length ? signals : markets).slice(0, 12);
    return [...items, ...items];
  }, [signals, markets]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="animate-rise relative overflow-hidden rounded-2xl border border-border/80 bg-primary text-primary-foreground shadow-[0_24px_60px_-36px_rgba(13,59,54,0.65)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(26,155,114,0.55), transparent 42%), radial-gradient(circle at 85% 10%, rgba(247,251,252,0.16), transparent 35%), linear-gradient(120deg, transparent 40%, rgba(198,242,223,0.12) 100%)",
          }}
        />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 font-mono text-[11px] tracking-[0.18em] uppercase">
              <Sparkles className="size-3.5 text-edge" />
              Kalshi strategy desk
            </div>
            <div>
              <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                Edgebook
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
                Scan live Kalshi markets, rank bets with pluggable strategies, and
                paper-trade the tickets before you risk real capital.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="animate-pulse-edge bg-edge text-edge-foreground hover:bg-edge/90"
                onClick={() => setActiveTab("signals")}
              >
                Run scanners
                <ArrowUpRight data-icon="inline-end" />
              </Button>
              <Button
                variant="outline"
                className="border-white/25 bg-white/5 text-primary-foreground hover:bg-white/10"
                onClick={() => void load({ silent: true })}
                disabled={refreshing}
              >
                {refreshing ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <RefreshCw data-icon="inline-start" />
                )}
                Refresh quotes
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <StatTile
              label="Paper equity"
              value={hydrated ? formatUsd(equity) : "—"}
              hint={hydrated ? `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)} P&L` : "Loading"}
              tone={pnl >= 0 ? "gain" : "loss"}
            />
            <StatTile
              label="Open tickets"
              value={hydrated ? String(portfolio.positions.length) : "—"}
              hint={`${formatUsd(portfolio.cash)} cash`}
            />
            <StatTile
              label="Signals"
              value={loading ? "…" : String(signals.length)}
              hint={strategyMeta?.name ?? "All strategies"}
            />
            <StatTile
              label="Data"
              value={source === "live" ? "Live" : "Demo"}
              hint={
                source === "live"
                  ? "Kalshi public API"
                  : "Mock fallback active"
              }
            />
          </div>
        </div>
        <div className="relative border-t border-white/10 bg-black/15 py-2">
          <div className="overflow-hidden">
            <div className="animate-ticker flex w-max gap-8 whitespace-nowrap px-4 font-mono text-xs text-primary-foreground/75">
              {tickerTape.map((item, idx) => {
                const isSignal = "edgeScore" in item;
                const market = isSignal ? item.market : item;
                const label = isSignal
                  ? `${item.side.toUpperCase()} · ${item.strategyName} · score ${item.edgeScore}`
                  : `${formatCents(market.mid || market.lastPrice)} mid`;
                return (
                  <span key={`${market.ticker}-${idx}`} className="inline-flex gap-2">
                    <span className="text-edge">{market.ticker}</span>
                    <span className="max-w-[28ch] truncate opacity-80">
                      {market.title}
                    </span>
                    <span>{label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="animate-rise-delay-1 rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {error}
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <section className="animate-rise-delay-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink">
            Trading desk
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Strategies rank opportunities. Paper trades stay local in your browser —
            nothing hits Kalshi until you wire API keys later.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter markets…"
            className="bg-card sm:w-56"
          />
          <Select
            value={strategyId}
            onValueChange={(v) => setStrategyId((v as StrategyId | "all") ?? STRATEGY_ALL)}
          >
            <SelectTrigger className="bg-card sm:w-56">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              {strategies.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-rise-delay-2 gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start bg-card/80 p-1">
          <TabsTrigger value="signals" className="gap-1.5">
            <Target className="size-3.5" />
            Signals
          </TabsTrigger>
          <TabsTrigger value="markets" className="gap-1.5">
            <LineChart className="size-3.5" />
            Markets
          </TabsTrigger>
          <TabsTrigger value="paper" className="gap-1.5">
            <Wallet className="size-3.5" />
            Paper desk
          </TabsTrigger>
          <TabsTrigger value="strategies" className="gap-1.5">
            <Activity className="size-3.5" />
            Strategies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-3">
          {strategyMeta ? (
            <div className="rounded-xl border border-border/80 bg-card/90 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-lg font-semibold">{strategyMeta.name}</h3>
                <Badge variant="secondary">{signals.length} signals</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {strategyMeta.description}
              </p>
            </div>
          ) : null}

          {loading ? (
            <EmptyState icon={<LoaderCircle className="animate-spin" />} title="Scanning markets…" />
          ) : signals.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title="No signals for this scanner"
              body="Try another strategy or clear the filter — thin books get skipped."
            />
          ) : (
            <div className="grid gap-3">
              {signals.map((signal) => (
                <article
                  key={signal.id}
                  className="group rounded-xl border border-border/80 bg-card/95 p-4 transition hover:border-edge/40 hover:shadow-[0_16px_40px_-28px_rgba(13,59,54,0.45)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-edge text-edge-foreground hover:bg-edge">
                          {signal.side.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{signal.strategyName}</Badge>
                        <Badge variant="secondary">
                          Edge {signal.edgeScore}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {signal.confidence}
                        </Badge>
                      </div>
                      <h4 className="font-heading text-base font-semibold leading-snug sm:text-lg">
                        {signal.market.title}
                      </h4>
                      <p className="font-mono text-xs text-muted-foreground">
                        {signal.market.ticker}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {signal.rationale}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:min-w-44">
                      <div className="rounded-lg bg-secondary/70 px-3 py-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">Entry</span>
                          <span className="font-mono font-medium">
                            {formatCents(signal.entryPrice)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between gap-4">
                          <span className="text-muted-foreground">Upside</span>
                          <span className="font-mono font-medium text-gain">
                            {formatCents(signal.potentialPayoutPerContract)}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between gap-4">
                          <span className="text-muted-foreground">Size</span>
                          <span className="font-mono font-medium">
                            {signal.suggestedContracts} cts
                          </span>
                        </div>
                      </div>
                      <Button onClick={() => openFromSignal(signal)}>
                        Paper trade
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="markets" className="space-y-3">
          {loading ? (
            <EmptyState icon={<LoaderCircle className="animate-spin" />} title="Loading markets…" />
          ) : filteredMarkets.length === 0 ? (
            <EmptyState
              icon={<LineChart />}
              title="No markets match"
              body="Clear the search or refresh quotes."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/80 bg-card/95">
              <div className="hidden grid-cols-[1.6fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] gap-3 border-b border-border/70 px-4 py-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase md:grid">
                <span>Market</span>
                <span>YES</span>
                <span>Mid</span>
                <span>Spread</span>
                <span>Volume</span>
                <span />
              </div>
              <ul className="divide-y divide-border/60">
                {filteredMarkets.map((market) => (
                  <li
                    key={market.ticker}
                    className="grid gap-3 px-4 py-3 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{market.title}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {market.ticker}
                      </p>
                    </div>
                    <p className="font-mono text-sm">
                      <span className="text-muted-foreground md:hidden">YES </span>
                      {formatCents(market.yesBid)} / {formatCents(market.yesAsk)}
                    </p>
                    <p className="font-mono text-sm">
                      <span className="text-muted-foreground md:hidden">Mid </span>
                      {formatCents(market.mid || market.lastPrice)}
                    </p>
                    <p className="font-mono text-sm">
                      <span className="text-muted-foreground md:hidden">Spread </span>
                      {formatCents(market.spread)}
                    </p>
                    <p className="font-mono text-sm">
                      <span className="text-muted-foreground md:hidden">Vol </span>
                      {formatCompact(market.volume)}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openManual(market, "yes")}>
                        YES
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openManual(market, "no")}>
                        NO
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="paper" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Equity" value={formatUsd(equity)} hint="Cash + marks" />
            <StatTile
              label="Cash"
              value={formatUsd(portfolio.cash)}
              hint={`${portfolio.trades.length} fills logged`}
            />
            <StatTile
              label="Session P&L"
              value={`${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}
              hint={formatPct(portfolio.startingCash ? pnl / portfolio.startingCash : 0, 1)}
              tone={pnl >= 0 ? "gain" : "loss"}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-lg font-semibold">Open positions</h3>
            <Button variant="outline" size="sm" onClick={reset}>
              Reset paper desk
            </Button>
          </div>

          {portfolio.positions.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="No open paper tickets"
              body="Accept a signal or buy YES/NO from the markets tab."
            />
          ) : (
            <div className="grid gap-3">
              {portfolio.positions.map((position) => {
                const upnl = unrealizedPnl(position);
                return (
                  <article
                    key={position.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/95 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="mb-1 flex flex-wrap gap-2">
                        <Badge className="bg-edge text-edge-foreground hover:bg-edge">
                          {position.side.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{position.strategyId}</Badge>
                      </div>
                      <h4 className="font-medium">{position.title}</h4>
                      <p className="font-mono text-xs text-muted-foreground">
                        {position.contracts} @ {formatCents(position.entryPrice)} · mark{" "}
                        {formatCents(position.markPrice)} · cost{" "}
                        {formatUsd(positionCost(position))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-sm font-semibold ${upnl >= 0 ? "text-gain" : "text-loss"}`}
                      >
                        {upnl >= 0 ? "+" : ""}
                        {formatUsd(upnl)}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => exitPosition(position.id)}>
                        Close
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div>
            <h3 className="mb-2 font-heading text-lg font-semibold">Recent fills</h3>
            {portfolio.trades.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fills yet.</p>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card/95">
                {portfolio.trades.slice(0, 12).map((trade) => (
                  <li
                    key={trade.id}
                    className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="font-medium capitalize">{trade.action}</span>{" "}
                      {trade.contracts} {trade.side.toUpperCase()} · {trade.ticker}
                    </div>
                    <div className="font-mono text-muted-foreground">
                      {formatCents(trade.price)} · {formatUsd(trade.cost)}
                      {typeof trade.pnl === "number"
                        ? ` · P&L ${trade.pnl >= 0 ? "+" : ""}${formatUsd(trade.pnl)}`
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="strategies" className="grid gap-3 md:grid-cols-2">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              onClick={() => {
                setStrategyId(strategy.id);
                setActiveTab("signals");
              }}
              className="rounded-xl border border-border/80 bg-card/95 p-4 text-left transition hover:border-edge/45 hover:shadow-[0_16px_40px_-28px_rgba(13,59,54,0.45)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold">{strategy.name}</h3>
                <ArrowUpRight className="size-4 text-edge" />
              </div>
              <p className="text-sm font-medium text-edge">{strategy.tagline}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {strategy.description}
              </p>
            </button>
          ))}
        </TabsContent>
      </Tabs>

      <footer className="border-t border-border/70 pt-4 pb-8 text-xs leading-relaxed text-muted-foreground">
        Edgebook ranks heuristic signals for research and paper trading. Prediction
        markets involve risk of loss. Past scanner scores are not guarantees. Live
        order placement requires your own Kalshi API credentials and is not enabled
        in this first slice.
      </footer>

      <Sheet open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Paper trade</SheetTitle>
            <SheetDescription>
              Simulated fill at the current ask. Stored only in this browser.
            </SheetDescription>
          </SheetHeader>
          {draft ? (
            <div className="grid flex-1 gap-4 px-4">
              <div>
                <p className="font-heading text-base font-semibold">{draft.title}</p>
                <p className="font-mono text-xs text-muted-foreground">{draft.ticker}</p>
              </div>
              {draft.rationale ? (
                <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                  {draft.rationale}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Side</Label>
                  <Select
                    value={draft.side}
                    onValueChange={(v) =>
                      setDraft((d) => (d && v ? { ...d, side: v as "yes" | "no" } : d))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">YES</SelectItem>
                      <SelectItem value="no">NO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Entry ($)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    max={0.99}
                    step={0.01}
                    value={draft.entryPrice}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              entryPrice: Number.parseFloat(e.target.value) || 0,
                            }
                          : d,
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Contracts</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={draft.contracts}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            contracts: Number.parseInt(e.target.value, 10) || 0,
                          }
                        : d,
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Cost{" "}
                  {formatUsd(
                    Math.max(0, draft.contracts) * Math.max(0, draft.entryPrice),
                  )}{" "}
                  · cash {formatUsd(portfolio.cash)}
                </p>
              </div>
            </div>
          ) : null}
          <SheetFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button onClick={confirmTrade}>Confirm paper buy</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "gain" | "loss";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-sm">
      <p className="font-mono text-[10px] tracking-[0.16em] text-primary-foreground/65 uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-heading text-xl font-semibold ${
          tone === "gain"
            ? "text-[#9dffc8]"
            : tone === "loss"
              ? "text-[#ffb4a8]"
              : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-primary-foreground/65">{hint}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="font-heading text-lg font-semibold">{title}</p>
      {body ? <p className="max-w-md text-sm text-muted-foreground">{body}</p> : null}
    </div>
  );
}
