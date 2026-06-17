import { Module } from "@nestjs/common";
import { RunsController } from "./runs.controller.js";
import { WorkspaceService } from "./workspace.service.js";

@Module({
  controllers: [RunsController],
  providers: [WorkspaceService]
})
export class AppModule {}
