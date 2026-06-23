import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 订阅某群的 group_pulse 变化（check_ins 有增删时触发），收到信号即回调刷新。
// 注意：脉冲只携带 group_id，不含任何姓名。
export function usePulse(groupId, onPulse) {
  useEffect(() => {
    if (!groupId) return
    const channel = supabase
      .channel(`pulse:${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_pulse', filter: `group_id=eq.${groupId}` },
        () => onPulse()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, onPulse])
}
