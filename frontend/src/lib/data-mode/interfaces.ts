import type {
  FoodOrderResponse,
  CreateFoodOrderPayload,
  FoodOrderStatus,
} from '../../types/orders.ts';
import type { GuestMenuResponse, GuestMenuItem, GetMenuParams } from '../../types/menu.ts';
import type {
  ServiceRequestResponse,
  CreateServiceRequestPayload,
  ServiceRequestStatus,
} from '../../types/services.ts';
import type {
  ComplaintResponse,
  CreateComplaintPayload,
  ComplaintStatus,
} from '../../types/complaints.ts';
import type { GuestContext, GuestSessionResponse } from '../../types/guest-session.ts';

export interface OrdersProvider {
  fetchGuestOrders(sessionToken: string): Promise<FoodOrderResponse[]>;
  fetchGuestOrderById(sessionToken: string, orderId: string): Promise<FoodOrderResponse>;
  placeFoodOrder(
    sessionToken: string,
    payload: CreateFoodOrderPayload,
    idempotencyKey: string,
  ): Promise<FoodOrderResponse>;
  cancelFoodOrder(
    sessionToken: string,
    orderId: string,
    reason?: string,
  ): Promise<FoodOrderResponse>;
  advanceDemoOrderStatus(
    sessionToken: string,
    orderId: string,
    newStatus: FoodOrderStatus,
  ): Promise<FoodOrderResponse>;
}

export interface MenuProvider {
  fetchGuestMenu(sessionToken?: string, params?: GetMenuParams): Promise<GuestMenuResponse>;
  fetchGuestMenuItem(itemId: string, sessionToken?: string): Promise<GuestMenuItem | null>;
}

export interface ServicesProvider {
  fetchGuestServiceRequests(sessionToken: string): Promise<ServiceRequestResponse[]>;
  fetchGuestServiceRequestById(
    sessionToken: string,
    requestId: string,
  ): Promise<ServiceRequestResponse>;
  createServiceRequest(
    sessionToken: string,
    payload: CreateServiceRequestPayload,
    idempotencyKey?: string,
  ): Promise<ServiceRequestResponse>;
  advanceDemoServiceRequestStatus(
    sessionToken: string,
    requestId: string,
    newStatus: ServiceRequestStatus,
    assignedStaff?: string,
  ): Promise<ServiceRequestResponse>;
}

export interface ComplaintsProvider {
  fetchGuestComplaints(sessionToken: string): Promise<ComplaintResponse[]>;
  fetchGuestComplaintById(sessionToken: string, complaintId: string): Promise<ComplaintResponse>;
  createComplaint(
    payload: CreateComplaintPayload,
    sessionToken: string,
    idempotencyKey?: string,
  ): Promise<ComplaintResponse>;
  advanceDemoComplaintStatus(
    sessionToken: string,
    complaintId: string,
    newStatus: ComplaintStatus,
    resolutionNotes?: string,
  ): Promise<ComplaintResponse>;
}

export interface SessionsProvider {
  redeemQrToken(qrToken: string): Promise<GuestSessionResponse>;
  fetchCurrentSession(sessionToken: string): Promise<GuestContext>;
  renewSession?(sessionToken: string): Promise<GuestSessionResponse>;
  logoutSession(sessionToken: string): Promise<{ success: boolean; message: string }>;
  fetchDemoTokens(): Promise<Record<string, string>>;
  resetDemo?(): Promise<{ success: boolean; message: string }>;
}
