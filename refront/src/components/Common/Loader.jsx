import React from 'react'
import './Loader.css'

const Loader = ({ size = 40, color = '#00eeff' }) => {
  return (
    <div 
      className="loader"
      style={{ 
        width: size, 
        height: size,
        borderColor: `${color} transparent transparent transparent`
      }}
    />
  )
}

export default Loader