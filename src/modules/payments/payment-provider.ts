import type { Prisma } from "@prisma/client";

export type PaymentSubject = "purchase" | "booking";

export type ProviderIntent = {
  provider: string;
  currency: "UZS";
  providerTransactionId: string | null;
};

export type ProviderCapture = {
  provider: string;
  providerTransactionId: string;
};

export type ProviderRefund = {
  provider: string;
};

/**
 * A payment provider moves money. It must not receive or store card numbers,
 * CVV codes, or provider secrets. Purchase and booking code depends on this
 * interface, not on a concrete provider.
 *
 * The manual provider records the outcome only. A real provider can replace it
 * later.
 */
export interface PaymentProvider {
  readonly name: string;
  createIntent(input: { amount: Prisma.Decimal; subject: PaymentSubject; subjectId: string }): Promise<ProviderIntent>;
  capture(input: { amount: Prisma.Decimal; subject: PaymentSubject; subjectId: string }): Promise<ProviderCapture>;
  refund(input: { amount: Prisma.Decimal; providerTransactionId: string | null }): Promise<ProviderRefund>;
  cancel(input: { subject: PaymentSubject; subjectId: string }): Promise<void>;
}

export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";

  async createIntent(): Promise<ProviderIntent> {
    return {
      provider: this.name,
      currency: "UZS",
      providerTransactionId: null,
    };
  }

  async capture(input: { subjectId: string }): Promise<ProviderCapture> {
    return {
      provider: this.name,
      providerTransactionId: `manual_${input.subjectId}`,
    };
  }

  async refund(): Promise<ProviderRefund> {
    return { provider: this.name };
  }

  async cancel(): Promise<void> {
    return undefined;
  }
}

export const paymentProvider: PaymentProvider = new ManualPaymentProvider();
