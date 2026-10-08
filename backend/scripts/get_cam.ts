import { prisma } from "../src/lib/prisma";
async function run() {
  const c = await prisma.camera.findMany();
  console.log(JSON.stringify(c, null, 2));
  await prisma.$disconnect();
}
run();
