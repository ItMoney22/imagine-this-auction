import {Messages} from '@/components/community/messages'
export default async function Page({params}:{params:Promise<{id:string}>}){return <Messages conversationId={(await params).id}/>}
