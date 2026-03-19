import { useEffect, useState } from 'react';
import { buildGravatarUrl, getAvatarBackgroundColor, getGravatarCacheState, getInitials, setGravatarCacheState } from '../utils/gravatar';
import { useGraphStore } from '../stores/graphStore';

interface AuthorAvatarProps {
  author: string;
  email: string;
}

export function AuthorAvatar({ author, email }: AuthorAvatarProps) {
  const cachedState = getGravatarCacheState(email);
  const gitHubAvatarUrl = useGraphStore((s) => s.gitHubAvatarUrls[email.toLowerCase()]);
  const [loadState, setLoadState] = useState<{ email: string; state: 'loading' | 'loaded' | 'failed' }>(() => ({
    email,
    state: cachedState ?? 'loading',
  }));

  useEffect(() => {
    // Skip Gravatar loading if we have a GitHub avatar
    if (gitHubAvatarUrl) return;
    if (cachedState === 'loaded' || cachedState === 'failed') {
      return;
    }

    const image = new Image();
    setGravatarCacheState(email, 'loading');
    image.src = buildGravatarUrl(email);
    image.onload = () => {
      setGravatarCacheState(email, 'loaded');
      setLoadState({ email, state: 'loaded' });
    };
    image.onerror = () => {
      setGravatarCacheState(email, 'failed');
      setLoadState({ email, state: 'failed' });
    };
  }, [cachedState, email, gitHubAvatarUrl]);

  const initials = getInitials(author);
  const backgroundColor = getAvatarBackgroundColor(email);
  const title = email ? `${author} <${email}>` : author;
  const effectiveState = loadState.email === email ? loadState.state : cachedState ?? 'loading';
  const avatarSrc = gitHubAvatarUrl ?? (effectiveState === 'loaded' ? buildGravatarUrl(email) : null);

  return (
    <div
      className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor }}
      title={title}
      aria-hidden="true"
    >
      <span>{initials}</span>
      {avatarSrc && (
        <img
          src={avatarSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            if (!gitHubAvatarUrl) {
              setGravatarCacheState(email, 'failed');
              setLoadState({ email, state: 'failed' });
            }
          }}
        />
      )}
    </div>
  );
}
