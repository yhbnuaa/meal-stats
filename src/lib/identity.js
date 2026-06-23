// 本地身份与「我的群」列表，全部存 localStorage（成员免登录）

const DEVICE_KEY = 'meal:device_id'
const GROUPS_KEY = 'meal:groups'        // [{ code, name }]
const NAME_PREFIX = 'meal:name:'        // meal:name:<code> -> 昵称

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    const c = typeof crypto !== 'undefined' ? crypto : null
    id = (c && typeof c.randomUUID === 'function' && c.randomUUID()) ||
      'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function getName(code) {
  return localStorage.getItem(NAME_PREFIX + code) || ''
}

export function setName(code, name) {
  localStorage.setItem(NAME_PREFIX + code, name)
}

export function getMyGroups() {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]')
  } catch {
    return []
  }
}

export function rememberGroup(code, name) {
  const list = getMyGroups().filter((g) => g.code !== code)
  list.unshift({ code, name })
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list.slice(0, 20)))
}

export function forgetGroup(code) {
  const list = getMyGroups().filter((g) => g.code !== code)
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list))
}
