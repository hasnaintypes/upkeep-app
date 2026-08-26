import { toast } from "sonner";

/**
 * Thin wrapper around sonner's `toast()` so every call site in the app uses
 * the same variant vocabulary (success/error/info/warning/loading) instead
 * of ad-hoc strings -- keeps one-shot action feedback consistent with the
 * `<Toaster richColors />` mounted in the root layout.
 *
 * Toasts are for one-shot action feedback (a mutation succeeded/failed),
 * not for inline field validation -- keep `<FieldError>`/inline messages
 * for that.
 */
export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, { description }),
  error: (message: string, description?: string) =>
    toast.error(message, { description }),
  info: (message: string, description?: string) =>
    toast.info(message, { description }),
  warning: (message: string, description?: string) =>
    toast.warning(message, { description }),
  loading: (message: string) => toast.loading(message),
  dismiss: (id: string | number) => toast.dismiss(id),
};
