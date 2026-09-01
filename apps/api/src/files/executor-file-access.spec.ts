import { FileKind } from '@prisma/client';
import { canAssignedExecutorReadFile } from './files.service';

describe('assigned executor file confidentiality', () => {
  it.each(
    Object.values(FileKind).flatMap((fileKind) =>
      [false, true].map((visible) => [fileKind, visible] as const),
    ),
  )(
    'exhaustively applies file policy kind=%s customerVisible=%s',
    (fileKind, customerVisible) => {
      const alwaysAllowed = new Set<FileKind>([FileKind.input]);
      const expected =
        alwaysAllowed.has(fileKind) ||
        (fileKind === FileKind.message_attachment && customerVisible);
      expect(canAssignedExecutorReadFile(fileKind, customerVisible)).toBe(
        expected,
      );
    },
  );

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
