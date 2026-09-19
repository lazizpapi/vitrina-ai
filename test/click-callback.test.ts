import { beforeEach, describe, expect, it, vi } from "vitest";

const orders = new Map<string, any>();
const ledgerCalls: Array<{ tgId: number; delta: number; reason: string; refId: string }> = [];

vi.mock("../src/db/repo.js", () => ({
  getOrder: async (id: string) => orders.get(id) ?? null,
  markOrderPaid: async (id: string, transId: string) => {
    const order = orders.get(id);
    if (order) Object.assign(order, { status: "paid", provider_trans_id: transId });
  },
  applyLedger: async (tgId: number, delta: number, reason: string, refId: string) => {
    ledgerCalls.push({ tgId, delta, reason, refId });
    return 5;
  },
}));

import type { ClickRequest } from "../src/payments/click.js";

const { expectedSign, handleClickCallback, ClickError } = await import("../src/payments/click.js");

const SECRET = "top-secret";

function signed(overrides: Partial<ClickRequest> = {}): ClickRequest {
  const req: ClickRequest = {
    click_trans_id: "1111",
    service_id: "54321",
    merchant_trans_id: "order-1",
    amount: "25000.00",
    action: "0",
    sign_time: "2026-09-19 10:00:00",
    sign_string: "",
    ...overrides,
  };
  req.sign_string = expectedSign(req, SECRET);
  return req;
}

beforeEach(() => {
  orders.clear();
  ledgerCalls.length = 0;
  orders.set("order-1", {
    id: "order-1",
    tg_id: 42,
    pack: "p1",
    credits: 1,
    amount_uzs: 25_000,
    provider: "click",
    status: "pending",
  });
});

describe("handleClickCallback", () => {
  it("rejects a forged signature before touching the order", async () => {
    const res = await handleClickCallback({ ...signed(), sign_string: "deadbeef" });
    expect(res.error).toBe(ClickError.SignCheckFailed);
    expect(ledgerCalls).toHaveLength(0);
  });

  it("reports an unknown order", async () => {
    const res = await handleClickCallback(signed({ merchant_trans_id: "missing" }));
    expect(res.error).toBe(ClickError.UserNotFound);
  });

  it("rejects a sum that does not match the order", async () => {
    const res = await handleClickCallback(signed({ amount: "1000.00" }));
    expect(res.error).toBe(ClickError.IncorrectAmount);
    expect(ledgerCalls).toHaveLength(0);
  });

  it("accepts Prepare and returns a prepare id", async () => {
    const res = await handleClickCallback(signed());
    expect(res.error).toBe(ClickError.Ok);
    expect(res.merchant_prepare_id).toBe(1);
    expect(ledgerCalls).toHaveLength(0);
  });

  it("credits the wallet on Complete and notifies once", async () => {
    const paid = vi.fn(async () => {});
    const res = await handleClickCallback(
      signed({ action: "1", merchant_prepare_id: "1" }),
      paid,
    );

    expect(res.error).toBe(ClickError.Ok);
    expect(res.merchant_confirm_id).toBe(1);
    expect(ledgerCalls).toEqual([{ tgId: 42, delta: 1, reason: "order", refId: "order-1" }]);
    expect(paid).toHaveBeenCalledTimes(1);
    expect(orders.get("order-1").status).toBe("paid");
  });

  it("does not notify twice when Click repeats Complete", async () => {
    const paid = vi.fn(async () => {});
    const req = signed({ action: "1", merchant_prepare_id: "1" });
    await handleClickCallback(req, paid);
    const second = await handleClickCallback(req, paid);

    expect(second.error).toBe(ClickError.Ok);
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it("refuses Prepare for an order that is already paid", async () => {
    orders.get("order-1").status = "paid";
    const res = await handleClickCallback(signed());
    expect(res.error).toBe(ClickError.AlreadyPaid);
  });

  it("treats an unknown action as unsupported", async () => {
    const res = await handleClickCallback(signed({ action: "7" }));
    expect(res.error).toBe(ClickError.ActionNotFound);
  });

  it("passes a cancellation from Click straight through", async () => {
    const res = await handleClickCallback(signed({ action: "1", merchant_prepare_id: "1", error: "-5017" }));
    expect(res.error).toBe(ClickError.TransactionCanceled);
    expect(ledgerCalls).toHaveLength(0);
  });
});
