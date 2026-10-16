import { KBarResults, useMatches } from 'kbar';
import ResultItem from './result-item';

export default function RenderResults() {
  const { results, rootActionId } = useMatches();

  return (
    <KBarResults
      items={results}
      // oxlint-disable-next-line react/no-unstable-nested-components -- kbar calls onRender as a function, not as a component
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div className='text-muted-foreground px-4 py-2 text-sm uppercase'>{item}</div>
        ) : (
          <ResultItem action={item} active={active} currentRootActionId={rootActionId ?? ''} />
        )
      }
    />
  );
}
