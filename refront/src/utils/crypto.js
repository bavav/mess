import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { getPrivateKey, getChatKeys, setChatKeys, getUserId, getToken } from './storage'
import { getUserKeys } from './api'

// SHA-256 hash
export const sha256 = async (message) => {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export const sha256FromBytes = async (bytes) => {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate key pair
export const generateKeyPair = () => {
  const keyPair = nacl.sign.keyPair()
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey)
  }
}

// Get box keys from private key
export const getBoxKeys = () => {
  const privateKeyBase64 = getPrivateKey()
  if (!privateKeyBase64) return null
  
  const secretKey = naclUtil.decodeBase64(privateKeyBase64)
  const boxSecretKey = nacl.sign.keyPair.fromSecretKey(secretKey).secretKey.slice(0, 32)
  const signKeyPair = nacl.sign.keyPair.fromSecretKey(secretKey)
  const boxPublicKey = nacl.box.keyPair.fromSecretKey(boxSecretKey).publicKey
  
  return {
    secretKey: boxSecretKey,
    publicKey: boxPublicKey
  }
}

// Encrypt message with chat key
export const encryptMessage = async (chatKeyBase64, plaintext) => {
  const key = naclUtil.decodeBase64(chatKeyBase64)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = naclUtil.decodeUTF8(plaintext)
  const encrypted = nacl.secretbox(messageBytes, nonce, key)
  
  return {
    encrypted: naclUtil.encodeBase64(encrypted),
    nonce: naclUtil.encodeBase64(nonce)
  }
}

// Decrypt message with chat key
export const decryptMessage = async (chatKeyBase64, encryptedBase64, nonceBase64) => {
  const key = naclUtil.decodeBase64(chatKeyBase64)
  const decrypted = nacl.secretbox.open(
    naclUtil.decodeBase64(encryptedBase64),
    naclUtil.decodeBase64(nonceBase64),
    key
  )
  if (!decrypted) return null
  return naclUtil.encodeUTF8(decrypted)
}

// Save chat key
export const saveChatKey = (chatId, keyBase64) => {
  const keys = getChatKeys()
  keys[chatId] = keyBase64
  setChatKeys(keys)
}

// Get chat key
export const getChatKey = (chatId) => {
  const keys = getChatKeys()
  return keys[chatId] || null
}

// Load keys from server
export const loadKeys = async (userId, token) => {
  try {
    const result = await getUserKeys(userId, token)
    if (result.success && result.keys) {
      const chatKeys = {}
      const keyPair = getBoxKeys()
      
      for (const [chatId, encryptedKeyBase64] of Object.entries(result.keys)) {
        try {
          const encryptedData = naclUtil.decodeBase64(encryptedKeyBase64)
          const nonce = encryptedData.slice(0, nacl.secretbox.nonceLength)
          const encrypted = encryptedData.slice(nacl.secretbox.nonceLength)
          
          const decryptedKey = nacl.secretbox.open(encrypted, nonce, keyPair.secretKey)
          if (decryptedKey) {
            chatKeys[chatId] = naclUtil.encodeBase64(decryptedKey)
          }
        } catch (e) {
          console.error(`Error decrypting key for chat ${chatId}:`, e)
        }
      }
      
      setChatKeys(chatKeys)
      return chatKeys
    }
    return null
  } catch (error) {
    console.error('Failed to load keys:', error)
    return null
  }
}

// Encrypt file for upload
export const encryptFile = async (file, chatKey) => {
  let fileBytes
  
  if (file instanceof File || file instanceof Blob) {
    const buffer = await file.arrayBuffer()
    fileBytes = new Uint8Array(buffer)
  } else {
    throw new Error('Unsupported file format')
  }
  
  const CHUNK_SIZE = 1024
  const paddedSize = Math.ceil(fileBytes.length / CHUNK_SIZE) * CHUNK_SIZE
  const padded = new Uint8Array(paddedSize)
  padded.set(fileBytes)
  
  if (paddedSize > fileBytes.length) {
    const randomPadding = nacl.randomBytes(paddedSize - fileBytes.length)
    padded.set(randomPadding, fileBytes.length)
  }
  
  const fileNonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const encryptedFile = nacl.secretbox(padded, fileNonce, chatKey)
  
  const metadata = {
    originalName: file.name || 'unnamed_file',
    mimeType: file.type || 'application/octet-stream',
    originalSize: fileBytes.length,
    paddedSize: paddedSize,
    fileNonce: naclUtil.encodeBase64(fileNonce)
  }
  
  const metadataNonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const metadataBytes = naclUtil.decodeUTF8(JSON.stringify(metadata))
  const encryptedMetadata = nacl.secretbox(metadataBytes, metadataNonce, chatKey)
  
  const metadataTotalLength = metadataNonce.length + encryptedMetadata.length
  const combined = new Uint8Array(4 + metadataTotalLength + encryptedFile.length)
  
  combined[0] = (metadataTotalLength >> 24) & 0xFF
  combined[1] = (metadataTotalLength >> 16) & 0xFF
  combined[2] = (metadataTotalLength >> 8) & 0xFF
  combined[3] = metadataTotalLength & 0xFF
  
  let offset = 4
  combined.set(metadataNonce, offset)
  offset += metadataNonce.length
  combined.set(encryptedMetadata, offset)
  offset += encryptedMetadata.length
  combined.set(encryptedFile, offset)
  
  const blobHash = await sha256FromBytes(combined)
  
  return {
    blob: combined,
    blobHash,
    fileNonce: naclUtil.encodeBase64(fileNonce)
  }
}

// Decrypt blob
export const decryptBlob = async (encryptedData, chatKey) => {
  const metadataLength = (encryptedData[0] << 24) | 
                         (encryptedData[1] << 16) | 
                         (encryptedData[2] << 8) | 
                         encryptedData[3]
  
  let offset = 4
  const metadataNonce = encryptedData.slice(offset, offset + nacl.secretbox.nonceLength)
  offset += nacl.secretbox.nonceLength
  
  const encryptedMetadata = encryptedData.slice(offset, offset + metadataLength - nacl.secretbox.nonceLength)
  offset += metadataLength - nacl.secretbox.nonceLength
  
  const encryptedFile = encryptedData.slice(offset)
  
  const metadataBytes = nacl.secretbox.open(encryptedMetadata, metadataNonce, chatKey)
  if (!metadataBytes) throw new Error('Metadata decryption failed')
  
  const metadata = JSON.parse(naclUtil.encodeUTF8(metadataBytes))
  
  const fileNonce = naclUtil.decodeBase64(metadata.fileNonce)
  const decryptedPadded = nacl.secretbox.open(encryptedFile, fileNonce, chatKey)
  if (!decryptedPadded) throw new Error('File decryption failed')
  
  const decryptedFile = decryptedPadded.slice(0, metadata.originalSize)
  
  return {
    blob: new Blob([decryptedFile], { type: metadata.mimeType }),
    metadata
  }
}

// Format file size
export const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i]
}