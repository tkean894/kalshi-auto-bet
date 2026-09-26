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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaperPortfolio } from "@/hooks/use-paper-portfolio";
import {
  DEFAULT_DESK_SETTINGS,
  MIN_MAX_TRADE,
  loadDeskSettings,
  normalizeDeskSettings,
  saveDeskSettings,
  sizeContracts,
  type DeskSettings,
} from "@/lib/desk/settings";
import {
  EDGE_SCORE_BY_STRATEGY,
  EDGE_SCORE_SUMMARY,
} from "@/lib/strategies/edge-score";
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
  Bot,
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
  useRef,
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
  const [settings, setSettings] = useState<DeskSettings>(DEFAULT_DESK_SETTINGS);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [maxTradeDraft, setMaxTradeDraft] = useState(
    String(DEFAULT_DESK_SETTINGS.maxTrade),
  );
  const hasLoadedOnce = useRef(false);
  const autoPassRef = useRef(0);

  const {
    portfolio,
    equity,
    pnl,
    hydrated,
    toast,
    placeTrade,
    exitPosition,
    reset,
    autoTradeSignals,
    clearAutoTradeMemory,
  } = usePaperPortfolio(markets);

  useEffect(() => {
    const loaded = loadDeskSettings();
    setSettings(loaded);
    setMaxTradeDraft(String(loaded.maxTrade));
    setSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    saveDeskSettings(settings);
  }, [settings, settingsHydrated]);

  const updateSettings = useCallback((patch: Partial<DeskSettings>) => {
    setSettings((prev) => normalizeDeskSettings({ ...prev, ...patch }));
  }, []);

  const contractsFor = useCallback(
    (entryPrice: number, suggested?: number) => {
      const sized = sizeContracts(entryPrice, settings.maxTrade, portfolio.cash);
      if (sized > 0) return sized;
      return Math.max(1, suggested ?? 1);
    },
    [settings.maxTrade, portfolio.cash],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      try {
        const [marketsRes, signalsRes] = await Promise.all([
          fetch("/api/markets?limit=100"),
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
        hasLoadedOnce.current = true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to refresh desk");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [strategyId],
  );

  useEffect(() => {
    void load({ silent: hasLoadedOnce.current });
  }, [load]);

  const matchesQuery = useCallback(
    (market: MarketQuote) => {
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        market.title.toLowerCase().includes(q) ||
        market.ticker.toLowerCase().includes(q) ||
        market.subtitle.toLowerCase().includes(q) ||
        market.eventTicker.toLowerCase().includes(q)
      );
    },
    [query],
  );

  const filteredMarkets = useMemo(
    () => markets.filter(matchesQuery),
    [markets, matchesQuery],
  );

  const filteredSignals = useMemo(
    () => signals.filter((signal) => matchesQuery(signal.market)),
    [signals, matchesQuery],
  );

  const openFromSignal = (signal: StrategySignal) => {
    setDraft({
      ticker: signal.market.ticker,
      title: signal.market.title,
      side: signal.side,
      entryPrice: signal.entryPrice,
      contracts: contractsFor(signal.entryPrice, signal.suggestedContracts),
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
      contracts: contractsFor(entry),
      strategyId: "manual",
    });
  };

  // Auto-trade: paper-fill ranked signals within bankroll / max trade.
  useEffect(() => {
    if (!settings.autoTrade || !hydrated || loading) return;
    if (filteredSignals.length === 0) return;
    if (portfolio.cash < 0.01) return;

    const pass = ++autoPassRef.current;
    // Defer one tick so mark-to-market effects settle first.
    const t = window.setTimeout(() => {
      if (pass !== autoPassRef.current) return;
      autoTradeSignals(filteredSignals, {
        maxTrade: settings.maxTrade,
        minEdgeScore: settings.minEdgeScore,
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [
    settings.autoTrade,
    settings.maxTrade,
    settings.minEdgeScore,
    filteredSignals,
    hydrated,
    loading,
    portfolio.cash,
    autoTradeSignals,
  ]);

  // Rescan while auto-trade is armed.
  useEffect(() => {
    if (!settings.autoTrade) return;
    const ms = settings.refreshSeconds * 1000;
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, ms);
    return () => window.clearInterval(id);
  }, [settings.autoTrade, settings.refreshSeconds, load]);

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
    const items = (filteredSignals.length ? filteredSignals : filteredMarkets).slice(
      0,
      12,
    );
    return [...items, ...items];
  }, [filteredSignals, filteredMarkets]);

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
                Set a bankroll and max ticket size, then arm auto-trade to
                paper-fill ranked Kalshi signals within those limits.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="animate-pulse-edge bg-edge text-edge-foreground hover:bg-edge/90"
                onClick={() => {
                  setActiveTab("signals");
                  void load({ silent: hasLoadedOnce.current });
                }}
                disabled={loading || refreshing}
              >
                {refreshing ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                Run scanners
                <ArrowUpRight data-icon="inline-end" />
              </Button>
              <Button
                variant="outline"
                className="border-white/25 bg-white/5 text-primary-foreground hover:bg-white/10"
                onClick={() => setActiveTab("risk")}
              >
                <Bot data-icon="inline-start" />
                {settings.autoTrade ? "Auto-trade on" : "Risk & auto-trade"}
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
              label="Bankroll cash"
              value={hydrated ? formatUsd(portfolio.cash) : "—"}
              hint={`Max ticket ${formatUsd(settings.maxTrade)}`}
            />
            <StatTile
              label="Signals"
              value={loading ? "…" : String(filteredSignals.length)}
              hint={strategyMeta?.name ?? "All strategies"}
            />
            <StatTile
              label="Auto-trade"
              value={settings.autoTrade ? "Armed" : "Off"}
              hint={
                settings.autoTrade
                  ? `Edge ≥ ${settings.minEdgeScore} · every ${settings.refreshSeconds}s`
                  : source === "live"
                    ? "Kalshi public API"
                    : "Demo markets"
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
            Strategies rank opportunities. Auto-trade paper-fills within your
            bankroll and max ticket — still simulated in this browser, not live Kalshi orders.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter signals & markets…"
            className="bg-card sm:w-64"
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
          <TabsTrigger value="risk" className="gap-1.5">
            <Bot className="size-3.5" />
            Risk & auto
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
                <Badge variant="secondary">{filteredSignals.length} signals</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {strategyMeta.description}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Edge score:</span>{" "}
                {EDGE_SCORE_SUMMARY.body} See{" "}
                <button
                  type="button"
                  className="font-medium text-edge underline-offset-2 hover:underline"
                  onClick={() => setActiveTab("risk")}
                >
                  Risk & auto
                </button>{" "}
                for per-strategy formulas.
              </p>
            </div>
          ) : null}

          {loading ? (
            <EmptyState icon={<LoaderCircle className="animate-spin" />} title="Scanning markets…" />
          ) : filteredSignals.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title={
                signals.length === 0
                  ? "No signals for this scanner"
                  : "No signals match this filter"
              }
              body={
                signals.length === 0
                  ? "Try another strategy or clear the filter — thin books get skipped."
                  : "Clear the search box or try a different ticker / title fragment."
              }
            />
          ) : (
            <div className="grid gap-3">
              {filteredSignals.map((signal) => (
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
                            {contractsFor(signal.entryPrice, signal.suggestedContracts)} cts
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => reset(settings.bankroll)}
            >
              Reset to {formatUsd(settings.bankroll, 0)}
            </Button>
          </div>

          {portfolio.positions.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="No open paper tickets"
              body="Arm auto-trade under Risk & auto, or paper-buy from Signals / Markets."
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

        <TabsContent value="risk" className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-card/95 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h3 className="font-heading text-xl font-semibold">Risk controls</h3>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Bankroll sets paper cash on reset. Max trade caps every ticket
                  (manual and auto). Auto-trade paper-buys ranked signals until cash runs out.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-secondary/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Auto-trade</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.autoTrade ? "Armed — paper fills only" : "Off"}
                  </p>
                </div>
                <Switch
                  checked={settings.autoTrade}
                  onCheckedChange={(checked) => {
                    if (checked) clearAutoTradeMemory();
                    updateSettings({ autoTrade: checked });
                    if (checked) {
                      setActiveTab("paper");
                      void load({ silent: true });
                    }
                  }}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="bankroll">Bankroll ($)</Label>
                <Input
                  id="bankroll"
                  type="number"
                  min={1}
                  step={50}
                  value={settings.bankroll}
                  onChange={(e) =>
                    updateSettings({
                      bankroll: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max-trade">Max trade ($)</Label>
                <Input
                  id="max-trade"
                  type="number"
                  min={MIN_MAX_TRADE}
                  step={0.01}
                  inputMode="decimal"
                  value={maxTradeDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setMaxTradeDraft(raw);
                    const n = Number.parseFloat(raw);
                    if (Number.isFinite(n) && n >= MIN_MAX_TRADE) {
                      updateSettings({ maxTrade: n });
                    }
                  }}
                  onBlur={() => {
                    const next = normalizeDeskSettings({
                      ...settings,
                      maxTrade: Number.parseFloat(maxTradeDraft),
                    });
                    setSettings(next);
                    setMaxTradeDraft(String(next.maxTrade));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum $0.05 (5¢). Example: 0.05 or 0.50.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="min-edge">Min edge score</Label>
                <Input
                  id="min-edge"
                  type="number"
                  min={0}
                  max={99}
                  step={1}
                  value={settings.minEdgeScore}
                  onChange={(e) =>
                    updateSettings({
                      minEdgeScore: Number.parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refresh-sec">Rescan every (sec)</Label>
                <Input
                  id="refresh-sec"
                  type="number"
                  min={15}
                  max={600}
                  step={5}
                  value={settings.refreshSeconds}
                  onChange={(e) =>
                    updateSettings({
                      refreshSeconds: Number.parseInt(e.target.value, 10) || 45,
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  clearAutoTradeMemory();
                  reset(settings.bankroll);
                  setActiveTab("paper");
                }}
              >
                Apply bankroll & reset desk
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearAutoTradeMemory();
                  updateSettings({ autoTrade: true });
                  setActiveTab("paper");
                  void load({ silent: true });
                }}
              >
                Arm auto-trade now
              </Button>
            </div>

            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
              Auto-trade is paper-only. It sizes each fill to at most your max trade,
              never spends more cash than the current paper bankroll, and skips markets
              you already hold. Live Kalshi orders are not placed.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/95 p-4 sm:p-5">
            <h3 className="font-heading text-xl font-semibold">
              {EDGE_SCORE_SUMMARY.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {EDGE_SCORE_SUMMARY.body}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {EDGE_SCORE_SUMMARY.confidence}
            </p>
            <ul className="mt-4 space-y-3">
              {EDGE_SCORE_BY_STRATEGY.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-muted-foreground">{item.formula}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-card/95 px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Deployed
              </p>
              <p className="mt-1 font-heading text-xl font-semibold">
                {formatUsd(Math.max(0, portfolio.startingCash - portfolio.cash))}
              </p>
              <p className="text-xs text-muted-foreground">
                of {formatUsd(portfolio.startingCash, 0)} starting bankroll
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/95 px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Next ticket size
              </p>
              <p className="mt-1 font-heading text-xl font-semibold">
                {formatUsd(Math.min(settings.maxTrade, portfolio.cash))}
              </p>
              <p className="text-xs text-muted-foreground">
                min(max trade, remaining cash)
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/95 px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Open tickets
              </p>
              <p className="mt-1 font-heading text-xl font-semibold">
                {portfolio.positions.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Strategy filter: {strategyMeta?.name ?? "All"}
              </p>
            </div>
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
        Edgebook ranks heuristic signals for research and paper trading. Auto-trade
        only simulates fills in your browser within your bankroll and max ticket.
        Prediction markets involve risk of loss. Live Kalshi order placement is not
        enabled in this slice.
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
                  <Label>Entry (dollars)</Label>
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
