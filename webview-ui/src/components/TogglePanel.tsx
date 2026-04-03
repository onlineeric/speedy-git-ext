import { useGraphStore } from '../stores/graphStore';
import { SearchWidget } from './SearchWidget';
import { FilterWidget } from './FilterWidget';
import { CompareWidget } from './CompareWidget';

export function TogglePanel() {
  const activeToggleWidget = useGraphStore((state) => state.activeToggleWidget);

  if (activeToggleWidget === 'search') return <SearchWidget />;
  if (activeToggleWidget === 'filter') return <FilterWidget />;
  if (activeToggleWidget === 'compare') return <CompareWidget />;
  return null;
}
