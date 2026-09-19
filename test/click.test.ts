import { describe, expect, it } from "vitest";
import {
  amountsMatch,
  expectedSign,
  md5,
  paymentLink,
  verifySign,
  type ClickRequest,
} from "../src/payments/click.js";

const SECRET = "top-secret";

function prepareRequest(overrides: Partial<ClickRequest> = {}): ClickRequest {
  const base: ClickRequest = {
    click_trans_id: "1111",
    service_id: "54321",
    merchant_trans_id: "order-abc",
    amount: "25000.00",
    action: "0",
    sign_time: "2026-09-19 10:00:00",
    sign_string: "",
  };
  const req = { ...base, ...overrides };
  req.sign_string = expectedSign(req, SECRET);
  return req;
}

describe("Click signature", () => {
  it("signs Prepare without merchant_prepare_id", () => {
    const req = prepareRequest();
    const manual = md5(
      ["1111", "54321", SECRET, "order-abc", "25000.00", "0", "2026-09-19 10:00:00"].join(""),
    );
    expect(req.sign_string).toBe(manual);
    expect(verifySign(req, SECRET)).toBe(true);
  });

  it("signs Complete with merchant_prepare_id between trans id and amount", () => {
    const req = prepareRequest({ action: "1", merchant_prepare_id: "1" });
    const manual = md5(
      ["1111", "54321", SECRET, "order-abc", "1", "25000.00", "1", "2026-09-19 10:00:00"].join(""),
    );
    expect(req.sign_string).toBe(manual);
    expect(verifySign(req, SECRET)).toBe(true);
  });

  it("rejects a tampered amount", () => {
    const req = prepareRequest();
    expect(verifySign({ ...req, amount: "1000.00" }, SECRET)).toBe(false);
  });

  it("rejects a signature from a different secret", () => {
    const req = prepareRequest();
    expect(verifySign(req, "other-secret")).toBe(false);
  });

  it("rejects a truncated signature rather than matching a prefix", () => {
    const req = prepareRequest();
    expect(verifySign({ ...req, sign_string: req.sign_string.slice(0, 8) }, SECRET)).toBe(false);
  });

  it("accepts an uppercase signature", () => {
    const req = prepareRequest();
    expect(verifySign({ ...req, sign_string: req.sign_string.toUpperCase() }, SECRET)).toBe(true);
  });
});

describe("amountsMatch", () => {
  it("accepts the same sum written with decimals", () => {
    expect(amountsMatch("25000.00", 25_000)).toBe(true);
    expect(amountsMatch("25000", 25_000)).toBe(true);
  });

  it("rejects a different sum", () => {
    expect(amountsMatch("100.00", 25_000)).toBe(false);
  });

  it("rejects a value that is not a number", () => {
    expect(amountsMatch("free", 25_000)).toBe(false);
  });
});

describe("paymentLink", () => {
  it("carries the order id and sends the payer back to the bot", () => {
    const url = new URL(paymentLink("order-abc", 25_000, "vitrina_ai_bot"));
    expect(url.origin + url.pathname).toBe("https://my.click.uz/services/pay");
    expect(url.searchParams.get("transaction_param")).toBe("order-abc");
    expect(url.searchParams.get("amount")).toBe("25000");
    expect(url.searchParams.get("return_url")).toBe("https://t.me/vitrina_ai_bot?start=paid_order-abc");
  });
});
