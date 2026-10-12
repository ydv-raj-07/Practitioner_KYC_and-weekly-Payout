
const PLATFORM_PERCENT = 30n;
const TDS_PERCENT = 1n; 
const INT_MAX = 2_147_483_647;

const pct = (amount: bigint, p: bigint) => (amount * p + 50n) / 100n;

export function calculatePayout(grossPaise: number) {
  if (!Number.isSafeInteger(grossPaise) || grossPaise < 0 || grossPaise > INT_MAX) {
    throw new RangeError('gross out of range');
  }
  const gross = BigInt(grossPaise);
  const platform = pct(gross, PLATFORM_PERCENT);
  const tds = pct(gross, TDS_PERCENT);
  return {
    grossPaise,
    platformSharePaise: Number(platform),
    tdsPaise: Number(tds),
    netPaise: Number(gross - platform - tds), 
  };
}