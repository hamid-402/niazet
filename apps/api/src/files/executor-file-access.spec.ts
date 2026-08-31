import { FileKind } from '@prisma/client';
import { canAssignedExecutorReadFile } from './files.service';

describe('assigned executor file confidentiality', () => {
  it('allows work inputs and customer-visible message attachments', () => {
    expect(canAssignedExecutorReadFile(FileKind.input, false)).toBe(true);
    expect(canAssignedExecutorReadFile(FileKind.message_attachment, true)).toBe(
      true,
    );
  });

  it.each([
    FileKind.invoice,
    FileKind.ticket_attachment,
    FileKind.output,
    FileKind.revision,
    FileKind.report,
  ])('blocks non-owned %s files', (fileKind) => {
    expect(canAssignedExecutorReadFile(fileKind, false)).toBe(false);
  });
});
