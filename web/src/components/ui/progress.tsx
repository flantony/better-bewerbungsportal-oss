'use client';

import * as React from 'react';
import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

import { cn } from '@/lib/utils';

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: ProgressPrimitive.Root.Props & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      value={value}
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <ProgressPrimitive.Track className='h-full w-full'>
        <ProgressPrimitive.Indicator
          data-slot='progress-indicator'
          className={cn('bg-primary h-full transition-all', indicatorClassName)}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
