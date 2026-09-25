import { isIP } from "node:net";

export function clientAddress(
  request: Request,
  peerAddress: string | null,
  trustedProxies: string[],
): string | null {
  if (peerAddress === null) {
    return null;
  }

  if (trustedProxies.includes(peerAddress)) {
    const forwarded = request.headers.get("x-real-ip")?.trim();

    if (forwarded && isIP(forwarded) !== 0) {
      return forwarded;
    }
  }

  return isIP(peerAddress) !== 0 ? peerAddress : null;
}

export function withClientAddress(request: Request, address: string | null): Request {
  const headers = new Headers(request.headers);

  headers.delete("x-uroute-client-ip");

  if (address !== null) {
    headers.set("x-uroute-client-ip", address);
  }

  return new Request(request, { headers });
}
