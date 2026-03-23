import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExchangeRateClient } from './index'

// ── fetch 모킹 ────────────────────────────────────────────────────────────
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

const MOCK_ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-01-15">
      <Cube currency="USD" rate="1.0832"/>
      <Cube currency="KRW" rate="1534.20"/>
      <Cube currency="GBP" rate="0.8512"/>
      <Cube currency="JPY" rate="163.40"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

function mockEcbResponse(xml = MOCK_ECB_XML) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: () => Promise.resolve(xml),
  })
}

describe('ExchangeRateClient', () => {
  let client: ExchangeRateClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ExchangeRateClient({ cacheTtlMs: 0 }) // 캐시 비활성화
  })

  it('ECB XML에서 환율을 파싱한다', async () => {
    mockEcbResponse()
    const snapshot = await client.getCurrentRates(['USD', 'KRW'])

    expect(snapshot.base).toBe('EUR')
    expect(snapshot.source).toBe('ecb')
    expect(snapshot.rates.USD).toBeCloseTo(1.0832)
    expect(snapshot.rates.KRW).toBeCloseTo(1534.2)
  })

  it('빈 currencies 목록이면 전체 환율을 반환한다', async () => {
    mockEcbResponse()
    const snapshot = await client.getCurrentRates()

    expect(Object.keys(snapshot.rates).length).toBeGreaterThan(0)
    expect(snapshot.rates.USD).toBeDefined()
    expect(snapshot.rates.KRW).toBeDefined()
  })

  it('getCrossRate — USD → KRW 크로스 환율을 계산한다', async () => {
    mockEcbResponse()
    const rate = await client.getCrossRate('USD', 'KRW')

    // KRW/EUR ÷ USD/EUR = 1534.2 / 1.0832 ≈ 1416.6
    expect(rate).toBeCloseTo(1534.2 / 1.0832, 0)
  })

  it('getCrossRate — EUR → KRW는 직접 rates.KRW 반환', async () => {
    mockEcbResponse()
    const rate = await client.getCrossRate('EUR', 'KRW')
    expect(rate).toBeCloseTo(1534.2)
  })

  it('cacheTtlMs 이내 재호출 시 캐시를 반환한다', async () => {
    client = new ExchangeRateClient({ cacheTtlMs: 60_000 })
    mockEcbResponse()

    await client.getCurrentRates(['USD'])
    const cached = await client.getCurrentRates(['USD'])

    expect(cached.source).toBe('cache')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('clearCache 후 재조회 시 네트워크 호출이 발생한다', async () => {
    client = new ExchangeRateClient({ cacheTtlMs: 60_000 })
    mockEcbResponse()
    mockEcbResponse()

    await client.getCurrentRates(['USD'])
    client.clearCache()
    await client.getCurrentRates(['USD'])

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('ECB 실패 시 Yahoo fallback을 호출한다', async () => {
    // ECB 실패
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('') })
    // Yahoo 성공
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            chart: { result: [{ meta: { regularMarketPrice: 1540.5 } }] },
          }),
        ),
    })

    const snapshot = await client.getCurrentRates(['KRW'])
    expect(snapshot.source).toBe('yahoo')
    expect(snapshot.rates.KRW).toBeCloseTo(1540.5)
  })

  it('환율 급변 시 onRateAlert 콜백을 호출한다', async () => {
    const alertSpy = vi.fn()
    client = new ExchangeRateClient({
      cacheTtlMs: 0,
      alertThresholdPct: 1,
      onRateAlert: alertSpy,
    })

    // 1회차 조회
    mockEcbResponse()
    await client.getCurrentRates(['USD'])

    // 2회차 — USD 10% 급변
    const changedXml = MOCK_ECB_XML.replace('rate="1.0832"', 'rate="1.1915"')
    mockEcbResponse(changedXml)
    await client.getCurrentRates(['USD'])

    expect(alertSpy).toHaveBeenCalledWith('USD', 1.0832, 1.1915, expect.any(Number))
  })

  it('ECB + Yahoo 모두 실패 시 에러를 throw한다', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    await expect(client.getCurrentRates(['USD'])).rejects.toThrow('환율 조회 실패')
  })
})
