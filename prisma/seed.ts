import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { initialData } from "../src/lib/demo-data";

const prisma = new PrismaClient();

const seedCredentials = [
  { email: process.env.ADMIN_LOGIN_EMAIL ?? "mertcan@unitcrm.com", password: process.env.ADMIN_LOGIN_PASSWORD },
  { email: process.env.OWNER_LOGIN_EMAIL ?? "dorukhan@unitglobal.com", password: process.env.OWNER_LOGIN_PASSWORD },
  { email: process.env.CONSULTANT_LOGIN_EMAIL ?? "kaan@unitglobal.com", password: process.env.CONSULTANT_LOGIN_PASSWORD },
];

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.marketAnalysisReport.deleteMany();
  await prisma.marketComparable.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.task.deleteMany();
  await prisma.leadAction.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.property.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  for (const user of initialData.users) {
    const credential = seedCredentials.find((item) => item.email === user.email);
    await prisma.user.create({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: credential?.password ? await bcrypt.hash(credential.password, 12) : undefined,
        role: user.role,
        title: user.title,
        phone: user.phone,
        avatarColor: user.avatarColor,
        active: user.active,
      },
    });
  }

  for (const property of initialData.properties) {
    await prisma.property.create({
      data: {
        id: property.id,
        title: property.title,
        listingType: property.listingType,
        price: property.price,
        currency: property.currency,
        city: property.city,
        district: property.district,
        neighborhood: property.neighborhood,
        projectName: property.projectName,
        squareMeters: property.squareMeters,
        rooms: property.rooms,
        floor: property.floor,
        buildingAge: property.buildingAge,
        furnished: property.furnished,
        description: property.description,
        features: property.features,
        coverImage: property.coverImage,
        videoUrl: property.videoUrl,
        listingUrl: property.listingUrl,
        consultantId: property.consultantId,
        status: property.status,
        createdAt: property.createdAt,
        images: {
          create: property.gallery.map((url, index) => ({
            url,
            alt: `${property.title} galeri ${index + 1}`,
            sortOrder: index,
          })),
        },
        assignments: {
          create: {
            userId: property.consultantId,
            role: "PRIMARY",
          },
        },
      },
    });
  }

  for (const lead of initialData.leads) {
    await prisma.lead.create({ data: lead });
  }

  for (const action of initialData.leadActions) {
    await prisma.leadAction.create({ data: action });
  }

  for (const task of initialData.tasks) {
    await prisma.task.create({ data: task });
  }

  for (const notification of initialData.notifications) {
    await prisma.notification.create({ data: notification });
  }

  for (const comparable of initialData.comparables) {
    await prisma.marketComparable.create({ data: comparable });
  }

  for (const report of initialData.reports) {
    await prisma.marketAnalysisReport.create({ data: report });
  }

  for (const item of initialData.priceHistory) {
    await prisma.priceHistory.create({ data: item });
  }

  for (const log of initialData.activityLogs) {
    await prisma.activityLog.create({ data: log });
  }

  await prisma.setting.create({ data: initialData.setting });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
