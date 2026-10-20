import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  clearLocalInboxForTests,
  getLocalInboxMessages,
} from "@/lib/email";
import {
  clearLocalSmsOutboxForTests,
  getLocalSmsOutbox,
} from "@/lib/sms";
import {
  clearRecordedRefundsForTests,
  getRecordedRefundsForTests,
  signRazorpayWebhookPayload,
} from "@/lib/payments/provider";
import {
  addItemToCustomerCart,
  getCustomerCart,
  resetInMemoryCartsForTests,
  setCustomerCartPinCode,
} from "@/lib/cart/service";
import {
  listAdminProducts,
  resetInMemoryCatalogueForTests,
  updateAdminProduct,
} from "@/lib/catalogue/service";
import {
  createOrderInTransaction,
  evaluateCodEligibility,
  getOrderDetailForCustomer,
  ORDER_ID_REGEX,
  processRazorpayWebhook,
  releaseExpiredStockReservations,
  resendCodOrderOtp,
  resetOrdersAndReservationsForTests,
  verifyCodOrderOtp,
} from "@/lib/orders/service";

const TEST_USER_ID = "user-customer-1";
const TEST_USER_EMAIL = "customer@kalaandkiln.in";

const BENGALURU_ADDRESS = {
  recipientName: "Aarav Sharma",
  phone: "9845012345",
  addressLine1: "42, 100 Feet Road, Indiranagar",
  addressLine2: "Near Halasuru Metro",
  pinCode: "560001",
  city: "Bengaluru",
  state: "Karnataka",
};

