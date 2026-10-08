import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting analytics and detection counts (keeping cameras & settings intact)...");

  const tracks = await prisma.track.deleteMany();
  console.log(`Deleted ${tracks.count} tracks`);

  const countEvents = await prisma.countEvent.deleteMany();
  console.log(`Deleted ${countEvents.count} count events`);

  const aggregates = await prisma.minuteAggregate.deleteMany();
  console.log(`Deleted ${aggregates.count} minute aggregates`);

  const reports = await prisma.report.deleteMany();
  console.log(`Deleted ${reports.count} reports`);

  const remainingCameras = await prisma.camera.count();
  console.log(`Remaining cameras preserved: ${remainingCameras}`);

  console.log("Analytics data reset successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
