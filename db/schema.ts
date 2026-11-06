import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { TobiConfig } from "@/lib/tobi-config";

export const tobiConfigurations = sqliteTable("tobi_configurations", {
  id: text("id").primaryKey(),
  configVersion: integer("config_version").notNull(),
  config: text("config", { mode: "json" }).$type<TobiConfig>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
