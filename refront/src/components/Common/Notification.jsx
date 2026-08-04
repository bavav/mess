import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'

let notificationContainer = null

export const showNotification = (message, type = 'info', duration = 3000) => {
  const container = getContainer()
  
  const id = Date.now() + Math.random().toString(36).substring(2, 5)
  
  const element = document.createElement('div')
  element.className = `notification notification-${type}`
  element.textContent = message
  
  container.appendChild(element)
  
  setTimeout(() => {
    element.classList.add('notification-hide')
    setTimeout(() => {
      if (element.parentNode) element.remove()
    }, 300)
  }, duration)
}

const getContainer = () => {
  if (!notificationContainer) {
    const container = document.createElement('div')
    container.id = 'notification-container'
    document.body.appendChild(container)
    notificationContainer = container
  }
  return notificationContainer
}

export const Notification = () => {
  const [container, setContainer] = useState(null)
  
  useEffect(() => {
    const el = document.getElementById('notification-container')
    if (el) setContainer(el)
  }, [])
  
  // This component just ensures the container exists
  return null
}