import type { Jail } from "./jail.js";
import type { UnimcpConfig } from "./config.js";

export interface ServerContext {
  config: UnimcpConfig;
  jail: Jail;
}
