import { describe, expect, it } from "vitest";
import { openApiDocument } from "../../src/config/swagger.js";

const liveRoutes: Record<string, string[]> = {
  "/api/v1/health": ["get"],
  "/api/v1/auth/register": ["post"],
  "/api/v1/auth/login": ["post"],
  "/api/v1/auth/refresh": ["post"],
  "/api/v1/auth/logout": ["post"],
  "/api/v1/auth/me": ["get"],
  "/api/v1/users/me": ["get", "patch"],
  "/api/v1/cars": ["get", "post"],
  "/api/v1/cars/{id}": ["get", "patch", "delete"],
  "/api/v1/cars/{carId}/images": ["post"],
  "/api/v1/cars/{carId}/images/order": ["patch"],
  "/api/v1/cars/{carId}/images/{imageId}/main": ["patch"],
  "/api/v1/cars/{carId}/images/{imageId}": ["delete"],
  "/api/v1/cars/{carId}/reviews": ["get"],
  "/api/v1/listings": ["get", "post"],
  "/api/v1/listings/{id}": ["get", "patch", "delete"],
  "/api/v1/my/listings": ["get"],
  "/api/v1/purchases": ["post"],
  "/api/v1/purchases/{id}": ["get"],
  "/api/v1/purchases/{id}/confirm": ["post"],
  "/api/v1/purchases/{id}/cancel": ["post"],
  "/api/v1/purchases/{id}/pay": ["post"],
  "/api/v1/purchases/{id}/complete": ["post"],
  "/api/v1/my/purchases": ["get"],
  "/api/v1/my/sales": ["get"],
  "/api/v1/rentals": ["post"],
  "/api/v1/my/rentals": ["get"],
  "/api/v1/bookings": ["post"],
  "/api/v1/bookings/{id}/confirm": ["post"],
  "/api/v1/bookings/{id}/reject": ["post"],
  "/api/v1/bookings/{id}/cancel": ["post"],
  "/api/v1/bookings/{id}/complete": ["post"],
  "/api/v1/my/bookings": ["get"],
  "/api/v1/payments": ["post"],
  "/api/v1/payments/{id}": ["get"],
  "/api/v1/payments/{id}/pay": ["post"],
  "/api/v1/payments/{id}/cancel": ["post"],
  "/api/v1/my/payments": ["get"],
  "/api/v1/favorites": ["get"],
  "/api/v1/favorites/{carId}": ["post", "delete"],
  "/api/v1/reviews": ["post"],
  "/api/v1/notifications": ["get"],
  "/api/v1/notifications/read-all": ["patch"],
  "/api/v1/notifications/{id}/read": ["patch"],
  "/api/v1/reports": ["post", "get"],
  "/api/v1/reports/{id}": ["get"],
  "/api/v1/admin/listings/pending": ["get"],
  "/api/v1/admin/listings/{id}/approve": ["post"],
  "/api/v1/admin/listings/{id}/reject": ["post"],
  "/api/v1/admin/reports": ["get"],
  "/api/v1/admin/reports/{id}": ["patch"],
  "/api/v1/admin/dashboard": ["get"],
  "/api/v1/admin/analytics/sales": ["get"],
  "/api/v1/admin/analytics/rentals": ["get"],
  "/api/v1/admin/analytics/users": ["get"],
  "/api/v1/admin/analytics/revenue": ["get"],
  "/api/v1/admin/users": ["get"],
  "/api/v1/admin/users/{id}": ["get"],
  "/api/v1/admin/users/{id}/status": ["patch"],
  "/api/v1/admin/cars": ["get"],
  "/api/v1/admin/listings": ["get"],
  "/api/v1/admin/bookings": ["get"],
  "/api/v1/admin/sales": ["get"],
  "/api/v1/admin/sales/{id}": ["get"],
  "/api/v1/admin/sales/{id}/status": ["patch"],
  "/api/v1/admin/payments": ["get"],
  "/api/v1/admin/payments/{id}/refund": ["post"],
  "/api/v1/admin/audit-logs": ["get"],
};

const httpMethods = ["get", "post", "put", "patch", "delete"] as const;

