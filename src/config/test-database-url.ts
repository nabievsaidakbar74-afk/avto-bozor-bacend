const TEST_DATABASE_NAME = "avto_bozor_test";
const APP_DATABASE_NAME = "avto_bozor";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function toTestDatabaseUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (databaseName === TEST_DATABASE_NAME) {
    return url.toString();
  }

  if (!LOCAL_HOSTS.has(url.hostname) || databaseName !== APP_DATABASE_NAME) {
    throw new Error("Tests only run against the local avto_bozor_test database");
  }

  url.pathname = `/${TEST_DATABASE_NAME}`;
  return url.toString();
}
