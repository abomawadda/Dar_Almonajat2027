import { useData } from '@/context/DataProvider'
import { Page, TileIcon } from '@/components/layout/AppShell'
import { Async, Button, Card, cx } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import { markAllRead, markRead } from '@/services/comms'
import { relTime } from '@/lib/format'

const ICONS = {
  admission: ['user-plus-rounded-bold', 'ok'], absence: ['calendar-mark-bold', 'bad'], hifz: ['book-bookmark-bold', 'gold'],
  behavior: ['star-bold', 'ok'], certificate: ['diploma-verified-bold', 'gold'], exam: ['document-add-bold', 'info']
}

export default function NotificationsPage() {
  const { notifications, badges } = useData()
  const [all, busy] = useAction(() => markAllRead(notifications))
  return (
    <Page title="الإشعارات" actions={badges.notifications > 0 && <Button size="xs" variant="outline" busy={busy} onClick={all}>قراءة الكل</Button>}>
      <Async data={notifications} empty="لا توجد إشعارات" emptyIcon="bell-bing-bold">
        <Card className="mx-4 px-4">
          {(notifications || []).slice(0, 100).map((n) => {
            const [icon, tone] = ICONS[n.type] || ['bell-bold', 'info']
            return (
              <button key={n.id} onClick={() => !n.isRead && markRead(n.id)} className={cx('w-full flex gap-3 py-3 border-b last:border-0 text-right', !n.isRead && 'bg-gradient-to-l from-transparent to-gold-50 -mx-4 px-4 w-[calc(100%+2rem)]')}>
                <TileIcon icon={icon} tone={tone} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{n.title}</div>
                  <div className="text-xs text-ink-muted mt-0.5 leading-5">{n.body}</div>
                  <div className="text-[10px] text-ink-muted mt-1">{relTime(n.createdAt)}</div>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-gold-500 mt-2" />}
              </button>
            )
          })}
        </Card>
      </Async>
    </Page>
  )
}