describe("OpenAPI contract", () => {
  it("documents every live route and no missing routes", () => {
    const documented = openApiDocument.paths ?? {};
    expect(Object.keys(documented).sort()).toEqual(Object.keys(liveRoutes).sort());

    for (const [path, methods] of Object.entries(liveRoutes)) {
      const item = documented[path];
      expect(item, path).toBeDefined();
      const present = httpMethods.filter((method) => item?.[method] !== undefined);
      expect(present.sort(), path).toEqual([...methods].sort());
    }
  });

  it("publishes the resource schemas and shared error responses", () => {
    const schemas = openApiDocument.components?.schemas ?? {};
    for (const name of [
      "User",
      "Car",
      "CarImage",
      "Listing",
      "Purchase",
      "RentalBooking",
      "Payment",
      "Favorite",
      "Review",
      "Notification",
      "Report",
      "AuditLog",
      "ErrorResponse",
    ]) {
      expect(schemas[name], name).toBeDefined();
    }

    const responses = openApiDocument.components?.responses ?? {};
    for (const name of ["BadRequest", "Unauthorized", "Forbidden", "NotFound", "Conflict", "ValidationError", "TooManyRequests", "InternalError"]) {
      expect(responses[name], name).toBeDefined();
    }

    expect(JSON.stringify(openApiDocument)).not.toMatch(/postgresql:\/\/|DATABASE_URL|JWT_SECRET/);
  });

  it("keeps each resource in its own tag and each operation once", () => {
    const tagOrder = [
      "Authentication",
      "Users",
      "Cars",
      "Listings",
      "Purchases",
      "Rentals",
      "Bookings",
      "Payments",
      "Favorites",
      "Reviews",
      "Notifications",
      "Reports",
      "Admin Dashboard",
      "Admin Users",
      "Admin Cars",
      "Admin Listings",
      "Admin Sales",
      "Admin Rentals",
      "Admin Payments",
      "Admin Reports",
      "Admin Moderation",
      "Admin Audit",
      "Health / System",
    ];
    expect(openApiDocument.tags?.map((tag) => tag.name)).toEqual(tagOrder);

    const seen = new Set<string>();
    for (const [path, item] of Object.entries(openApiDocument.paths ?? {})) {
      for (const method of httpMethods) {
        const operation = item?.[method];
        if (!operation || "$ref" in operation) {
          continue;
        }
        expect(operation.tags, `${method} ${path}`).toHaveLength(1);
        const tag = operation.tags?.[0];
        expect(tagOrder, `${method} ${path}`).toContain(tag);
        expect(tag, `${method} ${path}`).not.toBe("User / Customer");
        expect(tag, `${method} ${path}`).not.toBe("Admin");
        const key = `${method} ${path}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }

    expect(openApiDocument.paths?.["/api/v1/cars"]?.get?.tags).toEqual(["Cars"]);
    expect(openApiDocument.paths?.["/api/v1/cars"]?.get?.security).toEqual([]);
    expect(openApiDocument.paths?.["/api/v1/cars"]?.post?.tags).toEqual(["Cars"]);
    expect(openApiDocument.paths?.["/api/v1/cars"]?.post?.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiDocument.paths?.["/api/v1/admin/cars"]?.get?.tags).toEqual(["Admin Cars"]);
    expect(openApiDocument.paths?.["/api/v1/listings"]?.get?.tags).toEqual(["Listings"]);
    expect(openApiDocument.paths?.["/api/v1/admin/listings"]?.get?.tags).toEqual(["Admin Listings"]);
    expect(openApiDocument.paths?.["/api/v1/reports"]?.post?.tags).toEqual(["Reports"]);
    expect(openApiDocument.paths?.["/api/v1/reports"]?.get?.tags).toEqual(["Reports"]);
    expect(openApiDocument.paths?.["/api/v1/admin/reports"]?.get?.tags).toEqual(["Admin Reports"]);
    expect(openApiDocument.paths?.["/api/v1/admin/sales"]?.get?.tags).toEqual(["Admin Sales"]);
    expect(openApiDocument.paths?.["/api/v1/admin/bookings"]?.get?.tags).toEqual(["Admin Rentals"]);
    expect(openApiDocument.paths?.["/api/v1/admin/payments"]?.get?.tags).toEqual(["Admin Payments"]);
    expect(openApiDocument.paths?.["/api/v1/admin/listings/pending"]?.get?.tags).toEqual(["Admin Moderation"]);
    expect(openApiDocument.paths?.["/api/v1/admin/audit-logs"]?.get?.tags).toEqual(["Admin Audit"]);
    expect(openApiDocument.paths?.["/api/v1/users/me"]?.get?.tags).toEqual(["Users"]);
    expect(openApiDocument.paths?.["/api/v1/users/me"]?.patch?.tags).toEqual(["Users"]);
    expect(openApiDocument.paths?.["/api/v1/auth/login"]?.post?.tags).toEqual(["Authentication"]);
    expect(openApiDocument.paths?.["/api/v1/auth/login"]?.post?.security).toEqual([]);
    expect(openApiDocument.paths?.["/api/v1/admin/dashboard"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiDocument.paths?.["/api/v1/health"]?.get?.tags).toEqual(["Health / System"]);
    expect(openApiDocument.paths?.["/api/v1/health"]?.get?.security).toEqual([]);
  });
});
