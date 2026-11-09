declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    TOBI_ADMIN_EMAILS?: string;
    TOBI_ADMIN_IDS?: string;
    TOBI_LOCAL_ADMIN_TOKEN?: string;
    TOBI_IN_MEMORY_CONFIG?: string;
  }
}
