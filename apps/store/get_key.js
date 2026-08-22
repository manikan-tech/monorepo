import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const key = await prisma.serviceApiKey.findFirst({
    where: { service: 'RECOMMENDATION', retailer: { email: 'retailer@manikan.com' } }
  });
  console.log(key ? key.apiKey : 'NO_KEY_FOUND');
}
main().finally(() => prisma.$disconnect());
