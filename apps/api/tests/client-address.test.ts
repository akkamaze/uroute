import { expect, test } from "bun:test";

import { clientAddress, withClientAddress } from "../src/auth/client-address";

test("a direct client cannot spoof its rate-limit address", () => {
  const request = new Request("http://localhost/api/auth/get-session", {
    headers: { "x-real-ip": "198.51.100.10", "x-uroute-client-ip": "198.51.100.20" },
  });
  const address = clientAddress(request, "192.0.2.50", []);

  expect(address).toBe("192.0.2.50");
  expect(withClientAddress(request, address).headers.get("x-uroute-client-ip")).toBe("192.0.2.50");
  expect(withClientAddress(request, null).headers.has("x-uroute-client-ip")).toBe(false);
});

test("only configured proxy peers can supply one valid client address", () => {
  const valid = new Request("http://localhost", {
    headers: { "x-real-ip": "198.51.100.10" },
  });
  const invalid = new Request("http://localhost", {
    headers: { "x-real-ip": "198.51.100.10, 192.0.2.50" },
  });

  expect(clientAddress(valid, "127.0.0.1", ["127.0.0.1"])).toBe("198.51.100.10");
  expect(clientAddress(invalid, "127.0.0.1", ["127.0.0.1"])).toBe("127.0.0.1");
});
