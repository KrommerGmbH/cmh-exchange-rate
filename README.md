# @krommergmbh/cmh-exchange-rate

[🇰🇷 한국어](README.ko.md) | [🇩🇪 Deutsch](README.de.md)

EUR-based exchange rate client. **ECB (European Central Bank) daily XML** as primary source, **Yahoo Finance API** as fallback.

TypeScript port of the `YahooExchangeRateService` from the PHP CmhCore plugin.

## Installation

```bash
npm install @krommergmbh/cmh-exchange-rate
# or
pnpm add @krommergmbh/cmh-exchange-rate
```

## Basic Usage

```ts
import { ExchangeRateClient } from '@krommergmbh/cmh-exchange-rate'

const client = new ExchangeRateClient()

// Get current exchange rates (EUR-based)
const snapshot = await client.getCurrentRates(['USD', 'KRW', 'GBP', 'JPY'])
console.log(snapshot.rates)
// → { USD: 1.083, KRW: 1534.2, GBP: 0.851, JPY: 163.4 }
console.log(snapshot.source)    // 'ecb' | 'yahoo' | 'cache'
console.log(snapshot.fetchedAt) // ISO 8601 timestamp

// Cross-rate calculation (USD → KRW)
const usdToKrw = await client.getCrossRate('USD', 'KRW')
console.log(usdToKrw) // ~1418.4

// Historical rates
const history = await client.getHistoricalRates(['KRW', 'USD'], '2026-01-01', '2026-01-31')
// → { KRW: [{date: '2026-01-02', rate: 1510.0}, ...], USD: [...] }
```

## Options

```ts
const client = new ExchangeRateClient({
  // Override ECB XML URL (proxy environments)
  ecbUrl: 'https://my-proxy.example.com/ecb-daily.xml',

  // Cache expiration (ms). Default: 1 hour
  cacheTtlMs: 30 * 60 * 1000, // 30 minutes

  // Rate change alert threshold (%). Default: 5%
  alertThresholdPct: 3,

  // Callback on rate spike
  onRateAlert: (currency, oldRate, newRate, changePct) => {
    console.warn(`[Alert] ${currency}: ${oldRate} → ${newRate} (${changePct.toFixed(1)}% change)`)
  },

  // Disable Yahoo Finance fallback
  enableYahooFallback: false,
})
```

## Data Sources

| Source | URL | Notes |
|--------|-----|-------|
| **ECB** (primary) | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` | Official, 30+ currencies, updated on business days |
| **ECB Historical** | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml` | Full history since 1999 |
| **Yahoo Finance** (fallback) | `https://query1.finance.yahoo.com/v8/finance/chart` | Unofficial API, near-real-time data |

## TypeScript Types

```ts
import type {
  ExchangeRateSnapshot,
  HistoricalRates,
  RateDataPoint,
  CurrencyCode,
  ExchangeRateClientOptions,
} from '@krommergmbh/cmh-exchange-rate'
```

## Electron / Node.js Environment

Requires Node.js 18+ or Electron 28+ (built-in `fetch` API).
For older environments, polyfill `globalThis.fetch` with `undici` or `node-fetch`.

```ts
// Node.js < 18 polyfill example
import { fetch } from 'undici'
globalThis.fetch = fetch as unknown as typeof globalThis.fetch
```

## Build

```bash
pnpm install
pnpm build
```

## License

MIT © KrommerGmbH