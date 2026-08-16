import React, { useState } from 'react';

export default function SafeImage({
  src,
  alt = '',
  fallback = '/favicon.svg',
  ...props
}) {
  const [currentSrc, setCurrentSrc] = useState(src || fallback);

  return (
    <img
      {...props}
      src={currentSrc || fallback}
      alt={alt}
      onError={() => {
        if (currentSrc !== fallback) {
          setCurrentSrc(fallback);
        }
      }}
    />
  );
}