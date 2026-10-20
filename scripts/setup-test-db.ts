import { PrismaClient } from "@prisma/client";

async function main() {
  const adminUrl = "postgresql://postgres:postgres@127.0.0.1:55432/postgres?schema=public";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: adminUrl },
    },
  });

  try {
    await prisma.$connect();
    const rows: Array<{ datname: string }> = await prisma.$queryRawUnsafe(
      "SELECT datname FROM pg_database WHERE datname = 'dropshipping_test'"
    );

    if (rows.length === 0) {
      console.log("Database 'dropshipping_test' does not exist. Creating...");
      await prisma.$executeRawUnsafe("CREATE DATABASE dropshipping_test");
      console.log("Database 'dropshipping_test' created successfully.");
    } else {
      console.log("Database 'dropshipping_test' already exists.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error setting up test database:", err);
  process.exit(1);
});
