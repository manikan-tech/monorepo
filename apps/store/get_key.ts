import "dotenv/config";
import { prisma } from './app/lib/prisma.ts';
async function main() {
  const key = await prisma.serviceApiKey.findFirst({
    where: { service: 'RECOMMENDATION', retailer: { email: 'retailer@manikan.com' } }
  });
  console.log('REAL_KEY:', key ? key.apiKey : 'NO_KEY_FOUND');
}
main().finally(() => prisma.$disconnect());
