/**
 * Provider Factory for Single Frontend -> NestJS Backend Architecture (#101, FUI-16)
 *
 * All guest-facing operations communicate with the NestJS backend API.
 * Runtime switching between frontend Demo and API implementations is removed;
 * external mock vs real behavior is handled entirely upstream by the NestJS backend.
 */
import type {
  OrdersProvider,
  MenuProvider,
  ServicesProvider,
  ComplaintsProvider,
  SessionsProvider,
} from './interfaces.ts';
import { ApiOrdersProvider } from './api/api-orders.provider.ts';
import { ApiMenuProvider } from './api/api-menu.provider.ts';
import { ApiServicesProvider } from './api/api-services.provider.ts';
import { ApiComplaintsProvider } from './api/api-complaints.provider.ts';
import { ApiSessionsProvider } from './api/api-sessions.provider.ts';

const apiOrders = new ApiOrdersProvider();
const apiMenu = new ApiMenuProvider();
const apiServices = new ApiServicesProvider();
const apiComplaints = new ApiComplaintsProvider();
const apiSessions = new ApiSessionsProvider();

export function getOrdersProvider(): OrdersProvider {
  return apiOrders;
}

export function getMenuProvider(): MenuProvider {
  return apiMenu;
}

export function getServicesProvider(): ServicesProvider {
  return apiServices;
}

export function getComplaintsProvider(): ComplaintsProvider {
  return apiComplaints;
}

export function getSessionsProvider(): SessionsProvider {
  return apiSessions;
}
