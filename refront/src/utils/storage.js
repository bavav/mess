export const getToken = () => localStorage.getItem('token')
export const setToken = (token) => localStorage.setItem('token', token)

export const getUserId = () => localStorage.getItem('userId')
export const setUserId = (id) => localStorage.setItem('userId', id)

export const getPrivateKey = () => localStorage.getItem('private_key')
export const setPrivateKey = (key) => localStorage.setItem('private_key', key)

export const getPublicKey = () => localStorage.getItem('public_key')
export const setPublicKey = (key) => localStorage.setItem('public_key', key)

export const getChatKeys = () => {
  try {
    return JSON.parse(localStorage.getItem('chat_keys') || '{}')
  } catch {
    return {}
  }
}

export const setChatKeys = (keys) => {
  localStorage.setItem('chat_keys', JSON.stringify(keys))
}

export const getFileMetadataCache = () => {
  try {
    return JSON.parse(localStorage.getItem('file_metadata') || '{}')
  } catch {
    return {}
  }
}

export const setFileMetadataCache = (cache) => {
  localStorage.setItem('file_metadata', JSON.stringify(cache))
}

export const clearAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('userId')
}