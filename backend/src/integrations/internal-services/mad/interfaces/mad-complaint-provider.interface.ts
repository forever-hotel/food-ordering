import { MadCreateComplaintDto } from '../dto/mad-complaint.dto.js';
import { MadComplaintResultDto } from '../dto/mad-complaint-result.dto.js';

export const MAD_COMPLAINT_PROVIDER = Symbol('MAD_COMPLAINT_PROVIDER');

export abstract class MadComplaintProvider {
  abstract fileComplaint(
    complaint: MadCreateComplaintDto,
  ): Promise<MadComplaintResultDto>;
  abstract getComplaint(
    complaintId: string,
  ): Promise<MadComplaintResultDto | null>;
  abstract resolveComplaint(
    complaintId: string,
    resolutionNotes: string,
  ): Promise<MadComplaintResultDto>;
}
