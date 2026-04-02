/**
 * @module @krommergmbh/cmh-exchange-rate
 *
 * EUR 기준 환율 클라이언트.
 * 1순위: ECB (유럽중앙은행) daily XML
 * 2순위: Yahoo Finance API (fallback)
 *
 * PHP CmhCore YahooExchangeRateService를 TypeScript로 포팅.
 *
 * @example
 * ```ts
 * import { ExchangeRateClient } from '@krommergmbh/cmh-exchange-rate'
 *
 * const client = new ExchangeRateClient()
 * const rates = await client.getCurrentRates(['USD', 'KRW', 'GBP'])
 * // → { USD: 1.083, KRW: 1534.2, GBP: 0.8512 }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 4217 통화 코드 */
export type CurrencyCode = string

/** EUR 기준 환율 스냅샷 */
export interface ExchangeRateSnapshot {
  /** 기준 통화 (항상 EUR) */
  base: 'EUR'
  /** 환율 기준 날짜 (YYYY-MM-DD) */
  date: string
  /** 통화 코드 → EUR 기준 환율 */
  rates: Record<CurrencyCode, number>
  /** 데이터 소스 */
  source: 'ecb' | 'yahoo' | 'cache'
  /** 조회 타임스탬프 */
  fetchedAt: string
}

/** 히스토리 데이터 포인트 */
export interface RateDataPoint {
  date: string
  rate: number
}

/** 히스토리 조회 결과 */
export type HistoricalRates = Record<CurrencyCode, RateDataPoint[]>

/** ExchangeRateClient 생성 옵션 */
export interface ExchangeRateClientOptions {
  /**
   * ECB XML URL 오버라이드 (기본: ECB 공식 URL).
   * 프록시 환경에서 유용.
   */
  ecbUrl?: string
  /**
   * 캐시 만료 시간 (ms). 기본: 1시간 (3_600_000).
   * 동일 인스턴스 재호출 시 이 시간 이내면 캐시 반환.
   */
  cacheTtlMs?: number
  /**
   * 환율 급변 알림 임계값 (%). 기본: 5.
   * onRateAlert 콜백이 등록된 경우 이 수치 초과 시 호출.
   */
  alertThresholdPct?: number
  /**
   * 환율 급변 알림 콜백.
   */
  onRateAlert?: (currency: CurrencyCode, oldRate: number, newRate: number, changePct: number) => void
  /**
   * Yahoo Finance API를 fallback으로 사용할지 여부. 기본: true.
   * Yahoo API는 인증이 필요 없지만 비공식 엔드포인트를 사용함.
   */
  enableYahooFallback?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ECB_DAILY_XML_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

const ECB_HISTORY_XML_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml'

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'

// ─────────────────────────────────────────────────────────────────────────────
// ExchangeRateClient
// ─────────────────────────────────────────────────────────────────────────────

export class ExchangeRateClient {
  private readonly ecbUrl: string
  private readonly cacheTtlMs: number
  private readonly alertThresholdPct: number
  private readonly onRateAlert?: ExchangeRateClientOptions['onRateAlert']
  private readonly enableYahooFallback: boolean

  /** 인메모리 캐시 */
  private cache: ExchangeRateSnapshot | null = null
  /** 이전 스냅샷 (급변 감지용) */
  private prevSnapshot: ExchangeRateSnapshot | null = null

