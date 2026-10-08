import { Badge } from '@/components/ui/badge';
import { getTaetigkeitsbereich, TAETIGKEITSBEREICH_LABEL } from '../lib/taetigkeitsbereich';

export function TaetigkeitsbereichBadge({
  reqIndustry,
  className
}: {
  reqIndustry: number;
  className?: string;
}) {
  const bereich = getTaetigkeitsbereich(reqIndustry);
  if (!bereich) return null;

  return (
    <Badge variant={bereich === 'militaerisch' ? 'default' : 'outline'} className={className}>
      {TAETIGKEITSBEREICH_LABEL[bereich]}
    </Badge>
  );
}
