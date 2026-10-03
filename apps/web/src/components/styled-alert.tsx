"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle, Info, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/* The site's "Are you sure?" family: 5 confirmation modals that share the same
   plain panel look but differ in how content and buttons are arranged. Each
   export is a complete modal: internal open state (uncontrolled defaultOpen /
   controlled open+onOpenChange), SELF-CONTAINED (no radix, no portal) - fixed
   backdrop + centered fixed panel. A backdrop click, Escape or Cancel closes it;
   Confirm calls onConfirm first and then closes. The panel takes focus on open.
   AnimatePresence handles enter/exit, and under reduced motion it fades or
   switches instantly. Color comes ONLY from tokens, via alpha color-mix. The
   panel stays neutral; the only thing that changes is the layout. The tone
   tokens drive the icon and the confirm button.

   Tailored for Whizard: the backdrop and panel copy the site's own dialogs
   (night blur, panel-strong, the 24px radius and soft shadow), and the tones
   are Whizard's - purple, ok green, gold, bad red. `alt` adds a second thing
   that can be done instead of the confirm, such as the host ending a game for
   everyone when everyone else is offered quitting alone. */

export type StyledSize = "sm" | "md" | "lg" | "xl";

export type StyledTone = "info" | "success" | "warning" | "danger";

type LayoutKind = "centered" | "horizontal" | "compact" | "wide" | "split";

const panelWidth: Record<StyledSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

/* The Wide layout wants a wider panel; size still sets the max limit, but the base width goes up one step. */
const wideWidth: Record<StyledSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-2xl",
};

const bodyPad: Record<StyledSize, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
  xl: "p-7",
};

/* Confirm button tone mapping - the tone token drives it directly. */
const confirmTone: Record<StyledTone, string> = {
  info: "bg-info text-info-foreground hover:bg-info/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
};

/* The top band colour of the split layout - the tone soft token. */
const bandTone: Record<StyledTone, string> = {
  info: "bg-info-soft text-info-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
};

const cancelBtn =
  "inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_i]:text-base [&_i]:leading-none";

const confirmBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_i]:text-base [&_i]:leading-none";

/* The compact layout uses smaller buttons. */
const cancelBtnSm =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_i]:text-base [&_i]:leading-none";

const confirmBtnSm =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_i]:text-base [&_i]:leading-none";

type StyledAlertPublicProps = {
  size?: StyledSize;
  trigger?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** A second thing that can be done instead of the confirm, shown as its own button. */
  altLabel?: string;
  onConfirm?: () => void;
  onAlt?: () => void;
  className?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (o: boolean) => void;
};

type StyledAlertCoreProps = StyledAlertPublicProps & {
  tone: StyledTone;
  confirmClassName: string;
  icon: React.ReactNode;
  iconClassName: string;
  layout: LayoutKind;
};

