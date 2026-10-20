import { prisma } from "../src/lib/db";
import { SEED_SERVICEABLE_PIN_CODES } from "../src/lib/data/seed-data";
import { SEED_PRODUCTS, SEED_SUPPLIERS } from "../src/lib/data/seed-products";
import { SEED_INDIAN_HOLIDAYS_2026_2027 } from "../src/lib/orders/estimate-delivery";
import { hashPassword } from "../src/lib/auth/password";
import { taxSlabToPercent } from "../src/lib/validation/product";
import { brandConfig } from "../src/config/brand";

/**
 * Ensures the seed script refuses to execute in production environments
 * and requires an explicit INITIAL_ADMIN_PASSWORD from the environment.
 */
export function assertSeedEnvironmentAndGetAdminPassword(
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: prisma/seed.ts refuses to run when NODE_ENV is 'production'. Seed data is only permitted in development or test environments."
    );
  }

  const adminPassword = env.INITIAL_ADMIN_PASSWORD?.trim();
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error(
      "FATAL: INITIAL_ADMIN_PASSWORD environment variable must be set (minimum 10 characters) before running prisma/seed.ts."
    );
  }

  return adminPassword;
}

export function resolveSeedCustomerCredentials(
  env: NodeJS.ProcessEnv = process.env
): { email: string; password: string; pinCode: string } {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: prisma/seed.ts refuses to run when NODE_ENV is 'production'. Seed data is only permitted in development or test environments."
    );
  }

  const email = (
    env.SEED_CUSTOMER_EMAIL ?? "customer@kalaandkiln.in"
  )
    .trim()
    .toLowerCase();
  const password = (
    env.SEED_CUSTOMER_PASSWORD ?? "Customer#Kiln2026!"
  ).trim();

  if (password.length < 10) {
    throw new Error(
      "FATAL: SEED_CUSTOMER_PASSWORD must be at least 10 characters long."
    );
  }

  return {
    email,
    password,
    pinCode: "560001",
  };
}

