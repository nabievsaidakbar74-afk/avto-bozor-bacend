import type { OpenAPIV3 } from "openapi-types";
import { env } from "./env.js";

type Operation = OpenAPIV3.OperationObject;
type Response = OpenAPIV3.ResponseObject;
type Schema = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;

const bearer: OpenAPIV3.SecurityRequirementObject[] = [{ bearerAuth: [] }];

function json(description: string, schema: Schema, example?: unknown): Response {
  return {
    description,
    content: {
      "application/json": {
        schema,
        ...(example === undefined ? {} : { example }),
      },
    },
  };
}

function ref(name: string): OpenAPIV3.ReferenceObject {
  return { $ref: `#/components/schemas/${name}` };
}

function dataSchema(property: string, schema: Schema, required = true): Schema {
  return {
    type: "object",
    required: required ? [property] : undefined,
    properties: { [property]: schema },
  };
}

function success(description: string, data: Schema, example?: unknown): Response {
  return json(description, {
    allOf: [
      ref("SuccessEnvelope"),
      { type: "object", required: ["data"], properties: { data } },
    ],
  }, example);
}

function message(description: string, exampleMessage: string): Response {
  return json(description, ref("MessageResponse"), {
    success: true,
    message: exampleMessage,
  });
}

const errors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
  "409": { $ref: "#/components/responses/Conflict" },
  "422": { $ref: "#/components/responses/ValidationError" },
  "429": { $ref: "#/components/responses/TooManyRequests" },
  "415": { $ref: "#/components/responses/UnsupportedMedia" },
  "500": { $ref: "#/components/responses/InternalError" },
} satisfies Record<string, OpenAPIV3.ReferenceObject>;

function withErrors(
  response: Record<string, Response | OpenAPIV3.ReferenceObject>,
  codes: Array<keyof typeof errors>,
): Operation["responses"] {
  const selected: Operation["responses"] = { ...response };
  for (const code of codes) {
    selected[code] = errors[code];
  }
  return selected;
}

function query(name: string, schema: OpenAPIV3.SchemaObject, description: string): OpenAPIV3.ParameterObject {
  return { name, in: "query", required: false, description, schema };
}

function pathParam(name: string, description: string): OpenAPIV3.ParameterObject {
  return {
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", format: "uuid" },
  };
}

const page = query("page", { type: "integer", minimum: 1, default: 1 }, "Page number. Starts at 1.");
const limit = query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }, "Page size. Maximum 100.");
const sortOrder = query("sortOrder", { type: "string", enum: ["asc", "desc"], default: "desc" }, "Sort direction.");

function access(permission: string, who: string): string {
  return `Authentication: Bearer access token. Permission: ${permission}. Caller: ${who}.`;
}

function operation(input: {
  tags: string[];
  summary: string;
  description: string;
  auth?: boolean;
  status?: number;
  parameters?: OpenAPIV3.ParameterObject[];
  body?: Schema;
  bodyExample?: unknown;
  success: Response;
  errors: Array<keyof typeof errors>;
  extraResponses?: Operation["responses"];
}): Operation {
  return {
    tags: input.tags,
    summary: input.summary,
    description: input.description,
    security: input.auth === false ? [] : bearer,
    parameters: input.parameters,
    requestBody: input.body
      ? {
          required: true,
          content: {
            "application/json": {
              schema: input.body,
              ...(input.bodyExample === undefined ? {} : { example: input.bodyExample }),
            },
          },
        }
      : undefined,
    responses: {
      ...withErrors({ [String(input.status ?? 200)]: input.success }, input.errors),
      ...input.extraResponses,
    },
  };
}

const money: OpenAPIV3.SchemaObject = {
  type: "string",
  description: "Decimal amount with up to 12 digits and 2 decimal places. The server stores and returns this value. Do not send a client-calculated total.",
  pattern: "^(?:0|[1-9]\\d{0,11})(?:\\.\\d{1,2})?$",
  example: "15000.00",
};

const userExample = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ali@example.com",
  phone: "+998901234567",
  firstName: "Ali",
  lastName: "Karimov",
  avatar: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-09-27T07:00:00.000Z",
  updatedAt: "2026-09-27T07:00:00.000Z",
};

const carExample = {
  id: "22222222-2222-4222-8222-222222222222",
  ownerId: userExample.id,
  brand: "Chevrolet",
  model: "Cobalt",
  year: 2022,
  price: "15000.00",
  dailyRentalPrice: null,
  mileage: 12000,
  fuelType: "PETROL",
  transmission: "AUTOMATIC",
  bodyType: "SEDAN",
  color: "White",
  engine: "1.5",
  description: "One owner, full service history.",
  location: "Tashkent",
  status: "AVAILABLE",
  createdAt: "2026-09-27T07:00:00.000Z",
  updatedAt: "2026-09-27T07:00:00.000Z",
  images: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      url: "/uploads/car-images/3cd28a41-e28b-4ae0-a41d-7fddd181c509.png",
      sortOrder: 0,
    },
  ],
  owner: {
    id: userExample.id,
    firstName: "Ali",
    lastName: "Karimov",
    avatar: null,
  },
};

const listingExample = {
  id: "44444444-4444-4444-8444-444444444444",
  carId: carExample.id,
  ownerId: userExample.id,
  type: "SALE",
  status: "DRAFT",
  salePrice: "15000.00",
  rentalDailyPrice: null,
  title: "Chevrolet Cobalt 2022",
  description: "Ready for sale.",
  publishedAt: null,
  expiresAt: null,
  createdAt: "2026-09-27T07:10:00.000Z",
  updatedAt: "2026-09-27T07:10:00.000Z",
  car: {
    id: carExample.id,
    brand: "Chevrolet",
    model: "Cobalt",
    year: 2022,
    location: "Tashkent",
    price: "15000.00",
    images: carExample.images,
  },
  owner: carExample.owner,
};

const purchaseExample = {
  id: "55555555-5555-4555-8555-555555555555",
  carId: carExample.id,
  buyerId: "66666666-6666-4666-8666-666666666666",
  sellerId: userExample.id,
  price: "15000.00",
  status: "PENDING",
  createdAt: "2026-09-27T08:00:00.000Z",
  updatedAt: "2026-09-27T08:00:00.000Z",
  car: { id: carExample.id, brand: "Chevrolet", model: "Cobalt", year: 2022, location: "Tashkent" },
  buyer: { id: "66666666-6666-4666-8666-666666666666", firstName: "Jasur", lastName: "Aliyev" },
  seller: { id: userExample.id, firstName: "Ali", lastName: "Karimov" },
  payment: {
    id: "77777777-7777-4777-8777-777777777777",
    amount: "15000.00",
    currency: "UZS",
    status: "PENDING",
    provider: "manual",
  },
};

const bookingExample = {
  id: "88888888-8888-4888-8888-888888888888",
  carId: carExample.id,
  renterId: "66666666-6666-4666-8666-666666666666",
  ownerId: userExample.id,
  startDate: "2026-10-01",
  endDate: "2026-10-05",
  numberOfDays: 4,
  dailyPrice: "40.00",
  totalPrice: "160.00",
  status: "PENDING",
  createdAt: "2026-09-27T08:00:00.000Z",
  updatedAt: "2026-09-27T08:00:00.000Z",
  car: { id: carExample.id, brand: "Chevrolet", model: "Cobalt", location: "Tashkent" },
  renter: { id: "66666666-6666-4666-8666-666666666666", firstName: "Jasur", lastName: "Aliyev" },
  owner: { id: userExample.id, firstName: "Ali", lastName: "Karimov" },
};

const dashboardExample = {
  totalUsers: 12,
  activeUsers: 10,
  blockedUsers: 1,
  totalCars: 8,
  publishedListings: 4,
  pendingListings: 1,
  soldCars: 1,
  rentedCars: 0,
  totalSales: 3,
  completedSales: 1,
  activeRentals: 0,
  completedRentals: 0,
  pendingBookings: 1,
  salesRevenue: "15000.00",
  rentalRevenue: "0.00",
  totalRevenue: "15000.00",
  recentUsers: [userExample],
  recentListings: [
    {
      id: listingExample.id,
      title: listingExample.title,
      type: "SALE",
      status: "PUBLISHED",
      createdAt: listingExample.createdAt,
      owner: { id: userExample.id, firstName: "Ali", lastName: "Karimov" },
      car: { id: carExample.id, brand: "Chevrolet", model: "Cobalt" },
    },
  ],
  recentSales: [
    {
      id: purchaseExample.id,
      price: "15000.00",
      status: "COMPLETED",
      createdAt: purchaseExample.createdAt,
      car: { id: carExample.id, brand: "Chevrolet", model: "Cobalt" },
      buyer: { id: "66666666-6666-4666-8666-666666666666", firstName: "Jasur", lastName: "Aliyev" },
      seller: { id: userExample.id, firstName: "Ali", lastName: "Karimov" },
    },
  ],
  recentBookings: [
    {
      id: bookingExample.id,
      status: "PENDING",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      totalPrice: "160.00",
      createdAt: bookingExample.createdAt,
      car: { id: carExample.id, brand: "Chevrolet", model: "Cobalt" },
      renter: { id: "66666666-6666-4666-8666-666666666666", firstName: "Jasur", lastName: "Aliyev" },
      owner: { id: userExample.id, firstName: "Ali", lastName: "Karimov" },
    },
  ],
};

