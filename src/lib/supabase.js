import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey || anonKey.startsWith('PASTE_')) {
  console.warn('[meal-stats] 请在 .env 中填好 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false }
})
