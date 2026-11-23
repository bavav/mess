const API_BASE = '/api/v1'

const headers = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
})

export const loginUser = async (login, password, publicKey) => {
  const res = await fetch(`${API_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password, public_key: publicKey })
  })
  return res.json()
}
export const  generateInviteLink= async (chatId) => {
  return `${window.location.origin}/?join=${chatId}`;
}
export const registerUser = async (login, password, publicKey) => {
  const res = await fetch(`${API_BASE}/users/reg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password, public_key: publicKey })
  })
  return res.json()
}

export const getChats = async (userId, token) => {
  const res = await fetch(`${API_BASE}/users/${userId}/chats?user_id=${userId}`, {
    method: 'GET',
    headers: headers(token)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const getChatMessages = async (chatId, userId, token, page = 1, perPage = 50) => {
  const res = await fetch(
    `${API_BASE}/chats/${chatId}/messages?user_id=${userId}&page=${page}&per_page=${perPage}`,
    { method: 'GET', headers: headers(token) }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const sendMessage = async (chatId, data, token) => {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages?user_id=${data.user_id}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data)
  })
  return res.json()
}

export const createChat = async (data, userId, token) => {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      participant_ids: data.participants.split(',').filter(Boolean),
      name: data.name,
      desk: data.description,
      user_id: userId,
      chat_key_hash: data.chat_key_hash,
      coded_key: data.coded_key
    })
  })
  return res.json()
}

export const joinChat = async (chatId, userId, keyHash, codedKey, token) => {
  const res = await fetch(`${API_BASE}/chats/${chatId}/accept-invite`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ key_hash: keyHash, coded_key: codedKey })
  })
  return res.json()
}

export const getChatById = async (chatId, token) => {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, {
    method: 'GET',
    headers: headers(token)
  })
  return res.json()
}

export const getUserById = async (userId, token) => {
  const res = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'GET',
    headers: headers(token)
  })
  return res.json()
}

export const getUserKeys = async (userId, token) => {
  const res = await fetch(`${API_BASE}/users/${userId}/keys`, {
    method: 'GET',
    headers: headers(token)
  })
  return res.json()
}

export const uploadBlob = async (blobHash, blob, token) => {
  const res = await fetch(`${API_BASE}/blobs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Blob-Hash': blobHash,
      'Content-Type': 'application/octet-stream'
    },
    body: blob
  })
  return res.json()
}

export const downloadBlob = async (blobHash, token) => {
  const res = await fetch(`${API_BASE}/blobs/${blobHash}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.arrayBuffer()
}

export const setUserAvatar = async (userId, file, token) => {
  const formData = new FormData()
  formData.append('user_id', userId)
  formData.append('file', file)
  
  const res = await fetch(`${API_BASE}/setAvatar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  })
  return res.json()
}

export const setChatAvatar = async (chatId, userId, file, token) => {
  const formData = new FormData()
  formData.append('user_id', userId)
  formData.append('chat_id', chatId)
  formData.append('file', file)
  
  const res = await fetch(`${API_BASE}/setChatAvatar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  })
  return res.json()
}