  constructor(options: ExchangeRateClientOptions = {}) {
    this.ecbUrl = options.ecbUrl ?? ECB_DAILY_XML_URL
    this.cacheTtlMs = options.cacheTtlMs ?? 3_600_000
    this.alertThresholdPct = options.alertThresholdPct ?? 5
    this.onRateAlert = options.onRateAlert
    this.enableYahooFallback = options.enableYahooFallback ?? true
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * 현재 EUR 기준 환율 스냅샷을 가져옵니다.
   *
   * - 캐시 유효 시 캐시 반환 (source: 'cache')
   * - ECB XML 1순위 → Yahoo Finance fallback
   *
   * @param currencies 가져올 통화 코드 목록. 비어있으면 ECB 제공 전체
   */
  async getCurrentRates(currencies: CurrencyCode[] = []): Promise<ExchangeRateSnapshot> {
    // 캐시 체크
    if (this.isCacheValid()) {
      const snapshot = this.filterSnapshot(this.cache!, currencies)
      return { ...snapshot, source: 'cache' }
    }

    // ECB 1순위
    let snapshot = await this.fetchFromEcb()

    // Yahoo fallback
    if (!snapshot && this.enableYahooFallback && currencies.length > 0) {
      snapshot = await this.fetchFromYahoo(currencies)
    }

    if (!snapshot) {
      throw new Error('[cmh-exchange-rate] 환율 조회 실패: ECB 및 Yahoo 모두 불가')
    }

    // 순서 중요: prevSnapshot → cache 업데이트 → 급변 알림 체크
    // checkAlerts에서 this.prevSnapshot(이전 캐시)과 비교하므로
    // cache를 덮어쓰기 전에 prevSnapshot을 먼저 저장해야 함
    this.prevSnapshot = this.cache
    this.cache = snapshot

    // 급변 알림 체크
    this.checkAlerts(snapshot)

    return this.filterSnapshot(snapshot, currencies)
  }

  /**
   * 특정 통화 쌍의 환율을 단순 계산합니다.
   * ECB EUR 기준으로 크로스 환율 계산.
   *
   * @example
   * // USD → KRW 환율
   * const rate = await client.getCrossRate('USD', 'KRW')
   */
  async getCrossRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
    const snapshot = await this.getCurrentRates([from, to])

    if (from === 'EUR') return snapshot.rates[to] ?? 1
    if (to === 'EUR') return 1 / (snapshot.rates[from] ?? 1)

    const fromRate = snapshot.rates[from]
    const toRate = snapshot.rates[to]

    if (!fromRate || !toRate) {
      throw new Error(`[cmh-exchange-rate] ${from} 또는 ${to} 환율 데이터 없음`)
    }

    // from → EUR → to
    return toRate / fromRate
  }

  /**
   * ECB 히스토리 XML에서 날짜 범위 환율을 조회합니다.
   * (PHP의 getHistoricalRates에 대응)
   *
   * @param currencies 통화 코드 목록
   * @param from 시작 날짜 (YYYY-MM-DD)
   * @param to 종료 날짜 (YYYY-MM-DD)
   */
  async getHistoricalRates(
    currencies: CurrencyCode[],
    from: string,
    to: string,
  ): Promise<HistoricalRates> {
    const xml = await this.httpGet(ECB_HISTORY_XML_URL)
    return this.parseEcbHistoryXml(xml, currencies, from, to)
  }

  /** 인메모리 캐시를 강제로 초기화합니다. */
  clearCache(): void {
    this.cache = null
    this.prevSnapshot = null
  }

  // ── Private: ECB ────────────────────────────────────────────────────────

