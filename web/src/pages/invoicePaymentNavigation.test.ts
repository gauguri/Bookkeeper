import { describe, expect, it } from "vitest";
import {
  buildInvoiceRecordPaymentPath,
  canRecordPayment,
  shouldAutoOpenRecordPayment
} from "./invoicePaymentNavigation";

describe("buildInvoiceRecordPaymentPath", () => {
  it("uses invoice id for navigation target", () => {
    expect(buildInvoiceRecordPaymentPath({ id: 42, invoice_number: "INV-000042" })).toBe(
      "/invoices/42?action=record-payment"
    );
  });
});

describe("shouldAutoOpenRecordPayment", () => {
  it("opens from query action", () => {
    expect(shouldAutoOpenRecordPayment("record-payment", null)).toBe(true);
  });

  it("opens from route state", () => {
    expect(shouldAutoOpenRecordPayment(null, { openRecordPayment: true })).toBe(true);
  });
});

describe("canRecordPayment", () => {
  it("disables paid and zero-balance invoices", () => {
    expect(canRecordPayment({ status: "PAID", amount_due: 10 })).toBe(false);
    expect(canRecordPayment({ status: "SENT", amount_due: 0 })).toBe(false);
    expect(canRecordPayment({ status: "SENT", amount_due: 12.5 })).toBe(true);
  });
});
