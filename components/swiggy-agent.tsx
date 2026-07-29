'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ShoppingBag,
  ArrowUp,
  Loader2,
  Sun,
  Moon,
  Wrench,
  ChevronDown,
  Coins,
  Menu,
  Check,
  X,
  SquarePen,
} from 'lucide-react'

import { SwiggyIcon, SwiggyLockup } from '@/components/swiggy-logo'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { conversationTitle, useChatStore } from '@/store/chat'
import { streamChat } from '@/lib/chat-client'
import type {
  AgentMode,
  ChatMessage,
  Conversation,
  TimelineItem,
  TimelineTool,
} from '@/types/agent'

/* ----------------------------------------------------------------------------
 * Static config (prompts & copy only — every piece of conversation data is real)
 * ------------------------------------------------------------------------- */

const QUICK_ACTIONS = [
  {
    icon: <span className="text-lg leading-none">🍔</span>,
    title: 'Order Food',
    sub: 'Search restaurants',
    prompt: 'I want to order biryani',
  },
  {
    icon: <span className="text-lg leading-none">🥛</span>,
    title: 'Reorder Groceries',
    sub: 'Instamart instant',
    prompt: 'Show my go-to grocery items',
  },
  {
    icon: <span className="text-lg leading-none">🍽</span>,
    title: 'Book a Table',
    sub: 'Dineout reservation',
    prompt: 'Book a table for 2 tonight at 8pm',
  },
  {
    icon: <span className="text-lg leading-none">🌆</span>,
    title: 'Evening Planner',
    sub: 'Food + Dineout',
    prompt: 'Plan my evening — dinner out + late night delivery',
  },
]

const NAV_CHIPS: { id: AgentMode; label: string; emoji: string }[] = [
  { id: 'food', label: 'Food', emoji: '🍔' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'dineout', label: 'Dine Out', emoji: '🍽' },
]

const SUGGESTIONS: Record<AgentMode, { emoji: string; label: string }[]> = {
  food: [
    { emoji: '🍔', label: 'Order biryani near me' },
    { emoji: '🍕', label: 'Find pizza under ₹300' },
    { emoji: '🧾', label: "What's in my food cart?" },
  ],
  groceries: [
    { emoji: '🥛', label: 'Refill my groceries' },
    { emoji: '🛒', label: 'Show my go-to items' },
    { emoji: '🥚', label: 'Add eggs and bread' },
  ],
  dineout: [
    { emoji: '🍽', label: 'Table for 2 tonight' },
    { emoji: '🕗', label: 'Free slots around 8 PM' },
    { emoji: '🥂', label: 'Find a place nearby' },
  ],
}

const PLACEHOLDER: Record<AgentMode, string> = {
  food: 'Order food, check your cart, or track an order...',
  groceries: 'Refill groceries from Instamart — milk, bread, eggs...',
  dineout: 'Book a table — cuisine, time, party size...',
}

const EMPTY_COPY: Record<AgentMode, string> = {
  food: 'Search restaurants, build a cart, and order — just ask.',
  groceries: 'Reorder your essentials from Instamart in one line.',
  dineout: 'Find a restaurant and lock in a free table tonight.',
}

/** Live LLM endpoint, resolved server-side in app/page.tsx and shown in the footer. */
export interface ProviderBadge {
  /** Provider display name, e.g. "NVIDIA NIM". */
  label: string
  /** Full model id, surfaced as a tooltip. */
  model: string
  /** Model id minus the vendor prefix — what's rendered. */
  shortModel: string
}

/** Reused from the pre-port app: detects an agent turn that awaits a yes/no. */
const CONFIRM_RE = /\b(yes\s*\/\s*no|confirm\??|shall i)\b/i

/* ----------------------------------------------------------------------------
 * Formatting helpers
 * ------------------------------------------------------------------------- */

