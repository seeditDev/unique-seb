import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaArrowRight, FaSearch, FaSearchMinus, FaSearchPlus, FaExpand, FaCompress } from 'react-icons/fa';
import '../styles/PDFViewer.css';
import cacheManager from '../utils/cacheManager';

const PDFViewer = ({ albumUrl, onClose, title }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadedImages, setLoadedImages] = useState({});
  const [currentPart, setCurrentPart] = useState(1);
  const [allPartsLoaded, setAllPartsLoaded] = useState(false);
  const viewerContainerRef = useRef(null);
  const touchStartX = useRef(null);
  const audioRef = useRef(new Audio('/page-flip.mp3'));
  const [totalPages, setTotalPages] = useState(0);
  const [partsLoaded, setPartsLoaded] = useState(new Set());
  const [logoImage, setLogoImage] = useState(null);
  
  const IMAGES_PER_PART = 30;
  const PRELOAD_THRESHOLD = 20;

  // Modified cache key to include course info
  const getCacheKey = (url, part) => {
    const courseName = url.split('/Notes/')[1].split('/')[0]; // Extract C, Java, etc.
    return `${courseName}_Part_${part}`;
  };

  // Function to load a specific part
  const loadPart = async (part) => {
    try {
      if (partsLoaded.has(part)) {
        return false;
      }

      setLoadingMore(true);
      const baseUrl = albumUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/tree/', '/');
      
      const partUrl = `${baseUrl}/Part_${part}`;
      const cacheKey = getCacheKey(albumUrl, part);
      
      // Try to get from cache
      const cachedData = await cacheManager.getPDF(cacheKey);
      
      // If we have cached data, use it
      if (cachedData) {
        console.log(`Loading part ${part} from cache`);
        setImages(prev => {
          const newImages = [...prev];
          cachedData.forEach(img => {
            const pageNum = parseInt(img.match(/Page_(\d+)/)[1]);
            newImages[pageNum - 1] = img;
          });
          return newImages;
        });
        setPartsLoaded(prev => new Set([...prev, part]));
        setLoadingMore(false);
        return false;
      }

      const startPage = (part - 1) * 30 + 1;
      const endPage = part * 30;
      const firstPageUrl = `${partUrl}/Page_${startPage}.png`;

      // Check if first page exists
      try {
        const response = await fetch(firstPageUrl, { method: 'HEAD' });
        if (!response.ok) {
          // Try one more time after a delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          const retryResponse = await fetch(firstPageUrl, { method: 'HEAD' });
          if (!retryResponse.ok) {
            setLoadingMore(false);
            return true; // Part doesn't exist
          }
        }
      } catch {
        setLoadingMore(false);
        return true;
      }

      // Binary search to find the last existing page
      let left = startPage;
      let right = endPage;
      let lastExistingPage = startPage;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const checkUrl = `${partUrl}/Page_${mid}.png`;
        try {
          const response = await fetch(checkUrl, { method: 'HEAD' });
          if (response.ok) {
            lastExistingPage = mid;
            left = mid + 1;
          } else {
            right = mid - 1;
          }
        } catch {
          right = mid - 1;
        }
      }

      // Create array of image URLs up to the last existing page
      let newImages = [];
      for (let pageNum = startPage; pageNum <= lastExistingPage; pageNum++) {
        const imageUrl = `${partUrl}/Page_${pageNum}.png`;
        newImages.push({ url: imageUrl, pageNum });
        
        // Update UI every 10 images
        if (newImages.length % 10 === 0) {
          setImages(prev => {
            const updatedImages = [...prev];
            newImages.forEach(img => {
              updatedImages[img.pageNum - 1] = img.url;
            });
            return updatedImages;
          });
        }
      }

      if (newImages.length > 0) {
        // Save to cache using cacheManager
        await cacheManager.cachePDF(cacheKey, newImages.map(img => img.url));

        // Final update of images array
        setImages(prev => {
          const updatedImages = [...prev];
          newImages.forEach(img => {
            updatedImages[img.pageNum - 1] = img.url;
          });
          return updatedImages;
        });

        setPartsLoaded(prev => new Set([...prev, part]));
      }

      setLoadingMore(false);
      return newImages.length < 30;

    } catch (error) {
      console.error('Error loading part:', error);
      setLoadingMore(false);
      return true;
    }
  };

  // Initial load
  useEffect(() => {
    const initializeViewer = async () => {
      try {
        setLoading(true);
        setImages([]);
        setCurrentPage(0);
        setPartsLoaded(new Set());
        setAllPartsLoaded(false);
        
        // Only load the first part initially
        const noMoreParts = await loadPart(1);
        if (noMoreParts) {
          setAllPartsLoaded(true);
        }
        
      } catch (error) {
        setError('Failed to load images');
        console.error('Error initializing viewer:', error);
      } finally {
        setLoading(false);
      }
    };

    if (albumUrl) {
      initializeViewer();
    }
  }, [albumUrl]);

  // Load next part when crossing specific page thresholds
  useEffect(() => {
    const loadNextPartIfNeeded = async () => {
      if (loadingMore || allPartsLoaded) return;

      // Calculate which part we need based on current page
      let nextPartToLoad = null;
      
      // If we're at page 20 or higher and Part 2 isn't loaded
      if (currentPage >= 20 && !partsLoaded.has(2)) {
        nextPartToLoad = 2;
      }
      // If we're at page 50 or higher and Part 3 isn't loaded
      else if (currentPage >= 50 && !partsLoaded.has(3)) {
        nextPartToLoad = 3;
      }
      // If we're at page 80 or higher and Part 4 isn't loaded
      else if (currentPage >= 80 && !partsLoaded.has(4)) {
        nextPartToLoad = 4;
      }

      if (nextPartToLoad) {
        const isLastPart = await loadPart(nextPartToLoad);
        if (isLastPart) {
          setAllPartsLoaded(true);
        }
      }
    };

    loadNextPartIfNeeded();
  }, [currentPage, loadingMore, allPartsLoaded]);

  // Function to play page flip sound
  const playPageFlipSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.log('Audio playback error:', err));
    }
  };

  const nextPage = () => {
    if (currentPage < images.length - 1) {
      playPageFlipSound();
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      playPageFlipSound();
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 25, 50));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
    } else {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowRight') {
        nextPage();
      } else if (e.key === 'ArrowLeft') {
        prevPage();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPage, images.length, isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
    };

    const handleTouchMove = (e) => {
      if (!touchStartX.current) return;
      
      const touch = e.touches[0];
      const diffX = touchStartX.current - touch.clientX;

      if (Math.abs(diffX) > 50) {
        if (diffX > 0 && currentPage < images.length - 1) {
          playPageFlipSound();
          nextPage();
        } else if (diffX < 0 && currentPage > 0) {
          playPageFlipSound();
          prevPage();
        }
        touchStartX.current = null;
      }
    };

    const element = viewerContainerRef.current;
    if (element) {
      element.addEventListener('touchstart', handleTouchStart);
      element.addEventListener('touchmove', handleTouchMove);
    }

    return () => {
      if (element) {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [currentPage, images.length]);

  const handleImageLoad = (index) => {
    setLoadedImages(prev => ({
      ...prev,
      [index]: true
    }));
  };

  const handleImageError = (index) => {
    console.error(`Failed to load image at index ${index}`);
    setLoadedImages(prev => ({
      ...prev,
      [index]: 'error'
    }));
  };

  // Load logo once when component mounts
  useEffect(() => {
    const img = new Image();
    img.src = '/SEED_Logo.png';
    img.onload = () => setLogoImage(img.src);
  }, []);

  // Modified renderImages function to handle continuous page numbers
  const renderImages = () => {
    return images.map((imageUrl, index) => {
      if (!imageUrl) return null;

      return (
        <div key={index} className="slide">
          {!loadedImages[index] && (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Loading...</p>
            </div>
          )}
          {loadedImages[index] === 'error' ? (
            <div className="error">Failed to load image</div>
          ) : (
            <div className="image-container">
              {logoImage && (
                <div className="watermark-overlay">
                  <img 
                    src={logoImage}
                    alt="SEED IT Logo" 
                    className="watermark-logo"
                  />
                </div>
              )}
              <img 
                src={imageUrl}
                alt={`Page ${index + 1}`}
                style={{ 
                  transform: `scale(${zoomLevel / 100})`,
                  display: loadedImages[index] ? 'block' : 'none'
                }}
                draggable="false"
                onLoad={() => handleImageLoad(index)}
                onError={() => handleImageError(index)}
                onTouchStart={(e) => e.preventDefault()}
              />
            </div>
          )}
        </div>
      );
    }).filter(Boolean);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>Loading images...</p>
      </div>
    );
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!images.length) {
    return <div className="error">No images found in the album</div>;
  }

  return (
    <div className={`viewer-container ${isFullscreen ? 'fullscreen' : ''}`} ref={viewerContainerRef}>
      <div className="image-slider" style={{ transform: `translateX(-${currentPage * 100}%)` }}>
        {renderImages()}
        {loadingMore && (
          <div className="loading-more">
            <div className="loading-spinner"></div>
            <p>Loading more pages...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="viewer-controls">
        <div className="control-group">
          <button onClick={prevPage} disabled={currentPage === 0}>
            <FaArrowLeft /> Previous
          </button>
          <span className="page-info">
            {currentPage + 1} / {images.length}
          </span>
          <button onClick={nextPage} disabled={currentPage >= images.length - 1}>
            Next <FaArrowRight />
          </button>
        </div>

        <div className="zoom-controls">
          <button onClick={handleZoomOut} disabled={zoomLevel <= 50}>
            <FaSearchMinus />
          </button>
          <span className="zoom-level">{zoomLevel}%</span>
          <button onClick={handleZoomIn} disabled={zoomLevel >= 200}>
            <FaSearchPlus />
          </button>
          <button onClick={handleResetZoom} disabled={zoomLevel === 100}>
            <FaSearch />
          </button>
        </div>

        <button onClick={toggleFullscreen}>
          {isFullscreen ? <FaCompress /> : <FaExpand />}
        </button>
      </div>
    </div>
  );
};

export default PDFViewer; 