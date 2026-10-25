import { ComplaintStatus } from '../enums/complaint-status.enum.js';

export class ComplaintResponseDto {
  complaintId!: string;
  roomNumber!: string;
  subject!: string;
  description!: string;
  status!: ComplaintStatus;
  createdAt!: string;
}
