import { AuthorAvatar } from './AuthorAvatar';

interface AuthorBadgeProps {
  name: string;
  email: string;
  onRemove?: () => void;
  className?: string;
  inheritTextColor?: boolean;
  showBorder?: boolean;
}

export function AuthorBadge({
  name,
  email,
  onRemove,
  className,
  inheritTextColor = false,
  showBorder = true,
}: AuthorBadgeProps) {
  const textColorClass = inheritTextColor
    ? 'text-inherit'
    : 'text-[var(--vscode-badge-foreground)]';
  const borderClass = showBorder
    ? 'border border-[var(--vscode-badge-background)]'
    : 'border border-transparent';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${borderClass} ${textColorClass} ${className ?? ''}`}
    >
      <AuthorAvatar author={name} email={email} />
      <span className="truncate max-w-[120px]">{name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 flex-shrink-0 hover:text-[var(--vscode-errorForeground)] focus:outline-none"
          title={`Remove ${name}`}
          aria-label={`Remove ${name} from filter`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
