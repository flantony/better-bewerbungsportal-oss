import { KBarResults, useMatches, type ActionImpl } from 'kbar';
import ResultItem from './result-item';

function ResultRow({
  item,
  active,
  currentRootActionId
}: {
  item: string | ActionImpl;
  active: boolean;
  currentRootActionId: string;
}) {
  if (typeof item === 'string') {
    return <div className='text-muted-foreground px-4 py-2 text-sm uppercase'>{item}</div>;
  }
  return <ResultItem action={item} active={active} currentRootActionId={currentRootActionId} />;
}

export default function RenderResults() {
  const { results, rootActionId } = useMatches();
  const currentRootActionId = rootActionId ?? '';

  return (
    <KBarResults
      items={results}
      onRender={(rowProps) => (
        <ResultRow {...rowProps} currentRootActionId={currentRootActionId} />
      )}
    />
  );
}