  private async fetchFromEcb(): Promise<ExchangeRateSnapshot | null> {
    try {
      const xml = await this.httpGet(this.ecbUrl)
      const rates = this.parseEcbDailyXml(xml)

      if (Object.keys(rates).length === 0) return null

      return {
        base: 'EUR',
        date: new Date().toISOString().slice(0, 10),
        rates,
        source: 'ecb',
        fetchedAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  /**
   * ECB daily XML 파싱.
   * `<Cube currency="USD" rate="1.0832"/>` 패턴 추출.
   */
  private parseEcbDailyXml(xml: string): Record<CurrencyCode, number> {
    const rates: Record<CurrencyCode, number> = {}
    // 날짜 추출: <Cube time="2026-01-15">
    const dateMatch = /time="(\d{4}-\d{2}-\d{2})"/.exec(xml)
    const regex = /currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']/g
    let match: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
    while ((match = regex.exec(xml)) !== null) {
      rates[match[1]] = parseFloat(match[2])
    }
    // date는 인스턴스 프로퍼티로 저장하지 않고 반환값에 포함시키기 위해
    // 아래 getCurrentRates에서 snapshot.date를 재지정할 수도 있으나
    // 여기서는 단순 반환
    void dateMatch
    return rates
  }

  /**
   * ECB history XML 파싱.
   * 날짜 범위 필터링 후 통화별 시계열 반환.
   */
  private parseEcbHistoryXml(
    xml: string,
    currencies: CurrencyCode[],
    from: string,
    to: string,
  ): HistoricalRates {
    const result: HistoricalRates = {}
    for (const c of currencies) result[c] = []

    // <Cube time="2026-01-15"> ... <Cube currency="USD" rate="1.08"/> ...
    const dayBlockRegex = /<Cube time=["'](\d{4}-\d{2}-\d{2})["']>([\s\S]*?)<\/Cube>/g
    const rateRegex = /currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']/g

    let dayBlock: RegExpExecArray | null
    // biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
    while ((dayBlock = dayBlockRegex.exec(xml)) !== null) {
      const date = dayBlock[1]
      if (date < from || date > to) continue

      const block = dayBlock[2]
      rateRegex.lastIndex = 0

      let rateMatch: RegExpExecArray | null
      // biome-ignore lint/suspicious/noAssignInExpressions: intentional regex loop
      while ((rateMatch = rateRegex.exec(block)) !== null) {
        const currency = rateMatch[1]
        if (currencies.includes(currency)) {
          result[currency].push({ date, rate: parseFloat(rateMatch[2]) })
        }
      }
    }

    // 날짜 오름차순 정렬
    for (const c of currencies) {
      result[c].sort((a, b) => a.date.localeCompare(b.date))
    }

    return result
  }

  // ── Private: Yahoo Finance ───────────────────────────────────────────────

  private async fetchFromYahoo(currencies: CurrencyCode[]): Promise<ExchangeRateSnapshot | null> {
    try {
      const rates: Record<CurrencyCode, number> = {}

      await Promise.all(
        currencies.map(async (currency) => {
          if (currency === 'EUR') return
          const symbol = `EUR${currency}=X`
          const url = `${YAHOO_QUOTE_URL}/${symbol}?interval=1d&range=1d`
          const res = await this.httpGet(url)
          const json = JSON.parse(res)
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice as number | undefined
          if (price) rates[currency] = price
        }),
      )

      if (Object.keys(rates).length === 0) return null

      return {
        base: 'EUR',
        date: new Date().toISOString().slice(0, 10),
        rates,
        source: 'yahoo',
        fetchedAt: new Date().toISOString(),
      }
    } catch {
      return null
    }
  }

  // ── Private: Helpers ────────────────────────────────────────────────────

  private isCacheValid(): boolean {
    if (!this.cache) return false
    const age = Date.now() - new Date(this.cache.fetchedAt).getTime()
    return age < this.cacheTtlMs
  }

  private filterSnapshot(
    snapshot: ExchangeRateSnapshot,
    currencies: CurrencyCode[],
  ): ExchangeRateSnapshot {
    if (currencies.length === 0) return snapshot
    const filtered: Record<CurrencyCode, number> = {}
    for (const c of currencies) {
      if (snapshot.rates[c] !== undefined) {
        filtered[c] = snapshot.rates[c]
      }
    }
    return { ...snapshot, rates: filtered }
  }

  private checkAlerts(newSnapshot: ExchangeRateSnapshot): void {
    if (!this.onRateAlert || !this.prevSnapshot) return

    for (const [currency, newRate] of Object.entries(newSnapshot.rates)) {
      const oldRate = this.prevSnapshot.rates[currency]
      if (!oldRate) continue

      const changePct = Math.abs((newRate - oldRate) / oldRate) * 100
      if (changePct >= this.alertThresholdPct) {
        this.onRateAlert(currency, oldRate, newRate, changePct)
      }
    }
  }

  private async httpGet(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'cmh-exchange-rate/1.0 (+https://github.com/KrommerGmbH)',
        Accept: 'application/xml, application/json, */*',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`)
    return res.text()
  }
}
