import { reactive } from 'vue';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

export interface ConfirmDialogState extends Required<ConfirmDialogOptions> {
  open: boolean;
}

export function useConfirmDialog() {
  const dialog = reactive<ConfirmDialogState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
  });

  let resolvePending: ((confirmed: boolean) => void) | null = null;

  function requestConfirm(options: ConfirmDialogOptions): Promise<boolean> {
    resolvePending?.(false);
    dialog.open = true;
    dialog.title = options.title;
    dialog.message = options.message;
    dialog.confirmLabel = options.confirmLabel || 'Confirm';
    dialog.cancelLabel = options.cancelLabel || 'Cancel';
    dialog.variant = options.variant || 'default';

    return new Promise<boolean>(resolve => {
      resolvePending = resolve;
    });
  }

  function settleConfirm(confirmed: boolean): void {
    dialog.open = false;
    resolvePending?.(confirmed);
    resolvePending = null;
  }

  return {
    dialog,
    requestConfirm,
    settleConfirm,
  };
}
