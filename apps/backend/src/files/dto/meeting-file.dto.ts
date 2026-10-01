import { FileCategory } from '../file-types';
import { MeetingFile } from '../entities/meeting-file.entity';

export class MeetingFileDto {
  id: string;
  meetingId: string;
  name: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  previewUrl: string | null;
  downloadUrl: string;

  static from(file: MeetingFile): MeetingFileDto {
    return {
      id: file.id,
      meetingId: file.meetingId,
      name: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      category: file.category,
      sha256: file.sha256,
      uploadedBy: file.uploadedBy,
      uploadedAt: file.uploadedAt.toISOString(),
      previewUrl: null,
      downloadUrl: `/meetings/${file.meetingId}/files/${file.id}/download`,
    };
  }
}