describe("Phase 5 Real PostgreSQL Integration: Checkout, Concurrency, Stock Reservations, Razorpay Webhooks & COD OTP", () => {
  beforeEach(async () => {
    clearLocalInboxForTests();
    clearLocalSmsOutboxForTests();
    clearRecordedRefundsForTests();
    await resetOrdersAndReservationsForTests();
    await resetInMemoryCartsForTests();
    await resetInMemoryCatalogueForTests();
  });

  afterAll(async () => {
    await resetOrdersAndReservationsForTests();
    await resetInMemoryCartsForTests();
    await resetInMemoryCatalogueForTests();
  });

  it("1. 20 parallel checkouts for the last unit in stock: exactly 1 succeeds, 19 fail with OUT_OF_STOCK, and reserved + remaining stock stay exact", async () => {
    // Configure prod-seed-01 so supplierStock = 4, reservedStock = 0, stockBuffer = 3 -> displayedStock = 1 (last unit!)
    await prisma.product.update({
      where: { id: "prod-seed-01" },
      data: {
        supplierStock: 4,
        reservedStock: 0,
        stockBuffer: 3,
      },
    });

    const prod = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-01" },
    });
    // prod-seed-01 price is Rs 1,450 (145000 paise) >= Rs 999 free shipping threshold -> grandTotalPaise = 145000
    const expectedTotalPaise = prod.pricePaise;

    // Launch 20 parallel checkout transactions for that last unit
    const parallelAttempts = await Promise.all(
      Array.from({ length: 20 }, (_, idx) =>
        createOrderInTransaction({
          userId: TEST_USER_ID,
          userEmail: TEST_USER_EMAIL,
          idempotencyKey: `parallel-last-unit-${idx}`,
          address: BENGALURU_ADDRESS,
          paymentMethod: "RAZORPAY",
          expectedTotalPaise,
          termsAccepted: true,
          explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
        })
      )
    );

    const successes = parallelAttempts.filter((r) => r.ok);
    const failures = parallelAttempts.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(19);
    for (const fail of failures) {
      if (!fail.ok) {
        expect(fail.code).toBe("OUT_OF_STOCK");
      }
    }

    // Verify PostgreSQL product stock and reservation rows stay exact
    const updatedProd = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-01" },
    });
    expect(updatedProd.supplierStock).toBe(4);
    expect(updatedProd.reservedStock).toBe(1);
    expect(updatedProd.stockBuffer).toBe(3);
    const remainingPurchasable =
      updatedProd.supplierStock -
      updatedProd.reservedStock -
      updatedProd.stockBuffer;
    expect(remainingPurchasable).toBe(0);

    const activeReservations = await prisma.stockReservation.findMany({
      where: { productId: "prod-seed-01", released: false },
    });
    expect(activeReservations).toHaveLength(1);
    expect(activeReservations[0]?.quantity).toBe(1);
  });

  it("2. Idempotency-Key double submit creates only one order and reserves stock once", async () => {
    const beforeProd = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-01" },
    });

    const first = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "double-submit-key-001",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: beforeProd.pricePaise * 2,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 2 }],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.idempotentReplay).toBe(false);

    // Second submit with the exact same Idempotency-Key
    const second = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "double-submit-key-001",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: beforeProd.pricePaise * 2,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 2 }],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.idempotentReplay).toBe(true);
    expect(second.order.orderId).toBe(first.order.orderId);

    const afterProd = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-01" },
    });
    expect(afterProd.reservedStock).toBe(beforeProd.reservedStock + 2);
  });

  it("3. Rejects manipulated or stale expectedTotalPaise with PRICE_OR_TOTAL_CHANGED and keeps OrderItem snapshots immutable after later product edits", async () => {
    await addItemToCustomerCart({
      userId: TEST_USER_ID,
      productId: "prod-seed-01", // 145000 paise
      quantityToAdd: 1,
    });
    await setCustomerCartPinCode({
      userId: TEST_USER_ID,
      pinCode: "560001",
    });
    const cart = await getCustomerCart(TEST_USER_ID);
    expect(cart.totals.grandTotalPaise).toBe(145000);

    // 1. Tampered / stale expectedTotalPaise (e.g., customer or attacker sends 100000 paise instead of 145000)
    const tampered = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "mismatch-key-001",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: 100000,
      termsAccepted: true,
    });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) {
      expect(tampered.code).toBe("PRICE_OR_TOTAL_CHANGED");
      expect(tampered.currentTotalPaise).toBe(145000);
    }

    // 2. Confirm with authoritative server total (145000 paise)
    const created = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "valid-key-002",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: 145000,
      termsAccepted: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Verify Order ID format ORD-YYYYMMDD-XXXXX
    expect(created.order.orderId).toMatch(ORDER_ID_REGEX);
    expect(created.order.items[0]?.unitPricePaise).toBe(145000);
    expect(created.order.items[0]?.hsnCode).toBe("69120010");

    // 3. Admin changes product price to Rs 2,200 (220000 paise) and name in catalogue
    const adminList = await listAdminProducts({ status: "all" });
    const orig = adminList.find((p) => p.id === "prod-seed-01")!;
    await updateAdminProduct(
      "prod-seed-01",
      {
        name: "Renamed Stoneware Plate V2",
        shortDescription: orig.shortDescription,
        description: orig.description,
        category: orig.category,
        tags: orig.tags,
        material: orig.material,
        dimensions: orig.dimensions,
        careInstructions: orig.careInstructions ?? undefined,
        pricePaise: 220000,
        compareAtPaise: orig.compareAtPaise,
        taxSlab: orig.taxSlab,
        hsnCode: "69120020",
        supplierId: orig.supplierId,
        supplierSku: orig.supplierSku,
        supplierProductUrl: orig.supplierProductUrl ?? undefined,
        supplierStock: orig.supplierStock,
        bufferStock: orig.bufferStock,
        dispatchTimeDays: orig.dispatchTimeDays,
        images: orig.images.map((img) => ({
          url: img.url,
          altText: img.altText,
          aspectRatio: img.aspectRatio,
          sortOrder: img.sortOrder,
        })),
      },
      "admin-1",
      "127.0.0.1"
    );

    // Fetch historical order -> snapshot must remain completely unchanged
    const snapshot = await getOrderDetailForCustomer({
      orderId: created.order.orderId,
      userId: TEST_USER_ID,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.grandTotalPaise).toBe(145000);
    expect(snapshot?.items[0]?.productName).toBe(
      "Ash-Glaze Stoneware Dinner Plate (27 cm)"
    );
    expect(snapshot?.items[0]?.unitPricePaise).toBe(145000);
    expect(snapshot?.items[0]?.hsnCode).toBe("69120010");
  });

  it("4. Razorpay Webhook: rejects invalid signatures and amount mismatches, deduplicates replayed events, and ignores out-of-order payment.failed after payment.captured", async () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    const created = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "webhook-order-001",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: 145000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
      nowDate: now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const orderId = created.order.orderId;
    const rzpOrderId = created.order.razorpayOrderId!;

    const buildWebhookBody = (
      event: "payment.captured" | "payment.failed",
      amount: number,
      currency: string = "INR"
    ) =>
      JSON.stringify({
        event,
        payload: {
          payment: {
            entity: {
              id: "pay_test_101",
              order_id: rzpOrderId,
              amount,
              currency,
              notes: { orderId },
            },
          },
        },
      });

    // 1. Invalid HMAC signature -> 400 INVALID_SIGNATURE
    const validBody = buildWebhookBody("payment.captured", 145000);
    const badSigRes = await processRazorpayWebhook({
      rawBody: validBody,
      signatureHeader:
        "0000000000000000000000000000000000000000000000000000000000000000",
      eventIdHeader: "evt_bad_sig",
      nowDate: now,
    });
    expect(badSigRes.httpStatus).toBe(400);
    expect(badSigRes.code).toBe("INVALID_SIGNATURE");

    // 2. Amount mismatch -> 400 AMOUNT_OR_CURRENCY_MISMATCH
    const wrongAmountBody = buildWebhookBody("payment.captured", 144900);
    const mismatchRes = await processRazorpayWebhook({
      rawBody: wrongAmountBody,
      signatureHeader: signRazorpayWebhookPayload(wrongAmountBody),
      eventIdHeader: "evt_wrong_amount",
      nowDate: now,
    });
    expect(mismatchRes.httpStatus).toBe(400);
    expect(mismatchRes.code).toBe("AMOUNT_OR_CURRENCY_MISMATCH");

    // 3. Valid payment.captured -> 200 PAYMENT_CONFIRMED, order becomes PAID + CONFIRMED, receipt email sent
    const capturedRes = await processRazorpayWebhook({
      rawBody: validBody,
      signatureHeader: signRazorpayWebhookPayload(validBody),
      eventIdHeader: "evt_captured_001",
      nowDate: now,
    });
    expect(capturedRes.httpStatus).toBe(200);
    expect(capturedRes.code).toBe("PAYMENT_CONFIRMED");

    const confirmedOrder = await getOrderDetailForCustomer({
      orderId,
      userId: TEST_USER_ID,
      nowDate: now,
    });
    expect(confirmedOrder?.paymentStatus).toBe("PAID");
    expect(confirmedOrder?.status).toBe("CONFIRMED");

    const emails = getLocalInboxMessages(TEST_USER_EMAIL);
    expect(
      emails.some((m) => m.subject.includes(`Order receipt ${orderId}`))
    ).toBe(true);

    // 4. Duplicate webhook replay with same eventId -> 200 DUPLICATE_EVENT
    const duplicateRes = await processRazorpayWebhook({
      rawBody: validBody,
      signatureHeader: signRazorpayWebhookPayload(validBody),
      eventIdHeader: "evt_captured_001",
      nowDate: now,
    });
    expect(duplicateRes.httpStatus).toBe(200);
    expect(duplicateRes.code).toBe("DUPLICATE_EVENT");

    // 5. Out-of-order payment.failed arriving AFTER payment.captured -> 200 IGNORED_OUT_OF_ORDER_FAILURE, never downgrades order!
    const failedBody = buildWebhookBody("payment.failed", 145000);
    const outOfOrderFail = await processRazorpayWebhook({
      rawBody: failedBody,
      signatureHeader: signRazorpayWebhookPayload(failedBody),
      eventIdHeader: "evt_late_fail_002",
      nowDate: now,
    });
    expect(outOfOrderFail.httpStatus).toBe(200);
    expect(outOfOrderFail.code).toBe("IGNORED_OUT_OF_ORDER_FAILURE");

    const stillPaidOrder = await getOrderDetailForCustomer({
      orderId,
      userId: TEST_USER_ID,
      nowDate: now,
    });
    expect(stillPaidOrder?.paymentStatus).toBe("PAID");
    expect(stillPaidOrder?.status).toBe("CONFIRMED");
  });

  it("5. Late Razorpay Webhook after 15-minute reservation expiry: re-reserves if stock is available, or auto-cancels and triggers refund if stock sold out", async () => {
    const startNow = new Date("2026-10-12T10:00:00.000Z");

    // Set prod-seed-02 (Tenmoku Iron-Glaze Katori Bowl Set, 220000 paise) to 1 purchasable unit (supplier=4, reserved=0, buffer=3)
    await prisma.product.update({
      where: { id: "prod-seed-02" },
      data: {
        supplierStock: 4,
        reservedStock: 0,
        stockBuffer: 3,
      },
    });

    // Order A places an order for that 1 unit
    const orderACreated = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "late-webhook-order-a",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: 220000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-02", quantity: 1 }],
      nowDate: startNow,
    });
    expect(orderACreated.ok).toBe(true);
    if (!orderACreated.ok) return;

    // 16 minutes later, reservation expires and stock is released back to 0 reserved
    const afterExpiry = new Date(startNow.getTime() + 16 * 60 * 1000);
    const released = await releaseExpiredStockReservations(afterExpiry);
    expect(released.releasedReservationCount).toBe(1);

    const prodAfterRelease = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-02" },
    });
    expect(prodAfterRelease.reservedStock).toBe(0);

    // PATH A: Late webhook for Order A arrives while that 1 unit is still available -> re-reserves and confirms!
    const lateBodyA = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_late_a",
            order_id: orderACreated.order.razorpayOrderId,
            amount: 220000,
            currency: "INR",
            notes: { orderId: orderACreated.order.orderId },
          },
        },
      },
    });
    const lateResA = await processRazorpayWebhook({
      rawBody: lateBodyA,
      signatureHeader: signRazorpayWebhookPayload(lateBodyA),
      eventIdHeader: "evt_late_a",
      nowDate: afterExpiry,
    });
    expect(lateResA.httpStatus).toBe(200);
    expect(lateResA.code).toBe("LATE_PAYMENT_RERESERVED_CONFIRMED");

    const prodAfterRereserve = await prisma.product.findUniqueOrThrow({
      where: { id: "prod-seed-02" },
    });
    expect(prodAfterRereserve.reservedStock).toBe(1);

    // PATH B: Now test when stock is NO LONGER available when the late webhook arrives!
    // Reset prod-seed-02 to 1 purchasable unit (supplier=4, reserved=0, buffer=3)
    await prisma.product.update({
      where: { id: "prod-seed-02" },
      data: {
        supplierStock: 4,
        reservedStock: 0,
        stockBuffer: 3,
      },
    });

    const t2 = new Date("2026-10-12T11:00:00.000Z");
    const orderBCreated = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "late-webhook-order-b",
      address: BENGALURU_ADDRESS,
      paymentMethod: "RAZORPAY",
      expectedTotalPaise: 220000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-02", quantity: 1 }],
      nowDate: t2,
    });
    expect(orderBCreated.ok).toBe(true);
    if (!orderBCreated.ok) return;

    // 16 minutes after t2, Order B's reservation expires
    const t2Expired = new Date(t2.getTime() + 16 * 60 * 1000);
    await releaseExpiredStockReservations(t2Expired);

    // Another customer buys the last unit so supplierStock=4, reservedStock=1, buffer=3 (0 remaining)
    await prisma.product.update({
      where: { id: "prod-seed-02" },
      data: { reservedStock: 1 },
    });

    // Now Order B's late payment.captured webhook arrives -> must cancel Order B and trigger automatic refund!
    const lateBodyB = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_late_b",
            order_id: orderBCreated.order.razorpayOrderId,
            amount: 220000,
            currency: "INR",
            notes: { orderId: orderBCreated.order.orderId },
          },
        },
      },
    });
    const lateResB = await processRazorpayWebhook({
      rawBody: lateBodyB,
      signatureHeader: signRazorpayWebhookPayload(lateBodyB),
      eventIdHeader: "evt_late_b",
      nowDate: t2Expired,
    });
    expect(lateResB.httpStatus).toBe(200);
    expect(lateResB.code).toBe("LATE_PAYMENT_AUTO_REFUNDED");
    expect(lateResB.refundId).toMatch(/^rfnd_/);

    const refunds = getRecordedRefundsForTests();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.orderId).toBe(orderBCreated.order.orderId);
    expect(refunds[0]?.amountPaise).toBe(220000);

    const cancelledOrderB = await getOrderDetailForCustomer({
      orderId: orderBCreated.order.orderId,
      userId: TEST_USER_ID,
      nowDate: t2Expired,
    });
    expect(cancelledOrderB?.status).toBe("CANCELLED");
    expect(cancelledOrderB?.paymentStatus).toBe("REFUNDED");
  });

  it("6. COD Rules: enforces new-account Rs 5,000 cap vs returning Rs 15,000 cap, 1-unconfirmed-order limit, 60s resend cooldown, 5-attempt lockout, 10-min expiry auto-cancel, and OTP verification", async () => {
    const baseTime = new Date("2026-10-12T12:00:00.000Z");

    // 1. New account (0 DELIVERED orders) -> COD cap is Rs 5,000 (500,000 paise)
    const overNewAccountCap = await evaluateCodEligibility({
      userId: TEST_USER_ID,
      pinCode: "560001",
      grandTotalPaise: 580000, // Rs 5,800 > Rs 5,000
      nowDate: baseTime,
    });
    expect(overNewAccountCap.allowed).toBe(false);
    expect(overNewAccountCap.isNewAccountCap).toBe(true);
    expect(overNewAccountCap.maxCapPaise).toBe(500000);

    // 2. Place a valid COD order within the Rs 5,000 cap (prod-seed-01 = Rs 1,450 = 145000 paise)
    const codOrder1 = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "cod-order-001",
      address: BENGALURU_ADDRESS,
      paymentMethod: "COD",
      expectedTotalPaise: 145000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
      nowDate: baseTime,
    });
    expect(codOrder1.ok).toBe(true);
    if (!codOrder1.ok) return;
    expect(codOrder1.order.status).toBe("PENDING_CONFIRMATION");
    expect(codOrder1.codOtpForDev).toMatch(/^\d{6}$/);

    // Verify OTP was sent via both Email and SMS adapter
    expect(getLocalInboxMessages(TEST_USER_EMAIL).length).toBeGreaterThan(0);
    expect(getLocalSmsOutbox(BENGALURU_ADDRESS.phone).length).toBeGreaterThan(0);

    // 3. Attempting a 2nd COD order while the 1st is still PENDING_CONFIRMATION is rejected
    const secondCodBlocked = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "cod-order-002-blocked",
      address: BENGALURU_ADDRESS,
      paymentMethod: "COD",
      expectedTotalPaise: 145000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
      nowDate: baseTime,
    });
    expect(secondCodBlocked.ok).toBe(false);
    if (!secondCodBlocked.ok) {
      expect(secondCodBlocked.code).toBe("UNCONFIRMED_COD_ORDER_EXISTS");
    }

    // 4. Immediate resend within 60 seconds is blocked by cooldown
    const earlyResend = await resendCodOrderOtp({
      orderId: codOrder1.order.orderId,
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      nowDate: new Date(baseTime.getTime() + 20 * 1000),
    });
    expect(earlyResend.ok).toBe(false);
    if (!earlyResend.ok) {
      expect(earlyResend.code).toBe("COD_OTP_COOLDOWN");
      expect(earlyResend.retryAfterSeconds).toBe(40);
    }

    // 5. Resend after 61 seconds succeeds and issues a new 6-digit OTP
    const afterCooldown = new Date(baseTime.getTime() + 61 * 1000);
    const resent = await resendCodOrderOtp({
      orderId: codOrder1.order.orderId,
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      nowDate: afterCooldown,
    });
    expect(resent.ok).toBe(true);
    if (!resent.ok) return;
    const latestOtp = resent.codOtpForDev!;

    // 6. Verify with the valid OTP -> transitions to CONFIRMED and sends receipt email
    const verified = await verifyCodOrderOtp({
      orderId: codOrder1.order.orderId,
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      otpCode: latestOtp,
      nowDate: new Date(afterCooldown.getTime() + 5 * 1000),
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.order.status).toBe("CONFIRMED");
    }

    // 7. Test 5-attempt lockout on a new COD order
    const lockOrderTime = new Date(baseTime.getTime() + 120 * 1000);
    const codOrderLock = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "cod-order-lock-test",
      address: BENGALURU_ADDRESS,
      paymentMethod: "COD",
      expectedTotalPaise: 145000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
      nowDate: lockOrderTime,
    });
    expect(codOrderLock.ok).toBe(true);
    if (!codOrderLock.ok) return;

    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrong = await verifyCodOrderOtp({
        orderId: codOrderLock.order.orderId,
        userId: TEST_USER_ID,
        userEmail: TEST_USER_EMAIL,
        otpCode: "000000",
        nowDate: lockOrderTime,
      });
      expect(wrong.ok).toBe(false);
      if (!wrong.ok) {
        expect(wrong.code).toBe("COD_OTP_INVALID");
        expect(wrong.remainingAttempts).toBe(5 - attempt);
      }
    }

    // 5th wrong attempt locks & cancels the order and releases reserved stock
    const fifthWrong = await verifyCodOrderOtp({
      orderId: codOrderLock.order.orderId,
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      otpCode: "000000",
      nowDate: lockOrderTime,
    });
    expect(fifthWrong.ok).toBe(false);
    if (!fifthWrong.ok) {
      expect(fifthWrong.code).toBe("COD_OTP_LOCKED");
      expect(fifthWrong.remainingAttempts).toBe(0);
    }

    const cancelledByLockout = await getOrderDetailForCustomer({
      orderId: codOrderLock.order.orderId,
      userId: TEST_USER_ID,
      nowDate: lockOrderTime,
    });
    expect(cancelledByLockout?.status).toBe("CANCELLED");

    // 8. Test 10-minute COD OTP expiry and auto-cancellation
    const expOrderTime = new Date(baseTime.getTime() + 300 * 1000);
    const codOrderExp = await createOrderInTransaction({
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      idempotencyKey: "cod-order-expiry-test",
      address: BENGALURU_ADDRESS,
      paymentMethod: "COD",
      expectedTotalPaise: 145000,
      termsAccepted: true,
      explicitLines: [{ productId: "prod-seed-01", quantity: 1 }],
      nowDate: expOrderTime,
    });
    expect(codOrderExp.ok).toBe(true);
    if (!codOrderExp.ok) return;

    // 11 minutes later -> expired!
    const elevenMinutesLater = new Date(expOrderTime.getTime() + 11 * 60 * 1000);
    const expiredAttempt = await verifyCodOrderOtp({
      orderId: codOrderExp.order.orderId,
      userId: TEST_USER_ID,
      userEmail: TEST_USER_EMAIL,
      otpCode: codOrderExp.codOtpForDev!,
      nowDate: elevenMinutesLater,
    });
    expect(expiredAttempt.ok).toBe(false);
    if (!expiredAttempt.ok) {
      expect(expiredAttempt.code).toBe("COD_OTP_EXPIRED");
    }

    const autoCancelledOrder = await getOrderDetailForCustomer({
      orderId: codOrderExp.order.orderId,
      userId: TEST_USER_ID,
      nowDate: elevenMinutesLater,
    });
    expect(autoCancelledOrder?.status).toBe("CANCELLED");
  });
});
