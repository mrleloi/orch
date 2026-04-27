/**
 * stop-session-dialog.tsx — I-6-compliant confirm dialog for stopping a session.
 *
 * Part B signature:
 *   StopSessionDialog(props: StopSessionDialogProps): JSX.Element
 *
 * Implementation:
 *   Wraps shadcn AlertDialog. Controlled via open + onOpenChange props (parent manages state).
 *   Confirm → onConfirm() then onOpenChange(false).
 *   Cancel → onOpenChange(false) only. Does NOT call onConfirm.
 *
 * I-6: This dialog is the mandatory confirmation gate before any session stop action.
 *      Never bypass by calling sessions.stop() without first confirming through this dialog.
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface StopSessionDialogProps {
  sessionId: string;
  onConfirm: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StopSessionDialog({
  sessionId,
  onConfirm,
  open,
  onOpenChange,
}: StopSessionDialogProps): JSX.Element {
  function handleConfirm(): void {
    // AlertDialogAction wraps DialogClose which calls onOpenChange(false) via Radix dismiss context.
    // Only call the domain callback here; Radix handles the dismiss.
    onConfirm();
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop session?</AlertDialogTitle>
          <AlertDialogDescription>
            Session <strong>{sessionId}</strong> will be terminated. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* AlertDialogCancel wraps DialogClose which calls onOpenChange(false) via Radix dismiss context — no explicit onClick needed */}
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Confirm Stop
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
