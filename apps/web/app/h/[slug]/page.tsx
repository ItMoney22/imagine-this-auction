import { Community } from '@/components/community/community'
export default async function HousePage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <Community view="house" slug={slug} /> }
