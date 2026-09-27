import { AppError } from "../../common/errors/app-error.js";

export type DatabaseHealthCheck = {
  checkConnection(): Promise<boolean>;
};

export class HealthService {
  constructor(private readonly database: DatabaseHealthCheck) {}

  async getStatus(): Promise<void> {
    const connected = await this.database.checkConnection();
    if (!connected) {
      throw new AppError("Database is unavailable", 503, "DATABASE_UNAVAILABLE");
    }
  }
}
