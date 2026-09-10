export class ProviderError extends Error {
  constructor(message:string, public status=503, public code='PROVIDER_UNAVAILABLE'){super(message);}
}
export function errorResponse(error:unknown) {
  const known=error instanceof ProviderError;
  return Response.json({error:known?error.message:'The request could not be completed. Please try again.',code:known?error.code:'REQUEST_FAILED'}, {status:known?error.status:500});
}
