// LoadingIndicator.js
import React from 'react';
import loadingImage from '../images/logo.png';

const LoadingComponent = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <img src={loadingImage} alt="Loading Cutinapp" style={{ borderRadius: '80%', width: '20%', height: 'auto' }} />
    </div>
  );
}

export default LoadingComponent;
