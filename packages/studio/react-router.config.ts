import type { Config } from "@react-router/dev/config";

export default {
  // Server rendering: loaders and actions run in the studio's Node process and read the repo.
  ssr: true,
} satisfies Config;
