# @krommergmbh/cmh-exchange-rate

[🇬🇧 English](README.md) | [🇩🇪 Deutsch](README.de.md)

EUR 기준 환율 클라이언트. **ECB (유럽중앙은행) daily XML** 1순위, **Yahoo Finance API** fallback.

PHP CmhCore 플러그인의 `YahooExchangeRateService`를 TypeScript로 포팅.

## 설치

```bash
npm install @krommergmbh/cmh-exchange-rate
# 또는
pnpm add @krommergmbh/cmh-exchange-rate
```

## 기본 사용

```ts
import { ExchangeRateClient } from '@krommergmbh/cmh-exchange-rate'

const client = new ExchangeRateClient()

// 현재 환율 조회 (EUR 기준)
const snapshot = await client.getCurrentRates(['USD', 'KRW', 'GBP', 'JPY'])
console.log(snapshot.rates)
// → { USD: 1.083, KRW: 1534.2, GBP: 0.851, JPY: 163.4 }
console.log(snapshot.source)   // 'ecb' | 'yahoo' | 'cache'
console.log(snapshot.fetchedAt) // ISO 8601 타임스탬프

// 크로스 환율 계산 (USD → KRW)
const usdToKrw = await client.getCrossRate('USD', 'KRW')
console.log(usdToKrw) // ~1418.4

// 히스토리 조회
const history = await client.getHistoricalRates(['KRW', 'USD'], '2026-01-01', '2026-01-31')
// → { KRW: [{date: '2026-01-02', rate: 1510.0}, ...], USD: [...] }
```

## 옵션

```ts
const client = new ExchangeRateClient({
  // ECB XML URL 오버라이드 (프록시 환경)
  ecbUrl: 'https://my-proxy.example.com/ecb-daily.xml',

  // 캐시 만료 시간 (ms). 기본: 1시간
  cacheTtlMs: 30 * 60 * 1000, // 30분

  // 환율 급변 알림 임계값 (%). 기본: 5%
  alertThresholdPct: 3,

  // 급변 시 콜백
  onRateAlert: (currency, oldRate, newRate, changePct) => {
    console.warn(`[알림] ${currency}: ${oldRate} → ${newRate} (${changePct.toFixed(1)}% 변동)`)
  },

  // Yahoo Finance fallback 비활성화
  enableYahooFallback: false,
})
```

## 데이터 소스

| 소스 | URL | 특징 |
|------|-----|------|
| **ECB** (1순위) | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` | 공식, 30+ 통화, 영업일 업데이트 |
| **ECB 히스토리** | `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml` | 1999년부터 전체 히스토리 |
| **Yahoo Finance** (fallback) | `https://query1.finance.yahoo.com/v8/finance/chart` | 비공식 API, 실시간에 가까운 데이터 |

## TypeScript 타입

```ts
import type {
  ExchangeRateSnapshot,
  HistoricalRates,
  RateDataPoint,
  CurrencyCode,
  ExchangeRateClientOptions,
} from '@krommergmbh/cmh-exchange-rate'
```

## Electron / Node.js 환경

Node.js 18+ 또는 Electron 28+ (내장 `fetch` API 필요).
구버전 환경에서는 `undici` 또는 `node-fetch`로 `globalThis.fetch` 폴리필 적용 후 사용.

```ts
// Node.js < 18 폴리필 예시
import { fetch } from 'undici'
globalThis.fetch = fetch as unknown as typeof globalThis.fetch
```

## 빌드

```bash
pnpm install
pnpm build
```

## 라이선스

MIT © KrommerGmbH
