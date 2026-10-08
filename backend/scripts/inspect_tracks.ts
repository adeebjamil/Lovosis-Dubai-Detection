import { prisma } from "../src/lib/prisma";

async function run() {
  const tracks = await prisma.track.findMany({
    select: {
      id: true,
      cameraId: true,
      trackKey: true,
      class: true,
      gender: true,
      genderConfidence: true,
      nationality: true,
      nationalityConfidence: true,
      confidence: true,
      firstSeenAt: true,
      lastSeenAt: true,
      dwellSeconds: true,
      camera: { select: { code: true, name: true } },
    },
    orderBy: { firstSeenAt: "desc" },
    take: 10,
  });
  console.log(JSON.stringify(tracks, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  const total = await prisma.track.count();
  console.log(`Total tracks in DB right now: ${total}`);
  await prisma.$disconnect();
}
run();
