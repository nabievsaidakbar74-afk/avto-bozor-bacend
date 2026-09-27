import { PaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/common/errors/app-error.js";
import { assertPaymentTransition, canTransitionPayment } from "../../src/modules/payments/payment-status.js";

describe("payment status transitions", () => {
  it("follows the provider lifecycle", () => {
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.PROCESSING)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.CANCELLED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.FAILED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PROCESSING, PaymentStatus.PAID)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PROCESSING, PaymentStatus.FAILED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PAID, PaymentStatus.REFUNDED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.PAID)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.PAID, PaymentStatus.CANCELLED)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.REFUNDED, PaymentStatus.PAID)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.FAILED, PaymentStatus.PENDING)).toBe(false);
    expect(canTransitionPayment(PaymentStatus.CANCELLED, PaymentStatus.PENDING)).toBe(false);
  });

  it("rejects an illegal change", () => {
    expect(() => assertPaymentTransition(PaymentStatus.PAID, PaymentStatus.PENDING)).toThrow(AppError);
    try {
      assertPaymentTransition(PaymentStatus.REFUNDED, PaymentStatus.CANCELLED);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_STATUS_TRANSITION");
      expect((error as AppError).statusCode).toBe(409);
    }
  });
});
