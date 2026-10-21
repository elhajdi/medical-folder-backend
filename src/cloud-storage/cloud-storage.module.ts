import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CloudStorageStatusController } from "./cloud-storage-status.controller";

@Module({
  imports: [AuthModule],
  controllers: [CloudStorageStatusController],
})
export class CloudStorageModule {}
