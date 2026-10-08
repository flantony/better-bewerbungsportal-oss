'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PLATFORMS } from '../config/platforms';
import { KiConnectionField } from './ki-connection-field';

export function KiPlatformGuide() {
  return (
    <Tabs defaultValue={PLATFORMS[0].id}>
      {/* Umbrechen statt ueberstehen: bei 320px passen die drei Reiter nicht nebeneinander. */}
      <TabsList className='h-auto max-w-full flex-wrap'>
        {PLATFORMS.map((platform) => {
          const Icon = Icons[platform.icon];
          return (
            <TabsTrigger key={platform.id} value={platform.id} className='h-8'>
              <Icon className='h-4 w-4' />
              {platform.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {PLATFORMS.map((platform) => (
        <TabsContent key={platform.id} value={platform.id} className='space-y-4'>
          <p className='text-muted-foreground text-sm'>{platform.intro}</p>

          {platform.note && (
            <Alert>
              <Icons.info className='h-4 w-4' />
              <AlertDescription>{platform.note}</AlertDescription>
            </Alert>
          )}

          <ol className='space-y-4'>
            {platform.steps.map((step, index) => (
              <li key={step.title} className='flex gap-3'>
                <span className='bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium'>
                  {index + 1}
                </span>
                <div className='min-w-0 flex-1 space-y-2'>
                  <p className='text-sm font-medium'>{step.title}</p>
                  <p className='text-muted-foreground text-sm'>{step.detail}</p>
                  {step.showsUrl && <KiConnectionField />}
                </div>
              </li>
            ))}
          </ol>

          {platform.requirement && (
            <p className='text-muted-foreground text-xs'>{platform.requirement}</p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
