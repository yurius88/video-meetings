import { FileCategory } from '../file-types';

export class MeetingFile {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  category: FileCategory;
  size: number;
  sha256: string;
  uploadedBy: string;
  uploadedAt: Date;
}
