import { midPrice, parseDollars, spreadWidth } from "@/lib/format";
import type { KalshiMarket, MarketQuote } from "./types";

export function normalizeMarket(market: KalshiMarket): MarketQuote {
  const yesBid = parseDollars(market.yes_bid_dollars);
  const yesAsk = parseDollars(market.yes_ask_dollars);
  const noBid = parseDollars(market.no_bid_dollars);
  const noAsk = parseDollars(market.no_ask_dollars);
  const lastPrice = parseDollars(market.last_price_dollars);
  const previousPrice = parseDollars(market.previous_price_dollars);
  const volume = parseDollars(market.volume_fp);
  const openInterest = parseDollars(market.open_interest_fp);
  const liquidity = parseDollars(market.liquidity_dollars);

  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    title: market.title || market.yes_sub_title || market.ticker,
    subtitle: market.subtitle || market.yes_sub_title || market.event_ticker,
    status: market.status,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    lastPrice,
    previousPrice,
    volume,
    openInterest,
    liquidity,
    closeTime: market.close_time ?? null,
    mid: midPrice(yesBid, yesAsk) || lastPrice,
    spread: spreadWidth(yesBid, yesAsk),
  };
}
