// 对 Supabase RPC 的薄封装。所有读写都走这里。
import { supabase } from './supabase'

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  if (data && data.error) throw new ApiError(data.error, data)
  return data
}

export class ApiError extends Error {
  constructor(code, payload) {
    super(code)
    this.code = code
    this.payload = payload
  }
}

// 成员侧
export const createGroup = (name, password) =>
  rpc('create_group', { p_name: name, p_password: password })

export const joinGroup = (code, memberId, name) =>
  rpc('join_group', { p_code: code, p_member_id: memberId, p_name: name })

export const getMemberState = (code, memberId) =>
  rpc('get_member_state', { p_code: code, p_member_id: memberId })

export const toggleCheckin = (code, memberId, meal) =>
  rpc('toggle_checkin', { p_code: code, p_member_id: memberId, p_meal: meal })

// 管理侧（均需密码）
export const verifyAdmin = (code, password) =>
  rpc('verify_group_admin', { p_code: code, p_password: password })

export const getAdminConfig = (code, password) =>
  rpc('get_admin_config', { p_code: code, p_password: password })

export const getAdminDay = (code, password, date) =>
  rpc('get_admin_day', { p_code: code, p_password: password, p_date: date })

export const setWindows = (code, password, ls, le, ds, de) =>
  rpc('set_windows', { p_code: code, p_password: password, ls, le, ds, de })

export const listMembers = (code, password) =>
  rpc('list_members', { p_code: code, p_password: password })

export const setMemberStatus = (code, password, memberId, status) =>
  rpc('set_member_status', { p_code: code, p_password: password, p_member_id: memberId, p_status: status })

export const resetGroupCode = (code, password) =>
  rpc('reset_group_code', { p_code: code, p_password: password })
