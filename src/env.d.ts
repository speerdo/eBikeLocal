/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly GOOGLE_PLACES_API_KEY: string;
  readonly AVANTLINK_API_KEY: string;
  readonly SHAREASALE_API_TOKEN: string;
  readonly SHAREASALE_API_SECRET: string;
  readonly IMPACT_ACCOUNT_SID: string;
  readonly IMPACT_AUTH_TOKEN: string;
  readonly SITE_URL: string;
  readonly BUILD_HOOK_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
