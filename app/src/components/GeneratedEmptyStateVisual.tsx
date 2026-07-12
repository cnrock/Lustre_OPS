import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type GeneratedEmptyStateVisualProps = {
  src: string;
  alt: string;
  fallbackIcon: LucideIcon;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export function GeneratedEmptyStateVisual({
  src,
  alt,
  fallbackIcon: FallbackIcon,
  className,
  imageClassName,
  fallbackClassName,
}: GeneratedEmptyStateVisualProps) {
  const [failed, setFailed] = useState(false);
  const imagePath = `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;

  return (
    <div className={cn('flex h-24 w-full items-center justify-center sm:h-[120px]', className)}>
      {failed ? (
        <FallbackIcon
          aria-hidden="true"
          data-testid="generated-empty-state-fallback"
          className={cn('h-8 w-8 text-[#10B981]', fallbackClassName)}
        />
      ) : (
        <img
          src={imagePath}
          alt={alt}
          width={640}
          height={320}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('h-24 w-auto max-w-full object-contain sm:h-[120px]', imageClassName)}
        />
      )}
    </div>
  );
}
