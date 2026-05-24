'use client';

import {
  ReactNode,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '../../app/i18n/I18nContext';
import {
  HELPER_TEXTS,
  HelperTextKey,
  formatHelperEntry,
} from '../../app/i18n/helperTexts';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface HelperTooltipProps {
  children: ReactNode;
  /** Optional raw content. Ignored if `textKey` is provided. */
  content?: ReactNode;
  /** Key into HELPER_TEXTS — preferred path for localized helpers. */
  textKey?: HelperTextKey;
  side?: Side;
  title?: string;
  className?: string;
  maxWidth?: number;
  openOn?: 'hover' | 'click';
}

function renderLocalizedBody(text: string) {
  const lines = text.split('\n');
  if (lines.length === 1) return lines[0];
  return lines.map((line, i) => (
    <span key={i} className={i > 0 ? 'block mt-1' : 'block'}>
      {line}
    </span>
  ));
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const SPACING = 10;

function computePosition(
  anchor: DOMRect,
  tooltip: DOMRect,
  side: Side
): { top: number; left: number; resolvedSide: Side } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let resolvedSide = side;
  if (side === 'top' && anchor.top - tooltip.height - SPACING < 8) resolvedSide = 'bottom';
  if (side === 'bottom' && anchor.bottom + tooltip.height + SPACING > vh - 8) resolvedSide = 'top';
  if (side === 'left' && anchor.left - tooltip.width - SPACING < 8) resolvedSide = 'right';
  if (side === 'right' && anchor.right + tooltip.width + SPACING > vw - 8) resolvedSide = 'left';

  let top = 0;
  let left = 0;

  switch (resolvedSide) {
    case 'top':
      top = anchor.top - tooltip.height - SPACING;
      left = anchor.left + anchor.width / 2 - tooltip.width / 2;
      break;
    case 'bottom':
      top = anchor.bottom + SPACING;
      left = anchor.left + anchor.width / 2 - tooltip.width / 2;
      break;
    case 'left':
      top = anchor.top + anchor.height / 2 - tooltip.height / 2;
      left = anchor.left - tooltip.width - SPACING;
      break;
    case 'right':
      top = anchor.top + anchor.height / 2 - tooltip.height / 2;
      left = anchor.right + SPACING;
      break;
  }

  left = Math.max(8, Math.min(left, vw - tooltip.width - 8));
  top = Math.max(8, Math.min(top, vh - tooltip.height - 8));

  return { top, left, resolvedSide };
}

export function HelperTooltip({
  children,
  content,
  textKey,
  side = 'top',
  title,
  className = '',
  maxWidth = 260,
  openOn,
}: HelperTooltipProps) {
  const { language } = useI18n();

  const resolvedTitle = textKey
    ? formatHelperEntry(HELPER_TEXTS[textKey].title, language) || title
    : title;

  const resolvedBody: ReactNode = textKey
    ? renderLocalizedBody(formatHelperEntry(HELPER_TEXTS[textKey].body, language))
    : content;
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: -9999, left: -9999, resolvedSide: side });
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setIsTouch(window.matchMedia('(hover: none)').matches);
    }
  }, []);

  const trigger = openOn ?? (isTouch ? 'click' : 'hover');

  const reposition = useCallback(() => {
    if (!anchorRef.current || !tooltipRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const t = tooltipRef.current.getBoundingClientRect();
    setPos(computePosition(a, t, side));
  }, [side]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    reposition();
    const handle = () => reposition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDocClick = (e: MouseEvent) => {
      if (
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const childProps = (isValidElement(children) ? (children as any).props : {}) || {};
  const childOnClick: ((e: React.MouseEvent) => void) | undefined = childProps.onClick;
  const childOnMouseEnter: ((e: React.MouseEvent) => void) | undefined = childProps.onMouseEnter;
  const childOnMouseLeave: ((e: React.MouseEvent) => void) | undefined = childProps.onMouseLeave;
  const childOnFocus: ((e: React.FocusEvent) => void) | undefined = childProps.onFocus;
  const childOnBlur: ((e: React.FocusEvent) => void) | undefined = childProps.onBlur;

  const handlers =
    trigger === 'hover'
      ? {
          onMouseEnter: (e: React.MouseEvent) => {
            childOnMouseEnter?.(e);
            setOpen(true);
          },
          onMouseLeave: (e: React.MouseEvent) => {
            childOnMouseLeave?.(e);
            setOpen(false);
          },
          onFocus: (e: React.FocusEvent) => {
            childOnFocus?.(e);
            setOpen(true);
          },
          onBlur: (e: React.FocusEvent) => {
            childOnBlur?.(e);
            setOpen(false);
          },
          // On hover devices, click should run the child's original action;
          // the tooltip is already shown via hover/focus and will close on outside click.
          onClick: childOnClick,
        }
      : {
          // On touch devices, run the child's action and toggle the tooltip too.
          onClick: (e: React.MouseEvent) => {
            childOnClick?.(e);
            setOpen((v) => !v);
          },
        };

  const child = isValidElement(children)
    ? cloneElement(children as React.ReactElement, {
        ref: (node: HTMLElement) => {
          anchorRef.current = node;
          const orig = (children as any).ref;
          if (typeof orig === 'function') orig(node);
          else if (orig && typeof orig === 'object') (orig as any).current = node;
        },
        ...handlers,
      })
    : (
        <span
          ref={(n) => {
            anchorRef.current = n;
          }}
          {...handlers}
        >
          {children}
        </span>
      );

  return (
    <>
      {child}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={tooltipRef}
                role="tooltip"
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  maxWidth,
                  zIndex: 9999,
                }}
                className={`pointer-events-auto bg-white border border-surface-container-highest rounded-2xl shadow-ambient px-3.5 py-2.5 text-xs text-on-surface ${className}`}
              >
                {resolvedTitle ? (
                  <div className="font-bold text-primary mb-1 text-[11px] uppercase tracking-wider">
                    {resolvedTitle}
                  </div>
                ) : null}
                <div className="text-on-surface-variant font-medium leading-relaxed">
                  {resolvedBody}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

export default HelperTooltip;