/* Shared modal core: state management, backdrop, panel, escape, focus, motion. The layout prop decides the body and footer placement; the panel appearance is fixed. */
function StyledAlertDialog({
  size = "md",
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  altLabel,
  onConfirm,
  onAlt,
  className,
  open,
  defaultOpen,
  onOpenChange,
  tone,
  confirmClassName,
  icon,
  iconClassName,
  layout,
}: StyledAlertCoreProps) {
  const reduce = useReducedMotion();
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const actualOpen = isControlled ? open : internalOpen;
  const panelRef = React.useRef<HTMLDivElement>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (!actualOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
    };
  }, [actualOpen, setOpen]);

  const handleConfirm = () => {
    onConfirm?.();
    setOpen(false);
  };

  const handleAlt = () => {
    onAlt?.();
    setOpen(false);
  };

  const width = layout === "wide" ? wideWidth[size] : panelWidth[size];

  /* Button group: small buttons in compact, full-width stacked in centered, a right-aligned row otherwise. */
  const cancelClass = layout === "compact" ? cancelBtnSm : cancelBtn;
  const confirmClass = layout === "compact" ? confirmBtnSm : confirmBtn;

  const footer = (
    <div
      data-slot="styled-alert-dialog-footer"
      className={cn(
        "flex gap-2",
        layout === "centered"
          ? "mt-5 flex-col"
          : layout === "compact"
            ? "mt-0 shrink-0 justify-end"
            : "mt-5 justify-end",
      )}
    >
      <button
        type="button"
        data-slot="styled-alert-dialog-cancel"
        className={cn(cancelClass, layout === "centered" && "w-full")}
        onClick={() => setOpen(false)}
      >
        {cancelLabel}
      </button>
      {altLabel ? (
        <button
          type="button"
          data-slot="styled-alert-dialog-alt"
          className={cn(cancelClass, layout === "centered" && "w-full")}
          onClick={handleAlt}
        >
          {altLabel}
        </button>
      ) : null}
      <button
        type="button"
        data-slot="styled-alert-dialog-confirm"
        className={cn(confirmClass, confirmClassName, layout === "centered" && "w-full")}
        onClick={handleConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );

  const titleNode = title ? (
    <h2
      data-slot="styled-alert-dialog-title"
      className="text-base font-semibold tracking-tight text-foreground"
    >
      {title}
    </h2>
  ) : null;

  return (
    <span data-slot="styled-alert-dialog" className="contents">
      {/* When a trigger is given, it carries the ARIA state: a screen reader
          knows the control opens a dialog and whether it is open right now.
          Confirmations raised by the app (useConfirm) have no trigger of their
          own, so the span is left out entirely. */}
      {trigger ? (
        <span data-slot="styled-alert-dialog-trigger" className="inline-flex">
          {React.isValidElement<React.ButtonHTMLAttributes<HTMLButtonElement>>(trigger) ? (
            React.cloneElement(trigger, {
              "aria-haspopup": "dialog",
              "aria-expanded": actualOpen,
              onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                trigger.props.onClick?.(event);
                setOpen(true);
              },
            })
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={actualOpen}
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {trigger ?? "Open"}
            </button>
          )}
        </span>
      ) : null}

      <AnimatePresence>
        {actualOpen ? (
          <>
            <motion.div
              data-slot="styled-alert-dialog-backdrop"
              className="fixed inset-0 z-50 bg-[rgb(8_4_30_/_70%)] supports-[backdrop-filter]:backdrop-blur-[4px]"
              onClick={() => setOpen(false)}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                data-tone={tone}
                data-layout={layout}
                className={cn(
                  "pointer-events-auto w-full overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-border bg-popover text-popover-foreground shadow-[var(--shadow)] outline-none",
                  width,
                  className,
                )}
                initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* CENTERED: icon, title and text centred vertically, full-width buttons stacked. */}
                {layout === "centered" ? (
                  <div className={cn("flex flex-col items-center text-center", bodyPad[size])}>
                    <span
                      data-slot="styled-alert-dialog-icon"
                      className={cn(
                        "mb-3 flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,currentColor_12%,transparent)] [&_svg]:size-6 [&_svg]:shrink-0 [&_i]:text-2xl [&_i]:leading-none",
                        iconClassName,
                      )}
                    >
                      {icon}
                    </span>
                    {titleNode}
                    {description ? (
                      <p
                        data-slot="styled-alert-dialog-description"
                        className="mt-1 text-sm text-muted-foreground"
                      >
                        {description}
                      </p>
                    ) : null}
                    {footer}
                  </div>
                ) : null}

                {/* HORIZONTAL: the icon on the left, the words on the right, buttons at the bottom right. */}
                {layout === "horizontal" ? (
                  <div className={cn("flex flex-col", bodyPad[size])}>
                    <div className="flex gap-3">
                      <span
                        data-slot="styled-alert-dialog-icon"
                        className={cn(
                          "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,currentColor_12%,transparent)] [&_svg]:size-5 [&_svg]:shrink-0 [&_i]:text-xl [&_i]:leading-none",
                          iconClassName,
                        )}
                      >
                        {icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        {titleNode}
                        {description ? (
                          <p
                            data-slot="styled-alert-dialog-description"
                            className="mt-1 text-sm text-muted-foreground"
                          >
                            {description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {footer}
                  </div>
                ) : null}

                {/* COMPACT: a tight one-line confirmation - icon and title on the left, buttons on the same line on the right. */}
                {layout === "compact" ? (
                  <div className={cn("flex items-center gap-3", bodyPad[size])}>
                    <span
                      data-slot="styled-alert-dialog-icon"
                      className={cn(
                        "flex shrink-0 items-center [&_svg]:size-5 [&_svg]:shrink-0 [&_i]:text-xl [&_i]:leading-none",
                        iconClassName,
                      )}
                    >
                      {icon}
                    </span>
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {title}
                    </div>
                    {footer}
                  </div>
                ) : null}

                {/* WIDE: a wide panel; the description reads as two columns. */}
                {layout === "wide" ? (
                  <div className={cn("flex flex-col", bodyPad[size])}>
                    <div className="flex items-center gap-3">
                      <span
                        data-slot="styled-alert-dialog-icon"
                        className={cn(
                          "flex shrink-0 items-center [&_svg]:size-5 [&_svg]:shrink-0 [&_i]:text-xl [&_i]:leading-none",
                          iconClassName,
                        )}
                      >
                        {icon}
                      </span>
                      {titleNode}
                    </div>
                    {description ? (
                      <p
                        data-slot="styled-alert-dialog-description"
                        className="mt-3 text-sm text-muted-foreground sm:columns-2 sm:gap-6"
                      >
                        {description}
                      </p>
                    ) : null}
                    {footer}
                  </div>
                ) : null}

                {/* SPLIT: a coloured token band across the top, then the words and buttons below it. */}
                {layout === "split" ? (
                  <>
                    <div
                      data-slot="styled-alert-dialog-band"
                      className={cn(
                        "flex items-center gap-3 border-b border-border px-5 py-4",
                        bandTone[tone],
                      )}
                    >
                      <span
                        data-slot="styled-alert-dialog-icon"
                        className="flex shrink-0 items-center [&_svg]:size-5 [&_svg]:shrink-0 [&_i]:text-xl [&_i]:leading-none"
                      >
                        {icon}
                      </span>
                      <h2
                        data-slot="styled-alert-dialog-title"
                        className="text-base font-semibold tracking-tight"
                      >
                        {title}
                      </h2>
                    </div>
                    <div className={cn("flex flex-col", bodyPad[size])}>
                      {description ? (
                        <p
                          data-slot="styled-alert-dialog-description"
                          className="text-sm text-muted-foreground"
                        >
                          {description}
                        </p>
                      ) : null}
                      {footer}
                    </div>
                  </>
                ) : null}
              </motion.div>
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* CenteredAlert: icon, title and text centred vertically, full-width buttons stacked. A mobile-friendly layout that focuses everything on a single decision. */
export function CenteredAlert({
  title = "Confirm this action?",
  description = "Take a moment to review before you continue.",
  ...props
}: StyledAlertPublicProps) {
  return (
    <StyledAlertDialog
      layout="centered"
      tone="info"
      icon={<Info />}
      iconClassName="text-info"
      confirmClassName={confirmTone.info}
      title={title}
      description={description}
      {...props}
    />
  );
}

/* HorizontalAlert: the icon on the left, the words on the right, buttons bottom
   right. The site's standard "Are you sure?" row. */
export function HorizontalAlert({
  title = "Save your changes?",
  description = "You have unsaved edits that will be lost if you leave now.",
  confirmLabel = "Save",
  ...props
}: StyledAlertPublicProps) {
  return (
    <StyledAlertDialog
      layout="horizontal"
      tone="success"
      icon={<CheckCircle />}
      iconClassName="text-success"
      confirmClassName={confirmTone.success}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      {...props}
    />
  );
}

/* CompactAlert: a tight one-line confirmation - icon, title and buttons on the same line. The narrowest layout, for quick yes/no decisions. */
export function CompactAlert({
  title = "Discard draft?",
  confirmLabel = "Discard",
  ...props
}: StyledAlertPublicProps) {
  return (
    <StyledAlertDialog
      layout="compact"
      size="lg"
      tone="danger"
      icon={<Trash2 />}
      iconClassName="text-danger"
      confirmClassName={confirmTone.danger}
      title={title}
      confirmLabel={confirmLabel}
      {...props}
    />
  );
}

/* WideAlert: a wide panel; the description reads as two columns. A roomy layout for confirmations with long descriptions. */
export function WideAlert({
  title = "Review the terms",
  description = "These changes apply to your entire workspace and take effect immediately. Members keep their current roles, existing links stay valid, and billing continues on the same cycle without interruption.",
  confirmLabel = "Accept",
  ...props
}: StyledAlertPublicProps) {
  return (
    <StyledAlertDialog
      layout="wide"
      size="xl"
      tone="info"
      icon={<Info />}
      iconClassName="text-info"
      confirmClassName={confirmTone.info}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      {...props}
    />
  );
}

/* SplitAlert: a coloured token band across the top, then the words and buttons
   below it - the two regions make a big decision read as one. */
export function SplitAlert({
  title = "Delete this project?",
  description = "This action cannot be undone. All files and history in the project will be permanently removed.",
  confirmLabel = "Delete",
  ...props
}: StyledAlertPublicProps) {
  return (
    <StyledAlertDialog
      layout="split"
      tone="warning"
      icon={<AlertTriangle />}
      iconClassName="text-warning-soft-foreground"
      confirmClassName={confirmTone.warning}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      {...props}
    />
  );
}

export default CenteredAlert;
