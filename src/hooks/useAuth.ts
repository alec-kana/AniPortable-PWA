import { useEffect, useState } from "react"
import { checkAuth, login, logout as authLogout, subscribeAuthChange } from "../lib/auth"

export interface User {
  id: number
  name: string
  avatar: {
    medium: string
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => checkAuth().user)
  const [loading, setLoading] = useState(false)

  useEffect(() => subscribeAuthChange(() => setUser(checkAuth().user)), [])

  const logout = async () => {
    setLoading(true)
    await authLogout()
    setUser(null)
    setLoading(false)
  }

  return { user, loading, login, logout }
}
