const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const keys = await prisma.serviceApiKey.findMany({ include: { retailer: true } });
  console.log(JSON.stringify(keys, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
