import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, DetectionClass, Gender, NationalityGroup, ZoneMode, CameraStatus, ModelTask } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SETTINGS: Record<string, unknown> = {
  timezone: "Asia/Dubai",
  retentionDays: 180,
  detectionConfidence: 0.45,
  genderConfidence: 0.7,
  attireConfidence: 0.65,
  dailyReportTime: "23:55",
  weeklyReportDay: "SUNDAY",
  storeDebugSnapshots: false,
};

async function main() {
  const name = process.env.ADMIN_SEED_NAME ?? "Super Admin";
  const email = (process.env.ADMIN_SEED_EMAIL ?? "admin@gmail.com").trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD ?? "Admin@000";

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { email },
    update: { passwordHash },
    create: { name, email, passwordHash, role: "SUPER_ADMIN" },
  });
  console.log(`✔ Super admin ready: ${email}`);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as never } });
  }
  console.log(`✔ Default settings ready`);

  // Model versions are seeded below. No hardcoded cameras or test tracks are created,
  // allowing the user to configure real RTSP cameras from scratch.

  // Seed model versions
  await prisma.modelVersion.upsert({
    where: { task_version: { task: ModelTask.DETECTOR, version: "v1.0-yolox-s" } },
    update: {},
    create: {
      task: ModelTask.DETECTOR,
      name: "YOLOX-s Object Detector",
      version: "v1.0-yolox-s",
      filePath: "models/yolox_s.onnx",
      isActive: true,
      metrics: { mAP: 0.405, classes: ["person", "dog", "cat"], inputSize: "640x640" },
      notes: "COCO pretrained YOLOX-s model with Apache 2.0 license",
    },
  });

  await prisma.modelVersion.upsert({
    where: { task_version: { task: ModelTask.FACE, version: "v1.0-yunet" } },
    update: {},
    create: {
      task: ModelTask.FACE,
      name: "YuNet Face Detector",
      version: "v1.0-yunet",
      filePath: "models/face_detection_yunet_2023mar.onnx",
      isActive: true,
      metrics: { latencyMs: 6.2, inputSize: "320x320" },
      notes: "OpenCV Zoo YuNet face landmark and detection model",
    },
  });

  await prisma.modelVersion.upsert({
    where: { task_version: { task: ModelTask.ATTIRE, version: "v1.0-uae-attire" } },
    update: {},
    create: {
      task: ModelTask.ATTIRE,
      name: "UAE Attire Traditional Classifier",
      version: "v1.0-uae-attire",
      filePath: "models/attire_classifier.json",
      isActive: true,
      metrics: { accuracyPct: 88.5, samples: 15 },
      notes: "Multi-region HSV clothing luminance and vertical consistency classifier",
    },
  });
  console.log(`✔ Model versions seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
