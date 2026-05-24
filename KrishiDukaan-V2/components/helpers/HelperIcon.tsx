'use client';

import { ReactNode } from 'react';
import { Info } from 'lucide-react';
import HelperTooltip from './HelperTooltip';
import { HelperTextKey } from '../../app/i18n/helperTexts';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface HelperIconProps {
  /** Optional raw content. Ignored if `textKey` is provided. */
  content?: ReactNode;
  /** Key into HELPER_TEXTS — preferred path for localized helpers. */
  textKey?: HelperTextKey;
  title?: string;
  side?: Side;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  ariaLabel?: string;
  variant?: 'default' | 'ghost' | 'onDark';
}

const SIZES = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
};

const BTN_SIZES = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
};

export function HelperIcon({
  content,
  textKey,
  title,
  side = 'top',
  className = '',
  size = 'sm',
  ariaLabel = 'More information',
  variant = 'default',
}: HelperIconProps) {
  const variantClass =
    variant === 'onDark'
      ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
      : variant === 'ghost'
      ? 'text-outline hover:text-primary hover:bg-primary/5'
      : 'text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10';

  return (
    <HelperTooltip content={content} textKey={textKey} title={title} side={side}>
      <button
        type="button"
        aria-label={ariaLabel}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${BTN_SIZES[size]} ${variantClass} ${className}`}
      >
        <Info className={SIZES[size]} />
      </button>
    </HelperTooltip>
  );
}

export default HelperIcon;
