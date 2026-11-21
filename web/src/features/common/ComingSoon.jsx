import { Page, TileIcon } from '@/components/layout/AppShell'
import { Card } from '@/components/ui'

/** Placeholder for modules scheduled for the next porting phase. */
export default function ComingSoon({ service }) {
  return (
    <Page title={service?.label || 'غير موجود'}>
      <Card className="mx-4 p-8 text-center">
        <div className="flex justify-center mb-4"><TileIcon icon={service?.icon || 'info-circle-bold'} tone={service?.tone || 'muted'} size={64} /></div>
        <div className="text-base font-extrabold mb-1">{service ? 'هذه الوحدة في المرحلة القادمة' : 'الصفحة غير موجودة'}</div>
        <div className="text-[13px] text-ink-muted leading-7">{service ? 'التصميم جاهز في النسخة السابقة، ويُنقل إلى البنية الجديدة مرتبطًا بقاعدة البيانات.' : 'تحقق من الرابط أو عُد للرئيسية.'}</div>
      </Card>
    </Page>
  )
}
