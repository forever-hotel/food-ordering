/**
 * Provider Factory for Centralized Data Mode Architecture (#101, FUI-06, FUI-16)
 *
 * Dynamically dispatches between API and Demo implementations based on getDataMode().
 * In production or staging tiers, getDataMode() unconditionally returns 'api'.
 * In authorized development or preview tiers, 'demo' mode dispatches to isolated
 * in-memory DemoStateStore fixtures without making live backend network requests.
 */
import { getDataMode } from './data-mode.ts';
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
import { DemoOrdersProvider } from './demo/demo-orders.provider.ts';
import { DemoMenuProvider } from './demo/demo-menu.provider.ts';
import { DemoServicesProvider } from './demo/demo-services.provider.ts';
import { DemoComplaintsProvider } from './demo/demo-complaints.provider.ts';
import { DemoSessionsProvider } from './demo/demo-sessions.provider.ts';

const apiOrders = new ApiOrdersProvider();
const demoOrders = new DemoOrdersProvider();

const apiMenu = new ApiMenuProvider();
const demoMenu = new DemoMenuProvider();

const apiServices = new ApiServicesProvider();
const demoServices = new DemoServicesProvider();

const apiComplaints = new ApiComplaintsProvider();
const demoComplaints = new DemoComplaintsProvider();

const apiSessions = new ApiSessionsProvider();
const demoSessions = new DemoSessionsProvider();

export function getOrdersProvider(): OrdersProvider {
  return getDataMode() === 'api' ? apiOrders : demoOrders;
}

export function getMenuProvider(): MenuProvider {
  return getDataMode() === 'api' ? apiMenu : demoMenu;
}

export function getServicesProvider(): ServicesProvider {
  return getDataMode() === 'api' ? apiServices : demoServices;
}

export function getComplaintsProvider(): ComplaintsProvider {
  return getDataMode() === 'api' ? apiComplaints : demoComplaints;
}

export function getSessionsProvider(): SessionsProvider {
  return getDataMode() === 'api' ? apiSessions : demoSessions;
}
