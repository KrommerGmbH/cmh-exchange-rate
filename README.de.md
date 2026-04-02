# @krommergmbh/cmh-exchange-rate

[🇬🇧 English](README.md) | [🇰🇷 한국어](README.ko.md)

EUR-basierter Wechselkurs-Client. **EZB (Europäische Zentralbank) Daily-XML** als Primärquelle, **Yahoo Finance API** als Fallback.

TypeScript-Portierung des `YahooExchangeRateService` aus dem PHP-CmhCore-Plugin.

## Installation

```bash
npm install @krommergmbh/cmh-exchange-rate
# oder
pnpm add @krommergmbh/cmh-exchange-rate
```

## Grundlegende Verwendung

```ts
import { ExchangeRateClient } from '@krommergmbh/cmh-exchange-rate'

const client = new ExchangeRateClient()

// Aktuelle Wechselkurse abrufen (EUR-Basis)
const snapshot = await client.getCurrentRates(['USD', 'KRW', 'GBP', 'JPY'])
console.log(snapshot.rates)
// → { USD: 1.083, KRW: 1534.2, GBP: 0.851, JPY: 163.4 }
console.log(snapshot.source)    // 'ecb' | 'yahoo' | 'cache'
console.log(snapshot.fetchedAt) // ISO-8601-Zeitstempel

// Kreuzkurs-Berechnung (USD → KRW)
const usdToKrw = await client.getCrossRate('USD', 'KRW')
console.log(usdToKrw) // ~1418.4

// Historische Kurse
const history = await client.getHistoricalRates(['KRW', 'USD'], '2026-01-01', '2026-01-31')
// → { KRW: [{date: '2026-01-02', rate: 1510.0}, ...], USD: [...] }
```

## Optionen

```ts
const client = new ExchangeRateClient({
  // EZB-XML-URL überschreiben (Proxy-Umgebungen)
  ecbUrl: 'https://my-proxy.example.com/ecb-daily.xml',

  // Cache-Ablaufzeit (ms). Standard: 1 Stunde
  cacheTtlMs: 30 * 60 * 1000, // 30 Minuten

  // Schwellenwert für Kursänderungsalarm (%). Standard: 5%
  alertThresholdPct: 3,

  // Callback bei starker Kursänderung
  onRateAlert: (currency, oldRate, newRate, changePct) => {
    console.warn(`[Alarm] ${currency}: ${oldRate} → ${newRate} (${changePct.toFixed(1)}% Änderung)`)
  },

  // Yahoo Finance Fallback deaktivieren
  enableYahooFallback: false,
})
```

## Datenquellen

| Quelle | URL | Hinweise |
|--------|-----|----------|
| **EZB** (primär) | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` | Offiziell, 30+ Währungen, Aktualisierung an Geschäftstagen |
| **EZB Historisch** | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml` | Vollständige Historie seit 1999 |
| **Yahoo Finance** (Fallback) | `https://query1.finance.yahoo.com/v8/finance/chart` | Inoffizielle API, nahezu Echtzeitdaten |

## TypeScript-Typen

```ts
import type {
  ExchangeRateSnapshot,
  HistoricalRates,
  RateDataPoint,
  CurrencyCode,
  ExchangeRateClientOptions,
} from '@krommergmbh/cmh-exchange-rate'
```

## Electron / Node.js Umgebung

Erfordert Node.js 18+ oder Electron 28+ (integrierte `fetch`-API).
Für ältere Umgebungen `globalThis.fetch` mit `undici` oder `node-fetch` polyfillieren.

```ts
// Node.js < 18 Polyfill-Beispiel
import { fetch } from 'undici'
globalThis.fetch = fetch as unknown as typeof globalThis.fetch
```

## Build

```bash
pnpm install
pnpm build
```

## Lizenz

MIT © KrommerGmbH
