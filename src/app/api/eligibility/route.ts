import { NextRequest } from 'next/server';

/**
 * Placeholder eligibility check until a jurisdiction verifier is wired.
 * Does NOT replace legal geo-blocking — UI must still show Stock Token / xStock disclaimers.
 */
export async function GET(_request: NextRequest) {
  return Response.json({
    eligible: true,
    source: 'liftpad-placeholder',
    warning: 'Issuer and regional restrictions still apply. Stock Tokens and xStocks are unavailable in restricted jurisdictions (including the US for many products).',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  return GET(request as NextRequest);
}
