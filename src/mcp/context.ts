import type { Jail } from "./jail.js";
import type { UnimcpConfig } from "./config.js";
import type { SymbolCache } from "../core/code/cache.js";

export interface ServerContext {
  config: UnimcpConfig;
  jail: Jail;
  symbolCache: SymbolCache;
}
