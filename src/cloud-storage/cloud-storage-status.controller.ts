import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("cloud-storage")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cloud-connections")
export class CloudStorageStatusController {
  @Get("status")
  @ApiOkResponse({
    description:
      "Reports whether cloud storage and the anonymous-data pipeline are implemented and enabled.",
  })
  getStatus() {
    return {
      googleDrive: {
        state: "disabled",
        reasonCode: "PROVIDER_NOT_CONFIGURED",
      },
      anonymousData: {
        state: "disabled",
        reasonCode: "PRIVACY_GATE_NOT_APPROVED",
      },
    } as const;
  }
}
