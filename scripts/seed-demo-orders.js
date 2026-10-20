const { PrismaClient, OrderStatus, PaymentMethod, PaymentStatus } = require("@prisma/client");
const crypto = require("node:crypto");

const prisma = new PrismaClient();

async function main() {
  console.log("Checking customer user...");
  const customer = await prisma.user.findFirst({
    where: { email: "customer@kalaandkiln.in" },
  });

  if (!customer) {
    console.log("Customer customer@kalaandkiln.in not found. Skipping demo orders.");
    return;
  }

  const products = await prisma.product.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    include: {
      images: { take: 1, orderBy: { position: "asc" } },
    },
  });

  if (products.length < 2) {
    console.log("Not enough products found to seed demo orders.");
    return;
  }

  const p1 = products[0];
  const p2 = products[1];

  const address = {
    recipientName: customer.fullName,
    phone: customer.phone,
    addressLine1: customer.addressLine,
    addressLine2: null,
    city: customer.city,
    state: customer.state,
    pinCode: customer.pinCode,
    latitude: customer.latitude ? Number(customer.latitude) : null,
    longitude: customer.longitude ? Number(customer.longitude) : null,
  };

  const demoOrder1Id = "ord_demo_shipped_2026";
  const existing1 = await prisma.order.findUnique({ where: { orderId: demoOrder1Id } });
  if (!existing1) {
    console.log("Seeding demo order 1 (SHIPPED)...");
    const subtotal = p1.pricePaise;
    const tax = Math.round(subtotal * 0.12);
    const total = subtotal + tax;

    await prisma.order.create({
      data: {
        orderId: demoOrder1Id,
        userId: customer.id,
        taxableSubtotalPaise: subtotal,
        subtotalPaise: subtotal,
        cgstPaise: Math.round(tax / 2),
        sgstPaise: Math.round(tax / 2),
        igstPaise: 0,
        taxPaise: tax,
        shippingPaise: 0,
        totalPaise: total,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING_PAYMENT,
        status: OrderStatus.SHIPPED,
        addressSnapshot: address,
        estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        deliveryOtpHash: crypto.createHash("sha256").update("123456").digest("hex"),
        trackingTokenHash: crypto.createHash("sha256").update(demoOrder1Id).digest("hex"),
        items: {
          create: [
            {
              productId: p1.id,
              nameAtPurchase: p1.name,
              skuAtPurchase: "DEMO-SKU-01",
              hsnCodeAtPurchase: p1.hsnCode,
              imageUrlAtPurchase: p1.images[0]?.url ?? null,
              priceAtPurchasePaise: p1.pricePaise,
              taxableAmountPaise: subtotal,
              taxSlabPercent: 12,
              cgstPaise: Math.round(tax / 2),
              sgstPaise: Math.round(tax / 2),
              igstPaise: 0,
              taxPaise: tax,
              lineTotalPaise: total,
              quantity: 1,
            },
          ],
        },
        events: {
          create: [
            {
              status: OrderStatus.PLACED,
              note: "Order placed via website checkout (Cash on Delivery).",
              changedBy: customer.email,
              actorRole: "CUSTOMER",
            },
            {
              status: OrderStatus.CONFIRMED,
              note: "COD verified with OTP.",
              changedBy: "system@kalaandkiln.in",
              actorRole: "SYSTEM",
            },
            {
              status: OrderStatus.SHIPPED,
              note: "Handed over to regional craft logistics hub in Shivamogga.",
              changedBy: "dispatch@kalaandkiln.in",
              actorRole: "ADMIN",
            },
          ],
        },
      },
    });
  }

  const demoOrder2Id = "ord_demo_delivered_2026";
  const existing2 = await prisma.order.findUnique({ where: { orderId: demoOrder2Id } });
  if (!existing2) {
    console.log("Seeding demo order 2 (DELIVERED)...");
    const subtotal = p2.pricePaise;
    const tax = Math.round(subtotal * 0.12);
    const total = subtotal + tax;

    await prisma.order.create({
      data: {
        orderId: demoOrder2Id,
        userId: customer.id,
        taxableSubtotalPaise: subtotal,
        subtotalPaise: subtotal,
        cgstPaise: Math.round(tax / 2),
        sgstPaise: Math.round(tax / 2),
        igstPaise: 0,
        taxPaise: tax,
        shippingPaise: 0,
        totalPaise: total,
        paymentMethod: PaymentMethod.RAZORPAY,
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.DELIVERED,
        addressSnapshot: address,
        estimatedDelivery: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        deliveryOtpHash: crypto.createHash("sha256").update("654321").digest("hex"),
        trackingTokenHash: crypto.createHash("sha256").update(demoOrder2Id).digest("hex"),
        items: {
          create: [
            {
              productId: p2.id,
              nameAtPurchase: p2.name,
              skuAtPurchase: "DEMO-SKU-02",
              hsnCodeAtPurchase: p2.hsnCode,
              imageUrlAtPurchase: p2.images[0]?.url ?? null,
              priceAtPurchasePaise: p2.pricePaise,
              taxableAmountPaise: subtotal,
              taxSlabPercent: 12,
              cgstPaise: Math.round(tax / 2),
              sgstPaise: Math.round(tax / 2),
              igstPaise: 0,
              taxPaise: tax,
              lineTotalPaise: total,
              quantity: 1,
            },
          ],
        },
        events: {
          create: [
            {
              status: OrderStatus.PLACED,
              note: "Order placed via website checkout (Razorpay UPI).",
              changedBy: customer.email,
              actorRole: "CUSTOMER",
            },
            {
              status: OrderStatus.CONFIRMED,
              note: "Payment captured successfully via Razorpay.",
              changedBy: "system@kalaandkiln.in",
              actorRole: "SYSTEM",
            },
            {
              status: OrderStatus.SHIPPED,
              note: "Dispatched from workshop.",
              changedBy: "dispatch@kalaandkiln.in",
              actorRole: "ADMIN",
            },
            {
              status: OrderStatus.DELIVERED,
              note: "Delivered safely to recipient.",
              changedBy: "courier@kalaandkiln.in",
              actorRole: "DEALER",
            },
          ],
        },
      },
    });
  }

  console.log("Demo orders verified.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
