import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertOrderDemoSimulationEnabled } from './order-demo-simulation.policy.js';

/**
 * Route guard protecting demo-only order status mutation endpoints.
 * Rejects requests with 403 Forbidden unless order demo simulation is explicitly
 * authorized in a non-production environment.
 */
@Injectable()
export class OrderDemoSimulationGuard implements CanActivate {
  constructor(
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  public canActivate(_context: ExecutionContext): boolean {
    assertOrderDemoSimulationEnabled(this.configService);
    return true;
  }
}
