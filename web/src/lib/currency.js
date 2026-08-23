// AI 가격 추천을 대체하는 결정론적(고정 환율) 원화 -> 현지통화 변환. 실시간 환율이 아니라
// 대략적인 참고용 값이므로, 실제 판매가는 최신 환율로 다시 확인해야 한다.
export const EXCHANGE_RATE_PER_KRW = {
  en: { currency: "USD", rate: 1 / 1350 },
  th: { currency: "THB", rate: 1 / 37 },
  vi: { currency: "VND", rate: 18.8 },
};

export function convertFromKrw(krwAmount, langCode) {
  const info = EXCHANGE_RATE_PER_KRW[langCode];
  if (!info || !Number.isFinite(krwAmount)) return null;
  const decimals = info.currency === "VND" ? 0 : 2;
  const value = krwAmount * info.rate;
  return {
    currency: info.currency,
    formatted: value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  };
}
