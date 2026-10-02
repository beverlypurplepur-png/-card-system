import { Module } from "@nestjs/common";

import { PermissionModule } from "../permission";
import { CardSystemController } from "./controller";
import { CardSystemRepository } from "./repository";

@Module({
  imports: [PermissionModule],
  controllers: [CardSystemController],
  providers: [CardSystemRepository],
  exports: [CardSystemRepository],
})
export class CardSystemModule {}

export { CardSystemController } from "./controller";
export { CardSystemRepository } from "./repository";
export type * from "./types";