const paginationSchema: OpenAPIV3.SchemaObject = {
  type: "object",
  required: ["page", "limit", "total", "totalPages"],
  properties: {
    page: { type: "integer", minimum: 1, example: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100, example: 20 },
    total: { type: "integer", minimum: 0, example: 1 },
    totalPages: { type: "integer", minimum: 0, example: 1 },
  },
};

export const openApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Avto Bozor API",
    version: "0.1.0",
    description:
      "Official HTTP contract for the Avto Bozor marketplace. All routes are under /api/v1. Each resource has its own section: customer resources such as Cars and Listings, then the matching admin resources such as Admin Cars and Admin Listings, then Health / System. A success body is { success: true, message, data? }. An error body is { success: false, message, code, details? }. Guests can browse public cars and published listings. Authenticated users buy, sell, rent, and manage their own records. Staff roles are MODERATOR, ADMIN, and SUPER_ADMIN. Send the access token as Authorization: Bearer. The refresh token is an HttpOnly cookie and is not returned in JSON. Do not send ownerId, sellerId, buyerId, renterId, price, or payment amount. The server assigns those values.",
  },
  servers: [{ url: `http://localhost:${env.PORT}`, description: "Local server" }],
  tags: [
    {
      name: "Authentication",
      description: "Registration, login, refresh, logout, and the signed-in account for avto-bozor-web. Register, login, refresh, and logout do not use a bearer token. GET /auth/me requires one. Staff sign in through this same account flow. Profile edits are Users.",
    },
    {
      name: "Users",
      description: "The signed-in customer's own profile. GET and PATCH /users/me require a bearer token. Staff account administration is Admin Users.",
    },
    {
      name: "Cars",
      description: "Public car browsing and the owner's cars, including images. Catalog reads are public. Create, update, deactivate, and image changes require a bearer token and ownership.",
    },
    {
      name: "Listings",
      description: "Published listing browse and the owner's listings. Public reads do not require a token. Create, update, delete, and my listings require a bearer token.",
    },
    {
      name: "Purchases",
      description: "Buyer purchases and the seller's own sales. Requires a bearer token. Staff purchase administration is Admin Sales.",
    },
    {
      name: "Rentals",
      description: "Owner rental offers and rental requests on the owner's cars. Requires a bearer token. Staff booking administration is Admin Rentals.",
    },
    {
      name: "Bookings",
      description: "Renter booking requests and owner confirm, reject, or cancel. Requires a bearer token.",
    },
    {
      name: "Payments",
      description: "Customer payments for purchases and bookings. Requires a bearer token. Staff payment administration is Admin Payments.",
    },
    {
      name: "Favorites",
      description: "Saved cars for the signed-in customer. Requires a bearer token.",
    },
    {
      name: "Reviews",
      description: "Published reviews for a car, and submitting a review after a completed purchase or rental. The car review list is public. Creating a review requires a bearer token.",
    },
    {
      name: "Notifications",
      description: "Notifications for the signed-in customer. Requires a bearer token.",
    },
    {
      name: "Reports",
      description: "Customer report submission and the reporter's own reports. Requires a bearer token. Staff report handling is Admin Reports.",
    },
    {
      name: "Admin Dashboard",
      description: "avto-bozor-admin overview and analytics. ADMIN or SUPER_ADMIN with DASHBOARD_READ.",
    },
    {
      name: "Admin Users",
      description: "avto-bozor-admin account directory. ADMIN or SUPER_ADMIN. Status changes require USER_BLOCK.",
    },
    {
      name: "Admin Cars",
      description: "avto-bozor-admin car directory. ADMIN or SUPER_ADMIN with DASHBOARD_READ.",
    },
    {
      name: "Admin Listings",
      description: "avto-bozor-admin listing directory. ADMIN or SUPER_ADMIN with DASHBOARD_READ. Approval is Admin Moderation.",
    },
    {
      name: "Admin Sales",
      description: "avto-bozor-admin purchase directory. ADMIN or SUPER_ADMIN with SALE_READ.",
    },
    {
      name: "Admin Rentals",
      description: "avto-bozor-admin rental booking directory. ADMIN or SUPER_ADMIN with DASHBOARD_READ.",
    },
    {
      name: "Admin Payments",
      description: "avto-bozor-admin payments and refunds. ADMIN or SUPER_ADMIN with PAYMENT_READ.",
    },
    {
      name: "Admin Reports",
      description: "avto-bozor-admin report queue. MODERATOR, ADMIN, or SUPER_ADMIN with REPORT_READ or REPORT_MODERATE. Customer report submission is Reports.",
    },
    {
      name: "Admin Moderation",
      description: "avto-bozor-admin listing review. MODERATOR, ADMIN, or SUPER_ADMIN with LISTING_MODERATE.",
    },
    {
      name: "Admin Audit",
      description: "avto-bozor-admin audit log. ADMIN or SUPER_ADMIN with AUDIT_READ. Moderators receive 403.",
    },
    {
      name: "Health / System",
      description: "Process health. No account. The body does not include database credentials.",
    },
  ],
  paths: {
    "/api/v1/health": {
      get: operation({
        tags: ["Health / System"],
        summary: "Check API health",
        description: "No authentication. Returns success only when PostgreSQL accepts a connectivity check. The body has exactly success and message.",
        auth: false,
        success: json("API and database are reachable", ref("HealthResponse"), {
          success: true,
          message: "API is healthy",
        }),
        errors: ["429", "500"],
        extraResponses: {
          "503": json("Database is unavailable", ref("ErrorResponse"), {
            success: false,
            message: "Database is unavailable",
            code: "DATABASE_UNAVAILABLE",
          }),
        },
      }),
    },
    "/api/v1/auth/register": {
      post: operation({
        tags: ["Authentication"],
        summary: "Register an account",
        description: "No authentication. Creates a USER account. Email is stored in lowercase. Phone must be E.164, for example +998901234567. Password must be 8 to 128 characters and include a letter and a number. The password hash is never returned. New accounts start as ACTIVE. Limited to 10 attempts per 15 minutes per IP, shared with login.",
        auth: false,
        body: ref("RegisterRequest"),
        bodyExample: {
          email: "ali@example.com",
          phone: "+998901234567",
          password: "Password1",
          firstName: "Ali",
          lastName: "Karimov",
        },
        status: 201,
        success: success("Account created", dataSchema("user", ref("User")), {
          success: true,
          message: "Account created",
          data: { user: userExample },
        }),
        errors: ["400", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/auth/login": {
      post: operation({
        tags: ["Authentication"],
        summary: "Log in",
        description: "No authentication. Unknown emails and wrong passwords return the same 401. A blocked or suspended account returns 403. The JSON body contains the access token. The refresh token is set as an HttpOnly cookie named refreshToken on path /api/v1/auth and is not included in JSON. Limited to 10 attempts per 15 minutes per IP.",
        auth: false,
        body: ref("LoginRequest"),
        bodyExample: { email: "ali@example.com", password: "Password1" },
        success: success("Login successful", ref("LoginResult"), {
          success: true,
          message: "Login successful",
          data: { accessToken: "<access-token>", user: userExample },
        }),
        errors: ["400", "401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/auth/refresh": {
      post: operation({
        tags: ["Authentication"],
        summary: "Rotate the refresh token",
        description: "No bearer token. Send Content-Type: application/json and the refreshToken cookie. The previous refresh token is revoked. Reusing a revoked token revokes the user's other active refresh tokens. A form post is rejected.",
        auth: false,
        body: { type: "object", additionalProperties: false, description: "Empty JSON object." },
        bodyExample: {},
        success: success("Session refreshed", ref("LoginResult"), {
          success: true,
          message: "Session refreshed",
          data: { accessToken: "<access-token>", user: userExample },
        }),
        errors: ["401", "403", "415", "429", "500"],
      }),
    },
    "/api/v1/auth/logout": {
      post: operation({
        tags: ["Authentication"],
        summary: "Log out",
        description: "No bearer token. Send Content-Type: application/json and the refreshToken cookie. The refresh token is revoked and the cookie is cleared. An already issued access token remains valid until it expires.",
        auth: false,
        body: { type: "object", additionalProperties: false },
        bodyExample: {},
        success: message("Logged out", "Logged out"),
        errors: ["415", "429", "500"],
      }),
    },
    "/api/v1/auth/me": {
      get: operation({
        tags: ["Authentication"],
        summary: "Get the authenticated account",
        description: access("USER_READ", "the account in the access token"),
        success: success("Authenticated user", dataSchema("user", ref("User")), {
          success: true,
          message: "Authenticated user",
          data: { user: userExample },
        }),
        errors: ["401", "403", "429", "500"],
      }),
    },
    "/api/v1/users/me": {
      get: operation({
        tags: ["Users"],
        summary: "Get my profile",
        description: access("USER_READ", "the authenticated user"),
        success: success("Profile", dataSchema("user", ref("User"))),
        errors: ["401", "403", "429", "500"],
      }),
      patch: operation({
        tags: ["Users"],
        summary: "Update my profile",
        description: `${access("USER_UPDATE", "the authenticated user")} At least one of email, phone, firstName, lastName, or avatar is required. Role, status, and passwordHash are rejected. Avatar must be an https URL or a path under /uploads/. Email and phone must stay unique.`,
        body: ref("UpdateProfileRequest"),
        success: success("Profile updated", dataSchema("user", ref("User"))),
        errors: ["400", "401", "403", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/cars": {
      get: operation({
        tags: ["Cars"],
        summary: "List public cars",
        description: "No authentication. Only AVAILABLE, RESERVED, SOLD, and RENTED cars are returned. Responses omit email, phone, and passwordHash. Sort fields are an allowlist.",
        auth: false,
        parameters: [
          query("search", { type: "string", minLength: 1, maxLength: 100 }, "Matches brand, model, or description."),
          query("brand", { type: "string", maxLength: 80 }, "Brand filter."),
          query("model", { type: "string", maxLength: 80 }, "Model filter."),
          query("minPrice", { type: "number", minimum: 0 }, "Minimum price."),
          query("maxPrice", { type: "number", minimum: 0 }, "Maximum price. Must be greater than or equal to minPrice."),
          query("minYear", { type: "integer", minimum: 1950 }, "Minimum model year."),
          query("maxYear", { type: "integer" }, "Maximum model year."),
          query("fuelType", { type: "string", enum: ["PETROL", "DIESEL", "GAS", "HYBRID", "ELECTRIC"] }, "Fuel type."),
          query("transmission", { type: "string", enum: ["MANUAL", "AUTOMATIC"] }, "Transmission."),
          query("bodyType", { type: "string", enum: ["SEDAN", "HATCHBACK", "SUV", "COUPE", "WAGON", "MINIVAN", "PICKUP", "VAN", "CONVERTIBLE"] }, "Body type."),
          query("minMileage", { type: "integer", minimum: 0 }, "Minimum mileage."),
          query("maxMileage", { type: "integer", minimum: 0 }, "Maximum mileage."),
          query("location", { type: "string", maxLength: 120 }, "Location filter."),
          query("status", { type: "string", enum: ["AVAILABLE", "RESERVED", "SOLD", "RENTED"] }, "Public status."),
          query("sortBy", { type: "string", enum: ["createdAt", "price", "year", "mileage", "brand", "model"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Cars", {
          type: "object",
          required: ["cars", "pagination"],
          properties: { cars: { type: "array", items: ref("Car") }, pagination: paginationSchema },
        }, {
          success: true,
          message: "Cars",
          data: { cars: [carExample], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
        }),
        errors: ["422", "429", "500"],
      }),
      post: operation({
        tags: ["Cars"],
        summary: "Create a car",
        description: `${access("CAR_CREATE", "any active user")} ownerId is rejected. The owner is the authenticated user. Status may be DRAFT, PENDING_MODERATION, AVAILABLE, or INACTIVE. RESERVED, SOLD, and RENTED are rejected.`,
        body: ref("CreateCarRequest"),
        bodyExample: {
          brand: "Chevrolet",
          model: "Cobalt",
          year: 2022,
          price: "15000.00",
          mileage: 12000,
          fuelType: "PETROL",
          transmission: "AUTOMATIC",
          bodyType: "SEDAN",
          color: "White",
          engine: "1.5",
          description: "One owner, full service history.",
          location: "Tashkent",
          status: "AVAILABLE",
        },
        status: 201,
        success: success("Car created", dataSchema("car", ref("Car")), {
          success: true,
          message: "Car created",
          data: { car: carExample },
        }),
        errors: ["400", "401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/cars/{id}": {
      get: operation({
        tags: ["Cars"],
        summary: "Get car details",
        description: "Public for AVAILABLE, RESERVED, SOLD, and RENTED. The owner, an admin, or a super admin can also read a non-public car. A hidden car returns 404.",
        auth: false,
        parameters: [pathParam("id", "Car id.")],
        success: success("Car", dataSchema("car", ref("Car")), {
          success: true,
          message: "Car",
          data: { car: carExample },
        }),
        errors: ["404", "422", "429", "500"],
      }),
      patch: operation({
        tags: ["Cars"],
        summary: "Update a car",
        description: `${access("CAR_UPDATE", "the owner, an admin, or a super admin")} Another user receives 404. At least one field is required. Status cannot become RESERVED, SOLD, or RENTED, and a car already in one of those statuses cannot have its status changed here.`,
        parameters: [pathParam("id", "Car id.")],
        body: ref("UpdateCarRequest"),
        success: success("Car updated", dataSchema("car", ref("Car"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
      delete: operation({
        tags: ["Cars"],
        summary: "Deactivate a car",
        description: `${access("CAR_DELETE", "the owner, an admin, or a super admin")} Sets status to INACTIVE. The row is not removed. Another user receives 404.`,
        parameters: [pathParam("id", "Car id.")],
        success: success("Car deactivated", dataSchema("car", ref("Car"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/cars/{carId}/images": {
      post: {
        tags: ["Cars"],
        summary: "Upload a car image",
        description: `${access("CAR_UPDATE", "the owner, an admin, or a super admin")} Multipart field name is image. JPEG, PNG, or WebP only, up to 5 MB, 200 to 8000 pixels on each side. The client filename is ignored. PostgreSQL stores the URL, storage key, and metadata. The storage key is not returned.`,
        security: bearer,
        parameters: [pathParam("carId", "Car id.")],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["image"],
                properties: {
                  image: { type: "string", format: "binary", description: "JPEG, PNG, or WebP file." },
                },
              },
            },
          },
        },
        responses: withErrors({
          "201": success("Image stored", dataSchema("image", ref("CarImage"))),
        }, ["401", "403", "404", "409", "422", "429", "500"]),
      },
    },
    "/api/v1/cars/{carId}/images/order": {
      patch: operation({
        tags: ["Cars"],
        summary: "Reorder car images",
        description: `${access("CAR_UPDATE", "the owner, an admin, or a super admin")} imageIds lists every image of this car exactly once. Index 0 becomes sortOrder 0. The response omits storageKey.`,
        parameters: [pathParam("carId", "Car id.")],
        body: ref("ReorderCarImagesRequest"),
        success: success("Image order updated", {
          type: "object",
          required: ["images"],
          properties: { images: { type: "array", items: ref("CarImage") } },
        }),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/cars/{carId}/images/{imageId}/main": {
      patch: operation({
        tags: ["Cars"],
        summary: "Set the main car image",
        description: `${access("CAR_UPDATE", "the owner, an admin, or a super admin")} The chosen image receives the smallest sortOrder. Other images keep their relative order. The response omits storageKey.`,
        parameters: [pathParam("carId", "Car id."), pathParam("imageId", "Image id.")],
        success: success("Main image updated", {
          type: "object",
          required: ["images"],
          properties: { images: { type: "array", items: ref("CarImage") } },
        }),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/cars/{carId}/images/{imageId}": {
      delete: operation({
        tags: ["Cars"],
        summary: "Delete a car image",
        description: `${access("CAR_DELETE", "the owner, an admin, or a super admin")} Removes the database row and the stored file.`,
        parameters: [pathParam("carId", "Car id."), pathParam("imageId", "Image id.")],
        success: message("Image deleted", "Image deleted"),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/cars/{carId}/reviews": {
      get: operation({
        tags: ["Reviews"],
        summary: "List published reviews for a car",
        description: "No authentication. Only published reviews are returned.",
        auth: false,
        parameters: [pathParam("carId", "Car id."), page, limit],
        success: success("Reviews", {
          type: "object",
          required: ["reviews", "pagination"],
          properties: { reviews: { type: "array", items: ref("Review") }, pagination: paginationSchema },
        }),
        errors: ["422", "429", "500"],
      }),
    },
    "/api/v1/listings": {
      get: operation({
        tags: ["Listings"],
        summary: "List published listings",
        description: "No authentication. Only PUBLISHED listings that have not expired are returned.",
        auth: false,
        parameters: [
          query("search", { type: "string", maxLength: 100 }, "Search text."),
          query("type", { type: "string", enum: ["SALE", "RENT"] }, "Listing type."),
          query("brand", { type: "string", maxLength: 80 }, "Car brand."),
          query("model", { type: "string", maxLength: 80 }, "Car model."),
          query("location", { type: "string", maxLength: 120 }, "Car location."),
          query("minPrice", { type: "number", minimum: 0 }, "Minimum sale or daily price."),
          query("maxPrice", { type: "number", minimum: 0 }, "Maximum sale or daily price."),
          query("sortBy", { type: "string", enum: ["createdAt", "publishedAt", "title", "salePrice", "rentalDailyPrice"], default: "publishedAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Listings", {
          type: "object",
          required: ["listings", "pagination"],
          properties: { listings: { type: "array", items: ref("Listing") }, pagination: paginationSchema },
        }),
        errors: ["422", "429", "500"],
      }),
      post: operation({
        tags: ["Listings"],
        summary: "Create a listing",
        description: `${access("LISTING_CREATE", "the owner of the car")} The car must belong to the caller. ownerId is rejected. The client may send DRAFT or PENDING_MODERATION. DRAFT is saved without review. PENDING_MODERATION runs automatic checks: a clean listing is stored as PUBLISHED, a suspicious listing stays PENDING_MODERATION, and a rule violation is stored as REJECTED. The response includes moderation.reasons. Owners cannot set PUBLISHED directly. A sale listing requires salePrice and must not include rentalDailyPrice. A rental listing requires rentalDailyPrice and must not include salePrice.`,
        body: ref("CreateListingRequest"),
        bodyExample: {
          carId: carExample.id,
          type: "SALE",
          title: "Chevrolet Cobalt 2022",
          description: "Ready for sale.",
          salePrice: "15000.00",
        },
        status: 201,
        success: success("Listing created", dataSchema("listing", ref("Listing")), {
          success: true,
          message: "Listing created",
          data: { listing: listingExample },
        }),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/listings/{id}": {
      get: operation({
        tags: ["Listings"],
        summary: "Get listing details",
        description: "Published listings are public. The owner or staff can read their own unpublished listing. Anyone else receives 404.",
        auth: false,
        parameters: [pathParam("id", "Listing id.")],
        success: success("Listing", dataSchema("listing", ref("Listing"))),
        errors: ["404", "422", "429", "500"],
      }),
      patch: operation({
        tags: ["Listings"],
        summary: "Update a listing",
        description: `${access("LISTING_UPDATE", "the owner, an admin, or a super admin")} Owners cannot set PUBLISHED, SOLD, or RENTED. Sending PENDING_MODERATION runs the same automatic checks as create. A sold or rented listing is locked. Another user receives 404.`,
        parameters: [pathParam("id", "Listing id.")],
        body: ref("UpdateListingRequest"),
        success: success("Listing updated", dataSchema("listing", ref("Listing"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
      delete: operation({
        tags: ["Listings"],
        summary: "Delete a listing",
        description: `${access("LISTING_DELETE", "the owner, an admin, or a super admin")} Sold and rented listings cannot be deleted.`,
        parameters: [pathParam("id", "Listing id.")],
        success: message("Listing deleted", "Listing deleted"),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/my/listings": {
      get: operation({
        tags: ["Listings"],
        summary: "List my listings",
        description: access("LISTING_CREATE", "the listing owner"),
        parameters: [
          query("status", { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "PUBLISHED", "PAUSED", "SOLD", "RENTED", "REJECTED", "EXPIRED"] }, "Optional status filter."),
          query("sortBy", { type: "string", enum: ["createdAt", "updatedAt"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Own listings", {
          type: "object",
          required: ["listings", "pagination"],
          properties: { listings: { type: "array", items: ref("Listing") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases": {
      post: operation({
        tags: ["Purchases"],
        summary: "Buy a published car",
        description: `${access("SALE_CREATE", "a user who is not the car owner")} Body is only carId. The price is the published listing salePrice. The car becomes RESERVED. The sale listing stays PUBLISHED. A second open purchase returns 409.`,
        body: ref("CreatePurchaseRequest"),
        bodyExample: { carId: carExample.id },
        status: 201,
        success: success("Purchase created", dataSchema("purchase", ref("Purchase")), {
          success: true,
          message: "Purchase created",
          data: { purchase: purchaseExample },
        }),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases/{id}": {
      get: operation({
        tags: ["Purchases"],
        summary: "Get a purchase",
        description: `${access("SALE_READ", "the buyer or the seller")} Anyone else receives 404.`,
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases/{id}/confirm": {
      post: operation({
        tags: ["Purchases"],
        summary: "Confirm a purchase",
        description: `${access("SALE_CREATE", "the seller")} Moves PENDING to CONFIRMED.`,
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase confirmed", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases/{id}/cancel": {
      post: operation({
        tags: ["Purchases"],
        summary: "Cancel a purchase",
        description: `${access("SALE_CREATE", "the buyer or the seller")} Allowed from PENDING or CONFIRMED. The car becomes AVAILABLE. An unexpired sale listing becomes PUBLISHED.`,
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase cancelled", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases/{id}/pay": {
      post: operation({
        tags: ["Purchases"],
        summary: "Pay a confirmed purchase",
        description: `${access("SALE_CREATE", "the buyer")} Moves CONFIRMED to PAID. The amount is the purchase price already stored.`,
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase paid", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/purchases/{id}/complete": {
      post: operation({
        tags: ["Purchases"],
        summary: "Complete a paid purchase",
        description: `${access("SALE_CREATE", "the seller")} Moves PAID to COMPLETED. The car and the sale listing both become SOLD.`,
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase completed", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/my/purchases": {
      get: operation({
        tags: ["Purchases"],
        summary: "List my purchases",
        description: access("SALE_READ", "the buyer"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] }, "Optional status."),
          query("sortBy", { type: "string", enum: ["createdAt", "price"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Own purchases", {
          type: "object",
          required: ["purchases", "pagination"],
          properties: { purchases: { type: "array", items: ref("Purchase") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/my/sales": {
      get: operation({
        tags: ["Purchases"],
        summary: "List my sales",
        description: access("SALE_READ", "the seller"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] }, "Optional status."),
          query("sortBy", { type: "string", enum: ["createdAt", "price"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Own sales", {
          type: "object",
          required: ["purchases", "pagination"],
          properties: { purchases: { type: "array", items: ref("Purchase") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/rentals": {
      post: operation({
        tags: ["Rentals"],
        summary: "Publish a rental listing",
        description: `${access("RENTAL_CREATE", "the car owner")} Creates a RENT listing and runs automatic checks. A clean listing is PUBLISHED. A suspicious listing stays PENDING_MODERATION for admin review. A rule violation is REJECTED and moderation.reasons explains why. The daily price is dailyPrice. ownerId is rejected. Title is generated from the car.`,
        body: ref("PublishRentalRequest"),
        status: 201,
        success: success("Rental submitted for moderation", dataSchema("listing", ref("RentalListing")), {
          success: true,
          message: "Rental submitted for moderation",
          data: {
            listing: {
              id: listingExample.id,
              carId: carExample.id,
              ownerId: userExample.id,
              description: "Daily rental in Tashkent.",
              dailyPrice: "40.00",
              location: "Tashkent",
              availableUntil: "2026-12-31",
              status: "PENDING_MODERATION",
            },
          },
        }),
        errors: ["400", "401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/my/rentals": {
      get: operation({
        tags: ["Rentals"],
        summary: "List rental requests for my cars",
        description: access("RENTAL_READ", "the car owner"),
        parameters: [
          query("sortBy", { type: "string", enum: ["createdAt", "startDate"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Own rental requests", {
          type: "object",
          required: ["bookings", "pagination"],
          properties: { bookings: { type: "array", items: ref("RentalBooking") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/bookings": {
      post: operation({
        tags: ["Bookings"],
        summary: "Request a rental booking",
        description: `${access("BOOKING_CREATE", "a user who is not the car owner")} Body is carId, startDate, and endDate as YYYY-MM-DD. numberOfDays, dailyPrice, and totalPrice are calculated from the published rental listing. Dates are half-open: 1 October through 5 October is 4 days. startDate cannot be before today UTC. A confirmed or active overlap returns 409.`,
        body: ref("CreateBookingRequest"),
        bodyExample: { carId: carExample.id, startDate: "2026-10-01", endDate: "2026-10-05" },
        status: 201,
        success: success("Booking requested", dataSchema("booking", ref("RentalBooking")), {
          success: true,
          message: "Booking requested",
          data: { booking: bookingExample },
        }),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/bookings/{id}/confirm": {
      post: operation({
        tags: ["Bookings"],
        summary: "Confirm a booking",
        description: `${access("BOOKING_UPDATE", "the car owner")} Moves PENDING to CONFIRMED after rechecking overlap and an open purchase. The renter receives 403. A stranger receives 404.`,
        parameters: [pathParam("id", "Booking id.")],
        success: success("Booking confirmed", dataSchema("booking", ref("RentalBooking"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/bookings/{id}/reject": {
      post: operation({
        tags: ["Bookings"],
        summary: "Reject a booking",
        description: `${access("BOOKING_UPDATE", "the car owner")} Moves PENDING to REJECTED and cancels an open payment.`,
        parameters: [pathParam("id", "Booking id.")],
        success: success("Booking rejected", dataSchema("booking", ref("RentalBooking"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/bookings/{id}/cancel": {
      post: operation({
        tags: ["Bookings"],
        summary: "Cancel a booking",
        description: `${access("BOOKING_UPDATE", "the renter or the owner")} Allowed from PENDING or CONFIRMED. If no CONFIRMED or ACTIVE booking remains, a rented car becomes AVAILABLE and its rental listing becomes PUBLISHED.`,
        parameters: [pathParam("id", "Booking id.")],
        success: success("Booking cancelled", dataSchema("booking", ref("RentalBooking"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/bookings/{id}/complete": {
      post: operation({
        tags: ["Bookings"],
        summary: "Complete an active booking",
        description: `${access("BOOKING_UPDATE", "the car owner")} Moves ACTIVE to COMPLETED. The renter receives 403. A stranger receives 404. If no other CONFIRMED or ACTIVE booking remains, the car becomes AVAILABLE and the rental listing becomes PUBLISHED.`,
        parameters: [pathParam("id", "Booking id.")],
        success: success("Booking completed", dataSchema("booking", ref("RentalBooking"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/my/bookings": {
      get: operation({
        tags: ["Bookings"],
        summary: "List my booking requests",
        description: access("BOOKING_CREATE", "the renter"),
        parameters: [
          query("sortBy", { type: "string", enum: ["createdAt", "startDate"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Own bookings", {
          type: "object",
          required: ["bookings", "pagination"],
          properties: { bookings: { type: "array", items: ref("RentalBooking") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/payments": {
      post: operation({
        tags: ["Payments"],
        summary: "Create a payment",
        description: `${access("PAYMENT_READ", "the buyer or the confirmed renter")} Provide purchaseId or bookingId, not both. amount, currency, userId, cardNumber, and cvv are rejected. The amount is copied from the purchase or booking. Currency is UZS. A purchase payment is already created with the purchase, so a second one returns 409.`,
        body: ref("CreatePaymentRequest"),
        status: 201,
        success: success("Payment created", dataSchema("payment", ref("Payment"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/payments/{id}": {
      get: operation({
        tags: ["Payments"],
        summary: "Get a payment",
        description: `${access("PAYMENT_READ", "the payer, an admin, or a super admin")} Anyone else receives 404.`,
        parameters: [pathParam("id", "Payment id.")],
        success: success("Payment", dataSchema("payment", ref("Payment"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/payments/{id}/pay": {
      post: operation({
        tags: ["Payments"],
        summary: "Pay a pending payment",
        description: `${access("PAYMENT_READ", "the payer")} A purchase must be CONFIRMED. A confirmed booking becomes ACTIVE, the car becomes RENTED, and the rental listing becomes RENTED. The amount is not taken from the client.`,
        parameters: [pathParam("id", "Payment id.")],
        success: success("Payment completed", dataSchema("payment", ref("Payment"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/payments/{id}/cancel": {
      post: operation({
        tags: ["Payments"],
        summary: "Cancel a payment",
        description: `${access("PAYMENT_READ", "the payer")} Cancels the open payment and the related purchase or confirmed booking.`,
        parameters: [pathParam("id", "Payment id.")],
        success: success("Payment cancelled", dataSchema("payment", ref("Payment"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/my/payments": {
      get: operation({
        tags: ["Payments"],
        summary: "List my payments",
        description: access("PAYMENT_READ", "the payer"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] }, "Optional status."),
          page,
          limit,
        ],
        success: success("Own payments", {
          type: "object",
          required: ["payments", "pagination"],
          properties: { payments: { type: "array", items: ref("Payment") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/favorites": {
      get: operation({
        tags: ["Favorites"],
        summary: "List my favorites",
        description: access("FAVORITE_MANAGE", "the authenticated user"),
        parameters: [page, limit],
        success: success("Favorites", {
          type: "object",
          required: ["favorites", "pagination"],
          properties: { favorites: { type: "array", items: ref("Favorite") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/favorites/{carId}": {
      post: operation({
        tags: ["Favorites"],
        summary: "Save a car",
        description: `${access("FAVORITE_MANAGE", "the authenticated user")} A duplicate returns 409.`,
        parameters: [pathParam("carId", "Car id.")],
        status: 201,
        success: success("Favorite saved", dataSchema("favorite", ref("Favorite"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
      delete: operation({
        tags: ["Favorites"],
        summary: "Remove a saved car",
        description: `${access("FAVORITE_MANAGE", "the authenticated user")} Another user's favorite returns 404.`,
        parameters: [pathParam("carId", "Car id.")],
        success: message("Favorite removed", "Car removed from favorites"),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/reviews": {
      post: operation({
        tags: ["Reviews"],
        summary: "Review a completed purchase or rental",
        description: `${access("REVIEW_CREATE", "a participant in the completed transaction")} Rating is an integer from 1 to 5. Comment is 1 to 2000 characters. Provide purchaseId or bookingId, not both. A purchase review requires a COMPLETED purchase. A booking review requires a COMPLETED booking. You cannot review yourself. A second review of the same transaction returns 409.`,
        body: ref("CreateReviewRequest"),
        status: 201,
        success: success("Review published", dataSchema("review", ref("Review"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/notifications": {
      get: operation({
        tags: ["Notifications"],
        summary: "List my notifications",
        description: access("NOTIFICATION_READ", "the authenticated user"),
        parameters: [
          query("unread", { type: "string", enum: ["true", "false"] }, "When true, only unread notifications are returned."),
          page,
          limit,
        ],
        success: success("Notifications", {
          type: "object",
          required: ["notifications", "pagination"],
          properties: { notifications: { type: "array", items: ref("Notification") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/notifications/read-all": {
      patch: operation({
        tags: ["Notifications"],
        summary: "Mark all my notifications as read",
        description: access("NOTIFICATION_READ", "the authenticated user"),
        success: success("Notifications marked as read", {
          type: "object",
          required: ["updated"],
          properties: { updated: { type: "integer", minimum: 0, description: "How many unread notifications were marked read." } },
        }, {
          success: true,
          message: "Notifications marked as read",
          data: { updated: 3 },
        }),
        errors: ["401", "403", "429", "500"],
      }),
    },
    "/api/v1/notifications/{id}/read": {
      patch: operation({
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        description: `${access("NOTIFICATION_READ", "the notification owner")} Another user's notification returns 404.`,
        parameters: [pathParam("id", "Notification id.")],
        success: success("Notification marked as read", dataSchema("notification", ref("Notification"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/reports": {
      post: operation({
        tags: ["Reports"],
        summary: "Submit a report",
        description: "Authentication required. Any active user. Report exactly one of carId, listingId, userId, or reviewId. status and reporterId are rejected. The status is always OPEN.",
        body: ref("CreateReportRequest"),
        status: 201,
        success: success("Report submitted", dataSchema("report", ref("Report"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
      get: operation({
        tags: ["Reports"],
        summary: "List my reports",
        description: "Authentication required. Returns only reports created by the caller.",
        parameters: [
          query("status", { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] }, "Optional status."),
          page,
          limit,
        ],
        success: success("Own reports", {
          type: "object",
          required: ["reports", "pagination"],
          properties: { reports: { type: "array", items: ref("Report") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/reports/{id}": {
      get: operation({
        tags: ["Reports"],
        summary: "Get my report",
        description: "Authentication required. A report created by someone else returns 404. Users cannot change the moderation status.",
        parameters: [pathParam("id", "Report id.")],
        success: success("Report", dataSchema("report", ref("Report"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/listings/pending": {
      get: operation({
        tags: ["Admin Moderation"],
        summary: "List listings waiting for review",
        description: access("LISTING_MODERATE", "a moderator, admin, or super admin"),
        parameters: [
          query("sortOrder", { type: "string", enum: ["asc", "desc"], default: "asc" }, "Sort by createdAt."),
          page,
          limit,
        ],
        success: success("Pending listings", {
          type: "object",
          required: ["listings", "pagination"],
          properties: { listings: { type: "array", items: ref("Listing") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/listings/{id}/approve": {
      post: operation({
        tags: ["Admin Moderation"],
        summary: "Approve a listing",
        description: `${access("LISTING_MODERATE", "a moderator, admin, or super admin")} Moves PENDING_MODERATION to PUBLISHED.`,
        parameters: [pathParam("id", "Listing id.")],
        success: success("Listing approved", dataSchema("listing", ref("Listing"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/listings/{id}/reject": {
      post: operation({
        tags: ["Admin Moderation"],
        summary: "Reject a listing",
        description: `${access("LISTING_MODERATE", "a moderator, admin, or super admin")} reason is required, from 3 to 500 characters.`,
        parameters: [pathParam("id", "Listing id.")],
        body: ref("RejectListingRequest"),
        success: success("Listing rejected", dataSchema("listing", ref("Listing"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/reports": {
      get: operation({
        tags: ["Admin Reports"],
        summary: "List reports for staff",
        description: access("REPORT_READ", "a moderator, admin, or super admin"),
        parameters: [
          query("status", { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] }, "Optional status."),
          page,
          limit,
        ],
        success: success("Reports", {
          type: "object",
          required: ["reports", "pagination"],
          properties: { reports: { type: "array", items: ref("Report") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/reports/{id}": {
      patch: operation({
        tags: ["Admin Reports"],
        summary: "Update a report status",
        description: `${access("REPORT_MODERATE", "a moderator, admin, or super admin")} OPEN can move to IN_REVIEW, RESOLVED, or REJECTED. IN_REVIEW can move to RESOLVED or REJECTED. RESOLVED and REJECTED are final. A normal user receives 403.`,
        parameters: [pathParam("id", "Report id.")],
        body: ref("UpdateReportRequest"),
        success: success("Report updated", dataSchema("report", ref("Report"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/dashboard": {
      get: operation({
        tags: ["Admin Dashboard"],
        summary: "Marketplace dashboard",
        description: `${access("DASHBOARD_READ", "an admin or super admin")} Counts and revenue are calculated in PostgreSQL. Revenue is completed purchase prices plus completed booking totals. Recent lists omit password hashes. A moderator receives 403.`,
        success: success("Dashboard", dataSchema("dashboard", ref("Dashboard")), {
          success: true,
          message: "Dashboard",
          data: { dashboard: dashboardExample },
        }),
        errors: ["401", "403", "429", "500"],
      }),
    },
    "/api/v1/admin/analytics/sales": {
      get: operation({
        tags: ["Admin Dashboard"],
        summary: "Sales analytics",
        description: `${access("DASHBOARD_READ", "an admin or super admin")} period is 7d, 30d, 90d, or 1y. Empty buckets are zero.`,
        parameters: [query("period", { type: "string", enum: ["7d", "30d", "90d", "1y"], default: "30d" }, "Aggregation window.")],
        success: success("Sales series", ref("AnalyticsSeries")),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/analytics/rentals": {
      get: operation({
        tags: ["Admin Dashboard"],
        summary: "Rental analytics",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [query("period", { type: "string", enum: ["7d", "30d", "90d", "1y"], default: "30d" }, "Aggregation window.")],
        success: success("Rental series", ref("AnalyticsSeries")),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/analytics/users": {
      get: operation({
        tags: ["Admin Dashboard"],
        summary: "New user analytics",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [query("period", { type: "string", enum: ["7d", "30d", "90d", "1y"], default: "30d" }, "Aggregation window.")],
        success: success("User series", ref("CountSeries")),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/analytics/revenue": {
      get: operation({
        tags: ["Admin Dashboard"],
        summary: "Revenue analytics",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [query("period", { type: "string", enum: ["7d", "30d", "90d", "1y"], default: "30d" }, "Aggregation window.")],
        success: success("Revenue series", ref("RevenueSeries")),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/users": {
      get: operation({
        tags: ["Admin Users"],
        summary: "List users",
        description: `${access("USER_READ", "an admin or super admin")} Password hashes are omitted.`,
        parameters: [
          query("search", { type: "string", maxLength: 100 }, "Search name or email."),
          query("role", { type: "string", enum: ["SUPER_ADMIN", "ADMIN", "MODERATOR", "USER"] }, "Role filter."),
          query("status", { type: "string", enum: ["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING"] }, "Status filter."),
          query("sortBy", { type: "string", enum: ["createdAt", "updatedAt", "email", "firstName", "lastName", "role", "status"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Users", {
          type: "object",
          required: ["users", "pagination"],
          properties: { users: { type: "array", items: ref("User") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/users/{id}": {
      get: operation({
        tags: ["Admin Users"],
        summary: "Get a user",
        description: access("USER_READ", "an admin or super admin"),
        parameters: [pathParam("id", "User id.")],
        success: success("User", dataSchema("user", ref("User"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/users/{id}/status": {
      patch: operation({
        tags: ["Admin Users"],
        summary: "Change a user status",
        description: `${access("USER_BLOCK", "an admin or super admin")} Body is status only. Role cannot be set. An admin can change USER and MODERATOR accounts. Nobody can change their own status. Changing a higher role returns 403 ROLE_ESCALATION.`,
        parameters: [pathParam("id", "User id.")],
        body: ref("UpdateUserStatusRequest"),
        success: success("Status updated", dataSchema("user", ref("User"))),
        errors: ["400", "401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/cars": {
      get: operation({
        tags: ["Admin Cars"],
        summary: "List cars for administrators",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [
          query("search", { type: "string", maxLength: 100 }, "Search text."),
          query("brand", { type: "string", maxLength: 80 }, "Brand."),
          query("status", { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE", "REJECTED"] }, "Any car status."),
          query("location", { type: "string", maxLength: 120 }, "Location."),
          page,
          limit,
        ],
        success: success("Cars", {
          type: "object",
          required: ["cars", "pagination"],
          properties: { cars: { type: "array", items: ref("AdminCar") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/listings": {
      get: operation({
        tags: ["Admin Listings"],
        summary: "List listings for administrators",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [
          query("status", { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "PUBLISHED", "PAUSED", "SOLD", "RENTED", "REJECTED", "EXPIRED"] }, "Listing status."),
          query("type", { type: "string", enum: ["SALE", "RENT"] }, "Listing type."),
          query("owner", { type: "string", format: "uuid" }, "Owner user id."),
          page,
          limit,
        ],
        success: success("Listings", {
          type: "object",
          required: ["listings", "pagination"],
          properties: { listings: { type: "array", items: ref("AdminListing") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/bookings": {
      get: operation({
        tags: ["Admin Rentals"],
        summary: "List rental bookings",
        description: access("DASHBOARD_READ", "an admin or super admin"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "REJECTED"] }, "Booking status."),
          page,
          limit,
        ],
        success: success("Bookings", {
          type: "object",
          required: ["bookings", "pagination"],
          properties: { bookings: { type: "array", items: ref("AdminBooking") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/sales": {
      get: operation({
        tags: ["Admin Sales"],
        summary: "List all purchases",
        description: access("SALE_READ", "an admin or super admin"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] }, "Purchase status."),
          query("sortBy", { type: "string", enum: ["createdAt", "price"], default: "createdAt" }, "Allowlisted sort field."),
          sortOrder,
          page,
          limit,
        ],
        success: success("Sales", {
          type: "object",
          required: ["purchases", "pagination"],
          properties: { purchases: { type: "array", items: ref("Purchase") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/sales/{id}": {
      get: operation({
        tags: ["Admin Sales"],
        summary: "Get any purchase",
        description: access("SALE_READ", "an admin or super admin"),
        parameters: [pathParam("id", "Purchase id.")],
        success: success("Purchase", dataSchema("purchase", ref("Purchase"))),
        errors: ["401", "403", "404", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/sales/{id}/status": {
      patch: operation({
        tags: ["Admin Sales"],
        summary: "Change a purchase status",
        description: `${access("SALE_READ", "an admin or super admin")} Follows the purchase status graph. Payment, car, and listing updates happen in the same transaction.`,
        parameters: [pathParam("id", "Purchase id.")],
        body: ref("UpdatePurchaseStatusRequest"),
        success: success("Purchase updated", dataSchema("purchase", ref("Purchase"))),
        errors: ["400", "401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/payments": {
      get: operation({
        tags: ["Admin Payments"],
        summary: "List payments",
        description: access("PAYMENT_READ", "an admin or super admin"),
        parameters: [
          query("status", { type: "string", enum: ["PENDING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] }, "Payment status."),
          page,
          limit,
        ],
        success: success("Payments", {
          type: "object",
          required: ["payments", "pagination"],
          properties: { payments: { type: "array", items: ref("Payment") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/payments/{id}/refund": {
      post: operation({
        tags: ["Admin Payments"],
        summary: "Refund a purchase payment",
        description: `${access("PAYMENT_READ", "an admin or super admin")} Refunds a paid or completed purchase. The car becomes AVAILABLE. An unexpired sale listing becomes PUBLISHED. A normal user receives 403.`,
        parameters: [pathParam("id", "Payment id.")],
        success: success("Payment refunded", dataSchema("payment", ref("Payment"))),
        errors: ["401", "403", "404", "409", "422", "429", "500"],
      }),
    },
    "/api/v1/admin/audit-logs": {
      get: operation({
        tags: ["Admin Audit"],
        summary: "List audit logs",
        description: `${access("AUDIT_READ", "an admin or super admin")} A moderator receives 403. Results are always paginated. Filters are actor, action, resource, and a createdAt range.`,
        parameters: [
          query("actor", { type: "string", format: "uuid" }, "Actor user id."),
          query("action", { type: "string", enum: ["LOGIN", "LOGOUT", "USER_CREATED", "USER_UPDATED", "USER_BLOCKED", "CAR_CREATED", "CAR_UPDATED", "CAR_DELETED", "LISTING_CREATED", "LISTING_APPROVED", "LISTING_REJECTED", "PURCHASE_CREATED", "BOOKING_CREATED", "BOOKING_CONFIRMED", "BOOKING_CANCELLED", "PAYMENT_UPDATED", "ADMIN_ACTION"] }, "Audit action."),
          query("resource", { type: "string", maxLength: 80 }, "Resource name, such as car, listing, purchase, booking, payment, user, or report."),
          query("from", { type: "string", format: "date-time" }, "Inclusive range start."),
          query("to", { type: "string", format: "date-time" }, "Inclusive range end. Must be greater than or equal to from."),
          page,
          limit,
        ],
        success: success("Audit logs", {
          type: "object",
          required: ["logs", "pagination"],
          properties: { logs: { type: "array", items: ref("AuditLog") }, pagination: paginationSchema },
        }),
        errors: ["401", "403", "422", "429", "500"],
      }),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token from login or refresh. The refresh token is an HttpOnly cookie and is not sent here.",
      },
    },
    responses: {
      BadRequest: json("Malformed JSON", ref("ErrorResponse"), {
        success: false,
        message: "Malformed JSON body",
        code: "MALFORMED_JSON",
      }),
      Unauthorized: json("Missing or invalid access token, or an invalid refresh session", ref("ErrorResponse"), {
        success: false,
        message: "Authentication required",
        code: "UNAUTHORIZED",
      }),
      Forbidden: json("Authenticated, but the role or permission does not allow this action", ref("ErrorResponse"), {
        success: false,
        message: "You do not have access to this resource",
        code: "FORBIDDEN",
      }),
      NotFound: json("The resource does not exist, or it belongs to someone else", ref("ErrorResponse"), {
        success: false,
        message: "Resource not found",
        code: "NOT_FOUND",
      }),
      Conflict: json("The state change or unique value is not allowed", ref("ErrorResponse"), {
        success: false,
        message: "This status change is not allowed",
        code: "INVALID_STATUS_TRANSITION",
      }),
      ValidationError: json("The body, query, or path failed validation", ref("ErrorResponse"), {
        success: false,
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: [{ path: "price", message: "Enter a valid amount" }],
      }),
      TooManyRequests: json("The IP exceeded the rate limit", ref("ErrorResponse"), {
        success: false,
        message: "Too many requests",
        code: "RATE_LIMITED",
      }),
      UnsupportedMedia: json("Cookie session routes require Content-Type: application/json", ref("ErrorResponse"), {
        success: false,
        message: "JSON content type is required",
        code: "UNSUPPORTED_MEDIA_TYPE",
      }),
      InternalError: json("Unexpected server error. No connection string or stack trace is returned.", ref("ErrorResponse"), {
        success: false,
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      }),
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: { type: "boolean", enum: [true] },
          message: { type: "string" },
        },
      },
      MessageResponse: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: { type: "boolean", enum: [true] },
          message: { type: "string", example: "Logged out" },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["success", "message"],
        properties: {
          success: { type: "boolean", enum: [true] },
          message: { type: "string", example: "API is healthy" },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["success", "message", "code"],
        properties: {
          success: { type: "boolean", enum: [false] },
          message: { type: "string" },
          code: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              required: ["path", "message"],
              properties: {
                path: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      User: {
        type: "object",
        description: "Account visible to its owner or to an administrator. Password hashes are never included.",
        required: ["id", "email", "phone", "firstName", "lastName", "role", "status", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          phone: { type: "string", example: "+998901234567" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          avatar: { type: "string", nullable: true },
          role: { type: "string", enum: ["SUPER_ADMIN", "ADMIN", "MODERATOR", "USER"] },
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        example: userExample,
      },
      PublicPerson: {
        type: "object",
        required: ["id", "firstName", "lastName"],
        properties: {
          id: { type: "string", format: "uuid" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          avatar: { type: "string", nullable: true },
        },
      },
      CarImage: {
        type: "object",
        required: ["id", "url", "sortOrder"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          url: { type: "string", example: "/uploads/car-images/3cd28a41-e28b-4ae0-a41d-7fddd181c509.png" },
          sortOrder: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Car: {
        type: "object",
        required: ["id", "ownerId", "brand", "model", "year", "price", "status", "owner"],
        properties: {
          id: { type: "string", format: "uuid" },
          ownerId: { type: "string", format: "uuid" },
          brand: { type: "string" },
          model: { type: "string" },
          year: { type: "integer" },
          price: money,
          dailyRentalPrice: { ...money, nullable: true },
          mileage: { type: "integer" },
          fuelType: { type: "string", enum: ["PETROL", "DIESEL", "GAS", "HYBRID", "ELECTRIC"] },
          transmission: { type: "string", enum: ["MANUAL", "AUTOMATIC"] },
          bodyType: { type: "string", enum: ["SEDAN", "HATCHBACK", "SUV", "COUPE", "WAGON", "MINIVAN", "PICKUP", "VAN", "CONVERTIBLE"] },
          color: { type: "string" },
          engine: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          images: { type: "array", items: ref("CarImage") },
          owner: ref("PublicPerson"),
        },
        example: carExample,
      },
      Listing: {
        type: "object",
        required: ["id", "carId", "ownerId", "type", "status", "title", "description"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          ownerId: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["SALE", "RENT"] },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "PUBLISHED", "PAUSED", "SOLD", "RENTED", "REJECTED", "EXPIRED"] },
          salePrice: { ...money, nullable: true },
          rentalDailyPrice: { ...money, nullable: true },
          title: { type: "string" },
          description: { type: "string" },
          publishedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          car: { type: "object" },
          owner: ref("PublicPerson"),
        },
        example: listingExample,
      },
      Purchase: {
        type: "object",
        required: ["id", "carId", "buyerId", "sellerId", "price", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          buyerId: { type: "string", format: "uuid" },
          sellerId: { type: "string", format: "uuid" },
          price: money,
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          car: { type: "object" },
          buyer: ref("PublicPerson"),
          seller: ref("PublicPerson"),
          payment: { type: "object", nullable: true },
        },
        example: purchaseExample,
      },
      RentalBooking: {
        type: "object",
        required: ["id", "carId", "renterId", "ownerId", "startDate", "endDate", "numberOfDays", "dailyPrice", "totalPrice", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          renterId: { type: "string", format: "uuid" },
          ownerId: { type: "string", format: "uuid" },
          startDate: { type: "string", format: "date", example: "2026-10-01" },
          endDate: { type: "string", format: "date", example: "2026-10-05" },
          numberOfDays: { type: "integer", example: 4 },
          dailyPrice: money,
          totalPrice: money,
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          car: { type: "object" },
          renter: ref("PublicPerson"),
          owner: ref("PublicPerson"),
        },
        example: bookingExample,
      },
      Payment: {
        type: "object",
        required: ["id", "userId", "amount", "currency", "status", "provider"],
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          purchaseId: { type: "string", format: "uuid", nullable: true },
          bookingId: { type: "string", format: "uuid", nullable: true },
          amount: money,
          currency: { type: "string", example: "UZS" },
          status: { type: "string", enum: ["PENDING", "PROCESSING", "PAID", "FAILED", "CANCELLED", "REFUNDED"] },
          provider: { type: "string", example: "manual" },
          providerTransactionId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Favorite: {
        type: "object",
        required: ["id", "carId", "createdAt", "car"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          createdAt: { type: "string", format: "date-time" },
          car: { type: "object" },
        },
      },
      Review: {
        type: "object",
        required: ["id", "carId", "rating", "comment", "author"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          comment: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          author: ref("PublicPerson"),
        },
      },
      Notification: {
        type: "object",
        required: ["id", "type", "title", "message", "read", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["SYSTEM", "LISTING", "MODERATION", "PURCHASE", "SALE", "BOOKING", "RENTAL"] },
          title: { type: "string" },
          message: { type: "string" },
          read: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Report: {
        type: "object",
        required: ["id", "reporterId", "reason", "description", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          reporterId: { type: "string", format: "uuid" },
          targetUserId: { type: "string", format: "uuid", nullable: true },
          carId: { type: "string", format: "uuid", nullable: true },
          listingId: { type: "string", format: "uuid", nullable: true },
          reviewId: { type: "string", format: "uuid", nullable: true },
          reason: { type: "string", maxLength: 120 },
          description: { type: "string" },
          status: { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AuditLog: {
        type: "object",
        required: ["id", "action", "resource", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          actorId: { type: "string", format: "uuid", nullable: true },
          action: { type: "string" },
          resource: { type: "string" },
          resourceId: { type: "string", nullable: true },
          metadata: { type: "object", additionalProperties: true },
          ip: { type: "string", nullable: true },
          userAgent: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          actor: { allOf: [ref("PublicPerson")], nullable: true },
        },
      },
      LoginResult: {
        type: "object",
        required: ["accessToken", "user"],
        properties: {
          accessToken: { type: "string", description: "Short-lived JWT. Send it as Authorization: Bearer." },
          user: ref("User"),
        },
      },
      RegisterRequest: {
        type: "object",
        additionalProperties: false,
        required: ["email", "phone", "password", "firstName", "lastName"],
        properties: {
          email: { type: "string", format: "email" },
          phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$", example: "+998901234567" },
          password: { type: "string", format: "password", minLength: 8, maxLength: 128 },
          firstName: { type: "string", minLength: 1, maxLength: 100 },
          lastName: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
      LoginRequest: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password", minLength: 1, maxLength: 128 },
        },
      },
      UpdateProfileRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          email: { type: "string", format: "email" },
          phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$" },
          firstName: { type: "string", maxLength: 100 },
          lastName: { type: "string", maxLength: 100 },
          avatar: { type: "string", nullable: true, description: "https URL or a path beginning with /uploads/." },
        },
      },
      UpdateUserStatusRequest: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["ACTIVE", "SUSPENDED", "BLOCKED", "PENDING"] },
        },
      },
      CreateCarRequest: {
        type: "object",
        additionalProperties: false,
        required: ["brand", "model", "year", "price", "mileage", "fuelType", "transmission", "bodyType", "color", "engine", "description", "location"],
        properties: {
          brand: { type: "string", maxLength: 80 },
          model: { type: "string", maxLength: 80 },
          year: { type: "integer", minimum: 1950 },
          price: money,
          dailyRentalPrice: { ...money, nullable: true },
          mileage: { type: "integer", minimum: 0, maximum: 2000000 },
          fuelType: { type: "string", enum: ["PETROL", "DIESEL", "GAS", "HYBRID", "ELECTRIC"] },
          transmission: { type: "string", enum: ["MANUAL", "AUTOMATIC"] },
          bodyType: { type: "string", enum: ["SEDAN", "HATCHBACK", "SUV", "COUPE", "WAGON", "MINIVAN", "PICKUP", "VAN", "CONVERTIBLE"] },
          color: { type: "string", maxLength: 40 },
          engine: { type: "string", maxLength: 80 },
          description: { type: "string", maxLength: 5000 },
          location: { type: "string", maxLength: 120 },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "INACTIVE"] },
        },
      },
      ReorderCarImagesRequest: {
        type: "object",
        additionalProperties: false,
        required: ["imageIds"],
        properties: {
          imageIds: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            uniqueItems: true,
            items: { type: "string", format: "uuid" },
            description: "Every image id for the car, in the desired order. Index 0 is the main image.",
          },
        },
      },
      UpdateCarRequest: {
        type: "object",
        additionalProperties: false,
        description: "At least one field is required.",
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          year: { type: "integer" },
          price: money,
          dailyRentalPrice: { ...money, nullable: true },
          mileage: { type: "integer" },
          fuelType: { type: "string", enum: ["PETROL", "DIESEL", "GAS", "HYBRID", "ELECTRIC"] },
          transmission: { type: "string", enum: ["MANUAL", "AUTOMATIC"] },
          bodyType: { type: "string" },
          color: { type: "string" },
          engine: { type: "string" },
          description: { type: "string" },
          location: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "INACTIVE"] },
        },
      },
      CreateListingRequest: {
        type: "object",
        additionalProperties: false,
        required: ["carId", "type", "title", "description"],
        properties: {
          carId: { type: "string", format: "uuid" },
          type: { type: "string", enum: ["SALE", "RENT"] },
          title: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 5000 },
          salePrice: money,
          rentalDailyPrice: money,
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION"] },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      UpdateListingRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 5000 },
          salePrice: { ...money, nullable: true },
          rentalDailyPrice: { ...money, nullable: true },
          status: { type: "string", description: "Owners cannot set PUBLISHED, SOLD, or RENTED." },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      CreatePurchaseRequest: {
        type: "object",
        additionalProperties: false,
        required: ["carId"],
        properties: { carId: { type: "string", format: "uuid" } },
      },
      UpdatePurchaseStatusRequest: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] },
        },
      },
      PublishRentalRequest: {
        type: "object",
        additionalProperties: false,
        required: ["carId", "description", "dailyPrice"],
        properties: {
          carId: { type: "string", format: "uuid" },
          description: { type: "string", maxLength: 5000 },
          dailyPrice: money,
          location: { type: "string", maxLength: 120 },
          availableUntil: { type: "string", format: "date", description: "YYYY-MM-DD." },
        },
      },
      RentalListing: {
        type: "object",
        required: ["id", "carId", "ownerId", "description", "dailyPrice", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          carId: { type: "string", format: "uuid" },
          ownerId: { type: "string", format: "uuid" },
          description: { type: "string" },
          dailyPrice: money,
          location: { type: "string" },
          availableUntil: { type: "string", format: "date", nullable: true },
          status: { type: "string" },
        },
      },
      CreateBookingRequest: {
        type: "object",
        additionalProperties: false,
        required: ["carId", "startDate", "endDate"],
        properties: {
          carId: { type: "string", format: "uuid" },
          startDate: { type: "string", format: "date", example: "2026-10-01" },
          endDate: { type: "string", format: "date", example: "2026-10-05" },
        },
      },
      CreatePaymentRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          purchaseId: { type: "string", format: "uuid" },
          bookingId: { type: "string", format: "uuid" },
        },
      },
      CreateReviewRequest: {
        type: "object",
        additionalProperties: false,
        required: ["rating", "comment"],
        properties: {
          rating: { type: "integer", minimum: 1, maximum: 5 },
          comment: { type: "string", minLength: 1, maxLength: 2000 },
          purchaseId: { type: "string", format: "uuid" },
          bookingId: { type: "string", format: "uuid" },
        },
      },
      CreateReportRequest: {
        type: "object",
        additionalProperties: false,
        required: ["reason", "description"],
        properties: {
          reason: { type: "string", minLength: 3, maxLength: 120 },
          description: { type: "string", minLength: 1, maxLength: 5000 },
          carId: { type: "string", format: "uuid" },
          listingId: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid", description: "The reported user. Not the reporter." },
          reviewId: { type: "string", format: "uuid" },
        },
      },
      UpdateReportRequest: {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"] },
        },
      },
      RejectListingRequest: {
        type: "object",
        additionalProperties: false,
        required: ["reason"],
        properties: { reason: { type: "string", minLength: 3, maxLength: 500 } },
      },
      AdminCar: {
        type: "object",
        required: ["id", "brand", "model", "year", "price", "location", "status", "createdAt", "owner"],
        properties: {
          id: { type: "string", format: "uuid" },
          brand: { type: "string" },
          model: { type: "string" },
          year: { type: "integer" },
          price: money,
          location: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
          owner: ref("PublicPerson"),
        },
        description: "Directory row from GET /api/v1/admin/cars. It is not the full public car.",
      },
      AdminListing: {
        type: "object",
        required: ["id", "title", "type", "status", "createdAt", "owner", "car"],
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          type: { type: "string", enum: ["SALE", "RENT"] },
          status: { type: "string", enum: ["DRAFT", "PENDING_MODERATION", "PUBLISHED", "PAUSED", "SOLD", "RENTED", "REJECTED", "EXPIRED"] },
          createdAt: { type: "string", format: "date-time" },
          owner: ref("PublicPerson"),
          car: {
            type: "object",
            required: ["id", "brand", "model"],
            properties: {
              id: { type: "string", format: "uuid" },
              brand: { type: "string" },
              model: { type: "string" },
            },
          },
        },
        description: "Directory row from GET /api/v1/admin/listings and a recent listing on the dashboard.",
      },
      AdminBooking: {
        type: "object",
        required: ["id", "status", "startDate", "endDate", "totalPrice", "createdAt", "car", "renter", "owner"],
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "REJECTED"] },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          totalPrice: money,
          createdAt: { type: "string", format: "date-time" },
          car: {
            type: "object",
            required: ["id", "brand", "model"],
            properties: {
              id: { type: "string", format: "uuid" },
              brand: { type: "string" },
              model: { type: "string" },
            },
          },
          renter: ref("PublicPerson"),
          owner: ref("PublicPerson"),
        },
        description: "Directory row from GET /api/v1/admin/bookings and a recent booking on the dashboard.",
      },
      DashboardSale: {
        type: "object",
        required: ["id", "price", "status", "createdAt", "car", "buyer", "seller"],
        properties: {
          id: { type: "string", format: "uuid" },
          price: money,
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "PAID", "COMPLETED", "CANCELLED", "REFUNDED"] },
          createdAt: { type: "string", format: "date-time" },
          car: {
            type: "object",
            required: ["id", "brand", "model"],
            properties: {
              id: { type: "string", format: "uuid" },
              brand: { type: "string" },
              model: { type: "string" },
            },
          },
          buyer: ref("PublicPerson"),
          seller: ref("PublicPerson"),
        },
      },
      Dashboard: {
        type: "object",
        required: ["totalUsers", "totalRevenue"],
        properties: {
          totalUsers: { type: "integer" },
          activeUsers: { type: "integer" },
          blockedUsers: { type: "integer" },
          totalCars: { type: "integer" },
          publishedListings: { type: "integer" },
          pendingListings: { type: "integer" },
          soldCars: { type: "integer" },
          rentedCars: { type: "integer" },
          totalSales: { type: "integer" },
          completedSales: { type: "integer" },
          activeRentals: { type: "integer" },
          completedRentals: { type: "integer" },
          pendingBookings: { type: "integer" },
          salesRevenue: money,
          rentalRevenue: money,
          totalRevenue: money,
          recentUsers: { type: "array", items: ref("User") },
          recentListings: { type: "array", items: ref("AdminListing") },
          recentSales: { type: "array", items: ref("DashboardSale") },
          recentBookings: { type: "array", items: ref("AdminBooking") },
        },
        example: dashboardExample,
      },
      AnalyticsSeries: {
        type: "object",
        properties: {
          period: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                count: { type: "integer" },
                revenue: money,
              },
            },
          },
        },
      },
      CountSeries: {
        type: "object",
        properties: {
          period: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: { date: { type: "string" }, count: { type: "integer" } },
            },
          },
        },
      },
      RevenueSeries: {
        type: "object",
        properties: {
          period: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                salesRevenue: money,
                rentalRevenue: money,
                totalRevenue: money,
              },
            },
          },
        },
      },
    },
  },
};
