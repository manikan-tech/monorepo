import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const purchases = await prisma.botPurchase.findMany()
  console.log(purchases)
}
main()
