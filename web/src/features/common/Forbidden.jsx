import { Page } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui'

export default function Forbidden() {
  return <Page title="غير مسموح"><EmptyState icon="shield-check-bold">ليست لديك صلاحية الوصول إلى هذه الصفحة</EmptyState></Page>
}
