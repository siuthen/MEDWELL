declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    FINANCE_PASSWORD_HASH?: string;
    FINANCE_PASSWORD_SALT?: string;
    FINANCE_SESSION_SECRET?: string;
    BUCKET?: R2Bucket;
  }
}
