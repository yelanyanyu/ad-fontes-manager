import { describe, expect, it } from 'vitest';
import { useConfirmDialog } from './useConfirmDialog';

describe('useConfirmDialog', () => {
  it('opens with provided copy and resolves when settled', async () => {
    const { dialog, requestConfirm, settleConfirm } = useConfirmDialog();

    const result = requestConfirm({
      title: 'Select all?',
      message: 'This will select many words.',
      confirmLabel: 'Select All',
    });

    expect(dialog.open).toBe(true);
    expect(dialog.title).toBe('Select all?');
    expect(dialog.message).toBe('This will select many words.');
    expect(dialog.confirmLabel).toBe('Select All');

    settleConfirm(true);

    await expect(result).resolves.toBe(true);
    expect(dialog.open).toBe(false);
  });
});
