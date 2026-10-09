import { prisma } from "../src/lib/prisma";

async function run() {
  const updated = await prisma.camera.update({
    where: { code: "CAM-002" },
    data: {
      detectGender: true,
    },
  });
  console.log("Updated CAM-002:", updated.code, "detectGender =", updated.detectGender);
  await prisma.$disconnect();
}

run();
