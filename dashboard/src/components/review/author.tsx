import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ago, when } from "@/lib/fmt";
import { cn } from "@/lib/utils";

type Who = { author: string | null; author_avatar_url?: string | null; author_url?: string | null };

/** Round GitHub avatar; the initial on a muted disc when the image is missing or fails (demo logins are fake). */
function Face({ who, px }: { who: Who; px: 20 | 24 }) {
  return (
    <Avatar className={px === 20 ? "size-5" : "size-6"}>
      <AvatarImage src={who.author_avatar_url ?? undefined} alt="" width={px} height={px} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      <AvatarFallback className={cn("bg-accent font-medium text-foreground/70", px === 20 ? "text-[10px]" : "text-xs")}>{(who.author ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** List rows: 20px avatar and @login. */
export const Author = ({ who }: { who: Who }) =>
  who.author ? (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Face who={who} px={20} />
      <span className="truncate">@{who.author}</span>
    </span>
  ) : (
    <span>unknown author</span>
  );

/** Headers: 24px avatar, "Opened by @login" (a link to their GitHub profile when known) and how long ago. */
export function OpenedBy({ who, at }: { who: Who; at: string }) {
  if (!who.author) return <span>Opened by an unknown author · <span suppressHydrationWarning title={when(at)}>{ago(at)}</span></span>;
  const name = `@${who.author}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <Face who={who} px={24} />
      <span>
        Opened by{" "}
        {who.author_url ? (
          <a href={who.author_url} target="_blank" rel="noreferrer" className="link-grow hover:text-foreground">{name}</a>
        ) : (
          name
        )}
        {" · "}
        <span suppressHydrationWarning title={when(at)}>{ago(at)}</span>
      </span>
    </span>
  );
}