function formatINR(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `₹${rounded.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function relativeTime(ts?: number): string {
  if (!ts) return ''
  const minutes = Math.floor((Date.now() - ts) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yest'
  if (days < 7) return new Date(ts).toLocaleDateString(undefined, { weekday: 'short' })
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/* ----------------------------------------------------------------------------
 * Markdown rendering — react-markdown + remark-gfm, styled to the v0 language
 * ------------------------------------------------------------------------- */

/** Lets the `code` renderer tell fenced blocks apart from inline spans. */
const InsidePre = React.createContext(false)

const markdownComponents: Components = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-text-secondary line-through">{children}</del>,

  h1: ({ children }) => (
    <h1 className="font-display text-lg font-semibold tracking-tight text-text-primary">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display text-base font-semibold tracking-tight text-text-primary">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-text-secondary">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="font-display text-sm font-semibold text-text-primary">{children}</h4>
  ),

  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-1 pl-5 leading-relaxed marker:text-accent">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5 leading-relaxed marker:text-accent">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2 transition-colors duration-150 hover:text-accent-hover"
    >
      {children}
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 bg-accent-muted/40 py-1 pl-3 text-text-secondary">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="border-border" />,

  table: ({ children }) => (
    <div className="swiggy-scroll my-2 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-t border-border transition-colors duration-150 first:border-t-0 hover:bg-surface-elevated/60">
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th className="bg-accent-muted px-3 py-2 text-left font-semibold text-accent" style={style}>
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="px-3 py-2 text-text-primary" style={style}>
      {children}
    </td>
  ),

  pre: ({ children }) => (
    <InsidePre.Provider value={true}>
      <pre className="swiggy-scroll overflow-x-auto rounded-xl border border-border bg-surface-elevated p-3 font-mono text-xs leading-relaxed text-text-primary">
        {children}
      </pre>
    </InsidePre.Provider>
  ),
  code: function CodeRenderer({ children }) {
    const insidePre = React.useContext(InsidePre)
    if (insidePre) {
      return <code className="font-mono">{children}</code>
    }
    return (
      <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
        {children}
      </code>
    )
  },
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-[0.95rem]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** User input is shown verbatim — never re-parsed as markdown. */
function PlainContent({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-[0.95rem]">
      <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * JSON syntax highlighter
 * ------------------------------------------------------------------------- */

function HighlightedJson({ data }: { data: unknown }) {
  const str = JSON.stringify(data, null, 2) ?? String(data)
  const nodes: React.ReactNode[] = []
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+\.?\d*)|(true|false|null)/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) nodes.push(str.slice(last, m.index))
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        nodes.push(
          <span key={key++} style={{ color: 'var(--text-secondary)' }}>
            {m[1]}
          </span>,
        )
        nodes.push(<span key={key++}>{m[2]}</span>)
      } else {
        nodes.push(
          <span key={key++} style={{ color: 'var(--accent)' }}>
            {m[1]}
          </span>,
        )
      }
    } else if (m[3] !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: '#60A5FA' }}>
          {m[3]}
        </span>,
      )
    } else if (m[4] !== undefined) {
      nodes.push(
        <span key={key++} style={{ color: '#A78BFA' }}>
          {m[4]}
        </span>,
      )
    }
    last = re.lastIndex
  }
  if (last < str.length) nodes.push(str.slice(last))
  return (
    <pre className="swiggy-scroll overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-primary">
      {nodes}
    </pre>
  )
}

/* ----------------------------------------------------------------------------
 * Theme toggle
 * ------------------------------------------------------------------------- */

/** false while rendering on the server / during hydration, true afterwards. */
const subscribeNoop = () => () => {}
function useMounted(): boolean {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = theme !== 'light'

  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full text-text-secondary hover:text-text-primary"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted ? (
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Sun
            className={cn(
              'absolute h-5 w-5 transition-opacity duration-200',
              isDark ? 'opacity-0' : 'opacity-100',
            )}
          />
          <Moon
            className={cn(
              'absolute h-5 w-5 transition-opacity duration-200',
              isDark ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      ) : (
        <span className="h-5 w-5" />
      )}
    </Button>
  )
}

/* ----------------------------------------------------------------------------
 * Status badge
 * ------------------------------------------------------------------------- */

function StatusBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-success/40 bg-transparent font-medium text-text-secondary"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
        Connected
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-accent/50 bg-transparent font-medium text-accent"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      Auth required
    </Badge>
  )
}

/* ----------------------------------------------------------------------------
 * Brand mark + footer
 * ------------------------------------------------------------------------- */

function BrandMark({ active }: { active?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex items-center">
        <SwiggyLockup className="h-6 w-auto" />
        {active && (
          // Anchored to the tile (~23px wide at h-6), not the end of the wordmark.
          <span className="absolute -top-1 left-[17px] h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-background" />
        )}
      </span>
      {/* Two marks, not one co-branded wordmark: Swiggy's orange lockup stays
          theirs, "Claw" is ours — set in the app's display face (Syne) so the
          header uses the same type system as the rest of the UI. The rule also
          spares us baseline-matching live text against the wordmark outlines. */}
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <span className="font-display text-[17px] font-semibold leading-none tracking-[-0.01em] text-text-primary">
        Claw
      </span>
    </div>
  )
}

function BrandFooter() {
  return (
    <div className="px-1 py-3 text-center">
      <Separator className="mb-3 bg-border" />
      <p className="flex items-center justify-center gap-1.5 font-sans text-sm text-text-secondary">
        Powered by <SwiggyLockup className="h-5 w-auto" />
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        Developed by{' '}
        <span className="cursor-pointer text-text-primary/80 underline-offset-2 hover:underline">
          Ishan Avasthi
        </span>
      </p>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------------- */

/** One row in the Recent list = one conversation, not one message. */
interface RecentEntry {
  id: string
  title: string
  time: string
  turns: number
  active: boolean
}

function SidebarContent({
  recent,
  onAction,
  onSelectConversation,
}: {
  recent: RecentEntry[]
  onAction: (prompt: string) => void
  onSelectConversation: (id: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="swiggy-scroll flex-1 overflow-y-auto p-4">
        <h2 className="mb-3 px-1 font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Quick Start
        </h2>
        <div className="flex flex-col gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.title}
              type="button"
              aria-label={a.title}
              onClick={() => onAction(a.prompt)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-all duration-150 ease-out hover:border-accent/50 hover:bg-surface-elevated"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated transition-colors duration-150 group-hover:bg-accent-muted">
                {a.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">
                  {a.title}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {a.sub}
                </span>
              </span>
            </button>
          ))}
        </div>

        <Separator className="my-5 bg-border" />

        <h2 className="mb-3 px-1 font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Recent
        </h2>
        {recent.length === 0 ? (
          <p className="px-2 text-xs leading-relaxed text-text-secondary">
            Your conversations show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-label={
                  r.active ? `Current conversation: ${r.title}` : `Open conversation: ${r.title}`
                }
                aria-current={r.active ? 'true' : undefined}
                disabled={r.active}
                onClick={() => onSelectConversation(r.id)}
                className={cn(
                  'group flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150',
                  r.active
                    ? 'cursor-default bg-accent-muted'
                    : 'hover:bg-surface-elevated'
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      'truncate text-sm transition-colors',
                      r.active
                        ? 'font-medium text-accent'
                        : 'text-text-secondary group-hover:text-text-primary'
                    )}
                  >
                    {r.title}
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    {r.turns} {r.turns === 1 ? 'message' : 'messages'}
                  </span>
                </span>
                {r.time && (
                  <span className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {r.time}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-3">
        <BrandFooter />
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Message bubbles
 * ------------------------------------------------------------------------- */

function UserBubble({ content }: { content: string }) {
  return (
    <div className="group flex justify-end gap-2.5">
      <div className="flex max-w-[75%] flex-col items-end">
        <div className="rounded-2xl rounded-tr-sm border border-accent/20 bg-accent-muted px-4 py-3 text-text-primary">
          <PlainContent text={content} />
        </div>
        <span className="mt-1 px-1 text-[10px] text-text-secondary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          You
        </span>
      </div>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent-muted text-sm font-semibold text-accent">
        I
      </span>
    </div>
  )
}

function AssistantBubble({
  content,
  streaming,
  loading,
}: {
  content: string
  streaming?: boolean
  loading?: boolean
}) {
  return (
    <div className="group flex justify-start gap-2.5">
      <SwiggyIcon className="mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
      <div className="flex min-w-0 max-w-[85%] flex-col items-start">
        <div className="min-w-0 rounded-2xl rounded-tl-sm border border-border bg-surface-elevated px-4 py-3 text-text-primary">
          {loading ? (
            <div className="flex flex-col gap-2 py-0.5">
              <Skeleton className="h-3 w-48 bg-border" />
              <Skeleton className="h-3 w-40 bg-border" />
              <Skeleton className="h-3 w-32 bg-border" />
            </div>
          ) : (
            <div className="flex min-w-0">
              <MarkdownContent text={content} />
              {streaming && (
                <span className="swiggy-cursor ml-0.5 font-semibold text-accent">
                  |
                </span>
              )}
            </div>
          )}
        </div>
        <span className="mt-1 px-1 text-[10px] text-text-secondary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          Swiggy claw
        </span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Tool call card
 * ------------------------------------------------------------------------- */

function ToolCallCard({ tool }: { tool: TimelineTool }) {
  const [open, setOpen] = React.useState(false)
  const executing = tool.status === 'executing'
  const error = tool.status === 'error'

  const resultPreview = React.useMemo(() => {
    if (error) return tool.error ?? 'Error'
    if (tool.result === undefined) return ''
    const s = JSON.stringify(tool.result) ?? ''
    return s.length > 60 ? `${s.slice(0, 60)}…` : s
  }, [tool, error])

  return (
    <div className="flex justify-start pl-[42px]">
      <div className="relative w-full max-w-[85%] overflow-hidden rounded-xl border border-border bg-tool-bg">
        {/* left accent bar */}
        <span
          className={cn(
            'absolute inset-y-0 left-0 w-[3px]',
            executing && 'swiggy-shimmer bg-accent',
            tool.status === 'resolved' && 'bg-success',
            error && 'bg-destructive',
          )}
        />
        <button
          type="button"
          aria-label={`Toggle ${tool.name} details`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-surface-elevated/40"
        >
          <Wrench className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          <span className="font-mono text-sm font-medium text-text-primary">
            {tool.name}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                executing && 'animate-pulse bg-accent',
                tool.status === 'resolved' && 'bg-success',
                error && 'bg-destructive',
              )}
            />
            <span
              className={cn(
                'text-xs font-medium',
                executing && 'text-accent',
                tool.status === 'resolved' && 'text-success',
                error && 'text-destructive',
              )}
            >
              {executing ? 'executing' : error ? 'error' : 'resolved'}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-text-secondary transition-transform duration-150',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>

        {!open && !executing && resultPreview && (
          <div className="border-t border-border px-3.5 py-2">
            <span
              className={cn(
                'font-mono text-xs',
                error ? 'text-destructive' : 'text-text-secondary',
              )}
            >
              → {resultPreview}
            </span>
          </div>
        )}

        {!open && executing && (
          <div className="border-t border-border px-3.5 py-2">
            <Skeleton className="h-3 w-40 bg-border" />
          </div>
        )}

        {open && (
          <div className="flex flex-col gap-3 border-t border-border px-3.5 py-3">
            <div>
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                args
              </span>
              <HighlightedJson data={tool.args} />
            </div>
            <div>
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                result
              </span>
              {executing ? (
                <span className="font-mono text-xs text-accent">
                  awaiting response…
                </span>
              ) : error ? (
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-xs text-destructive">
                    {tool.error ?? 'Tool call failed'}
                  </span>
                  {tool.result !== undefined && <HighlightedJson data={tool.result} />}
                </div>
              ) : (
                <HighlightedJson data={tool.result} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Confirmation card — sourced from the most recent cart-bearing tool result
 * ------------------------------------------------------------------------- */

interface CartLine {
  key: string
  name: string
  qty: number
  unitPrice: number
  lineTotal: number
}

interface CartSummary {
  title: string
  lines: CartLine[]
  subtotal: number
  deliveryFee: number
  discount?: number
  total: number
}

/**
 * Recognises a `SwiggyToolResponse<SwiggyCart | InstamartCart>` payload.
 * Anything else (searches, menus, bookings) returns null.
 */
function readCartSummary(result: unknown): CartSummary | null {
  if (!result || typeof result !== 'object') return null
  const envelope = result as { success?: unknown; data?: unknown }
  if (envelope.success !== true) return null

  const data = envelope.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return null
  if (!Array.isArray(data.items) || data.items.length === 0) return null
  if (typeof data.subtotal !== 'number' || typeof data.total !== 'number') return null

  const lines: CartLine[] = []
  data.items.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const item = raw as Record<string, unknown>
    if (typeof item.name !== 'string' || typeof item.lineTotal !== 'number') return
    lines.push({
      key: String(item.itemId ?? item.spinId ?? index),
      name: item.name,
      qty: typeof item.qty === 'number' ? item.qty : 0,
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
      lineTotal: item.lineTotal,
    })
  })
  if (lines.length === 0) return null

  return {
    // SwiggyCart carries restaurantId; InstamartCart does not.
    title: 'restaurantId' in data ? 'Order Summary' : 'Grocery Cart',
    lines,
    subtotal: data.subtotal,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    discount: typeof data.discount === 'number' && data.discount > 0 ? data.discount : undefined,
    total: data.total,
  }
}

/** Walk the timeline backwards for the freshest cart the agent has seen. */
function findLatestCart(timeline: TimelineItem[]): CartSummary | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i]
    if (item.kind !== 'tool' || item.status !== 'resolved') continue
    const summary = readCartSummary(item.result)
    if (summary) return summary
  }
  return null
}

function ConfirmationCard({
  summary,
  disabled,
  onConfirm,
  onCancel,
}: {
  summary: CartSummary
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [status, setStatus] = React.useState<'pending' | 'confirmed' | 'cancelled'>(
    'pending',
  )

  return (
    <div className="flex justify-start pl-[42px]">
      <div
        className="w-full max-w-[85%] rounded-2xl border-2 border-accent/40 bg-surface-elevated p-4"
        style={{ boxShadow: '0 0 24px rgba(252,128,25,0.08)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <ShoppingBag className="h-4.5 w-4.5 text-accent" />
          <h3 className="font-display text-base font-semibold text-text-primary">
            {summary.title}
          </h3>
        </div>

        <div className="swiggy-scroll overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-accent-muted text-accent">
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-center font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.map((l) => (
                <tr key={l.key} className="border-t border-border">
                  <td className="px-3 py-2 text-text-primary">{l.name}</td>
                  <td className="px-3 py-2 text-center font-mono text-text-secondary">
                    {l.qty}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-text-primary">
                    {formatINR(l.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={2} className="px-3 py-1.5 text-text-secondary">
                  Subtotal
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                  {formatINR(summary.subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="px-3 py-1.5 text-text-secondary">
                  Delivery fee
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                  {formatINR(summary.deliveryFee)}
                </td>
              </tr>
              {summary.discount !== undefined && (
                <tr>
                  <td colSpan={2} className="px-3 py-1.5 text-text-secondary">
                    Discount
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-success">
                    −{formatINR(summary.discount)}
                  </td>
                </tr>
              )}
              <tr className="border-t border-border bg-background/40">
                <td colSpan={2} className="px-3 py-2 font-semibold text-text-primary">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-text-primary">
                  {formatINR(summary.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 border-accent/30 bg-accent-muted font-medium text-accent"
          >
            <Coins className="h-3.5 w-3.5" />
            Cash on Delivery
          </Badge>
          {status !== 'pending' && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                status === 'confirmed' ? 'text-success' : 'text-destructive',
              )}
            >
              {status === 'confirmed' ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Confirming…
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" /> Cancelling…
                </>
              )}
            </span>
          )}
        </div>

        {status === 'pending' && (
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1 bg-accent font-medium text-white hover:bg-accent-hover"
              disabled={disabled}
              onClick={() => {
                setStatus('confirmed')
                onConfirm()
              }}
            >
              Confirm Order
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-border text-text-primary hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              disabled={disabled}
              onClick={() => {
                setStatus('cancelled')
                onCancel()
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Fallback for when the agent asks for a yes/no but no cart payload exists yet
 * (e.g. a Dineout booking, or a "shall I clear your cart?" prompt).
 */
function ConfirmPrompt({
  disabled,
  onConfirm,
  onCancel,
}: {
  disabled: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex justify-start pl-[42px]">
      <div className="flex w-full max-w-[85%] items-center gap-2 rounded-xl border border-accent/30 bg-surface-elevated px-3.5 py-3">
        <span className="mr-auto text-sm text-text-secondary">
          Waiting on your confirmation
        </span>
        <Button
          size="sm"
          className="bg-accent font-medium text-white hover:bg-accent-hover"
          disabled={disabled}
          onClick={onConfirm}
        >
          <Check className="h-3.5 w-3.5" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-border text-text-primary hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
          disabled={disabled}
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Empty state
 * ------------------------------------------------------------------------- */

function EmptyState({
  mode,
  onPick,
}: {
  mode: AgentMode
  onPick: (text: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <SwiggyIcon className="mb-4 h-16 w-16 rounded-2xl" />
      <h2 className="font-display text-2xl font-semibold text-text-primary">
        What can I get you?
      </h2>
      <p className="mt-2 max-w-sm text-pretty text-sm text-text-secondary">
        {EMPTY_COPY[mode]}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS[mode].map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text-primary transition-all duration-150 ease-out hover:border-accent/50 hover:bg-surface-elevated"
          >
            <span>{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Input bar
 * ------------------------------------------------------------------------- */

function InputBar({
  value,
  placeholder,
  onChange,
  onSend,
  streaming,
  textareaRef,
  provider,
}: {
  value: string
  placeholder: string
  onChange: (v: string) => void
  onSend: () => void
  streaming: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  provider?: ProviderBadge
}) {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }

  const canSend = value.trim().length > 0 && !streaming

  return (
    <div className="sticky bottom-0 border-t border-border bg-background/90 p-4 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <div className="flex flex-1 items-end rounded-2xl border border-border bg-surface-elevated transition-colors duration-150 focus-within:border-accent/60">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={streaming}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Message Swiggy claw"
            className="swiggy-scroll max-h-[140px] w-full resize-none bg-transparent px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-50"
          />
        </div>
        <Button
          size="icon"
          aria-label={streaming ? 'Generating response' : 'Send message'}
          disabled={!canSend}
          onClick={onSend}
          className="h-11 w-11 shrink-0 rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
        >
          {streaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ArrowUp className="h-5 w-5" />
          )}
        </Button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-text-secondary">
        ⌘↵ to send · Powered by{' '}
        {provider ? (
          <>
            {provider.label}{' '}
            {/* Full id on hover — the display form drops the vendor prefix. */}
            <span className="font-mono" title={provider.model}>
              {provider.shortModel}
            </span>
          </>
        ) : (
          'an OpenAI-compatible LLM'
        )}{' '}
        + Swiggy MCP
      </p>
    </div>
  )
}

/* ----------------------------------------------------------------------------
 * Recent list derivation (real history, newest first, de-duplicated)
 * ------------------------------------------------------------------------- */

function deriveRecent(
  conversationId: string,
  messages: ChatMessage[],
  conversations: Conversation[]
): RecentEntry[] {
  const rows: RecentEntry[] = []

  // The live conversation leads the list, but only once it has a user turn —
  // an untouched "New chat" shouldn't create a phantom row.
  const turns = messages.filter((m) => m.role === 'user' && m.content.trim()).length
  if (turns > 0) {
    const last = messages[messages.length - 1]
    rows.push({
      id: conversationId,
      title: conversationTitle(messages),
      time: relativeTime(last?.ts),
      turns,
      active: true,
    })
  }

  for (const c of conversations) {
    if (c.id === conversationId) continue
    rows.push({
      id: c.id,
      title: c.title,
      time: relativeTime(c.updatedAt),
      turns: c.messageCount,
      active: false,
    })
  }

  return rows.slice(0, 8)
}

/* ----------------------------------------------------------------------------
 * Main component
 * ------------------------------------------------------------------------- */

export default function SwiggyAgent({ provider }: { provider?: ProviderBadge }) {
  const timeline = useChatStore((s) => s.timeline)
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const connected = useChatStore((s) => s.connected)
  const mode = useChatStore((s) => s.mode)
  const conversationId = useChatStore((s) => s.conversationId)
  const conversations = useChatStore((s) => s.conversations)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const hydrate = useChatStore((s) => s.hydrate)
  const setMode = useChatStore((s) => s.setMode)
  const reset = useChatStore((s) => s.reset)

  const [input, setInput] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    hydrate()
  }, [hydrate])

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [timeline, scrollToBottom])

  const focusInput = () => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const prefill = React.useCallback((text: string) => {
    setInput(text)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  /** The one real send path: user text -> SSE -> timeline reducer. */
  const send = React.useCallback(async (raw: string) => {
    const text = raw.trim()
    const store = useChatStore.getState()
    if (!text || store.isStreaming) return

    // Prior turns only — addUserMessage appends this one.
    const history = store.messages

    store.addUserMessage(text)
    store.beginAssistant()
    store.setStreaming(true)

    const { unauthenticated } = await streamChat(
      text,
      history,
      (e) => {
        const s = useChatStore.getState()
        switch (e.type) {
          case 'text_delta':
            s.appendAssistantDelta(e.payload)
            break
          case 'tool_call':
            s.addToolCall(e.payload)
            break
          case 'tool_result':
            s.resolveToolCall(e.payload.id, e.payload.result)
            break
          case 'notice':
            toast.message(e.payload)
            break
          case 'error':
            toast.error(e.payload)
            s.abortAssistant()
            break
          case 'done':
            break
        }
      },
      { mode: store.mode },
    )

    const s = useChatStore.getState()
    s.setConnected(!unauthenticated)
    s.finaliseAssistantMessage()
    s.setStreaming(false)
  }, [])

  const handleSend = React.useCallback(() => {
    const text = input.trim()
    if (!text || useChatStore.getState().isStreaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    void send(text)
  }, [input, send])

  const recent = React.useMemo(
    () => deriveRecent(conversationId, messages, conversations),
    [conversationId, messages, conversations]
  )

  // Confirmation: same heuristic the pre-port app used, on the last agent turn.
  const lastMessage = messages[messages.length - 1]
  const awaitingConfirm =
    !isStreaming &&
    lastMessage?.role === 'assistant' &&
    CONFIRM_RE.test(lastMessage.content)

  const cart = React.useMemo(
    () => (awaitingConfirm ? findLatestCart(timeline) : null),
    [awaitingConfirm, timeline],
  )

  const confirmOrder = React.useCallback(() => {
    void send('yes')
  }, [send])
  const cancelOrder = React.useCallback(() => {
    void send('no')
  }, [send])

  const agentActive = isStreaming
  const isEmpty = timeline.length === 0

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh flex-col bg-background text-text-primary">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
          {/* Mobile sidebar trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-text-secondary md:hidden"
                aria-label="Open quick actions"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-border bg-surface p-0"
            >
              <SheetTitle className="sr-only">Quick actions</SheetTitle>
              <SidebarContent
              recent={recent}
              onAction={prefill}
              onSelectConversation={selectConversation}
            />
            </SheetContent>
          </Sheet>

          <BrandMark active={agentActive} />

          {/* Center nav chips — drive the agent's tool preference */}
          <nav className="ml-2 hidden items-center gap-1.5 sm:flex">
            {NAV_CHIPS.map((c) => {
              const active = mode === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMode(c.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-all duration-150 ease-out',
                    active
                      ? 'border-accent bg-accent text-white'
                      : 'border-border bg-transparent text-text-secondary hover:border-accent/40 hover:text-text-primary',
                  )}
                >
                  <span>{c.emoji}</span>
                  {c.label}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <StatusBadge connected={connected} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-text-secondary hover:text-text-primary"
              aria-label="New chat"
              disabled={isStreaming}
              onClick={() => {
                reset()
                setInput('')
                focusInput()
              }}
            >
              <SquarePen className="h-5 w-5" />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar (desktop) */}
          <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
            <SidebarContent
              recent={recent}
              onAction={prefill}
              onSelectConversation={selectConversation}
            />
          </aside>

          {/* Chat column */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="swiggy-scroll flex-1 overflow-y-auto"
            >
              {isEmpty ? (
                <EmptyState mode={mode} onPick={prefill} />
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
                  {timeline.map((it) => {
                    if (it.kind === 'message') {
                      return it.role === 'user' ? (
                        <UserBubble key={it.id} content={it.content} />
                      ) : (
                        <AssistantBubble
                          key={it.id}
                          content={it.content}
                          streaming={it.streaming}
                          loading={it.loading}
                        />
                      )
                    }
                    return <ToolCallCard key={it.id} tool={it} />
                  })}

                  {awaitingConfirm &&
                    (cart ? (
                      <ConfirmationCard
                        key={`confirm-${timeline.length}`}
                        summary={cart}
                        disabled={isStreaming}
                        onConfirm={confirmOrder}
                        onCancel={cancelOrder}
                      />
                    ) : (
                      <ConfirmPrompt
                        key={`confirm-plain-${timeline.length}`}
                        disabled={isStreaming}
                        onConfirm={confirmOrder}
                        onCancel={cancelOrder}
                      />
                    ))}
                </div>
              )}
            </div>

            <InputBar
              value={input}
              placeholder={PLACEHOLDER[mode]}
              onChange={setInput}
              onSend={handleSend}
              streaming={isStreaming}
              textareaRef={textareaRef}
              provider={provider}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
