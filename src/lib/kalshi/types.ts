export type KalshiMarket = {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status: string;
  market_type?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  previous_yes_bid_dollars?: string;
  previous_yes_ask_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  close_time?: string;
  open_time?: string;
  category?: string;
  result?: string;
  settlement_ts?: string;
  settlement_value_dollars?: string;
};

export type MarketQuote = {
  ticker: string;
  eventTicker: string;
  title: string;
  subtitle: string;
  status: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  previousPrice: number;
  volume: number;
  openInterest: number;
  liquidity: number;
  closeTime: string | null;
  mid: number;
  spread: number;
  /** Normalized category when known (live or historical). */
  category?: string;
};

export type MarketsResponse = {
  markets: MarketQuote[];
  source: "live" | "mock";
  fetchedAt: string;
  error?: string;
};
