import { Community } from '@/components/community/community'
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) { const { handle } = await params; return <Community view="profile" handle={handle} /> }
