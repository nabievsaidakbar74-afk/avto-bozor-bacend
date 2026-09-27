import {
  BodyType,
  CarStatus,
  FuelType,
  ListingStatus,
  ListingType,
  NotificationType,
  PurchaseStatus,
  RentalBookingStatus,
  Transmission,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { hashPassword } from "../src/common/security/password.js";
import { PrismaService } from "../src/infrastructure/prisma/prisma.service.js";

/**
 * DEVELOPMENT ONLY.
 * Every seeded account uses the same password: DevOnly#AvtoBozor1
 * Never use these accounts or this password in production.
 */
const DEV_ONLY_PASSWORD = "DevOnly#AvtoBozor1";

const users = {
  superAdmin: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "super.admin@avtobozor.local",
    phone: "+998900000001",
    firstName: "Super",
    lastName: "Admin",
    role: UserRole.SUPER_ADMIN,
  },
  admin: {
    id: "22222222-2222-4222-8222-222222222222",
    email: "admin@avtobozor.local",
    phone: "+998900000002",
    firstName: "Admin",
    lastName: "Karimov",
    role: UserRole.ADMIN,
  },
  moderator: {
    id: "33333333-3333-4333-8333-333333333333",
    email: "moderator@avtobozor.local",
    phone: "+998900000003",
    firstName: "Moderator",
    lastName: "Yusupova",
    role: UserRole.MODERATOR,
  },
  ali: {
    id: "44444444-4444-4444-8444-444444444444",
    email: "ali.seller@avtobozor.local",
    phone: "+998900000004",
    firstName: "Ali",
    lastName: "Karimov",
    role: UserRole.USER,
  },
  malika: {
    id: "55555555-5555-4555-8555-555555555555",
    email: "malika.seller@avtobozor.local",
    phone: "+998900000005",
    firstName: "Malika",
    lastName: "Saidova",
    role: UserRole.USER,
  },
  jasur: {
    id: "66666666-6666-4666-8666-666666666666",
    email: "jasur.buyer@avtobozor.local",
    phone: "+998900000006",
    firstName: "Jasur",
    lastName: "Toshmatov",
    role: UserRole.USER,
  },
  nodira: {
    id: "77777777-7777-4777-8777-777777777777",
    email: "nodira.renter@avtobozor.local",
    phone: "+998900000007",
    firstName: "Nodira",
    lastName: "Rahimova",
    role: UserRole.USER,
  },
} as const;

const cars = {
  cobalt: "aaaaaaa1-1111-4111-8111-111111111111",
  spark: "aaaaaaa2-2222-4222-8222-222222222222",
  gentra: "aaaaaaa3-3333-4333-8333-333333333333",
  tracker: "aaaaaaa4-4444-4444-8444-444444444444",
  malibu: "aaaaaaa5-5555-4555-8555-555555555555",
  camry: "aaaaaaa6-6666-4666-8666-666666666666",
} as const;

function atUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function rentalTotal(dailyPrice: string, startDate: Date, endDate: Date): string {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((endDate.getTime() - startDate.getTime()) / millisecondsPerDay);
  return (Number(dailyPrice) * days).toFixed(2);
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(DEV_ONLY_PASSWORD);
  const db = PrismaService.client();

  const trackerStart = atUtc("2026-10-02");
  const trackerEnd = atUtc("2026-10-06");
  const trackerDaily = "450000.00";
  const malibuStart = atUtc("2026-09-25");
  const malibuEnd = atUtc("2026-09-30");
  const malibuDaily = "700000.00";

  await db.$transaction(async (tx) => {
    for (const user of Object.values(users)) {
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
        create: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: UserStatus.ACTIVE,
          passwordHash,
        },
      });
    }

    const carRows = [
      {
        id: cars.cobalt,
        ownerId: users.ali.id,
        brand: "Chevrolet",
        model: "Cobalt",
        year: 2022,
        price: "165000000.00",
        dailyRentalPrice: null,
        mileage: 42000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.AUTOMATIC,
        bodyType: BodyType.SEDAN,
        color: "White",
        engine: "1.5",
        description: "Development seed car listed for sale in Tashkent.",
        location: "Tashkent",
        status: CarStatus.AVAILABLE,
      },
      {
        id: cars.spark,
        ownerId: users.malika.id,
        brand: "Chevrolet",
        model: "Spark",
        year: 2020,
        price: "98000000.00",
        dailyRentalPrice: null,
        mileage: 61000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.MANUAL,
        bodyType: BodyType.HATCHBACK,
        color: "Blue",
        engine: "1.2",
        description: "Development seed car waiting for moderation.",
        location: "Samarkand",
        status: CarStatus.PENDING_MODERATION,
      },
      {
        id: cars.gentra,
        ownerId: users.ali.id,
        brand: "Chevrolet",
        model: "Gentra",
        year: 2019,
        price: "125000000.00",
        dailyRentalPrice: null,
        mileage: 88000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.AUTOMATIC,
        bodyType: BodyType.SEDAN,
        color: "Silver",
        engine: "1.5",
        description: "Development seed car with one completed purchase.",
        location: "Tashkent",
        status: CarStatus.SOLD,
      },
      {
        id: cars.tracker,
        ownerId: users.malika.id,
        brand: "Chevrolet",
        model: "Tracker",
        year: 2023,
        price: "285000000.00",
        dailyRentalPrice: trackerDaily,
        mileage: 18000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.AUTOMATIC,
        bodyType: BodyType.SUV,
        color: "Black",
        engine: "1.2 Turbo",
        description: "Development seed car available for rent.",
        location: "Tashkent",
        status: CarStatus.AVAILABLE,
      },
      {
        id: cars.malibu,
        ownerId: users.ali.id,
        brand: "Chevrolet",
        model: "Malibu",
        year: 2021,
        price: "310000000.00",
        dailyRentalPrice: malibuDaily,
        mileage: 54000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.AUTOMATIC,
        bodyType: BodyType.SEDAN,
        color: "Gray",
        engine: "2.0",
        description: "Development seed car with an active rental.",
        location: "Tashkent",
        status: CarStatus.RENTED,
      },
      {
        id: cars.camry,
        ownerId: users.jasur.id,
        brand: "Toyota",
        model: "Camry",
        year: 2018,
        price: "240000000.00",
        dailyRentalPrice: null,
        mileage: 112000,
        fuelType: FuelType.PETROL,
        transmission: Transmission.AUTOMATIC,
        bodyType: BodyType.SEDAN,
        color: "Black",
        engine: "2.5",
        description: "Development seed draft owned by a buyer account.",
        location: "Bukhara",
        status: CarStatus.DRAFT,
      },
    ] as const;

    for (const car of carRows) {
      await tx.car.upsert({
        where: { id: car.id },
        update: car,
        create: car,
      });
      await tx.carImage.upsert({
        where: { storageKey: `dev/cars/${car.id}/cover.jpg` },
        update: {
          url: `https://cdn.avtobozor.local/dev/cars/${car.id}/cover.jpg`,
          sortOrder: 0,
        },
        create: {
          carId: car.id,
          url: `https://cdn.avtobozor.local/dev/cars/${car.id}/cover.jpg`,
          storageKey: `dev/cars/${car.id}/cover.jpg`,
          sortOrder: 0,
        },
      });
    }

    const listingRows = [
      {
        id: "bbbbbbb1-1111-4111-8111-111111111111",
        carId: cars.cobalt,
        ownerId: users.ali.id,
        type: ListingType.SALE,
        status: ListingStatus.PUBLISHED,
        salePrice: "165000000.00",
        rentalDailyPrice: null,
        title: "Chevrolet Cobalt 2022 for sale",
        description: "Development seed sale listing.",
        publishedAt: atUtc("2026-09-01"),
        expiresAt: atUtc("2026-12-01"),
      },
      {
        id: "bbbbbbb2-2222-4222-8222-222222222222",
        carId: cars.spark,
        ownerId: users.malika.id,
        type: ListingType.SALE,
        status: ListingStatus.PENDING_MODERATION,
        salePrice: "98000000.00",
        rentalDailyPrice: null,
        title: "Chevrolet Spark 2020 for sale",
        description: "Development seed listing waiting for moderation.",
        publishedAt: null,
        expiresAt: null,
      },
      {
        id: "bbbbbbb3-3333-4333-8333-333333333333",
        carId: cars.gentra,
        ownerId: users.ali.id,
        type: ListingType.SALE,
        status: ListingStatus.SOLD,
        salePrice: "125000000.00",
        rentalDailyPrice: null,
        title: "Chevrolet Gentra 2019 sold",
        description: "Development seed listing closed by a completed purchase.",
        publishedAt: atUtc("2026-08-01"),
        expiresAt: atUtc("2026-09-15"),
      },
      {
        id: "bbbbbbb4-4444-4444-8444-444444444444",
        carId: cars.tracker,
        ownerId: users.malika.id,
        type: ListingType.RENT,
        status: ListingStatus.PUBLISHED,
        salePrice: null,
        rentalDailyPrice: trackerDaily,
        title: "Chevrolet Tracker 2023 for rent",
        description: "Development seed rental listing.",
        publishedAt: atUtc("2026-09-10"),
        expiresAt: atUtc("2026-12-10"),
      },
      {
        id: "bbbbbbb5-5555-4555-8555-555555555555",
        carId: cars.malibu,
        ownerId: users.ali.id,
        type: ListingType.RENT,
        status: ListingStatus.RENTED,
        salePrice: null,
        rentalDailyPrice: malibuDaily,
        title: "Chevrolet Malibu 2021 for rent",
        description: "Development seed listing with an active booking.",
        publishedAt: atUtc("2026-09-01"),
        expiresAt: atUtc("2026-11-01"),
      },
      {
        id: "bbbbbbb6-6666-4666-8666-666666666666",
        carId: cars.camry,
        ownerId: users.jasur.id,
        type: ListingType.SALE,
        status: ListingStatus.DRAFT,
        salePrice: "240000000.00",
        rentalDailyPrice: null,
        title: "Toyota Camry 2018 draft",
        description: "Development seed draft listing.",
        publishedAt: null,
        expiresAt: null,
      },
    ] as const;

    for (const listing of listingRows) {
      await tx.listing.upsert({
        where: { id: listing.id },
        update: listing,
        create: listing,
      });
    }

    const purchaseRows = [
      {
        id: "ccccccc1-1111-4111-8111-111111111111",
        buyerId: users.jasur.id,
        sellerId: users.ali.id,
        carId: cars.gentra,
        price: "125000000.00",
        status: PurchaseStatus.COMPLETED,
        completedCarId: cars.gentra,
      },
      {
        id: "ccccccc2-2222-4222-8222-222222222222",
        buyerId: users.jasur.id,
        sellerId: users.ali.id,
        carId: cars.cobalt,
        price: "165000000.00",
        status: PurchaseStatus.PENDING,
        completedCarId: null,
      },
    ] as const;

    for (const purchase of purchaseRows) {
      await tx.purchase.upsert({
        where: { id: purchase.id },
        update: purchase,
        create: purchase,
      });
    }

    const bookingRows = [
      {
        id: "ddddddd1-1111-4111-8111-111111111111",
        carId: cars.tracker,
        renterId: users.nodira.id,
        ownerId: users.malika.id,
        startDate: trackerStart,
        endDate: trackerEnd,
        dailyPrice: trackerDaily,
        totalPrice: rentalTotal(trackerDaily, trackerStart, trackerEnd),
        status: RentalBookingStatus.CONFIRMED,
      },
      {
        id: "ddddddd2-2222-4222-8222-222222222222",
        carId: cars.malibu,
        renterId: users.nodira.id,
        ownerId: users.ali.id,
        startDate: malibuStart,
        endDate: malibuEnd,
        dailyPrice: malibuDaily,
        totalPrice: rentalTotal(malibuDaily, malibuStart, malibuEnd),
        status: RentalBookingStatus.ACTIVE,
      },
    ] as const;

    for (const booking of bookingRows) {
      await tx.rentalBooking.upsert({
        where: { id: booking.id },
        update: booking,
        create: booking,
      });
    }

    const notificationRows = [
      {
        id: "eeeeeee1-1111-4111-8111-111111111111",
        userId: users.jasur.id,
        type: NotificationType.PURCHASE,
        title: "Purchase completed",
        message: "Your purchase of the Chevrolet Gentra was completed.",
        read: true,
      },
      {
        id: "eeeeeee2-2222-4222-8222-222222222222",
        userId: users.ali.id,
        type: NotificationType.SALE,
        title: "Car sold",
        message: "The Chevrolet Gentra sale was completed.",
        read: false,
      },
      {
        id: "eeeeeee3-3333-4333-8333-333333333333",
        userId: users.nodira.id,
        type: NotificationType.BOOKING,
        title: "Rental confirmed",
        message: "Your Chevrolet Tracker booking is confirmed.",
        read: false,
      },
      {
        id: "eeeeeee4-4444-4444-8444-444444444444",
        userId: users.malika.id,
        type: NotificationType.RENTAL,
        title: "Upcoming rental",
        message: "Nodira booked your Chevrolet Tracker.",
        read: false,
      },
      {
        id: "eeeeeee5-5555-4555-8555-555555555555",
        userId: users.ali.id,
        type: NotificationType.RENTAL,
        title: "Rental is active",
        message: "The Chevrolet Malibu rental is active.",
        read: false,
      },
      {
        id: "eeeeeee6-6666-4666-8666-666666666666",
        userId: users.malika.id,
        type: NotificationType.MODERATION,
        title: "Listing needs review",
        message: "The Chevrolet Spark listing is waiting for moderation.",
        read: false,
      },
      {
        id: "eeeeeee7-7777-4777-8777-777777777777",
        userId: users.jasur.id,
        type: NotificationType.LISTING,
        title: "Draft saved",
        message: "Your Toyota Camry listing is still a draft.",
        read: false,
      },
      {
        id: "eeeeeee8-8888-4888-8888-888888888888",
        userId: users.superAdmin.id,
        type: NotificationType.SYSTEM,
        title: "Development seed loaded",
        message: "Sample marketplace data is available for local development.",
        read: false,
      },
    ] as const;

    for (const notification of notificationRows) {
      await tx.notification.upsert({
        where: { id: notification.id },
        update: notification,
        create: notification,
      });
    }
  });

  console.log("Development seed complete.");
  console.log("DEVELOPMENT ONLY password for every seeded account: DevOnly#AvtoBozor1");
  console.log("Seeded emails:");
  for (const user of Object.values(users)) {
    console.log(`- ${user.email} (${user.role})`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await PrismaService.disconnect();
  });
