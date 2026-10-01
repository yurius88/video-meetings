import { extname } from 'path';

export type FileCategory = 'document' | 'image' | 'video' | 'presentation' | 'pdf';

type SignaturePart = { offset: number; bytes: Buffer };
type Signature = SignaturePart[];

export interface FileTypeSpec {
  extension: string;
  category: FileCategory;
  mimeType: string;
  signatures: Signature[];
}

export const SNIFF_BYTES = 16;

const at = (offset: number, hex: string): SignaturePart => ({
  offset,
  bytes: Buffer.from(hex, 'hex'),
});

const ZIP = [[at(0, '504b0304')]];
const OLE = [[at(0, 'd0cf11e0a1b11ae1')]];
const FTYP = [[at(4, '66747970')]];
const MATROSKA = [[at(0, '1a45dfa3')]];
const NONE: Signature[] = [];

const SPECS: [string, FileCategory, string, Signature[]][] = [
  ['doc', 'document', 'application/msword', OLE],
  [
    'docx',
    'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ZIP,
  ],
  ['odt', 'document', 'application/vnd.oasis.opendocument.text', ZIP],
  ['rtf', 'document', 'application/rtf', [[at(0, '7b5c727466')]]],
  ['txt', 'document', 'text/plain', NONE],
  ['md', 'document', 'text/markdown', NONE],
  ['csv', 'document', 'text/csv', NONE],
  ['xls', 'document', 'application/vnd.ms-excel', OLE],
  ['xlsx', 'document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ZIP],
  ['ods', 'document', 'application/vnd.oasis.opendocument.spreadsheet', ZIP],
  ['ppt', 'presentation', 'application/vnd.ms-powerpoint', OLE],
  [
    'pptx',
    'presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ZIP,
  ],
  ['odp', 'presentation', 'application/vnd.oasis.opendocument.presentation', ZIP],
  ['pdf', 'pdf', 'application/pdf', [[at(0, '25504446')]]],
  ['jpg', 'image', 'image/jpeg', [[at(0, 'ffd8ff')]]],
  ['jpeg', 'image', 'image/jpeg', [[at(0, 'ffd8ff')]]],
  ['png', 'image', 'image/png', [[at(0, '89504e470d0a1a0a')]]],
  ['gif', 'image', 'image/gif', [[at(0, '47494638')]]],
  ['webp', 'image', 'image/webp', [[at(0, '52494646'), at(8, '57454250')]]],
  ['bmp', 'image', 'image/bmp', [[at(0, '424d')]]],
  ['tif', 'image', 'image/tiff', [[at(0, '49492a00')], [at(0, '4d4d002a')]]],
  ['tiff', 'image', 'image/tiff', [[at(0, '49492a00')], [at(0, '4d4d002a')]]],
  ['heic', 'image', 'image/heic', FTYP],
  ['mp4', 'video', 'video/mp4', FTYP],
  ['m4v', 'video', 'video/x-m4v', FTYP],
  [
    'mov',
    'video',
    'video/quicktime',
    [...FTYP, [at(4, '6d6f6f76')], [at(4, '6d646174')], [at(4, '77696465')], [at(4, '66726565')]],
  ],
  ['webm', 'video', 'video/webm', MATROSKA],
  ['mkv', 'video', 'video/x-matroska', MATROSKA],
  ['avi', 'video', 'video/x-msvideo', [[at(0, '52494646'), at(8, '41564920')]]],
];

const SPECS_BY_EXTENSION = new Map<string, FileTypeSpec>(
  SPECS.map(([extension, category, mimeType, signatures]) => [
    extension,
    { extension, category, mimeType, signatures },
  ]),
);

export const ALLOWED_EXTENSIONS = [...SPECS_BY_EXTENSION.keys()];

export function resolveFileType(fileName: string): FileTypeSpec | undefined {
  const extension = extname(fileName).slice(1).toLowerCase();
  return SPECS_BY_EXTENSION.get(extension);
}

export function matchesSignature(spec: FileTypeSpec, head: Buffer): boolean {
  if (spec.signatures.length === 0) {
    return !head.includes(0);
  }
  return spec.signatures.some((signature) =>
    signature.every(
      ({ offset, bytes }) =>
        head.length >= offset + bytes.length &&
        head.subarray(offset, offset + bytes.length).equals(bytes),
    ),
  );
}

export function unsupportedTypeMessage(): string {
  return `Недопустимый тип файла. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}`;
}

// busboy декодирует filename как latin1, а браузеры отправляют сырые UTF-8 байты.
export function normalizeFileName(rawName: string): string {
  let name = rawName;
  if (!/[^\u0000-ÿ]/.test(rawName)) {
    const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
    if (!decoded.includes('�')) {
      name = decoded;
    }
  }
  return name
    .replace(/[\u0000-\u001f\u007f/\\]/g, '_')
    .trim()
    .slice(0, 255);
}
