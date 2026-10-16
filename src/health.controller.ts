import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
@ApiTags('health')
@Controller('health')
export class HealthController { @Get() getHealth() { return { status: 'ok', service: 'morocco-health-record-api', version: '0.1.0', timestamp: new Date().toISOString() }; } }
