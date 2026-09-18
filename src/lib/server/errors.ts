export class ProviderError extends Error {
  constructor(message: string, public status = 503, public code = 'PROVIDER_UNAVAILABLE') {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  const known = error instanceof ProviderError;
  if (!known) console.error('[lift]', error);
  // Surface real Error messages for operators/UI instead of a blank generic — still avoid leaking stacks.
  const fallback =
    error instanceof Error && error.message
      ? error.message.slice(0, 240)
      : 'The request could not be completed. Please try again.';
  return Response.json(
    {
      error: known ? error.message : fallback,
      code: known ? error.code : 'REQUEST_FAILED',
    },
    { status: known ? error.status : 500 },
  );
}