async function main() {
  const initialAdminPassword = assertSeedEnvironmentAndGetAdminPassword();
  const customerCreds = resolveSeedCustomerCredentials();

  console.info("Seeding StoreSetting...");
  await prisma.storeSetting.upsert({
    where: { id: "default" },
    update: {
      sellerStateCode: brandConfig.sellerStateCode,
      sellerStateName: brandConfig.sellerStateName,
      gstin: brandConfig.gstinPlaceholder,
      orderCutoffHourIst: 14,
      orderCutoffMinuteIst: 0,
    },
    create: {
      id: "default",
      sellerStateCode: brandConfig.sellerStateCode,
      sellerStateName: brandConfig.sellerStateName,
      gstin: brandConfig.gstinPlaceholder,
      orderCutoffHourIst: 14,
      orderCutoffMinuteIst: 0,
    },
  });

  console.info(
    `Seeding ${SEED_INDIAN_HOLIDAYS_2026_2027.length} Indian holidays for 2026 and 2027...`
  );
  for (const holiday of SEED_INDIAN_HOLIDAYS_2026_2027) {
    await prisma.holiday.upsert({
      where: { date: holiday.date },
      update: {
        name: holiday.name,
        year: holiday.year,
        isActive: holiday.isActive,
      },
      create: holiday,
    });
  }

  console.info("Seeding ServiceablePinCodes...");
  for (const item of SEED_SERVICEABLE_PIN_CODES) {
    await prisma.serviceablePinCode.upsert({
      where: { pinCode: item.pinCode },
      update: item,
      create: item,
    });
  }

  console.info("Seeding initial Admin user (admin@kalaandkiln.in)...");
  const adminPasswordHash = await hashPassword(initialAdminPassword);
  await prisma.user.upsert({
    where: { email: "admin@kalaandkiln.in" },
    update: {
      role: "ADMIN",
      isVerified: true,
      mustChangePassword: true,
      passwordHash: adminPasswordHash,
    },
    create: {
      id: "user-admin-1",
      fullName: "Kala & Kiln Operations Admin",
      email: "admin@kalaandkiln.in",
      canonicalEmail: "admin@kalaandkiln.in",
      phone: "9880011223",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      isVerified: true,
      mustChangePassword: true,
      addressLine: "42 Indiranagar 100 Feet Road",
      city: "Bengaluru",
      state: "Karnataka",
      pinCode: "560038",
    },
  });

  console.info(
    `Seeding verified test customer (${customerCreds.email}, PIN ${customerCreds.pinCode})...`
  );
  const customerPasswordHash = await hashPassword(customerCreds.password);
  const seededCustomer = await prisma.user.upsert({
    where: { email: customerCreds.email },
    update: {
      role: "CUSTOMER",
      isVerified: true,
      mustChangePassword: false,
      passwordHash: customerPasswordHash,
      pinCode: customerCreds.pinCode,
      city: "Bengaluru",
      state: "Karnataka",
      addressLine: "18 Barton Court, Church Street",
    },
    create: {
      id: "user-customer-1",
      fullName: "Aarav Kulkarni",
      email: customerCreds.email,
      canonicalEmail: customerCreds.email,
      phone: "9845098450",
      passwordHash: customerPasswordHash,
      role: "CUSTOMER",
      isVerified: true,
      mustChangePassword: false,
      addressLine: "18 Barton Court, Church Street",
      city: "Bengaluru",
      state: "Karnataka",
      pinCode: customerCreds.pinCode,
    },
  });

  await prisma.savedAddress.deleteMany({
    where: { userId: seededCustomer.id },
  });
  await prisma.savedAddress.create({
    data: {
      userId: seededCustomer.id,
      label: "Home",
      recipientName: "Aarav Kulkarni",
      phone: "9845098450",
      addressLine: "18 Barton Court, Church Street",
      city: "Bengaluru",
      state: "Karnataka",
      pinCode: customerCreds.pinCode,
      isDefault: true,
    },
  });

  console.info(`Seeding ${SEED_SUPPLIERS.length} craft suppliers...`);
  for (const sup of SEED_SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { id: sup.id },
      update: {
        name: sup.name,
        contactEmail: sup.email,
        contactPhone: sup.phone,
        isActive: true,
      },
      create: {
        id: sup.id,
        name: sup.name,
        contactEmail: sup.email,
        contactPhone: sup.phone,
        isActive: true,
      },
    });
  }

  console.info(`Seeding ${SEED_PRODUCTS.length} catalogue products...`);
  const nowMs = Date.now();
  for (let idx = 0; idx < SEED_PRODUCTS.length; idx++) {
    const prod = SEED_PRODUCTS[idx]!;
    const deterministicId = `prod-seed-${String(idx + 1).padStart(2, "0")}`;
    const stockLastConfirmedAt = new Date(
      nowMs - prod.stockConfirmedHoursAgo * 60 * 60 * 1000
    );

    const upserted = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        shortDescription: prod.shortDescription,
        description: prod.description,
        category: prod.category,
        tags: prod.tags,
        material: prod.material,
        dimensions: prod.dimensions,
        careInstructions: prod.careInstructions,
        pricePaise: prod.pricePaise,
        compareAtPricePaise: prod.compareAtPaise ?? null,
        taxSlabPercent: taxSlabToPercent(prod.taxSlab),
        hsnCode: prod.hsnCode,
        supplierId: prod.supplierId,
        supplierSku: prod.supplierSku,
        supplierProductUrl: prod.supplierProductUrl,
        supplierStock: prod.supplierStock,
        reservedStock: prod.reservedStock,
        stockBuffer: prod.bufferStock,
        processingDays: prod.dispatchTimeDays,
        stockLastConfirmedAt,
        isActive: prod.isActive,
      },
      create: {
        id: deterministicId,
        slug: prod.slug,
        name: prod.name,
        shortDescription: prod.shortDescription,
        description: prod.description,
        category: prod.category,
        tags: prod.tags,
        material: prod.material,
        dimensions: prod.dimensions,
        careInstructions: prod.careInstructions,
        pricePaise: prod.pricePaise,
        compareAtPricePaise: prod.compareAtPaise ?? null,
        taxSlabPercent: taxSlabToPercent(prod.taxSlab),
        hsnCode: prod.hsnCode,
        supplierId: prod.supplierId,
        supplierSku: prod.supplierSku,
        supplierProductUrl: prod.supplierProductUrl,
        supplierStock: prod.supplierStock,
        reservedStock: prod.reservedStock,
        stockBuffer: prod.bufferStock,
        processingDays: prod.dispatchTimeDays,
        stockLastConfirmedAt,
        isActive: prod.isActive,
      },
    });

    await prisma.productImage.deleteMany({
      where: { productId: upserted.id },
    });

    if (prod.images.length > 0) {
      await prisma.productImage.createMany({
        data: prod.images.map((img) => ({
          productId: upserted.id,
          imageUrl: img.url,
          altText: img.altText,
          aspectRatio: img.aspectRatio,
          position: img.sortOrder,
        })),
      });
    }
  }

  console.info("Database seed completed.");
}

export async function seedDatabase() {
  return main();
}

if (process.env.VITEST !== "true") {
  main()
    .catch((err) => {
      console.error("Seed error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
