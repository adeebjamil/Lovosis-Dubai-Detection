import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Purging all demo cameras, detections, tracks, counts, aggregates, zones, reports...");

  const tracks = await prisma.track.deleteMany();
  console.log(`Deleted ${tracks.count} tracks`);

  const countEvents = await prisma.countEvent.deleteMany();
  console.log(`Deleted ${countEvents.count} count events`);

  const aggregates = await prisma.minuteAggregate.deleteMany();
  console.log(`Deleted ${aggregates.count} minute aggregates`);

  const zones = await prisma.zone.deleteMany();
  console.log(`Deleted ${zones.count} zones`);

  const reports = await prisma.report.deleteMany();
  console.log(`Deleted ${reports.count} reports`);

  const cameras = await prisma.camera.deleteMany();
  console.log(`Deleted ${cameras.count} cameras`);

  console.log("Database successfully cleaned! Ready for real CCTV cameras.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
