import { MadCreateComplaintDto } from '../dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../dto/mad-complaint-result.dto.js';

export const MAD_COMPLAINT_PROVIDER = Symbol('MAD_COMPLAINT_PROVIDER');

export interface MadComplaintProvider {
  fileComplaint(
    complaint: MadCreateComplaintDto,
  ): Promise<MadComplaintResultDto>;
  getComplaint(complaintId: string): Promise<MadComplaintResultDto | null>;
  resolveComplaint(
    complaintId: string,
    resolutionNotes: string,
  ): Promise<MadComplaintResultDto>;
}
